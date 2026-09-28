# Sources for data/world-2030.json

Every number in `data/world-2030.json` either comes from one of the publications
below or is a documented estimate derived from them. This file says which, for
every field. Retrieval date for everything here: **2026-09-27**.

Two things to know before reading:

1. **"Estimate" is used strictly.** A value is an estimate if it was not lifted
   directly from a published table — including every 0-100 game index, every
   regional aggregate, and everything in the minerals, blocs, alliances and trade
   partner fields. The [Estimates](#estimates) section lists all of them.
2. **The game has no territory, border or claim objects.** Contested territories
   therefore never appear as game objects. Where a publisher's treatment of one
   changes a figure, the [Contested territories](#contested-territories) section
   records the treatment used and the owner's ruling on it.

---

## Retrieved sources

### Population and median age

**UN World Population Prospects 2024**, United Nations Department of Economic and
Social Affairs, Population Division. Published 11 July 2024. The 2026 revision was
postponed to 2027, so the 2024 revision is current.

- Landing page: https://population.un.org/wpp/
- Summary of results: https://population.un.org/wpp/assets/Files/WPP2024_Summary-of-Results.pdf
- File used: `WPP2024_Demographic_Indicators_Medium.csv.gz` (16.5 MB), from
  https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_Demographic_Indicators_Medium.csv.gz
- Variant: **medium**. Columns: `TPopulation1July` (thousands) and `MedianAgePop`,
  rows where `Time = 2030`.
- Also used for the world total (8,569,100,000) and for building the regional
  aggregates from `LocTypeName = Country/Area` rows grouped by their UN subregion.

The UN Data Portal API (`population.un.org/dataportalapi`) now returns HTTP 401 for
data queries, so the bulk CSV is the only open route.

### GDP and baseline growth

**IMF World Economic Outlook, April 2026 — "Global Economy in the Shadow of War"**.
Published 14 April 2026.

- Report: https://www.imf.org/en/publications/weo/issues/2026/04/14/world-economic-outlook-april-2026
- Dataset: https://www.imf.org/external/datamapper/datasets/WEO
- Series used, via the DataMapper API (`https://www.imf.org/external/datamapper/api/v1/<series>`):
  - `NGDPD` — GDP, current prices, billions of US dollars → `gdp2030UsdBn`
  - `PPPGDP` — GDP, current prices, billions of international dollars at PPP → `gdp2030PppBn`
  - `NGDP_RPCH` — real GDP growth, percent change → `baselineGrowth.pathPct` for 2026-2031
  - `WEOWORLD` rows for the world totals
- The WEO projection horizon ends at 2031, which is why the baseline path is
  2026-2031 rather than a longer run.

### Food balance

**FAOSTAT Food Security Indicators**, Food and Agriculture Organization of the
United Nations. Indicator: *Cereal import dependency ratio (percent) (3-year
average)*. Latest period available for almost every nation: **2021-2023**.

- Domain: https://www.fao.org/faostat/en/#data/FS
- File used: `Food_Security_Data_E_All_Data_(Normalized).zip`, from
  https://bulks-faostat.fao.org/production/Food_Security_Data_E_All_Data_(Normalized).zip
- A negative value means a net exporter. Australia is -241.6%, Canada -116.9%,
  Saudi Arabia +89.3%.

The FAOSTAT JSON API (`fenixservices.fao.org/faostat/api/v1`) returned HTTP 521
throughout retrieval; the bulk download host worked.

### Energy balance

**World Bank World Development Indicators**, indicator `EG.IMP.CONS.ZS` — *Energy
imports, net (% of energy use)*. Indicator last updated 13 July 2026; the most
recent value per nation is 2022 or 2023 and `sourceYear` records which.

- Indicator page: https://data.worldbank.org/indicator/EG.IMP.CONS.ZS
- Retrieved via `https://api.worldbank.org/v2/country/all/indicator/EG.IMP.CONS.ZS?format=json&mrnev=1`
- A negative value means a net exporter. Norway is -704%, Japan +87.3%.

### Climate exposure

**ND-GAIN Country Index**, Notre Dame Global Adaptation Initiative. Data through
**2024**; archive published 14 July 2026.

- Index: https://gain.nd.edu/our-work/country-index/
- Download page: https://gain-new.crc.nd.edu/about/download
- File used: `resources-2026-14-07-13h00.zip`, from
  https://gain-new.crc.nd.edu/assets/gain/files/resources-2026-14-07-13h00.zip
- Columns used: `resources/vulnerability/vulnerability.csv` and
  `resources/readiness/readiness.csv`, the `2024` column.
- Vulnerability is 0-1, higher meaning more vulnerable. Readiness is 0-1, higher
  meaning better able to convert investment into adaptation.

### Pandemic preparedness

**Global Health Security Index 2021**, Nuclear Threat Initiative and the Johns
Hopkins Center for Health Security. Published December 2021; the data file is
labelled April 2022. This is the most recent edition; there is no later one.

- Index: https://ghsindex.org/
- File used: https://ghsindex.org/wp-content/uploads/2026/07/2021-GHS-Index-April-2022.csv
- Column used: `OVERALL SCORE`, rows where `Year = 2021`. Scale 0-100.
- Spot-checked on retrieval: United States 75.9 (the highest score awarded),
  Australia 71.1, Germany 65.5, Japan 60.5, China 47.5, India 42.8, Egypt 28.0.
  The published global average is 38.9, and no nation scored above 75.9.

---

## Cited but not used for any number

### Critical minerals

**USGS Mineral Commodity Summaries 2026**, United States Geological Survey.
Published 6 February 2026. This is the authority the minerals fields are meant to
match, and the one a later session should check them against.

- Report: https://pubs.usgs.gov/publication/mcs2026
- PDF: https://pubs.usgs.gov/periodicals/mcs2026/mcs2026.pdf
- Data release: https://data.usgs.gov/datacatalog/data/USGS:69837e43b66b01367d7ec7c7

**Its tables were not read during this session.** The `endowmentIndex`,
`refiningLeverageIndex` and `keyCommodities` fields were curated from general
knowledge of the MCS series' world mine production, reserves and refinery tables.
They are marked as estimates and are the weakest data in the file. See
[Estimates](#estimates).

### Energy direction of travel

**IEA World Energy Outlook 2025**, International Energy Agency. Published
12 November 2025.

- Report: https://www.iea.org/reports/world-energy-outlook-2025
- Overview: https://www.iea.org/reports/world-energy-outlook-2025/overview-and-key-findings

Used only as a directional cross-read — in the Stated Policies Scenario coal and
oil demand peak by 2030 and gas plateaus in the mid-2030s, which is consistent
with treating 2030 energy balances as roughly today's balances rather than
projecting large shifts. No per-nation number in the file comes from it, and the
report itself was not read in full during this session.

---

## Derived values and their formulas

These are reproducible from the retrieved data, but they are not published
figures. All are marked `"estimate"` where the field carries the flag.

### Self-sufficiency indices (food and energy)

```
index = round(50 - 50 * tanh(netImportPercent / 60))
```

0% net imports gives 50. A large net importer tends towards 0, a large net
exporter towards 100. `tanh` compresses the long export tail — Norway's -704% and
Australia's -241.6% both round to 100 — without losing the difference between a
small surplus and a large one. The saturation is deliberate: past roughly 180% net
exports the game does not need more resolution, because absolute surplus size
comes from the nation's production scale, not from this index.

Worked check: Germany -0.4% food → 50. United States -20.3% food → 66.
Egypt +42.8% food → 19. Japan +87.3% energy → 5. Canada -89.6% energy → 95.

### Climate exposure index

```
exposureIndex = round(ndGainVulnerability * 100)
```

A straight rescaling, so the index means exactly what ND-GAIN vulnerability
means. The resulting spread across the roster is narrow (28 for Canada to 49 for
Nigeria) because ND-GAIN vulnerability itself is narrow; the sim is expected to
apply its own multiplier rather than the data pretending to a wider range.

### Pandemic preparedness index

```
preparednessIndex = round(ghsIndex2021)
```

The GHS Index is already a 0-100 scale, so no transformation is applied.

### Baseline growth

```
annualPct   = (product over 2026..2031 of (1 + pathPct/100)) ^ (1/6) - 1
basisPoints = round(annualPct * 100)
```

`basisPoints` exists so the sim can compound the D3 baseline in integer maths
(S5) without ever touching a float.

### Rounding

Populations to the nearest 100,000. GDP to the nearest US$ billion. Every 0-100
game index to a whole number. Growth to one decimal in the data, integer basis
points where the sim consumes it. The game needs shape, not decimals (D8).

### Regional aggregates

Every aggregate field is an estimate. Construction:

- **Membership.** Every UN country or area that is not a modelled nation is
  assigned to exactly one aggregate by its UN subregion, with six deliberate
  overrides where the UN scheme puts a nation somewhere the game would not: Iran
  (UN files it under Southern Asia) and the South Caucasus and Mongolia are moved
  to `rest-of-mena` and `rest-of-eurasia` respectively; Afghanistan stays in
  `rest-of-asia-pacific`. No country is counted twice and none is dropped — the
  board's population reconciles to the WPP 2030 world total to within 0.00%.
- **Population.** Sum of member `TPopulation1July`.
- **GDP.** Sum of member IMF values, then scaled by 1.0234 (nominal) and 1.0143
  (PPP) so that modelled nations plus aggregates equal the IMF world total exactly.
  The scaling absorbs the economies the IMF does not report.
- **Indices.** GDP-weighted means over the members that have the indicator, so a
  small nation with no ND-GAIN or GHS entry does not distort the aggregate.
- **Growth.** Population-weighted mean of member compounded baselines.
- **Minerals, blocs, trade partners.** Hand-written to describe the region, not
  computed.

Aggregates trade and contribute to crisis pools. They are never playable and never
scored.

---

## Estimates

Every value in the file that is not a published figure.

| Field | Applies to | What was assumed | How to improve it |
|---|---|---|---|
| `minerals.endowmentIndex` | all 17 nations, all 6 aggregates | 0-100 index curated from general knowledge of USGS MCS world mine production and reserves; China 80, Australia 100, Japan 5 as anchors | Read the USGS MCS 2026 commodity tables and rebuild the index from share of world production plus share of reserves for a named basket of commodities |
| `minerals.refiningLeverageIndex` | all 17 nations, all 6 aggregates | 0-100 index of refining and processing share, China pinned at 100 as the anchor | Same, using the MCS refinery tables and the IEA Global Critical Minerals Outlook processing shares |
| `minerals.keyCommodities` | all | the commodities each nation is best known for in the MCS series | Replace with every commodity where the nation holds over 5% of world production |
| `blocs` | all 17 nations, all 6 aggregates | treaty and grouping membership as understood at the assistant's 2026 knowledge cutoff; **not retrieved from any organisation's membership page in this session** | Check each against the official membership page (NATO, EU, USMCA, Mercosur, ASEAN, RCEP, CPTPP, AfCFTA, ECOWAS, SACU, COMESA, GCC, EAEU, SCO, OPEC, BRICS, G7, G20, APEC, Quad) and record the retrieval date |
| `alliances` | all 17 nations | formal defence treaties only, same caveat as `blocs` | Same |
| `topTradePartners` | all 17 nations, all 6 aggregates | top three goods partners by recent WTO and UN Comtrade reporting, with partners outside the roster mapped to the aggregate they sit in; **not retrieved in this session** | Pull UN Comtrade or WTO bilateral goods data and regenerate, keeping the mapping-to-aggregate step |
| `food` (Japan) | Japan | 72% cereal import dependency. FAO's published 3-year series for Japan ends at 2007-2009 (76.8%); the estimate is carried from Japan's reported cereal self-sufficiency ratio, flat near 28-30% for two decades | Take Japan's cereal production and domestic supply from the FAOSTAT Food Balance Sheets domain and compute the ratio directly |
| `food.selfSufficiencyIndex`, `energy.selfSufficiencyIndex` | all | the `tanh` mapping above | It is a design choice, not a data gap; change it only with a tunable |
| `climate.exposureIndex`, `pandemic.preparednessIndex` | all | straight rescalings of the published scores | As above |
| every aggregate field | all 6 aggregates | construction described above | Nothing to fix; they are aggregates by design and flagged `"estimate": true` at the top level |
| `baselineGrowth` for aggregates | all 6 aggregates | population-weighted mean of members with an IMF growth path; members without one contribute nothing | Weight by GDP instead, or extend with World Bank Global Economic Prospects for the nations the IMF does not project |

---

## Contested territories

The owner ruled on each of these on **2026-09-27**. The game has no territory,
border or claim objects, so none of this produces anything a player sees; the
rulings decide only which data bucket a population or an output figure lands in,
and what this file says about it.

| Case | Ruling | Effect on the data |
|---|---|---|
| Taiwan | Folded into China's figures, matching UN population practice and departing from IMF practice | China's `population2030` includes the UN's "China, Taiwan Province of China" row and its `gdp2030UsdBn` and `gdp2030PppBn` include the IMF's separate line (US$1,214bn nominal, US$2,709bn PPP in 2030). `rest-of-asia-pacific` excludes it. China's `includes` field records this. China's food, energy, climate and pandemic indices are the mainland values only, because those are indices rather than sums |
| Crimea and the occupied Ukrainian oblasts | Follow each publisher, note the split | The IMF and the UN both report Ukraine and the Russian Federation on internationally recognised borders, and the file uses those figures unadjusted. Ukraine sits inside `rest-of-europe`, so no separately visible figure is affected. Where Russia's own statistical agency includes Crimea, this file does not use that basis |
| Northern Cyprus | Follow each publisher, note the split | The UN reports Cyprus on recognised borders. Cyprus sits inside `rest-of-europe`; no separately visible figure is affected |
| State of Palestine | Counted in `rest-of-mena`, under the publisher's own label | The UN's "State of Palestine" row is included in the aggregate's population |
| Western Sahara | Counted in `rest-of-mena`, under the publisher's own label | The UN's "Western Sahara" row is included in the aggregate's population |
| Kosovo | Counted in `rest-of-europe`, under the publisher's own label | Included where the publisher reports it; the UN WPP 2024 file does not carry a separate row for it, so its population is inside whichever row the publisher used |
| Jammu and Kashmir, Azad Kashmir, Aksai Chin | Follow the IMF and the UN as published, note it, make no reallocation | India's and China's figures are exactly as published. Pakistan sits inside `rest-of-asia-pacific`. No territory was moved between nations, and no figure was adjusted |

The names in this table appear here only. They are never used as, or attached to,
a game object.

---

## Known weaknesses

- **The GHS Index is from 2021 and its methodology is contested.** It scored the
  United States highest in 2021, which the pandemic that preceded it does not
  obviously support. It is used because it is the only per-nation preparedness
  score with full coverage and an open licence. Treat `preparednessIndex` as
  "documented capacity on paper", not "will cope".
- **ND-GAIN vulnerability is a composite of six sectors, not a hazard forecast.**
  A nation can be exposed to severe physical climate change and still score low if
  its institutions are strong. That is the right shape for this game, but it is not
  the same thing as "how much climate damage will arrive".
- **Cereal import dependency is a narrow proxy for food security.** It ignores
  protein, fertiliser, water and calorie composition. It was chosen because it is
  the one food-balance number published consistently for every nation.
- **Net energy imports as a percent of energy use is a 2022-2023 figure applied to
  2030.** The IEA's outlook says the direction of travel is modest to 2030 under
  stated policies, but any nation building out solar, nuclear or LNG capacity fast
  will drift from this number.
- **IMF and UN figures disagree on population for several nations.** This file uses
  the UN for population everywhere and the IMF only for GDP and growth, so the two
  are never mixed inside one field. IMF `LP` was not used.
- **The minerals fields are the weakest data in the file** and are the first thing
  a later session should rebuild from the USGS tables.
- **Blocs, alliances and trade partners were not retrieved.** They are the second
  thing to rebuild, and they matter because starting trust is derived from them.

---

## Regenerating this data

The file was built by a throwaway script from the seven downloads listed above.
The script was not committed: it is Python, and this is a TypeScript project, so a
permanent regenerator belongs in `packages/harness` (lane H). `docs/GAPS.md`
records that.

To rebuild by hand, in order:

1. `https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_Demographic_Indicators_Medium.csv.gz`
   — take `TPopulation1July` and `MedianAgePop` where `Time = 2030`, and the
   `LocTypeName = Country/Area` rows plus their `ParentID` for the aggregates.
   Note that `ParentID` 918 ("Northern America") has no row of its own in the file.
2. `https://www.imf.org/external/datamapper/api/v1/NGDPD`, `.../PPPGDP`,
   `.../NGDP_RPCH` — take the `2030` value and the `2026`-`2031` path. Aggregate
   codes to skip: `ADVEC`, `DA`, `OEMDC`, `EURO`, `EU`, `WE`, `MECA`, `WEOWORLD`
   (keep the last one for the world totals).
3. `https://bulks-faostat.fao.org/production/Food_Security_Data_E_All_Data_(Normalized).zip`
   — filter `Item` containing "Cereal import dependency ratio", take the latest
   `Year` per `Area`.
4. `https://api.worldbank.org/v2/country/all/indicator/EG.IMP.CONS.ZS?format=json&mrnev=1&per_page=400`
5. `https://gain-new.crc.nd.edu/about/download` — the download link carries a
   timestamp in its filename and moves with each release, so scrape the page for
   the `.zip` href rather than hard-coding it.
6. `https://ghsindex.org/global/data/` — the CSV is referenced from the page source
   under `wp-content/uploads/`, and that path also moves. Scrape it.
7. USGS MCS 2026 tables for the minerals fields, and the organisations' own
   membership pages for blocs and alliances — both still to be done.

Snags worth knowing: the UN Data Portal API needs authentication now, the FAOSTAT
JSON API returns 521, and both ND-GAIN and the GHS Index serve their data only
from dated asset paths that change with each release.
