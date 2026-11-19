"""Build the Section E workbook: Assumptions, Data, Model (with answers)."""
import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.comments import Comment

OUT = sys.argv[1] if len(sys.argv) > 1 else "deliverables/Section_E_Subscription_Model.xlsx"

FONT = "Arial"
BLUE = "0000FF"
GREEN = "008000"
NAVY = "1F2A44"
YELLOW = PatternFill("solid", fgColor="FFFF00")
HEAD = PatternFill("solid", fgColor="DCE3EE")
TOTAL = PatternFill("solid", fgColor="F2F4F8")
thin = Side(style="thin", color="B7C0CE")
BOX = Border(top=thin, bottom=thin, left=thin, right=thin)
TOPLINE = Border(top=Side(style="medium", color=NAVY))

USD0 = '$#,##0;($#,##0);"-"'
USD2 = '$#,##0.00;($#,##0.00);"-"'
PCT1 = '0.0%;(0.0%);"-"'
PCT2 = '0.00%'
INT = '#,##0;(#,##0);"-"'


def f(bold=False, color="000000", size=10, italic=False):
    return Font(name=FONT, bold=bold, color=color, size=size, italic=italic)


def title(ws, text, sub=None):
    ws["A1"] = text
    ws["A1"].font = f(True, NAVY, 14)
    if sub:
        ws["A2"] = sub
        ws["A2"].font = f(False, "5A6577", 9, italic=True)


def header_row(ws, row, labels, col=1):
    for i, lab in enumerate(labels):
        c = ws.cell(row=row, column=col + i, value=lab)
        c.font = f(True, NAVY)
        c.fill = HEAD
        c.border = BOX
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")


wb = Workbook()

# ---------------------------------------------------------------- Assumptions
A = wb.active
A.title = "Assumptions"
title(A, "Assumptions", "Every input lives here, one per cell. Blue text = typed input; yellow fill = key lever. "
      "No number is typed into any formula elsewhere in the workbook.")
A.sheet_view.showGridLines = False

A["A4"] = "Pricing"; A["A4"].font = f(True, NAVY, 11)
rows = [
    (5, "Commission rate (share of trade value)", 0.002, PCT2, "CommissionRate", "Source: assignment brief (0.20% of trade value)."),
    (6, "Minimum commission per trade ($)", 1, USD2, "MinCommission", "Source: assignment brief ($1 minimum per trade)."),
    (7, "Subscription price ($ per month)", 9.99, USD2, "SubPrice", "Source: assignment brief ($9.99/month, unlimited commission-free trades)."),
]
for r, label, val, fmt, name, note in rows:
    A.cell(row=r, column=1, value=label).font = f()
    c = A.cell(row=r, column=2, value=val)
    c.font = f(color=BLUE); c.fill = YELLOW; c.number_format = fmt; c.border = BOX
    A.cell(row=r, column=3, value=note).font = f(color="5A6577", size=9, italic=True)
    wb.defined_names[name] = DefinedName(name, attr_text=f"Assumptions!$B${r}")

A["A9"] = "Expected opt-in rate by segment"; A["A9"].font = f(True, NAVY, 11)
header_row(A, 10, ["Segment", "Opt-in rate", "Same as Data tab?"])
for i, (seg, rate) in enumerate([("Starter", 0.05), ("Regular", 0.30), ("Active", 0.70)]):
    r = 11 + i
    s = A.cell(row=r, column=1, value=seg); s.font = f(color=BLUE); s.border = BOX
    c = A.cell(row=r, column=2, value=rate)
    c.font = f(color=BLUE); c.fill = YELLOW; c.number_format = PCT1; c.border = BOX
    chk = A.cell(row=r, column=3,
                 value=f'=IF(B{r}=INDEX(Data!$E$2:$E$4,MATCH(A{r},Data!$A$2:$A$4,0)),"Yes","No: scenario")')
    chk.font = f(color=GREEN); chk.border = BOX
A["A15"] = ("Opt-in rates start equal to the Data tab (source: assignment brief). Change them here to run scenarios; "
            "the Model tab reads opt-in from this table only.")
A["A15"].font = f(color="5A6577", size=9, italic=True)

A["A17"] = "Model assumptions (stated, not numeric)"; A["A17"].font = f(True, NAVY, 11)
for i, t in enumerate([
    "1. Trades per month do not change when a customer subscribes (subscribers trade for free, so their commission becomes 0).",
    "2. Every trade is valued at the segment's average trade value, so commission per trade = MAX(rate x average value, minimum).",
    "3. Opt-in rates do not depend on the price. Question 3 in the Model tab explains why this is unrealistic.",
    "4. Revenue is monthly, commission plus subscription fees only (interest on cash is unaffected and left out).",
]):
    A.cell(row=18 + i, column=1, value=t).font = f(size=9)

A.column_dimensions["A"].width = 44
A.column_dimensions["B"].width = 14
A.column_dimensions["C"].width = 70

# ---------------------------------------------------------------------- Data
D = wb.create_sheet("Data")
D.sheet_view.showGridLines = False
header_row(D, 1, ["segment", "customers", "trades_per_month", "avg_trade_value_usd", "expected_opt_in"])
data = [("Starter", 40000, 2, 800, 0.05), ("Regular", 15000, 8, 2500, 0.30), ("Active", 4000, 30, 6000, 0.70)]
for i, row in enumerate(data):
    for j, v in enumerate(row):
        c = D.cell(row=2 + i, column=1 + j, value=v)
        c.font = f(color=BLUE); c.border = BOX
        c.number_format = [None, INT, INT, USD0, PCT1][j] or "General"
D["A6"] = "Source: assignment brief, Section E (monthly figures by customer segment)."
D["A6"].font = f(color="5A6577", size=9, italic=True)
for col, w in zip("ABCDE", [14, 14, 18, 20, 16]):
    D.column_dimensions[col].width = w

# --------------------------------------------------------------------- Model
M = wb.create_sheet("Model")
M.sheet_view.showGridLines = False
title(M, "Model: monthly revenue, current vs subscription pricing",
      "Black = formula, green = link to another tab, blue on yellow = input. All $ are per month.")

cols = ["Segment", "Customers", "Trades per month", "Avg trade value ($)", "Commission per trade ($)",
        "Commission per customer ($/mo)", "Current revenue ($/mo)", "Opt-in rate", "Subscribers",
        "Non-subscribers", "Subscription revenue ($/mo)", "Commission from non-subscribers ($/mo)",
        "Proposed revenue ($/mo)", "Difference ($/mo)", "Difference (%)", "Commission given up by subscribers ($/mo)",
        "More or less under subscription?"]
header_row(M, 4, cols)
M.row_dimensions[4].height = 44

for i in range(3):
    r = 5 + i
    d = 2 + i
    formulas = {
        "A": (f"=Data!A{d}", None, GREEN),
        "B": (f"=Data!B{d}", INT, GREEN),
        "C": (f"=Data!C{d}", INT, GREEN),
        "D": (f"=Data!D{d}", USD0, GREEN),
        "E": (f"=MAX(CommissionRate*D{r},MinCommission)", USD2, None),
        "F": (f"=C{r}*E{r}", USD2, None),
        "G": (f"=B{r}*F{r}", USD0, None),
        "H": (f"=INDEX(Assumptions!$B$11:$B$13,MATCH(A{r},Assumptions!$A$11:$A$13,0))", PCT1, GREEN),
        "I": (f"=B{r}*H{r}", INT, None),
        "J": (f"=B{r}-I{r}", INT, None),
        "K": (f"=I{r}*SubPrice", USD0, None),
        "L": (f"=J{r}*F{r}", USD0, None),
        "M": (f"=K{r}+L{r}", USD0, None),
        "N": (f"=M{r}-G{r}", USD0, None),
        "O": (f"=IF(G{r}=0,0,N{r}/G{r})", PCT1, None),
        "P": (f"=I{r}*F{r}", USD0, None),
        "Q": (f'=IF(N{r}>0,"More",IF(N{r}<0,"Less","Same"))', None, None),
    }
    for col, (fx, fmt, color) in formulas.items():
        c = M[f"{col}{r}"]
        c.value = fx
        c.font = f(color=color or "000000")
        c.border = BOX
        if fmt:
            c.number_format = fmt

tr = 8
M[f"A{tr}"] = "Total"
for col in "BGIJKLMNP":
    M[f"{col}{tr}"] = f"=SUM({col}5:{col}7)"
M[f"O{tr}"] = f"=IF(G{tr}=0,0,N{tr}/G{tr})"
M[f"Q{tr}"] = f'=IF(N{tr}>0,"More",IF(N{tr}<0,"Less","Same"))'
fmts = {"B": INT, "G": USD0, "I": INT, "J": INT, "K": USD0, "L": USD0, "M": USD0, "N": USD0, "O": PCT1, "P": USD0}
for col in "ABCDEFGHIJKLMNOPQ":
    c = M[f"{col}{tr}"]
    c.font = f(True)
    c.fill = TOTAL
    c.border = BOX
    if col in fmts:
        c.number_format = fmts[col]

# Summary with one filter cell
M["A11"] = "Summary (filter by segment)"; M["A11"].font = f(True, NAVY, 12)
M["A12"] = "Segment filter: pick All, Starter, Regular or Active"
M["B12"] = "All"
M["B12"].font = f(True, BLUE); M["B12"].fill = YELLOW; M["B12"].border = BOX
M["B12"].alignment = Alignment(horizontal="center")
M["B12"].comment = Comment("Input cell. Drop-down: All, Starter, Regular, Active. Every summary figure below follows it.", "Model")
dv = DataValidation(type="list", formula1='"All,Starter,Regular,Active"', allow_blank=False,
                    showErrorMessage=True, errorTitle="Segment", error="Pick All, Starter, Regular or Active.")
M.add_data_validation(dv)
dv.add("B12")

crit = 'IF($B$12="All","*",$B$12)'   # "*" makes SUMIFS match every segment
summary = [
    (13, "Revenue under current pricing ($/mo)", f"=SUMIFS($G$5:$G$7,$A$5:$A$7,{crit})", USD0),
    (14, "Revenue under subscription pricing ($/mo)", f"=SUMIFS($M$5:$M$7,$A$5:$A$7,{crit})", USD0),
    (15, "Difference ($/mo)", "=B14-B13", USD0),
    (16, "Difference (%)", "=IF(B13=0,0,B15/B13)", PCT1),
    (17, "Subscribers", f"=SUMIFS($I$5:$I$7,$A$5:$A$7,{crit})", INT),
    (18, "Break-even price for the filtered segment(s) ($/mo)",
     f"=IF(B17=0,0,SUMIFS($P$5:$P$7,$A$5:$A$7,{crit})/B17)", USD2),
]
for r, lab, fx, fmt in summary:
    M[f"A{r}"] = lab; M[f"A{r}"].font = f()
    c = M[f"B{r}"]; c.value = fx; c.number_format = fmt; c.font = f(True); c.border = BOX

# Break-even (all segments) with a proof
M["A21"] = "Break-even subscription price (all segments)"; M["A21"].font = f(True, NAVY, 12)
M["A22"] = "Price that keeps total revenue unchanged ($/mo)"
M["B22"] = "=SUMPRODUCT($B$5:$B$7,$H$5:$H$7,$F$5:$F$7)/SUMPRODUCT($B$5:$B$7,$H$5:$H$7)"
M["B22"].number_format = USD2; M["B22"].font = f(True); M["B22"].fill = TOTAL; M["B22"].border = BOX
M["C22"] = "Commission given up by subscribers divided by the number of subscribers (SUMPRODUCT)"
M["C22"].font = f(color="5A6577", size=9, italic=True)
M["A23"] = "Check: proposed revenue at that price ($/mo)"
M["B23"] = "=$I$8*B22+$L$8"
M["A24"] = "Check: current revenue ($/mo)"
M["B24"] = "=$G$8"
M["A25"] = "Check: gap (should be 0)"
M["B25"] = "=ROUND(B23-B24,6)"
for r in (23, 24, 25):
    M[f"A{r}"].font = f(size=9)
    M[f"B{r}"].number_format = USD2; M[f"B{r}"].font = f(size=9); M[f"B{r}"].border = BOX

# Answers
M["A28"] = "Answers"; M["A28"].font = f(True, NAVY, 12)
M["A29"] = "Q1. Which segments bring more revenue under the subscription, and which bring less? Why?"
M["A29"].font = f(True)
header_row(M, 30, ["Segment", "Difference ($/mo)", "More or less?", "Why"])
M.merge_cells("D30:K30")
for i in range(3):
    r = 31 + i
    s = 5 + i
    M[f"A{r}"] = f"=A{s}"
    M[f"B{r}"] = f"=N{s}"; M[f"B{r}"].number_format = USD0
    M[f"C{r}"] = f"=Q{s}"
    M[f"D{r}"] = (f'="Pays "&TEXT(F{s},"$#,##0.00")&" commission vs "&TEXT(SubPrice,"$#,##0.00")&" fee: each opt-in "'
                  f'&IF(F{s}<SubPrice,"adds ","costs ")&TEXT(ABS(SubPrice-F{s}),"$#,##0.00")&"/mo."')
    for col in "ABCD":
        M[f"{col}{r}"].border = BOX
        M[f"{col}{r}"].font = f()
    M[f"D{r}"].alignment = Alignment(wrap_text=True, vertical="top")
    M.merge_cells(f"D{r}:K{r}")
    M.row_dimensions[r].height = 30
M["A34"] = "Only segments paying less commission than the price gain; Active's loss dominates."
M["A34"].font = f(size=9, italic=True)

M["A36"] = "Q2. At these opt-in rates, what subscription price keeps total revenue unchanged?"
M["A36"].font = f(True)
M["A37"] = "Break-even price ($/mo), calculated in B22:"
M["B37"] = "=B22"; M["B37"].number_format = USD2; M["B37"].font = f(True); M["B37"].fill = TOTAL; M["B37"].border = BOX

M["A39"] = "Q3. Why are these opt-in rates unlikely to hold at that price, and what pricing would you test instead?"
M["A39"].font = f(True)
M["A40"] = ("Customers subscribe only when it saves them money, so at the break-even price only Active traders would join. "
            "I would test a tiered plan for Active traders instead ($49 to $99 a month for discounted commission or capped free trades).")
M["A40"].alignment = Alignment(wrap_text=True, vertical="top")
M.merge_cells("A40:H43")
M["A40"].font = f()

widths = {"A": 46, "B": 16, "C": 14, "D": 14, "E": 14, "F": 16, "G": 16, "H": 10, "I": 12, "J": 13,
          "K": 15, "L": 18, "M": 16, "N": 15, "O": 12, "P": 18, "Q": 15}
for col, w in widths.items():
    M.column_dimensions[col].width = w
M.freeze_panes = "B5"

wb.calculation.fullCalcOnLoad = True
wb.active = wb.sheetnames.index("Model")
wb.save(OUT)
print("saved", OUT)
