"""Briefing analysis, part 2: ratio effect by year, levy growth, residential city-wide vs area-specific split, tiers.
Run from the repo root: python scripts/analysis/briefing_ratios_and_tiers.py ."""
import csv, statistics as st, sys
from collections import Counter, defaultdict
from pathlib import Path
R = Path(sys.argv[1]); SRC = R/"data"/"source"
rd = lambda n: list(csv.DictReader(open(SRC/n, encoding="utf-8-sig", newline="")))
f = lambda x: float(x) if x not in ("", None) else 0.0
rates = rd("hamilton_tax_rates_by_class_2020_2025.csv")
by = defaultdict(dict)
for r in rates: by[int(r["year"])][r["class_code"]] = r
y0 = by[2020]; rt20 = f(y0["RT"]["municipal_rate"]); ratio20 = {c: f(r["municipal_rate"])/rt20 for c, r in y0.items()}
for y in range(2021, 2026):
    y1 = by[y]; levy = sum(f(r["assessment"])*f(r["municipal_rate"]) for r in y1.values())
    wa = sum(f(y1[c]["assessment"])*ratio20.get(c, f(y1[c]["municipal_rate"])/f(y1["RT"]["municipal_rate"])) for c in y1)
    cf = levy/wa; A = f(y1["RT"]["assessment"]) + f(y1["NT"]["assessment"])
    mt = f(y1["MT"]["assessment"])*(f(y1["MT"]["municipal_rate"]) - ratio20["MT"]*cf)
    ind = sum(f(y1[c]["assessment"])*(f(y1[c]["municipal_rate"]) - ratio20[c]*cf) for c in ["IT","LT"])
    print(y, "levy $M", round(levy/1e6,1), "res extra $M", round(A*(f(y1["RT"]["municipal_rate"])-cf)/1e6,2), "MT", round(mt/1e6,2), "IT+LT", round(ind/1e6,2),
          "res rate +%", round((f(y1["RT"]["municipal_rate"])/cf-1)*100,2), "CT assess $B", round(sum(f(y1[c]["assessment"]) for c in ["CT","DT","GT","ST"])/1e9,2), "IT+LT", round(sum(f(y1[c]["assessment"]) for c in ["IT","LT"])/1e9,3))
# muni levy yoy
prev=None
for y in range(2020, 2026):
    levy = sum(f(r["assessment"])*f(r["municipal_rate"]) for r in by[y].values())
    if prev: print(y, "muni levy growth %", round((levy/prev-1)*100,2), "RT muni rate chg %", round((f(by[y]["RT"]["municipal_rate"])/f(by[y-1]["RT"]["municipal_rate"])-1)*100,2), "RT total rate chg %", round((f(by[y]["RT"]["total_citywide_rate"])/f(by[y-1]["RT"]["total_citywide_rate"])-1)*100,2))
    prev = levy
rows = rd("hamilton_tax_2021_with_class.csv")
rt = [r for r in rows if r["TAX_CLASS_PRIMARY"]=="RT" and r["MULTI_CLASS"]=="N" and f(r["ASSESSMENT_2021"])>50000 and f(r["TOTAL_TAXES_2020"])>0 and f(r["TOTAL_TAXES_2021"])>0]
c20, c21 = 0.00902778, 0.00925687
a0 = sum(f(r["TOTAL_TAXES_2020"]) - f(r["ASSESSMENT_2020"])*c20 for r in rt); a1 = sum(f(r["TOTAL_TAXES_2021"]) - f(r["ASSESSMENT_2021"])*c21 for r in rt)
g0 = sum(f(r["ASSESSMENT_2020"])*c20 for r in rt); g1 = sum(f(r["ASSESSMENT_2021"])*c21 for r in rt)
print("RT single-class: citywide part $M", round(g0/1e6,1), round(g1/1e6,1), "area/other part $M", round(a0/1e6,1), round(a1/1e6,1), "n", len(rt))
# tiers
def tier(r):
    return (round(f(r["TOTAL_TAXES_2020"])/f(r["ASSESSMENT_2020"])*100, 2), round(f(r["TOTAL_TAXES_2021"])/f(r["ASSESSMENT_2021"])*100, 2))
MUNI = {"01":"Hamilton","00":"Stoney Creek","14":"Ancaster","26":"Dundas","30":"Flamborough","90":"Glanbrook"}
tc = defaultdict(Counter); tm = defaultdict(list)
for r in rt:
    t = tier(r); tc[t][MUNI.get(r["MUNICIPALITY"],"?")] += 1; tm[t].append(r)
for t, c in sorted(tc.items(), key=lambda x: -sum(x[1].values()))[:12]:
    g = tm[t]; n = len(g)
    print(t, n, dict(c.most_common(4)), "chg%", round((t[1]/t[0]-1)*100,2), "area pts", round(t[0]-c20*100,3), "->", round(t[1]-c21*100,3), "med bill21", st.median(f(r["TOTAL_TAXES_2021"]) for r in g), "med chg", st.median(f(r["DOLLAR_CHANGE_TAXES"]) for r in g))
# Glanbrook jump tier
gj = [r for r in rt if r["MUNICIPALITY"]=="90" and f(r["PERCENT_CHANGE_TAXES"])>=6]
print("Glanbrook jump tiers", Counter(tier(r) for r in gj).most_common(3))
sj = [r for r in rt if r["MUNICIPALITY"]=="00" and f(r["PERCENT_CHANGE_TAXES"])>=6]
print("SC jump tiers", Counter(tier(r) for r in sj).most_common(3), "median bill20", st.median(f(r["TOTAL_TAXES_2020"]) for r in sj), "median assess", st.median(f(r["ASSESSMENT_2021"]) for r in sj))
