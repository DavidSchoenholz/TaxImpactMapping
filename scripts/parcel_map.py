"""
Builds the map files from the parcel shapefile in data/raw/parcels/.
Called by build_data.py; not meant to be run on its own.

Needs geopandas (pip install geopandas).

Outputs:
  data/wards.geojson           ward outlines, traced from the parcels
  data/parcels/ward-<N>.json   one file of parcel shapes per ward
"""
import bisect
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely

ROOT = Path(__file__).resolve().parent.parent
SHAPEFILE = ROOT / "data" / "raw" / "parcels" / "parcels_assessment.shp"
OUT_DIR = ROOT / "data"

# Work in metres (UTM zone 17N) for buffering and simplifying.
METRIC_CRS = "EPSG:26917"
# Ward outlines: parcels are grown by this many metres and shrunk back, which
# fills in the roads between them.
WARD_GAP_FILL_M = 80
WARD_SIMPLIFY_M = 25
# Parcel shapes: corners closer than this many metres are merged.
PARCEL_SIMPLIFY_M = 1.5
# Decimal places kept on coordinates (5 is about 1 metre).
COORD_DECIMALS = 5


def available():
    return SHAPEFILE.exists()


def load_parcels():
    g = gpd.read_file(SHAPEFILE)[["ARN", "geometry"]]
    g = g[g.geometry.notna()]
    g["geometry"] = shapely.make_valid(g.geometry.values)
    # A few parcels are split into several rows; merge them.
    g = g.dissolve(by="ARN", as_index=False)
    return g


def match_rolls(rolls, parcels):
    """Returns, for each roll number, the index of its parcel (or -1).

    Most ARNs are 15-digit roll numbers. Condominium parcels have a
    20-digit ARN: the first unit's 15-digit roll number followed by the last
    5 digits of the final unit's roll number, so every unit in that range
    belongs to the parcel.
    """
    exact = {}
    ranges = []
    for i, arn in enumerate(parcels["ARN"]):
        if len(arn) == 15:
            exact[arn] = i
        elif len(arn) == 20:
            ranges.append((int(arn[:15]), int(arn[:10] + arn[15:]), i))
    ranges.sort()
    starts = [r[0] for r in ranges]

    out = []
    for roll in rolls:
        if roll in exact:
            out.append(exact[roll])
            continue
        n = int(roll)
        k = bisect.bisect_right(starts, n) - 1
        out.append(ranges[k][2] if k >= 0 and ranges[k][0] <= n <= ranges[k][1] else -1)
    return out


def round_coords(geom):
    return shapely.set_precision(geom, 10 ** -COORD_DECIMALS)


def build(df):
    """df: cleaned property table from build_data.load().
    Returns (lat, lon) series aligned with df and match statistics."""
    parcels = load_parcels()
    df = df.copy()
    df["PARCEL"] = match_rolls(df["ROLL_NO"].tolist(), parcels)
    matched = df[df["PARCEL"] >= 0]

    # Location of each property: a point guaranteed to sit inside its parcel.
    points = parcels.geometry.representative_point()
    df["LAT"] = df["PARCEL"].map(lambda i: round(points.iloc[i].y, COORD_DECIMALS) if i >= 0 else None)
    df["LON"] = df["PARCEL"].map(lambda i: round(points.iloc[i].x, COORD_DECIMALS) if i >= 0 else None)

    # One record per parcel. Condo parcels hold many units: totals are summed,
    # and the colour uses the typical (median) unit.
    def per_parcel(group):
        taxed = group[group["TAXED"]]
        use = taxed if len(taxed) else group
        addresses = group["PROPERTY_ADDRESS"].unique()
        return pd.Series({
            "a": addresses[0] if len(addresses) == 1 else f"{addresses[0]} (+{len(addresses) - 1} more)",
            "w": int(group["WARD"].mode().iloc[0]),
            "n": int(len(group)),
            "t0": int(group["TAXES_2020"].sum()),
            "t1": int(group["TAXES_2021"].sum()),
            "c": round(float(use["DOLLAR_CHANGE_TAXES"].median())),
            "p": round(float(use["PERCENT_CHANGE_TAXES"].median()), 1),
            "x": bool(len(taxed) == 0),
        })

    info = matched.groupby("PARCEL").apply(per_parcel, include_groups=False)
    shapes = parcels.loc[info.index, ["geometry"]].join(info)
    shapes = shapes[shapes["w"] > 0]

    metric = shapes.to_crs(METRIC_CRS)

    # Ward outlines.
    wards = []
    for ward, grp in metric.groupby("w"):
        merged = shapely.union_all(grp.geometry.values)
        filled = merged.buffer(WARD_GAP_FILL_M, quad_segs=2).buffer(-WARD_GAP_FILL_M, quad_segs=2)
        # Parks and other lots without tax data leave holes; wards have none.
        filled = shapely.union_all([shapely.Polygon(poly.exterior) for poly in getattr(filled, "geoms", [filled])])
        wards.append({"WARD": int(ward), "geometry": filled.simplify(WARD_SIMPLIFY_M)})
    wards = gpd.GeoDataFrame(wards, crs=METRIC_CRS).to_crs("EPSG:4326")
    wards["geometry"] = round_coords(wards.geometry.values)
    (OUT_DIR / "wards.geojson").write_text(wards.to_json(drop_id=True))

    # Parcel shapes, one file per ward.
    metric["geometry"] = metric.geometry.simplify(PARCEL_SIMPLIFY_M)
    simple = metric.to_crs("EPSG:4326")
    simple["geometry"] = round_coords(simple.geometry.values)
    simple = simple[~simple.geometry.is_empty]
    pdir = OUT_DIR / "parcels"
    pdir.mkdir(exist_ok=True)
    for ward, grp in simple.groupby("w"):
        geo = json.loads(grp.to_json(drop_id=True))
        for f in geo["features"]:
            f["properties"].pop("w", None)
        (pdir / f"ward-{int(ward)}.json").write_text(json.dumps(geo, separators=(",", ":")))

    stats = {
        "parcels_in_shapefile": int(len(parcels)),
        "properties_matched_to_parcel": int(len(matched)),
        "properties_not_on_map": int((df["PARCEL"] < 0).sum()),
        "parcels_on_map": int(len(simple)),
    }
    return df["LAT"], df["LON"], stats
