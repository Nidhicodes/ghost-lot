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
  - [ ] 2.1 Parse the IIIF Georeference Annotation and implement the affine and Helmert transforms with their inverses. Throw on any other transform type. _Req 2.1, 4.1_
  - [ ] 2.2 Implement haversine and the radius-to-pixel clipping against the SVG selector polygon. _Req 1.3_
  - [ ] 2.3 Write property-based tests (fast-check) for the round-trip, haversine and clipping invariants. _Req 4.1_

## Day 3–4 (Nov 24–25): data

- [ ] 3. Sheet index
  - [ ] 3.1 `scripts/build-index`: download the mapsnap v2.0 zip and `items.tsv`, keep only published sheets with a year of 1930 or earlier, and write one gzipped JSON per state plus a flatbush R-tree. _Req 1.3, 1.5_
  - [ ] 3.2 Write `index/states.json` and add a nearest-covered-place lookup. _Req 1.4_
  - [ ] 3.3 Unit test: an address in Fort Payne, AL returns `sanborn00045_004` sheets, and a point in the ocean returns none. _Req 1.3, 1.4_
- [ ] 4. Lookup API
  - [ ] 4.1 Implement `/api/geocode` (US Census), `/api/sheets` and the tile planner, with zod validation, a 400 m radius cap and an IP rate limit. _Req 1, 8.3_
  - [ ] 4.2 Write property-based tests for tile-planner coverage and overlap. _Req 3.3_

## Day 5–6 (Nov 26–27): reading

- [ ] 5. Vision service
  - [ ] 5.1 Implement the pass-1 and pass-2 prompts as versioned files, the parser (strip `<think>` blocks and fences, validate with zod) and the retry-then-`unread` rule. _Req 3.1, 3.2, 3.5_
  - [ ] 5.2 Implement the worker queue with 429 backoff, the tile fetch with 3 retries, and the cache keyed by tile, model and prompt version. _Req 3.6, 7.2_
  - [ ] 5.3 Implement `/api/read` as an SSE stream of per-tile progress. _Req 7.2_
  - [ ] 5.4 Add a Kiro hook: saving any file in `src/server/prompts/*` runs `make eval`, which fails if recall drops below 0.80 or there is any false positive on hazard-free crops. _Req 3_
  - [ ] 5.5 Grow the eval set to about 40 crops by adding one bigger city, such as a 1920s downtown with a rail yard. Nidhi hand-checks 5 of the agent's labels. _Req 3_

## Day 7–9 (Nov 28–30): product

- [ ] 6. Map UI
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
