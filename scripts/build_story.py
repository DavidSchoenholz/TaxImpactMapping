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

# ---- Levy by-law schedules: levy, education cut, tax ratios -------------
# General city-wide rates x by-law assessment. Area-rated levies are not in
# these schedules.
sched = defaultdict(dict)
for r in read_csv("hamilton_tax_rates_by_class_2020_2025.csv"):
    sched[int(r["year"])][r["class_code"]] = {k: float(r[k]) for k in ("assessment", "municipal_rate", "education_rate", "total_citywide_rate")}
YEARS = sorted(sched)
muni_levy = {y: sum(c["assessment"] * c["municipal_rate"] for c in sched[y].values()) for y in YEARS}
levy = [{"year": y, "municipal": round(muni_levy[y]), "growth_pct": round((muni_levy[y] / muni_levy[y - 1] - 1) * 100, 2) if y - 1 in muni_levy else None}
        for y in YEARS]

y0, y1 = sched[2020], sched[2021]
EDU_GROUP = {"CT": "Commercial", "DT": "Commercial", "GT": "Commercial", "ST": "Commercial",
             "IT": "Industrial", "LT": "Industrial", "PT": "Pipelines and landfills", "HT": "Pipelines and landfills"}
edu = defaultdict(lambda: {"saving": 0.0, "rate_2020": None, "rate_2021": None})
for c, grp in EDU_GROUP.items():
    edu[grp]["saving"] += (y0[c]["education_rate"] - y1[c]["education_rate"]) * y1[c]["assessment"]
    if c in ("CT", "IT", "PT"):
        edu[grp]["rate_2020"], edu[grp]["rate_2021"] = y0[c]["education_rate"], y1[c]["education_rate"]
education_cut = [{"group": g, "saving": round(v["saving"]), "rate_2020": v["rate_2020"], "rate_2021": v["rate_2021"]} for g, v in edu.items()]

# Ratio = class municipal rate / residential municipal rate. The effect of
# changing ratios: hold each year's levy fixed, re-spread it with 2020 ratios.
ratio20 = {c: v["municipal_rate"] / y0["RT"]["municipal_rate"] for c, v in y0.items()}
ratios, ratio_effect = [], []
for y in YEARS:
    s = sched[y]
    ratios.append({"year": y, **{c: round(s[c]["municipal_rate"] / s["RT"]["municipal_rate"], 3) for c in ("MT", "CT", "IT", "LT")}})
    if y == 2020:
        continue
    cf_rt = muni_levy[y] / sum(s[c]["assessment"] * ratio20.get(c, s[c]["municipal_rate"] / s["RT"]["municipal_rate"]) for c in s)
    diff = lambda c: s[c]["assessment"] * (s[c]["municipal_rate"] - ratio20[c] * cf_rt)
    ratio_effect.append({"year": y, "residential": round(diff("RT") + diff("NT")), "multi": round(diff("MT")),
                         "industrial": round(diff("IT") + diff("LT")),
                         "residential_rate_pct": round((s["RT"]["municipal_rate"] / cf_rt - 1) * 100, 2)})

# ---- Effective-rate tiers for homes -------------------------------------
# Effective rate = bill / assessment. Single-class residential homes fall into
# a few tiers by area; the area-specific part = effective rate - city-wide rate.
# Place names are inferred from each tier's streets, coordinates and wards.
TIER_NAMES = {
    "1.19-1.21": "Old City of Hamilton",
    "1.09-1.11": "Urban Stoney Creek and Dundas",
    "1.1-1.12": "Ancaster and Mount Hope",
    "1.09-1.1": "Waterdown",
    "0.99-1.01": "Rural areas and Binbrook",
    "1.04-1.11": "Eastern Stoney Creek (Winona)",
    "1.04-1.12": "North-west Glanbrook",
    "0.99-1.06": "Rural Glanbrook edge",
}
MOVED = {"1.04-1.11", "1.04-1.12", "0.99-1.06"}
loc = {r[2]: (r[8], r[9]) for r in rows}
homes = [r for r in class_rows if r["TAX_CLASS_PRIMARY"] == "RT" and r["MULTI_CLASS"] == "N"
         and float(r["ASSESSMENT_2021"] or 0) > 50000 and float(r["TOTAL_TAXES_2020"] or 0) > 0 and float(r["TOTAL_TAXES_2021"] or 0) > 0]
by_tier = defaultdict(list)
for r in homes:
    e0 = float(r["TOTAL_TAXES_2020"]) / float(r["ASSESSMENT_2020"]) * 100
    e1 = float(r["TOTAL_TAXES_2021"]) / float(r["ASSESSMENT_2021"]) * 100
    key = f"{round(e0, 2):g}-{round(e1, 2):g}"
    if key in TIER_NAMES:
        by_tier[key].append((r, e0, e1))
c20, c21 = y0["RT"]["total_citywide_rate"] * 100, y1["RT"]["total_citywide_rate"] * 100
tiers = []
for key, g in by_tier.items():
    e0, e1 = st.median(x[1] for x in g), st.median(x[2] for x in g)
    pts = [loc[x[0]["ROLL_NO"]] for x in g if loc.get(x[0]["ROLL_NO"], (None,))[0] is not None]
    tiers.append({
        "key": key, "name": TIER_NAMES[key], "moved": key in MOVED, "n": len(g),
        "rate_2020": round(e0, 4), "rate_2021": round(e1, 4), "pct": round((e1 / e0 - 1) * 100, 2),
        "area_2020": round(e0 - c20, 4), "area_2021": round(e1 - c21, 4),
        "median_change": st.median(float(x[0]["DOLLAR_CHANGE_TAXES"]) for x in g),
        "total_change": round(sum(float(x[0]["DOLLAR_CHANGE_TAXES"]) for x in g)),
        "above_standard": round(sum(float(x[0]["DOLLAR_CHANGE_TAXES"]) - 0.017 * float(x[0]["TOTAL_TAXES_2020"]) for x in g)),
        "median_assessment": st.median(float(x[0]["ASSESSMENT_2021"]) for x in g),
        "center": [round(st.median(p[0] for p in pts), 5), round(st.median(p[1] for p in pts), 5)] if pts else None,
    })
tiers.sort(key=lambda t: -t["rate_2021"])

# ---- A typical old-Hamilton home: why 2.5% became 1.7% -------------------
old = next(t for t in tiers if t["key"] == "1.19-1.21")
A = old["median_assessment"]
m0, m1 = y0["RT"]["municipal_rate"], y1["RT"]["municipal_rate"]
bridge = {
    "assessment": A,
    "bill_2020": round(A * old["rate_2020"] / 100),
    "citywide_municipal": round(A * (m1 - m0)),
    "area_specific": round(A * (old["area_2021"] - old["area_2020"]) / 100),
    "education": round(A * (y1["RT"]["education_rate"] - y0["RT"]["education_rate"])),
    "bill_2021": round(A * old["rate_2021"] / 100),
    "share_citywide": round(c20 / old["rate_2020"], 3),
    "share_area": round(old["area_2020"] / old["rate_2020"], 3),
    "share_education": round(y0["RT"]["education_rate"] * 100 / old["rate_2020"], 3),
    "rate_change_total": round((y1["RT"]["total_citywide_rate"] / y0["RT"]["total_citywide_rate"] - 1) * 100, 2),
    "rate_change_municipal": round((m1 / m0 - 1) * 100, 2),
}

# ---- What a typical home pays on the city-wide rate, 2020-2025 -----------
med_home = st.median(float(r["ASSESSMENT_2021"]) for r in homes)
home_path = [{"year": y, "citywide": round(med_home * sched[y]["RT"]["total_citywide_rate"]),
              "old_hamilton_est": round(A * (sched[y]["RT"]["total_citywide_rate"] + old["area_2021"] / 100))} for y in YEARS]

# ---- The decade: 2011 to 2021 -------------------------------------------
# Homes taxed in both 2011 and 2021. Tax history comes from data/history/
# (made by build_data.py); 2011 assessments from the 2012 impact file.
HOME_TYPE_KEYS = ["D", "S", "T", "C", "P", "A"]
summary_types = json.loads((ROOT / "data" / "summary.json").read_text()).get("types", {})
tax_hist = {}
for path in sorted((ROOT / "data" / "history").glob("ward-*.json")):
    tax_hist.update(json.loads(path.read_text())["tax"])
asmt_2011, asmt_2016 = {}, {}
for r in read_csv("hamilton_tax_impact_2012.csv"):
    asmt_2011[r["AROLL"].strip()] = float(r["ASSESSM_11"] or 0)
for r in read_csv("hamilton_tax_impact_2016.csv"):
    asmt_2016[r["AROLL"].strip()] = float(r["ASSESSM_16"] or 0)

home_rows = [r for r in rows if len(r) > 10 and r[10] in HOME_TYPE_KEYS and r[4] > 0 and r[5] > 0]


def tax_change_2011(r):
    h = tax_hist.get(r[2])
    return (r[5] / h[0] - 1) * 100 if h and h[0] and h[0] > 0 else None


pairs = []  # (value growth 2011-21 %, tax change 2011-21 %, row) for homes standing since 2011
for r in home_rows:
    a, t = asmt_2011.get(r[2], 0), tax_change_2011(r)
    if a > 0 and t is not None and (r[11] or 9999) <= 2011:
        pairs.append(((r[3] / a - 1) * 100, t, r))
pairs.sort(key=lambda x: x[0])
quintiles = []
for i in range(5):
    q = pairs[i * len(pairs) // 5:(i + 1) * len(pairs) // 5]
    quintiles.append({"fifth": i + 1, "n": len(q), "value_growth": round(st.median(x[0] for x in q), 1),
                      "tax_change": round(st.median(x[1] for x in q), 1)})

by_type = []
for k in HOME_TYPE_KEYS:
    g = [r for r in home_rows if r[10] == k]
    if not g:
        continue
    t = [x for x in (tax_change_2011(r) for r in g) if x is not None]
    v11 = [(r[3] / asmt_2011[r[2]] - 1) * 100 for r in g if asmt_2011.get(r[2], 0) > 0]
    v16 = [(r[3] / asmt_2016[r[2]] - 1) * 100 for r in g if asmt_2016.get(r[2], 0) > 0]
    by_type.append({"key": k, "label": summary_types.get(k, k), "n": len(g),
                    "median_bill": st.median(r[5] for r in g), "median_value": st.median(r[3] for r in g),
                    "tax_change": round(st.median(t), 1) if t else None,
                    "value_growth_2011": round(st.median(v11), 1) if v11 else None,
                    "value_growth_2016": round(st.median(v16), 1) if v16 else None,
                    "share_new": round(sum(1 for r in g if (r[11] or 0) >= 2013) / len(g), 3),
                    "share_lower_city": round(sum(1 for r in g if r[1] in (1, 2, 3, 4)) / len(g), 3)})

new_homes = [r for r in home_rows if (r[11] or 0) >= 2013]
old_homes = [r for r in home_rows if (r[11] or 9999) <= 2011]
winona = next((t for t in tiers if t["key"] == "1.04-1.11"), None)
winona_rows = [r for r in home_rows if r[3] > 50000 and r[4] > 0
               and f"{round(r[4] / r[3] * 100, 2):g}-{round(r[5] / r[3] * 100, 2):g}" == "1.04-1.11"]
decade = {
    "home_tax_change": round(st.median(x for x in (tax_change_2011(r) for r in home_rows) if x is not None), 1),
    "home_value_growth": round(st.median(x[0] for x in pairs), 1),
    "homes_compared": len(pairs),
    "quintiles": quintiles,
    "by_type": by_type,
    "new": {
        "n": len(new_homes), "share": round(len(new_homes) / len(home_rows), 3),
        "median_bill": st.median(r[5] for r in new_homes), "median_bill_old": st.median(r[5] for r in old_homes),
        "median_value": st.median(r[3] for r in new_homes), "median_value_old": st.median(r[3] for r in old_homes),
        "median_rate": round(st.median(r[5] / r[3] * 100 for r in new_homes if r[3] > 0), 3),
        "median_rate_old": round(st.median(r[5] / r[3] * 100 for r in old_homes if r[3] > 0), 3),
        "by_year": sorted(Counter(r[11] for r in new_homes).items()),
        "by_area": [[MUNI_NAME.get(m, "?"), n] for m, n in Counter(muni_of.get(r[2], "") for r in new_homes).most_common()],
        "by_type": [[summary_types.get(k, k), n] for k, n in Counter(r[10] for r in new_homes).most_common()],
        "winona_existing_2011": round(sum(1 for r in winona_rows if (r[11] or 9999) <= 2011) / len(winona_rows), 3) if winona_rows else None,
    },
}

mt_rows = [r for r in class_rows if r["TAX_CLASS_PRIMARY"] == "MT" and float(r["TOTAL_TAXES_2020"] or 0) > 0 and float(r["TOTAL_TAXES_2021"] or 0) > 0]
checks = {"multi_n": len(mt_rows), "multi_zero": sum(1 for r in mt_rows if float(r["PERCENT_CHANGE_TAXES"] or 0) == 0)}

out = {"classes": classes, "less_by_class": less_by_class, "rate_change_2021": rate_change_2021,
       "rate_index": rate_index, "annual": annual, "totals": totals, "groups": groups, "deciles": deciles, "hist": hist, "extremes": extremes,
       "levy": levy, "education_cut": education_cut, "ratios": ratios, "ratio_effect": ratio_effect, "tiers": tiers,
       "bridge": bridge, "home_path": home_path, "median_home": med_home, "checks": checks, "decade": decade}
(ROOT / "data" / "story.json").write_text(json.dumps(out, separators=(",", ":")))
print("wrote data/story.json and data/classes.json")
