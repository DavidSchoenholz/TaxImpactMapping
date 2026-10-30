"""Builds data/story.json: the extra numbers behind the page's narrative
(who paid less, the clusters of increases, the extremes).

Reads data/properties.json (made by build_data.py). Run from the repo root:

    python scripts/build_story.py
"""
import json
import statistics as st
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
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

out = {"totals": totals, "groups": groups, "deciles": deciles, "hist": hist, "extremes": extremes}
(ROOT / "data" / "story.json").write_text(json.dumps(out, separators=(",", ":")))
print("wrote data/story.json")
