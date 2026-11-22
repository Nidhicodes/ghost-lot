"""Stage the skeptic pass (task 7.2): download each showcase tile once and write a manifest of the findings on it.

Usage: python3 scripts/skeptic-prep.py <out_dir>
Writes <out_dir>/<showcase>/tNN.jpg and <out_dir>/<showcase>/manifest.json.
"""
import json, os, re, sys, time, urllib.request

CELLS = [["top-left", "top", "top-right"], ["left", "center", "right"], ["bottom-left", "bottom", "bottom-right"]]
out_root = sys.argv[1]


def fetch(url, path):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "GhostLot/0.1 (skeptic pass)"})
            data = urllib.request.urlopen(req, timeout=60).read()
            open(path, "wb").write(data)
            return
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))

for name in sorted(os.listdir("src/content/showcases")):
    if not name.endswith(".json"):
        continue
    show = json.load(open(f"src/content/showcases/{name}"))
    out = os.path.join(out_root, show["id"])
    os.makedirs(out, exist_ok=True)
    tiles, items = {}, []
    for f in show["findings"]:
        url = f["tileUrl"]
        if url not in tiles:
            tiles[url] = f"t{len(tiles):02d}.jpg"
            path = os.path.join(out, tiles[url])
            if not os.path.exists(path):
                fetch(url, path)
                time.sleep(1)
        x, y, w, h = map(int, re.search(r"/(\d+),(\d+),(\d+),(\d+)/", url).groups())
        col = min(2, max(0, int((f["px"][0] - x) / (w / 3))))
        row = min(2, max(0, int((f["px"][1] - y) / (h / 3))))
        # native-resolution close-up of the named cell, with half a cell of margin, so small text is legible
        zx, zy = int(max(0, x + (col - 0.5) * w / 3)), int(max(0, y + (row - 0.5) * h / 3))
        zw, zh = int(2 * w / 3), int(2 * h / 3)
        zoom = f"z{len(items):02d}.jpg"
        zpath = os.path.join(out, zoom)
        if not os.path.exists(zpath):
            zurl = re.sub(r"/\d+,\d+,\d+,\d+/[^/]+/0/default\.jpg$", f"/{zx},{zy},{zw},{zh}/!1100,1100/0/default.jpg", url)
            fetch(zurl, zpath)
            time.sleep(0.5)
        items.append({"id": f["id"], "image": tiles[url], "closeup": zoom, "class": f["class"], "mapText": f["mapText"],
                      "pass": f["pass"], "cell": CELLS[row][col], "distanceM": f["distanceM"]})
    json.dump({"showcase": show["id"], "title": show["title"], "year": show["year"], "findings": items},
              open(os.path.join(out, "manifest.json"), "w"), indent=1)
    print(show["id"], len(items), "findings on", len(tiles), "tiles")
