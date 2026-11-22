# Ghost Lot

**What used to haunt your address?**

Type a US address. Ghost Lot lays the Library of Congress Sanborn fire-insurance maps (1867–1930) over today's streets and reads them with a vision model. It flags old gasoline tanks, filling stations, garages, industry and rail lines on or near your block.

Ghost Lot shows historical leads, not findings. Only an environmental assessment or testing can show whether a site is contaminated.

Built for [Kiroween 2026](https://kiroween.devpost.com/) (Frankenstein category).

> Status: early setup. See `.kiro/specs/ghost-lot/` for the requirements, design and task plan.

## Run locally

```sh
npm install
cp .env.example .env   # add your GROQ_API_KEY; never commit .env
npm run dev            # http://localhost:5173
npm test
```

## Build the sheet index

```sh
mkdir -p data/raw
curl -o data/raw/items.tsv https://data.mapsnap.org/runs/v2.0/items.tsv
curl -o data/raw/mapsnap-v2.0-loc.zip https://data.mapsnap.org/runs/v2.0/mapsnap-v2.0-loc.zip   # 132 MB
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
