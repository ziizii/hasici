# CLAUDE.md

Read [HANDOVER.md](HANDOVER.md) first. It has the product decisions, data
model, code map and open tasks.

- UI copy is Czech; keep it short and plain (non-technical volunteers).
- Use `rem`-based sizes only (Tailwind scale or `text-[…rem]`), never `px`
  for text or tappable sizes. Many users have large system fonts. Tap targets
  must be at least 44px (`min-h-11`).
- Absences are whole days. "Nemůžu přijít" = create a one-day absence; don't
  add a separate opt-out structure.
- Before finishing: `npm run check` and `npm run build`.
- Local dev: `make dev` (app + Firebase emulators, data kept in
  `.emulator-data/`, `make reset-emu` wipes it). `make dev-prod` uses the
  real project from `.env`. UI without Firebase: `make demo` (`/?demo`, or
  `/?demo=30`). `make` lists all targets.
- Keep README.md (Czech, for non-technical units) up to date with every change
  that users see or that affects setup: features, steps, button names,
  commands. Retake the screenshots in `docs/screenshots/` with
  `make screenshots` when the screens they show change, and check them.
