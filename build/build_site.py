"""Build site/index.html (single-file artifact) from content/answers.md + site/template.html + site/*.js."""
import re
import html
import markdown
import os
import subprocess

SQLJS_DIR = os.environ.get("SQLJS_DIR")
if SQLJS_DIR:
    subprocess.run(["node", "build/cohort_data.js", SQLJS_DIR], check=True)

md_src = open("content/answers.md", encoding="utf-8").read()
body = markdown.markdown(md_src, extensions=["tables", "fenced_code", "nl2br"])

# --- sections: split on <h1>
SECTION_META = {
    "General assumptions": ("assumptions", "", "Applies to every answer"),
    "Section A: SQL": ("section-a", "25", "SQL"),
    "Section B: Metrics": ("section-b", "15", "Metrics"),
    "Section C: Data quality": ("section-c", "10", "Data quality"),
    "Section D: Analytical reasoning": ("section-d", "10", "Analytical reasoning"),
    "Section E: Excel model": ("section-e", "20", "Excel model"),
    "Section F: Business review": ("section-f", "20", "Business review"),
}
parts = re.split(r"<h1>(.*?)</h1>", body)
out = []
nav = []
pages = []
first_page = {}


def _merge(q, intro):
    """The section's lead-in (Section F's case data) goes right under the first question's heading."""
    if not intro.strip():
        return q
    j = q.index("</h3>") + len("</h3>")
    return q[:j] + intro + q[j:]

for k in range(1, len(parts), 2):
    title = parts[k]
    content = parts[k + 1]
    sid, pts, short = SECTION_META[title]
    letter = title.split(":")[0].replace("Section ", "") if title.startswith("Section") else "·"
    name = title.split(": ", 1)[1] if ": " in title else title

    # h2 -> anchored question headings with points pill
    def h2(m):
        text = m.group(1)
        pm = re.search(r"\((\d+) points?\)", text)
        clean = re.sub(r"\s*\(\d+ points?\)", "", text)
        qid = clean.split(".")[0].lower() if re.match(r"^[A-F]\d", clean) else re.sub(r"\W+", "-", clean.lower())
        pill = f'<span class="pts">{pm.group(1)} pts</span>' if pm else ""
        return f'<h3 id="q-{qid}" class="qhead"><span>{clean}</span>{pill}</h3>'
    content = re.sub(r"<h2>(.*?)</h2>", h2, content)
    # question blockquotes
    content = content.replace("<blockquote>", '<blockquote class="brief"><span class="brief-label">The question</span>')
    # widgets
    content = re.sub(r"<!-- widget:(sql-a\d) -->", lambda m: f'<div class="sqlrun" data-q="{m.group(1)[4:]}"></div>', content)
    content = content.replace("<!-- widget:cohort -->", "")  # A2 cohort table: Word only, not on the site
    content = content.replace("<!-- widget:excel -->", '<div id="excel-widget"></div>')
    # Excel download: GitHub Pages serves the file (copied into docs/ below), so the artifact can link to it too
    content = content.replace("<strong>Section_E_Subscription_Model.xlsx</strong>",
        '<a class="dl" href="https://giladct.github.io/avatrade/Section_E_Subscription_Model.xlsx" target="_blank" rel="noopener">'
        '&#x2B07; Download Section_E_Subscription_Model.xlsx</a>')
    content = content.replace("<!-- widget:samplesize -->", '<div id="d1-widget"></div>')
    content = content.replace("<!-- widget:section-f -->", "")  # F charts: removed from the site
    content = content.replace("<!-- note -->", '<div class="callout">').replace("<!-- /note -->", "</div>")
    # sql code blocks get a header bar
    content = content.replace('<pre><code class="language-sql">',
                              '<div class="codebox"><div class="codebar"><span>Snowflake SQL · submitted answer</span>'
                              '</div><pre><code class="language-sql">')
    content = content.replace("</code></pre>", "</code></pre></div>")
    # wrap tables for horizontal scroll
    content = content.replace("<table>", '<div class="tablewrap"><table>').replace("</table>", "</table></div>")
    # Section E: the live model below shows the same results table, so the static copy stays in Word only
    # same for "How it is calculated": the live model has its own version that reacts to the sliders
    content = re.sub(r'<p><strong>How it is calculated</strong></p>\s*<ul>.*?</ul>\s*<div class="tablewrap">.*?</div>\s*', "", content, flags=re.S)
    content = re.sub(r'<p><strong>Results \(monthly\)</strong></p>\s*<div class="tablewrap">.*?</div>\s*', "", content, flags=re.S)

    # one page per question; text before the first question stays on the first page
    chunks = re.split(r'(?=<h3 id="q-)', content)
    intro, qs = chunks[0], chunks[1:]
    crumb = (f'<p class="crumb"><b>{letter}</b><span>{"Section " + letter + " · " + name if letter != "·" else "Read first"}</span>'
             + (f'<span class="crumb-pts">{pts} pts</span>' if pts else '') + '</p>')
    chips = []
    if not qs:
        pid = "assumptions" if letter == "·" else letter.lower()
        ptitle = name if letter == "·" else f"{letter}. {name}"
        qhtml = f'<h3 class="qhead"><span>{ptitle}</span>' + (f'<span class="pts">{pts} pts</span>' if pts else '') + '</h3>'
        out.append(f'<section class="sec page" id="p-{pid}" data-page="{pid}" data-sec="{sid}" data-title="{html.escape(ptitle)}" hidden>{crumb}{qhtml}{intro}</section>')
        pages.append((pid, ptitle, pts))
        chips.append(f'<a href="#{pid}" data-page="{pid}">{letter if letter != "·" else "•"}</a>')
        first = pid
    else:
        first = None
        for j, q in enumerate(qs):
            pid = re.match(r'<h3 id="q-([^"]+)"', q).group(1)
            ptitle = html.unescape(re.sub(r"<[^>]+>", "", re.search(r'<span>(.*?)</span>', q).group(1)))
            qpts = re.search(r'class="pts">(\d+) pts', q)
            q = re.sub(r'<h3 id="q-[^"]+"', '<h3', q, count=1)
            body_html = q if j else _merge(q, intro)
            out.append(f'<section class="sec page" id="p-{pid}" data-page="{pid}" data-sec="{sid}" data-title="{html.escape(ptitle)}" hidden>{crumb}{body_html}</section>')
            pages.append((pid, ptitle, qpts.group(1) if qpts else ""))
            chips.append(f'<a href="#{pid}" data-page="{pid}">{pid.upper()}</a>')
            first = first or pid
    first_page[sid] = first
    single = " single" if not qs else ""
    nav.append(f'<div class="r-sec{single}" data-sec="{sid}"><a class="r-head" href="#{first}" data-sec="{sid}"><b>{letter if letter != "·" else "•"}</b><span>{short}</span>'
               + (f'<em>{pts}</em>' if pts else "") + f'</a><div class="r-qs">{"".join(chips)}</div></div>')

# Hebrew prep notes (site only; delete content/explain_he.md to remove them)
if os.path.exists("content/explain_he.md"):
    he_src = open("content/explain_he.md", encoding="utf-8").read()
    he = {}
    for blk in re.split(r"^## ", he_src, flags=re.M)[1:]:
        key, txt = blk.split("\n", 1)
        lines, prev = [], ""
        for ln in txt.strip().split("\n"):
            is_li = bool(re.match(r"(- |\d+\. )", ln))
            if is_li and prev and not re.match(r"(- |\d+\. )", prev):
                lines.append("")  # markdown needs a blank line before a list
            lines.append(ln)
            prev = ln
        he[key.strip()] = markdown.markdown("\n".join(lines), extensions=["nl2br"])
    if "f" in he and "f1" in he:  # the F data note now opens the F1 note
        he["f1"] = he.pop("f") + he["f1"]
    for i, s in enumerate(out):
        pid = re.search(r'data-page="([^"]+)"', s).group(1)
        if pid in he:
            box = (f'<details class="kid" dir="rtl" lang="he" open><summary>הסבר פשוט · להכנה בלבד</summary>'
                   f'<div class="kid-body">{he[pid]}</div></details>')
            j = s.index("</h3>") + len("</h3>")
            out[i] = s[:j] + box + s[j:]

toc = "".join(f'<a href="#{pid}"><b>{pid.upper() if len(pid) <= 2 else "•"}</b><span>{html.escape(t.split(". ", 1)[-1])}</span>'
              + (f'<em>{p} pts</em>' if p else "") + '</a>' for pid, t, p in pages)

tpl = open("site/template.html", encoding="utf-8").read()
js = open("site/app.js", encoding="utf-8").read()
sqljs = open("site/sqldemo.js", encoding="utf-8").read()
cohortjs = open("site/cohort.js", encoding="utf-8").read()
a2_json = open("site/a2_data.json", encoding="utf-8").read()
page = (tpl.replace("{{NAV}}", "\n".join(nav)).replace("{{TOC}}", toc)
           .replace("{{CONTENT}}", "\n".join(out))
           .replace("{{APP_JS}}", js)
           .replace("{{SQL_JS}}", sqljs)
           .replace("{{COHORT_JS}}", "window.A2_DATA = " + a2_json + ";\n" + cohortjs))
open("site/index.html", "w", encoding="utf-8").write(page)
print("site/index.html", len(page) // 1024, "KB")

# local preview copy with the skeleton the artifact host adds; docs/ is the GitHub Pages copy
os.makedirs("docs", exist_ok=True)
import shutil
shutil.copy("deliverables/Section_E_Subscription_Model.xlsx", "docs/Section_E_Subscription_Model.xlsx")
title_m = re.search(r"<title>.*?</title>", page)  # a full page keeps its title in <head>
title = title_m.group(0) if title_m else "<title>BA Assessment Answers</title>"
body = page.replace(title, "", 1) if title_m else page
full = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' + title +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    '<style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}[hidden]{display:none!important}</style>'
    '</head><body>' + body + '</body></html>')
for path in ("site/preview.html", "docs/index.html"):
    open(path, "w", encoding="utf-8").write(full)
