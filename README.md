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
- **The extremes** and **Questions only the City can answer** close the page.

The story numbers come from `data/story.json` and `data/classes.json`. Rebuild them with `python scripts/build_story.py` (after `scripts/build_data.py`). It reads the files in `data/source/`.

### Source files (`data/source/`)

| File | What it is |
|---|---|
| `hamilton_tax_2021_with_class.csv` | The 2021 tax file with property class (`TAX_CLASS_PRIMARY`), property code, former municipality, multi-class flag. **Used for the class findings.** |
| `hamilton_rates_by_class_with_ratios.csv`, `hamilton_tax_rates_by_class_2020_2025.csv`, `hamilton_tax_multipliers_by_class_by_year.csv` | Municipal, education and total tax rates by class, from the levy by-laws. |
| `hamilton_annual_tax_increases.csv` | Announced residential increase (from news reports of budgets) and observed median change (from parcel data), by year. |
| `hamilton_observed_change_by_class.csv` | Observed change by class and year (class codes differ between years). Not used yet. |
| `hamilton_tax_impact_2012/2013/2016/2018/2019.csv` and `tax_impact_*_shp.zip` | The City's tax impact data and parcel shapes for earlier years. Not used yet. |

Not yet done: colouring the map lots by property class. The lot files (`data/parcels/`) carry no class, and rebuilding them needs geopandas.

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
- **Zoomed in** (zoom level 14 or closer), it shows every property lot, coloured by how many dollars its tax bill changed. Click a lot for its details.
- **Searching for a property** zooms the map to it and drops a pin.

About 99.7% of properties (185,676) are matched to a lot. Condo buildings are one lot holding many units: the shapefile gives these a 20-digit ARN (the first unit's roll number plus the last 5 digits of the final unit's), and every unit in that range is matched to the lot. On the map a condo lot is coloured by its typical unit and its popup lists the unit count. The 627 properties that can't be matched still show up in the search; they just have no pin.

To change the lot colours, edit `--lot-...` in `css/style.css`. To change the dollar amounts where the colours switch, edit `dollarBreaks` and `billBreaks` in `js/config.js`.

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
