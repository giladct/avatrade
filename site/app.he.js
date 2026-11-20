(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const fmt$ = (v, d = 0) => (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtSigned$ = v => (v > 0 ? "+" : "") + fmt$(v);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const NS = "http://www.w3.org/2000/svg";
  const PRINT = /[?&]print/.test(location.search); // ?print shows every page in one long document, for the PDF
  if (PRINT) document.documentElement.classList.add("print");

  // ---------- language (English / Hebrew), web only; the PDF is always English
  const LANG_KEY = "ba-lang";
  let LANG = "en";
  try { const q = new URLSearchParams(location.search).get("lang"); LANG = q === "he" || q === "en" ? q : (localStorage.getItem(LANG_KEY) || "en"); } catch (e) {}
  if (PRINT) LANG = "en";
  const tx = (en, he) => (LANG === "he" ? he : en);
  const F = s => `<bdi dir="ltr">${s}</bdi>`; // formulas and numbers keep their left-to-right order inside Hebrew text
  const applyLang = () => { const h = document.documentElement; h.lang = LANG; h.dir = LANG === "he" ? "rtl" : "ltr"; };
  applyLang();

  // ---------- syntax highlighting
  if (window.hljs) $$("pre code.language-sql").forEach(el => window.hljs.highlightElement(el));

  // ---------- one question per page (hash routing: #a2, #e, #f1 ...)
  const pages = $$("section.page");
  const ids = pages.map(p => p.dataset.page);
  const LEGACY = { "section-a": "a1", "section-b": "b1", "section-c": "c1", "section-d": "d1", "section-e": "e", "section-f": "f1", "f": "f1" };
  const pager = $("#pager");
  let current = null;
  function resolve(h) {
    h = decodeURIComponent((h || "").replace(/^#/, "")).toLowerCase().replace(/^p-|^q-/, "");
    if (LEGACY[h]) h = LEGACY[h];
    return ids.includes(h) ? h : "overview";
  }
  function renderPager() {
    const i = ids.indexOf(current);
    if (i < 0) return;
    const prev = pages[i - 1], next = pages[i + 1];
    const ttl = p => esc(LANG === "he" ? (p.dataset.titleHe || p.dataset.title) : p.dataset.title);
    const link = (p, cls, label) => p ? '<a class="' + cls + '" href="#' + p.dataset.page + '"><small>' + label + '</small><span>' + ttl(p) + '</span></a>' : "";
    if (pager) pager.innerHTML = link(prev, "prev", tx("&larr; Previous", "&rarr; הקודם")) + (i > 0 ? '<span class="count">' + i + ' / ' + (ids.length - 1) + '</span>' : "") + link(next, "next", tx("Next &rarr;", "הבא &larr;"));
  }
  function show(id, fromHistory) {
    id = resolve(id);
    if (id === current) return;
    current = id;
    const page = pages.find(p => p.dataset.page === id);
    pages.forEach(p => (p.hidden = p !== page));
    $$(".rail [data-page]").forEach(a => a.classList.toggle("on", a.dataset.page === id));
    $$(".rail .r-head").forEach(a => a.classList.toggle("on", a.dataset.sec === page.dataset.sec));
    const chip = $('.rail [data-page="' + id + '"]');
    if (chip && innerWidth <= 900) chip.scrollIntoView({ block: "nearest", inline: "center" });
    renderPager();
    if (!fromHistory) { try { history.pushState(null, "", "#" + id); } catch (e) {} }
    window.scrollTo({ top: 0, behavior: "instant" });
    tip.hidden = true;
  }
  document.addEventListener("click", e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    show(a.getAttribute("href"));
  });
  addEventListener("popstate", () => show(location.hash, true));
  addEventListener("hashchange", () => show(location.hash, true));
  document.addEventListener("keydown", e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest("input, select, textarea, button, [contenteditable]")) return;
    const i = ids.indexOf(current);
    if (e.key === "ArrowRight" && i < ids.length - 1) show(ids[i + 1]);
    if (e.key === "ArrowLeft" && i > 0) show(ids[i - 1]);
  });

  // ---------- tooltip
  const tip = $("#tip");
  function showTip(html, ev) {
    tip.innerHTML = html; tip.hidden = false;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => (tip.hidden = true);
  if (PRINT) { const seen = {}; pages.forEach(p => { p.hidden = false; if (!seen[p.dataset.sec]) { seen[p.dataset.sec] = 1; p.classList.add("sec-first"); } }); } else show(location.hash, true);

  function svgEl(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  // ---------- SQL runners
  const NUMERIC_HINT = /(count|accounts|usd|share|rank|moved|value|commission|rows)/i;
  // Output example: the query's first rows on generated sample data, filled in when its page is shown
  const SHOW_ROWS = { a1: 8, a2: 6, a3: 10 };
  const fillExample = async box => {
    const q = box.dataset.q, status = $(".status", box), result = $(".result", box);
    status.textContent = tx("Loading the example…", "טוען את הדוגמה…");
    try {
      const db = await SQLDEMO.getDb();
      const res = db.exec(SQLDEMO.Q[q]);
      if (!res.length) { status.textContent = tx("No rows.", "אין שורות."); return; }
      const { columns, values } = res[res.length - 1];
      const n = Math.min(SHOW_ROWS[q] || 10, values.length);
      renderResult(result, columns, values.slice(0, n), q);
      status.textContent = n < values.length ? tx(`First ${n} of ${values.length} rows.`, `${n} השורות הראשונות מתוך ${values.length}.`) : tx(`${values.length} rows.`, `${values.length} שורות.`);
    } catch (err) {
      status.classList.add("err"); status.textContent = tx("Example unavailable: ", "הדוגמה אינה זמינה: ") + err.message;
    }
  };
  const exampleIO = "IntersectionObserver" in window ? new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { exampleIO.unobserve(e.target); fillExample(e.target); }
  })) : null;
  const buildSql = () => $$(".sqlrun").forEach(box => {
    box.innerHTML = `
      <div class="bar"><span class="label">${tx("Output example", "דוגמת פלט")}</span></div>
      <p class="note">${tx("Generated sample data, not company data.", "נתוני דוגמה שנוצרו, לא נתוני החברה.")}</p>
      <div class="result"></div>
      <div class="status" aria-live="polite"></div>`;
    exampleIO && !PRINT ? exampleIO.observe(box) : fillExample(box);
  });
  buildSql();
  function renderResult(el, cols, rows, q) {
    const isNum = v => typeof v === "number";
    let h = '<div class="tablewrap"><table><thead><tr>' + cols.map(c => `<th>${esc(c)}</th>`).join("") + "</tr></thead><tbody>";
    for (const r of rows) {
      h += "<tr>" + r.map((v, i) => {
        if (v === null) return '<td class="num">–</td>';
        if (cols[i] === "places_moved" && isNum(v)) {
          const cls = v > 0 ? "mv-up" : v < 0 ? "mv-dn" : "";
          return `<td class="num ${cls}">${v > 0 ? "▲ " + v : v < 0 ? "▼ " + Math.abs(v) : "="}</td>`;
        }
        if (isNum(v)) {
          const s = /share/.test(cols[i]) ? (v * 100).toFixed(1) + "%" : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
          return `<td class="num">${s}</td>`;
        }
        return `<td>${esc(v)}</td>`;
      }).join("") + "</tr>";
    }
    el.innerHTML = h + "</tbody></table></div>";
  }

  // ---------- Section E: pricing model
  const SEG = [
    { name: "Starter", customers: 40000, trades: 2, value: 800, opt: 0.05 },
    { name: "Regular", customers: 15000, trades: 8, value: 2500, opt: 0.30 },
    { name: "Active", customers: 4000, trades: 30, value: 6000, opt: 0.70 }];
  const E = { rate: 0.002, min: 1, price: 9.99, filter: "All", rational: false, opt: SEG.map(s => s.opt) };
  function model(price, rational, filter = E.filter) {
    const rows = SEG.map((s, i) => {
      const cpt = Math.max(E.rate * s.value, E.min), cpc = s.trades * cpt;
      const opt = rational ? (cpc > price ? E.opt[i] : 0) : E.opt[i];
      const subs = s.customers * opt, cur = s.customers * cpc, prop = subs * price + (s.customers - subs) * cpc;
      return { name: s.name, cpt, cpc, opt, subs, cur, prop, diff: prop - cur, lost: subs * cpc, optStated: E.opt[i], customers: s.customers };
    });
    const sel = rows.filter(r => filter === "All" || r.name === filter);
    const sum = k => sel.reduce((a, r) => a + r[k], 0);
    const subsStated = sel.reduce((a, r) => a + r.customers * r.optStated, 0);
    const lostStated = sel.reduce((a, r) => a + r.customers * r.optStated * r.cpc, 0);
    return { rows, sel, cur: sum("cur"), prop: sum("prop"), subs: sum("subs"), breakeven: subsStated ? lostStated / subsStated : 0 };
  }
  const ew = $("#excel-widget");
  let eBound = false;
  function buildE() {
    if (!ew) return;
    ew.className = "widget";
    ew.innerHTML = `
      <h4>${tx("Pricing model, live", "מודל התמחור, חי")}</h4>
      <p class="sub">${tx("Same logic as the workbook. Defaults are the assignment's figures.", "אותה לוגיקה כמו בקובץ האקסל. ברירות המחדל הן נתוני המטלה.")}</p>
      <div class="controls">
        <div class="ctl"><label for="e-price">${tx("Subscription price", "מחיר המנוי")} <output id="o-price"></output></label><input id="e-price" type="range" min="0" max="200" step="0.01"></div>
        <div class="ctl"><label for="e-rate">${tx("Commission rate", "שיעור עמלה")} <output id="o-rate"></output></label><input id="e-rate" type="range" min="0.0005" max="0.005" step="0.0001"></div>
        <div class="ctl"><label for="e-min">${tx("Minimum per trade", "מינימום לעסקה")} <output id="o-min"></output></label><input id="e-min" type="range" min="0" max="5" step="0.25"></div>
        <div class="ctl" style="justify-content:flex-end"><button class="btn" type="button" id="e-reset">${tx("Reset to assignment figures", "איפוס לנתוני המטלה")}</button></div>
      </div>
      <div class="controls opt-row">
        ${SEG.map((s, i) => `<div class="ctl"><label for="e-opt${i}">${tx(s.name + " opt-in", "הצטרפות " + s.name)} <output id="o-opt${i}"></output></label><input id="e-opt${i}" type="range" min="0" max="1" step="0.01"></div>`).join("")}
      </div>
      <label class="toggle"><input type="checkbox" id="e-rational"><span><b>${tx("Customers opt in only if it saves them money.", "לקוחות מצטרפים רק אם זה חוסך להם כסף.")}</b></span></label>
      <div class="tiles" id="e-tiles"></div>
      <div class="tablewrap"><table id="e-table"></table></div>
      <p class="chart-sub hint-hover" style="margin:-10px 0 0">${tx("Hover or tap a value to see how it is calculated.", "העבירו עכבר (או הקישו) על ערך כדי לראות איך הוא חושב.")}</p>
      <p class="chart-title" style="margin-top:18px">${tx("Monthly revenue by subscription price", "הכנסה חודשית לפי מחיר המנוי")}</p>
      <svg class="chart" id="e-chart" viewBox="0 0 720 300" role="img" aria-label="${tx("Monthly revenue by subscription price", "הכנסה חודשית לפי מחיר המנוי")}"></svg>
      <div class="legend" id="e-legend"></div>
      <p class="chart-sub" id="e-chart-sub"></p>`;
    // "How it is calculated" sits under the question's data table and reacts to the sliders below
    const cbox = $("#e-calc-box");
    if (cbox) cbox.innerHTML = `<p class="chart-title" style="margin-top:0">${tx("How it is calculated", "איך זה מחושב")}</p>
      <ul class="calc-notes" style="margin:6px 0 10px;padding-inline-start:22px">
        <li>${tx("<b>Current revenue</b> = customers × commission per customer.", "<b>הכנסה נוכחית</b> = לקוחות × עמלה ללקוח.")}</li>
        <li>${tx("<b>Proposed revenue</b> = subscribers × price + non-subscribers × commission per customer. Subscribers = customers × opt-in rate.", "<b>הכנסה עם מנוי</b> = מנויים × מחיר + לא-מנויים × עמלה ללקוח. מנויים = לקוחות × שיעור ההצטרפות.")}</li>
      </ul>
      <div class="tablewrap"><table id="e-calc"></table></div>`;
    const setInputs = () => {
      $("#e-price").value = E.price; $("#e-rate").value = E.rate; $("#e-min").value = E.min; $("#e-rational").checked = E.rational;
      E.opt.forEach((v, i) => ($("#e-opt" + i).value = v));
    };
    setInputs();
    // tooltips on the results table: each value explains its own calculation
    const et = $("#e-table"), cellOf = ev => ev.target.closest && ev.target.closest("td[data-tip]");
    const tipAt = (td, ev) => { const r = td.getBoundingClientRect(); showTip(td.dataset.tip, ev && ev.clientX ? ev : { clientX: r.left + r.width / 2, clientY: r.bottom }); };
    et.addEventListener("pointerover", ev => { const td = cellOf(ev); if (td) tipAt(td, ev); });
    et.addEventListener("pointermove", ev => { const td = cellOf(ev); if (td) tipAt(td, ev); });
    et.addEventListener("pointerleave", hideTip);
    et.addEventListener("pointerout", ev => { if (!cellOf(ev) || !ev.relatedTarget || !ev.relatedTarget.closest || !ev.relatedTarget.closest("td[data-tip]")) hideTip(); });
    et.addEventListener("focusin", ev => { const td = cellOf(ev); if (td) tipAt(td); });
    et.addEventListener("focusout", hideTip);
    if (!eBound) {
      eBound = true;
      ew.addEventListener("input", e => {
        const id = e.target.id;
        if (id === "e-price") E.price = +e.target.value;
        else if (id === "e-rate") E.rate = +e.target.value;
        else if (id === "e-min") E.min = +e.target.value;
        else if (id === "e-rational") E.rational = e.target.checked;
        else if (id.startsWith("e-opt")) E.opt[+id.slice(5)] = +e.target.value;
        renderE();
      });
    }
    $("#e-reset").addEventListener("click", () => { Object.assign(E, { rate: 0.002, min: 1, price: 9.99, filter: "All", rational: false, opt: SEG.map(s => s.opt) }); setInputs(); renderE(); });
    renderE();
  }
  function renderE() {
    $("#o-price").textContent = fmt$(E.price, 2); $("#o-rate").textContent = (E.rate * 100).toFixed(2) + "%"; $("#o-min").textContent = fmt$(E.min, 2);
    E.opt.forEach((v, i) => ($("#o-opt" + i).textContent = Math.round(v * 100) + "%"));
    const m = model(E.price, E.rational);
    const d = m.prop - m.cur;
    $("#e-tiles").innerHTML = [
      [tx("Current pricing", "תמחור נוכחי"), fmt$(m.cur)], [tx("With subscription", "עם מנוי"), fmt$(m.prop)],
      [tx("Difference", "הפרש"), `<span class="${d >= 0 ? "pos" : "neg"}">${fmtSigned$(d)}</span>${m.cur ? ` <small style="font-size:14px;color:var(--ink-3)">${(d / m.cur * 100).toFixed(1)}%</small>` : ""}`],
      [tx("Break-even price*", "מחיר איזון*"), fmt$(m.breakeven, 2)]].map(([k, v]) => `<div class="tile"><div class="k">${k}</div><div class="v">${F(v)}</div></div>`).join("");
    let h = `<thead><tr><th>${tx("Segment", "מקטע")}</th><th>${tx("Commission / customer", "עמלה / לקוח")}</th><th>${tx("Opt-in used", "הצטרפות בשימוש")}</th><th>${tx("Current ($/mo)", "נוכחי ($/חודש)")}</th><th>${tx("With subscription ($/mo)", "עם מנוי ($/חודש)")}</th><th>${tx("Difference", "הפרש")}</th></tr></thead><tbody>`;
    const n0t = v => Math.round(v).toLocaleString("en-US");
    const tp = t => ` data-tip="${t.replace(/"/g, "&quot;")}" tabindex="0"`;
    m.rows.forEach((r, i) => {
      const sg = SEG[i], dim = E.filter !== "All" && r.name !== E.filter ? ' style="opacity:.4"' : "";
      const calcTrade = F(`MAX(${(E.rate * 100).toFixed(2)}% × ${fmt$(sg.value)}, ${fmt$(E.min, 2)}) = ${fmt$(r.cpt, 2)}`);
      const tCpc = tx(`<b>Commission per customer</b><br>Per trade: ${calcTrade}<br>Per customer: ${F(`${fmt$(r.cpt, 2)} × ${sg.trades} trades = <b>${fmt$(r.cpc, 2)}</b>`)}`,
        `<b>עמלה ללקוח</b><br>לעסקה: ${calcTrade}<br>ללקוח: ${F(`${fmt$(r.cpt, 2)} × ${sg.trades} עסקאות = <b>${fmt$(r.cpc, 2)}</b>`)}`);
      const pctOpt = Math.round(r.opt * 100);
      const tOpt = E.rational
        ? tx(`<b>Opt-in used</b><br>Customers opt in only if it saves them money.<br>Commission ${F(fmt$(r.cpc, 2))} ${r.cpc > E.price ? ">" : "≤"} price ${F(fmt$(E.price, 2))} → ${r.opt ? "they opt in: " + pctOpt + "% (the stated rate)" : "no one opts in: <b>0%</b>"}`,
            `<b>הצטרפות בשימוש</b><br>לקוחות מצטרפים רק אם זה חוסך להם כסף.<br>עמלה ${F(fmt$(r.cpc, 2))} ${r.cpc > E.price ? "&gt;" : "≤"} מחיר ${F(fmt$(E.price, 2))} ← ${r.opt ? "הם מצטרפים: " + pctOpt + "% (השיעור שהוצהר)" : "אף אחד לא מצטרף: <b>0%</b>"}`)
        : tx(`<b>Opt-in used</b><br>The stated opt-in rate for ${r.name}: <b>${pctOpt}%</b><br>${F(`${n0t(sg.customers)} × ${pctOpt}% = ${n0t(r.subs)}`)} subscribers`,
            `<b>הצטרפות בשימוש</b><br>שיעור ההצטרפות שהוצהר ל-${r.name}: <b>${pctOpt}%</b><br>${F(`${n0t(sg.customers)} × ${pctOpt}% = ${n0t(r.subs)}`)} מנויים`);
      const tCur = tx(`<b>Current revenue</b><br>${F(`${n0t(sg.customers)} customers × ${fmt$(r.cpc, 2)} = <b>${fmt$(r.cur)}</b>`)}`,
        `<b>הכנסה נוכחית</b><br>${F(`${n0t(sg.customers)} לקוחות × ${fmt$(r.cpc, 2)} = <b>${fmt$(r.cur)}</b>`)}`);
      const subsPart = F(`${n0t(r.subs)} × ${fmt$(E.price, 2)} = ${fmt$(r.subs * E.price)}`), othersPart = F(`${n0t(sg.customers - r.subs)} × ${fmt$(r.cpc, 2)} = ${fmt$((sg.customers - r.subs) * r.cpc)}`);
      const tProp = tx(`<b>Revenue with subscription</b><br>Subscribers: ${subsPart}<br>Others: ${othersPart}<br>Total = <b>${F(fmt$(r.prop))}</b>`,
        `<b>הכנסה עם מנוי</b><br>מנויים: ${subsPart}<br>אחרים: ${othersPart}<br>סה״כ = <b>${F(fmt$(r.prop))}</b>`);
      const diffCalc = F(`${fmt$(r.prop)} − ${fmt$(r.cur)} = <b>${fmtSigned$(r.diff)}</b>`);
      const tDiff = tx(`<b>Difference</b><br>${diffCalc}`, `<b>הפרש</b><br>${diffCalc}`);
      h += `<tr${dim}><td>${r.name}</td><td${tp(tCpc)}>${F(fmt$(r.cpc, 2))}</td><td${tp(tOpt)}>${F(pctOpt + "%")}</td><td${tp(tCur)}>${F(fmt$(r.cur))}</td><td${tp(tProp)}>${F(fmt$(r.prop))}</td><td${tp(tDiff)} class="${r.diff >= 0 ? "pos" : "neg"}">${F(fmtSigned$(r.diff))}</td></tr>`;
    });
    const totLabel = E.filter === "All" ? tx("Total", "סה״כ") : tx("Total (" + E.filter + ")", "סה״כ (" + E.filter + ")");
    const sumTxt = k => F(m.sel.map(r => fmt$(r[k])).join(" + "));
    const pctTot = m.cur ? (d < 0 ? "−" : "+") + Math.abs(d / m.cur * 100).toFixed(1) + "%" : "";
    const tTotCur = tx(`<b>Total current revenue</b><br>${sumTxt("cur")} = <b>${F(fmt$(m.cur))}</b>`, `<b>סך ההכנסה הנוכחית</b><br>${sumTxt("cur")} = <b>${F(fmt$(m.cur))}</b>`);
    const tTotProp = tx(`<b>Total with subscription</b><br>${sumTxt("prop")} = <b>${F(fmt$(m.prop))}</b>`, `<b>סך ההכנסה עם מנוי</b><br>${sumTxt("prop")} = <b>${F(fmt$(m.prop))}</b>`);
    const totDiffCalc = F(`${fmt$(m.prop)} − ${fmt$(m.cur)} = <b>${fmtSigned$(d)}</b>`);
    const tTotDiff = tx(`<b>Total difference</b><br>${totDiffCalc}${m.cur ? `<br>That is ${F(pctTot)} vs current revenue.` : ""}`,
      `<b>הפרש כולל</b><br>${totDiffCalc}${m.cur ? `<br>זה ${F(pctTot)} לעומת ההכנסה הנוכחית.` : ""}`);
    h += `<tr style="font-weight:700;border-top:2px solid var(--line)"><td>${totLabel}</td><td></td><td></td><td${tp(tTotCur)}>${F(fmt$(m.cur))}</td><td${tp(tTotProp)}>${F(fmt$(m.prop))}</td><td${tp(tTotDiff)} class="${d >= 0 ? "pos" : "neg"}">${F(fmtSigned$(d))}</td></tr>`;
    $("#e-table").innerHTML = h + `</tbody>`;
    const n0 = v => Math.round(v).toLocaleString("en-US");
    let c = `<thead><tr><th>${tx("Segment", "מקטע")}</th><th>${tx("Commission per trade", "עמלה לעסקה")}</th><th>${tx("Commission per customer", "עמלה ללקוח")}</th><th>${tx("Subscribers", "מנויים")}</th><th>${tx("Proposed revenue", "הכנסה עם מנוי")}</th></tr></thead><tbody>`;
    m.rows.forEach((r, i) => {
      const sg = SEG[i], dim = E.filter !== "All" && r.name !== E.filter ? ' style="opacity:.4"' : "";
      c += `<tr${dim}><td>${r.name}</td><td>${F(`MAX(${(E.rate * 100).toFixed(2)}% × ${fmt$(sg.value)}, ${fmt$(E.min, 2)}) = ${fmt$(r.cpt, 2)}`)}</td>`
        + `<td>${F(`${fmt$(r.cpt, 2)} × ${sg.trades} ${tx("trades", "עסקאות")} = ${fmt$(r.cpc, 2)}`)}</td>`
        + `<td>${F(`${n0(sg.customers)} × ${Math.round(r.opt * 100)}% = ${n0(r.subs)}`)}</td>`
        + `<td>${F(`${n0(r.subs)} × ${fmt$(E.price, 2)} + ${n0(sg.customers - r.subs)} × ${fmt$(r.cpc, 2)} = ${fmt$(r.prop)}`)}</td></tr>`;
    });
    c += `<tr style="font-weight:700;border-top:2px solid var(--line)"><td>${totLabel}</td><td></td><td></td><td>${F(n0(m.subs))}</td><td>${F(fmt$(m.prop))}</td></tr>`;
    if ($("#e-calc")) $("#e-calc").innerHTML = c + "</tbody>";
    $("#e-chart-sub").textContent = tx("All segments. *Break-even uses the stated opt-in rates. Hover the chart to read values.", "כל המקטעים. *מחיר האיזון משתמש בשיעורי ההצטרפות שהוצהרו. העבירו עכבר על הגרף כדי לקרוא ערכים.");
    drawPriceChart();
  }
  buildE();
  function drawPriceChart() {
    const svg = $("#e-chart"); svg.innerHTML = "";
    const W = 720, H = 300, L = 64, R = 150, T = 14, B = 36, pw = W - L - R, ph = H - T - B;
    const xs = []; for (let p = 0; p <= 200; p += 0.5) xs.push(p);
    const cur = model(0, false).cur;
    const stated = xs.map(p => model(p, false).prop), rational = xs.map(p => model(p, true).prop);
    const ymax = Math.max(cur, ...stated, ...rational) * 1.08 || 1;
    const sx = p => L + p / 200 * pw, sy = v => T + ph - v / ymax * ph;
    const step = niceStep(ymax / 4);
    for (let v = 0; v <= ymax; v += step) {
      svgEl("line", { x1: L, x2: L + pw, y1: sy(v), y2: sy(v), class: "grid" }, svg);
      svgEl("text", { x: L - 8, y: sy(v) + 4, "text-anchor": "end" }, svg).textContent = shortMoney(v);
    }
    for (let p = 0; p <= 200; p += 25) svgEl("text", { x: sx(p), y: H - 14, "text-anchor": "middle" }, svg).textContent = "$" + p;
    svgEl("line", { x1: L, x2: L + pw, y1: sy(0), y2: sy(0), class: "axis" }, svg);
    const series = [
      { name: tx("Current pricing", "תמחור נוכחי"), short: tx("Current pricing", "נוכחי"), vals: xs.map(() => cur), color: "var(--ink-3)", dash: "5 4" },
      { name: tx("Subscription, stated opt-in", "מנוי, הצטרפות כפי שהוצהר"), short: tx("sub. (stated)", "מנוי (מוצהר)"), vals: stated, color: "var(--series-1)" },
      { name: tx("Subscription, opt in only if it saves money", "מנוי, הצטרפות רק אם זה חוסך כסף"), short: tx("sub. (self-select)", "מנוי (בחירה עצמית)"), vals: rational, color: "var(--series-2)" }];
    $("#e-legend").innerHTML = series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("");
    const be = model(0, false).breakeven;
    if (be > 0 && be <= 200) {
      svgEl("line", { x1: sx(be), x2: sx(be), y1: T, y2: T + ph, stroke: "var(--ink-3)", "stroke-width": 1, "stroke-dasharray": "2 3" }, svg);
      svgEl("text", { x: sx(be) + 5, y: T + 10, class: "lbl" }, svg).textContent = tx("break-even ", "איזון ") + fmt$(be, 2);
    }
    const labelYs = [];
    series.forEach(s => {
      const d = s.vals.map((v, i) => (i ? "L" : "M") + sx(xs[i]).toFixed(1) + " " + sy(v).toFixed(1)).join(" ");
      svgEl("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-dasharray": s.dash || "", "stroke-linejoin": "round" }, svg);
      let y = sy(s.vals[s.vals.length - 1]) + 4;
      for (const o of labelYs) if (Math.abs(o - y) < 14) y = o + 14;
      labelYs.push(y);
      svgEl("text", { x: L + pw + 8, y, class: "lbl" }, svg).textContent = shortMoney(s.vals[s.vals.length - 1]) + " " + s.short;
    });
    // selected price marker
    if (E.price <= 200) {
      const v = model(E.price, false).prop;
      svgEl("circle", { cx: sx(E.price), cy: sy(v), r: 5, fill: "var(--series-1)", stroke: "var(--surface)", "stroke-width": 2 }, svg);
    }
    // hover layer
    const cross = svgEl("line", { y1: T, y2: T + ph, stroke: "var(--ink-2)", "stroke-width": 1, opacity: 0 }, svg);
    const hit = svgEl("rect", { x: L, y: T, width: pw, height: ph, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", ev => {
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const p = Math.max(0, Math.min(200, Math.round((loc.x - L) / pw * 200 * 2) / 2));
      cross.setAttribute("x1", sx(p)); cross.setAttribute("x2", sx(p)); cross.setAttribute("opacity", 0.5);
      const a = model(p, false).prop, b = model(p, true).prop;
      showTip(tx(`Price <b>${fmt$(p, 2)}</b>/mo<br>Current: <b>${fmt$(cur)}</b><br>Stated opt-in: <b>${fmt$(a)}</b><br>Self-selecting: <b>${fmt$(b)}</b>`,
        `מחיר <b>${fmt$(p, 2)}</b>/חודש<br>נוכחי: <b>${fmt$(cur)}</b><br>הצטרפות מוצהרת: <b>${fmt$(a)}</b><br>בחירה עצמית: <b>${fmt$(b)}</b>`), ev);
    });
    hit.addEventListener("pointerleave", () => { cross.setAttribute("opacity", 0); hideTip(); });
  }
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / p; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p; }
  function shortMoney(v) { return Math.abs(v) >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e3 ? "$" + Math.round(v / 1e3) + "k" : "$" + Math.round(v); }

  // ---------- D1 sample-size calculator
  const dw = $("#d1-widget");
  const D = { base: 0.18, diff: 0.04, power: 0.8, weekly: 1000 };
  const Z = { 0.8: 0.8416, 0.9: 1.2816 };
  const nPer = (p1, d, pw) => {
    const p2 = p1 + d, pb = (p1 + p2) / 2;
    const a = 1.96 * Math.sqrt(2 * pb * (1 - pb)), b = Z[pw] * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
    return Math.ceil((a + b) ** 2 / (d * d));
  };
  const pct = v => (Math.round(v * 1000) / 10).toString() + "%";
  const num = v => Math.round(v).toLocaleString("en-US");
  let dBound = false;
  function buildD() {
    if (!dw) return;
    dw.className = "widget";
    const powerTip = tx("The chance the test catches a real effect of the size you chose. At 80%, a real improvement is detected 4 times out of 5. Higher power needs more users.",
      "הסיכוי שהבדיקה תזהה השפעה אמיתית בגודל שבחרתם. בעוצמה של 80%, שיפור אמיתי מזוהה 4 פעמים מתוך 5. עוצמה גבוהה יותר דורשת יותר משתמשים.");
    dw.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:8px 12px"><h4 style="white-space:nowrap">${tx("A/B test planner: sample size, live", "מתכנן מבחן A/B: גודל מדגם, חי")}</h4><button class="btn" type="button" id="d-reset">${tx("Reset to assignment figures", "איפוס לנתוני המטלה")}</button></div>
      <p class="sub">${tx("Two-sided α = 5%. Defaults are the assignment's figures; sign-ups per week is my assumption.", "דו-צדדי α = 5%. ברירות המחדל הן נתוני המטלה; מספר הנרשמים בשבוע הוא ההנחה שלי.")}</p>
      <div class="controls">
        <div class="ctl"><label for="d-base">${tx("Current funding rate", "שיעור מימון נוכחי")} <output id="o-base"></output></label><input id="d-base" type="range" min="0.05" max="0.5" step="0.01"></div>
        <div class="ctl"><label for="d-diff">${tx("Improvement", "שיפור")} <output id="o-diff"></output></label><input id="d-diff" type="range" min="0.01" max="0.1" step="0.01"></div>
        <div class="ctl"><label for="d-weekly">${tx("Sign-ups per week", "נרשמים בשבוע")} <output id="o-weekly"></output></label><input id="d-weekly" type="range" min="200" max="10000" step="100"></div>
        <div class="ctl"><label for="d-power">${tx("Power", "עוצמה")} <span class="info-tip" tabindex="0" role="button" aria-label="${powerTip}" data-tip="${powerTip}">ⓘ</span></label><select id="d-power"><option value="0.8">80%</option><option value="0.9">90%</option></select></div>
      </div>
      <div class="tiles" id="d-tiles"></div>
      <p class="chart-sub" style="margin:-8px 0 14px">${tx("*At least two full weeks, to cover every weekday.", "*לפחות שני שבועות מלאים, כדי לכסות את כל ימות השבוע.")}</p>
      <p><strong>${tx("How the numbers are calculated", "איך המספרים מחושבים")}</strong></p>
      <div id="d-calc"></div>
      <p class="chart-title">${tx("Users needed per group, by improvement to detect", "משתמשים נדרשים בקבוצה, לפי השיפור שרוצים לזהות")}</p>
      <p class="chart-sub">${tx("Halving the improvement needs about four times the users. Hover to read values.", "חצי מהשיפור דורש בערך פי ארבעה מהמשתמשים. העבירו עכבר כדי לקרוא ערכים.")}</p>
      <svg class="chart" id="d-chart" viewBox="0 0 720 260" role="img" aria-label="${tx("Users needed per group by improvement to detect", "משתמשים נדרשים בקבוצה לפי השיפור שרוצים לזהות")}"></svg>`;
    const setD = () => { $("#d-base").value = D.base; $("#d-diff").value = D.diff; $("#d-weekly").value = D.weekly; $("#d-power").value = String(D.power); };
    setD();
    dw.querySelectorAll(".info-tip").forEach(el => {
      const on = ev => { const r = el.getBoundingClientRect(); showTip(el.dataset.tip, ev.clientX ? ev : { clientX: r.left + r.width / 2, clientY: r.bottom }); };
      el.addEventListener("pointerenter", on); el.addEventListener("pointermove", on); el.addEventListener("focus", on);
      el.addEventListener("pointerleave", hideTip); el.addEventListener("blur", hideTip);
    });
    if (!dBound) {
      dBound = true;
      dw.addEventListener("input", e => {
        const id = e.target.id;
        if (id === "d-base") D.base = +e.target.value;
        else if (id === "d-diff") D.diff = +e.target.value;
        else if (id === "d-weekly") D.weekly = +e.target.value;
        else if (id === "d-power") D.power = +e.target.value;
        renderD();
      });
    }
    $("#d-reset").addEventListener("click", () => { Object.assign(D, { base: 0.18, diff: 0.04, power: 0.8, weekly: 1000 }); setD(); renderD(); });
    renderD();
  }
  function renderD() {
    $("#o-base").textContent = pct(D.base);
    $("#o-diff").textContent = "+" + (Math.round(D.diff * 1000) / 10) + tx(" pts → ", " נק׳ ← ") + pct(D.base + D.diff);
    $("#o-weekly").textContent = num(D.weekly);
    const n = nPer(D.base, D.diff, D.power), total = 2 * n;
    const weeks = Math.max(2, Math.ceil(total / D.weekly));
    $("#d-tiles").innerHTML = [[tx("Users per group", "משתמשים בקבוצה"), num(n)], [tx("Total users", "סה״כ משתמשים"), num(total)],
      [tx("Weeks to run*", "שבועות הרצה*"), weeks + (weeks === 2 && total / D.weekly < 2 ? tx(" (minimum)", " (מינימום)") : "")]]
      .map(([k, v]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
    const p1 = D.base, p2 = D.base + D.diff, pb = (p1 + p2) / 2, z = Z[D.power];
    const A = 1.96 * Math.sqrt(2 * pb * (1 - pb)), Bt = z * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
    const f3 = v => v.toFixed(3), d2 = v => v.toFixed(2), raw = total / D.weekly;
    // MathML builders
    const mi = t => `<mi>${t}</mi>`, mn = t => `<mn>${t}</mn>`, mo = t => `<mo>${t}</mo>`, mt = t => `<mtext>${t}</mtext>`;
    const mr = (...a) => `<mrow>${a.join("")}</mrow>`, sq = x => `<msqrt>${x}</msqrt>`, fr = (a, b) => `<mfrac>${a}${b}</mfrac>`;
    const sb = (a, b) => `<msub>${a}${b}</msub>`, sp = (a, b) => `<msup>${a}${b}</msup>`;
    const P = (...a) => mr(mo("("), ...a, mo(")")), dot = mo("⋅"), minus = mo("−"), plus = mo("+"), eq = mo("=");
    const pv = k => sb(mi("p"), mn(k)), bar = `<mover>${mi("p")}<mo>‾</mo></mover>`, one = x => P(mn("1"), minus, x);
    const zA = sb(mi("z"), mr(mi("α"), mo("/"), mn("2"))), zB = sb(mi("z"), mi("β"));
    const blk = x => `<div class="eq"><math display="block">${x}</math></div>`, inl = x => `<math>${x}</math>`;
    const gen = mr(mi("n"), eq, fr(sp(P(mi("A"), plus, mi("B")), mn("2")), sp(P(pv("2"), minus, pv("1")), mn("2"))));
    const defA = mr(mi("A"), eq, zA, dot, sq(mr(mn("2"), dot, bar, dot, one(bar))), eq, mn("1.96"), dot, sq(mr(mn("2"), dot, mn(d2(pb)), dot, mn(d2(1 - pb)))), eq, mn(f3(A)));
    const defB = mr(mi("B"), eq, zB, dot, sq(mr(pv("1"), dot, one(pv("1")), plus, pv("2"), dot, one(pv("2")))), eq, mn(z), dot,
      sq(mr(mn(d2(p1)), dot, mn(d2(1 - p1)), plus, mn(d2(p2)), dot, mn(d2(1 - p2)))), eq, mn(f3(Bt)));
    const result = mr(mi("n"), eq, fr(sp(P(mn(f3(A)), plus, mn(f3(Bt))), mn("2")), sp(P(mn(d2(p2)), minus, mn(d2(p1))), mn("2"))),
      eq, fr(mn(f3((A + Bt) ** 2)), mn((D.diff * D.diff).toFixed(4))), eq, mn(num(n)));
    const totalM = mr(mi("N"), eq, mn("2"), dot, mi("n"), eq, mn("2"), dot, mn(num(n)), eq, mn(num(total)));
    const weeksM = mr(mt(tx("weeks", "שבועות")), eq, mi("max"), P(mn("2"), mo(","), mo("⌈"), fr(mi("N"), mi("W")), mo("⌉")), eq,
      mi("max"), P(mn("2"), mo(","), mo("⌈"), fr(mn(num(total)), mn(num(D.weekly))), mo("⌉")), eq, mn(weeks));
    $("#d-calc").innerHTML =
      `<p><b>${tx("Inputs.", "נתוני קלט.")}</b> ${inl(mr(pv("1"), eq, mn(pct(p1))))}, ${inl(mr(pv("2"), eq, mn(pct(p2))))}, ` +
      `${inl(mr(bar, eq, fr(mr(pv("1"), plus, pv("2")), mn("2")), eq, mn(pct(pb))))}, ` +
      `${inl(mr(zA, eq, mn("1.96")))} ${tx("(5% significance, two-sided)", "(מובהקות 5%, דו-צדדי)")}, ${inl(mr(zB, eq, mn(z)))} ${tx(`(${D.power * 100}% power)`, `(עוצמה ${D.power * 100}%)`)}, ` +
      `${inl(mr(mi("W"), eq, mn(num(D.weekly))))} ${tx("sign-ups per week.", "נרשמים בשבוע.")}</p>` +
      `<p><b>${tx("Users per group", "משתמשים בקבוצה")}</b></p>${blk(gen)}${blk(defA)}${blk(defB)}${blk(result)}` +
      `<p><b>${tx("Total users", "סה״כ משתמשים")}</b></p>${blk(totalM)}<p><b>${tx("Weeks to run", "שבועות הרצה")}</b> ${tx("(never below 2)", "(אף פעם לא פחות מ-2)")}</p>${blk(weeksM)}`;
    drawD();
  }
  buildD();
  function drawD() {
    const svg = $("#d-chart"); svg.innerHTML = "";
    const W = 720, H = 260, L0 = 64, R = 20, T = 14, B = 36, pw = W - L0 - R, ph = H - T - B;
    const xs = []; for (let d = 0.01; d <= 0.1001; d += 0.0025) xs.push(+d.toFixed(4));
    const ys = xs.map(d => nPer(D.base, d, D.power));
    const ymax = Math.max(...ys) * 1.08;
    const sx = d => L0 + (d - 0.01) / 0.09 * pw, sy = v => T + ph - v / ymax * ph;
    const step = niceStep(ymax / 4);
    for (let v = 0; v <= ymax; v += step) {
      svgEl("line", { x1: L0, x2: L0 + pw, y1: sy(v), y2: sy(v), class: "grid" }, svg);
      svgEl("text", { x: L0 - 8, y: sy(v) + 4, "text-anchor": "end" }, svg).textContent = v >= 1000 ? Math.round(v / 1000) + "k" : v;
    }
    for (let d = 0.01; d <= 0.1001; d += 0.01) svgEl("text", { x: sx(d), y: H - 14, "text-anchor": "middle" }, svg).textContent = "+" + Math.round(d * 100) + tx(" pts", " נק׳");
    svgEl("line", { x1: L0, x2: L0 + pw, y1: sy(0), y2: sy(0), class: "axis" }, svg);
    const path = ys.map((v, i) => (i ? "L" : "M") + sx(xs[i]).toFixed(1) + " " + sy(v).toFixed(1)).join(" ");
    svgEl("path", { d: path, fill: "none", stroke: "var(--series-1)", "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    if (D.diff >= 0.01) {
      const v = nPer(D.base, D.diff, D.power);
      svgEl("circle", { cx: sx(D.diff), cy: sy(v), r: 5, fill: "var(--series-1)", stroke: "var(--surface)", "stroke-width": 2 }, svg);
      svgEl("text", { x: sx(D.diff) + 9, y: Math.max(T + 10, sy(v) - 8), class: "lbl" }, svg).textContent = num(v) + tx(" per group", " לקבוצה");
    }
    const cross = svgEl("line", { y1: T, y2: T + ph, stroke: "var(--ink-2)", "stroke-width": 1, opacity: 0 }, svg);
    const hit = svgEl("rect", { x: L0, y: T, width: pw, height: ph, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", ev => {
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const d = Math.max(0.01, Math.min(0.1, Math.round(((loc.x - L0) / pw * 0.09 + 0.01) / 0.0025) * 0.0025));
      cross.setAttribute("x1", sx(d)); cross.setAttribute("x2", sx(d)); cross.setAttribute("opacity", 0.5);
      showTip(`${pct(D.base)} ${tx("→", "←")} <b>${pct(D.base + d)}</b><br>${tx("Per group", "לקבוצה")}: <b>${num(nPer(D.base, d, D.power))}</b>`, ev);
    });
    hit.addEventListener("pointerleave", () => { cross.setAttribute("opacity", 0); hideTip(); });
  }

  // ---------- Section F charts
  const fw = $("#f-widget");
  if (fw) {
    fw.className = "widget";
    fw.innerHTML = `
      <div class="two">
        <div>
          <p class="chart-title">Where the +$1.8M came from ($M)</p>
          
          <div class="legend"><span><i class="sq" style="background:var(--ink-3)"></i>Total</span><span><i class="sq" style="background:var(--div-pos)"></i>Increase</span><span><i class="sq" style="background:var(--div-neg)"></i>Decrease</span></div>
          <svg class="chart" id="f-bridge" viewBox="0 0 720 260" role="img" aria-label="Revenue breakdown from Q2 to Q3"></svg>
        </div>
        <div>
          <p class="chart-title">Quarter-on-quarter change</p>
          
          <div class="legend"><span><i class="sq" style="background:var(--div-pos)"></i>Rose</span><span><i class="sq" style="background:var(--div-neg)"></i>Fell</span></div>
          <svg class="chart" id="f-change" viewBox="0 0 720 330" role="img" aria-label="Quarter-on-quarter change by metric"></svg>
        </div>
      </div>`;
    drawBridge($("#f-bridge")); drawChange();
  }

  function drawBridge(svg) {
    const steps = [
      { k: "Q2 revenue", v: 30.0, total: true }, { k: "Top 20 clients", v: 3.6 }, { k: "All other clients", v: -1.8 },
      { k: "Q3 revenue", v: 31.8, total: true }, { k: "Q3 if top 20 flat", v: 28.2, total: true, ghost: true }];
    const W = 720, H = 260, L = 44, R = 10, T = 22, B = 40, pw = W - L - R, ph = H - T - B;
    const ymin = 24, ymax = 35;
    const sy = v => T + ph - (v - ymin) / (ymax - ymin) * ph;
    for (let v = 24; v <= 34; v += 2) {
      svgEl("line", { x1: L, x2: L + pw, y1: sy(v), y2: sy(v), class: "grid" }, svg);
      svgEl("text", { x: L - 8, y: sy(v) + 4, "text-anchor": "end" }, svg).textContent = v;
    }
    svgEl("text", { x: L, y: H - 2 }, svg).textContent = "Axis starts at $24M so the steps are readable.";
    const slot = pw / steps.length, bw = Math.min(72, slot * 0.55);
    let run = 0;
    steps.forEach((s, i) => {
      const cx = L + slot * i + slot / 2;
      let y0, y1;
      if (s.total) { y0 = ymin; y1 = s.v; if (!s.ghost) run = s.v; } else { y0 = run; y1 = run + s.v; run = y1; }
      const top = sy(Math.max(y0, y1)), bot = sy(Math.min(y0, y1));
      const color = s.total ? "var(--ink-3)" : s.v > 0 ? "var(--div-pos)" : "var(--div-neg)";
      const r = svgEl("rect", { x: cx - bw / 2, y: top, width: bw, height: Math.max(2, bot - top), rx: 3, fill: color, opacity: s.ghost ? 0.45 : 1 }, svg);
      if (s.ghost) r.setAttribute("stroke-dasharray", "4 3"), r.setAttribute("stroke", "var(--ink-3)");
      svgEl("text", { x: cx, y: top - 6, "text-anchor": "middle", class: "lbl" }, svg).textContent = s.total ? s.v.toFixed(1) : (s.v > 0 ? "+" : "−") + Math.abs(s.v).toFixed(1);
      const t = svgEl("text", { x: cx, y: H - 22, "text-anchor": "middle" }, svg); t.textContent = s.k;
      const hit = svgEl("rect", { x: cx - slot / 2, y: T, width: slot, height: ph, fill: "transparent" }, svg);
      const desc = { "Q2 revenue": "Q2 revenue: <b>$30.0M</b>", "Top 20 clients": "Top 20 clients: <b>$6.0M → $9.6M</b> (+60%)", "All other clients": "All other clients: <b>$24.0M → $22.2M</b> (−7.5%)", "Q3 revenue": "Q3 revenue: <b>$31.8M</b> (+6%)", "Q3 if top 20 flat": "If the top 20 had stayed at $6.0M: <b>$28.2M</b> (−6% vs Q2)" }[s.k];
      hit.addEventListener("pointermove", ev => showTip(desc, ev)); hit.addEventListener("pointerleave", hideTip);
    });
  }
  function drawChange() {
    const svg = $("#f-change");
    const rows = [
      ["Revenue", 6.0, true, "30.0 → 31.8 $M"], ["Top 20 client revenue", 60.0, null, "6.0 → 9.6 $M (concentration risk)"], ["All other client revenue", -7.5, false, "24.0 → 22.2 $M"],
      ["Active traders", -8.0, false, "50,000 → 46,000"], ["Traded volume", -3.0, false, "$100B → $97B"], ["New funded accounts", 15.0, true, "10,000 → 11,500"],
      ["Marketing spend", 26.0, false, "$5.0M → $6.3M"], ["Avg first deposit", -20.0, false, "$400 → $320"], ["30-day revenue / new account", -25.0, false, "$200 → $150"]];
    const W = 720, H = 330, L = 200, R = 96, T = 10, rowH = 34, pw = W - L - R;
    const lo = -45, hi = 65, sx = v => L + (v - lo) / (hi - lo) * pw;
    for (const v of [-25, 0, 25, 50]) {
      svgEl("line", { x1: sx(v), x2: sx(v), y1: T, y2: T + rows.length * rowH, class: v === 0 ? "axis" : "grid" }, svg);
      svgEl("text", { x: sx(v), y: T + rows.length * rowH + 16, "text-anchor": "middle" }, svg).textContent = (v > 0 ? "+" : "") + v + "%";
    }
    rows.forEach(([k, v, good, detail], i) => {
      const y = T + i * rowH + 7, h = rowH - 14;
      svgEl("text", { x: L - 10, y: y + h / 2 + 4, "text-anchor": "end", class: "lbl" }, svg).textContent = k;
      const x0 = sx(Math.min(0, v)), x1 = sx(Math.max(0, v));
      svgEl("rect", { x: x0, y, width: Math.max(2, x1 - x0), height: h, rx: 3, fill: v >= 0 ? "var(--div-pos)" : "var(--div-neg)" }, svg);
      svgEl("text", { x: v >= 0 ? x1 + 6 : x0 - 6, y: y + h / 2 + 4, "text-anchor": v >= 0 ? "start" : "end" }, svg).textContent = (v > 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%";
      const verdict = good === null ? "⚠ Risky" : good ? "✓ Good" : "✕ Bad";
      svgEl("text", { x: W - 4, y: y + h / 2 + 4, "text-anchor": "end", class: "lbl" }, svg).textContent = verdict;
      const hit = svgEl("rect", { x: 0, y: T + i * rowH, width: W, height: rowH, fill: "transparent" }, svg);
      hit.addEventListener("pointermove", ev => showTip(`${k}: <b>${(v > 0 ? "+" : "−") + Math.abs(v).toFixed(1)}%</b><br>${detail}`, ev));
      hit.addEventListener("pointerleave", hideTip);
    });
  }

  // ---------- language toggle
  const langBtn = $("#lang-btn");
  function setLang(l) {
    LANG = l;
    try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
    applyLang();
    buildSql(); buildE(); buildD();
    renderPager();
    hideTip();
  }
  if (langBtn) langBtn.addEventListener("click", () => setLang(LANG === "he" ? "en" : "he"));
})();
