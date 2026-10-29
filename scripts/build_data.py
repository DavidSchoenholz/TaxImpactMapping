"""
Turns the raw CSV into small JSON files the website reads.

Run it again any time the CSV or the parcel shapefile changes:
    python3 scripts/build_data.py

Needs Python 3 with pandas (pip install pandas). The map files also need
geopandas (pip install geopandas); without it they are skipped.
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_CSV = ROOT / "data" / "raw" / "hamilton_tax_impact_2021.csv"
OUT_DIR = ROOT / "data"

# Width of each bar in the "% change" distribution chart, in percentage points.
HISTOGRAM_BIN = 0.5
# Changes beyond these limits are grouped into the first / last bar.
HISTOGRAM_MIN = -5.0
HISTOGRAM_MAX = 8.0


def load():
    df = pd.read_csv(RAW_CSV, dtype={"ROLL_NO": "string"})
    rows_in = len(df)

    # Blank lines at the end of the export.
    df = df.dropna(subset=["ROLL_NO"])
    # Some properties are listed twice, identical apart from OBJECTID.
    df = df.drop_duplicates(subset=[c for c in df.columns if c != "OBJECTID"])
    df["ROLL_NO"] = df["ROLL_NO"].str.replace(r"\.0$", "", regex=True)
    df["WARD"] = df["WARD"].astype(int)

    # Properties with no tax either year (exempt, or ward 0 placeholders) are
    # kept for lookup but left out of the statistics.
    df["TAXED"] = (df["TAXES_2020"] > 0) & (df["TAXES_2021"] > 0) & (df["WARD"] > 0)

    notes = {
        "rows_in_csv": rows_in,
        "rows_after_cleaning": len(df),
        "properties_in_stats": int(df["TAXED"].sum()),
        "untaxed_or_unassigned": int((~df["TAXED"]).sum()),
    }
    return df, notes


def summarise(group):
    pct = group["PERCENT_CHANGE_TAXES"]
    return {
        "properties": int(len(group)),
        "median_tax_2020": round(float(group["TAXES_2020"].median())),
        "median_tax_2021": round(float(group["TAXES_2021"].median())),
        "median_dollar_change": round(float(group["DOLLAR_CHANGE_TAXES"].median())),
        "median_percent_change": round(float(pct.median()), 2),
        "median_assessment": round(float(group["ASSESSMENT_2021"].median())),
        "total_tax_2020": round(float(group["TAXES_2020"].sum())),
        "total_tax_2021": round(float(group["TAXES_2021"].sum())),
        "share_increase": round(float((pct > 0).mean()), 4),
        "share_decrease": round(float((pct < 0).mean()), 4),
    }


def histogram(pct):
    """Counts properties per band of % change, with "no change" as its own bar."""
    pct = pct.clip(HISTOGRAM_MIN, HISTOGRAM_MAX)
    bins = []
    edge = HISTOGRAM_MIN
    while edge < 0:
        top = edge + HISTOGRAM_BIN
        bins.append({"from": edge, "to": top, "count": int(((pct >= edge) & (pct < top)).sum())})
        edge = top
    bins.append({"from": 0, "to": 0, "count": int((pct == 0).sum())})
    edge = 0.0
    while edge < HISTOGRAM_MAX:
        top = edge + HISTOGRAM_BIN
        bins.append({"from": edge, "to": top, "count": int(((pct > edge) & (pct <= top)).sum())})
        edge = top
    assert sum(b["count"] for b in bins) == len(pct)
    return [{**b, "from": round(b["from"], 2), "to": round(b["to"], 2)} for b in bins]


def main():
    df, notes = load()
    taxed = df[df["TAXED"]]

    city = summarise(taxed)
    wards = [{"ward": int(w), **summarise(g)} for w, g in taxed.groupby("WARD")]

    summary = {
        "notes": notes,
        "city": city,
        "wards": wards,
        "histogram": histogram(taxed["PERCENT_CHANGE_TAXES"]),
        "assessment_changed": bool((df["ASSESSMENT_CHANGE"] != 0).any()),
    }

    # Map files and property locations, if the parcel shapefile is present.
    df["LAT"] = None
    df["LON"] = None
    try:
        import parcel_map
    except ImportError as e:
        print(f"Skipping map files ({e}).")
        parcel_map = None
    if parcel_map and parcel_map.available():
        df["LAT"], df["LON"], summary["map"] = parcel_map.build(df)
        print(json.dumps(summary["map"], indent=1))

    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=1))

    # Compact lookup table: one short array per property.
    cols = ["PROPERTY_ADDRESS", "WARD", "ROLL_NO", "ASSESSMENT_2021",
            "TAXES_2020", "TAXES_2021", "DOLLAR_CHANGE_TAXES", "PERCENT_CHANGE_TAXES",
            "LAT", "LON"]
    lookup = df.sort_values("PROPERTY_ADDRESS")[cols]
    rows = [[r[0], int(r[1]), r[2], int(r[3]), int(r[4]), int(r[5]), int(r[6]), float(r[7]),
             None if pd.isna(r[8]) else r[8], None if pd.isna(r[9]) else r[9]]
            for r in lookup.itertuples(index=False)]
    (OUT_DIR / "properties.json").write_text(
        json.dumps({"columns": ["address", "ward", "roll", "assessment", "tax2020",
                                "tax2021", "change", "pct", "lat", "lon"], "rows": rows},
                   separators=(",", ":")))

    print(json.dumps(notes, indent=1))
    print(f"City median change: {city['median_percent_change']}% (${city['median_dollar_change']})")


if __name__ == "__main__":
    main()
