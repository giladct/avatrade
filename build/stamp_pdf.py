"""Adds a running footer (name, title, page N of M) to every page of the printed PDF and the AvaTrade logo to page 1.
Chrome's own footer is switched off in build_pdf.sh, because it cannot be styled from the command line.
The footer sits in the 12 mm bottom print margin, so the page layout does not change."""
import sys, pymupdf

path = sys.argv[1] if len(sys.argv) > 1 else "deliverables/BA_Assessment_Gilad_Cohen-Tal.pdf"
doc = pymupdf.open(path)
n = len(doc)
INK = (0.42, 0.45, 0.50)
for i, page in enumerate(doc):
    w, h = page.rect.width, page.rect.height
    y = h - 22
    page.draw_line((34, y - 11), (w - 34, y - 11), color=(0.85, 0.87, 0.9), width=0.5)
    page.insert_text((34, y), "Gilad Cohen-Tal  ·  Business Analyst Assessment  ·  AvaTrade", fontname="helv", fontsize=8, color=INK)
    label = f"Page {i + 1} of {n}"
    tw = pymupdf.get_text_length(label, fontname="helv", fontsize=8)
    page.insert_text((w - 34 - tw, y), label, fontname="helv", fontsize=8, color=INK)
page = doc[0]
page.insert_image(pymupdf.Rect(46, 44, 46 + 78, 44 + 78 * 204 / 490), filename="site/logo.png")
doc.save(path + ".tmp", garbage=3, deflate=True)
doc.close()
import os
os.replace(path + ".tmp", path)
print("stamped", n, "pages")
