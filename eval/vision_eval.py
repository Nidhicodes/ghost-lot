"""Run a vision model (any OpenAI-compatible endpoint) over the 20 labeled crops and score it against labels.md.

Env: MODEL_BASE_URL (default Groq), MODEL_ID (default qwen/qwen3.8-27b), MODEL_API_KEY (falls back to GROQ_API_KEY).
Gemini: MODEL_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai MODEL_ID=<flash-lite model id>
"""
import base64, json, os, re, sys, time, urllib.request, urllib.error

BASE_URL = os.environ.get("MODEL_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
API_KEY = os.environ.get("MODEL_API_KEY") or os.environ.get("GROQ_API_KEY", "")
MODEL = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("MODEL_ID", "qwen/qwen3.8-27b")
ONLY = sys.argv[2].split(",") if len(sys.argv) > 2 else None
CLASSES = ["FUEL", "AUTO", "INDUSTRIAL", "RAIL"]

PROMPT = json.load(open("../src/server/prompts/prompts.json"))["pass1"]  # run from eval/


def gold():
    g = {}
    for line in open("crops/labels.md"):
        m = re.match(r"\| (c\d\d) \|.*\| ([^|]+) \|\s*$", line)
        if m:
            g[m.group(1)] = {c for c in CLASSES if c in m.group(2)}
    return g


def ask(path):
    b64 = base64.b64encode(open(path, "rb").read()).decode()
    body = {
        "model": MODEL,
        "temperature": 0,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
        ]}],
    }
    req = urllib.request.Request(
        f"{BASE_URL}/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + API_KEY,
                 "Content-Type": "application/json", "User-Agent": "GhostLotSpike/0.1"})
    for attempt in range(8):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=120))
            return d["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:400]
            if e.code == 429:
                wait = float(e.headers.get("retry-after") or 0) or 15 * (attempt + 1)
                print(f"  429, waiting {wait:.0f}s", flush=True)
                time.sleep(min(wait + 1, 90)); continue
            raise SystemExit(f"HTTP {e.code}: {msg}")
    raise SystemExit("rate-limited 8 times")


def parse(text):
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None, []
    try:
        hz = json.loads(m.group(0)).get("hazards", [])
    except json.JSONDecodeError:
        return None, []
    return {h.get("class", "").upper() for h in hz if h.get("class", "").upper() in CLASSES}, hz


g = gold()
ids = ONLY or sorted(g)
tp = fp = fn = 0
rows = []
for cid in ids:
    raw = ask(f"crops/{cid}.jpg")
    pred, hz = parse(raw)
    if pred is None:
        rows.append((cid, sorted(g[cid]), "UNPARSEABLE", raw[:200])); fn += len(g[cid]); continue
    t, f, n = len(pred & g[cid]), len(pred - g[cid]), len(g[cid] - pred)
    tp, fp, fn = tp + t, fp + f, fn + n
    rows.append((cid, sorted(g[cid]), sorted(pred), [h.get("map_text") for h in hz][:6]))
    print(rows[-1], flush=True)
    time.sleep(2)

prec = tp / (tp + fp) if tp + fp else float("nan")
rec = tp / (tp + fn) if tp + fn else float("nan")
print(f"\nMODEL {MODEL}  class-level TP={tp} FP={fp} FN={fn}  precision={prec:.2f} recall={rec:.2f}")
json.dump(rows, open(f"crops/eval_{MODEL.replace('/', '_')}.json", "w"), indent=1)
