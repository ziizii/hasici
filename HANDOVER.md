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
- **Repeating absences** ("every Tuesday", "weekends", "1st Friday") are normal
  absences with a repeat rule, picked with the same `RepeatPicker` as events
  (plus "o víkendech"); without an end date they last until deleted. Use
  `covers(a, day)` instead of comparing `from`/`to` directly.
- **Exceptions:** freeing one day of a repeating or open-ended absence (member
  segment tap, "Přece jen přijdu", chips on `/ja`) adds it to `except` instead of
  splitting; marking the day away again removes it. Plain dated absences
  are still split.
- **Repeating events:** the new-event form offers radios: Neopakovat, every
  week on that weekday, the nth weekday of the month (plus "poslední" when it
  is the last one), the same day each month, and Vlastní (Apple-Reminders-like
  editor: every n days / weeks on weekdays / months on days or the nth
  weekday / years in months), with an optional end date and a preview of the
  next dates. Months without the chosen day (31st, 5th Thursday) are skipped.
- **One date of a repeat** can be moved or changed on its own (event page:
  "Změnit jen tento termín", or Upravit with "Co změnit: Jen tento termín",
  the default). It is stored as its own event and shows "přesunutý z …".
- **Editing the repeat:** with "Tento i všechny další" (or on a one-off
  event) the edit form shows the same `RepeatPicker`, preset to the current
  rule (`data.updateRepeat`). A changed rule or end ends the old series the day
  before and starts a new one from this date; later dates edited on their own
  are dropped. "Neopakovat" keeps this date as a one-off and drops later ones.
  A one-off can be turned into a repeat. The page follows the event's new id.
- **Events keep a time** (`Sraz`, start time only) plus place and an
  optional note, "so we know when to go where".
- **Place** is free text. While typing, it suggests saved places (the ones
  from `/jednotka`, then ones used before), ignoring case and diacritics. It is
  our own list, not `<datalist>`, which is missing or awkward on some phones.
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
  - Filter above the jump buttons: Vše / Víkendy / Akce, one choice at a
    time (two toggles would leave "both" ambiguous). Víkendy includes public
    holidays. Jumps go to the next shown day. With Akce, scrolling loads a
    year ahead, then a "Hledat akce dál" button takes over.
  - Each day shows a segmented bar. Members who can come are coloured with
    their initials, absent members are grey, and the count ("7/10") is coloured
    by ratio.
    The segments are not tappable here (accidental taps while scrolling);
    tapping a member's segment flips their day only in the day panel and on
    the event page.
  - Czech public holidays are marked.
  - Tapping a day opens the day panel: who can or can't come and why, that
    day's events, a "Tento den nemůžu" toggle, and the new-event form. On
    phones this is a bottom sheet; on desktop (≥1024px) it is the right
    column.
- **Pull-only:** no notifications or e-mails, by design.
- **Auto-update:** the build's version is the git commit (`vite.config.ts`).
  SvelteKit polls `/_app/version.json` every minute and on tab focus; the
  layout reloads the page when it changes (after the user leaves a text
  field). Hosting serves everything `no-cache` except `/_app/immutable/**`.
- **Service worker** (`src/service-worker.ts`): caches the app shell per
  version (`app-<git hash>`) and serves it cache-first, so the app opens
  instantly and offline. A deploy installs a new worker that takes over at once;
  the layout reloads on `controllerchange`. Firebase requests are not touched.
- **Home screen:** `static/manifest.webmanifest` + icons (`icon-192/512`,
  `icon-maskable-512`, `apple-touch-icon`), rendered from the flame logo.
  On iOS a home-screen app has its own storage, so it asks for the password
  once (the share link opens in Safari, not in the installed app).

## Code map

```
src/
  app.html, app.css          Theme tokens (Tailwind 4 @theme), large-text handling
  lib/
    firebase.ts              App init, offline cache, emulator switch, ensureUser()
    access.svelte.ts         Gate: session/link/password/setup, member choice, link rotation
    data.svelte.ts           Realtime store (members, absences, events) and all writes
    dates.ts                 'YYYY-MM-DD' helpers, Czech names, ISO weeks, CZ holidays
    repeat.ts                Event repeat rules (daily … yearly, nth weekday), Czech wording
    colors.ts                Palette, nextColor(), initials()
    toast.svelte.ts          Snackbar with optional undo action
    demo.ts                  Dev-only sample data for /?demo
    components/
      AvailabilityBar.svelte Segmented availability bar (auto-wrapping grid)
      DayPanel.svelte        Day detail + new event form
      EventForm.svelte       Create/edit event
      RepeatPicker.svelte    "Opakování" radios + custom rule editor (like Apple's "Custom")
      PlaceInput.svelte      Free-text place with a suggestion list of saved places (data.places)
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
firebase.json               Hosting (SPA fallback 200.html), rules, emulators
scripts/setup.mjs           `npm run setup` / `npm run deploy`: guided deploy to any Firebase project, writes .env
scripts/test-rules.mjs      `make test-rules`: firestore.rules checks on throwaway emulators
scripts/setup-ci.sh         `make setup-ci`: GitHub Actions deploy secret + variables
```

Imports use the SvelteKit 3 subpath alias `#lib/...`. TypeScript modules need a
`.js` suffix (`#lib/dates.js`, `#lib/data.svelte.js`). Svelte components
don't (`#lib/components/Icon.svelte`).

## Data model (Firestore)

| Path | Fields | Notes |
| --- | --- | --- |
| `config/public` | `initialized: true`, `name` | Readable by anyone; tells the app if first-run setup happened. `name` is the unit name shown in the brand (edited on `/jednotka`) |
| `config/access` | `linkKey`, `passwordHash`, `updatedAt` | Readable only with a session |
| `config/places` | `list` (string[], ≤ 50) | Default event places, edited on `/jednotka`; offered first in the event form |
| `sessions/{uid}` | `key`, `createdAt` | Created when `key` equals `linkKey` or `passwordHash` |
| `members/{id}` | `name`, `color`, `archived`, `createdAt` | |
| `absences/{id}` | `memberId`, `from`, `to` (`YYYY-MM-DD`, inclusive), `note`, `weekdays?` or `repeat?`, `except?`, `createdAt` | Whole days. `weekdays` (0 = Mon … 6 = Sun) makes it repeat every week within the range; any other rule is stored as `repeat` (same shape as on `series`); both are read as `Absence.repeat`. `to = 9999-12-31` = no end; `except` = skipped days |
| `events/{id}` | `title`, `date`, `time` (`HH:MM` or ''), `place`, `note`, `series?`, `createdAt` | One-off events. A repeat edited on its own is stored here with id `<seriesId>_<day>` and `series` set |
| `series/{id}` | `title`, `time`, `place`, `note`, `from`, `to` (`9999-12-31` = until cancelled), `except`, `repeat?`, `createdAt` | Repeating event; occurrences are computed in `data.events`/`eventsOn`. Without `repeat`: every week on `from`'s weekday. `repeat` (`lib/repeat.ts`): `{freq: day/week/month/year, every, weekdays?, days?, nth?, kind?, months?}`. `except` = cancelled or individually edited days. "This and later" edits split the series; a plain weekly one moves with a new date, other rules keep their days and only the edited day moves |

- **Password hash:** `passwordHash` is SHA-256 of `"hasici:" + password`,
  computed in the browser. It is effectively a shared secret, like the link key.
- **Session lifetime:** rotating the link or changing the password does not
  revoke existing sessions. To kick devices out, delete docs in `sessions`
  from the console.
- **Data loading:** the whole unit is small, so the app subscribes to whole
  collections. If it grows, add date-range queries for absences and events.
- **Fast start:** Firebase Auth re-validates the user over the network on every
  start, and Firestore can't read its cache before that. So a known device
  (`hasici.sessionUid` in localStorage) skips the wait: it renders from a
  localStorage copy of the data (`hasici.cache.v2`, written after each live
  update) and signs in in the background. Bump the cache key if the cached
  shapes change. Day toggles show at once via `data.pending`.
- **Long polling:** Firestore uses `experimentalForceLongPolling` because
  Safari was slow to open the default streaming connection.

## Open source / other units

MIT licensed. Nothing is tied to one unit: the Firebase project comes from `.env`
(`VITE_FIREBASE_PROJECT_ID`), which `npm run setup` writes after the user picks a
project; `.firebaserc` is not committed. CI uses the repo variables set by
`make setup-ci` and skips itself in copies where they are missing. The Czech
README is the setup guide for non-technical units; its screenshots in
`docs/screenshots/` come from `?demo` (plan, day, event, me) and the emulators
(password, member picker, share link).

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
4. ~~Test the security rules~~ (done): `make test-rules` replays the app's writes
   against the emulators. It found that `config/access` could be created on its
   own before setup, which blocked the setup for good; the rule now requires
   `config/public` in the same batch.
5. Ideas raised but not built:
   - QR code for the share link;
   - "Kdo je kdo" member highlight on desktop (legend is static now);
   - code-splitting Firebase (main chunk is ~620 kB).
