# Handover

State of the project and the decisions behind it, so work can continue in a
new session (e.g. Claude Code) without the original conversation.

Design mockups (Czech UI, phone + desktop) live on a Claude Design canvas
called "Fire Unit Availability". The **"Plán v2"** row is the approved
direction; older rows are superseded.

## Product decisions (agreed with the owner)

- **Audience:** about 10 volunteer firefighters, many not technical, some
  with poor eyesight and large system fonts. It must stay usable with big
  text: all sizes are in `rem`, and bars wrap instead of squeezing.
- **Access, no accounts:**
  - The first visitor ever sets the **unit password**.
  - Members join with the **share link** `/?k=<linkKey>` (no password) or
    by typing the password.
  - A device that got in stays in (anonymous Firebase Auth + a
    `sessions/{uid}` doc).
  - On first use a device **picks a member from the list**. Nobody types
    a name to log in; it is stored in `localStorage` under
    `hasici.memberId`.
- **Everyone is an admin.** Any member can add, rename, recolour or
  archive members, change the password and rotate the link (page
  `/jednotka`). There is no separate admin login.
- **Absences are whole days only**, as an inclusive date range with an
  optional note. Part-day absences were explicitly dropped.
- **"Nejsem k dispozici" switch** (page `/ja` for yourself, and in the member
  editor on `/jednotka` for anyone): an absence from today with
  `to = OPEN_END` (`'9999-12-31'`), shown as "od …". Switching it off ends it
  yesterday, or deletes it if it started today (`data.setUnavailable`).
- **Events keep a time** (`Sraz`, start time only) plus place and an
  optional note, "so we know when to go where".
- **"Nemůžu přijít" on an event is not a separate concept.** It creates a
  normal one-day absence for that date. "Přece jen přijdu" frees that day
  again: covering absences are deleted, shortened or split
  (`data.markAvailable`).
- **Member colours:** a fixed 20-colour palette (`lib/colors.ts`), assigned
  on creation as the least-used colour among active members.
  - Archiving a member frees their colour.
  - With more than 20 members, colours are shared.
  - Restoring a member picks a new colour if theirs was taken.
- **Archiving:** archived members disappear from the plan and the pickers,
  and their absences are kept. Permanent delete exists only from the archive
  and also deletes their absences.
- **Plan view (`/`):**
  - A vertical timeline, one row per day, with infinite scroll forward and a
    "Zobrazit dřívější dny" button for the past.
  - Jump buttons: Dnes, Příští týden, Za 2 týdny, next 4 months.
  - Each day shows a segmented bar. Members who can come are coloured with
    their initials, absent members are grey, and the count ("7/10") is coloured
    by ratio.
  - Czech public holidays are marked.
  - Tapping a day opens the day panel: who can or can't come and why, that
    day's events, a "Tento den nemůžu" toggle, and the new-event form. On
    phones this is a bottom sheet; on desktop (≥1024px) it is the right
    column.
- **Pull-only:** no notifications or e-mails, by design.

## Code map

```
src/
  app.html, app.css          Theme tokens (Tailwind 4 @theme), large-text handling
  lib/
    firebase.ts              App init, offline cache, emulator switch, ensureUser()
    access.svelte.ts         Gate: session/link/password/setup, member choice, link rotation
    data.svelte.ts           Realtime store (members, absences, events) and all writes
    dates.ts                 'YYYY-MM-DD' helpers, Czech names, ISO weeks, CZ holidays
    colors.ts                Palette, nextColor(), initials()
    toast.svelte.ts          Snackbar with optional undo action
    demo.ts                  Dev-only sample data for /?demo
    components/
      AvailabilityBar.svelte Segmented availability bar (auto-wrapping grid)
      DayPanel.svelte        Day detail + new event form
      EventForm.svelte       Create/edit event
      MemberPicker.svelte    "Kdo jste?" screen (adds the first member on an empty unit)
      PasswordScreen.svelte  First-run setup / unlock
      Brand.svelte, Icon.svelte
  routes/
    +layout.svelte           Gate + navigation (bottom bar on phone, header on desktop) + toasts
    +page.svelte             Plán (timeline)
    akce/[id]/+page.svelte   Event detail, "Nemůžu přijít", edit/delete
    ja/+page.svelte          My absences: add (quick chips), list, delete with undo
    jednotka/+page.svelte    Share link, password, members, archive
firestore.rules              Security rules (see below)
firebase.json, .firebaserc   Hosting (SPA fallback 200.html), rules, emulators; project hasici-bo
```

Imports use the SvelteKit 3 subpath alias `#lib/...`. TypeScript modules need a
`.js` suffix (`#lib/dates.js`, `#lib/data.svelte.js`). Svelte components
don't (`#lib/components/Icon.svelte`).

## Data model (Firestore)

| Path | Fields | Notes |
| --- | --- | --- |
| `config/public` | `initialized: true` | Readable by anyone; tells the app if first-run setup happened |
| `config/access` | `linkKey`, `passwordHash`, `updatedAt` | Readable only with a session |
| `sessions/{uid}` | `key`, `createdAt` | Created when `key` equals `linkKey` or `passwordHash` |
| `members/{id}` | `name`, `color`, `archived`, `createdAt` | |
| `absences/{id}` | `memberId`, `from`, `to` (`YYYY-MM-DD`, inclusive), `note`, `createdAt` | Whole days |
| `events/{id}` | `title`, `date`, `time` (`HH:MM` or ''), `place`, `note`, `createdAt` | |

- **Password hash:** `passwordHash` is SHA-256 of `"hasici:" + password`,
  computed in the browser. It is effectively a shared secret, like the link key.
- **Session lifetime:** rotating the link or changing the password does not
  revoke existing sessions. To kick devices out, delete docs in `sessions`
  from the console.
- **Data loading:** the whole unit is small, so the app subscribes to whole
  collections. If it grows, add date-range queries for absences and events.

## Status

Done: everything described above. `npm run check` and `npm run build` pass, and
UI was checked in `?demo` mode at phone and desktop sizes, at normal and
150% text size.

Not yet done / next steps:

1. ~~Fill `.env`~~ (done).
2. ~~Create Firestore~~ (done); check Anonymous auth is enabled in the console.
3. Deploys run from GitHub Actions: every PR gets a preview channel
   (`.github/workflows/preview.yml`), merges to `main` deploy rules + hosting
   (`deploy.yml`). One-time setup: `make setup-ci`. Previews share the real
   Firestore data. Manual deploy: `make deploy`.
4. **Test the security rules against real Firebase or the emulator.** The
   emulator could not be downloaded in the original build environment, so
   the rules are untested. Focus on:
   - first-run batch (`config/access` + `config/public` + session);
   - unlock with link and with password;
   - members/absences/events writes.
5. Ideas raised but not built:
   - QR code for the share link;
   - "Kdo je kdo" member highlight on desktop (legend is static now);
   - code-splitting Firebase (main chunk is ~620 kB).
