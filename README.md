# Hasiči – dostupnost jednotky

A lightweight planning tool for a volunteer fire unit (SDH). Members log the days
they are away, and planners see a live timeline of who is available and
schedule activities (cvičení, kondiční jízdy, školení…). It supplements dispatch
systems like FIREPORT and is pull-only: no notifications, no e-mails.

- **Stack:** SvelteKit (Svelte 5, static SPA) + Tailwind CSS 4 + Firebase
  (Firestore realtime, anonymous Auth, Hosting).
- **Language:** Czech UI.
- **Firebase project:** `hasici-bo`.

## Setup

```bash
npm install
firebase apps:sdkconfig web --project hasici-bo   # copy the values…
cp .env.example .env                              # …into .env
npm run dev
```

In the Firebase console, enable **Authentication → Sign-in method → Anonymous**
and create a **Firestore** database (production mode). The security rules come
from this repo.

## Deploy

```bash
npm run build
firebase deploy --only firestore:rules,hosting
```

## Develop without Firebase

`npm run dev`, then open <http://localhost:5173/?demo>. This dev-only mode loads
sample data (`src/lib/demo.ts`); `?demo=30` simulates a 30-member unit.
Changes are not saved.

Against local emulators instead (needs Java):

```bash
firebase emulators:start --only auth,firestore --project demo-hasici
VITE_USE_EMULATORS=1 npm run dev
```

## How access works

See [HANDOVER.md](HANDOVER.md) for the full picture. In short:

1. The very first visitor sets the unit password.
2. Members open the **share link** (`/?k=…`), or type the password.
3. Each device then picks who it is from the member list, once.

Anyone inside can manage members, change the password and rotate the link
(page **Jednotka**).
