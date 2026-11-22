---
inclusion: always
---

# Tech stack and conventions

## Stack (versions are pinned in `package.json`; do not upgrade them unasked)

- **Frontend:** Vite 8, React 19, TypeScript 7 in strict mode with `noUncheckedIndexedAccess`.
- **Map:** `maplibre-gl` 6.19.0, with the historic overlay drawn by `@allmaps/maplibre` 1.0.0-beta.44 (`WarpedMapLayer`, `addGeoreferenceAnnotationByUrl`). The Allmaps README mentions MapLibre 5, but the package requires `maplibre-gl ^6.6`, so stay on 6.
- **Server:** Vercel serverless functions in `api/`, written in TypeScript (`@vercel/node`).
- **Validation:** `zod` 4, at every API boundary and on every model response.
- **Tests:** `vitest`, with `fast-check` for property-based tests.
- **npm:** the project `.npmrc` pins `registry.npmjs.org`. Do not change it; the machine-wide registry has a broken token.

## External services (all verified in task 1.1)

| Service | Use | Notes |
|---|---|---|
| US Census Geocoder | address → lat/lon | Uses `onelineaddress` with `benchmark=Public_AR_Current`, needs no key, and covers the US only. Do **not** add Nominatim: its usage policy restricts this kind of use. |
| `data.mapsnap.org/runs/v2.0/` | georeference annotations, `items.tsv` | Data is ODbL and allows any origin (CORS `*`). |
| `tile.loc.gov` IIIF | sheet images and crops | Allows any origin (CORS `*`) and is often slow, with 20–90 s responses and truncated downloads. Always retry. |
| `loc.gov` search/JSON API | — | **Never call it.** It returns a Cloudflare 403 to scripts. |
| Groq `qwen/qwen3.8-27b` | vision passes | Free tier limits: 8,000 tokens per minute, 1,000 requests per day, and **200,000 tokens per day**. The daily token cap binds first: each tile read is charged about 2,500 tokens, so the free tier allows about 80 tile reads per day. On a 429, honour `retry-after`. When `x-should-retry: false` is set, the daily cap has been hit and retrying in a loop is pointless. |

## Conventions

- Keep pure logic (geometry, tile planning, parsing, findings merge) in `src/geo/` and `src/server/` as plain functions with no I/O, so they can be tested with fast-check.
- Write geometry in lon/lat degrees and image pixels, and name units in variables (`distanceM`, `px`, `lon`, `lat`). Treat transform types other than affine (polynomial order 1) and Helmert as unsupported, and throw on them; never guess.
- Every network call to LoC or Groq has a timeout, a bounded retry and a typed error. Never swallow a failure into "no hazards".
- Cache keys must include `MODEL_ID` and `PROMPT_VERSION`.
- Keep comments short and only where the code is not obvious. Do not add long module headers.

## Secrets

- `GROQ_API_KEY` is server-side only. Never prefix it `VITE_`, never log it, and never send it to the browser.
- `.env` is git-ignored, and `.env.example` documents the variables. Never hard-code a key in code, tests, eval scripts or steering.

## Commands

- `npm run dev` starts the local app on `127.0.0.1`.
- `npm test` runs vitest.
- `npm run typecheck` runs the TypeScript check.
- `npm run build` runs the typecheck, then the Vite build.
- Run `npm run typecheck && npm test` before saying a task is done.
