# Market Radar

A desktop app for Mac and Windows (64-bit). It reads ~1,000+ financial headlines every refresh, works out which stocks each story is about, scores the news using catalysts that research shows actually move prices, checks the stock's price trend and volume, and ranks:

- **Bullish catalysts**: stocks with news pointing up
- **Bearish catalysts**: stocks with news pointing down

It also has a live **news feed**, an **economic calendar** for forex and macro news (CPI, jobs, FOMC… with plain-English explanations), an **earnings calendar**, and a **research guide** that explains every rule the app uses ([RESEARCH.md](RESEARCH.md)).

Every data source is free. You don't need an account or an API key.

## Install

Built installers are in `dist/`:

| Platform | File |
|---|---|
| Mac (Apple Silicon: M1/M2/M3/M4) | `Market-Radar-1.0.0-arm64.dmg` |
| Mac (Intel) | `Market-Radar-1.0.0-x64.dmg` |
| Windows 64-bit installer | `Market-Radar-Setup-1.0.0-x64.exe` |
| Windows 64-bit, no install | `Market-Radar-Portable-1.0.0-x64.exe` |

The app isn't code-signed, so the first launch shows a warning:
- **Mac:** right-click the app → **Open** → **Open**. On a Mac that downloaded the DMG from the internet, you may need System Settings → Privacy & Security → **Open Anyway**.
- **Windows:** SmartScreen says "Windows protected your PC". Click **More info** → **Run anyway**.

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
```

Code layout:
- `engine/feeds.js`: news sources (RSS + targeted Google News searches)
- `engine/universe.js`: ~7,000 US-listed stocks; matches headlines to tickers
- `engine/catalysts.js`: catalyst rules, weights and half-lives (the core logic)
- `engine/prices.js`: daily history plus a live intraday bar from Nasdaq, used for trend, momentum and RVOL
- `engine/macro.js`: ForexFactory economic calendar and Nasdaq earnings calendar
- `engine/scanner.js`: combines the above into scores and ranked lists
- `renderer/`: the UI

## Limits

- Free feeds sometimes rate-limit. A source that fails is skipped and tried again on the next refresh, and the economic calendar is cached so the app never shows it blank.
- Matching headlines to tickers is rule-based. It's good but not perfect. Always read the headline.
- This is automated news analysis, **not financial advice** and not a prediction.
