-- Section A in Snowflake SQL. Same logic as the PostgreSQL answers; only dialect-specific parts change:
--   DISTINCT ON        -> QUALIFY ROW_NUMBER() ... = 1
--   LEFT JOIN LATERAL  -> ASOF JOIN (latest FX rate on or before the deposit date)
--   GENERATE_SERIES    -> TABLE(GENERATOR(...))
--   + INTERVAL         -> DATEADD


-- =====================================================================
-- A1. Newly funded accounts and first-deposit USD, by month and signup channel, Jan–Oct 2026
-- =====================================================================
WITH first_deposit AS (
    -- First COMPLETED deposit per account, over all history
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
      AND COALESCE(a.is_test, 0) = 0
    QUALIFY ROW_NUMBER() OVER (PARTITION BY t.account_id
                               ORDER BY t.created_at, t.transaction_id) = 1   -- tie-break on id
),
first_deposit_usd AS (
    SELECT fd.account_id,
           fd.signup_channel,
           DATE_TRUNC('month', fd.funded_at)::DATE AS funding_month,
           fd.amount * CASE WHEN fd.currency = 'USD' THEN 1 ELSE fx.usd_rate END AS amount_usd
    FROM first_deposit fd
    -- Rate on the deposit date, or the latest earlier one (weekends, holidays).
    -- ASOF JOIN keeps every deposit; usd_rate is NULL when no rate exists.
    ASOF JOIN fx_rates fx
         MATCH_CONDITION (fd.funded_date >= fx.rate_date)
         ON fx.currency = fd.currency
    WHERE fd.funded_at >= '2026-01-01'
      AND fd.funded_at <  '2026-11-01'
),
months AS (
    -- Jan–Oct 2026; numbered before the cross join (SEQ4 alone can have gaps)
    SELECT DATEADD(month, ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1, '2026-01-01'::DATE) AS month
    FROM TABLE(GENERATOR(ROWCOUNT => 10))
),
grid AS (
    -- Every month x channel, so empty ones show 0
    SELECT m.month, c.signup_channel
    FROM months m
    -- Channels come from the data, so a new or missing channel is not dropped
    CROSS JOIN (SELECT DISTINCT COALESCE(signup_channel, 'Unknown') AS signup_channel
                FROM accounts
                WHERE COALESCE(is_test, 0) = 0) c
)
SELECT g.month,
       g.signup_channel,
       COUNT(f.account_id)                        AS new_funded_accounts,
       COALESCE(ROUND(SUM(f.amount_usd), 2), 0)   AS first_deposit_usd,
       COUNT(f.account_id) - COUNT(f.amount_usd)  AS rows_missing_fx_rate  -- data-quality flag
FROM grid g
LEFT JOIN first_deposit_usd f
       ON f.funding_month  = g.month
      AND f.signup_channel = g.signup_channel
GROUP BY g.month, g.signup_channel
ORDER BY g.month, g.signup_channel;


-- =====================================================================
-- A2. Funding-month cohorts, Jan–Jun 2026
-- =====================================================================
WITH funded AS (
    -- Funding date = date of first COMPLETED deposit (real accounts only)
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
           MAX(CASE WHEN o.executed_at >= c.funding_month
                     AND o.executed_at <  DATEADD(month, 1, c.funding_month) THEN 1 ELSE 0 END) AS traded_m0,
           MAX(CASE WHEN o.executed_at >= DATEADD(month, 1, c.funding_month)
                     AND o.executed_at <  DATEADD(month, 2, c.funding_month) THEN 1 ELSE 0 END) AS traded_m1,
           MAX(CASE WHEN o.executed_at >= DATEADD(month, 2, c.funding_month)
                     AND o.executed_at <  DATEADD(month, 3, c.funding_month) THEN 1 ELSE 0 END) AS traded_m2,
           -- Days 0–89 counted from the funding date
           COALESCE(SUM(CASE WHEN o.executed_at >= c.funding_date
                              AND o.executed_at <  DATEADD(day, 90, c.funding_date)
                             THEN o.commission_usd END), 0) AS commission_90d
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
      AND o.executed_at <  '2027-01-01'
      AND NOT EXISTS (SELECT 1 FROM accounts a    -- exclude test accounts
                      WHERE a.account_id = o.account_id AND a.is_test = 1)
    GROUP BY DATE_TRUNC('month', o.executed_at)::DATE, o.symbol
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
