"""
Per-property extras from the files in data/source/: property class and type,
tax and assessment history back to 2011, and the first year each property
appears in the tax data as a building. Called by build_data.py.

Home types come from the MPAC property code (PROPERTY_CODE). The labels
follow MPAC's standard code list; the City's files give only the numbers.
"""
from pathlib import Path

import pandas as pd

SRC = Path(__file__).resolve().parent.parent / "data" / "source"

# Home type for each MPAC property code. Short keys keep the map files small.
HOME_TYPES = {
    "D": ("Detached house", ["301", "302", "313"]),
    "S": ("Semi-detached or link", ["305", "311", "322"]),
    "T": ("Townhouse", ["309"]),
    "C": ("Condo unit", ["370"]),
    "P": ("House with 2 to 6 units", ["332", "333", "334", "335", "336"]),
    "A": ("Apartment building (7+ units)", ["340", "341"]),
}
OTHER_TYPES = {  # by first digit of the code
    "1": ("V", "Vacant land"), "2": ("F", "Farm"), "4": ("B", "Commercial"),
    "5": ("I", "Industrial"),
}
TYPE_LABELS = {k: v[0] for k, v in HOME_TYPES.items()}
TYPE_LABELS.update({k: label for k, label in OTHER_TYPES.values()})
TYPE_LABELS["O"] = "Other (institutional, parking, unknown)"
_CODE_TO_TYPE = {code: k for k, (_, codes) in HOME_TYPES.items() for code in codes}


def home_type(code):
    code = str(code or "").strip()
    if code in _CODE_TO_TYPE:
        return _CODE_TO_TYPE[code]
    if code[:1] in OTHER_TYPES:
        return OTHER_TYPES[code[:1]][0]
    return "O"


# (file year, roll column, [(tax year, tax column, assessment column, code column)])
HISTORY_FILES = [
    (2012, "AROLL", [(2011, "TOTAL_T_11", "ASSESSM_11", "PROPERTY_C"), (2012, "TOTAL_T_12", "ASSESSM_12", "PROPERTY_C")]),
    (2013, "AROLL", [(2013, "TOTAL_T_13", "ASSESSM_13", "PROPERTY_C")]),
    (2016, "AROLL", [(2015, "TOTAL_T_15", "ASSESSM_15", "PROPERTY_C"), (2016, "TOTAL_T_16", "ASSESSM_16", "PROPERTY_C")]),
    (2018, "ROLL_NO", [(2017, "TOTAL_T_17", "ASSESSM_17", "PROPERTY_C"), (2018, "TOTAL_T_18", "ASSESSM_18", "PROPERTY_C")]),
    (2019, "ROLL_NO", [(2019, "TOTTAX_19", "ASMT_2019", "PROPERTY_C")]),
]
TAX_YEARS = [2011, 2012, 2013, 2015, 2016, 2017, 2018, 2019, 2020, 2021]


def _clean_roll(s):
    return s.astype("string").str.strip().str.replace(r"\.0$", "", regex=True)


def available():
    return (SRC / "hamilton_tax_2021_with_class.csv").exists()


def load():
    """Returns a DataFrame indexed by ROLL_NO with CLASS, MUNI, MULTI, TYPE,
    TAX_<year> and ASMT_<year> for each year in TAX_YEARS before 2020, and FIRST."""
    cls = pd.read_csv(SRC / "hamilton_tax_2021_with_class.csv", dtype=str, encoding="utf-8-sig")
    cls["ROLL_NO"] = _clean_roll(cls["ROLL_NO"])
    cls = cls.drop_duplicates("ROLL_NO").set_index("ROLL_NO")
    out = pd.DataFrame(index=cls.index)
    out["CLASS"] = cls["TAX_CLASS_PRIMARY"].fillna("")
    out["MUNI"] = cls["MUNICIPALITY"].fillna("")
    out["MULTI"] = cls["MULTI_CLASS"].eq("Y")
    out["TYPE"] = cls["PROPERTY_CODE"].map(home_type)

    built = {}  # roll -> first tax year it was taxed and not vacant land
    for file_year, roll_col, years in HISTORY_FILES:
        path = SRC / f"hamilton_tax_impact_{file_year}.csv"
        if not path.exists():
            continue
        h = pd.read_csv(path, dtype=str, encoding="utf-8-sig")
        h["R"] = _clean_roll(h[roll_col])
        h = h.drop_duplicates("R").set_index("R")
        for year, tax_col, asmt_col, code_col in years:
            tax = pd.to_numeric(h[tax_col], errors="coerce")
            out[f"TAX_{year}"] = tax.reindex(out.index)
            out[f"ASMT_{year}"] = pd.to_numeric(h[asmt_col], errors="coerce").reindex(out.index)
            is_building = (tax > 0) & ~h[code_col].astype(str).str.strip().str.startswith("1")
            for roll in is_building[is_building].index:
                built.setdefault(roll, year)
    out["FIRST"] = pd.Series(built).reindex(out.index)
    return out
