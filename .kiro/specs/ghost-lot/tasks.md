# Implementation plan: Ghost Lot

Dates assume work starts Nov 22, 2026 and must be submitted by Dec 4, 2026 at 2:00 PM PT (Dec 5 at 3:30 AM IST). Each task cites the requirements it serves.

## Day 1–2 (Nov 22–23): foundations

- [x] 1. Project setup
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
  - [x] 1.4 `eval/` lives in the repo, and both eval scripts read prompts from `src/server/prompts/prompts.json`. The target is `npm run eval` (`eval/gate.sh`) instead of `make eval`. _Req 3_
- [x] 2. Geometry module `src/geo/`
  - [x] 2.1 Parse the annotation and wrap Allmaps' `ProjectedGcpTransformer`. Refuse any transform other than polynomial order 1 or Helmert. Code: `src/geo/annotation.ts` and `transform.ts`. _Req 2.1, 4.1_
  - [x] 2.2 Implement haversine, destination point, circle polygon and convex clipping, plus `radiusOnSheet`. Code: `src/geo/distance.ts`, `polygon.ts` and `radius.ts`. _Req 1.3_
  - [x] 2.3 Write 19 tests in `annotation.test.ts` and `geo.prop.test.ts`, covering round-trips on real and random sheets, haversine, clipping and radius. They passed on 3 consecutive runs. _Req 4.1_

## Day 3–4 (Nov 24–25): data

- [x] 3. Sheet index
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
  - [x] 3.4 Decided 2026-11-22: production uses a **prebuilt deploy**. `npm run build:vercel` copies `index/` into the `sheets` and `read` functions (14 MB each), and the index stays out of git. Original task: Decide how `index/` reaches production (it is git-ignored). The options are to run `build-index` in the Vercel build (a 132 MB download per deploy) or to commit the 13 MB. Decide in task 7.5.
- [x] 4. Lookup API
  - [x] 4.1 `/api/geocode` and `/api/sheets` (done 2026-11-22). The `api/` files are thin wrappers over `src/server/{geocode,lookup,tiles,deps,http,rateLimit}.ts`.
    - Requests are validated with zod: the radius is 25–400 m and the point must be in the US lat/lon box.
    - The rate limit is GET-only, 30 requests per minute per IP, and in memory per instance. The KV-backed version comes in 5.2.
    - Errors never expose internals.
    - The live end-to-end run used the real Census geocoder and real mapsnap data:
      - 100 Gault Ave N, Fort Payne: 1891, 1897, 1909 and 1927 maps, 8 sheets, 2.9 s.
      - 1600 Pennsylvania Ave NW: 1888 and 1903 maps, 5 sheets, 1.2 s.
    _Req 1, 8.3_
  - [x] 4.2 Property-based tests for the tile planner, plus lookup, geocoder and rate-limit tests. All 49 tests pass. _Req 3.3_
  - [x] 4.3 Tile count. Options (a), (b) and (c) were implemented on 2026-11-22:
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
  - [x] 5.2 (done in 5.2 / 5.2a above) Implement the worker queue with 429 backoff, the tile fetch with 3 retries, and the cache keyed by tile, model and prompt version. _Req 3.6, 7.2_
  - [x] 5.2a (done in 5.2 / 5.2a above; KV store in 7.5) Add the daily read budget and the per-IP live-lookup cap in KV. Handle a daily-quota 429 by marking the day as spent. Return `paused` from `/api/read` while the overlay keeps working. _Req 7a.2–7a.5_
  - [x] 5.3 (done above) Implement `/api/read` as an SSE stream of per-tile progress. _Req 7.2_
  - [x] 5.4 Kiro hooks (done 2026-11-22), in `.kiro/hooks/`:
    - `prompt-eval.json`: saving `src/server/prompts/*.json` runs `eval/gate.sh` (the pipeline eval with `EVAL_GATE=1`). It fails if class recall drops below 0.80 or any hazard-free crop gets a finding. The eval's resume cache is keyed by a hash of the prompts file, so an edit always re-runs. First gated run on Gemini: recall 1.00, 0 false alarms.
    - `geo-tests.json`: saving `src/geo/*.ts` runs the geometry tests (19).
    - `banned-phrases.json`: saving UI copy, content, `index.html` or the README runs the banned-phrase lint (16 tests).
    _Req 3, 6.3_
  - [ ] 5.5 Grow the eval set to about 40 crops by adding one bigger city, such as a 1920s downtown with a rail yard. Nidhi hand-checks 5 of the agent's labels. _Req 3_

## Day 7–9 (Nov 28–30): product

- [ ] 6. Map UI
  - [x] 6.x UI built on 2026-11-22 and **visually verified by Nidhi in Chrome**.
    - Verified: the Fort Payne 1927 overlay lines up with today's streets, the dashed circle, the pins around it, and the popup with the AI-reading label and the tile image.
    - Three bugs were fixed along the way:
      1. MapLibre 6's worker failed under Vite. A plugin now serves it untransformed.
      2. Pins went missing under StrictMode, because markers from the removed map stayed in the ref.
      3. Pins stacked in the corner, because the CSS animation overrode MapLibre's positioning transform.
    - After a pin change in dev, hot reload keeps the old markers, so a hard reload is needed.
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
  - [x] 6.0 (verified in the browser, as above) First, render `https://data.mapsnap.org/runs/v2.0/iiif/loc/sanborn00045_004.main.iiif.json` with `@allmaps/maplibre` over a MapLibre basemap, on both desktop and a phone. If it fails or runs slowly, switch to the fallback listed in design Open questions 1. _Req 2.1_
  - [x] 6.1 (done in 6.x) Build the landing page (address box and showcase chips), the results map, the Allmaps overlay with an opacity slider and year picker, and the attribution line. _Req 1.5, 2_
  - [ ] 6.2 Write `src/content/hazards.json` with a cited source for each contaminant claim. Nidhi reviews it. _Req 5.2_
  - [x] 6.3 (done in 6.x) Add ghost pins with a class colour and icon, and a popup with the tile image, the AI-reading label, the year and the distance. _Req 4_
  - [x] 6.4 (done in 6.x) Build the risk-card drawer: distance bands, fixed content, the disclaimer and the incomplete-reading banner. _Req 5.1, 5.3, 5.4, 6.2_
  - [x] 6.5 (done in 6.x; hook added in 5.4) Implement the banned-phrase lint, used both as a unit test and as a Kiro hook on UI copy. _Req 6.1, 6.3_
  - [x] 6.6 (done in 6.x) Add a print stylesheet so the PDF export fits on one page. _Req 5.5_
  - [x] 6.7 (done in 6.x) Apply the Halloween theme (fog vignette, ghost glyphs, parchment drawer) and support `prefers-reduced-motion`. Check legibility at 375 px width. _Req 7.3_

## Day 10–11 (Dec 1–2): demo hardening

- [ ] 7. Showcase and Kiro Crew precompute
  - [x] 7.1 / 7.2 (simple version) Showcases precomputed on 2026-11-22 with `scripts/precompute-showcase.ts` (Gemini 3.5 Flash-Lite, prompts v2, 100 m radius). All tiles were read, with 0 unread:
    - **Gas Works Park, Seattle (1919).** The circle is centred on the plant inside the park, not on the geocoded entrance about 250 m away. 8 tiles, 11 calls, 22 findings, including "RETORTS", "STEEL GAS STORAGE HOLDER", "COKE OVENS", "OIL TANK IN GRD" and "CITY OF SEATTLE REFUSE DESTRUCTOR". The agent checked these labels against the full sheet image.
    - **Strip District, Pittsburgh (1905).** 2100 Smallman St. 10 tiles, 10 calls, 24 findings: Penn R.R. produce yard, a machine shop with a gas engine, a foundry, "FRANKLIN ZINC & MFG. CO.", and a fire-brick plant.
    - **Fort Payne, AL (1927).** Read earlier: 9 tiles, 10 findings.
    - Not yet done: the Kiro Crew skeptic pass (7.2), and an image check of every finding.
    - Some findings lie beyond the 100 m circle, at up to about 200 m, because tiles extend past the circle. The risk card puts them under "Within the wider search area".

    Original task: Pick the 3 showcase addresses: Fort Payne, AL 1927 plus 2 well-known cities. Confirm that each has hazards within 150 m. _Req 7.1_
  - [x] 7.2 Kiro Crew skeptic pass (done 2026-11-22). _Req 7.1_
    - `scripts/skeptic-prep.py` downloads each showcase tile and a native-resolution close-up of the cell where each finding was placed. Three Kiro Crew subagents, one per showcase, then checked all 56 findings against the images in parallel. They were given no context from the build session.
    - Verdicts: 49 confirmed, 2 not found, 5 wrong class. Logs are in `eval/skeptic/<showcase>.verdicts.json`.
    - A person reviewed every disagreement against the close-ups, then recorded the decisions in `eval/skeptic/decisions.json`. `scripts/skeptic-apply.py` applies them, and `src/content/skeptic.test.ts` keeps them applied.
      - Dropped 5: two Fort Payne pass-2 tank marks that are not on the map, a Pittsburgh water pumping station, Seattle's "GAS PUMPS 1ST" (the gas works' own engine-room pumps, already shown from the next tile), and Seattle's "GAS MFG", which is a fire-protection note rather than a building.
      - Corrected 1: "FORMERLY R. SM." to "FORMERLY BL.SM." (blacksmith).
      - Kept 2: the Seattle gas holders. The skeptic wanted FUEL, but that rule came from its brief, not from the app's prompt.
    - Result: 56 findings became 51.
    - **Found:** pass 2 can report tank marks that are not there. The 20-crop eval missed this because its hazard-free crops have no auto tiles to trigger pass 2.
    - **Fixed 2026-11-22, eval first:**
      1. Added `c20`, the exact Fort Payne tile, to the eval with gold AUTO only. It reproduced the bug on prompts v2: pass 2 counted 2 tanks, giving FUEL as a false positive.
      2. The gate had passed anyway, because it only checked hazard-free crops, so it now also fails on any false-positive class.
      3. Prompts v3: pass 2 counts a mark only when the "G.T."/"GTS." letters are readable next to it, names the unlabeled circles that are not tanks, and says 0 is a normal answer.
      4. The gated run passed: recall 1.00, 0 false positives, c20 at 0 tanks, and tanks still found on c03, c04, c11 and c14.
    - Caveat: in this eval, pass 1 already finds FUEL on every FUEL crop, so pass 2's ability to catch a tank that pass 1 missed is not directly measured.
  - [x] 7.3 Local `ghost-lot` MCP server (done 2026-11-22). _Design: Kiro usage plan_
    - Code: `src/mcp/server.ts` (tools) and `scripts/mcp-server.ts` (stdio entry, reads `.env`). Registered in `.kiro/settings/mcp.json`; `find_sheets` is auto-approved, `read_tile` asks first because it spends model quota.
    - `find_sheets(lat, lon, radius_m)`: years, sheets and the nearest-first reading plan with tile URLs. No model calls.
    - `read_tile(lat, lon, radius_m, tile)`: reads one tile through the same `readTile` the API uses and returns located findings. Capped at `MCP_READS_PER_RUN` (default 20) calls per server process.
    - Tests: `src/mcp/server.test.ts` (4, in-memory transport). Smoke: `npx tsx scripts/mcp-smoke.mts --read` spawned the server over stdio; on Fort Payne it returned 4 years, 8 sheets, 9 tiles, and the nearest tile read gave AUTO REP plus 3 tank marks.
  - [ ] 7.4 Write a Playwright smoke test: a showcase address loads in under 3 s, shows at least one pin, and its popup opens. _Req 7.1_
  - [~] 7.5 Deploy work, code side done 2026-11-22:
    - `UpstashStore` is a REST pipeline client. `sharedStore` uses Upstash when it is configured, uses memory locally, and **refuses to run on Vercel** without a shared store.
    - The per-IP rate limit now lives in the shared store. If the store is down, requests are allowed; the model budget still fails closed.
    - The API moved from `api/` to `src/api/`. `scripts/build-vercel.mts` bundles each handler with esbuild into `.vercel/output` (Build Output API v3) and adds security headers.
    - Why the bundling: deploying raw `api/*.ts` would crash in production, because the extensionless imports and JSON imports do not resolve under Node ESM.
    - Smoke-tested the bundles from an unrelated working directory:
      - geocode returned 200;
      - sheets returned 200 (Pittsburgh: 3 years, 9 sheets);
      - read streamed `plan` then `paused` with the budget set to 0;
      - read with `VERCEL=1` and no KV returned 502 (fails closed).
    - **Change on 2026-11-22: Vercel blocked Nidhi's team** ("exceeded fair use limits"), so the deploy moved to **Render** (`render.yaml`).
      - The site is a free static site that never sleeps.
      - The API is a free web service. It sleeps after 15 minutes idle, and its cold start is 30–60 s.
      - `src/server/nodeServer.ts` reuses the same handlers, with CORS restricted to `ALLOWED_ORIGINS`. It binds to loopback unless `HOST` is set.
      - `build-index` now streams the zip with yauzl, so no system `unzip` is needed. Its output is byte-identical to before. It peaks at about 440 MB RSS, so the heap is capped at 300 MB.
      - `fetch-data` downloads the inputs.
      - `REQUIRE_SHARED_STORE=1` makes the API fail closed without Upstash.
      - Smoke-tested the bundled server on loopback: health, geocode with CORS, sheets, and read (`plan` then `paused` with the budget at 0).
    - The Upstash database was created by Nidhi.
    - Kept as an alternative: the Vercel prebuilt path.
    - **Live on 2026-11-22** at https://ghost-lot.onrender.com (API: https://ghost-lot-api.onrender.com). The first Upstash token pasted was the read-only one (NOPERM on INCRBY); replaced with the standard token.
    - External checks after the fix: Fort Payne at 100 m read 9 of 9 tiles live (8, then `more`, then resumed from cache to `done`); the rate limit returned 429 from the 31st request in a minute.
    - Judging runs Dec 16, 2026 to Jan 29, 2027, so the API must stay warm for weeks. `.github/workflows/keep-warm.yml` pings `/api/health` every 10 minutes; one free service running all month uses at most 744 of Render's 750 free hours. On the site, `ensureAwake` (`src/ui/api.ts`) starts waking the API when the landing page opens, and shows "Waking the ghosts…" if a lookup has to wait. While Render wakes, it serves its own loading page without CORS headers, so the client retries `/api/health` for up to 2 minutes instead of failing.
    - Spoof test re-run after the `cf-connecting-ip` fix: a fake `X-Forwarded-For` now gets 429, and a faked `CF-Connecting-IP` is rejected by Cloudflare with 403.
    - **Found by the spoof test:** a fake `X-Forwarded-For` got past the rate limit, because Render sits behind Cloudflare and keeps the client's value first. `clientKey` now prefers `cf-connecting-ip`, which Cloudflare overwrites. Re-run the spoof test after the next deploy.

    Original task: Deploy to Vercel. Before the repo goes public, rotate the Groq key and set it as a server environment variable. _Req 8.1_

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
