---
inclusion: fileMatch
fileMatchPattern: ["src/ui/**/*", "src/content/**/*", "src/server/prompts/**/*", "README.md", "*.md"]
---

# Safety language

Ghost Lot talks about real addresses where people live. Overclaiming could mislead a buyer or unfairly hurt an owner. These rules apply to every UI string, generated text, PDF export, README line and demo script.

## Banned about a specific place

Never use these words or phrases to describe a specific address, lot or block:

- "contaminated", "contamination at" (as a claim), "toxic", "poisoned", "unsafe", "dangerous", "polluted"
- "has a leaking tank", "there is a tank here", or any present-tense claim about today
- "guaranteed", "certified", "verified safe", "clean"

The lint in task 6.5 enforces this list. Keep this list and the lint's word list identical.

## Say this instead

| Instead of | Write |
|---|---|
| "This lot is contaminated." | "A 1927 fire-insurance map shows a gasoline filling station on this block." |
| "There's an underground tank here." | "The 1927 map marks gasoline tanks about 20 m from this address." |
| "This area is safe." | "The maps we could read show no hazard land uses within 150 m. Older or newer uses would not appear here." |
| "Garage found." | "Commercial garage (AI reading — check the image)." |

## Always include

- **Past tense, plus the year and the source.** Write "In 1927, the map shows…", not "There is…".
- **The disclaimer** on every results view and in every PDF: "These are historical leads from old maps, not findings. Map placement is usually accurate to about 10 feet but is sometimes wrong. Only an environmental assessment or testing can show whether a site is contaminated."
- **An incomplete-reading notice** whenever any tile in the radius is unread.

## Contaminant and health statements

- Statements about contaminants or health come only from `src/content/hazards.json`. Each one carries a cited source, and the owner reviews them. Never let a model write them.
- Do not give medical, legal or financial advice. Point to "ask whether a Phase I environmental site assessment was done" and to the EPA Brownfields pages.

## Tone

- Write calm, factual, plain English.
- Halloween wording such as "what used to haunt this block" or "ghost pins" may set the mood in headings, but must never replace the factual line underneath.
