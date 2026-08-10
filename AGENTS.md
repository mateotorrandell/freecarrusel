# Working on freecarrusel

Read `CLAUDE.md` first — it describes the architecture and the conventions this
codebase actually follows.

## Next.js 16

This is a recent major version and it broke things you may remember: route
handler params are promises, `serverExternalPackages` replaced the old
experimental flag, and several APIs moved. When something behaves differently
from what you expect, check `node_modules/next/dist/docs/` before assuming the
code is wrong.

## Before you finish

- `npx tsc --noEmit` must be clean.
- `npm run smoke` must stay green — it drives the real app with a real browser,
  and it exists because synthetic events hid a whole class of layout bugs here.
- New behaviour in the editor deserves a case in `scripts/smoke.mjs`.
