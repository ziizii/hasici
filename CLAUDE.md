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
- UI without Firebase: `npm run dev`, open `/?demo` (or `/?demo=30`).
