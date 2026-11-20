"""Render content/answers.md into the Word submission document."""
import re
import sys
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Cm

SRC = "content/answers.md"
OUT = sys.argv[1] if len(sys.argv) > 1 else "deliverables/BA_Assessment_Gilad_Cohen-Tal.docx"
NAME = "Gilad Cohen-Tal"
DATE = "21 November 2026"

NAVY = RGBColor(0x1F, 0x2A, 0x44)
ACCENT = RGBColor(0x2B, 0x5C, 0xD6)
MUTED = RGBColor(0x5A, 0x65, 0x77)
BODY = "Calibri"
MONO = "Consolas"

doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
for side in ("left_margin", "right_margin"):
    setattr(sec, side, Cm(2.2))
sec.top_margin, sec.bottom_margin = Cm(2.0), Cm(2.0)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = BODY
normal.font.size = Pt(10.5)
normal.element.rPr.rFonts.set(qn("w:eastAsia"), BODY)
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.12

for lvl, size, color, before, after in [(1, 18, NAVY, 18, 8), (2, 13, ACCENT, 14, 4), (3, 11, NAVY, 10, 3)]:
    st = styles[f"Heading {lvl}"]
    st.font.name = BODY
    st.font.size = Pt(size)
    st.font.bold = True
    st.font.color.rgb = color
    st.element.rPr.rFonts.set(qn("w:asciiTheme"), "")
    rf = st.element.rPr.rFonts
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rf.set(qn(a), BODY)
    st.paragraph_format.space_before = Pt(before)
    st.paragraph_format.space_after = Pt(after)
    st.paragraph_format.keep_with_next = True


def shade(el, hex_fill):
    pPr = el.get_or_add_pPr() if hasattr(el, "get_or_add_pPr") else el
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    pPr.append(shd)


def left_border(p, color="2B5CD6", size=18):
    pPr = p._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    left = OxmlElement("w:left")
    left.set(qn("w:val"), "single")
    left.set(qn("w:sz"), str(size))
    left.set(qn("w:space"), "8")
    left.set(qn("w:color"), color)
    bdr.append(left)
    pPr.append(bdr)


PPR_AFTER = ("w:tabs", "w:suppressAutoHyphens", "w:spacing", "w:ind", "w:contextualSpacing", "w:jc",
             "w:textDirection", "w:outlineLvl", "w:rPr")


def _insert_ppr(pPr, el):
    """Insert el into pPr before the first child that must follow it in the schema."""
    for k, child in enumerate(pPr):
        if child.tag in [qn(t) for t in PPR_AFTER]:
            pPr.insert(k, el)
            return
    pPr.append(el)


def note_box(p, color="2B5CD6", fill="EEF3FC"):
    """Boxed, shaded paragraph; adjacent boxed paragraphs merge into one box in Word."""
    pPr = p._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    for side in ("top", "left", "bottom", "right"):
        e = OxmlElement(f"w:{side}")
        e.set(qn("w:val"), "single"); e.set(qn("w:sz"), "6"); e.set(qn("w:space"), "6"); e.set(qn("w:color"), color)
        bdr.append(e)
    _insert_ppr(pPr, bdr)
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), fill)
    _insert_ppr(pPr, shd)
    p.paragraph_format.left_indent = Cm(0.25)
    p.paragraph_format.right_indent = Cm(0.25)


def cell_shade(cell, hex_fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


INLINE = re.compile(r"(\*\*.+?\*\*|`[^`]+`|\*[^*]+\*)")


def add_runs(p, text, size=None, color=None, italic=False):
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            r = p.add_run(part[2:-2]); r.bold = True
        elif part.startswith("`") and part.endswith("`"):
            r = p.add_run(part[1:-1]); r.font.name = MONO
            r._element.rPr.rFonts.set(qn("w:hAnsi"), MONO)
            r.font.size = Pt((size or 10.5) - 1)
            r.font.color.rgb = RGBColor(0x8A, 0x2B, 0x52)
        elif part.startswith("*") and part.endswith("*"):
            r = p.add_run(part[1:-1]); r.italic = True
        else:
            r = p.add_run(part)
        if size:
            r.font.size = Pt(size)
        if color is not None and not (part.startswith("`")):
            r.font.color.rgb = color
        if italic:
            r.italic = True
    return p


def page_number_footer(section):
    p = section.footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = p.add_run(f"{NAME} · Business Analyst Assessment · page ")
    r.font.size = Pt(8); r.font.color.rgb = MUTED
    run = p.add_run()
    for tag, txt in (("begin", None), (None, "PAGE"), ("end", None)):
        if tag:
            fc = OxmlElement("w:fldChar"); fc.set(qn("w:fldCharType"), tag); run._r.append(fc)
        else:
            it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = txt; run._r.append(it)
    run.font.size = Pt(8); run.font.color.rgb = MUTED


# ---------------------------------------------------------------- cover
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(120)
r = p.add_run("BUSINESS ANALYST ASSESSMENT"); r.font.size = Pt(10); r.bold = True; r.font.color.rgb = ACCENT
p = doc.add_paragraph()
r = p.add_run("Answers and analysis"); r.font.size = Pt(30); r.bold = True; r.font.color.rgb = NAVY
p = doc.add_paragraph()
r = p.add_run(f"{NAME}  ·  Business Analyst assessment, application to AvaTrade  ·  {DATE}"); r.font.size = Pt(12); r.font.color.rgb = MUTED
p.paragraph_format.space_after = Pt(36)

contents = [("הערות אישיות על הפרויקט", ""), ("General assumptions", ""), ("A", "SQL (25)"), ("B", "Metrics (15)"), ("C", "Data quality (10)"),
            ("D", "Analytical reasoning (10)"), ("E", "Excel model (20), workbook attached"), ("F", "Business review (20)")]
for k, v in contents:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    if v:
        r = p.add_run(f"Section {k}   "); r.bold = True; r.font.color.rgb = NAVY
        p.add_run(v).font.color.rgb = MUTED
    else:
        r = p.add_run(k); r.bold = True; r.font.color.rgb = NAVY

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(36)
add_runs(p, "Attached: **Section_E_Subscription_Model.xlsx**.",
         size=9.5, color=MUTED)
page_number_footer(sec)

# ---------------------------------------------------------------- body
lines = open(SRC, encoding="utf-8").read().splitlines()
i = 0
first_h1 = 2  # the notes and the general assumptions share the cover page
first_h2 = True


def flush_table(rows):
    header = [c.strip() for c in rows[0].strip("|").split("|")]
    body = [[c.strip() for c in r.strip("|").split("|")] for r in rows[2:]]
    t = doc.add_table(rows=1 + len(body), cols=len(header))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for j, h in enumerate(header):
        c = t.rows[0].cells[j]
        c.paragraphs[0].text = ""
        add_runs(c.paragraphs[0], h, size=9, color=NAVY)
        for r in c.paragraphs[0].runs:
            r.bold = True
        cell_shade(c, "DCE3EE")
    for ri, row in enumerate(body):
        for j, val in enumerate(row):
            c = t.rows[ri + 1].cells[j]
            c.paragraphs[0].text = ""
            add_runs(c.paragraphs[0], val, size=9)
            if j > 0 and re.match(r"^[\*\$−+\-\d(]", val.strip("* ")):
                c.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
    total = 16.6
    first = 7.0 if len(header) <= 4 else 3.2
    widths = [first] + [(total - first) / (len(header) - 1)] * (len(header) - 1)
    if header[0] == "Component":
        widths = [3.2, 6.4, 7.0]
    if header[0] == "#":
        widths = [0.7, 3.0, 3.9, 5.4, 3.6]
    if header[0] == "Metrics tested":
        widths = [3.0, 6.4, 3.8, 3.4]
    if header[0] == "Possible cause":
        widths = [3.0, 6.4, 7.2]
    if header[0] == "Problem (from F1)":
        widths = [3.4, 7.6, 5.6]
    if header[0] == "Data cut":
        widths = [3.8, 6.4, 6.4]
    if header[0] == "Step":
        widths = [3.2, 6.4, 7.0]
    if header[0] == "Definition":
        widths = [3.8, 3.6, 9.2]
    t.autofit = False
    for row in t.rows:
        for j, c in enumerate(row.cells):
            c.width = Cm(widths[j])
            c.paragraphs[0].paragraph_format.space_after = Pt(1)
            if row is not t.rows[-1]:
                c.paragraphs[0].paragraph_format.keep_with_next = True  # keep the table on one page
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


HEB = re.compile(r"[֐-׿]")
rtl_start = None


def make_rtl(paragraphs):
    """Right-to-left paragraphs (the Hebrew notes): bidi paragraph + rtl runs with complex-script size/bold."""
    for p in paragraphs:
        pPr = p._p.get_or_add_pPr()
        pPr.insert(0, OxmlElement("w:bidi")) if pPr.find(qn("w:bidi")) is None else None
        for r in p.runs:
            rPr = r._r.get_or_add_rPr()
            if HEB.search(r.text):
                rPr.append(OxmlElement("w:rtl"))
            sz = rPr.find(qn("w:sz"))
            if sz is not None:
                szcs = OxmlElement("w:szCs"); szcs.set(qn("w:val"), sz.get(qn("w:val"))); rPr.append(szcs)
            if r.bold:
                rPr.append(OxmlElement("w:bCs"))


in_note = False
while i < len(lines):
    line = lines[i]
    s = line.strip()
    if s == "<!-- widget:cohort -->":
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.keep_with_next = True
        add_runs(p, "**A2 result on sample data (illustration)**", color=NAVY)
        p = doc.add_paragraph()
        p.paragraph_format.keep_with_next = True
        add_runs(p, "Query output on generated sample data (not company data).", size=9, color=MUTED)
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run().add_picture("build/a2_result.png", width=Cm(13.5))
        i += 1; continue
    if s == "<!-- math:d1 -->":
        from wordmath import d1_block
        d1_block(doc, add_runs)
        i += 1; continue
    if s == "<!-- note -->":
        note_start = len(doc.paragraphs)
        in_note = True
        i += 1; continue
    if in_note and s.startswith("- "):
        # plain bullet paragraph, so its indent matches the box and the borders merge
        p = doc.add_paragraph()
        r = p.add_run("•  "); r.font.color.rgb = ACCENT
        add_runs(p, s[2:])
        p.paragraph_format.space_after = Pt(3)
        i += 1; continue
    if s == "<!-- /note -->":
        in_note = False
        box = doc.paragraphs[note_start:]
        for k, bp in enumerate(box):
            note_box(bp)
            bp.paragraph_format.keep_with_next = k < len(box) - 1
        box[-1].paragraph_format.space_after = Pt(6)
        i += 1; continue
    if s.startswith("<!--"):
        i += 1; continue
    if s.startswith("# "):
        if first_h1:  # notes + general assumptions share the cover page
            first_h1 -= 1
        else:
            doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
        if rtl_start is not None:
            make_rtl(doc.paragraphs[rtl_start:]); rtl_start = None
        doc.add_heading(s[2:], level=1)
        if HEB.search(s):
            rtl_start = len(doc.paragraphs) - 1
        first_h2 = True
        i += 1; continue
    if s.startswith("## "):
        h = doc.add_heading(s[3:], level=2)
        # questions flow on; only sections (H1) start a new page
        if not first_h2:
            h.paragraph_format.space_before = Pt(18)
        first_h2 = False
        i += 1; continue
    if s.startswith("```"):
        code = []
        i += 1
        while not lines[i].strip().startswith("```"):
            code.append(lines[i]); i += 1
        i += 1
        for k, cl in enumerate(code):
            p = doc.add_paragraph()
            pf = p.paragraph_format
            pf.space_after = Pt(0); pf.space_before = Pt(0); pf.line_spacing = 1.0
            pf.left_indent = Cm(0.2)
            if k == len(code) - 1:
                pf.space_after = Pt(8)
            r = p.add_run(cl if cl else " ")
            r.font.name = MONO
            r._element.rPr.rFonts.set(qn("w:hAnsi"), MONO)
            r.font.size = Pt(7.5)
            if cl.strip().startswith("--"):
                r.font.color.rgb = RGBColor(0x2E, 0x7D, 0x4F)
            elif "--" in cl:
                code_part, comment = cl.split("--", 1)
                r.text = code_part
                r2 = p.add_run("--" + comment)
                r2.font.name = MONO; r2._element.rPr.rFonts.set(qn("w:hAnsi"), MONO)
                r2.font.size = Pt(7.5); r2.font.color.rgb = RGBColor(0x2E, 0x7D, 0x4F)
            shade(p._p, "F3F5F9")
        continue
    if s.startswith("|"):
        rows = []
        while i < len(lines) and lines[i].strip().startswith("|"):
            rows.append(lines[i].strip()); i += 1
        flush_table(rows)
        continue
    if s.startswith("> "):
        p = doc.add_paragraph()
        add_runs(p, s[2:], size=9.5, color=MUTED, italic=True)
        left_border(p)
        p.paragraph_format.left_indent = Cm(0.3)
        p.paragraph_format.space_after = Pt(8)
        p.paragraph_format.keep_with_next = True  # question stays with its answer
        i += 1; continue
    m = re.match(r"^(\d+)\. (.*)", s)
    if s.startswith("- ") or m:
        style = "List Bullet" if s.startswith("- ") else "List Number"
        text = s[2:] if s.startswith("- ") else m.group(2)
        p = doc.add_paragraph(style=style)
        if m:
            # restartable numbering is fiddly in python-docx; write the number explicitly instead
            p.style = styles["Normal"]
            p.paragraph_format.left_indent = Cm(0.6)
            p.paragraph_format.first_line_indent = Cm(-0.6)
            r = p.add_run(f"{m.group(1)}.\t"); r.bold = True; r.font.color.rgb = ACCENT
            p.paragraph_format.tab_stops.add_tab_stop(Cm(0.6))
        add_runs(p, text)
        p.paragraph_format.space_after = Pt(3)
        i += 1
        # continuation lines (indented) belong to this item
        while i < len(lines) and lines[i].startswith("   ") and lines[i].strip():
            q = doc.add_paragraph()
            q.paragraph_format.left_indent = Cm(0.6)
            q.paragraph_format.space_after = Pt(3)
            add_runs(q, lines[i].strip(), size=10)
            i += 1
        continue
    if not s:
        i += 1; continue
    # plain paragraph (join soft-wrapped lines)
    buf = [s]
    i += 1
    while i < len(lines) and lines[i].strip() and not re.match(r"^(#|```|\||> |- |\d+\. |<!--)", lines[i].strip()):
        buf.append(lines[i].strip()); i += 1
    if len(buf) > 1 and all(b.startswith("=") or b.startswith("Break-even") for b in buf[1:]) or len(buf) > 1:
        # lines that were separated by hard breaks in the markdown stay on separate lines
        p = doc.add_paragraph()
        for k, b in enumerate(buf):
            add_runs(p, b)
            if k < len(buf) - 1:
                p.add_run().add_break()
    else:
        p = add_runs(doc.add_paragraph(), buf[0])
        if re.fullmatch(r"\*\*[^*]+\*\*", buf[0]):  # bold-only line = sub-heading: keep with what follows
            p.paragraph_format.keep_with_next = True
    # a line that introduces a table stays on the table's page
    j = i
    while j < len(lines) and not lines[j].strip():
        j += 1
    if j < len(lines) and lines[j].strip().startswith("|"):
        p.paragraph_format.keep_with_next = True

doc.core_properties.author = NAME
doc.core_properties.title = "Business Analyst Assessment: Answers"
doc.save(OUT)
print("saved", OUT)
