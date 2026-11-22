# Implementation plan: Ghost Lot

Dates assume work starts Nov 22, 2026 and must be submitted by Dec 4, 2026 at 2:00 PM PT (Dec 5 at 3:30 AM IST). Each task cites the requirements it serves.

## Day 1–2 (Nov 22–23): foundations

- [ ] 1. Project setup
  - [x] 1.1 Verify the external dependencies before writing any code. Write the results into `design.md` and replace each *verify* note there. _Req 1, 2_ (done 2026-11-22)
    - [x] Allmaps MapLibre package: `@allmaps/maplibre@1.0.0-beta.44`, MIT, with `WarpedMapLayer` and `addGeoreferenceAnnotationByUrl`. **Rendering checked in the Allmaps Viewer** (Nidhi's screenshot, 2026-11-22): the Fort Payne 1927 sheets warp into one continuous map, and the old street lines continue today's streets (3rd, 2nd and 1st Streets, and Gault Avenue North) at the edges. The Viewer is not our MapLibre setup, so 6.0 still checks the plugin itself and phone performance.
    - [x] US Census geocoder: works with no key. The response shape is recorded in `design.md`.
    - [x] Nominatim usage policy: checked. Dropped as a fallback (see `design.md`).
    - [x] Groq free-tier limits: 8,000 tokens per minute and 1,000 requests per day, which allows about 2–3 tiles per minute. The throughput plan is in `design.md`.
    - [x] CORS: mapsnap annotations and LoC IIIF images both allow `*`.
  - [x] 1.2 Scaffold the project (done 2026-11-22; typecheck, test and build pass; first git commit made). The project `.npmrc` pins the public npm registry.
    - Vite + React + TS app, plus a Vercel functions folder.
    - MIT `LICENSE`.
    - `.gitignore` containing `.env`, and a `.env.example`.
    - `README` stub.
    - `.kiro/` must stay committed.
    _Req 8.2_
  - [x] 1.3 Add the steering files. Done 2026-11-22. Always included: `product.md`, `tech.md` and `structure.md`. Included on matching files: `safety-language.md` (UI, content, prompts and docs) and `vision-prompts.md` (prompts and eval). _Req 6_
  - [ ] 1.4 Move `eval/` into the repo layout and make `vision_eval.py` read prompts from `src/server/prompts/`. Add a `make eval` target. _Req 3_
- [ ] 2. Geometry module `src/geo/`
  - [x] 2.1 Parse the annotation and wrap Allmaps' `ProjectedGcpTransformer`. Refuse any transform other than polynomial order 1 or Helmert. Code: `src/geo/annotation.ts` and `transform.ts`. _Req 2.1, 4.1_
  - [x] 2.2 Implement haversine, destination point, circle polygon and convex clipping, plus `radiusOnSheet`. Code: `src/geo/distance.ts`, `polygon.ts` and `radius.ts`. _Req 1.3_
  - [x] 2.3 Write 19 tests in `annotation.test.ts` and `geo.prop.test.ts`, covering round-trips on real and random sheets, haversine, clipping and radius. They passed on 3 consecutive runs. _Req 4.1_

## Day 3–4 (Nov 24–25): data

- [ ] 3. Sheet index
  - [x] 3.1 `npm run build-index` (done 2026-11-22). The build takes 39 s and produces:
    - 27,332 volumes dated 1930 or earlier,
    - 261,792 sheet images,
    - 51 state files, 13 MB gzipped in total (NY is the largest at 1.1 MB),
    - 0 parse errors and 0 unsupported transforms.

    Design note: the index stores only `[item, idx, year, bbox]` plus a Flatbush tree. The lookup fetches the matching volume's annotation from `data.mapsnap.org` and clips it exactly, which keeps the index small. _Req 1.3, 1.5_
  - [x] 3.2 Add `index/states.json` (per-state bbox, sheet count and file size), `index/places.json` (7,512 places) and `nearestPlace()`. _Req 1.4_
  - [x] 3.3 Tests in `src/server/sheetIndex.test.ts`:
    - fixture tests, plus a property test that a sheet within the radius is never missed;
    - tests that run only when the built index exists: 100 Gault Ave N, Fort Payne returns `sanborn00045_004` (1927), and a point 30 km away returns nothing.

    All 28 tests pass. _Req 1.3, 1.4_
  - [ ] 3.4 Decide how `index/` reaches production (it is git-ignored). The options are to run `build-index` in the Vercel build (a 132 MB download per deploy) or to commit the 13 MB. Decide in task 7.5.
- [ ] 4. Lookup API
  - [x] 4.1 `/api/geocode` and `/api/sheets` (done 2026-11-22). The `api/` files are thin wrappers over `src/server/{geocode,lookup,tiles,deps,http,rateLimit}.ts`.
    - Requests are validated with zod: the radius is 25–400 m and the point must be in the US lat/lon box.
    - The rate limit is GET-only, 30 requests per minute per IP, and in memory per instance. The KV-backed version comes in 5.2.
    - Errors never expose internals.
    - The live end-to-end run used the real Census geocoder and real mapsnap data:
      - 100 Gault Ave N, Fort Payne: 1891, 1897, 1909 and 1927 maps, 8 sheets, 2.9 s.
      - 1600 Pennsylvania Ave NW: 1888 and 1903 maps, 5 sheets, 1.2 s.
    _Req 1, 8.3_
  - [x] 4.2 Property-based tests for the tile planner, plus lookup, geocoder and rate-limit tests. All 49 tests pass. _Req 3.3_
  - [~] 4.3 Tile count. Options (a), (b) and (c) were implemented on 2026-11-22:
    - Pass 1 reads at 2× downscale (2,500 scan px sent as 1,250 px), and `refineTile` produces native-resolution tiles for pass 2.
    - Only the newest year is read, nearest tile first, through `readingPlan`.
    - Result for Fort Payne 1927 at 150 m: 38 tiles became 17 (8 at 100 m). For 1600 Pennsylvania Ave (1903): 11 tiles at 150 m and 4 at 100 m.

    The half-resolution eval was run on Gemini (see 5.0): 18 of 18 labeled classes, 0 false alarms. Half resolution is validated. The Groq run is still incomplete because of its 200,000 tokens-per-day cap.
    Original problem statement: **Fix before task 5: too many tiles.** At 150 m, the 1927 Fort Payne lookup needs 38 native-resolution tiles, and Fort Payne sheets are about 0.03 m/px. The design had assumed 4–12 tiles. At 2–3 tiles per minute on Groq's free tier, that is 13–19 minutes for one address. Options:
    - (a) Run pass 1 at 2× downscale. Native-resolution tiles are then only needed for pass 2 on AUTO/FUEL tiles. In the spike, pass 2 found the tanks on a 1300 px crop downscaled from 2400 px (c14).
    - (b) Read only the default year.
    - (c) Read the tiles nearest the address first.
    - (d) Lower the default radius.

    Pick with Nidhi, then re-run the eval at the chosen resolution.

## Day 5–6 (Nov 26–27): reading

- [ ] 5. Vision service
  - [x] 5.1 Prompts and parsing (done 2026-11-22). _Req 3.1, 3.2, 3.5_
    - Prompts live in `src/server/prompts/prompts.json` (v2). The app and the Python eval share this file.
    - v2 adds a 3×3 `where` cell to each finding.
    - `src/server/vision/parse.ts` parses defensively, and an unparseable reply is retried once, then the tile is marked `unread`.
    - The v2 eval on Gemini: 19/19 classes and 0 false alarms (`eval/crops/half/run_pipeline.gemini-3.5-flash-lite.p2.txt`).
    - Design change: pass 2 runs on the same half-resolution tile, not on native-resolution subtiles. The eval shows that works, and it costs 1 call instead of about 4. `refineTile` is kept for later if needed.
  - [x] 5.2 / 5.2a Reading, cache and budget (done 2026-11-22). _Req 3.6, 7.2, 7a.2–7a.5_
    - `readTile` handles the cache, the budget reservation and refund, short 429 waits, and a daily-quota 429, which marks the day as spent.
    - Scan downloads go through `fetchTileImage`: LoC URLs only, 3 retries.
    - `Budget` keeps a daily cap on the Pacific calendar day, plus a per-IP live cap that is counted once per lookup.
    - The store is `MemoryStore` for now. **The shared KV adapter is still to do (7.5).** Until then, the budget and cache are per instance.
  - [x] 5.3 `/api/read` SSE (done 2026-11-22). _Req 7.2_
    - It recomputes the plan on the server, so clients never send URLs.
    - It emits `plan`, `tile`… and then one of `done`, `more` or `paused`. `more` is emitted at 45 s so a request fits the function limit, and resuming is served from the cache.
    - Live run on 100 Gault Ave N, Fort Payne, at 100 m: 9 tiles, 13 model calls, 134 s, 0 unread. The tiles produced 10 readings: garages, G.T. tanks, a filling station, a blacksmith and an electric-motor print shop. These readings are **not yet checked against the images**.
  - [x] 5.0 Provider chosen: **Gemini `gemini-3.5-flash-lite`** (2026-11-22). On the half-resolution pipeline eval it found 18 of 18 labeled classes, with 0 false alarms once the c13 label was corrected (see `vision-prompts.md`).
    - Still open: Nidhi to read the free requests-per-day limit for Flash-Lite in AI Studio, then set `READ_BUDGET_PER_DAY` to match.
    - Groq stays as the fallback.

    Original task: Choose the vision provider. Get a Gemini key from Nidhi and read the Flash-Lite RPD in her AI Studio. Run `eval/pipeline_eval.py` with Gemini's `MODEL_BASE_URL`/`MODEL_ID`, and finish the Groq run once its daily tokens recover. Pick the provider with the better score within the free quota. The eval scripts are now provider-agnostic. _Req 7a.6_
  - [ ] 5.2 Implement the worker queue with 429 backoff, the tile fetch with 3 retries, and the cache keyed by tile, model and prompt version. _Req 3.6, 7.2_
  - [ ] 5.2a Add the daily read budget and the per-IP live-lookup cap in KV. Handle a daily-quota 429 by marking the day as spent. Return `paused` from `/api/read` while the overlay keeps working. _Req 7a.2–7a.5_
  - [ ] 5.3 Implement `/api/read` as an SSE stream of per-tile progress. _Req 7.2_
  - [ ] 5.4 Add a Kiro hook: saving any file in `src/server/prompts/*` runs `make eval`, which fails if recall drops below 0.80 or there is any false positive on hazard-free crops. _Req 3_
  - [ ] 5.5 Grow the eval set to about 40 crops by adding one bigger city, such as a 1920s downtown with a rail yard. Nidhi hand-checks 5 of the agent's labels. _Req 3_

## Day 7–9 (Nov 28–30): product

- [ ] 6. Map UI
  - [~] 6.x UI built on 2026-11-22. It passes typecheck, tests and build; **not yet visually checked**, because the agent's host blocks starting a dev server and its browser is unavailable. Nidhi to run `npm run dev` and send screenshots.
    - The landing page leads with the showcase. There is an address search.
    - The results page has:
      - the MapLibre map on the OpenFreeMap dark style, with the Allmaps overlay, an opacity slider and a year picker;
      - a dashed search circle;
      - ghost pins that show colour plus a letter;
      - pin popups built from text nodes only (no innerHTML of model text), with the tile image;
      - a parchment risk card with distance bands, EPA-sourced contaminants and questions, and the disclaimer;
      - print-to-PDF;
      - fog, with reduced-motion respected;
      - a mobile layout under 760 px.
    - `src/content/hazards.json` is DRAFTED from the EPA "Past Property Uses" sheet (2024) and the EPA UST pages. **Nidhi to review (6.2).**
    - The banned-phrase lint (`src/content/banned.ts`, plus `safety.test.ts`) covers `src/ui`, `src/content`, `App.tsx`, `index.html` and the README. It includes a property test over the generated risk-card sentences.
    - The map stack (2 MB) is lazy-loaded, so the landing page is 235 kB.
    - A Vite dev plugin serves `api/*.ts` locally, on loopback only.
    - The handlers were checked with mock requests: geocode 200 and 404, sheets 200 / 400 / 405.
  - [ ] 6.0 First, render `https://data.mapsnap.org/runs/v2.0/iiif/loc/sanborn00045_004.main.iiif.json` with `@allmaps/maplibre` over a MapLibre basemap, on both desktop and a phone. If it fails or runs slowly, switch to the fallback listed in design Open questions 1. _Req 2.1_
  - [ ] 6.1 Build the landing page (address box and showcase chips), the results map, the Allmaps overlay with an opacity slider and year picker, and the attribution line. _Req 1.5, 2_
  - [ ] 6.2 Write `src/content/hazards.json` with a cited source for each contaminant claim. Nidhi reviews it. _Req 5.2_
  - [ ] 6.3 Add ghost pins with a class colour and icon, and a popup with the tile image, the AI-reading label, the year and the distance. _Req 4_
  - [ ] 6.4 Build the risk-card drawer: distance bands, fixed content, the disclaimer and the incomplete-reading banner. _Req 5.1, 5.3, 5.4, 6.2_
  - [ ] 6.5 Implement the banned-phrase lint, used both as a unit test and as a Kiro hook on UI copy. _Req 6.1, 6.3_
  - [ ] 6.6 Add a print stylesheet so the PDF export fits on one page. _Req 5.5_
  - [ ] 6.7 Apply the Halloween theme (fog vignette, ghost glyphs, parchment drawer) and support `prefers-reduced-motion`. Check legibility at 375 px width. _Req 7.3_

## Day 10–11 (Dec 1–2): demo hardening

- [ ] 7. Showcase and Kiro Crew precompute
  - [ ] 7.1 Pick the 3 showcase addresses: Fort Payne, AL 1927 plus 2 well-known cities. Confirm that each has hazards within 150 m. _Req 7.1_
  - [ ] 7.2 Run a Kiro Crew precompute with three roles: a planner, parallel readers, and a skeptic that re-reads each finding against its image. Commit the results JSON and log the skeptic's disagreements. _Req 7.1_
  - [ ] 7.3 Build the local `ghost-lot` MCP server with `find_sheets` and `read_tile`, and use it while debugging. _Design: Kiro usage plan_
  - [ ] 7.4 Write a Playwright smoke test: a showcase address loads in under 3 s, shows at least one pin, and its popup opens. _Req 7.1_
  - [ ] 7.5 Deploy to Vercel. Before the repo goes public, rotate the Groq key and set it as a server environment variable. _Req 8.1_

## Day 12–13 (Dec 3–4): submission

- [ ] 8. Submission
  - [ ] 8.1 Record a demo video under 3 minutes: the problem (about 20 s), the address search and the map fading in, a ghost pin with its crop, the risk card, then the Kiro Crew skeptic catching a misread, then close. Upload it to YouTube as public. _Hackathon rules_
  - [ ] 8.2 Write the README and the "How Kiro was used" write-up (specs, steering, hooks, MCP, Kiro Crew, PBT), with screenshots. _Hackathon rules_
  - [ ] 8.3 Final checks:
    - the repo is public,
    - the licence is detected in the GitHub About section,
    - `.kiro/` is present,
    - no secrets are in the git history (`git log -p | grep gsk_` returns nothing),
    - the live URL works in an incognito window.
  - [ ] 8.4 Submit on Devpost (Frankenstein category plus the Best Kiro Crew App bonus). Optional: post with #KiroweenHackathon26 and write a blog post for the bonus prizes.

## Stretch (only if Day 11 is green)

- [ ] 9. Compare findings against current EPA records for the same area (Envirofacts or ECHO; first check whether access works). _Out of scope v1_
- [ ] 10. A year-slider animation that shows a block changing from 1904 to 1927.
