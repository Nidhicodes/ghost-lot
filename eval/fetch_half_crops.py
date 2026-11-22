"""Fetch the 20 eval regions at exactly 2x downscale (2500 px of scan -> 1250 px image), same centres as crops/cNN.jpg."""
import json, os, re, sys, time, urllib.request

SHEETS = sys.argv[1]  # sheets.json from the feasibility spike (sid + selector per crop)
OUT = "crops/half"
os.makedirs(OUT, exist_ok=True)
meta = {}
for i, s in enumerate(json.load(open(SHEETS))):
    pts = [tuple(map(float, p.split(","))) for p in re.findall(r"[\d.]+,[\d.]+", s["selector"]["value"])]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    x0, y0 = int(max(0, cx - 1250)), int(max(0, cy - 1250))
    url = f"{s['sid']}/{x0},{y0},2500,2500/1250,/0/default.jpg"
    meta[f"c{i:02d}"] = {"sid": s["sid"], "x": x0, "y": y0, "w": 2500, "h": 2500}
    fn = f"{OUT}/c{i:02d}.jpg"
    if os.path.exists(fn) and os.path.getsize(fn) > 20000:
        continue
    for attempt in range(5):
        try:
            b = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "GhostLot/0.1"}), timeout=150).read()
            open(fn, "wb").write(b)
            print(fn, len(b), flush=True)
            break
        except Exception as e:
            print(fn, "retry", attempt, type(e).__name__, flush=True)
            time.sleep(5 * (attempt + 1))
json.dump(meta, open(f"{OUT}/regions.json", "w"), indent=1)
print("DONE", flush=True)
