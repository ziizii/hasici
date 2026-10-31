# Security audit

Date: 2026-10-31 · Scope: `firestore.rules`, `src/lib/access.svelte.ts`,
`src/lib/firebase.ts`, `firebase.json`, `.github/workflows/*`.

## Can someone skip the unit password and query Firestore directly?

**No, not without a valid key.** The Firebase config (API key, project ID) is
public in every web app, so assume an attacker has it and talks to Firestore
with the SDK or REST and no UI. Every data path in `firestore.rules` needs
`hasSession()`, which means `sessions/{uid}` exists. That doc can only be
created when its `key` equals `config/access.linkKey` or `.passwordHash`.
`config/access` can't be read without a session, and once the unit is set up
it can't be created or overwritten.

I tested this with a probe script against the emulators. As an anonymous
outsider, all of these were **denied**:

| Attempt | Result |
| --- | --- |
| `get config/access`, `config/places` | denied |
| list `members`, `absences`, `events`, `series`, `config`, `sessions` | denied |
| `collectionGroup('members')`, query `sessions where key != ''` | denied |
| session doc with no `key`, `key: null`, or for another uid | denied |
| one batch: overwrite `config/access` + create own session | denied |
| one batch: delete `config/public` + recreate `config/access` | denied |
| create/delete a member, write to an unknown collection | denied |

So the rules work as designed. The real risks are **getting** a key, and how
long a key keeps working once someone has it.

## Findings

| # | Severity | Finding |
| --- | --- | --- |
| 1 | **High** | The password can be guessed online with no rate limit |
| 2 | **Medium** | Access never expires and can't be revoked from the app |
| 3 | **Medium** | Whoever opens a new deploy first owns the unit |
| 4 | **Medium** | Any session can delete everything, and there are no backups |
| 5 | Low | Every member can read the password hash, which works as the password |
| 6 | Low | Loose field checks let a member bloat everyone's download |
| 7 | Low | No App Check and no budget alert |
| 8 | Info | Hosting security headers, device cache, CI service account |

### 1. Online password guessing (High)

A session-create attempt **is** a password guess, and nothing limits how many
an attacker can make. A failed create leaves nothing behind, so one anonymous
user can keep trying forever, and anonymous users are free to make. In the
probe, one user made 8 guesses in about 190 ms with no lockout. In production,
a few parallel clients manage hundreds of guesses a second.

It's worse because:
- the minimum length is **4 characters** (`PasswordScreen.svelte:19`,
  `jednotka/+page.svelte:102`). A 4-digit PIN falls in seconds, and a list of
  common Czech words (`hasici`, the village name, `sdh2026`…) in minutes;
- the hash is fast SHA-256 with the same `"hasici:"` prefix in every unit, so
  guessing is cheap and one wordlist works against all units.

The 128-bit+ random link key can't be guessed. **The password is the weak
spot.**

Fixes, cheapest first:
1. Require a stronger password: at least 10 characters, and reject the unit
   name and words like `hasici`/`heslo`. Better: generate a 4-word Czech
   passphrase and show it, so nobody picks `1234`.
2. Rate-limit inside the rules: add an `attempts/{uid}` doc with `last:
   request.time`. Only allow a session create in a batch that bumps it, and
   only when `last < request.time - duration.value(5, 's')`. An attacker then
   has to rotate anonymous users, which Firebase Auth throttles per IP.
3. Turn on **App Check** (reCAPTCHA Enterprise or v3) with enforcement for
   Firestore and Auth, so scripts without a real browser are rejected.
4. Most robust: move unlocking to a Cloud Function (callable) that rate-limits
   per IP and per unit, checks a slow hash (scrypt/argon2) with a random salt,
   and writes the session with admin rights. Session create in the rules then
   becomes `if false`.

### 2. Sessions are permanent (Medium)

`sessions/{uid}` can't be updated or deleted by clients, and `hasSession()`
only checks that it exists. Changing the password or rotating the link only
stops **new** devices (the probe confirms an old session still reads members
afterwards). A member who left, a lost phone, or anyone who once tapped a
forwarded link keeps reading and writing for good. Today the only way out is
deleting docs in the Firebase console, one uid at a time, with no way to tell
which uid is whose.

Fix: add `epoch` (an int) to `config/access` and store it in each session.
`hasSession()` becomes
`get(session).data.epoch == get(accessPath()).data.epoch`, which costs one
extra document read per request. Add a button on Jednotka, "Odhlásit všechna
ostatní zařízení", that bumps the epoch and re-creates your own session in the
same batch. Optionally, rotating the link or changing the password bumps it
too.

### 3. Takeover before the first setup (Medium)

Until someone sets the password, **any** visitor who finds the URL becomes the
owner (the probe confirms it). `*.web.app` names are easy to guess
(`sdh-lhota.web.app`), and preview-channel URLs are posted on PRs. The README
says to set the password right away, which shrinks the window but doesn't
close it.

Fix: let `npm run setup` write `config/public` and `config/access` with the
Admin SDK (the CLI is already logged in), and set `allow create: if false` on
both. Or require a one-time setup code in the rules that only the deployer
knows.

### 4. Every member is a full admin, and nothing is backed up (Medium)

This is by design ("everyone is an admin"), but combined with #1–#3 it means
one leaked link or guessed password can delete every member, absence and
event, or rename the unit. The probe deleted a member with an ordinary
session. Firestore keeps no history.

Fixes:
- Turn on **Point-in-time recovery** (7 days, a console switch, small cost) or
  a scheduled daily export to Cloud Storage.
- Optional: allow `delete` on `members` only when `archived == true` (the UI
  already works that way), and don't allow deleting `config/places`.

### 5. The password hash is readable and works as the password (Low)

Every session can read `config/access.passwordHash`. The rules accept that
hash directly as a session `key`, so it's as good as the password, and it's
fast to crack offline. People reuse passwords, so the plain text has value
outside this app too.

Fix (rules-only): move the hash to `config/secret` with `allow read: if
false`. `get()` in rules ignores read rules, so the session check still works.
Keep `linkKey` where it is, since the share UI needs it. Add a random
per-unit salt in `config/public` so units don't share one wordlist.

### 6. Loose field validation (Low)

A session holder can write things the app never writes (all confirmed):
- `config/places.list`: up to 50 entries of any size (50 × 19 kB was
  accepted);
- `absences.except`: any values (objects, long strings); `memberId` doesn't
  have to be a real member;
- `members.createdAt` and the other `createdAt`/`updatedAt` fields: any type
  and size (a 500 kB string was accepted);
- `members.color`: any 4–9 character string (`red;top:0`). Svelte escapes it,
  so it's not XSS, but it ends up in `style` attributes.

The app subscribes to whole collections, so these bytes are pushed to every
phone, which hurts weak connections and costs reads. Fix: check `createdAt is
timestamp`, `color.matches('^#[0-9A-Fa-f]{6}$')` or the palette, list item
types/lengths where cheap, and that `memberId` exists.

### 7. No App Check, no budget alert (Low)

Without App Check, anyone can script Firestore and Auth (see #1). Denied
requests and anonymous sign-ups can still cost money or quota. Set a billing
budget alert, even on the Spark plan if you upgrade later.

### 8. Other notes (Info)

- **Headers**: `firebase.json` sets no `Content-Security-Policy`,
  `X-Frame-Options`/`frame-ancestors`, or `Referrer-Policy`. Add
  `frame-ancestors 'none'` (stops clickjacking on the Jednotka buttons) and
  `Referrer-Policy: no-referrer`. A strict CSP needs testing because Firebase
  and Svelte inline styles.
- **Share link**: removed from the address bar quickly (`history.replaceState`),
  but it stays in the chat app and in the browser history of the first visit.
  Treat it like the password. With #2 fixed, rotating it actually means
  something.
- **Device cache**: `hasici.cache.v2` keeps a full copy of the unit's data in
  `localStorage`, and there is no "log out this device". It's fine for
  personal phones, but on a shared PC the data stays readable offline.
- **CI**: the `FIREBASE_SERVICE_ACCOUNT` secret should have only *Firebase
  Hosting Admin* + *Firebase Rules Admin*, not Owner/Editor. Previews only run
  for same-repo branches, which is correct. They use live data but a separate
  origin, so they don't share sessions.
- **Data sensitivity**: names plus "away from X to Y" dates tell an outsider
  when someone's home is empty. That's personal data (GDPR) and a reason to
  take #1 and #2 seriously.

## Suggested order

1. Minimum password strength / generated passphrase (#1). Small UI change.
2. Turn on PITR or daily exports (#4). A console switch.
3. Move the hash to an unreadable doc and add a salt (#5), plus the per-uid
   rate limit in the rules (#1.2). Rules only, testable with `make test-rules`.
4. Session epoch + "log out all other devices" (#2).
5. Create the config at setup time instead of first visit (#3).
6. App Check (#1.3, #7), headers and tighter validation (#6, #8).

The probe script used for the tests above can be added to
`scripts/test-rules.mjs` as negative cases, so later rule changes don't reopen
these paths.
