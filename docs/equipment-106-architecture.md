# Proposed 106-item equipment architecture

Status: design draft. Existing taxonomy, training code, reviews and app behavior are unchanged.

## Three interfaces, one versioned taxonomy

The aggregator selects or confirms one of 20 broad categories. The recycler/refurbisher receives detailed AI suggestions across the full 106-code catalog and confirms the correct code. The ERP retains both predictions and final human decisions. Broad categories are our product design, not replacements for the seven official groups.

Source: [CPCB framework, Annexure I](https://eprewaste.cpcb.gov.in/assets/PDF/Framework.pdf), checked 23 September 2026. Readable item names below are sometimes shortened; the source supplies full wording. Scope counts: ITEW 27, CEEW 19, LSEEW 34, EETW 8, TLSEW 6, MDW 10, LIW 2 = 106.

## Broad categories

| ID | App label | Detailed codes |
|---|---|---|
| B01 | Computers and laptops | ITEW1, ITEW2, ITEW3, ITEW4, ITEW9 |
| B02 | Mobile phones and tablets | ITEW5, ITEW15, ITEW19, ITEW20 |
| B03 | Printers and office machines | ITEW6, ITEW7, ITEW8, ITEW10, ITEW11, ITEW21 |
| B04 | Telephones and networking equipment | ITEW12, ITEW13, ITEW14, ITEW16, ITEW17, ITEW18, ITEW22, ITEW23, ITEW26 |
| B05 | UPS and inverters | ITEW24, ITEW25 |
| B06 | Data storage devices | ITEW27 |
| B07 | TVs, monitors and displays | CEEW1, CEEW6, LSEEW34 |
| B08 | Audio, video and cameras | CEEW7, CEEW8, CEEW9, CEEW10, CEEW11, CEEW12, CEEW13, CEEW19 |
| B09 | Fridges, freezers and air conditioners | CEEW2, CEEW4, LSEEW1, LSEEW2, LSEEW3 |
| B10 | Washing, drying and cleaning machines | CEEW3, LSEEW4, LSEEW5, LSEEW16, LSEEW17, LSEEW18 |
| B11 | Kitchen and food appliances | LSEEW6, LSEEW7, LSEEW8, LSEEW9, LSEEW10, LSEEW21, LSEEW33 |
| B12 | Fans, heaters and air purifiers | LSEEW11, LSEEW12, LSEEW13, LSEEW14, LSEEW15, LSEEW30 |
| B13 | Clothing-care and personal-care appliances | LSEEW19, LSEEW20, LSEEW31, LSEEW32, EETW3 |
| B14 | Lamps and lighting equipment | CEEW5, CEEW15, CEEW16, CEEW17, CEEW18 |
| B15 | Solar panels and cells | CEEW14 |
| B16 | Power tools and workshop equipment | EETW1, EETW2, EETW4, EETW5, EETW6, EETW7, EETW8 |
| B17 | Toys, games and sports electronics | TLSEW1, TLSEW2, TLSEW3, TLSEW4, TLSEW5, TLSEW6 |
| B18 | Vending and dispensing machines | LSEEW25, LSEEW26, LSEEW27, LSEEW28, LSEEW29 |
| B19 | Sensors, controls and laboratory instruments | LSEEW22, LSEEW23, LSEEW24, LIW1, LIW2 |
| B20 | Medical equipment | MDW1, MDW2, MDW3, MDW4, MDW5, MDW6, MDW7, MDW8, MDW9, MDW10 |

## Full mapping

| Code | Readable equipment label | Broad category |
|---|---|---|
| ITEW1 | Centralized data processing: Mainframes, Minicomputers | B01 |
| ITEW2 | Personal Computers (Central Processing Unit with input and output devices) | B01 |
| ITEW3 | Laptop Computers (Central Processing Unit with input and output devices) | B01 |
| ITEW4 | Notebook Computers | B01 |
| ITEW5 | Notepad Computers | B02 |
| ITEW6 | Printers including cartridges | B03 |
| ITEW7 | Copying Equipment | B03 |
| ITEW8 | Electrical and Electronic Typewriters | B03 |
| ITEW9 | User Terminal and Systems | B01 |
| ITEW10 | Facsimile | B03 |
| ITEW11 | Telex | B03 |
| ITEW12 | Telephones | B04 |
| ITEW13 | Pay Telephones | B04 |
| ITEW14 | Cordless Telephones | B04 |
| ITEW15 | Cellular Telephones | B02 |
| ITEW16 | Answering System | B04 |
| ITEW17 | Telecommunications transmission equipment | B04 |
| ITEW18 | BTS components excluding tower | B04 |
| ITEW19 | Tablets, iPad | B02 |
| ITEW20 | Phablets | B02 |
| ITEW21 | Scanners | B03 |
| ITEW22 | Routers | B04 |
| ITEW23 | GPS | B04 |
| ITEW24 | UPS | B05 |
| ITEW25 | Inverter | B05 |
| ITEW26 | Modems | B04 |
| ITEW27 | Electronic Data Storage Devices | B06 |
| CEEW1 | Television sets, including LCD and LED televisions | B07 |
| CEEW2 | Refrigerator | B09 |
| CEEW3 | Washing Machine | B10 |
| CEEW4 | Air Conditioners, excluding centralized air-conditioning plants | B09 |
| CEEW5 | Fluorescent and other mercury-containing lamps | B14 |
| CEEW6 | Screen, Electronic Photo Frames, Electronic Display Panel, Monitors | B07 |
| CEEW7 | Radio Sets | B08 |
| CEEW8 | Set Top Boxes | B08 |
| CEEW9 | Video Cameras | B08 |
| CEEW10 | Video Recorders | B08 |
| CEEW11 | Hi-Fi Recorders | B08 |
| CEEW12 | Audio Amplifiers | B08 |
| CEEW13 | Other equipment for recording/reproducing sound or images and distribution through telecommunications | B08 |
| CEEW14 | Solar Panels/Cells, Solar Photovoltaic Panels/Cells/Modules | B15 |
| CEEW15 | Luminaires for fluorescent lamps except household luminaires | B14 |
| CEEW16 | High-intensity discharge lamps, including pressure sodium and metal-halide lamps | B14 |
| CEEW17 | Low-pressure sodium lamps | B14 |
| CEEW18 | Other lighting/equipment for spreading or controlling light, excluding filament bulbs | B14 |
| CEEW19 | Digital Camera | B08 |
| LSEEW1 | Large cooling appliances | B09 |
| LSEEW2 | Freezers | B09 |
| LSEEW3 | Other large food refrigeration and storage appliances | B09 |
| LSEEW4 | Clothes dryers | B10 |
| LSEEW5 | Dishwashing machines | B10 |
| LSEEW6 | Electric cookers | B11 |
| LSEEW7 | Electric stoves | B11 |
| LSEEW8 | Electric hot plates | B11 |
| LSEEW9 | Microwaves and microwave ovens | B11 |
| LSEEW10 | Other large cooking and food-processing appliances | B11 |
| LSEEW11 | Electric heating appliances | B12 |
| LSEEW12 | Electric radiators | B12 |
| LSEEW13 | Other large room, bed and seating heating appliances | B12 |
| LSEEW14 | Electric fans | B12 |
| LSEEW15 | Other fanning, exhaust ventilation and conditioning equipment | B12 |
| LSEEW16 | Vacuum cleaners | B10 |
| LSEEW17 | Carpet sweepers | B10 |
| LSEEW18 | Other cleaning appliances | B10 |
| LSEEW19 | Sewing, knitting, weaving and textile-processing appliances | B13 |
| LSEEW20 | Irons and other clothing-care appliances | B13 |
| LSEEW21 | Grinders, coffee machines and container opening or sealing equipment | B11 |
| LSEEW22 | Smoke detectors | B19 |
| LSEEW23 | Heating regulators | B19 |
| LSEEW24 | Thermostats | B19 |
| LSEEW25 | Automatic hot-drink dispensers | B18 |
| LSEEW26 | Automatic hot/cold bottle or can dispensers | B18 |
| LSEEW27 | Automatic solid-product dispensers | B18 |
| LSEEW28 | Automatic money dispensers | B18 |
| LSEEW29 | Other automatic product dispensers | B18 |
| LSEEW30 | Indoor air purifiers | B12 |
| LSEEW31 | Hair dryers | B13 |
| LSEEW32 | Electric shavers | B13 |
| LSEEW33 | Electric kettles | B11 |
| LSEEW34 | Electronic displays | B07 |
| EETW1 | Drills | B16 |
| EETW2 | Saws | B16 |
| EETW3 | Sewing machines | B13 |
| EETW4 | Equipment for machining and processing wood, metal and other materials | B16 |
| EETW5 | Riveting, nailing, screwing and related tools | B16 |
| EETW6 | Welding, soldering and related tools | B16 |
| EETW7 | Spraying, spreading, dispersing and related liquid/gas treatment equipment | B16 |
| EETW8 | Mowing and gardening tools | B16 |
| TLSEW1 | Electric train and car racing sets | B17 |
| TLSEW2 | Handheld video-game consoles | B17 |
| TLSEW3 | Video games | B17 |
| TLSEW4 | Computers for biking, diving, running, rowing and similar activities | B17 |
| TLSEW5 | Sports equipment with electrical/electronic components | B17 |
| TLSEW6 | Coin-slot machines | B17 |
| MDW1 | Radiotherapy equipment and accessories | B20 |
| MDW2 | Cardiology equipment and accessories | B20 |
| MDW3 | Dialysis equipment and accessories | B20 |
| MDW4 | Pulmonary ventilators and accessories | B20 |
| MDW5 | Nuclear medicine equipment and accessories | B20 |
| MDW6 | In-vitro diagnostic laboratory equipment and accessories | B20 |
| MDW7 | Analysers and accessories | B20 |
| MDW8 | MRI, PET, CT and ultrasound equipment and accessories | B20 |
| MDW9 | Fertilization test equipment and accessories | B20 |
| MDW10 | Other electrical medical prevention, screening, diagnosis, monitoring and treatment equipment and accessories, including devices with potential sex-selection features | B20 |
| LIW1 | Gas analysers | B19 |
| LIW2 | Equipment having electrical and electronic components (laboratory instruments group) | B19 |

## Ambiguities and fallback

The broad prediction is a suggestion, not a hard filter on the detailed assessment. A wrong broad result must not prevent the buyer or detailed model from selecting another family. Preserve both original and corrected values.

- **ITEW5:** Provisional default only: pen/slate devices map here; keyboard-based notepad computers may map to B01. Confirm form and intended function.
- **ITEW17:** Broad telecom definition overlaps audio/video; verify intended function.
- **CEEW13:** Broad audio/video definition overlaps telecommunications; verify intended function.
- **CEEW6:** Electronic displays overlap LSEEW34; retain unresolved alternatives until confirmed.
- **LSEEW34:** Electronic displays overlap CEEW6; appearance cannot decide the detailed code.
- **LSEEW19:** Sewing equipment overlaps EETW3; confirm detailed code from specifications/context.
- **EETW3:** Sewing equipment overlaps LSEEW19; confirm detailed code from specifications/context.
- **LSEEW21:** Packaging equipment may route to B16 instead of B11; check primary function.
- **LIW2:** Very broad wording within laboratory instruments; do not use as a catch-all for all electronics.
- **MDW10:** Intended medical use requires documentation; ordinary phones/tablets must not automatically receive this code.

Use needs_review when evidence is insufficient. Mixed lots require separate line items before final quantities and prices are assigned. Parts-only photos retain component descriptions and an optional parent-equipment code; do not force a bare board or motor into a whole-equipment label. Out-of-scope is a workflow state, not a claim that the model has learned reliable unknown detection.

## Storage contract

- equipment_taxonomies: version, source URL, checked date and publication status.
- equipment_categories: taxonomy version, detailed code, display name and official group.
- broad_categories and category_mappings: versioned broad labels, default mappings and alternatives.
- listing_items: listing ID, confirmed broad category, optional confirmed detailed code, quantity, unit, condition, review status and taxonomy version. Detailed code remains null until resolved.
- photos: object-storage key, MIME type, hash, uploader, listing/item link and timestamps. Photos remain outside database rows.
- assessments: immutable model/provider version, taxonomy version, input photo IDs, suggested categories, scores if available, observations, uncertainties and timestamp. Model scores are not interchangeable or verified probabilities.
- review_events: assessor identity/role, previous and new category, evidence and timestamp. Preserve prediction history.
- commercial records: asking price, offers, agreed price and settlement separately, each with currency, integer minor-unit amount, unit basis and timestamps. No category implies a price.
- organisations and memberships: organisation-scoped access; ERP global visibility restricted to authorised administrators.
- dataset_versions: permitted photo selections, reviewed labels, physical-device groups and fixed split manifests; never train directly on changing live listings.

## Training and rollout

1. Review and approve these product categories and exceptions.
2. Audit existing labelled photos against the mapping; do not auto-accept pending photos.
3. Gather representative data for all broad groups, including Indian conditions and photographed physical units. Catalog coverage does not imply training coverage.
4. Train and evaluate the broad classifier separately from detailed API assessment. Existing ITEW/CEEW images cover only part of this catalog.
5. Add structured detailed assessment with allowed codes and explicit unknown/needs-review output; validate against the full catalog and ask for model plates/specifications where necessary.
6. Connect suggestions, confirmation, offers and ERP audit records; evaluate before enabling automated decisions.

No training, API upload or live app modification was performed for this design task.
