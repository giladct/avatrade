/* Runnable SQL: a synthetic dataset generated in the browser, loaded into SQLite (sql.js, asm build). */
window.SQLDEMO = (function () {
  const SQLJS_URL = "https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-asm.js";

  // ---- deterministic PRNG so every visitor sees the same sample
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rnd = mulberry32(20261118);
  const pick = (arr, w) => { let r = rnd() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; };
  const DAY = 86400000;
  const pad = n => String(n).padStart(2, "0");
  const ts = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };
  const ds = ms => ts(ms).slice(0, 10);
  const lognorm = (mu, sigma) => Math.exp(mu + sigma * Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd()));

  const START = Date.UTC(2025, 6, 1), END = Date.UTC(2026, 10, 17, 23, 0, 0);
  const COUNTRIES = [["US", "USD"], ["UK", "GBP"], ["DE", "EUR"], ["FR", "EUR"], ["IT", "EUR"], ["AU", "AUD"]];
  const CHANNELS = ["Paid social", "Search", "Referral", "Content"];
  const SYMBOLS = [
    ["AAPL", "Stock", 190], ["MSFT", "Stock", 420], ["NVDA", "Stock", 120], ["AMZN", "Stock", 185], ["TSLA", "Stock", 240], ["META", "Stock", 500],
    ["GOOGL", "Stock", 170], ["AMD", "Stock", 150], ["NFLX", "Stock", 640], ["JPM", "Stock", 200], ["KO", "Stock", 62], ["DIS", "Stock", 98],
    ["SPY", "ETF", 540], ["QQQ", "ETF", 470], ["VOO", "ETF", 495], ["IWM", "ETF", 210], ["ARKK", "ETF", 48], ["GLD", "ETF", 215],
    ["VTI", "ETF", 270], ["XLE", "ETF", 92], ["VFIAX", "Fund", 500], ["FXAIX", "Fund", 190], ["VTSAX", "Fund", 130], ["SWPPX", "Fund", 80]];

  function generate() {
    const accounts = [], tx = [], orders = [], fx = [];
    // FX rates: weekdays only, so the "latest earlier rate" fallback is exercised on weekends
    const fxBase = { EUR: 1.08, GBP: 1.27, AUD: 0.66 };
    for (const cur of Object.keys(fxBase)) {
      let r = fxBase[cur];
      for (let t = START - 10 * DAY; t <= END; t += DAY) {
        const dow = new Date(t).getUTCDay();
        r *= 1 + (rnd() - 0.5) * 0.008;
        if (dow !== 0 && dow !== 6) fx.push([ds(t), cur, +r.toFixed(5)]);
      }
    }
    const symW = SYMBOLS.map((s, i) => 1 / (1 + i * 0.18));
    const phase = SYMBOLS.map(() => rnd() * 6.28);
    let txId = 1, ordId = 1;
    const N = 4000;
    for (let id = 1; id <= N; id++) {
      const signup = START + rnd() * (END - START);
      const [country, cur] = pick(COUNTRIES, [40, 15, 15, 10, 8, 12]);
      const channel = pick(CHANNELS, [35, 30, 15, 20]);
      const isTest = rnd() < 0.02 ? 1 : 0;
      accounts.push([id, ds(signup), country, channel, isTest]);
      const fundP = { "Paid social": 0.33, "Search": 0.45, "Referral": 0.62, "Content": 0.40 }[channel];
      if (rnd() > fundP) {
        if (rnd() < 0.3) tx.push([txId++, id, ts(signup + rnd() * 5 * DAY), "Deposit", "Failed", +(lognorm(5.6, 0.6)).toFixed(2), cur]);
        continue;
      }
      let t = signup + rnd() * 18 * DAY;
      if (t > END) continue;
      if (rnd() < 0.15) { tx.push([txId++, id, ts(t), "Deposit", rnd() < 0.5 ? "Failed" : "Pending", +(lognorm(5.8, 0.6)).toFixed(2), cur]); t += rnd() * 3 * DAY; if (t > END) continue; }
      const mu = { "Paid social": 5.5, "Search": 6.0, "Referral": 6.6, "Content": 6.1 }[channel];
      const fundedAt = t;
      tx.push([txId++, id, ts(fundedAt), "Deposit", "Completed", +lognorm(mu, 0.7).toFixed(2), cur]);
      // later money movement
      let tt = fundedAt;
      while (rnd() < 0.55) { tt += (5 + rnd() * 60) * DAY; if (tt > END) break; tx.push([txId++, id, ts(tt), rnd() < 0.75 ? "Deposit" : "Withdrawal", pick(["Completed", "Failed", "Pending"], [90, 7, 3]), +lognorm(mu - 0.2, 0.7).toFixed(2), cur]); }
      // trading activity, decaying month by month
      if (rnd() > 0.78) continue;
      const intensity = lognorm(0.6, 0.6);
      const size = lognorm(6.4, 0.9);
      for (let m = 0; m < 17; m++) {
        const mStart = fundedAt + m * 30 * DAY;
        if (mStart > END) break;
        if (rnd() > 0.82 * Math.pow(0.86, m)) continue;
        const n = Math.max(1, Math.round(intensity * (0.5 + rnd() * 2)));
        for (let k = 0; k < n; k++) {
          const et = mStart + rnd() * 30 * DAY;
          if (et > END) continue;
          const dd = new Date(et), mi = (dd.getUTCFullYear() - 2025) * 12 + dd.getUTCMonth();
          const w = symW.map((x, i) => x * (1.5 + 0.7 * Math.sin(mi * 0.7 + phase[i])));
          const si = SYMBOLS.indexOf(pick(SYMBOLS, w));
          const [sym, type, base] = SYMBOLS[si];
          const price = +(base * (1 + 0.12 * Math.sin(mi / 2 + phase[si])) * (1 + (rnd() - 0.5) * 0.02)).toFixed(2);
          const qty = Math.max(1, Math.round(size * (0.5 + rnd()) / price * 10) / 10);
          const value = qty * price;
          orders.push([ordId++, id, ts(et), sym, type, rnd() < 0.62 ? "Buy" : "Sell", qty, price, +Math.max(0.002 * value, 1).toFixed(2)]);
        }
      }
    }
    return { accounts, tx, orders, fx };
  }

  let dbPromise = null;
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load the SQL engine from the CDN.")); document.head.appendChild(s); }); }
  function getDb() {
    if (dbPromise) return dbPromise;
    dbPromise = (async () => {
      if (!window.initSqlJs) await loadScript(SQLJS_URL);
      const SQL = await window.initSqlJs();
      const db = new SQL.Database();
      db.run(`CREATE TABLE accounts (account_id INTEGER PRIMARY KEY, signup_date TEXT, country TEXT, signup_channel TEXT, is_test INTEGER);
              CREATE TABLE transactions (transaction_id INTEGER PRIMARY KEY, account_id INTEGER, created_at TEXT, type TEXT, status TEXT, amount REAL, currency TEXT);
              CREATE TABLE orders (order_id INTEGER PRIMARY KEY, account_id INTEGER, executed_at TEXT, symbol TEXT, asset_type TEXT, side TEXT, quantity REAL, price_usd REAL, commission_usd REAL);
              CREATE TABLE fx_rates (rate_date TEXT, currency TEXT, usd_rate REAL, PRIMARY KEY (currency, rate_date));`);
      const d = generate();
      const load = (sql, rows) => { const st = db.prepare(sql); for (const r of rows) st.run(r); st.free(); };
      db.run("BEGIN");
      load("INSERT INTO accounts VALUES (?,?,?,?,?)", d.accounts);
      load("INSERT INTO transactions VALUES (?,?,?,?,?,?,?)", d.tx);
      load("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?)", d.orders);
      load("INSERT INTO fx_rates VALUES (?,?,?)", d.fx);
      db.run("COMMIT");
      db.run("CREATE INDEX ix_tx_acc ON transactions(account_id, created_at); CREATE INDEX ix_ord_acc ON orders(account_id, executed_at); CREATE INDEX ix_ord_time ON orders(executed_at);");
      db.counts = { accounts: d.accounts.length, transactions: d.tx.length, orders: d.orders.length, fx_rates: d.fx.length };
      return db;
    })();
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  // ---- SQLite translations of the submitted PostgreSQL (same logic; date functions and LATERAL differ)
  const Q = {};
  Q.a1 = `-- SQLite translation of A1. DISTINCT ON -> ROW_NUMBER(); LATERAL -> correlated subquery;
-- GENERATE_SERIES -> recursive CTE; DATE_TRUNC -> strftime.
WITH RECURSIVE ranked AS (
    SELECT t.account_id, a.signup_channel, t.created_at AS funded_at, t.amount, t.currency,
           ROW_NUMBER() OVER (PARTITION BY t.account_id
                              ORDER BY t.created_at, t.transaction_id) AS rn
    FROM transactions t
    JOIN accounts a ON a.account_id = t.account_id
    WHERE t.type = 'Deposit' AND t.status = 'Completed' AND COALESCE(a.is_test, 0) = 0
),
first_deposit_usd AS (
    SELECT account_id, signup_channel,
           strftime('%Y-%m-01', funded_at) AS funding_month,
           amount * CASE WHEN currency = 'USD' THEN 1 ELSE
               (SELECT r.usd_rate FROM fx_rates r
                WHERE r.currency = ranked.currency AND r.rate_date <= date(ranked.funded_at)
                ORDER BY r.rate_date DESC LIMIT 1) END AS amount_usd
    FROM ranked
    WHERE rn = 1 AND funded_at >= '2026-01-01' AND funded_at < '2026-11-01'
),
months(month) AS (
    SELECT '2026-01-01' UNION ALL
    SELECT date(month, '+1 month') FROM months WHERE month < '2026-10-01'
),
grid AS (
    SELECT month, signup_channel FROM months
    CROSS JOIN (SELECT 'Paid social' AS signup_channel UNION ALL SELECT 'Search'
                UNION ALL SELECT 'Referral' UNION ALL SELECT 'Content')
)
SELECT g.month, g.signup_channel,
       COUNT(f.account_id)                         AS new_funded_accounts,
       ROUND(COALESCE(SUM(f.amount_usd), 0), 2)    AS first_deposit_usd,
       COUNT(f.account_id) - COUNT(f.amount_usd)   AS rows_missing_fx_rate
FROM grid g
LEFT JOIN first_deposit_usd f
       ON f.funding_month = g.month AND f.signup_channel = g.signup_channel
GROUP BY g.month, g.signup_channel
ORDER BY g.month, g.signup_channel;`;

  Q.a2 = `-- SQLite translation of A2. INTERVAL arithmetic -> date(x, '+n months'); GREATEST -> MAX(a, b).
WITH ranked AS (
    SELECT t.account_id, date(t.created_at) AS funding_date,
           ROW_NUMBER() OVER (PARTITION BY t.account_id
                              ORDER BY t.created_at, t.transaction_id) AS rn
    FROM transactions t
    JOIN accounts a ON a.account_id = t.account_id
    WHERE t.type = 'Deposit' AND t.status = 'Completed' AND COALESCE(a.is_test, 0) = 0
),
cohort AS (
    SELECT account_id, funding_date, strftime('%Y-%m-01', funding_date) AS funding_month
    FROM ranked
    WHERE rn = 1 AND funding_date >= '2026-01-01' AND funding_date < '2026-07-01'
),
per_account AS (
    SELECT c.account_id, c.funding_month,
           MAX(CASE WHEN o.executed_at >= c.funding_month
                     AND o.executed_at <  date(c.funding_month, '+1 month')  THEN 1 ELSE 0 END) AS traded_m0,
           MAX(CASE WHEN o.executed_at >= date(c.funding_month, '+1 month')
                     AND o.executed_at <  date(c.funding_month, '+2 months') THEN 1 ELSE 0 END) AS traded_m1,
           MAX(CASE WHEN o.executed_at >= date(c.funding_month, '+2 months')
                     AND o.executed_at <  date(c.funding_month, '+3 months') THEN 1 ELSE 0 END) AS traded_m2,
           COALESCE(SUM(CASE WHEN o.executed_at >= c.funding_date
                              AND o.executed_at <  date(c.funding_date, '+90 days')
                             THEN o.commission_usd END), 0) AS commission_90d
    FROM cohort c
    LEFT JOIN orders o
           ON o.account_id = c.account_id
          AND o.executed_at >= c.funding_month
          AND o.executed_at <  MAX(date(c.funding_month, '+3 months'), date(c.funding_date, '+90 days'))
    GROUP BY c.account_id, c.funding_month
)
SELECT funding_month,
       COUNT(*)                                        AS funded_accounts,
       ROUND(AVG(traded_m0), 3)                        AS share_traded_m0,
       ROUND(AVG(traded_m1), 3)                        AS share_traded_m1,
       ROUND(AVG(traded_m2), 3)                        AS share_traded_m2,
       ROUND(AVG(commission_90d), 2)                   AS avg_commission_90d_usd
FROM per_account
GROUP BY funding_month
ORDER BY funding_month;`;

  Q.a3 = `-- SQLite translation of A3. DATE_TRUNC -> strftime; month arithmetic -> date(x, '-1 month').
WITH monthly AS (
    SELECT strftime('%Y-%m-01', o.executed_at) AS month,
           o.symbol,
           SUM(o.quantity * o.price_usd)       AS traded_value_usd
    FROM orders o
    WHERE o.executed_at >= '2025-12-01' AND o.executed_at < '2027-01-01'
      AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.account_id = o.account_id AND a.is_test = 1)
    GROUP BY strftime('%Y-%m-01', o.executed_at), o.symbol
),
ranked AS (
    SELECT month, symbol, traded_value_usd,
           RANK() OVER (PARTITION BY month ORDER BY traded_value_usd DESC) AS rnk
    FROM monthly
)
SELECT cur.month, cur.rnk AS rank, cur.symbol,
       ROUND(cur.traded_value_usd, 0) AS traded_value_usd,
       prev.rnk                       AS previous_rank,
       prev.rnk - cur.rnk             AS places_moved,
       CASE WHEN prev.rnk IS NULL THEN 'New: not traded last month'
            WHEN prev.rnk > 10    THEN 'Entered top 10' END AS note
FROM ranked cur
LEFT JOIN ranked prev
       ON prev.symbol = cur.symbol AND prev.month = date(cur.month, '-1 month')
WHERE cur.month >= '2026-01-01' AND cur.rnk <= 10
ORDER BY cur.month, cur.rnk;`;

  const DATA_END = "2026-11-17";
  return { getDb, Q, DATA_END };
})();
