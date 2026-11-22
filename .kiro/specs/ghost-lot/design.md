# Design: Ghost Lot

## Overview

Ghost Lot is a web app with a thin server. The browser renders today's map with the warped historic sheets on top. The server does four jobs: geocoding, finding sheets, reading hazards with the vision model, and caching. A one-time offline build turns mapsnap's 132 MB IIIF bundle into a small spatial index of sheet footprints.

```
 browser ──address──► /api/lookup ──► geocoder (US Census)
    │                     │
    │                     ├──► sheet index (static, built offline from mapsnap)
    │                     │
    │                     └──► tile planner ──► cache hit? ──► findings
    │                                              │ miss
    │                                              ▼
    │                                   tile.loc.gov IIIF crop
    │                                              ▼
    │                         vision pass 1 (general) ─► pass 2 (tanks, if needed)
    │                                              ▼
    │                                      findings → cache
    ◄──── pins + sheets + risk card (streamed per tile) ────┘
```

## Technology choices

| Concern | Choice | Why |
|---|---|---|
| Frontend | Vite + React + TypeScript | Fast to build, static deploy. |
| Map | MapLibre GL JS with OpenStreetMap-based vector tiles | Free, and mapsnap's attribution model is already OSM. |
| Historic overlay | `@allmaps/maplibre` (`WarpedMapLayer`), fed mapsnap's IIIF Georeference Annotations | Verified in task 1.1: the latest npm version is `1.0.0-beta.44` (MIT, updated 2026-10-01). The API is `new WarpedMapLayer()`, then `map.addLayer(layer)`, then `layer.addGeoreferenceAnnotationByUrl(url)`. It takes a whole AnnotationPage, which is mapsnap's format. Its README says it was built for MapLibre 5, but the package itself depends on `maplibre-gl ^6.6`, so the project pins `maplibre-gl 6.19.0` (checked in task 1.2). It is a beta, so pin the exact version. |
| Server | TypeScript serverless functions (Vercel) | One repo, one deploy, free tier. |
| Geocoding | US Census Geocoder only (`/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json`) | Verified in task 1.1: it is free and needs no key. "2425 Gault Ave N, Fort Payne, AL" returned one match at `x -85.700932, y 34.465402`. Read `result.addressMatches[0].coordinates`, plus `matchedAddress`. **Nominatim fallback dropped:** its usage policy allows at most 1 request per second, asks for a proxy and a cache, and bars its use in vibe-coded and LLM-generated apps unless the developer has made an informed choice. The app is US-only, so Census is enough. |
| Vision | Groq `qwen/qwen3.8-27b` through an OpenAI-compatible client | Tested in the spike. It is the only vision-capable model on this key. The model id is in config so it can be swapped. **Free-tier limits: 8,000 tokens per minute and 1,000 requests per day (headers read in task 1.1), plus 200,000 tokens per day (a 429 response body seen in task 4.3). The daily token cap binds first, at about 80 tile reads per day.** One tile reports about 1,350 tokens of usage, but 2,100–3,300 tokens were taken off the per-minute budget. That works out to about 2–3 tile readings per minute, so a live 150 m lookup of 4–12 tiles takes several minutes. See "Throughput" below. |
| CORS | Browser fetches go directly to mapsnap and LoC | Verified in task 1.1: `data.mapsnap.org` annotations and `tile.loc.gov` `info.json` and image tiles all return `access-control-allow-origin: *`. LoC image tiles also send `cache-control: max-age=31536000`. |
| Cache | Vercel KV (or Upstash Redis) keyed by tile, model and prompt version, plus committed JSON for showcase addresses | Repeat lookups are free, and the demo never depends on the model. |
| PDF | Client-side print stylesheet plus `window.print()` | No server PDF dependency. |
| Tests | Vitest + fast-check (property-based tests) + Playwright (one end-to-end smoke test) | PBT fits the geometry code. |

## Data pipeline (offline, `scripts/build-index`)

1. Download `mapsnap-v2.0-loc.zip` (132 MB) and `items.tsv` from `data.mapsnap.org/runs/v2.0/`.
2. Keep only volumes with `status` = `published` and `year` ≤ 1930.
3. For each annotation, record:
   - `sheetId` (the IIIF image id),
   - `item`, `year`, `city`, `state`,
   - the control points and transformation type,
   - the footprint polygon in lon/lat (the SVG selector mapped through the placement),
   - its bbox.
4. Write one gzipped JSON per state (`index/<ST>.json.gz`) holding the sheets and a packed R-tree (`flatbush`) of their bboxes. The expected total is tens of MB, served statically.
5. Write `index/states.json`, a state bbox lookup, so the server loads only one state's index per request.

The index never stores images. Images always come from `tile.loc.gov` at request time.

**Built index (task 3):**
- The build produced 27,332 volumes, 261,792 sheets and 13 MB gzipped.
- Each row holds only `[item, idx, year, bbox]`. The query fetches `data.mapsnap.org/runs/v2.0/iiif/loc/<item>.main.iiif.json` for the matching volumes and clips exactly.

**House numbers changed since the maps were made.** "2425 Gault Av" on the 1927 Fort Payne map is about 1.3 km from today's "2425 Gault Ave N". The app must locate an address by its geocoded coordinates only. It must never match an address to the old map's printed house numbers.

The Census geocoder also fuzzy-matches: it turned "300 Gault Ave N" into "300 GAULT AVE S". This is why Requirement 1.1 shows the matched address back to the user.

## Coordinate math (`src/geo/`)

- **Pixel ↔ lon/lat:** use Allmaps' own `ProjectedGcpTransformer` (`@allmaps/project`) with `@allmaps/annotation`'s `parseAnnotation`, and do not write our own transform math. This was decided in task 2. The reasons:
  - Pins must land exactly where the warped overlay is drawn, and the overlay uses this transformer.
  - It fits transforms in Web Mercator, not raw degrees. A similarity fit in degrees would stretch east–west, because a degree of longitude is shorter than a degree of latitude.
  - It handles the image y-axis pointing down.
  - mapsnap v2.0 emits only `polynomial` order 1 (4–5 control points) and `helmert` (2 control points). The Fort Payne 1927 volume has 7 of the first and 5 of the second. `parseSheets` refuses any other type with `UnsupportedTransformError`.
- **Lon/lat to pixel** is used to cut the search radius out of a sheet. The circle is mapped into pixels and clipped against the sheet's mask (Sutherland–Hodgman). Both supported transforms are affine, so the circle stays convex.
- **Distance:** haversine, in metres.
- Property-based test invariants are listed in Testing strategy.

## Tile planner (`src/server/tiles.ts`)

For each sheet that intersects the search radius:

1. Map the radius circle into sheet pixels and clip it to the sheet's selector polygon.
2. Cover the clipped area with 1250 × 1250 px tiles at native resolution, with a 100 px overlap. This is the size the spike tested. At native resolution a 1920s sheet is roughly 5–8k px a side, so a 150 m radius usually needs about 4–12 tiles.
3. Each tile key is `sheetId:x:y:w:h`. The image URL is `<sheetId>/<x>,<y>,<w>,<h>/full/0/default.jpg`.

## Vision passes (`src/server/vision.ts`)

**Pass 1 (general hazards).** This uses the prompt from `eval/vision_eval.py`, with the class definitions and the "do not count" list. It returns `{hazards:[{class, map_text, bbox?}]}`.
- The spike model did not return pixel boxes. Pass 1 asks for a rough position ("top-left", "center" and so on) and maps that to the tile's ninth.
- The pin is therefore accurate to about a third of a tile, roughly 30–50 m at native scale.
- The pin popup always shows the whole tile with the read text, so the user can find the exact spot.

**Pass 2 (tanks).** This uses the prompt from `eval/tank_probe.py`. It runs when pass 1 returns AUTO or FUEL, or when pass-1 text contains "GARAGE", "FILLING" or "OIL".
- It returns a count and a description of where the marks are.
- Each tank is added as a FUEL finding, unless pass 1 already reported a FUEL finding for that tile.

**Parsing.**
- Remove `<think>` blocks and code fences.
- Extract the first JSON object and validate it with `zod`.
- If parsing fails, retry once at temperature 0, then mark the tile `unread`.

**Rate limits.**
- The spike hit Groq 429 responses at about 1 request every 2 s.
- Use one worker queue per deployment, with exponential backoff (20 s, 40 s, 60 s) on 429.
- Stream progress to the client with server-sent events.

**Throughput.** On the free tier, the 8,000 tokens-per-minute limit caps reading at about 2–3 tiles per minute, before pass 2 runs. The design handles this in four ways:
1. Showcase addresses are precomputed and cached (Requirement 7.1), so the demo never waits on the model.
2. A live lookup streams pins as each tile finishes and shows "reading sheet 3 of 8" with an estimated wait.
3. A live lookup reads the tiles nearest the address first, so the most relevant pins arrive first.
4. A paid Groq tier, or another provider, can be dropped in through `MODEL_ID` and the base URL, with no code changes.

**Versioning.** The cache key includes `MODEL_ID` and `PROMPT_VERSION`. Changing either one invalidates the cache.

## API

- `GET /api/geocode?q=` returns `{lat, lon, matched}`.
- `GET /api/sheets?lat&lon&r=150` returns the sheets that intersect the radius (ids, years, annotation URLs) and the tile plan.
- `GET /api/read?tiles=` returns a server-sent-event stream of `{tile, status, findings[]}`.
- `GET /api/showcase` returns the precomputed showcase results.

All endpoints:
- validate input with `zod`,
- rate-limit by client IP (sliding window in KV),
- reject a radius above 400 m.

## UI

- **Landing:** an address box, three showcase chips (e.g. "Fort Payne, AL — 1927"), and one line explaining the app.
- **Results:** a full-screen map, with the historic layer fading in over about 1.5 s on first load (this is the demo moment). The layout includes:
  - a year picker and an opacity slider,
  - ghost pins that glow by class (FUEL amber, AUTO red, INDUSTRIAL violet, RAIL grey), each with its own icon,
  - a side drawer holding the risk card.
- **Pin popup:** the tile image with a highlighted region, the class, the read text (labelled as an AI reading), the year and the distance.
- **Halloween theme:**
  - fog vignette at the map edges,
  - ghost-shaped pin glyphs,
  - parchment texture on the drawer,
  - copy tone "what used to haunt this block".
- **Motion:** the theme must not reduce legibility. It respects `prefers-reduced-motion`.

## Content (`src/content/hazards.json`)

This is fixed text per class, reviewed by the owner, never generated:

- a title,
- typical contaminants (e.g. FUEL: petroleum hydrocarbons, benzene, lead from leaded gasoline; INDUSTRIAL: solvents and metals; RAIL: creosote, metals; AUTO: solvents and waste oil),
- questions to ask,
- links to the EPA Brownfields program pages.

*Source each contaminant claim before launch (task 6.2).*

## Security and privacy

- The Groq key lives only in a server environment variable. The `.env` file is in `.gitignore`, and the repo ships `.env.example`. **The key pasted in chat during the spike must be rotated before this repo is made public.**
- The app only reads public-domain scans and ODbL data.
- Addresses are not logged. The cache key is tile-based, not address-based.
- Pin popups show only images from `tile.loc.gov`.
- The CSP restricts `img-src` to that host and the basemap host.

## Attribution and licences

- **mapsnap annotations:** ODbL. Credit "mapsnap" and "© OpenStreetMap contributors". If the index derived from mapsnap is published, it is a derived database and carries ODbL too.
- **Sheet images:** Library of Congress, Sanborn Maps Collection. 1930 and earlier is treated as public domain.
- **Repository code:** MIT licence (the hackathon requires an OSI licence that GitHub can detect).

## Error handling

| Case | Behaviour |
|---|---|
| Geocode miss | Message plus spelling hint (Requirement 1.2). |
| No sheets | Message plus nearest covered place (Requirement 1.4). |
| Tile fetch fails (`IncompleteRead` was seen in the spike) | Retry 3 times with backoff, then show the tile as `unread`. |
| Model 429 | Queue and back off. The UI shows "reading sheet 3 of 8". |
| Unparseable output | Retry once, then `unread`. The risk card flags the reading as incomplete. |

## Testing strategy

**Property-based tests (fast-check):**
- Pixel → lon/lat → pixel round-trips:
  - within 0.5 px on the real Fort Payne sheets,
  - within 5 cm on the ground on random synthetic sheets.

  The synthetic bound is in metres because, on very fine sheets (0.02 m/px), floating-point error in the Mercator solve reaches about 1 px (2 cm). That is still about 100 times smaller than mapsnap's typical 3 m placement error.
- Haversine is symmetric, never negative, and zero only for identical points.
- The tile planner's tiles cover every pixel of the clipped radius, tiles overlap by 100 px or more, and no tile extends past the image bounds.
- The banned-phrase filter passes any string built from `hazards.json` content.
- The findings merge is idempotent (merging the same tile twice changes nothing).

**Unit tests:**
- The parser handles `<think>` blocks, code fences and invalid JSON.
- The pass-2 trigger rule.

**Eval regression (`eval/`):**
- The 20 labeled crops run against the current prompt and model.
- The run fails if class recall drops below 0.80 or any false positive appears on the 12 hazard-free crops.
- A Kiro hook runs this eval whenever a prompt file changes.

**End to end (Playwright):** load a showcase address, see at least one pin, and open its popup.

## Kiro usage plan (for the judges' write-up)

- **Specs:** this requirements/design/tasks set drives implementation.
- **Steering:**
  - `product.md` (audience and the no-overclaiming tone),
  - `tech.md` (stack and conventions),
  - `safety-language.md` (banned phrases and disclaimer wording).
- **Hooks:**
  - on save of `src/server/prompts/*`, run the eval regression,
  - on save of `src/geo/*`, run the property-based tests,
  - on save of UI copy, run the banned-phrase lint.
- **MCP:** a small local `ghost-lot` MCP server exposing `find_sheets(lat, lon, r)` and `read_tile(tileKey)`, so Kiro agents can explore the data and debug readings during development.
- **Kiro Crew:** a multi-agent precompute run for the showcase addresses:
  - a planner agent picks the tiles,
  - reader agents run the passes in parallel,
  - a skeptic agent re-checks every finding against the image and flags disagreements for a human.

  This is the story for the Best Kiro Crew App bonus.
- **Property-based testing:** the geometry invariants listed in Testing strategy.

## Open questions

1. Is the Allmaps MapLibre plugin (a beta) stable enough to warp 4–12 sheets at once on a phone? Task 1.1 confirmed the package and its API but not the rendering: the agent's browser was unavailable. The first check of task 6.1 is to render `https://data.mapsnap.org/runs/v2.0/iiif/loc/sanborn00045_004.main.iiif.json` (Fort Payne 1927) with the plugin. The fallback is Allmaps' tile server, or a pre-rendered XYZ tile set for the showcase cities only.
2. Showcase addresses: Fort Payne, AL 1927 (Gulf Refining and Standard Oil tank yard) is confirmed from the spike. The other two should come from bigger, recognisable cities, picked in task 7.1.
3. EPA comparison (stretch): Envirofacts or ECHO access is not verified yet.
