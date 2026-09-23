# ITEW1–27 training readiness

Snapshot of `python -m ml.data readiness --scope itew`, 22 September 2026. Re-run the command for current figures; this file is not updated automatically. CEEW1–19 are deferred and excluded. No ITEW model has been trained, so there are no accuracy results.

**Status: not ready to split.** Two blockers:

1. **ITEW3, ITEW4, ITEW5 and ITEW7 have no accepted images** (0 of the 3 independent groups needed). These are definition questions, not a photo shortage:
   - **Laptop (ITEW3) vs notebook (ITEW4):** no dataset rule separates them; 15 photos are waiting.
   - **Notepad computers (ITEW5):** it is still undecided whether handheld PDAs (Newton), pen slates (Stylistic 1000) and convertible Tablet PCs count; 9 photos are waiting.
   - **Copiers (ITEW7):** desktop multifunction printers were accepted as ITEW6. It is still undecided whether floor-standing office copier-MFPs (Xerox, Konica Minolta, Ricoh, Canon) and the two desktop Kyocera M2040dn units are ITEW7; 8 photos are waiting.
2. **Label conflict:** ITEW12_01 (telephone) and ITEW14_04 (cordless telephone) are both accepted but share the OLX search page `https://www.olx.in/mobiles_c1411/q-landline-phone`. The splitter treats a shared source page as possible leakage, so it cannot place these two different labels in one group. To resolve it, either give one image an item-specific source URL or remove one from the training set. Don't weaken the safeguard.

## Per-class counts

"Groups" counts independent units after merging shared device groups, identical images and shared source pages. The split needs at least 3 per class, which is a programmatic minimum, not evidence of useful accuracy.

| Class | Downloaded | Accepted | Pending | Rejected | Groups |
|---|---|---|---|---|---|
| ITEW1 | 9 | 8 | 0 | 2 | 8 |
| ITEW2 | 7 | 5 | 2 | 3 | 4 |
| ITEW3 | 7 | 0 | 7 | 3 | **0** |
| ITEW4 | 8 | 0 | 8 | 2 | **0** |
| ITEW5 | 9 | 0 | 9 | 1 | **0** |
| ITEW6 | 7 | 7 | 0 | 3 | 7 |
| ITEW7 | 8 | 0 | 8 | 2 | **0** |
| ITEW8 | 10 | 10 | 0 | 0 | 10 |
| ITEW9 | 10 | 9 | 1 | 0 | 8 |
| ITEW10 | 8 | 8 | 0 | 2 | 8 |
| ITEW11 | 10 | 10 | 0 | 0 | 7 |
| ITEW12 | 8 | 8 | 0 | 2 | 7 |
| ITEW13 | 8 | 5 | 3 | 2 | 5 |
| ITEW14 | 7 | 5 | 2 | 3 | 4 |
| ITEW15 | 9 | 9 | 0 | 1 | 8 |
| ITEW16 | 10 | 10 | 0 | 0 | 10 |
| ITEW17 | 10 | 7 | 3 | 0 | 7 |
| ITEW18 | 10 | 8 | 1 | 1 | 8 |
| ITEW19 | 8 | 8 | 0 | 2 | 6 |
| ITEW20 | 8 | 8 | 0 | 2 | 5 |
| ITEW21 | 8 | 7 | 1 | 2 | 7 |
| ITEW22 | 7 | 7 | 0 | 3 | 6 |
| ITEW23 | 10 | 10 | 0 | 0 | 9 |
| ITEW24 | 10 | 10 | 0 | 0 | 10 |
| ITEW25 | 9 | 9 | 0 | 1 | 9 |
| ITEW26 | 9 | 8 | 1 | 1 | 8 |
| ITEW27 | 9 | 8 | 1 | 1 | 8 |
| **Total** | **233** | **184** | **47** | **39** | |

37 of the 270 ITEW candidates failed to download (HTTP 403/404/410). Those rows are rejected and cannot be recovered from their links.

## Duplicates and merged groups

- **Exact duplicates:** none.
- **Possible near duplicates (dHash distance 5 or less):** ITEW17_05 and CEEW11_09 (distance 4) were compared visually. They are a video codec and a cassette deck, so this is a false positive.
- **Same photograph:** ITEW13_01 is a crop of ITEW13_04. They share a device group, and 13_01 remains pending.
- **Merged for leakage safety (informational):**
  - Shared OLX search pages: ITEW2_05+07, ITEW15_02+05, ITEW19_01+02, ITEW19_03+04, ITEW20_02+05+08+09, ITEW22_01+08.
  - Shared device groups or collection pages: ITEW9_01+05, ITEW11_02+03+04+07, ITEW23_07+08.

  These merges reduce the number of independent groups, particularly for ITEW20 (8 images but 5 groups).

## Pending reviews (47)

The pending items are in ITEW2, 3, 4, 5, 7, 9, 13, 14, 17, 18, 21, 26 and 27. Each has its open question in `review_note`. Besides the definitions above, the recurring questions are:

- whether stock or product images are acceptable (ITEW2_10, 14_03, 14_05, 21_04, 26_03, 27_10)
- thin clients (ITEW9_10, ITEW2_06)
- payphone booths where the phone is barely visible (ITEW13_06, 13_10)
- video-codec classification (ITEW17_07–09)

## Data-quality limits before trusting any result

- **Small data:** about 5–10 independent units per class. With 15% test and 15% validation groups, most classes will have 1–2 test groups, so per-class scores will be very uncertain.
- **Brand concentration:**
  - ITEW16: all Panasonic Easa-Phone
  - ITEW19: all iPads
  - ITEW11: all Siemens
  - ITEW23: all Garmin
  - ITEW24: 9 of 10 APC

  A model can learn the brand instead of the category.
- **Source mismatch:** many categories (ITEW1, 8–11, 16–18, 23) are mostly museum or non-Indian marketplace photos. Collected e-waste photographed in India will look different.
- **Rights and condition:** label acceptance does not establish photo rights, Indian origin or discarded condition.
