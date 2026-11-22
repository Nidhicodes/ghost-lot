---
inclusion: fileMatch
fileMatchPattern: ["src/server/prompts/**/*", "src/server/vision*", "eval/**/*"]
---

# Vision prompts and the eval set

## What the feasibility spike proved (Nov 21–22, 2026)

Model: `qwen/qwen3.8-27b` on Groq. Test set: 20 crops from 1927 maps of Albertville and Fort Payne, AL, labeled by the agent.

- **Pass 1 (general hazards)** found 15 of 18 hazard classes and gave 0 false positives on the 12 hazard-free crops.
- **The misses were all small marks:**
  - "G.T." gasoline-tank marks on c03 and c04,
  - a "LUMBER STGE" label cut off at the edge of c05.
- **Higher resolution did not fix the tank misses.** Re-running pass 1 on full-resolution 1250 px tiles still missed them.
- **Pass 2 (tanks only)** fixed them. It returned the correct count on all 5 images: 1 on c03, 2 on c04, 2 on c14, and 0 on both negative controls.
- **Transcriptions are loose.** The model wrote "VULCANIZING" where the map says "NO VULCANIZING", and garbled one garage label. Trust the class, not the quoted text.

Logs: `eval/crops/run_a.txt`, `run_b.txt`, `run_fullres.txt` and `run_tankprobe.txt`.

## Rules for changing prompts

1. Prompts live in `src/server/prompts/` as versioned files. Any change bumps `PROMPT_VERSION`.
2. After any prompt change, run the eval. It must keep:
   - class recall ≥ 0.80,
   - **zero** false positives on the 12 hazard-free crops,
   - the pass-2 tank counts on c03, c04 and c14.
3. Keep the "do not count" list in pass 1: dwellings "D", private auto sheds "A", stores, offices, churches, hotels and banks. Every crop contains "A" sheds, so dropping this rule floods the results with false garages.
4. A street named "Railroad" is not tracks. Keep that instruction (crop c13 tests it).
5. Ask for JSON only. Still parse defensively: strip `<think>` blocks and ``` fences, take the first JSON object, and validate it with zod.
6. Do not add few-shot images from the eval set to the prompt. That would leak the answers into the test.

## Labels

- The labels in `eval/crops/labels.md` were written by one labeler (the agent). Rows c00–c03 were corrected after an image-order mix-up.
- Nidhi is to hand-check at least 5 crops in task 5.5. Until then, treat the eval as directional, not final.
