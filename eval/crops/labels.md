# Ghost Lot gold labels

Note: rows c00-c03 were re-assigned on 2026-11-21 after the agent found it had viewed those four images in a different order than assumed. The sheet column for those rows is approximate. (hand-read by the agent, 1927 Sanborn crops)

Hazard classes (environmental history worth flagging):
- FUEL: gasoline tank (G.T.), filling station, oil storage
- AUTO: public/commercial garage, auto repair, parts dept
- INDUSTRIAL: blacksmith, foundry, gas engine, machine shop, mill, gin, lumber, cotton/oil mill
- RAIL: rail yard, freight depot, tracks
- NONE: dwellings (D), private auto sheds (A), churches, stores, offices

| crop | sheet | street labels | hazards present (verbatim map text) | class |
|---|---|---|---|---|
| c02 | Albertville 1927 s1 | Main, Hambick | none; dwellings + private auto sheds "A" | NONE |
| c01 | Albertville 1927 s2 | Hambick | none; dwellings + private auto sheds "A" | NONE |
| c03 | Albertville 1927 s3 | Broad, McCord Av | "GARAGE CAP. 40 CARS" x2; "G.T." (gasoline tank) at 330-331; King Hotel, Bank, Christian Church | AUTO, FUEL |
| c00 | Albertville 1927 s4 | Olive, Rd. | none; dwellings + one private auto shed | NONE |
| c04 | Albertville 1927 s5 | Main, McDonald Av | "GARAGE CAP 40 CARS"; "FORD GARAGE CAP. 52 CARS"; "PARTS DEP'T"; "G.T." x2; "GAS ENG."; "BL.SM." (blacksmith); Cotton W.Ho.; Freight & Passenger Depot; N.C. & St.L. R.R. tracks | AUTO, FUEL, INDUSTRIAL, RAIL |
| c05 | Albertville 1927 s6 | Carlisle, Glover, Scott Av | mostly dwellings; at crop edges: "LUMBER STG.E", "...ILL" (mill, cut off), "SALES" (raised 3'), "GAS ENG CABINET" (cut off, bottom-left) | INDUSTRIAL (edge, partial text) |
| c06 | Albertville 1927 s7 | Marshall, Jackson | none; dwellings + private auto sheds | NONE |
| c07 | Albertville 1927 s8 | Jackson, Baltimore Av | dwellings; top edge: "BOTTLING PLANT" with "POWER ELEC", "W. HO." (partly cut off) | INDUSTRIAL (edge) |
| c08 | Fort Payne 1927 s1 | Shields, Godfrey Av | none; dwellings + private auto sheds | NONE |
| c09 | Fort Payne 1927 s2 | Forest Av, Alabama Av, Martin (Fourth), Dobbs | none; dwellings + private auto sheds | NONE |
| c10 | Fort Payne 1927 s3 | Gault Av, Page (Ninth), Anderson (Eighth) | "GULF REFINING CO." with "IRON GASOL. TANKS", "PUMP HO", "BBL. W.HO."; "STANDARD OIL CO." with "IRON TANK"; "COTTON W.HO."; "G.T."; "A.G.S. R.R." tracks; "WARE HO." | FUEL, RAIL |
| c11 | Fort Payne 1927 s4 | Grand Av, Gault Av, Connor, York St | "ISBELL CANNING CO." (power: steam, fuel: coal); "GASOLINE FILLING STA." + "VULCANIZING" + "GT"; "GARAGE CAP. 5 CARS"; "A.G.S. R.R." | FUEL, AUTO, INDUSTRIAL, RAIL |
| c12 | Fort Payne 1927 s5 | Forney (Fifth), Martin | none; dwellings + private auto sheds | NONE |
| c13 | Fort Payne 1927 s6 | Railroad, Warehouse Lane | none; dwellings, "Railroad House", hen house ("Railroad" is a street name here, not tracks) | NONE |
| c14 | Fort Payne 1927 s7 | Vine | "GARAGE CAPCY 50 CARS"; "GARAGE CAPCY 25 CARS"; "GASOL. FILLING STATION" + "GTS." (gasoline tanks); "BUILDG MATERIALS WARE HO."; "A.G.S. R.R." tracks | AUTO, FUEL, RAIL |
| c15 | Fort Payne 1927 s8 | Park | "A.G.S. R.R." tracks; mostly empty lots; hotel kitchen at top edge | RAIL |
| c16 | Fort Payne 1927 s9 | Park, Azo Av | none; dwellings + private auto sheds | NONE |
| c17 | Fort Payne 1927 s10 | Forest Av | none; dwellings + private auto sheds | NONE |
| c18 | Fort Payne 1927 s11 | Park | none; dwellings + private auto sheds | NONE |
| c19 | Fort Payne 1927 s12 | Grand Av, Shields (Washington) | none; dwellings + private auto sheds | NONE |

## Summary
- 20 crops: 12 NONE (c00, c01, c02, c06, c08, c09, c12, c13, c16, c17, c18, c19); 8 with at least one hazard class (c03, c04, c05, c07, c10, c11, c14, c15). c15 is rail-only; c05 and c07 hazards are cut off at the crop edge.
- FUEL: c03, c04, c10, c11, c14 (5). AUTO: c03, c04, c11, c14 (4). INDUSTRIAL: c04, c05(edge), c07(edge), c11 (4). RAIL: c04, c10, c11, c14, c15 (5).
- Hard cases for a model: "A" = private auto shed (NOT a commercial garage); "G.T." / "GTS." = gasoline tank abbreviations; "Railroad" street name vs actual R.R. tracks (c13); hazards cut off at crop edges (c05, c07); "BL.SM." = blacksmith.
- Labeler: the agent (Claude), from the images. A second human pass on 3-4 crops is advisable before using this as gold.
