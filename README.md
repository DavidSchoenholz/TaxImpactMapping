# Hamilton Property Tax Impact, 2021

A one-page website that shows how 2021 property tax bills changed from 2020 across Hamilton's 15 wards. The data covers about 186,000 properties.

The page includes:

- **Headline numbers:** the typical change in tax bill, the typical 2021 bill, and the share of properties paying more.
- **Ward by ward:** a bar chart and a map, both switchable between measures. Click a ward to highlight it everywhere on the page.
- **How big were the changes?:** how many properties saw each size of change.
- **Look up a property:** search by address or roll number.
- **All wards:** a sortable table.

The map shows a "coming soon" box until the ward boundary file is added (see below).

There is also a **property map** (`map.html`, linked from the top of the main page). It colours every property, and you can switch between these layers:

- **Tax increase ($)** and **Tax increase (%)**: red for bills that went up, blue for bills that went down, grey for no change.
- **Assessed value**: darker means a higher value.
- **2021 tax bill**: darker means a bigger bill.
- **Effective tax rate**: the bill as a percent of assessed value. This picks out farms (lowest rate), homes (about 1.2%) and apartments, shops and industry (2.5% or more).

Click a property for its details. The legend shows how many properties fall in each colour. Ward outlines are drawn on top once the ward file is added. The property map shows a "coming soon" box until the property shapes file is added (see below).

---

## Changing words, settings and colours (no coding needed)

| What you want to change | File | Where |
|---|---|---|
| Title, subtitle, source note | `js/config.js` | top of the file |
| Which measure the ward chart opens on | `js/config.js` | `defaultWardMetric` |
| The measures in the drop-down | `js/config.js` | `WARD_METRICS` (delete a line to hide one) |
| Ward names (e.g. "Ward 1 – Chedoke-Cootes") | `js/config.js` | `WARD_NAMES` |
| Map starting position, colour steps | `js/config.js` | `MAP` |
| Property map layers, their names and descriptions | `js/config.js` | `PROPERTY_LAYERS` |
| Property map file name, roll-number column, dot size | `js/config.js` | `PROPERTY_MAP` |
| **Any colour** | `css/style.css` | the block at the very top |

To edit a file on GitHub, open it, click the ✏️ pencil icon, make your change and click **Commit changes**.

Tips:
- Keep the quotes around text: `title: "My title",`
- Keep the comma at the end of each line.
- Colours are hex codes such as `#2a78d6`. You can pick one at <https://htmlcolorcodes.com>.
- If the page goes blank after an edit, a missing quote or comma is the usual cause. Undo the last change.

---

## Adding the shapefile (ward boundaries)

Browsers can't read shapefiles directly, so convert it to GeoJSON first. This is free and needs no installs:

1. Go to <https://mapshaper.org>.
2. Drag in **all** the shapefile pieces together (`.shp`, `.shx`, `.dbf`, `.prj`).
3. *(Optional, makes the page faster)* Click **Simplify** and drag the slider to about 10%.
4. Click **Console** and type `-proj wgs84`, then press Enter. This puts the map in the right coordinates.
5. Click **Export**, choose **GeoJSON**, and save the file.
6. Rename it to `wards.geojson` and upload it into the `data` folder of this repository.

The map should then appear.

The map matches shapes to wards using a column in the shapefile that holds the ward number. If that column isn't called `WARD`, change `joinField` in `js/config.js` to its name. You can see the column names in mapshaper by clicking a shape with the **i** tool.

## Adding the property shapes (for the property map)

The property map needs one shape per property: either parcel outlines or address points. Each shape must carry the property's roll number. The map uses the roll number to look up that property's tax data.

1. Convert the file to GeoJSON in WGS84, the same way as the ward file above. For parcels, simplify more (about 5%), because 186,000 outlines make a large file.
2. Name it `properties.geojson` and upload it into the `data` folder.
3. If the roll-number column isn't called `ROLL_NO`, change `joinField` under `PROPERTY_MAP` in `js/config.js`. Dashes and spaces in roll numbers are ignored. The tax data uses 15-digit roll numbers that start with `2518`.

Under the map, a line reports how many shapes were linked to tax data. Shapes with no match are drawn grey.

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
  - `data/properties.json`: the list used by the property lookup.

If the CSV changes, re-run it (this needs Python with pandas):

```bash
python3 scripts/build_data.py
```

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
map.html            the property map page
js/app.js           page logic (charts, map, search)
js/map.js           property map logic
js/common.js        formatting helpers shared by both pages
css/style.css       colours (top) and layout
data/               processed data (+ raw CSV in data/raw)
scripts/            data preparation script
vendor/             Chart.js and Leaflet, bundled so the site needs no outside services
```
