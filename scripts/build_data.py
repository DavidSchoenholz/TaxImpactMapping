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

try:
    import history
except ImportError:
    history = None

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

    # Class, home type and history from data/source/, when present.
    if history and history.available():
        df = df.join(history.load(), on="ROLL_NO")
        a21 = df["ASSESSMENT_2021"].where(df["ASSESSMENT_2021"] > 0)
        df["EFF"] = (df["TAXES_2021"] / a21 * 100).where(df["TAXED"])
        df["GROWTH"] = (df["ASSESSMENT_2021"] / df["ASMT_2016"].where(df["ASMT_2016"] > 0) - 1) * 100
        df["LONG"] = ((df["TAXES_2021"] / df["TAX_2011"].where(df["TAX_2011"] > 0) - 1) * 100).where(df["TAXED"])
        # Properties not in any earlier file: first taxed as a building in 2020 or 2021.
        new = df["FIRST"].isna() & df["TAXED"] & (df["TYPE"] != "V")
        df.loc[new, "FIRST"] = 2021
        df.loc[new & (df["TAXES_2020"] > 0), "FIRST"] = 2020

    notes = {
        "rows_in_csv": rows_in,
        "rows_after_cleaning": len(df),
        "properties_in_stats": int(df["TAXED"].sum()),
        "untaxed_or_unassigned": int((~df["TAXED"]).sum()),
    }
    return df, notes


HOME_KEYS = ["D", "S", "T", "C", "P"]


def extras(group):
    """Ward-level figures that need the class and history files."""
    if "TYPE" not in group:
        return {}
    homes = group[group["TYPE"].isin(HOME_KEYS) & group["EFF"].notna()]
    med = lambda s: None if s.dropna().empty else round(float(s.median()), 2)
    return {
        "median_home_value": med(homes["ASSESSMENT_2021"]),
        "median_home_rate": med(homes["EFF"]),
        "median_value_growth": med(group["GROWTH"]),
        "median_long_change": med(group["LONG"]),
        "share_new": round(float((group["FIRST"] >= 2013).mean()), 4),
        "share_detached": round(float((homes["TYPE"] == "D").mean()), 4) if len(homes) else None,
        "share_condo_town": round(float(homes["TYPE"].isin(["C", "T"]).mean()), 4) if len(homes) else None,
    }


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
        **extras(group),
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
    if "TYPE" not in df:
        df["TYPE"] = None
        df["FIRST"] = None
    cols = ["PROPERTY_ADDRESS", "WARD", "ROLL_NO", "ASSESSMENT_2021",
            "TAXES_2020", "TAXES_2021", "DOLLAR_CHANGE_TAXES", "PERCENT_CHANGE_TAXES",
            "LAT", "LON", "TYPE", "FIRST"]
    lookup = df.sort_values("PROPERTY_ADDRESS")[cols]
    nan = lambda v: None if pd.isna(v) else v
    rows = [[r[0], int(r[1]), r[2], int(r[3]), int(r[4]), int(r[5]), int(r[6]), float(r[7]),
             nan(r[8]), nan(r[9]), nan(r[10]), None if pd.isna(r[11]) else int(r[11])]
            for r in lookup.itertuples(index=False)]
    (OUT_DIR / "properties.json").write_text(
        json.dumps({"columns": ["address", "ward", "roll", "assessment", "tax2020",
                                "tax2021", "change", "pct", "lat", "lon", "type", "first"], "rows": rows},
                   separators=(",", ":")))

    # Tax history per property, one file per ward, loaded when a property is looked up.
    hist = history if "TAX_2011" in df else None
    if hist:
        years = hist.TAX_YEARS
        cols = {y: ("TAXES_2020" if y == 2020 else "TAXES_2021" if y == 2021 else f"TAX_{y}") for y in years}
        hdir = OUT_DIR / "history"
        hdir.mkdir(exist_ok=True)
        for ward, g in df[df["WARD"] > 0].groupby("WARD"):
            vals = g[[cols[y] for y in years]]
            out = {roll: [None if pd.isna(v) else int(v) for v in row]
                   for roll, row in zip(g["ROLL_NO"], vals.itertuples(index=False))}
            (hdir / f"ward-{int(ward)}.json").write_text(json.dumps({"years": years, "tax": out}, separators=(",", ":")))
        summary["types"] = hist.TYPE_LABELS
        (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=1))

    print(json.dumps(notes, indent=1))
    print(f"City median change: {city['median_percent_change']}% (${city['median_dollar_change']})")


if __name__ == "__main__":
    main()
