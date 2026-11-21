"""Build site/index.html (single-file artifact) from content/answers.md + site/template.html + site/*.js."""
import base64
import re
import html
import markdown
import os
import shutil
import subprocess

# English only. The Hebrew version was removed; HEBREW = False keeps the shared code on its English-only path.
HEBREW = False
SQLJS_DIR = os.environ.get("SQLJS_DIR")
if SQLJS_DIR:
    subprocess.run(["node", "build/cohort_data.js", SQLJS_DIR], check=True)

md_en = open("content/answers.md", encoding="utf-8").read()
md_he = md_en  # no Hebrew text any more: the English stands in, and only English is output
EXT = ["tables", "fenced_code", "nl2br"]
body_en = markdown.markdown(md_en, extensions=EXT)
body_he = markdown.markdown(md_he, extensions=EXT)

# --- sections: split on <h1>; English sections pair with Hebrew ones by order (the Hebrew notes page has no English twin)
SECTION_META = {
    "הערות אישיות על הפרויקט": ("notes", "", "הערות אישיות", "הערות אישיות"),
    "General assumptions": ("assumptions", "", "General assumptions", "חל על כל התשובות"),
    "Section A: SQL": ("section-a", "25", "SQL", "SQL"),
    "Section B: Metrics": ("section-b", "15", "Metrics", "מדדים"),
    "Section C: Data quality": ("section-c", "10", "Data quality", "איכות נתונים"),
    "Section D: Analytical reasoning": ("section-d", "10", "Analytical reasoning", "חשיבה אנליטית"),
    "Section E: Excel model": ("section-e", "20", "Excel model", "מודל אקסל"),
    "Section F: Business review": ("section-f", "20", "Business review", "סקירה עסקית"),
}
parts_en = re.split(r"<h1>(.*?)</h1>", body_en)
parts_he = re.split(r"<h1>(.*?)</h1>", body_he)
he_sections = [(parts_he[k], parts_he[k + 1]) for k in range(1, len(parts_he), 2)]
out = []
nav = []
pages = []
first_page = {}

LANGS = {
    "en": dict(label="The question", pts="pts", code="Snowflake SQL · submitted answer", dl="Download Section_E_Subscription_Model.xlsx"),
    "he": dict(label="השאלה", pts="נק׳", code="Snowflake SQL · התשובה שהוגשה", dl="הורדת Section_E_Subscription_Model.xlsx"),
}
WIDGET_RE = re.compile(r'(<div class="sqlrun"[^>]*></div>|<div id="(?:excel-widget|d1-widget|e-calc-box)"></div>)')


def EN_L(en, he_text):
    """Inline text in both languages; CSS shows the one that matches <html lang>."""
    if not HEBREW:
        return en
    return f'<span class="l-en">{en}</span><span class="l-he">{he_text}</span>'


def transform(content, lang):
    """Markdown HTML -> site HTML for one language."""
    L = LANGS[lang]

    def h2(m):
        text = m.group(1)
        pm = re.search(r"\((\d+) (?:points?|נקודות|נקודה)\)", text)
        clean = re.sub(r"\s*\(\d+ (?:points?|נקודות|נקודה)\)", "", text)
        qid = clean.split(".")[0].lower() if re.match(r"^[A-F]\d", clean) else re.sub(r"\W+", "-", clean.lower())
        pill = f'<span class="pts">{pm.group(1)} {L["pts"]}</span>' if pm else ""
        return f'<h3 id="q-{qid}" class="qhead l-{lang}"><span>{clean}</span>{pill}</h3>'
    content = re.sub(r"<h2>(.*?)</h2>", h2, content)
    content = content.replace("<blockquote>", f'<blockquote class="brief"><span class="brief-label">{L["label"]}</span>')
    content = re.sub(r"<!-- widget:(sql-a\d) -->", lambda m: f'<div class="sqlrun" data-q="{m.group(1)[4:]}"></div>', content)
    content = content.replace("<!-- widget:cohort -->", "")  # A2 cohort table: Word only, not on the site
    content = content.replace("<!-- widget:excel -->", '<div id="excel-widget"></div>')
    content = content.replace("<!-- widget:ecalc -->", '<div id="e-calc-box"></div>')
    # Excel download: GitHub Pages serves the file (copied into docs/ below), so the artifact can link to it too
    content = content.replace("<strong>Section_E_Subscription_Model.xlsx</strong>",
        '<a class="dl" href="https://giladct.github.io/avatrade/Section_E_Subscription_Model.xlsx" target="_blank" rel="noopener">'
        f'&#x2B07; {L["dl"]}</a>')
    content = content.replace("<!-- widget:samplesize -->", '<div id="d1-widget"></div>')
    content = content.replace("<!-- widget:section-f -->", "")  # F charts: removed from the site
    content = content.replace("<!-- note -->", '<div class="callout">').replace("<!-- /note -->", "</div>")
    content = content.replace('<pre><code class="language-sql">',
                              f'<div class="codebox"><div class="codebar"><span>{L["code"]}</span>'
                              '</div><pre><code class="language-sql">')
    content = content.replace("</code></pre>", "</code></pre></div>")
    content = content.replace("<table>", '<div class="tablewrap"><table>').replace("</table>", "</table></div>")
    # Section E: the live model has its own results and "How it is calculated" that react to the sliders
    content = re.sub(r'<p><strong>How it is calculated</strong></p>\s*<ul>.*?</ul>\s*<div class="tablewrap">.*?</div>\s*', '<div id="e-calc-box"></div>', content, flags=re.S)
    content = re.sub(r'<p><strong>Results \(monthly\)</strong></p>\s*<div class="tablewrap">.*?</div>\s*', "", content, flags=re.S)
    return content


def bilingual(en, he_text):
    """Text is written twice (one block per language); widgets between the text blocks are shared and drawn by app.js."""
    pe, ph = WIDGET_RE.split(en), WIDGET_RE.split(he_text)
    assert pe[1::2] == ph[1::2], f"widgets differ between English and Hebrew: {pe[1::2]} vs {ph[1::2]}"
    if not HEBREW:
        return en
    res = []
    for k, (a, b) in enumerate(zip(pe, ph)):
        if k % 2:
            res.append(a)
        elif a.strip() or b.strip():
            res.append(f'<div class="l-en">{a}</div><div class="l-he" dir="rtl" lang="he">{b}</div>')
    return "".join(res)


def split_head(q):
    m = re.match(r'(<h3[^>]*>.*?</h3>)(.*)', q, flags=re.S)
    return m.group(1), m.group(2)


he_iter = iter(he_sections)
toc_groups = []
for k in range(1, len(parts_en), 2):
    title = parts_en[k]
    sid, pts, short, short_he = SECTION_META[title]
    notes = sid == "notes"
    title_he, content_he = ("", "") if notes else next(he_iter)
    content = transform(parts_en[k + 1], "en")
    content_he = transform(content_he, "he") if not notes else ""
    letter = title.split(":")[0].replace("Section ", "") if title.startswith("Section") else "·"
    name = title.split(": ", 1)[1] if ": " in title else title
    name_he = title_he.split(": ", 1)[1] if ": " in title_he else title_he
    sym = "i" if notes else "•"  # symbol for the two pages that are not lettered sections

    # one page per question; text before the first question stays on the first page
    chunks = re.split(r'(?=<h3 id="q-)', content)
    chunks_he = re.split(r'(?=<h3 id="q-)', content_he) if not notes else [""]
    intro, qs = chunks[0], chunks[1:]
    intro_he, qs_he = chunks_he[0], chunks_he[1:]
    if not notes:
        assert len(qs) == len(qs_he), f"{title}: {len(qs)} English questions, {len(qs_he)} Hebrew"
    crumb_pts = f'<span class="crumb-pts">{EN_L(pts + " pts", pts + " נק׳")}</span>' if pts else ""
    if letter != "·":
        crumb_text = EN_L(f"Section {letter} · {name}", f"חלק {letter} · {name_he}")
    else:
        crumb_text = "אודות העבודה" if notes else EN_L("Read first", "קראו קודם")
    crumb = f'<p class="crumb"><b>{letter if letter != "·" else sym}</b><span>{crumb_text}</span>{crumb_pts}</p>'
    chips = []
    sec_start = len(pages)
    if not qs:
        pid = sid if letter == "·" else letter.lower()
        ptitle = name if letter == "·" else f"{letter}. {name}"
        ptitle_he = name_he if letter == "·" else f"{letter}. {name_he}"
        if notes:
            qhtml = f'<h3 class="qhead"><span>{ptitle}</span></h3>'
            body_html = intro
            rtl = ' dir="rtl" lang="he"'  # personal notes are in Hebrew in both views
            ptitle_he = ptitle
        else:
            def pill(lang):
                return f'<span class="pts">{pts} {LANGS[lang]["pts"]}</span>' if pts else ""
            qhtml = (f'<h3 class="qhead l-en"><span>{ptitle}</span>{pill("en")}</h3>'
                     + (f'<h3 class="qhead l-he"><span>{ptitle_he}</span>{pill("he")}</h3>' if HEBREW else ""))
            body_html = bilingual(intro, intro_he)
            rtl = ""
        out.append(f'<section class="sec page" id="p-{pid}" data-page="{pid}" data-sec="{sid}" data-title="{html.escape(ptitle)}" '
                   f'data-title-he="{html.escape(ptitle_he)}"{rtl} hidden>{crumb}{qhtml}{body_html}</section>')
        pages.append((pid, ptitle, ptitle_he, pts))
        chips.append(f'<a href="#{pid}" data-page="{pid}">{letter + "1" if letter != "·" else sym}</a>')  # a lettered section with one page: A-style chip, e.g. E1
        first = pid
    else:
        first = None
        for j, (q, qh) in enumerate(zip(qs, qs_he)):
            pid = re.match(r'<h3 id="q-([^"]+)"', q).group(1)
            assert re.match(r'<h3 id="q-([^"]+)"', qh).group(1) == pid, f"question ids differ at {pid}"
            ptitle = html.unescape(re.sub(r"<[^>]+>", "", re.search(r'<span>(.*?)</span>', q).group(1)))
            ptitle_he = html.unescape(re.sub(r"<[^>]+>", "", re.search(r'<span>(.*?)</span>', qh).group(1)))
            qpts = re.search(r'class="pts">(\d+) pts', q)
            q = re.sub(r'<h3 id="q-[^"]+"', '<h3', q, count=1)
            qh = re.sub(r'<h3 id="q-[^"]+"', '<h3', qh, count=1)
            h_en, rest_en = split_head(q)
            h_he, rest_he = split_head(qh)
            if j == 0:  # the section's lead-in (Section F's case data) goes right under the first question's heading
                rest_en, rest_he = intro + rest_en, intro_he + rest_he
            out.append(f'<section class="sec page" id="p-{pid}" data-page="{pid}" data-sec="{sid}" data-title="{html.escape(ptitle)}" '
                       f'data-title-he="{html.escape(ptitle_he)}" hidden>{crumb}{h_en}{h_he if HEBREW else ""}{bilingual(rest_en, rest_he)}</section>')
            pages.append((pid, ptitle, ptitle_he, qpts.group(1) if qpts else ""))
            chips.append(f'<a href="#{pid}" data-page="{pid}">{pid.upper()}</a>')
            first = first or pid
    first_page[sid] = first
    toc_groups.append((letter, name, name_he, pts, pages[sec_start:]))
    single = " single" if (not qs and letter == "·") else ""  # lettered one-page sections (E) still show their chip (E1)
    nav.append(f'<div class="r-sec{single}" data-sec="{sid}"><a class="r-head" href="#{first}" data-sec="{sid}"><b>{letter if letter != "·" else sym}</b>'
               f'<span class="l-en">{short}</span>' + (f'<span class="l-he">{short_he}</span>' if HEBREW else "")
               + (f'<em>{pts}</em>' if pts else "") + f'</a><div class="r-qs">{"".join(chips)}</div></div>')

def toc_item(pid, t, th, p):
    return (f'<a href="#{pid}"><b>{(pid.upper() + "1" if pid == "e" else pid.upper()) if len(pid) <= 2 else ("i" if pid == "notes" else "•")}</b>'
            f'<span class="l-en">{html.escape(t.split(". ", 1)[-1])}</span>' + (f'<span class="l-he">{html.escape(th.split(". ", 1)[-1])}</span>' if HEBREW else "")
            + '</a>')  # no per-question points in the contents


# one block per section (A to F); the unlettered pages (notes, assumptions) form the first block
head_pages = [pg for g in toc_groups if g[0] == "·" for pg in g[4]]
blocks = [("·", "Read first", "קראו קודם", "", head_pages)] + [g for g in toc_groups if g[0] != "·"]
toc = ""
for letter, name, name_he, pts, grp in blocks:
    label = (f'{letter} · {name}' if letter != "·" else EN_L("Read first", "קראו קודם"))
    if letter != "·":
        label = EN_L(f"{letter} · {name}", f"{letter} · {name_he}")
    n = len(grp)
    toc += (f'<div class="toc-group"><p class="toc-head"><span>{label}</span></p>'
            f'<nav class="toc" aria-label="Section {letter}">' + "".join(toc_item(*pg) for pg in grp) + '</nav></div>')

tpl = open("site/template.html", encoding="utf-8").read()
if not HEBREW:  # no language button and no Hebrew twins of the static text
    tpl = re.sub(r'\s*<button class="langbtn".*?</button>', "", tpl, flags=re.S)
    tpl = re.sub(r'<span class="l-he">[^<]*</span>', "", tpl)
js = open("site/app.js", encoding="utf-8").read()
sqljs = open("site/sqldemo.js", encoding="utf-8").read()
cohortjs = open("site/cohort.js", encoding="utf-8").read()
a2_json = open("site/a2_data.json", encoding="utf-8").read()
page = (tpl.replace("{{NAV}}", "\n".join(nav)).replace("{{TOC}}", toc)
           .replace("{{CONTENT}}", "\n".join(out))
           .replace("{{APP_JS}}", js)
           .replace("{{SQL_JS}}", sqljs)
           .replace("{{COHORT_JS}}", "window.A2_DATA = " + a2_json + ";\n" + cohortjs))
if not HEBREW:
    page = re.sub(r' data-title-he="[^"]*"', "", page)
open("site/index.html", "w", encoding="utf-8").write(page)
print("site/index.html", len(page) // 1024, "KB")

# local preview copy with the skeleton the artifact host adds; docs/ is the GitHub Pages copy
os.makedirs("docs", exist_ok=True)
shutil.copy("deliverables/Section_E_Subscription_Model.xlsx", "docs/Section_E_Subscription_Model.xlsx")
title_m = re.search(r"<title>.*?</title>", page)  # a full page keeps its title in <head>
title = title_m.group(0) if title_m else "<title>BA Assessment Answers</title>"
body = page.replace(title, "", 1) if title_m else page
full = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' + title +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    '<style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}[hidden]{display:none!important}</style>'
    '</head><body>' + body + '</body></html>')
# Microsoft Clarity analytics: only on the public GitHub Pages copy (not the artifact, not the local preview)
CLARITY = """<script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "zh7xqq2fr1");
</script>"""
open("site/preview.html", "w", encoding="utf-8").write(full)
open("docs/index.html", "w", encoding="utf-8").write(full.replace("</head>", CLARITY + "</head>", 1))
