# Ghost Lot

**What used to haunt your address?**

Type a US address. Ghost Lot lays the Library of Congress Sanborn fire-insurance maps (1867–1930) over today's streets and reads them with a vision model. It flags old gasoline tanks, filling stations, garages, industry and rail lines on or near your block.

Ghost Lot shows historical leads, not findings. Only an environmental assessment or testing can show whether a site is contaminated.

Built for [Kiroween 2026](https://kiroween.devpost.com/) (Frankenstein category).

**Live demo:** https://ghost-lot.onrender.com. The three showcase places load instantly. A new address is read live, capped at 2 per visitor per day on the free model tier. The API sleeps when idle, so the first live lookup can take up to a minute to wake it.

## How it works

1. **Find the sheets.** The US Census geocoder turns the address into coordinates. A prebuilt index of 261,792 Sanborn sheets dated 1867–1930 finds the ones that cover a circle around that point. The sheets were georeferenced by [mapsnap](https://mapsnap.org/).
2. **Overlay them.** Allmaps warps each sheet onto today's map in the browser.
3. **Read them.** The server cuts the circle into tiles at half resolution, nearest first, and sends each one to a vision model (Gemini 3.5 Flash-Lite). Pass 1 lists FUEL, AUTO, INDUSTRIAL and RAIL uses with the map's own text. When pass 1 sees a garage or fuel, pass 2 counts gasoline-tank marks on the same tile.
4. **Place the pins.** Each finding is mapped back from scan pixels to coordinates with the same Allmaps transform that draws the overlay, so pins sit on the right building. The risk card groups them by distance and lists, from EPA sources, what each past use can leave behind and what to ask next.

Readings are cached for 90 days. A daily budget stops live reading before the free quota runs out, and the overlay keeps working when reading is paused.

## How Kiro was used

Everything Kiro uses is committed in `.kiro/`:

- **Spec** (`.kiro/specs/ghost-lot/`): requirements, design and a dated task plan, kept up to date as decisions changed (for example the switch from Groq to Gemini, and from Vercel to Render).
- **Steering** (`.kiro/steering/`): product, tech and structure are always loaded. `safety-language.md` loads for UI, content and prompt files. `vision-prompts.md` loads for prompts and the eval.
- **Hooks** (`.kiro/hooks/`):
  - editing a vision prompt re-runs the 20-crop eval, and the hook fails on a recall drop or a false alarm;
  - editing geometry code re-runs the geometry property tests;
  - editing user-facing copy re-runs the banned-phrase lint.
- **MCP server** (`.kiro/settings/mcp.json`): a local `ghost-lot` server with `find_sheets` and `read_tile`, so the agent can check a lookup or re-read one tile from chat while debugging.
- **Property-based tests** (fast-check) for the geometry, tile planner and finding merges.

## Run locally

Needs Node 22+ and Python 3 for the eval.

```sh
npm install
cp .env.example .env   # set MODEL_BASE_URL, MODEL_ID, MODEL_API_KEY; never commit .env
npm run fetch-data && npm run build-index   # one-time, see below
npm run dev            # http://localhost:5173
npm test
npm run eval           # prompt regression gate: about 40 model calls
npm run mcp            # the MCP server on stdio (Kiro starts it from .kiro/settings/mcp.json)
```

## Build the sheet index

```sh
npm run fetch-data     # mapsnap v2.0 items.tsv and the 132 MB annotation zip, into data/raw/
npm run build-index    # about 40 s; writes index/ (13 MB)
```

## Deploy (Render, used for the live demo)

`render.yaml` defines two free services:
- **`ghost-lot`**: the static site, served from Render's CDN. It never sleeps.
- **`ghost-lot-api`**: a small Node server, `scripts/serve.ts`. It downloads mapsnap and builds the index during its own build. On the free plan it sleeps after 15 minutes idle.

1. In the Render dashboard, click **New → Blueprint** and pick this repo.
2. Fill in the secret values when Render asks for them:
   - `MODEL_API_KEY`, `KV_REST_API_URL` and `KV_REST_API_TOKEN` (Upstash);
   - `ALLOWED_ORIGINS`: the site URL;
   - `VITE_API_BASE`: the API URL.
3. Once both URLs exist, set `ALLOWED_ORIGINS` and `VITE_API_BASE` to them, then redeploy both services.

The API binds to `127.0.0.1` unless `HOST` is set. The blueprint sets `HOST=0.0.0.0`, because Render must route public traffic to it. It also sets `REQUIRE_SHARED_STORE=1`, so live reading refuses to run without Upstash.

## Deploy (Vercel, prebuilt; alternative)

The API handlers in `src/api/` are bundled with esbuild into a Vercel Build Output directory, and the sheet index is copied in alongside them. Vercel never compiles TypeScript.

1. Create a free Upstash Redis database: either Vercel Marketplace → Upstash, or upstash.com. Note its REST URL and token. Live reading needs it: on Vercel, `/api/read` refuses to run without a shared store, so the daily model budget cannot be overspent.
2. In the Vercel project settings, set:
   - `MODEL_BASE_URL`, `MODEL_ID` and `MODEL_API_KEY`;
   - `KV_REST_API_URL` and `KV_REST_API_TOKEN`;
   - optionally `READ_BUDGET_PER_DAY` and `LIVE_LOOKUPS_PER_IP_PER_DAY`.
3. Build and deploy from a machine that has `index/` (see above):

```sh
npm run build:vercel                 # typecheck, vite build, bundle functions into .vercel/output
npx vercel deploy --prebuilt --prod  # needs `npx vercel login` and `npx vercel link` once
```

## Data and credits

- Sheet images: Library of Congress, [Sanborn Maps Collection](https://www.loc.gov/collections/sanborn-maps/).
- Georeferencing: [mapsnap](https://mapsnap.org/), annotations under the ODbL. © OpenStreetMap contributors.
- Map rendering: [Allmaps](https://allmaps.org/) and [MapLibre](https://maplibre.org/).

## Licence

Code: MIT (see `LICENSE`). Data derived from mapsnap stays under the ODbL.
