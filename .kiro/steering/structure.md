---
inclusion: always
---

# Project structure

```
.kiro/
  specs/ghost-lot/     requirements.md, design.md, tasks.md (source of truth)
  steering/            this folder
  hooks/               Kiro hooks (eval regression, property-based tests, banned-phrase lint)
api/                   Vercel serverless functions, one file per endpoint
src/
  geo/                 pure geometry: annotation parsing, transforms, haversine, clipping
  server/              server logic shared by api/: tile planner, vision passes, cache, parsing
    prompts/           versioned prompt files (pass1-general, pass2-tanks)
  ui/                  React components (map, pins, risk card)
  content/             hazards.json and disclaimer text (fixed, owner-reviewed)
scripts/build-index/   offline build of the sheet index from mapsnap
eval/                  labeled crops, labels.md, Python eval scripts
```

## Rules

- `api/*` files stay thin: validate the input, call `src/server/*`, and return the result.
- Tests sit next to the code as `*.test.ts`. Property-based tests are named `*.prop.test.ts`.
- Do not modify the eval crops or `eval/crops/labels.md` unless the task is about the eval set. Record every label change in that file's notes.
- Generated data (`index/`, `data/raw/`) is git-ignored and rebuilt by script.
- Keep `.kiro/` committed; the hackathon requires it.
