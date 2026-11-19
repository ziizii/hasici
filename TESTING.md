# Feature inventory and end-to-end tests

Playwright drives the production SvelteKit build in Chromium against local Firebase Hosting, Auth and Firestore with the repository's rules. Test accounts, documents, dates and browser state are isolated from deployed units. Each test resets the throwaway Firestore database. The test dates use Europe/Prague time.

## Run locally

Install Node.js 24 and Java 21 or later, then run

```sh
npm ci
npx playwright install chromium
npm run check
npm test
```

Close `make dev` first. The suite starts its own Auth and Firestore emulators on ports 9099 and 8080 and serves the build through the Hosting emulator on port 4173. It runs the Firestore rules assertions and then Playwright. The first run downloads the Firebase CLI and emulator binaries. The suite uses a demo project and writes its build to `.output/test-hosting`.

### Run one browser spec

```sh
npm run test:build
npx --yes firebase-tools@15.36.0 emulators:exec --config .firebase-test.json --project demo-hasici --only auth,firestore,hosting \
  'npm run test:e2e -- recurrence.spec.ts'
```

The [Test workflow](.github/workflows/test.yml) runs on pull requests, pushes to `main` and manual dispatch. It builds and checks the app, runs both suites, and saves the Playwright HTML report and failure traces as an artifact when available.

## Feature coverage

| Area | User-facing features exercised | End-to-end spec |
| --- | --- | --- |
| First use and sign-in | Initialize the unit, confirm the password, show or hide it, add the first member, unlock by password or invite link, reject bad credentials, throttle retries, remember the session and chosen member, change identity | [Access](tests/e2e/access.spec.ts) |
| Sharing and device access | Copy the invite, send it to the system share sheet, rotate the link, change the password, keep existing sessions on rotation, revoke other devices | [Access](tests/e2e/access.spec.ts) |
| Plan and list | Read availability counts and member labels, filter all days or weekends and public holidays or activities, jump to today and future dates, load earlier days and search farther ahead | [Plan](tests/e2e/plan.spec.ts), [Availability](tests/e2e/availability.spec.ts), [Unit](tests/e2e/unit.spec.ts) |
| Calendar | Switch and remember list/calendar view, show today and availability rings, display multiple activity colors in time order, open a day, show earlier months and due-date tasks | [Plan](tests/e2e/plan.spec.ts), [Tasks](tests/e2e/tasks.spec.ts) |
| Day detail | Read who can attend, absence reasons and long-term unavailability, toggle a whole day or a member's availability, open activities and use the day task checklist, plan an activity for the selected day | [Availability](tests/e2e/availability.spec.ts), [Activities](tests/e2e/activities.spec.ts), [Tasks](tests/e2e/tasks.spec.ts), [Unit](tests/e2e/unit.spec.ts) |
| Activities | Plan on an arbitrary date, set or clear meeting time, set the place and note, edit and delete, set or withdraw attendance, share that attendance with other activities on the same date | [Activities](tests/e2e/activities.spec.ts) |
| Repeating activities | Weekly legacy and open-ended series, calendar-based rules, inclusive end, move or cancel one occurrence, split and replace later dates, stop repeating, convert a one-off, delete this and later occurrences | [Activities](tests/e2e/activities.spec.ts), [Recurrence](tests/e2e/recurrence.spec.ts) |
| Shared tasks | Create, cancel editing, assign a member, sort by due date, flag overdue tasks, edit, complete, reopen and delete with live updates between devices | [Tasks](tests/e2e/tasks.spec.ts) |
| Tasks in context | Link to a day or activity, show on assigned and due days with no duplicate for an identical date, see tasks in list and calendar, use the day and activity checklists and filtered lists, restrict assignment to future or current activities | [Tasks](tests/e2e/tasks.spec.ts) |
| Calendar recurrence across tasks and activities | Compare preview, persisted activity occurrences and task successors for daily intervals across DST, alternate weeks and multiple weekdays, the 31st, dates every other month, a fifth weekday, and the last workday in selected months. Cover inclusive ends, empty or impossible rules, and sparse leap-day series | [Recurrence](tests/e2e/recurrence.spec.ts) |
| Task progression | One open successor, completion-based intervals, leap-month clamping, late and early completion, confirmation and rollback on reopen, protection when the successor is finished, disabling recurrence, standalone successors of activity tasks, preservation of an assigned-day offset, deletion of the last open task, concurrent completion | [Recurrence](tests/e2e/recurrence.spec.ts), [Tasks](tests/e2e/tasks.spec.ts) |
| Personal availability | Record a day or range using quick dates and reasons, split and regroup dated ranges, see activity conflicts, add or remove an exception to recurring absence, delete and undo, turn on long-term unavailability | [Availability](tests/e2e/availability.spec.ts) |
| Unit settings and people | Rename the unit, add or rename a member, choose a nickname, assign palette and custom colors with readable text, archive, undo, restore and permanently delete members, manage another member's unavailability | [Unit](tests/e2e/unit.spec.ts), [Availability](tests/e2e/availability.spec.ts) |
| Unit overview and history | View upcoming absences and activities, expand the longer activity list, view past events and attendance, exclude members who had yet to join, correct past attendance | [Unit](tests/e2e/unit.spec.ts), [Availability](tests/e2e/availability.spec.ts) |
| Saved places | Save, suggest, select by keyboard, set a default, prefill a new activity, remove the default | [Unit](tests/e2e/unit.spec.ts) |
| Phone, accessibility and app shell | Usable mobile navigation at enlarged text, keyboard opening, modal focus and return, installation manifest and icons, load the cached plan offline, defer update reload while typing | [Plan](tests/e2e/plan.spec.ts), [App shell](tests/e2e/app-shell.spec.ts) |

The browser suite checks the web manifest and the handoff to the share API. Home-screen installation and the operating system's share sheet depend on the actual device. Production Firebase Hosting, optional reCAPTCHA App Check enforcement, and the rollout of a new service worker across deployed versions depend on deployed infrastructure. The separate [rules suite](scripts/test-rules.mjs) verifies which Firestore reads and writes the backend accepts.

When adding or changing a feature, update its row and add or extend a Playwright scenario through the normal UI. Seed only setup data through the emulator, and assert the persisted outcome through the UI. For recurrence changes, cover both task and activity callers when they share the affected behavior, and include absences when their rules are affected.
