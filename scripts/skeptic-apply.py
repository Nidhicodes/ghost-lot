"""Apply the reviewed skeptic decisions (task 7.2) to the showcase files.

Usage: python3 scripts/skeptic-apply.py <skeptic_dir>
Copies each verdicts.json into eval/skeptic/, then drops or corrects showcase findings per
eval/skeptic/decisions.json. Decisions are made by a person after reading the verdicts; this
script never acts on a verdict alone.
"""
import json, os, shutil, sys

src = sys.argv[1]
decisions = json.load(open("eval/skeptic/decisions.json"))
for show_id, d in decisions.items():
    shutil.copy(os.path.join(src, show_id, "verdicts.json"), f"eval/skeptic/{show_id}.verdicts.json")
    path = f"src/content/showcases/{show_id}.json"
    show = json.load(open(path))
    ids = {f["id"] for f in show["findings"]}
    for fid in [*d.get("drop", {}), *d.get("mapText", {})]:
        if fid not in ids:
            sys.exit(f"{show_id}: decision refers to unknown finding {fid}")
    show["findings"] = [f for f in show["findings"] if f["id"] not in d.get("drop", {})]
    for f in show["findings"]:
        if f["id"] in d.get("mapText", {}):
            f["mapText"] = d["mapText"][f["id"]]["to"]
    show["skeptic"] = {"checked": len(ids), "dropped": len(d.get("drop", {})), "corrected": len(d.get("mapText", {})),
                       "log": f"eval/skeptic/{show_id}.verdicts.json"}
    json.dump(show, open(path, "w"), indent=1)
    print(show_id, f"{len(ids)} -> {len(show['findings'])} findings")
