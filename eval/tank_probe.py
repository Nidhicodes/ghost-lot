"""Focused second pass: ask only about gasoline-tank marks on tiles that contain garages, plus negative controls."""
import base64, json, os, re, time, urllib.request

PROMPT = """This is a crop of a 1920s Sanborn fire insurance map. Gasoline tanks are drawn as a small
circle with the tiny label "G.T." (or "GTS." for several), usually on the sidewalk edge in front of a
garage or filling station. Look carefully at the whole image, including the edges.
Reply with JSON only: {"gasoline_tank_marks": <integer count>, "where": "short description"}"""

TILES = {
    "crops/full/c03_t00.jpg": "has G.T.",
    "crops/full/c04_t00.jpg": "has G.T. x2",
    "crops/c14.jpg": "has GTS. (control, found before)",
    "crops/c02.jpg": "no tank (negative control)",
    "crops/c13.jpg": "no tank (negative control)",
}

for path, truth in TILES.items():
    b64 = base64.b64encode(open(path, "rb").read()).decode()
    body = {"model": "qwen/qwen3.8-27b", "temperature": 0, "messages": [{"role": "user", "content": [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}]}]}
    req = urllib.request.Request("https://api.groq.com/openai/v1/chat/completions", data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + os.environ["GROQ_API_KEY"], "Content-Type": "application/json",
                 "User-Agent": "GhostLotSpike/0.1"})
    for attempt in range(5):
        try:
            out = json.load(urllib.request.urlopen(req, timeout=120))["choices"][0]["message"]["content"]
            break
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(20 * (attempt + 1))
    out = re.sub(r"<think>.*?</think>", "", out, flags=re.S).strip().replace("\n", " ")
    print(path, "| truth:", truth, "| model:", out[:200], flush=True)
    time.sleep(3)
