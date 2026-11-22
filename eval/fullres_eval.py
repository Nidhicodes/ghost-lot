"""Run the vision prompt on native-resolution 2x2 tiles of the crops whose tanks were missed."""
import glob, time

exec(open("vision_eval.py").read().split("\ng = gold()")[0])  # reuse PROMPT, ask, parse

for cid in ["c03", "c04"]:
    union = set()
    for f in sorted(glob.glob(f"crops/full/{cid}_t*.jpg")):
        pred, hz = parse(ask(f))
        pred = pred or set()
        union |= pred
        print(f, sorted(pred), [h.get("map_text") for h in hz], flush=True)
        time.sleep(2)
    print("==>", cid, "union", sorted(union), flush=True)
