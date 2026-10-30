# Hamilton Property Tax Impact, 2021

A one-page website that shows how 2021 property tax bills changed from 2020 across Hamilton's 15 wards. The data covers about 186,000 properties.

The page is built around six questions a reader would ask, each with a short answer up front and the evidence under it:

- **Lookup (top of the page):** type an address and get a "receipt": your change in dollars and percent, which group of properties you fall in, and where you rank. The result has a shareable link (`#p=<roll number>`).
- **1 · Taxes went up about 2%. Is that what happened?** For most homes yes (+1.7%), but the city's total only rose 0.65%.
- **2 · Did businesses get a break at homeowners' expense?** They got a break ($9.3M, a provincial education-tax cut), but it didn't move City levy onto homes.
- **3 · Why did some neighbourhoods see 7%?** Homes fall into area rate tiers; about 4,750 homes in eastern Stoney Creek and north-west Glanbrook moved up a tier.
- **4 · If the rate rose 2.5%, why did bills rise 1.7%?** The city-wide rate is only about 76% of a home's bill; a step-by-step breakdown for a typical home.
- **Explore:** a large map you can colour by % change, $ change, 2021 bill or "paid less", with a ranked ward list and a sortable table.
- **5 · Who is quietly paying more each year?** Homeowners, through tax-ratio cuts for apartments and industry: $1.1M in 2021, $14.1M a year by 2025.
- **6 · Was 2021 a normal year?** No: the smallest increase since 2016, before 5.6-5.85% years in 2023-2025.
- **7 · Whose taxes grew most over the decade?** Homes whose value grew fastest: bills +41% for the fastest-growing fifth of homes, +15% for the slowest (2011-2021). The lower city (Wards 1-3) leads.
- **8 · Do houses, townhouses and condos fare differently?** Not in one year; over a decade, condos +17.5%, detached +23%, townhouses +27%, 2-6 unit houses +37%.
- **9 · Are newer subdivisions paying more?** Bigger bills, lower rates: 14,321 homes first taxed after 2012.
- **The extremes** and **Questions only the City can answer** close the page.

The lookup also shows each property's home type and its tax bill every year since 2011.

### Rebuilding the data

1. `python scripts/build_data.py` (needs pandas and geopandas: `pip install pandas geopandas`; takes about 4 minutes). Makes `summary.json`, `properties.json`, `wards.geojson`, the lot files in `data/parcels/` and the per-ward tax histories in `data/history/`. It joins the class file and the 2012-2019 impact files from `data/source/` by roll number (`scripts/history.py`).
2. `python scripts/build_story.py`. Makes `story.json` and `classes.json`.

### Source files (`data/source/`)

| File | What it is |
|---|---|
| `hamilton_tax_2021_with_class.csv` | The 2021 tax file with property class (`TAX_CLASS_PRIMARY`), property code, former municipality, multi-class flag. **Used for the class findings.** |
| `hamilton_rates_by_class_with_ratios.csv`, `hamilton_tax_rates_by_class_2020_2025.csv`, `hamilton_tax_multipliers_by_class_by_year.csv` | Municipal, education and total tax rates by class, from the levy by-laws. |
| `hamilton_annual_tax_increases.csv` | Announced residential increase (from news reports of budgets) and observed median change (from parcel data), by year. |
| `hamilton_observed_change_by_class.csv` | Observed change by class and year (class codes differ between years). Not used yet. |
| `hamilton_tax_impact_2012/2013/2016/2018/2019.csv` | The City's tax impact data for earlier years: tax and assessment for 2011-2013 and 2015-2019, property code. **Used for the history, home types and Questions 7-9.** |
| `tax_impact_*_shp.zip` | Parcel shapes for those years. Not used yet. |

Home types come from the MPAC property code (301 detached, 311 semi, 309 townhouse, 370 condo, 332-336 houses with 2-6 units, 340-341 apartment buildings); the grouping is in `scripts/history.py`. "First taxed" is the first year a roll number shows up as a building (not vacant land) in these files, so it stands in for age only after 2011.

---

## Changing words, settings and colours (no coding needed)

| What you want to change | File | Where |
|---|---|---|
| Title, source note | `js/config.js` | top of the file |
| Which measure the map opens on | `js/config.js` | `defaultMeasure` |
| Ward names (e.g. "Ward 1 – Chedoke-Cootes") | `js/config.js` | `WARD_NAMES` |
| Map starting position, colour steps | `js/config.js` | `MAP` |
| **Any colour** | `css/style.css` | the block at the very top |

To edit a file on GitHub, open it, click the ✏️ pencil icon, make your change and click **Commit changes**.

Tips:
- Keep the quotes around text: `title: "My title",`
- Keep the comma at the end of each line.
- Colours are hex codes such as `#2a78d6`. You can pick one at <https://htmlcolorcodes.com>.
- If the page goes blank after an edit, a missing quote or comma is the usual cause. Undo the last change.

---

## The map

The map comes from the City's **property parcels** shapefile (`data/raw/parcels/`). Each lot is linked to the CSV by its roll number (`ARN` in the shapefile, `ROLL_NO` in the CSV).

- **Zoomed out**, the map shows wards, coloured by whichever measure is picked above the chart. The ward outlines are traced from the lots (there was no ward boundary file), so they are approximate along the edges.
- **Zoomed in** (zoom level 14 or closer), it shows every property lot. Click a lot for its details.
- **Colour by** picks one of ten measures, each for both wards and lots: % change, $ change, paid less, assessed value, 2021 bill, tax rate (bill ÷ value), home type, value growth in the 2016 reassessment, tax change since 2011, and newer homes. Add `?m=<measure>` to the address to open on one, e.g. `?m=long` or `?m=type`.
- **Searching for a property** zooms the map to it and drops a pin.

About 99.7% of properties (185,676) are matched to a lot. Condo buildings are one lot holding many units: the shapefile gives these a 20-digit ARN (the first unit's roll number plus the last 5 digits of the final unit's), and every unit in that range is matched to the lot. On the map a condo lot is coloured by its typical unit and its popup lists the unit count. The 627 properties that can't be matched still show up in the search; they just have no pin.

To change the lot colours, edit `--lot-...` in `css/style.css`. To change the dollar amounts where the colours switch, edit `dollarBreaks`, `billBreaks` and `valueBreaks` in `js/config.js`. Home-type colours are `--type-...`.

---

## Putting the site online (GitHub Pages)

1. In this repository, go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**. Pick the branch that holds these files, folder `/ (root)`, and click **Save**.
3. After a minute or two, the site will be live at `https://<your-username>.github.io/TaxImpactMapping/`.

## Previewing on your own computer

Double-clicking `index.html` won't load the data, because browsers block that. Instead, in this folder run:

```bash
python3 -m http.server
```

Then open <http://localhost:8000>.

---

## How the data is prepared

- `data/raw/hamilton_tax_impact_2021.csv` is the original CSV, unchanged.
- `scripts/build_data.py` cleans it and writes the files the website reads:
  - `data/summary.json`: city and ward statistics, plus the chart data.
  - `data/properties.json`: the list used by the property lookup, with each property's map position.

If the CSV or shapefile changes, re-run it. This needs Python with pandas and geopandas, and takes about 3 minutes:

```bash
pip install pandas geopandas
```

```bash
python3 scripts/build_data.py
```

It also writes the map files:
  - `data/wards.geojson`: ward outlines.
  - `data/parcels/ward-<N>.json`: the property lots for each ward, simplified to about 1 m accuracy.

Cleaning steps:
- 72 blank rows are removed.
- 150 rows that are exact duplicates (same roll number and same values) are removed.
- 5,395 properties with $0 tax in either year, or with no ward (ward 0), are left out of the statistics. They can still be found in the lookup.

"Typical" means the **median**. The median is used rather than the average because a few very large commercial and industrial properties would distort an average.

Assessed values are identical in 2020 and 2021 (the province froze reassessment), so every change in this data comes from tax rates.

## Folder layout

```
index.html          the page
js/config.js        settings you can edit
js/app.js           page logic (charts, map, search)
css/style.css       colours (top) and layout
data/               processed data (raw CSV and shapefile in data/raw)
scripts/            data preparation (build_data.py, which uses parcel_map.py)
vendor/             Chart.js and Leaflet, bundled so the site needs no outside services
```
