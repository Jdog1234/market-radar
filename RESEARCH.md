# What News Actually Moves Stocks — Research Guide

This is the playbook Market Radar is built on. Every catalyst the app scores, and every weight it uses, traces back to something in here. Read it once; it will make the signal lists much more useful.

> **Honest framing first.** News is the single biggest driver of *individual* stock moves, but most of it is priced in within minutes. Retail traders do not win by reading a headline faster than an algorithm. The edge that research supports is narrower: (1) some kinds of news keep moving a stock for **days to weeks** after the headline ("drift"), and (2) some kinds of news are reliably **bad** for a stock even when the first reaction looks fine. The app is built to find those two things, not to predict tomorrow's price.

---

## 1. The catalysts with the strongest evidence

### Earnings surprises → post-earnings drift (strongest, most replicated)
- **What:** A company beats or misses analyst EPS/revenue estimates.
- **Evidence:** Post-Earnings-Announcement Drift (PEAD) — Ball & Brown (1968), Bernard & Thomas (1989). Stocks with big positive surprises keep outperforming for ~60 trading days; big negative surprises keep underperforming. The effect has shrunk in large caps since the 2000s but is still present, especially in smaller and less-followed stocks.
- **What matters most:** the **guidance** (next quarter / full-year outlook) usually matters more than the quarter just reported. "Beat and raise" is the best headline; "beat but guided lower" often falls.
- **App weight:** beat +3, miss −3, guidance raise +3.5, guidance cut −3.5. Long half-life (3–5 days of news decay; the price drift lasts longer).

### Guidance changes and profit warnings
- **What:** Management raises/cuts the outlook, withdraws guidance, or pre-announces ("profit warning").
- **Why it works:** Guidance is management telling you about the future directly. Withdrawn or cut guidance is one of the most reliable bearish signals — companies hate doing it.
- **App weight:** ±3.5.

### Analyst upgrades / downgrades
- **Evidence:** Womack (1996, *Journal of Finance*) — upgrades produce a ~+3% initial move and drift for about a month; **downgrades** produce a larger initial drop and drift for up to ~6 months. Downgrades carry more information because analysts are biased toward "buy" ratings, so a downgrade is a costly signal.
- **Price-target changes** alone are weaker than rating changes. Initiations at Buy are mild.
- **App weight:** upgrade +2.5, downgrade −2.5 (downgrades decay more slowly), PT raised +1.2, PT cut −1.2.

### Share issuance (offerings / dilution) — reliably bearish
- **Evidence:** Loughran & Ritter (1995) "The New Issues Puzzle" — firms doing seasoned equity offerings underperform for years. In the short term, a priced offering usually drops the stock to around the offer price.
- **Watch for:** "public offering", "priced offering", "at-the-market (ATM) program", "registered direct", "shelf registration", warrants. Small caps that just ran up often announce an offering into strength.
- **App weight:** −2.5.

### Buybacks — mildly bullish
- **Evidence:** Ikenberry, Lakonishok & Vermaelen (1995) — open-market repurchase announcements are followed by ~12% abnormal returns over four years (strongest in value stocks). Short-term effect is small.
- **App weight:** +1.5, long half-life.

### Insider buying (not selling)
- **Evidence:** Lakonishok & Lee (2001); Cohen, Malloy & Pomorski (2012, "Decoding Inside Information") — **opportunistic** insider *purchases* predict returns; routine and scheduled selling (10b5-1 plans, tax, diversification) predicts almost nothing. Cluster buying (several insiders) is the strongest form.
- **App weight:** insider buy +2, insider sell −0.5.

### Biotech binary events
- **FDA approval** / **positive Phase 2–3 topline data**: large immediate jumps, often partly sold into.
- **FDA rejection** (Complete Response Letter / "CRL") or **failed trial endpoint**: frequently −30% to −80% in one day for single-product companies.
- **App weight:** approval +4, positive trial +3.5, rejection / failure −4.

### Mergers & acquisitions
- **Being acquired** = bullish for the target (jumps toward the deal price, then trades at a "merger arbitrage" spread).
- **The acquirer** often falls slightly on large deals — the app does not score acquirers bullish.
- **App weight:** acquisition target +4.

### Short-seller reports, fraud, accounting problems — strongly bearish
- Activist short reports (Hindenburg-style, Muddy Waters, Spruce Point, Kerrisdale, etc.) typically hit the stock hard on day one; credible ones keep falling.
- **Accounting red flags:** restatements, auditor resignation, "material weakness", delayed 10-K/10-Q filings — among the most reliable bearish signals in the literature on accounting fraud.
- **Regulatory:** SEC/DOJ/FTC probes, subpoenas, charges.
- **App weight:** short report −3.5, accounting −4, probe −2.5.

### Distress
- Bankruptcy/Chapter 11, "going concern" doubt, debt default, exchange **delisting / deficiency notices**, dividend cuts/suspensions.
- **App weight:** −3 to −4.5.

### Index inclusion
- Being added to the S&P 500 creates forced buying from index funds (Shleifer 1986; the effect has shrunk since, but the announcement still moves stocks).
- **App weight:** +2.5.

---

## 2. Weaker or noisy news (the app down-weights these)

| News type | Why it's weak | App treatment |
|---|---|---|
| "Stock soars / plunges" headlines | Describes a move that already happened. Useful only as confirmation the stock is "in play". | ±1, short half-life |
| Class-action "INVESTOR ALERT" press releases from law firms | Spam — dozens are issued after any drop. They add no information. | Capped at −0.3, de-duplicated |
| Opinion pieces ("Is X a buy?", "3 stocks to buy now", predictions) | Not news. Mostly SEO content. | 40% weight |
| Layoffs / restructuring | Market reaction is mixed — often bullish for margins. | −1 |
| Partnerships / contracts | Often vague; matters for small caps, rarely for large caps. | +1.5 |
| Insider selling | Mostly routine (see above). | −0.5 |

---

## 3. Why the app also looks at price and volume

News alone is not enough. Research on news-driven momentum shows the market's reaction tells you whether the news was a surprise:

- **Chan (2003), "Stock price reaction to news and no-news"** — stocks that move on public news show **continuation** (drift), while big moves *without* news tend to **reverse**. → The app requires a news catalyst before ranking a stock.
- **Relative volume (RVOL)** — volume far above normal means institutions are repositioning on the news. A catalyst with RVOL ≥ 1.5–2× is "in play" (this is the same "Stocks in Play" filter from the Zarattini/Barbon/Aziz ORB research in `STRATEGY_KNOWLEDGE.md`). → The app boosts scores when RVOL is high.
- **Trend confirmation** — price above its 20- and 50-day averages for longs, below for shorts. A bullish headline on a stock in a downtrend is a lower-quality signal (and vice versa).
- **Attention traps** — Barber & Odean (2008): retail investors pile into attention-grabbing stocks (big movers, news), which then *underperform*. → The app flags anything up more than ~25% in 5 days as **"extended — chasing risk"**.
- **Tone of coverage** — Tetlock (2007) showed negative media tone predicts short-term market weakness followed by partial reversal; Loughran & McDonald (2011) built the finance-specific word lists the app's fallback sentiment is modeled on (generic "negative" words like *liability* or *tax* are not negative in finance).

---

## 4. Macro & forex news (the Economic Calendar tab)

Individual-stock news sits on top of the macro tide. High-impact releases move everything at once: the index, the dollar, yields, and currency pairs. The calendar comes from the ForexFactory feed (same one the trading bot uses). Impact = Low / Medium / **High**.

**The releases that matter most (US, in rough order):**

| Release | When | Hotter than forecast usually means… |
|---|---|---|
| **FOMC rate decision + press conference** | 8× a year, 2:00pm ET | Hawkish (higher-for-longer) → USD up, yields up, stocks (esp. growth/tech) down |
| **CPI** (inflation) | ~10th–15th monthly, 8:30am ET | USD up, yields up, stocks down — the biggest single monthly mover lately |
| **Non-Farm Payrolls + unemployment rate** | 1st Friday, 8:30am ET | Strong jobs → USD up; for stocks, depends on whether the Fed is worried about inflation (good news can be bad news) |
| **Core PCE** | Late month | The Fed's preferred inflation gauge — same direction as CPI |
| **PPI** | Around CPI | Pipeline inflation; smaller CPI-like effect |
| **Retail Sales** | Mid-month | Consumer strength → USD up; good for consumer stocks |
| **ISM Manufacturing / Services PMI** | 1st/3rd business day | Above 50 = expansion; growth signal |
| **GDP** (advance estimate) | Quarterly | Growth surprise |
| **Initial Jobless Claims** | Every Thursday 8:30am ET | Rising claims = labor weakening |
| **Fed Chair / FOMC member speeches** | Ad hoc | Tone shifts move rate expectations |

**Research worth knowing:**
- **Savor & Wilson (2013)** — a large share of the equity premium is earned on days with scheduled macro announcements (CPI, jobs, FOMC). Volatility is concentrated there too.
- **Lucca & Moench (2015)** — the "pre-FOMC drift": US stocks have historically risen in the 24 hours *before* scheduled FOMC announcements.
- **Practical rule (also used by the trading bot):** avoid opening new positions in the ±20–30 minutes around a 🔴 high-impact release — spreads widen and moves whipsaw.

**Forex specifically:** currencies move on **interest-rate expectations**. Anything that changes the market's guess about a central bank's next move (CPI, jobs, central-bank speeches) moves that country's currency. The rate *differential* between two countries drives pairs like EUR/USD and USD/JPY over weeks; surprises vs. forecast drive them minute-to-minute.

---

## 5. Earnings calendar = risk calendar

A stock reporting earnings in the next few days can gap ±10% either way overnight regardless of how good the current news looks. The app marks any signal with an upcoming report as **⚠ earnings in N days**. Treat those as binary events, not trends.

---

## 6. How the app turns this into a score

1. **Collect** headlines every refresh from CNBC, MarketWatch, Seeking Alpha, Investing.com, FXStreet, PR Newswire, and ~15 targeted Google News searches (upgrades, downgrades, guidance, FDA, offerings, short reports, …), plus a news search for every stock on your watchlist.
2. **Tag tickers** in each headline — explicit `(NASDAQ: XYZ)` / `$XYZ` tags, or the company's name matched against the full Nasdaq/NYSE listing (~7,000 stocks).
3. **Classify** each headline against the catalyst rules above. Each catalyst has a direction, a weight, and a half-life; older news counts less. Repeated headlines about the same event count with diminishing weight so one story syndicated 10 times doesn't look like 10 stories.
4. **News score** (−10 … +10) = sum of decayed catalyst weights, squashed.
5. **Technical score** (−10 … +10) from the last ~3 months of daily prices: trend vs 20/50-day averages, 5- and 20-day momentum.
6. **Composite** = 65% news + 35% technical, boosted when relative volume is high.
7. **Confidence** is *High* only when news and price agree, the score is strong, and at least two independent headlines back it.
8. **Filters** (Settings): minimum market cap (default $500M) and minimum price (default $3) to keep out penny-stock pump headlines.

---

## 7. How to use the lists (and how not to)

- Treat the lists as a **research shortlist**: "these are the stocks with the most significant news right now, and the direction it points." Then look at the chart and read the actual articles (click any headline).
- **Best setups** combine: a hard catalyst (earnings/guidance/rating change/FDA), RVOL > 2, price confirming the direction, and no earnings report in the next few days.
- **Skip** signals tagged *extended* or with only one opinion-piece headline.
- **Size small** and decide your exit before entering. A news score is evidence, not a promise — plenty of "bullish" stocks fall.
- This app does not know your finances or goals and is **not financial advice**.

---

### References
- Ball, R. & Brown, P. (1968). An empirical evaluation of accounting income numbers. *Journal of Accounting Research.*
- Bernard, V. & Thomas, J. (1989). Post-earnings-announcement drift: delayed price response or risk premium? *Journal of Accounting Research.*
- Womack, K. (1996). Do brokerage analysts' recommendations have investment value? *Journal of Finance.*
- Loughran, T. & Ritter, J. (1995). The new issues puzzle. *Journal of Finance.*
- Ikenberry, D., Lakonishok, J. & Vermaelen, T. (1995). Market underreaction to open market share repurchases. *Journal of Financial Economics.*
- Lakonishok, J. & Lee, I. (2001). Are insider trades informative? *Review of Financial Studies.*
- Cohen, L., Malloy, C. & Pomorski, L. (2012). Decoding inside information. *Journal of Finance.*
- Chan, W. S. (2003). Stock price reaction to news and no-news: drift and reversal after headlines. *Journal of Financial Economics.*
- Tetlock, P. (2007). Giving content to investor sentiment: the role of media in the stock market. *Journal of Finance.*
- Loughran, T. & McDonald, B. (2011). When is a liability not a liability? Textual analysis, dictionaries, and 10-Ks. *Journal of Finance.*
- Barber, B. & Odean, T. (2008). All that glitters: the effect of attention and news on the buying behavior of individual and institutional investors. *Review of Financial Studies.*
- Savor, P. & Wilson, M. (2013). How much do investors care about macroeconomic risk? Evidence from scheduled economic announcements. *Journal of Financial and Quantitative Analysis.*
- Lucca, D. & Moench, E. (2015). The pre-FOMC announcement drift. *Journal of Finance.*
- Shleifer, A. (1986). Do demand curves for stocks slope down? *Journal of Finance.*
- Zarattini, C., Barbon, A. & Aziz, A. (2024). A profitable day trading strategy for the U.S. equity market (Stocks in Play / ORB). SSRN.
