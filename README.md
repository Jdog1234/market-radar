# Market Radar

A desktop app for Mac and Windows (64-bit). It reads about 3,000 headlines from ~180 sources every refresh, works out which stocks each story is about, scores the news using catalysts that research shows actually move prices, checks the stock's price trend and volume, and ranks:

- **Bullish catalysts**: stocks with news pointing up
- **Bearish catalysts**: stocks with news pointing down

**Stock Lookup:** search any US stock (ticker or company name) for a verdict on whether the evidence points up or down. The verdict weighs news catalysts, price trend, analyst consensus and price targets, earnings-surprise history, insider buying, and short interest, and it shows StockTwits crowd sentiment for context.

**Before the move:** stocks with strong news that the price hasn't reacted to yet (the setup the news-drift research favors), plus companies reporting earnings soon with a consistent beat or miss streak.

**Trade ideas:** concrete plans with entry, stop (1.5× the stock's normal daily move), target (2× the risk), time frame, and position size for your account. The win rate shown is measured from the app's own past trade ideas, never guessed.

**Trading** (formerly Paper trading): practice with fake money in the built-in simulated account, or trade for real through Alpaca (below) on live, streaming prices, in a TradingView-style workspace: candles, bars or line (1m to 1W, including pre- and after-market), VWAP / EMA 9 / EMA 21 / SMA 50 / SMA 200 / volume, horizontal and trend lines, 1, 2 or 4 charts at once (click a chart to trade it), a watchlist with live prices, and floating BUY / SELL buttons showing the bid, ask and spread. Orders, stop-losses and take-profits appear as lines on the chart that you can drag to move or × to cancel; right-click the chart to place a limit or stop at that price. Fills are realistic: buys pay the ask, sells get the bid. The Paper Trading panel underneath has positions, orders, history and an account page with an equity curve. Every Trade idea has a **Paper trade this** button that fills in the ticket for you.

**Trading tools:** size orders by shares, dollars, or the % of your equity you'd lose at the stop-loss; set take-profits at 1R–3R in one click; Breakeven, Trailing stop (0.5–5%), Reverse and Close on every position, plus Close all / Cancel all; right-click the chart to set an alert, stop-loss or take-profit at that price; price alerts with desktop notifications (they work even when the paper page isn't open); keyboard shortcuts (press **?** on the paper page).

**Real trading (Pro):** on the Trading screen click **+ Connect broker** for a step-by-step guide to opening an [Alpaca](https://alpaca.markets) account (paper/practice or live), making API keys and connecting them; then pick **Alpaca** with the account switch at the top. Orders, brackets, drag-to-move stop-loss/take-profit, breakeven, trailing stops and close/reverse go to Alpaca. Live orders always ask for confirmation, the main process refuses unconfirmed live orders, and orders above a per-order dollar limit (default $5,000) are refused. Keys are encrypted with the OS keychain. The app never places orders by itself. Tests: `node scripts/test-alpaca.js` (runs against `scripts/fake-alpaca.js`).

**Themes:** Settings → Appearance has 7 color themes (including Light), any accent color, and candle colors (including a color-blind-friendly blue/orange).

**Track record:** every scan's signals are logged and checked 1, 5 and 20 trading days later, so you can see how often the calls were actually right.

It also has a live **news feed**, an **economic calendar** for forex and macro news (CPI, jobs, FOMC… with plain-English explanations), an **earnings calendar**, and a **research guide** that explains every rule the app uses ([RESEARCH.md](RESEARCH.md)).

Every data source is free. You don't need an account or an API key.

## Install

Download the latest installer from **https://github.com/Jdog1234/market-radar/releases/latest**:

| Platform | File |
|---|---|
| Mac (Apple Silicon: M1/M2/M3/M4) | `Market-Radar-<version>-arm64.dmg` |
| Mac (Intel) | `Market-Radar-<version>-x64.dmg` |
| Windows 64-bit | `Market-Radar-Setup-<version>-x64.exe` |

The app isn't code-signed, so the first launch shows a warning:
- **Mac:** open the app once. When macOS says it can't verify the app, click **Done**, then go to **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to Market Radar. You only do this once.
  If an older download says the app **"is damaged"**, run `xattr -cr "/Applications/Market Radar.app"` in Terminal, then open it again.
- **Windows:** SmartScreen says "Windows protected your PC". Click **More info** → **Run anyway**.

## Licensed data, accounts and the website

- **Licensed data:** Settings → *Licensed market data*. Add a [Polygon.io](https://polygon.io/pricing) API key (stored encrypted in the OS keychain) and prices, charts, live quotes (with bid/ask) and news come from Polygon. **Licensed sources only** turns off every free public source, which is required before charging for the app. Still to replace for a fully licensed product: the stock list and market caps (Nasdaq screener), analyst, insider and short-interest data (Nasdaq), and the economic calendar (ForexFactory). Candidates: Financial Modeling Prep or Finnhub.
- **Pro subscriptions:** sold on Gumroad (card or PayPal) as a membership with license keys. Subscribers paste their key in Settings; `engine/account.js` checks it with Gumroad's public license API (no server needed). `cloud.json` holds the product ID and checkout link: subscriptions stay off until `checkoutUrl` is set, and `"paywall": true` locks Before the move, Trade ideas and Stock lookup for free users. Paper trading stays free, limited to one chart and 5 open orders (Pro: up to 4 charts, unlimited orders). The older Supabase/Stripe backend in `cloud/` is no longer used.
- **Website:** [`docs/`](docs/index.html), published with GitHub Pages at https://jdog1234.github.io/market-radar/. The waitlist form appears once `WAITLIST_URL` points at the backend.

## Automatic updates

Every installed copy updates itself. It checks GitHub on launch and every 3 hours, downloads the new version in the background (verifying its checksum), and shows a **Restart to update** bar. If you don't restart, the update applies the next time the app opens. If an update ever fails to start 3 times, the app falls back to its built-in version.

### Publishing an update (for the developer)

1. Make your changes, then bump `"version"` in `package.json` (for example 1.1.0 → 1.1.1).
2. Commit the changes.
3. Run:
   ```bash
   npm run release -- --notes "What changed"
   ```

This builds the update package and installers, pushes the code to the public repo, and creates the GitHub Release. Installed apps pick it up within 3 hours. Add `--no-installers` for a faster code-only update.

If you change `main.js` (the launcher), Electron, or the `build` settings, also bump `SHELL_VERSION` in `main.js`. Installed copies then show a "download the new installer" notice instead of auto-updating, because those parts can't be swapped while the app runs.

## Use

- The first scan runs at launch and takes about 15 seconds. After that the app refreshes every 15 minutes, which you can change in Settings.
- Click a stock card to see why it scored that way, its price and volume numbers, and every headline (click a headline to open it in your browser).
- **Confidence: High** means the news and the price trend agree, the score is strong, and at least two independent outlets reported it.
- ⚠ flags mark things to be careful about: earnings coming up, stocks already extended, or price moving against the news.
- Settings: your watchlist (always scanned), minimum market cap and price filters (to keep out penny-stock hype), and desktop notifications.

The app's settings and last scan are stored in `~/Library/Application Support/Market Radar` on Mac and `%APPDATA%\Market Radar` on Windows.

## Develop / rebuild

```bash
npm install
npm start            # run from source
npm run dist:mac     # → dist/*.dmg
npm run dist:win     # → dist/*.exe (works from a Mac too)
npm run release      # publish an update (see above)
```

Code layout:
- `engine/feeds.js`: news sources (RSS + targeted Google News searches)
- `engine/universe.js`: ~7,000 US-listed stocks; matches headlines to tickers
- `engine/catalysts.js`: catalyst rules, weights and half-lives (the core logic)
- `engine/prices.js`: daily history plus a live intraday bar from Nasdaq, used for trend, momentum and RVOL
- `engine/macro.js`: ForexFactory economic calendar and Nasdaq earnings calendar
- `engine/scanner.js`: combines the above into scores and ranked lists
- `engine/lookup.js`, `engine/evidence.js`: Stock Lookup and its extra evidence (analysts, earnings, insiders, short interest, crowd)
- `engine/tracker.js`: signal track record
- `engine/polygon.js`, `engine/config.js`: licensed data provider and data settings
- `engine/account.js`: sign-in and plan status (Supabase + the cloud backend)
- `engine/paper.js`: paper-trading account (orders, bid/ask fills, brackets, modify); tests in `scripts/test-paper.js`
- `engine/alpaca.js`: real trading through the user's Alpaca account (same methods as the paper account)
- `engine/alerts.js`: price alerts (saved to disk, checked on every live quote)
- `engine/stream.js`: live prices from Yahoo Finance's streaming websocket (hand-written websocket + protobuf decoder, no dependencies); tests in `scripts/test-stream.js`
- `engine/quotes.js`: CNBC quotes (fallback when the stream is down) and chart candles
- `renderer/vendor/`: TradingView Lightweight Charts 4.2.3 (Apache-2.0)
- `main.js`: launcher and auto-updater; `app-main.js`: the app itself (updatable)
- `renderer/`: the UI

## Limits

- Free feeds sometimes rate-limit. A source that fails is skipped and tried again on the next refresh. If Nasdaq refuses requests, prices switch to CNBC and the stock list comes from a saved copy (on disk, then the latest GitHub release, then rebuilt from Nasdaq Trader + CNBC).
- Matching headlines to tickers is rule-based. It's good but not perfect. Always read the headline.
- This is automated news analysis, **not financial advice** and not a prediction.
