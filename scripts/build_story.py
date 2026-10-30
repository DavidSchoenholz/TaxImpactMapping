"""Builds data/story.json and data/classes.json: the extra numbers behind the
page's narrative (who paid less, the clusters of increases, the extremes).

Reads data/properties.json (made by build_data.py) and the files in
data/source/. Run from the repo root:

    python scripts/build_story.py
"""
import csv
import json
import statistics as st
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "source"


def read_csv(name):
    with open(SRC / name, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


# ---- Property classes -------------------------------------------------
# The City's class codes grouped into families. Codes in the City's rate
# table are named there; the rest (CX, CU, XT, IX, E...) are standard Ontario
# assessment class codes and are grouped by their first letter.
FAMILY = {
    "RT": "residential", "NT": "multi", "MT": "multi", "M1": "multi",
    "CT": "commercial", "DT": "commercial", "GT": "commercial", "ST": "commercial",
    "C1": "commercial", "CX": "commercial", "CU": "commercial", "XT": "commercial",
    "IT": "industrial", "LT": "industrial", "IX": "industrial", "IU": "industrial",
    "FT": "farm", "E": "exempt",
}
FAMILY_LABEL = {
    "residential": "Residential", "multi": "Multi-residential", "commercial": "Commercial",
    "industrial": "Industrial", "farm": "Farm", "exempt": "Exempt", "other": "Other / unknown",
}
# Former municipalities, as the City's MUNICIPALITY code appears in the data.
# Names are inferred from which wards each code sits in (not stated in the files).
MUNI_NAME = {"01": "Hamilton", "00": "Stoney Creek", "14": "Ancaster", "26": "Dundas",
             "30": "Flamborough", "90": "Glanbrook"}

class_rows = read_csv("hamilton_tax_2021_with_class.csv")
class_of = {r["ROLL_NO"]: r["TAX_CLASS_PRIMARY"] for r in class_rows}
multi_of = {r["ROLL_NO"]: r["MULTI_CLASS"] == "Y" for r in class_rows}
muni_of = {r["ROLL_NO"]: r["MUNICIPALITY"] for r in class_rows}


def family(roll):
    return FAMILY.get(class_of.get(roll, ""), "other")


rows = json.loads((ROOT / "data" / "properties.json").read_text())["rows"]
# columns: address, ward, roll, assessment, tax2020, tax2021, change, pct, lat, lon
taxed = [r for r in rows if r[4] > 0 and r[5] > 0]
N = len(taxed)

# ---- Groups of properties, by percent change -------------------------
# lo is inclusive, hi is exclusive. "less" is handled separately (change < 0).
GROUPS = [
    ("less",    "Paying less",       None, None),
    ("low",     "A smaller bump",    0.0,  1.5),
    ("typical", "The standard rise", 1.5,  2.0),
    ("higher",  "A bigger bump",     2.0,  4.0),
    ("jump",    "The big jump",      6.0,  100.0),
]


def in_group(r, lo, hi):
    if lo is None:
        return r[6] < 0
    return r[6] >= 0 and lo <= r[7] < hi


groups = []
for key, label, lo, hi in GROUPS:
    g = [r for r in taxed if in_group(r, lo, hi)]
    wards = Counter(r[1] for r in g).most_common(3)
    located = [r for r in g if r[8] is not None]
    center = None
    # Only give a map centre when the group is concentrated in one place.
    if key != "less" and located and wards[0][1] / len(g) > 0.5:
        in_top = [r for r in located if r[1] == wards[0][0]]
        center = [round(st.median(r[8] for r in in_top), 5), round(st.median(r[9] for r in in_top), 5)]
    groups.append({
        "key": key, "label": label, "lo": lo, "hi": hi,
        "n": len(g), "share": round(len(g) / N, 4),
        "median_change": st.median(r[6] for r in g),
        "median_pct": round(st.median(r[7] for r in g), 1),
        "median_bill": st.median(r[4] for r in g),
        "top_wards": [[w, n] for w, n in wards],
        "center": center,
    })

# ---- Who paid less ---------------------------------------------------
less = [r for r in taxed if r[6] < 0]
more = [r for r in taxed if r[6] > 0]
rest = [r for r in taxed if r[6] >= 0]
tax0 = sum(r[4] for r in taxed)
tax1 = sum(r[5] for r in taxed)
totals = {
    "n_taxed": N,
    "tax_2020": tax0, "tax_2021": tax1, "net": tax1 - tax0,
    "net_pct": round((tax1 / tax0 - 1) * 100, 2),
    "n_more": len(more), "increase_total": sum(r[6] for r in more),
    "n_less": len(less), "decrease_total": sum(r[6] for r in less),
    "share_less": round(len(less) / N, 4),
    "tax_share_of_less": round(sum(r[4] for r in less) / tax0, 4),
    "median_bill_less": st.median(r[4] for r in less),
    "median_bill_rest": st.median(r[4] for r in rest),
    "median_change_less": st.median(r[6] for r in less),
    "median_change_rest": st.median(r[6] for r in rest),
}

# ---- Share paying less, by size of 2020 bill (tenths) ----------------
bills = sorted(r[4] for r in taxed)
cuts = [bills[int(N * i / 10)] for i in range(1, 10)]
buckets = [[] for _ in range(10)]
for r in taxed:
    i = sum(1 for c in cuts if r[4] >= c)
    buckets[i].append(r)
deciles = [{
    "tenth": i + 1,
    "from_bill": min(r[4] for r in b),
    "share_less": round(sum(1 for r in b if r[6] < 0) / len(b), 4),
    "median_change": st.median(r[6] for r in b),
} for i, b in enumerate(buckets)]

# ---- Histogram, 0.1% bins from -6 to +8 ------------------------------
LO, HI, STEP = -6.0, 8.0, 0.1
nb = round((HI - LO) / STEP)
counts = [0] * nb
for r in taxed:
    i = int((max(LO, min(HI - 1e-9, r[7])) - LO) / STEP + 1e-9)
    counts[i] += 1
hist = [{"from": round(LO + i * STEP, 1), "count": c} for i, c in enumerate(counts)]

# ---- Extremes --------------------------------------------------------
keys = ["address", "ward", "roll", "assessment", "tax2020", "tax2021", "change", "pct", "lat", "lon"]
extremes = {
    "up": [dict(zip(keys, r)) for r in sorted(taxed, key=lambda r: -r[6])[:5]],
    "down": [dict(zip(keys, r)) for r in sorted(taxed, key=lambda r: r[6])[:5]],
}

# ---- Class breakdown -------------------------------------------------
by_family = defaultdict(list)
for r in taxed:
    by_family[family(r[2])].append(r)
classes = []
for fam in ["residential", "multi", "commercial", "industrial", "farm", "exempt", "other"]:
    g = by_family.get(fam, [])
    if not g:
        continue
    classes.append({
        "key": fam, "label": FAMILY_LABEL[fam], "n": len(g),
        "median_pct": round(st.median(r[7] for r in g), 1),
        "median_change": st.median(r[6] for r in g),
        "median_bill": st.median(r[4] for r in g),
        "share_less": round(sum(1 for r in g if r[6] < 0) / len(g), 4),
        "tax_2020": sum(r[4] for r in g), "net": sum(r[5] - r[4] for r in g),
    })

less_mix = Counter(family(r[2]) for r in less)
less_resid_multi = sum(1 for r in less if family(r[2]) == "residential" and multi_of.get(r[2]))
less_by_class = {
    "n": len(less),
    "mix": {k: v for k, v in less_mix.most_common()},
    "residential_mixed_use": less_resid_multi,
}

# Class mix and former municipality of each story group.
for g in groups:
    members = [r for r in taxed if in_group(r, g["lo"], g["hi"])]
    g["class_mix"] = [[k, v] for k, v in Counter(family(r[2]) for r in members).most_common(3)]
    g["top_munis"] = [[MUNI_NAME.get(m, m or "?"), n] for m, n in Counter(muni_of.get(r[2], "") for r in members).most_common(3)]

# ---- Rates by class (from the levy by-laws) ---------------------------
rate_rows = read_csv("hamilton_rates_by_class_with_ratios.csv")
rate = {(r["year"], r["class_code"]): r for r in rate_rows}
rate_change_2021 = {}
for code, label in [("RT", "Residential"), ("MT", "Multi-residential"), ("CT", "Commercial"), ("IT", "Industrial")]:
    a, b = rate.get(("2020", code)), rate.get(("2021", code))
    if a and b:
        rate_change_2021[code] = {
            "label": label,
            "education_2020": float(a["education_rate"]), "education_2021": float(b["education_rate"]),
            "municipal_2020": float(a["municipal_rate"]), "municipal_2021": float(b["municipal_rate"]),
            "total_change_pct": float(b["yoy_total_change_pct"]),
        }

mult = read_csv("hamilton_tax_multipliers_by_class_by_year.csv")
rate_index = {}
for code in ["RT", "MT", "CT", "IT"]:
    series = {int(r["year"]): float(r["total_citywide_rate"]) for r in mult if r["class_code"] == code and r["total_citywide_rate"]}
    if 2020 in series:
        rate_index[code] = [[y, round(v / series[2020] * 100, 1)] for y, v in sorted(series.items()) if y <= 2025]

annual = []
for r in read_csv("hamilton_annual_tax_increases.csv"):
    num = lambda k: float(r[k]) if r[k] else None
    annual.append({"year": int(r["year"]), "announced": num("announced_residential_increase_pct"),
                   "observed": num("observed_median_pct"), "source": r["announced_source"]})

# class on each extreme, and a roll -> class table for the lookup (non-residential only)
for lst in extremes.values():
    for e in lst:
        e["class"] = family(e["roll"])
class_lookup = {r["ROLL_NO"]: r["TAX_CLASS_PRIMARY"] or "?" for r in class_rows if r["TAX_CLASS_PRIMARY"] != "RT"}
(ROOT / "data" / "classes.json").write_text(json.dumps({"labels": FAMILY_LABEL, "family": FAMILY, "rolls": class_lookup}, separators=(",", ":")))

out = {"classes": classes, "less_by_class": less_by_class, "rate_change_2021": rate_change_2021,
       "rate_index": rate_index, "annual": annual, "totals": totals, "groups": groups, "deciles": deciles, "hist": hist, "extremes": extremes}
(ROOT / "data" / "story.json").write_text(json.dumps(out, separators=(",", ":")))
print("wrote data/story.json and data/classes.json")
