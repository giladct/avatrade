-- Section A in Snowflake SQL. Rules used by all three queries:
--   * Funding = first COMPLETED deposit over all history (ties broken by transaction_id).
--   * Months are UTC calendar months.
--   * Test accounts are excluded; a missing is_test flag counts as a real account.


-- =====================================================================
-- A1. Newly funded accounts and first-deposit USD, by month and signup channel, Jan–Oct 2026
-- =====================================================================
WITH first_deposit AS (
    -- First COMPLETED deposit per account, over ALL history (not only 2026),
    -- so an account funded in 2025 is never counted as new in 2026
    SELECT t.account_id,
           COALESCE(a.signup_channel, 'Unknown') AS signup_channel,  -- empty channel shows as Unknown
           t.created_at        AS funded_at,
           t.created_at::DATE  AS funded_date,   -- plain column for the ASOF match condition
           t.amount,
           t.currency
    FROM transactions t
    JOIN accounts a ON a.account_id = t.account_id
    WHERE t.type   = 'Deposit'
      AND t.status = 'Completed'
      AND COALESCE(a.is_test, 0) = 0   -- real accounts only (a missing flag counts as real)
    QUALIFY ROW_NUMBER() OVER (PARTITION BY t.account_id
                               ORDER BY t.created_at, t.transaction_id) = 1
),
first_deposit_usd AS (
    SELECT fd.account_id,
           fd.signup_channel,
           DATE_TRUNC('month', fd.funded_at)::DATE AS funding_month,
           -- usd_rate = how many USD one unit of the currency is worth
           fd.amount * CASE WHEN fd.currency = 'USD' THEN 1 ELSE fx.usd_rate END AS amount_usd
    FROM first_deposit fd
    -- ASOF JOIN = "as of" join: for each deposit it picks ONE fx_rates row of the same
    -- currency, the one with the latest rate_date on or before the deposit date.
    -- So a Saturday deposit gets Friday's rate (weekends, holidays have no row).
    -- Like a LEFT JOIN, it keeps every deposit; usd_rate is NULL when no rate exists.
    ASOF JOIN fx_rates fx
         MATCH_CONDITION (fd.funded_date >= fx.rate_date)
         ON fx.currency = fd.currency
    -- Filter to 2026 only now, after the first deposit was chosen
    WHERE fd.funded_at >= '2026-01-01'
      AND fd.funded_at <  '2026-11-01'
),
months AS (
    -- Builds the 10 months Jan-Oct 2026: GENERATOR makes 10 rows, and each row adds
    -- 0 to 9 months to January. This replaces a dim_date (calendar) table.
    -- Numbered with ROW_NUMBER first, because SEQ4 alone can have gaps.
    SELECT DATEADD(month, ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1, '2026-01-01'::DATE) AS month
    FROM TABLE(GENERATOR(ROWCOUNT => 10))
),
channels AS (
    -- Channels come from the data, so a new or missing channel is not dropped
    SELECT DISTINCT COALESCE(signup_channel, 'Unknown') AS signup_channel
    FROM accounts
    WHERE COALESCE(is_test, 0) = 0
)
SELECT m.month,
       c.signup_channel,
       COUNT(f.account_id)                        AS new_funded_accounts,
       COALESCE(ROUND(SUM(f.amount_usd), 2), 0)   AS first_deposit_usd,
       COUNT(f.account_id) - COUNT(f.amount_usd)  AS rows_missing_fx_rate  -- data-quality flag
FROM months m
-- CROSS JOIN pairs every month with every channel. A plain GROUP BY would drop
-- a combination with no new accounts; this grid keeps it, so it shows 0.
CROSS JOIN channels c
LEFT JOIN first_deposit_usd f
       ON f.funding_month  = m.month
      AND f.signup_channel = c.signup_channel
GROUP BY m.month, c.signup_channel
ORDER BY m.month, c.signup_channel;


-- =====================================================================
-- A2. Funding-month cohorts, Jan–Jun 2026
-- =====================================================================
WITH funded AS (
    -- Funding date = date of first COMPLETED deposit (real accounts only; missing is_test = real)
    SELECT t.account_id,
           t.created_at::DATE AS funding_date
    FROM transactions t
    JOIN accounts a ON a.account_id = t.account_id
    WHERE t.type   = 'Deposit'
      AND t.status = 'Completed'
      AND COALESCE(a.is_test, 0) = 0
    QUALIFY ROW_NUMBER() OVER (PARTITION BY t.account_id
                               ORDER BY t.created_at, t.transaction_id) = 1
),
cohort AS (
    -- Accounts first funded Jan–Jun 2026. Month 0 = the calendar month of funding.
    SELECT account_id,
           funding_date,
           DATE_TRUNC('month', funding_date) AS funding_month
    FROM funded
    WHERE funding_date >= '2026-01-01'
      AND funding_date <  '2026-07-01'
),
per_account AS (
    -- One row per account; the LEFT JOIN keeps non-traders as 0
    SELECT c.account_id,
           c.funding_month,
           -- traded_m0 / m1 / m2 = 1 if the account traded in the funding month / the next / the one after
           -- (DATEDIFF counts calendar months, e.g. funded in March: an April order gives 1)
           MAX(IFF(DATEDIFF(month, c.funding_month, o.executed_at) = 0, 1, 0)) AS traded_m0,
           MAX(IFF(DATEDIFF(month, c.funding_month, o.executed_at) = 1, 1, 0)) AS traded_m1,
           MAX(IFF(DATEDIFF(month, c.funding_month, o.executed_at) = 2, 1, 0)) AS traded_m2,
           -- Commission in days 0–89 from the funding date; 0 for accounts with no orders
           SUM(IFF(o.executed_at >= c.funding_date
               AND o.executed_at <  DATEADD(day, 90, c.funding_date), o.commission_usd, 0)) AS commission_90d
    FROM cohort c
    LEFT JOIN orders o
           ON o.account_id   = c.account_id
          -- Only orders either metric needs (90 days can run past 3 months)
          AND o.executed_at >= c.funding_month
          AND o.executed_at <  GREATEST(DATEADD(month, 3, c.funding_month),
                                        DATEADD(day, 90, c.funding_date))
    GROUP BY c.account_id, c.funding_month
)
SELECT funding_month,
       COUNT(*)                        AS funded_accounts,
       -- AVG of a 0/1 flag = share of the cohort that traded
       ROUND(AVG(traded_m0), 3)        AS share_traded_m0,
       ROUND(AVG(traded_m1), 3)        AS share_traded_m1,
       ROUND(AVG(traded_m2), 3)        AS share_traded_m2,
       ROUND(AVG(commission_90d), 2)   AS avg_commission_90d_usd
FROM per_account
GROUP BY funding_month
ORDER BY funding_month;


-- =====================================================================
-- A3. Top 10 symbols by traded value per month of 2026, with movement vs the previous month
-- =====================================================================
WITH monthly AS (
    SELECT DATE_TRUNC('month', o.executed_at)::DATE AS month,
           o.symbol,
           SUM(o.quantity * o.price_usd)            AS traded_value_usd
    FROM orders o
    WHERE o.executed_at >= '2025-12-01'          -- December 2025 gives January a baseline
      AND o.executed_at <  '2027-01-01'          -- November 2026 is month-to-date
      AND NOT EXISTS (SELECT 1 FROM accounts a    -- exclude test accounts (missing flag = real)
                      WHERE a.account_id = o.account_id AND a.is_test = 1)
    GROUP BY ALL   -- month, symbol
),
ranked AS (
    -- Rank all symbols, not only the top 10
    SELECT month, symbol, traded_value_usd,
           RANK() OVER (PARTITION BY month ORDER BY traded_value_usd DESC) AS rnk
    FROM monthly
)
SELECT cur.month,
       cur.rnk                         AS rank,
       cur.symbol,
       ROUND(cur.traded_value_usd, 0)  AS traded_value_usd,
       prev.rnk                        AS previous_rank,
       prev.rnk - cur.rnk              AS places_moved,     -- positive = moved up
       -- note: no rank last month = not traded then; rank > 10 last month = newly in the top 10
       CASE WHEN prev.rnk IS NULL THEN 'New: not traded last month'
            WHEN prev.rnk > 10    THEN 'Entered top 10'
            ELSE NULL END              AS note
FROM ranked cur
-- Previous calendar month (LAG would skip months with no trades)
LEFT JOIN ranked prev
       ON prev.symbol = cur.symbol
      AND prev.month  = DATEADD(month, -1, cur.month)
WHERE cur.month >= '2026-01-01'
  AND cur.rnk   <= 10
ORDER BY cur.month, cur.rnk;

-- Keeping A3 fast on 500 million orders in Snowflake (no indexes or user-defined partitions):
--   1. Cluster ORDERS on executed_at (often already ordered by load time), so the date filter
--      prunes micro-partitions and only ~13 months are scanned.
--   2. Pre-aggregate to a daily symbol table (dynamic table or incremental task); store the
--      ranks of closed months once.
--   3. Aggregate first, then rank; size the warehouse for the one-off backfill, not every run.
--
-- On another database (PostgreSQL, SQL Server, MySQL):
--   1. Partition ORDERS by month, so only 13 partitions are read.
--   2. Covering index on (executed_at, symbol) including quantity, price_usd, account_id,
--      or a columnstore index, so the table itself is not read.
--   3. Summary table of daily totals per symbol, loaded nightly for the previous day only.
--   4. Parallel query; run heavy loads off-peak or on a read replica.
