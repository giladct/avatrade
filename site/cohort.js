/* A2 result as a colored table: one row per funding month (Jan–Jun 2026), exactly the columns the question asks for.
   Starts from the A2 query's output precomputed at build time on the sample data; can re-run it live. */
(function () {
  const root = document.getElementById("cohort-widget");
  if (!root) return;
  const $ = s => root.querySelector(s);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const STOPS = ["#a50026", "#e0402e", "#f99a58", "#fee391", "#d9ef8b", "#7cc36a", "#1a9850", "#006837"];
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function colorAt(t) {
    t = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
    const i = Math.min(STOPS.length - 2, Math.floor(t)), f = t - i;
    const a = hex(STOPS[i]), b = hex(STOPS[i + 1]);
    const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
    const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    return { bg: `rgb(${c.join(",")})`, ink: lum < 0.5 ? "#ffffff" : "#1b1f17" };
  }
  let rows = window.A2_DATA, live = false;

  root.className = "widget cohort";
  root.innerHTML = `
    <h4>A2 result: funding-month cohorts, Jan–Jun 2026</h4>
    <p class="sub">A2 query output on sample data.</p>
    <div class="cohort-bar"><span style="margin-right:auto"></span><button class="btn primary" type="button" id="cohort-run">Run the query live</button></div>
    <div class="cohort-legend" id="cohort-legend"></div>
    <div class="tablewrap cohort-wrap"><table class="cohort-table a2-table" id="cohort-table"></table></div>
    <p class="status" id="cohort-status"></p>`;

  $("#cohort-run").addEventListener("click", async e => {
    const btn = e.target; btn.disabled = true;
    const st = $("#cohort-status"); st.classList.remove("err");
    st.textContent = "Loading the SQL engine and generating sample data…";
    try {
      const db = await SQLDEMO.getDb();
      const t0 = performance.now();
      const r = db.exec(SQLDEMO.Q.a2);
      rows = r[r.length - 1].values;
      live = Math.round(performance.now() - t0);
      render();
    } catch (err) { st.classList.add("err"); st.textContent = "Error: " + err.message; }
    finally { btn.disabled = false; }
  });

  function render() {
    // row: funding_month, funded_accounts, share_m0, share_m1, share_m2, avg_commission_90d_usd
    const shares = rows.flatMap(r => [r[2], r[3], r[4]]);
    const lo = Math.min(...shares), hi = Math.max(...shares);
    const t = v => hi > lo ? (v - lo) / (hi - lo) : 0.5;
    let h = `<thead><tr><th class="c-name">Funding month</th><th>Accounts funded</th><th>Traded in<br>funding month</th><th>Traded<br>month after</th><th>Traded month<br>after that</th><th>Avg commission,<br>first 90 days</th></tr></thead><tbody>`;
    for (const r of rows) {
      const m = r[0];
      h += `<tr><td class="c-name">${MON[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}</td><td class="c-size">${r[1]}</td>`;
      for (const v of [r[2], r[3], r[4]]) {
        const c = colorAt(t(v));
        h += `<td><span class="cell" style="background-color:${c.bg};color:${c.ink}">${(v * 100).toFixed(1)}%</span></td>`;
      }
      h += `<td class="c-size">$${(+r[5]).toFixed(2)}</td></tr>`;
    }
    $("#cohort-table").innerHTML = h + "</tbody>";
    $("#cohort-legend").innerHTML = `<span class="lg-bar"><span>${(lo * 100).toFixed(0)}%</span><i style="background:linear-gradient(90deg,${STOPS.join(",")})"></i><span>${(hi * 100).toFixed(0)}%</span></span>`;
    $("#cohort-status").textContent = live
      ? `Computed live just now in ${live} ms from the sample data.`
      : ``;
  }
  render();
})();
