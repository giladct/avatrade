"""Render the A2 result (sample data) as a colored table PNG for the Word/PDF: same data and colors as the site."""
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
from matplotlib.colors import LinearSegmentedColormap

OUT = "build/a2_result.png"
STOPS = ["#a50026", "#e0402e", "#f99a58", "#fee391", "#d9ef8b", "#7cc36a", "#1a9850", "#006837"]
cmap = LinearSegmentedColormap.from_list("rdylgn", STOPS)
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
FONT = "DejaVu Sans"
INK, INK2, HEAD = "#111a2b", "#44506a", "#eceff3"

rows = json.load(open("site/a2_data.json", encoding="utf-8"))
shares = [v for r in rows for v in r[2:5]]
lo, hi = min(shares), max(shares)
norm = lambda v: (v - lo) / (hi - lo) if hi > lo else 0.5

headers = ["Funding month", "Accounts\nfunded", "Traded in\nfunding month", "Traded\nmonth after", "Traded month\nafter that", "Avg commission,\nfirst 90 days"]
widths = [2.2, 1.6, 2.0, 2.0, 2.0, 2.2]
xs = [sum(widths[:i]) for i in range(len(widths))]
rh, hh = 0.62, 0.95
fig, ax = plt.subplots(figsize=(sum(widths) * 0.62, (hh + len(rows) * rh + 0.2) * 0.62), dpi=220)
ax.set_xlim(0, sum(widths)); ax.set_ylim(-(len(rows) * rh + 0.1), hh + 0.05); ax.axis("off")


def box(x, y, w, h, fc):
    ax.add_patch(FancyBboxPatch((x + 0.04, y + 0.05), w - 0.08, h - 0.1, boxstyle="round,pad=0,rounding_size=0.07", fc=fc, ec="none"))


for x, w, t in zip(xs, widths, headers):
    box(x, 0, w, hh, HEAD)
    ax.text(x + w / 2, hh / 2, t, ha="center", va="center", fontsize=6.8, weight="bold", family=FONT, color=INK, linespacing=1.1)

for i, r in enumerate(rows):
    y = -(i + 1) * rh
    mid = y + rh / 2
    ax.text(xs[0] + 0.12, mid, f"{MON[int(r[0][5:7]) - 1]} {r[0][:4]}", ha="left", va="center", fontsize=7.4, family=FONT, color=INK)
    ax.text(xs[1] + widths[1] / 2, mid, str(r[1]), ha="center", va="center", fontsize=7.4, family=FONT, color=INK2)
    for k in range(3):
        v = r[2 + k]
        col = cmap(norm(v))
        box(xs[2 + k], y, widths[2 + k], rh, col)
        lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2]
        ax.text(xs[2 + k] + widths[2 + k] / 2, mid, f"{v * 100:.1f}%", ha="center", va="center", fontsize=7.4,
                family=FONT, color="white" if lum < 0.5 else "#1b1f17")
    ax.text(xs[5] + widths[5] / 2, mid, f"${r[5]:.2f}", ha="center", va="center", fontsize=7.4, family=FONT, color=INK)

plt.savefig(OUT, bbox_inches="tight", pad_inches=0.04, facecolor="white")
print("saved", OUT)
