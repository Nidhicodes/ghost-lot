"""Eval of the shipped reading pipeline on the 20 labeled regions at half resolution.

Pass 1 (general) runs on every crop in crops/half/. Pass 2 (tanks) runs on every crop too, so its
false positives can be measured; the pipeline only *uses* pass 2 where pass 1 flagged AUTO/FUEL
(or read GARAGE / FILLING / OIL). A crop's final classes = pass-1 classes, plus FUEL if a used
pass 2 counted >= 1 tank. Writes crops/half/pipeline_results.json and prints the scores.
"""
import json, re, time

ns = {}
exec(open("vision_eval.py").read().split("\ng = gold()")[0], ns)  # PROMPT, ask, parse, gold, CLASSES
TANK_PROMPT = re.search(r'PROMPT = """(.*?)"""', open("tank_probe.py").read(), re.S).group(1)

ask, parse, gold, CLASSES = ns["ask"], ns["parse"], ns["gold"], ns["CLASSES"]
TRIGGER = re.compile(r"GARAGE|FILLING|OIL", re.I)


def ask_prompt(prompt, path):
    ns["PROMPT"] = prompt  # ask() reads the module-level PROMPT
    return ask(path)


def tank_count(text):
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    m = re.search(r'"gasoline_tank_marks"\s*:\s*(\d+)', text)
    return int(m.group(1)) if m else None


g = gold()
general_prompt = ns["PROMPT"]
MODEL_TAG = re.sub(r"[^A-Za-z0-9.-]+", "_", ns["MODEL"])
PARTIAL = f"crops/half/pipeline_partial.{MODEL_TAG}.jsonl"  # one line per finished crop, so a killed run resumes
rows = {}
try:
    for line in open(PARTIAL):
        cid, row = json.loads(line)
        rows[cid] = row
except FileNotFoundError:
    pass
for cid in sorted(g):
    if cid in rows:
        continue
    path = f"crops/half/{cid}.jpg"
    p1_pred, p1_hz = parse(ask_prompt(general_prompt, path))
    time.sleep(2)
    tanks = tank_count(ask_prompt(TANK_PROMPT, path))
    time.sleep(2)
    p1_pred = p1_pred or set()
    texts = " ".join(str(h.get("map_text", "")) for h in p1_hz)
    triggered = bool(p1_pred & {"AUTO", "FUEL"}) or bool(TRIGGER.search(texts))
    final = set(p1_pred) | ({"FUEL"} if triggered and (tanks or 0) >= 1 else set())
    rows[cid] = {"gold": sorted(g[cid]), "pass1": sorted(p1_pred), "pass1_text": [h.get("map_text") for h in p1_hz][:6],
                 "pass2_tanks": tanks, "pass2_used": triggered, "final": sorted(final)}
    print(cid, json.dumps(rows[cid]), flush=True)
    with open(PARTIAL, "a") as f:
        f.write(json.dumps([cid, rows[cid]]) + "\n")

def score(key):
    tp = fp = fn = 0
    for cid, r in rows.items():
        pred, gl = set(r[key]), set(r["gold"])
        tp, fp, fn = tp + len(pred & gl), fp + len(pred - gl), fn + len(gl - pred)
    return tp, fp, fn

for key in ["pass1", "final"]:
    tp, fp, fn = score(key)
    print(f"{key:6s} TP={tp} FP={fp} FN={fn} recall={tp/(tp+fn):.2f} precision={tp/(tp+fp) if tp+fp else float('nan'):.2f}")
none_crops = [c for c, r in rows.items() if not r["gold"]]
print("false-alarm crops (gold NONE, final non-empty):", [c for c in none_crops if rows[c]["final"]])
print("pass-2 tank counts on NONE crops:", {c: rows[c]["pass2_tanks"] for c in none_crops})
print("pass-2 used on:", [c for c, r in rows.items() if r["pass2_used"]])
print("model:", ns["MODEL"], "at", ns["BASE_URL"])
json.dump(rows, open(f"crops/half/pipeline_results.{MODEL_TAG}.json", "w"), indent=1)
