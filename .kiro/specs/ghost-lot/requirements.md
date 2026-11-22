# Requirements: Ghost Lot

## Introduction

Ghost Lot answers one question for a US address: what used to stand on or near this block that could have left contamination behind? It reads the Library of Congress Sanborn fire insurance maps (1867–1930), which mapsnap has already aligned to today's streets. A vision model reads each nearby sheet for hazard land uses: fuel tanks, filling stations, garages, industry and rail. Each finding appears as a "ghost pin" on today's map, with the original map crop beside it and a plain-English list of questions to ask.

The audience is homebuyers, renters, community gardeners and small developers. Today they would need a paid Phase I environmental site assessment to get this history.

Ghost Lot gives leads, not findings. It never states that a property is contaminated.

Hackathon target: Kiroween 2026, Frankenstein category (Library of Congress scans + mapsnap georeferencing + a vision LLM + a modern web map). It also competes for the Best Kiro Crew App bonus. Submission deadline: Dec 4, 2026, 2:00 PM PT.

## Feasibility evidence (spike, 2026-11-21)

- mapsnap v2.0 places 343,403 Sanborn sheets in 7,820 places (ODbL). Its FAQ reports a typical error of about 10 ft, and 88% of placed sheets fall within 25 ft of volunteer hand-placement. Source: https://mapsnap.org/faq
- Sheet images download from `tile.loc.gov` (IIIF). The `loc.gov` search/JSON API returns a Cloudflare 403 to scripts, so the app must not depend on it.
- Vision eval on 20 hand-labeled 1927 crops (Albertville and Fort Payne, AL), model `qwen/qwen3.8-27b` on Groq:
  - General hazard pass: 15/18 hazard classes found, 0 false positives on 12 hazard-free crops.
  - A focused tank pass then found 3/3 missed tank marks with correct counts, and reported 0 tanks on 2 negative controls.
  - Labels were made by one labeler (the agent). N is small. See `eval/`.

## Glossary

- **Sheet**: one scanned page of a Sanborn volume.
- **Placement**: mapsnap's IIIF Georeference Annotation for a sheet (control points from image pixels to lon/lat).
- **Hazard class**: one of FUEL, AUTO, INDUSTRIAL, RAIL.
- **Ghost pin**: a map marker for one hazard finding, linked to its source crop.
- **Search radius**: the area around the address that is examined (default 150 m).

## Requirement 1: Address lookup

**User story:** As a homebuyer, I want to type a US street address and see whether historic maps exist for it, so that I know right away if Ghost Lot can help.

### Acceptance criteria

1. WHEN the user submits an address THEN the system SHALL geocode it to a latitude/longitude and show the matched address back to the user.
2. IF geocoding returns no match THEN the system SHALL say so and suggest checking the spelling, without showing an empty map.
3. WHEN an address is geocoded THEN the system SHALL find every placed sheet whose footprint intersects the search radius, limited to sheets with a volume year of 1930 or earlier.
4. IF no placed sheet intersects the search radius THEN the system SHALL say "No historic fire-insurance maps cover this spot", and SHALL show the nearest covered place and its distance if one is within 25 km.
5. WHEN sheets are found THEN the system SHALL list the volume years available (e.g. 1904, 1911, 1927) and default to the latest one.

## Requirement 2: Historic overlay

**User story:** As a user, I want to see the old map laid over today's street map, so that I can tell exactly which old building stood where.

### Acceptance criteria

1. WHEN sheets are found THEN the system SHALL render them over a modern basemap using the mapsnap placement, warped onto today's streets.
2. The system SHALL provide an opacity slider for the historic layer, ranging from 0 to 100%.
3. WHEN the user picks a different volume year THEN the system SHALL swap the overlay to that year's sheets.
4. The system SHALL credit "Library of Congress, Sanborn Maps Collection", "mapsnap" and "© OpenStreetMap contributors" on the map at all times.

## Requirement 3: Hazard reading

**User story:** As a user, I want the app to read the old map for me, so that I don't need to know the 1920s abbreviations.

### Acceptance criteria

1. WHEN a sheet region within the search radius is processed THEN the system SHALL run a general hazard pass that returns zero or more findings, each with a hazard class, the map text read, and a pixel bounding box on the sheet.
2. WHEN the general pass finds AUTO or FUEL on a tile, or the tile contains any building labelled as a garage or filling station, THEN the system SHALL run a focused tank pass on that tile and add any gasoline-tank marks it finds as FUEL findings.
3. The system SHALL process sheet regions as overlapping tiles at the scan's native resolution, so text on a tile edge appears whole in at least one tile.
4. The system SHALL NOT report private auto sheds (label "A" behind dwellings), dwellings, stores, offices, churches, hotels or banks as hazards.
5. IF the model response cannot be parsed into the finding schema THEN the system SHALL retry once, then mark the tile "unread", and SHALL NOT treat it as hazard-free.
6. The system SHALL cache findings per sheet tile and model version, so a repeat lookup never calls the model again.

## Requirement 4: Ghost pins

**User story:** As a user, I want each hazard shown where it was, with proof, so that I can judge it myself.

### Acceptance criteria

1. WHEN findings exist THEN the system SHALL place one ghost pin per finding, converting its pixel box center to lon/lat through the sheet's placement.
2. WHEN the user opens a ghost pin THEN the system SHALL show the hazard class, the source year, the distance from the address, and the original map crop around the finding.
3. The system SHALL label model-read text as "AI reading — check the image", because model transcriptions can be inexact.
4. The system SHALL style pins by hazard class with distinct colour and icon, and SHALL NOT rely on colour alone.

## Requirement 5: Risk card

**User story:** As a homebuyer, I want a plain-English summary and what to do next, so that I can act on it.

### Acceptance criteria

1. WHEN the analysis completes THEN the system SHALL show a risk card summarising findings by hazard class and distance band (on/adjacent ≤ 30 m, nearby 30–150 m).
2. For each hazard class present, the risk card SHALL list typical contaminants of concern and questions to ask (e.g. "Ask whether a Phase I environmental site assessment was done"), taken from a fixed, reviewed content file rather than generated freely.
3. The risk card SHALL state that findings are historical leads, that the placement is typically accurate to about 10 ft but sometimes wrong, and that only testing can show contamination.
4. IF any tile in the radius is "unread" THEN the risk card SHALL say the reading is incomplete.
5. The user SHALL be able to export the risk card and pins as a one-page PDF.

## Requirement 6: Safety language

**User story:** As the project owner, I want the app never to overclaim, so that nobody is misled or defamed.

### Acceptance criteria

1. The system SHALL NOT use the words "contaminated", "toxic" or "unsafe" about a specific address in any UI string or generated text.
2. The system SHALL show the disclaimer from Requirement 5.3 on every results view and in every PDF export.
3. WHEN text is generated by an LLM for display THEN the system SHALL check it against the banned-phrase list before showing it, and SHALL fall back to the fixed content if the check fails.

## Requirement 7: Demo reliability

**User story:** As the presenter, I want the demo to work on stage even if the free APIs are slow, so that judges see it end to end.

### Acceptance criteria

1. The system SHALL include a precomputed set of at least 3 showcase addresses, with findings and tiles cached, that load in under 3 seconds without calling the model.
2. WHEN a live lookup exceeds the model provider's rate limit THEN the system SHALL queue the tiles, show progress per tile, and keep already-read pins on screen.
3. The system SHALL work in current Chrome, Safari and Firefox on desktop, and on a phone-width (375 px) screen.

## Requirement 7a: Free-tier budget (added 2026-11-22)

**User story:** As the owner, I want the app to run on free model quotas without breaking, so that a burst of visitors cannot take the demo down or run up a bill.

Context: Groq's free tier allows 200,000 tokens per day, about 80 tile reads. One live lookup needs about 10–20 pass-1 reads plus a few pass-2 reads.

### Acceptance criteria

1. The landing page SHALL lead with the precomputed showcase addresses. Live lookup is the second path.
2. The system SHALL keep a shared daily counter of model calls. Live reading SHALL stop once the counter reaches `READ_BUDGET_PER_DAY`, a server-side setting. The counter SHALL reset at the provider's daily reset.
3. The system SHALL allow each client IP at most `LIVE_LOOKUPS_PER_IP_PER_DAY` live lookups that call the model (default 2). Cached tiles never count against either limit.
4. WHEN the budget is exhausted, THEN the system SHALL still geocode the address, show the historic map overlay and list the sheet years, because none of these need the model. It SHALL say plainly that AI reading is paused until the next day and point to the showcase addresses.
5. WHEN the provider returns a daily-quota 429 (`x-should-retry: false`), THEN the system SHALL treat the budget as exhausted for the rest of the day, and SHALL NOT retry in a loop.
6. The model provider SHALL be set entirely by server configuration (`MODEL_BASE_URL`, `MODEL_ID` and `MODEL_API_KEY`), so that switching provider needs no code change.

## Requirement 8: Secrets and access

**User story:** As the owner, I want keys kept out of the repo and browser, so that they cannot be stolen.

### Acceptance criteria

1. The system SHALL read the vision API key only from a server-side environment variable, and SHALL NOT ship it to the browser.
2. The repository SHALL include a `.env.example` and SHALL ignore `.env` in git.
3. The public lookup endpoint SHALL rate-limit by client IP, so that one visitor cannot exhaust the model quota.

## Out of scope (v1)

- Comparison against current EPA records (stretch goal; data access not yet verified).
- Sheets published after 1930 (possible copyright).
- User accounts, saved searches and payments.
- Non-US addresses.
