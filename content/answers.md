# General assumptions

- **SQL is Snowflake.**
- **Test accounts are excluded everywhere.**
- **Funding = first completed deposit** over all history (ties broken by `transaction_id`).
- **FX:** rate on the deposit date, or the latest earlier one. Months are UTC calendar months.
- **Revenue** = commission + interest on cash.

# Section A: SQL

## A1. New funded accounts (6 points)

> For each month from January to October 2026, return the number of newly funded accounts and their total first-deposit amount in USD, split by signup channel.

**Approach.** Find each account's first completed deposit, convert it to USD, and count by funding month and channel. A month × channel grid shows empty combinations as 0; channels come from the accounts table, with a missing one shown as Unknown.

<!-- note -->

**Why Snowflake.** I chose Snowflake for two features many databases lack: `QUALIFY` keeps the first deposit per account without a subquery, and `ASOF JOIN` finds the latest FX rate on or before each deposit date in one join.

<!-- /note -->

```sql
-- A1. Newly funded accounts and first-deposit USD, by month and signup channel, Jan–Oct 2026
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
```

**Notes**

- The 2026 filter runs *after* finding the first deposit, so 2025-funded accounts are not counted as new.
- `rows_missing_fx_rate` flags deposits with no FX rate; it should be 0.

<!-- widget:sql-a1 -->

## A2. Cohort activity (10 points)

> Build a table with one row per funding month, January to June 2026, with: the number of accounts funded in that month; the share of those accounts that placed at least one order in the funding month, the month after, and the month after that; and the average commission per funded account in the first 90 days after its funding date.

**Approach.** One row per account with 0/1 flags for each month, then average per cohort. The `LEFT JOIN` keeps accounts with no orders in the denominator.

**Interpretation.** I read column 2 as three shares: the funding month, the month after, and the month after that.

```sql
-- A2. Funding-month cohorts, Jan–Jun 2026
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
           -- traded_m0 / m1 / m2 = traded in the funding month / next month / the month after (1 or 0)
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
       -- AVG of a 0/1 flag = share of the cohort that traded
       ROUND(AVG(traded_m0), 3)        AS share_traded_m0,
       ROUND(AVG(traded_m1), 3)        AS share_traded_m1,
       ROUND(AVG(traded_m2), 3)        AS share_traded_m2,
       ROUND(AVG(commission_90d), 2)   AS avg_commission_90d_usd
FROM per_account
GROUP BY funding_month
ORDER BY funding_month;
```

**Notes**

- Average commission is divided by **all** funded accounts, including those that never traded.
- The 90 days can end after the third month (funded 31 Jan → ends 1 May), so the join uses `GREATEST` to read far enough.
- Month 0 is the calendar funding month, so an account funded on 31 January has one day in it.
- `orders` holds only executed orders (per the brief), so no status filter is needed.
- All six cohorts are complete as of today.

<!-- widget:sql-a2 -->

<!-- widget:cohort -->

## A3. Most traded symbols (9 points)

> For each month of 2026, return the 10 symbols with the highest traded value (quantity × price), their rank, and how many places each one moved compared with the previous month. Explain how you would keep this query fast on 500 million orders.

**Approach.** Rank **every** symbol, not just the top 10, starting from **December 2025**. This gives January a previous month and shows how far a new top-10 symbol climbed.

```sql
-- A3. Top 10 symbols by traded value per month of 2026, with movement vs the previous month
WITH monthly AS (
    SELECT DATE_TRUNC('month', o.executed_at)::DATE AS month,
           o.symbol,
           SUM(o.quantity * o.price_usd)            AS traded_value_usd
    FROM orders o
    WHERE o.executed_at >= '2025-12-01'          -- December 2025 gives January a baseline
      AND o.executed_at <  '2027-01-01'          -- November 2026 is month-to-date
      AND NOT EXISTS (SELECT 1 FROM accounts a    -- exclude test accounts (missing flag = real)
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
```

**Assumptions**

- `RANK()` keeps ties, so a tie at 10th returns 11 rows. `places_moved` > 0 means moved up.
- November 2026 is month-to-date.
- Traded value counts both buys and sells.

**Keeping it fast on 500 million orders**

| Step | Snowflake | Other database (PostgreSQL, SQL Server, MySQL) |
|---|---|---|
| **Read only 13 months** | Cluster `orders` on `executed_at`; the date filter prunes micro-partitions | Partition `orders` by month; only 13 partitions are read |
| **Read fewer columns** | Columnar storage already reads only the columns used | Covering index on `(executed_at, symbol)` including `quantity`, `price_usd`, `account_id`, or a columnstore index |
| **Pre-aggregate** | Dynamic table of daily totals per symbol, refreshed incrementally | Summary table of daily totals per symbol, loaded nightly for the previous day only |
| **Compute** | Size the warehouse for the one-off backfill, not every run | Parallel query; run heavy loads off-peak or on a read replica |

**In both:** total by month first, then rank; exclude test accounts with `NOT EXISTS` (a short list); save past months' ranks, since they no longer change.

<!-- widget:sql-a3 -->

# Section B: Metrics

## B1. Active customers (5 points)

> Three teams define an active customer differently: logged in during the last 30 days, placed an order during the last 30 days, or holds any investment. Which definition would you use for revenue forecasting, which for customer retention, and why?

| Definition | Use it for | Why |
|---|---|---|
| Placed an order, last 30 days | **Revenue forecasting** | Commission is earned only on executed orders: *active traders × orders per trader × commission per order*. Interest is forecast separately, from cash balances. |
| Holds any investment | **Retention** | A customer churns when they take their money out, not when they skip a month of trading. Under the order definition, buy-and-hold investors would look churned. |
| Logged in, last 30 days | Neither; an early-warning signal | Noisy and not tied to revenue, but falling logins are an early warning of churn. |

## B2. Assets versus revenue (5 points)

> Total assets held by customers grew 20% this year, but revenue grew only 5%. Give four possible explanations. Then show how you would break revenue into components to find which one is true.

**Breaking revenue into components:** Revenue = Commission + Interest, where **Commission = Assets × Turnover × Take rate** and **Interest = Assets × Cash share × Net interest margin**.

| # | Explanation | What happened | Component that tests it | If true |
|---|---|---|---|---|
| 1 | **Market gains** | Prices rose; holding assets earns no commission | Asset growth = Net deposits + Market performance | Most of the +20% is market performance |
| 2 | **Lower turnover** | More buy-and-hold (ETFs, funds) | Turnover = Traded volume ÷ Average assets | Turnover falls |
| 3 | **Less cash or lower rates** | Cash moved into investments, or the interest margin fell | Cash share = Cash ÷ Average assets; Net interest margin = Interest revenue ÷ Cash | Either ratio falls |
| 4 | **Lower take rate** | Price cuts, promotions, discounts for large clients | Take rate = Commission ÷ Traded volume | Take rate falls |

## B3. Country comparison (5 points)

> Revenue per active customer is 2.5 times higher in Country B than in Country A. Give three explanations other than "customers in Country B are simply better", and describe how you would test one of them.

| Possible cause | What it means | How to test it |
|---|---|---|
| **Customer mix** | B has more tenured or wealthier customers, or a few very large clients lifting the average. | Split both countries into the same groups (tenure × deposit size) and recalculate B's average using A's revenue per group. If the gap closes, the mix explains it. Also compare medians, and recheck without the top 1% of clients. |
| **Acquisition channel** | In B, more customers may come through Referral and Search, arriving already intending to invest; in A, through Paid social promotions that bring smaller, occasional traders. | Compare the channel mix (`signup_channel`) in each country, then revenue per customer within the same channel. If B and A are close channel by channel, the mix of channels explains the gap. |
| **Regulation and tax** | Rules differ by country: EU retail investors can't buy US-listed ETFs without a KID, and the UK charges 0.5% stamp duty on share purchases. Fewer products and costlier trades mean fewer orders. | Compare orders per customer and the asset-type mix in each country. If A's customers place fewer orders and hold fewer US ETFs while commission per order is similar, rules explain the gap. |

# Section C: Data quality

## C1. Sudden drop (5 points)

> The daily active customers chart fell 30% on Tuesday, while orders and deposits that day look normal. List the likely causes in the order you would check them, and what you would look at for each.

Orders and deposits were normal, so trading customers were active: the problem is most likely in measurement. The first check is Wednesday, because it splits the causes in two.

**If Wednesday was back to normal (my assumption):** nothing permanent changed, and Tuesday's activity data is most likely incomplete. Orders and deposits come from the trading and payment systems, while activity comes from a separate event feed. In order:

1. **Late or partial load.** Tuesday's job ran before all events arrived, or failed partway. Re-count Tuesday from the raw event table today and look at hourly counts against previous Tuesdays; a gap of a few hours points here.
2. **Event collection outage.** The service that records logins and sessions was down for a few hours. Check its error logs and any incident or rolled-back release that day.
3. **Day boundary.** A time-zone mismatch or a job that cut the day early moved activity into Monday or Wednesday. Check whether either day is higher than usual.

**If it stayed low:** something permanent changed. Check recent changes to the metric logic (filters, joins, time zone), then any app release or tracking change, split by platform and app version.

**Real drop:** unlikely either way, since orders and deposits were normal.

**Quick test:** count accounts that placed an order on Tuesday but have no activity event. Normally it is near zero; if not, the activity data is missing events.

**Then:** reload Tuesday so the history is right, and add an alert on daily event volume so the next gap is caught the same day.

## C2. Two numbers for one month (5 points)

> Finance reports September revenue that is 4% lower than the BI dashboard. Both teams say their number is right. Describe how you would reconcile the two figures, step by step, and the most common reasons for a gap like this.

1. **Compare definitions:** gross or net, which revenue types, which date (trade or booking), time zone, which accounts, FX rate.
2. **Split both figures** by revenue type, day and entity to find where the gap sits.
3. **Match records** by order or transaction ID: only in BI, only in Finance, different amounts.
4. **Prevent the next gap:** build a BI report with the same revenue lines as Finance (commission by asset type, interest on cash, refunds and promotions) and compare them line by line every month. A total only shows that there is a gap; the lines show where, so it is fixed at the source.

**Common causes:** gross vs net, cut-off and time zone, scope (test or internal accounts), FX rates, duplicate rows in BI.

# Section D: Analytical reasoning

## D1. New onboarding flow (6 points)

> A new sign-up flow went live for all users on 1 March. The share of sign-ups who fund their account rose from 18% in February to 22% in March. The product team credits the new flow. How would you check whether the flow caused the increase, and how would you measure it properly next time?

A February-vs-March comparison can't isolate the flow. I would check:

1. **Denominator.** If the flow filters people out before they count as sign-ups, the rate rises with no more funded accounts. Check absolute funded accounts, and measure both months the same way: funded within 14 days of sign-up.
2. **Mix.** Compare rates within each channel and country.
3. **Other March effects.** Seasonality, markets, promotions. Check whether the weekly trend jumps exactly on 1 March.
4. **No control group.** The flow went live for everyone, so the best evidence is the weekly trend around 1 March (interrupted time series). It supports a causal claim but can't prove it, which is why next time needs an A/B test.
5. **Quality.** Do the extra funders deposit and trade like the others in their first 30 days?

**Next time:** an A/B test randomized before sign-up, with one primary metric (funded within 14 days), analyzed only once the last sign-ups have had their 14 days.

**Sample size** (two-sided α = 5%, power 80%):

| Difference to detect | Users per group | Total |
|---|---|---|
| 18% → 22% (+4 points, the observed jump) | ~1,570 | ~3,140 |
| 18% → 20% (+2 points) | **~6,000** | **~12,000** |

I would plan for +2 points: part of the observed jump is probably seasonality or mix, so the true effect is likely smaller. Halving the difference needs four times the sample. Run for at least two full weeks.

<!-- widget:samplesize -->

## D2. A/B test result (4 points)

> A test of a redesigned order screen ran for one week. The new screen shows 8% more orders per user, with p = 0.04. The team also checked two other metrics, which showed no difference. Should they launch? Name at least three concerns.

**Not on p = 0.04 alone.** If orders per user was the pre-set primary metric and the test is sound, the result can stand. Otherwise, confirm it with a new test that is large enough.

1. **Multiple comparisons.** Three metrics give about a 14% chance that one looks significant by luck. After correction (Bonferroni, 0.017), p = 0.04 fails, unless orders per user was the pre-set primary metric.
2. **Too short.** In one week, users may react just because the screen is new, and only one week of market conditions is covered.
3. **Orders aren't value.** If revenue didn't move, users may just be splitting orders; a few heavy traders can also drive the mean.
4. **Customer risk.** Nudging people to trade more draws regulatory attention.
5. **Sample ratio.** Check the split matched the plan (e.g. 50/50). A mismatch means assignment or tracking broke, and the result can't be trusted until it's explained.

**Multiple comparisons in numbers** (no real difference, α = 0.05 per metric, all three tested as one family):

| Metrics tested | Chance at least one is "significant" by luck | Bonferroni threshold | p = 0.04 passes? |
|---|---|---|---|
| 1 | 5% | 0.05 | Yes |
| 2 | 10% | 0.025 | No |
| **3 (this test)** | **14%** | **0.017** | **No** |
| 5 | 23% | 0.010 | No |
| 10 | 40% | 0.005 | No |

Chance = 1 − 0.95^k for k independent metrics; correlated metrics give a lower chance.

**Recommendation:** don't keep this test running until the result looks good; that raises the chance of a false positive. If a confirmatory test is needed, run it for 2–3 weeks with the primary metric (revenue per user), guardrails (cancelled orders, complaints) and sample size set in advance.

# Section E: Excel model

Model in the attached **Section_E_Subscription_Model.xlsx**. Commission per trade = `MAX(rate × value, minimum)`; subscribers pay the fee and trade free.

Using average trade values gives a lower bound: any trade under $500 pays the $1 minimum, so actual commission is likely higher. Trade-level data would refine it.

The model also holds trades per month fixed, though free trading may make subscribers trade more.

**Results (monthly)**

| Segment | Commission / customer | Current revenue | Proposed revenue | Difference |
|---|---|---|---|---|
| Starter | $3.20 | $128,000 | $141,580 | **+$13,580** |
| Regular | $40.00 | $600,000 | $464,955 | **−$135,045** |
| Active | $360.00 | $1,440,000 | $459,972 | **−$980,028** |
| **Total** | | **$2,168,000** | **$1,066,507** | **−$1,101,493 (−50.8%)** |

<!-- widget:excel -->

**Which segments bring more or less, and why?**
Only **Starter** brings more (+$13,580/month): its customers pay just $3.20/month in commission, less than the $9.99 fee. **Regular** and **Active** bring less, because subscribers stop paying $40 or $360 and pay $9.99.

**Break-even price**
`SUMPRODUCT(customers, opt-in, commission) / SUMPRODUCT(customers, opt-in)` = $1,194,400 ÷ 9,300 = **$128.43/month**.

**Why the opt-in rates won't hold**
Customers subscribe only when it saves them money, so at $128.43 no Starter or Regular customer would join, only Active traders. I would test a tiered plan for Active traders instead, such as $49–99/month for discounted commission or a capped number of free trades, as a randomized price test.

# Section F: Business review

> Management's summary of Q3 is "a good quarter, revenue up 6%".

| Metric | Q2 | Q3 | Change |
|---|---|---|---|
| Revenue ($M) | 30.0 | 31.8 | +6.0% |
| Revenue from the 20 largest clients ($M) | 6.0 | 9.6 | +60.0% |
| Revenue from all other clients ($M) | 24.0 | 22.2 | −7.5% |
| Active traders | 50,000 | 46,000 | −8.0% |
| Traded volume ($B) | 100 | 97 | −3.0% |
| New funded accounts | 10,000 | 11,500 | +15.0% |
| Marketing spend ($M) | 5.0 | 6.3 | +26.0% |
| Average first deposit ($) | 400 | 320 | −20.0% |
| Revenue per new funded account, first 30 days ($) | 200 | 150 | −25.0% |

**Derived:** top-20 share of revenue 20% → 30%; cost per new funded account $500 → $548; total first deposits $4.0M → $3.68M (−8%); first-month revenue from all new accounts $2.0M → $1.73M (−14%).

<!-- widget:section-f -->

## F1. The real state of the business (6 points)

Growth came from 20 clients. Their revenue rose 60% and is now 30% of the total, while everyone else fell 7.5%. Without their growth, revenue would be down 6%.

The base is shrinking: active traders fell 8% and volume 3%, despite 11,500 new accounts. **That is 4,000 fewer, so more traders stopped trading than started or came back.**

Acquisition is weaker: marketing rose 26% for 15% more accounts (cost per account $500 → $548), while first deposits fell 20% and first-month revenue 25%. **$1.3M more spend bought 14% less first-month revenue.**

It is a weak quarter that looks good because of 20 clients.

## F2. The number that worries me most (4 points)

**Revenue from all other clients: $24.0M → $22.2M (−7.5%).**

It covers 70% of revenue and almost every customer, and it already reflects the lost traders and weaker new cohorts. Top-20 revenue is volatile: if it returns to Q2 levels and the rest stays flat, Q4 falls to $28.2M, −11% on Q3. Active traders is only a headcount, and marketing efficiency can be fixed within a quarter. A shrinking core cannot.

## F3. Three cuts of data I would ask for next (6 points)

1. **Top-20 revenue by client, month and revenue type.** Confirms or rules out a one-off driven by a few clients or one market event.
2. **Active-trader breakdown, Q2 → Q3, for everyone else** (retained, churned, reactivated, new), split by tenure, country and asset type, and against Q3 last year to rule out summer seasonality. Confirms whether the decline is churn, and where it sits.
3. **New accounts by channel and country:** cost per account, first deposit and 30/90-day revenue, counting only accounts old enough to have a full window. Shows which channel absorbed the extra $1.3M and which spend to cut.

## F4. What management should decide differently next quarter (4 points)

| Problem (from F1) | Decision | Why it matters |
|---|---|---|
| The +6% headline hid a shrinking core | **Change the scorecard.** Report revenue excluding the top 20, active traders and payback per channel. | Management called it a good quarter while the core fell 7.5%. |
| Growth depends on 20 clients | **Manage the top 20 as a portfolio.** Give each an account manager and review our risk exposure to them. | They are 30% of revenue: losing one shows in the results at once, and back at Q2 levels Q4 falls to $28.2M, −11% on Q3. |
| Active traders fell 8% despite 11,500 new accounts | **Own retention.** Give churn an owner and a target, act on early-warning signals, and win back recent leavers. | Keeping or winning back a trader usually costs less than a $548 new account. |
| Marketing costs more and brings less | **Fund marketing by value.** Check which channels and campaigns worked by 90-day revenue per dollar, not account count, and move budget from the weakest to the strongest. | Cost per account rose to $548 while first-month revenue fell 25%. The average hides which campaigns still pay back. |
| New accounts are smaller | **Improve the first 30 days.** Education and support up to the first trade. | The first month decides whether a new customer stays. |
