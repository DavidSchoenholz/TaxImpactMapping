"""Briefing analysis, part 1: by-law levy by class, tax ratios, education cut, effective-rate tiers.
Run from the repo root: python scripts/analysis/briefing_levy_and_tiers.py ."""
from collections import Counter, defaultdict
from pathlib import Path

R = Path(sys.argv[1]); SRC = R / "data" / "source"
rd = lambda n: list(csv.DictReader(open(SRC / n, encoding="utf-8-sig", newline="")))
f = lambda x: float(x) if x not in ("", None) else 0.0

# ---------- by-law levy by class ----------
rates = rd("hamilton_tax_rates_by_class_2020_2025.csv")
by = defaultdict(dict)
for r in rates:
    by[int(r["year"])][r["class_code"]] = r
print("== BYLAW LEVY (citywide general rates x by-law assessment), $M")
for y in sorted(by):
    tot_m = sum(f(r["assessment"]) * f(r["municipal_rate"]) for r in by[y].values())
    tot_e = sum(f(r["assessment"]) * f(r["education_rate"]) for r in by[y].values())
    rt = by[y]["RT"]; nt = by[y].get("NT")
    res_m = f(rt["assessment"]) * f(rt["municipal_rate"]) + (f(nt["assessment"]) * f(nt["municipal_rate"]) if nt else 0)
    print(y, "muni", round(tot_m / 1e6, 1), "edu", round(tot_e / 1e6, 1), "res share of muni", round(res_m / tot_m * 100, 2),
          "RT assess $B", round(f(rt["assessment"]) / 1e9, 2))

FAM = {"RT": "res", "NT": "res", "MT": "multi", "M1": "multi", "CT": "com", "DT": "com", "GT": "com", "ST": "com", "C1": "com",
       "IT": "ind", "LT": "ind", "PT": "other", "HT": "other", "FT": "farm", "TT": "farm", "VT": "other"}
print("== MUNICIPAL LEVY BY FAMILY $M and share")
for y in sorted(by):
    d = defaultdict(float); e = defaultdict(float)
    for c, r in by[y].items():
        d[FAM[c]] += f(r["assessment"]) * f(r["municipal_rate"]); e[FAM[c]] += f(r["assessment"]) * f(r["education_rate"])
    t = sum(d.values())
    print(y, {k: (round(v / 1e6, 1), round(v / t * 100, 1)) for k, v in d.items()}, "edu", {k: round(v / 1e6, 1) for k, v in e.items()})

print("== RATIOS (municipal rate / RT municipal rate)")
for y in sorted(by):
    m = f(by[y]["RT"]["municipal_rate"])
    print(y, {c: round(f(by[y][c]["municipal_rate"]) / m, 4) for c in ["MT", "NT", "CT", "IT", "LT", "PT", "FT"]})

# counterfactual: 2021 municipal levy, but 2020 ratios
y0, y1 = by[2020], by[2021]
levy21 = sum(f(r["assessment"]) * f(r["municipal_rate"]) for r in y1.values())
rt20 = f(y0["RT"]["municipal_rate"])
ratio20 = {c: f(r["municipal_rate"]) / rt20 for c, r in y0.items()}
wa = sum(f(y1[c]["assessment"]) * ratio20[c] for c in y1)
m_rt_cf = levy21 / wa
A_rt = f(y1["RT"]["assessment"]) + f(y1["NT"]["assessment"])
print("== COUNTERFACTUAL 2021 with 2020 ratios: RT muni rate", m_rt_cf, "actual", f(y1["RT"]["municipal_rate"]),
      "residential paid extra $M", round(A_rt * (f(y1["RT"]["municipal_rate"]) - m_rt_cf) / 1e6, 2),
      "pct of RT rate", round((f(y1["RT"]["municipal_rate"]) / m_rt_cf - 1) * 100, 2))
for c in ["MT", "IT", "LT", "PT", "HT", "CT"]:
    a = f(y1[c]["assessment"]); print("   ", c, "paid vs 2020-ratio world $M", round(a * (f(y1[c]["municipal_rate"]) - ratio20[c] * m_rt_cf) / 1e6, 2))
# education cut savings
print("== EDUCATION RATE CHANGE 2020->2021 savings by class $M (2021 assessment)")
tot = 0
for c in y1:
    d = (f(y1[c]["education_rate"]) - f(y0[c]["education_rate"])) * f(y1[c]["assessment"])
    if abs(d) > 1: print("   ", c, round(d / 1e6, 2)); tot += d
print("   total", round(tot / 1e6, 2))
# muni levy growth
levy20 = sum(f(r["assessment"]) * f(r["municipal_rate"]) for r in y0.values())
print("muni levy 2020", levy20 / 1e6, "2021", levy21 / 1e6, "growth %", (levy21 / levy20 - 1) * 100)
# growth from assessment (new construction) at 2020 rates
g = sum((f(y1[c]["assessment"]) - f(y0[c]["assessment"])) * f(y0[c]["municipal_rate"]) for c in y1 if c in y0)
print("assessment growth at 2020 rates $M", g / 1e6)

# ---------- property file ----------
rows = rd("hamilton_tax_2021_with_class.csv")
tx = [r for r in rows if f(r["TOTAL_TAXES_2020"]) > 0 and f(r["TOTAL_TAXES_2021"]) > 0]
print("== PROPERTY FILE totals", len(rows), len(tx), sum(f(r["TOTAL_TAXES_2020"]) for r in tx) / 1e6, sum(f(r["TOTAL_TAXES_2021"]) for r in tx) / 1e6)
MUNI = {"01": "Hamilton", "00": "Stoney Creek", "14": "Ancaster", "26": "Dundas", "30": "Flamborough", "90": "Glanbrook"}

# effective rates for single-class RT by municipality
print("== RT single-class effective rate by municipality: tax/assessment (%) modes 2020 -> 2021")
rt = [r for r in tx if r["TAX_CLASS_PRIMARY"] == "RT" and r["MULTI_CLASS"] == "N" and f(r["ASSESSMENT_2021"]) > 50000]
for m in ["01", "00", "14", "26", "30", "90"]:
    g = [r for r in rt if r["MUNICIPALITY"] == m]
    e0 = Counter(round(f(r["TOTAL_TAXES_2020"]) / f(r["ASSESSMENT_2020"]) * 100, 3) for r in g)
    e1 = Counter(round(f(r["TOTAL_TAXES_2021"]) / f(r["ASSESSMENT_2021"]) * 100, 3) for r in g)
    pairs = Counter((round(f(r["TOTAL_TAXES_2020"]) / f(r["ASSESSMENT_2020"]) * 100, 3), round(f(r["TOTAL_TAXES_2021"]) / f(r["ASSESSMENT_2021"]) * 100, 3)) for r in g)
    print(MUNI[m], len(g), "top pairs", [(a, b, n, round((b / a - 1) * 100, 2)) for (a, b), n in pairs.most_common(5)])
    print("    median assess", st.median(f(r["ASSESSMENT_2021"]) for r in g), "median bill21", st.median(f(r["TOTAL_TAXES_2021"]) for r in g),
          "median pct", st.median(f(r["PERCENT_CHANGE_TAXES"]) for r in g), "sum chg $M", round(sum(f(r["DOLLAR_CHANGE_TAXES"]) for r in g) / 1e6, 2))

# jump group geography and dollars
def pct(r): return f(r["PERCENT_CHANGE_TAXES"])
jump = [r for r in tx if pct(r) >= 6 and f(r["DOLLAR_CHANGE_TAXES"]) >= 0]
print("== JUMP", len(jump), Counter(MUNI.get(r["MUNICIPALITY"], r["MUNICIPALITY"]) for r in jump), Counter(r["WARD"] for r in jump).most_common(3))
for m in ["00", "90"]:
    g = [r for r in jump if r["MUNICIPALITY"] == m]
    print("  ", MUNI[m], len(g), "sum chg", sum(f(r["DOLLAR_CHANGE_TAXES"]) for r in g), "excess over 1.7%:", round(sum(f(r["DOLLAR_CHANGE_TAXES"]) - 0.017 * f(r["TOTAL_TAXES_2020"]) for r in g)),
          "median chg", st.median(f(r["DOLLAR_CHANGE_TAXES"]) for r in g), "streets", Counter(" ".join(r["PROPERTY_ADDRESS"].split()[1:]) for r in g).most_common(12))

props = json.load(open(R / "data" / "properties.json"))["rows"]
loc = {p[2]: (p[8], p[9]) for p in props}
def bounds(g):
    pts = [loc.get(r["ROLL_NO"]) for r in g]; pts = [p for p in pts if p and p[0]]
    la = sorted(p[0] for p in pts); lo = sorted(p[1] for p in pts)
    q = lambda a, x: a[int(len(a) * x)]
    return (q(la, .05), q(la, .5), q(la, .95)), (q(lo, .05), q(lo, .5), q(lo, .95))
for m in ["00", "90"]:
    print("  bounds jump", MUNI[m], bounds([r for r in jump if r["MUNICIPALITY"] == m]))
sc_other = [r for r in rt if r["MUNICIPALITY"] == "00" and pct(r) < 3]
print("  bounds rest of Stoney Creek RT", bounds(sc_other))
# Flamborough split
fl = [r for r in rt if r["MUNICIPALITY"] == "30"]
lo_ = [r for r in fl if pct(r) < 2]; hi_ = [r for r in fl if pct(r) >= 2]
print("== FLAMBOROUGH low", len(lo_), bounds(lo_), Counter(" ".join(r["PROPERTY_ADDRESS"].split()[1:]) for r in lo_).most_common(6))
print("   high", len(hi_), bounds(hi_), Counter(" ".join(r["PROPERTY_ADDRESS"].split()[1:]) for r in hi_).most_common(6))
gl = [r for r in rt if r["MUNICIPALITY"] == "90"]
lo_ = [r for r in gl if pct(r) < 2]; hi_ = [r for r in gl if pct(r) >= 2 and pct(r) < 6]
print("== GLANBROOK low", len(lo_), bounds(lo_), Counter(" ".join(r["PROPERTY_ADDRESS"].split()[1:]) for r in lo_).most_common(6))
print("   high", len(hi_), bounds(hi_), Counter(" ".join(r["PROPERTY_ADDRESS"].split()[1:]) for r in hi_).most_common(6))
# rural vs urban RT: higher group 2.6% includes which munis
hi_all = [r for r in rt if 2 <= pct(r) < 4]
print("== 2-4% RT by muni", Counter(MUNI.get(r["MUNICIPALITY"]) for r in hi_all))

# concentration
bills = sorted((f(r["TOTAL_TAXES_2021"]) for r in tx), reverse=True); T = sum(bills)
for k in [0.001, 0.01, 0.05, 0.1]:
    n = int(len(bills) * k); print("top", k, n, "share", round(sum(bills[:n]) / T * 100, 1))
# multi-res
mt = [r for r in tx if r["TAX_CLASS_PRIMARY"] == "MT"]
print("== MT", len(mt), Counter(round(pct(r), 1) for r in mt).most_common(6), "sum chg", sum(f(r["DOLLAR_CHANGE_TAXES"]) for r in mt))
# class file sums by family
FAM2 = dict(FAM); FAM2.update({"CX": "com", "CU": "com", "XT": "com", "IX": "ind", "IU": "ind", "E": "exempt"})
d = defaultdict(lambda: [0, 0.0, 0.0])
for r in tx:
    k = FAM2.get(r["TAX_CLASS_PRIMARY"], "unknown"); d[k][0] += 1; d[k][1] += f(r["TOTAL_TAXES_2020"]); d[k][2] += f(r["TOTAL_TAXES_2021"])
T0 = sum(v[1] for v in d.values()); T1 = sum(v[2] for v in d.values())
print("== BILLS BY FAMILY (property file)")
for k, (n, a, b) in sorted(d.items(), key=lambda x: -x[1][1]):
    print(k, n, round(a / 1e6, 2), round(b / 1e6, 2), round((b - a) / 1e6, 2), "share", round(a / T0 * 100, 2), "->", round(b / T1 * 100, 2), "chg%", round((b / a - 1) * 100, 2))
# typical home forward
med_a = st.median(f(r["ASSESSMENT_2021"]) for r in rt)
print("median RT assessment", med_a)
for y in range(2020, 2026):
    print(y, "citywide RT bill on median home", round(med_a * f(by[y]["RT"]["total_citywide_rate"])))
# area-rated share for old Hamilton
g = [r for r in rt if r["MUNICIPALITY"] == "01"]
eff20 = st.median(f(r["TOTAL_TAXES_2020"]) / f(r["ASSESSMENT_2020"]) for r in g); eff21 = st.median(f(r["TOTAL_TAXES_2021"]) / f(r["ASSESSMENT_2021"]) for r in g)
print("old Hamilton eff", eff20, eff21, "citywide", f(by[2020]["RT"]["total_citywide_rate"]), f(by[2021]["RT"]["total_citywide_rate"]))
