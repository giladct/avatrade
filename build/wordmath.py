"""D1 sample-size calculation as real Word equations (MathML -> OMML through Office's MML2OMML.XSL)."""
import math
import os
from lxml import etree
from docx.oxml import parse_xml
from docx.oxml.ns import qn
from docx.shared import Pt

XSL = r"C:\Program Files\Microsoft Office\root\Office16\MML2OMML.XSL"
M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"

mi = lambda t: f"<mi>{t}</mi>"
mn = lambda t: f"<mn>{t}</mn>"
mo = lambda t: f"<mo>{t}</mo>"
mt = lambda t: f"<mtext>{t}</mtext>"
mr = lambda *a: "<mrow>" + "".join(a) + "</mrow>"
sq = lambda x: f"<msqrt>{x}</msqrt>"
fr = lambda a, b: f"<mfrac>{a}{b}</mfrac>"
sb = lambda a, b: f"<msub>{a}{b}</msub>"
sp = lambda a, b: f"<msup>{a}{b}</msup>"
P = lambda *a: mr(mo("("), *a, mo(")"))
dot, minus, plus, eq = mo("⋅"), mo("−"), mo("+"), mo("=")
pv = lambda k: sb(mi("p"), mn(k))
bar = f"<mover>{mi('p')}<mo>‾</mo></mover>"
one = lambda x: P(mn("1"), minus, x)
zA = sb(mi("z"), mr(mi("α"), mo("/"), mn("2")))
zB = sb(mi("z"), mi("β"))


def _omml(mathml):
    xslt = etree.XSLT(etree.parse(XSL))
    src = etree.fromstring(f'<math xmlns="http://www.w3.org/1998/Math/MathML">{mathml}</math>'.replace("<m", "<m", 1))
    # the builders emit un-namespaced tags; put them in the MathML namespace
    for el in src.iter():
        if isinstance(el.tag, str) and not el.tag.startswith("{"):
            el.tag = "{http://www.w3.org/1998/Math/MathML}" + el.tag
    out = xslt(src)
    return etree.tostring(out.getroot() if hasattr(out, "getroot") else out)


def _math_el(mathml):
    root = etree.fromstring(_omml(mathml))
    oM = root if root.tag == f"{{{M_NS}}}oMath" else root.find(f".//{{{M_NS}}}oMath")
    return parse_xml(etree.tostring(oM).decode())


def add_math_par(doc, mathml, display=True):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    if display:
        wrap = parse_xml(f'<m:oMathPara xmlns:m="{M_NS}"/>')
        wrap.append(_math_el(mathml))
        p._p.append(wrap)
    else:
        p._p.append(_math_el(mathml))
    return p


def d1_block(doc, add_runs, base=0.18, diff=0.04, power=0.8, weekly=1000):
    Z = {0.8: 0.8416, 0.9: 1.2816}
    p1, p2 = base, base + diff
    pb = (p1 + p2) / 2
    z = Z[power]
    A = 1.96 * math.sqrt(2 * pb * (1 - pb))
    B = z * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))
    n = math.ceil((A + B) ** 2 / diff ** 2)
    total = 2 * n
    weeks = max(2, math.ceil(total / weekly))
    d2 = lambda v: f"{v:.2f}"
    num = lambda v: f"{v:,.0f}"
    pct = lambda v: f"{round(v * 100, 1):g}%"
    dd = f"{diff * diff:.4f}"

    p = doc.add_paragraph()
    p.paragraph_format.keep_with_next = True
    add_runs(p, "**How the numbers are calculated**")
    p = doc.add_paragraph()
    p.paragraph_format.keep_with_next = True
    add_runs(p, "Inputs: ")
    # inline equations inside one sentence
    def inl(x): p._p.append(_math_el(x))
    def txt(t): add_runs(p, t)
    inl(mr(pv("1"), eq, mn(pct(p1)))); txt(",  ")
    inl(mr(pv("2"), eq, mn(pct(p2)))); txt(",  ")
    inl(mr(bar, eq, fr(mr(pv("1"), plus, pv("2")), mn("2")), eq, mn(pct(pb)))); txt(",  ")
    inl(mr(zA, eq, mn("1.96"))); txt(" (5% significance, two-sided),  ")
    inl(mr(zB, eq, mn(str(z)))); txt(f" ({int(power * 100)}% power),  ")
    inl(mr(mi("W"), eq, mn(num(weekly)))); txt(" sign-ups per week.")

    gen = mr(mi("n"), eq, fr(sp(P(mi("A"), plus, mi("B")), mn("2")), sp(P(pv("2"), minus, pv("1")), mn("2"))))
    def_a = mr(mi("A"), eq, zA, dot, sq(mr(mn("2"), dot, bar, dot, one(bar))), eq, mn("1.96"), dot,
               sq(mr(mn("2"), dot, mn(d2(pb)), dot, mn(d2(1 - pb)))), eq, mn(f"{A:.3f}"))
    def_b = mr(mi("B"), eq, zB, dot, sq(mr(pv("1"), dot, one(pv("1")), plus, pv("2"), dot, one(pv("2")))), eq, mn(str(z)), dot,
               sq(mr(mn(d2(p1)), dot, mn(d2(1 - p1)), plus, mn(d2(p2)), dot, mn(d2(1 - p2)))), eq, mn(f"{B:.3f}"))
    result = mr(mi("n"), eq, fr(sp(P(mn(f"{A:.3f}"), plus, mn(f"{B:.3f}")), mn("2")), sp(P(mn(d2(p2)), minus, mn(d2(p1))), mn("2"))),
                eq, fr(mn(f"{(A + B) ** 2:.3f}"), mn(dd)), eq, mn(num(n)))
    total_m = mr(mi("N"), eq, mn("2"), dot, mi("n"), eq, mn("2"), dot, mn(num(n)), eq, mn(num(total)))
    weeks_m = mr(mt("weeks"), eq, mi("max"), P(mn("2"), mo(","), mo("⌈"), fr(mi("N"), mi("W")), mo("⌉")), eq,
                 mi("max"), P(mn("2"), mo(","), mo("⌈"), fr(mn(num(total)), mn(num(weekly))), mo("⌉")), eq, mn(str(weeks)))

    def label(t):
        q = doc.add_paragraph(); q.paragraph_format.keep_with_next = True; q.paragraph_format.space_before = Pt(4)
        add_runs(q, t)
    label("**Users per group**")
    for m in (gen, def_a, def_b, result):
        add_math_par(doc, m).paragraph_format.keep_with_next = True
    label("**Total users**")
    add_math_par(doc, total_m).paragraph_format.keep_with_next = True
    label("**Weeks to run** (never below 2)")
    add_math_par(doc, weeks_m)
    assert (n, total, weeks) == (1569, 3138, 4), (n, total, weeks)
