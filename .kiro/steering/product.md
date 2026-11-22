---
inclusion: always
---

# Product: Ghost Lot

Ghost Lot answers one question for a US street address: what used to stand on or near this block that could have left contamination behind?

It lays the Library of Congress Sanborn fire-insurance maps (1867–1930) over today's streets using mapsnap's georeferencing. A vision model then reads the sheets for four hazard classes: FUEL, AUTO, INDUSTRIAL and RAIL. Each finding appears as a "ghost pin" with the original map crop beside it.

## Who it is for

Homebuyers, renters, community gardeners and small developers. These are people who would otherwise need a paid Phase I environmental site assessment to learn a site's history. Assume they are not experts: explain abbreviations, write plain sentences, and avoid jargon.

## The rules that matter most

1. **Leads, not findings.** Ghost Lot never says a property is contaminated. It says what the old map shows and what to ask next. See `safety-language.md`.
2. **Show the evidence.** Every pin links to the actual map crop it came from, so the user can check it. Model-read text is always labelled as an AI reading.
3. **Unread is not clear.** A tile the model failed to read is never reported as hazard-free. The risk card says the reading is incomplete.
4. **Credit the sources.** The Library of Congress, mapsnap and OpenStreetMap contributors are credited on every map view.

## Scope

- Version 1 covers US addresses only, with sheets dated 1930 or earlier.
- Version 1 has no accounts, no payments and no EPA comparison (that is a stretch goal).
- When a request goes beyond this scope, say so and point to the spec instead of quietly adding the feature.

## Hackathon context

The app is built for Kiroween 2026 (Frankenstein category, plus the Best Kiro Crew App bonus). Submissions are due Dec 4, 2026 at 2:00 PM PT. The demo must work end to end without live model calls (precomputed showcase addresses).

The Halloween theme ("what used to haunt this block") should make the map easier to read, never harder.

## Source of truth

- Requirements: #[[file:.kiro/specs/ghost-lot/requirements.md]]
- Design: #[[file:.kiro/specs/ghost-lot/design.md]]
- Tasks: #[[file:.kiro/specs/ghost-lot/tasks.md]]
