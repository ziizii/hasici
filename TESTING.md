# Feature inventory, tests and coverage

Playwright drives the production SvelteKit build in Chromium against local Firebase Hosting, Auth and Firestore with the repository's rules. Test accounts, documents, dates and browser state are isolated from deployed units. Each test resets the throwaway Firestore database. The test dates use Europe/Prague time.

## Run locally

Install Node.js 24 and Java 21 or later, then run

```sh
npm ci
npx playwright install chromium
npm run check
npm test
```

Close `make dev` first. The suite starts its own Auth and Firestore emulators on ports 9099 and 8080 and serves the build through the Hosting emulator on port 4173. Vitest runs the unit tests first. The emulator run then checks the Firestore rules and runs Playwright. The first run downloads the Firebase CLI and emulator binaries. The suite uses a demo project and writes its build to `.output/test-hosting`.

### Run one browser spec

```sh
npm run test:build
npx --yes firebase-tools@15.36.0 emulators:exec --config .firebase-test.json --project demo-hasici --only auth,firestore,hosting \
  'npm run test:e2e -- recurrence.spec.ts'
```

## Code coverage

```sh
npm run test:coverage
npm run coverage:check
```

These commands generate separate HTML, LCOV and JSON reports in `coverage/unit` and `coverage/e2e`, then check the [minimum line and branch coverage](scripts/check-coverage.mjs). To measure one suite, use `npm run test:unit -- --coverage` or `npm run test:coverage:e2e`.

- **Unit coverage** includes the calendar, recurrence, task and color modules in the [Vitest config](vitest.config.ts).
- **End-to-end coverage** maps executed Chromium page scripts back to TypeScript and Svelte sources. It includes the extra browser sessions used in multi-device tests. The Firestore rules, service worker and native device features have separate behavioral checks outside these percentages.

The [Test workflow](.github/workflows/test.yml) runs on pull requests, pushes to `main` and manual dispatch. It uploads the two reports in the `code-coverage` artifact and evaluates them in the `coverage` job. The job summary shows each suite's percentages and thresholds. The workflow also uploads the Playwright report and traces on test failure when available.

## User stories and coverage

Every user story we know of, and the Playwright spec that walks through it. ✅ = covered end to end, ❌ = not covered (the reason is given). When you add or change a feature, add its stories here.

[Access]: tests/e2e/access.spec.ts
[Plan]: tests/e2e/plan.spec.ts
[Availability]: tests/e2e/availability.spec.ts
[Activities]: tests/e2e/activities.spec.ts
[Recurrence]: tests/e2e/recurrence.spec.ts
[Tasks]: tests/e2e/tasks.spec.ts
[Unit]: tests/e2e/unit.spec.ts
[App shell]: tests/e2e/app-shell.spec.ts

### First use and access

| User story | | Spec |
| --- | --- | --- |
| The first visitor sets the unit password (too short, mismatch, show/hide) and adds themselves | ✅ | [Access] |
| A member joins with the share link, picks their name and stays signed in after a reload | ✅ | [Access] |
| A member joins on a new device by typing the password | ✅ | [Access] |
| A wrong password is refused, then "Moc pokusů" | ✅ | [Access] |
| After the guess limit has passed, the same device can try again and get in | ✅ | [Access] |
| An old link after rotation shows the password screen | ✅ | [Access] |
| "Nejsem to já", then pick a different member | ✅ | [Access] |
| The member this device picked is archived on another phone: the device asks "Kdo jste?" again | ✅ | [Access] |
| Firebase config missing, or the start fails ("Zkusit znovu") | ❌ needs a build without config or a broken backend at start | |

### Plan (list and calendar)

| User story | | Spec |
| --- | --- | --- |
| Counts, member labels, duplicate first names, nicknames | ✅ | [Plan], [Unit] |
| Vše / Víkendy (with fixed and movable holidays) / Akce filters, "Hledat akce dál" | ✅ | [Plan] |
| Jump buttons: Dnes, Příští týden, Za 2 týdny, the next months | ✅ | [Plan] |
| Scrolling down keeps loading days (list) and months (calendar) | ✅ | [Plan] |
| "Zobrazit dřívější dny" / "Zobrazit dřívější měsíc" | ✅ | [Plan] |
| The calendar is remembered and shows today, the ring and activity slices in time order | ✅ | [Plan] |
| Switching Seznam ↔ Kalendář keeps the place (the month in the calendar, the day in the list) | ✅ | [Plan] |
| The calendar on a phone opens a day as a bottom sheet | ✅ | [Plan] |
| Archived members leave the plan bar and the pickers | ✅ | [Unit] |

### Day panel

| User story | | Spec |
| --- | --- | --- |
| "Tento den nemůžu" / "přece jen můžu", splitting a date range | ✅ | [Availability] |
| Tapping a teammate's segment on a future day flips them, with undo | ✅ | [Availability] |
| Tapping your segment on a day of a repeating absence adds an exception | ✅ | [Availability] |
| Long-term unavailable members are listed as "Dlouhodobě mimo" and not counted | ✅ | [Availability] |
| Plan an activity from the day panel; the default place is pre-filled | ✅ | [Unit] |
| Phone bottom sheet: focus, Escape, focus returns, no sideways scroll at 150 % text | ✅ | [Plan] |

### Activities

| User story | | Spec |
| --- | --- | --- |
| Create with "Naplánovat akci" (time, place, note), edit, clear the time, delete | ✅ | [Activities] |
| Saving needs a date and a title | ✅ | [Activities] |
| After saving, the plan opens that day | ✅ | [Activities] |
| Cancelling an edit leaves the activity unchanged | ✅ | [Activities] |
| "Nemůžu přijít" with a reason, "Přece jen přijdu", shared by activities on the same day | ✅ | [Activities] |
| "Přece jen přijdu" inside a multi-day absence frees only that day | ✅ | [Availability] |
| The activity page shows "Dlouhodobě mimo" and leaves them out of the count | ✅ | [Availability] |
| Tapping a teammate on an upcoming activity page | ✅ | [Availability] |
| Past activity: "Přišlo X z Y", "Nepřišli", correcting attendance, later members not counted | ✅ | [Availability] |
| Opening a deleted or unknown activity | ✅ | [Activities] |

### Repeating activities

| User story | | Spec |
| --- | --- | --- |
| Presets: every week, the same day each month | ✅ | [Activities] |
| A repeat with no end date ("do odvolání") | ✅ | [Activities] |
| Vlastní: every n days / weeks / months / years, nth or last weekday, last workday, the 31st, leap days | ✅ | [Recurrence] |
| Rules that can't produce a date are refused | ✅ | [Recurrence] |
| Move one date, cancel one date ("Zrušit tento termín") | ✅ | [Activities] |
| "Smazat jen tuto akci" from the edit form | ✅ | [Activities] |
| Cancel a date that was already moved | ✅ | [Activities] |
| "Tento i všechny další": new rule and end, "Neopakovat", turn a one-off into a repeat | ✅ | [Activities] |
| "Smazat tuto i všechny další" | ✅ | [Activities] |

### My absences (Já)

| User story | | Spec |
| --- | --- | --- |
| Quick Dnes / Zítra / Víkend, reason chips, note, the "Nebudete k dispozici" summary | ✅ | [Availability] |
| Delete an absence and undo | ✅ | [Availability] |
| Overlapping absences are listed as one range and freed together | ✅ | [Availability] |
| A repeating absence warns about clashing activities; exception chips | ✅ | [Availability] |
| Weekends (Vlastní, So + Ne) with no end date | ✅ | [Availability] |
| Sparse repeats far in the future, impossible ranges refused | ✅ | [Availability] |
| "Nejsem k dispozici" on; off on the same day (deleted) or a later day (ended yesterday) | ✅ | [Availability] |
| "Proběhlé nepřítomnosti" | ✅ | [Availability] |
| "Moje barva" | ✅ | [Unit] |

### Jednotka

| User story | | Spec |
| --- | --- | --- |
| Rename the unit; add, rename and nickname members; custom colour with readable text | ✅ | [Unit] |
| Archive, undo, restore, permanently delete (with their absences) | ✅ | [Unit] |
| A new member gets a free palette colour; a restored one gets a new colour if theirs was taken | ✅ | [Unit] |
| With every palette colour taken, colours are shared | ✅ | [Unit] |
| Another member's "Není k dispozici" switch, "Je zpět" | ✅ | [Availability] |
| Copy, share sheet, rotate the link | ✅ | [Access] |
| A failed copy asks to select the link by hand | ✅ | [Unit] |
| Change the password (too short is refused) | ✅ | [Access] |
| "Odhlásit ostatní", with or without a new password | ✅ | [Access] |
| Saved places: suggestions ignoring case and accents, keyboard, Escape, default, remove, places used before | ✅ | [Unit] |
| Upcoming absences and activities, show all / show less, past activities | ✅ | [Unit], [Availability] |

### Tasks

| User story | | Spec |
| --- | --- | --- |
| Create, cancel, assign, sort, overdue, edit, complete, reopen, delete, live sync between devices | ✅ | [Tasks] |
| Tasks on a day or an activity, in the day panel, on the activity page and in the calendar | ✅ | [Tasks] |
| Repeating tasks, intervals after completion, the reopen rules, two devices completing at once | ✅ | [Tasks], [Recurrence] |
| "Všechny úkoly" from a day or activity view | ✅ | [Tasks] |
| The linked activity was deleted ("Nedostupná akce") | ✅ | [Tasks] |
| The assignee was archived (name kept) or deleted ("Bývalý člen") | ✅ | [Tasks] |
| Saving or deleting a task fails (error toast) | ❌ Firestore keeps writes pending offline instead of failing, so this needs a rejected write | |

### App shell, offline and phone

| User story | | Spec |
| --- | --- | --- |
| Install manifest and icons; opens offline from cache; picks up remote changes after reconnecting | ✅ | [App shell] |
| An absence saved offline reaches another phone after reconnecting | ✅ | [Availability] |
| Two phones: one marks an absence, the other sees the count change live | ✅ | [Availability] |
| A new version reloads only after you leave a text field | ✅ | [App shell] |
| "Přeskočit na obsah" for keyboard users; "Skrýt oznámení" on toasts | ✅ | [App shell], [Unit] |
| The app is left open past midnight and "today" moves | ❌ the date is read when a page loads; a reload picks up the new day | |

The browser suite checks the web manifest and the handoff to the share API. Home-screen installation and the operating system's share sheet depend on the actual device. Production Firebase Hosting, optional reCAPTCHA App Check enforcement, and the rollout of a new service worker across deployed versions depend on deployed infrastructure. The separate [rules suite](scripts/test-rules.mjs) verifies which Firestore reads and writes the backend accepts.

When adding or changing a feature, add or update its user stories above and add or extend a Playwright scenario through the normal UI. Seed only setup data through the emulator, and assert the persisted outcome through the UI. For recurrence changes, cover both task and activity callers when they share the affected behavior, and include absences when their rules are affected.
