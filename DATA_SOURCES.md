# Research data provenance

This folder contains a small, reproducible public-data extract used for regional context in the classroom prototype. It is intentionally separate from the destination crowd-model training collection.

## Bundled government tourism statistics

`data/official/tourism-state-visits-2023-2024.json` transcribes Table 4.1.2, *State/UT-wise Domestic and Foreign Tourist Visits, 2023–2024*, for the states represented by the EcoVoyage destinations.

- Publisher: Ministry of Tourism, Government of India
- Publication: *India Tourism Data Compendium 2025* (66th edition)
- Primary URL: https://data.tourism.gov.in/mrd/Uploads/tourism_data/India%20Tourism%20Data%20Compendium%202025_1.pdf
- Publication portal: https://data.tourism.gov.in/tourismdata
- Retrieval date: 31 August 2026
- Unit: million visits; values are retained to the three decimal places reported in the source.

These are **state/UT aggregates**, not observations for Munnar, Coorg, Hampi, Rishikesh, Puducherry, or Kaziranga. The application stores them in MongoDB’s `regionalTourismStatistics` collection for policy context and marks every document `modelEligible: false`. They must not be treated as destination visitor counts or used to calculate destination crowd-model accuracy.

## Bundled UNESCO heritage records

`data/official/unesco-world-heritage.json` contains two official records that exactly match project destinations:

| Project destination | Official property | UNESCO ID | Type | Inscribed |
|---|---|---:|---|---:|
| Hampi | Group of Monuments at Hampi | 241bis | Cultural | 1986 |
| Kaziranga | Kaziranga National Park | 337 | Natural | 1985 |

- Publisher: UNESCO World Heritage Centre
- India listing: https://whc.unesco.org/en/statesparties/in
- Property sources: https://whc.unesco.org/en/list/241 and https://whc.unesco.org/en/list/337
- Retrieval date: 31 August 2026

These records are seeded into MongoDB’s `heritageSites` collection by idempotent upsert. The `protectionLevel: 100` used in the application is a transparent local policy rule for maximum conservation safeguarding; it is not a UNESCO measurement or ranking.

## What is needed for valid model evaluation

To replace the synthetic crowd-model demonstration, import at least 30 time-stamped, **destination-level** visitor observations. Each row must identify the individual destination and should be traceable to the destination authority, entry/booking system, or another documented measurement process. Only records deliberately supplied with `"modelEligible": true` are selected for training.

Do not upload personal tourist-behaviour data without consent and an appropriate anonymisation process. Use aggregated or consented interaction data and record the source and collection period in the Admin import form.
