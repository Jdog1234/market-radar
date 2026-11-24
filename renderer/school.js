// Trading school: the course content. Each module has lessons (HTML) and a quiz.
// Links with data-goto="<view>" open that part of the app. Educational, not advice.
window.SCHOOL = [
  {
    id: 'basics',
    title: 'How the stock market works',
    summary: 'What you actually buy, who you trade with, and when the market is open.',
    lessons: [
      {
        id: 'stocks',
        title: 'What a stock is',
        body: `<p>A share of stock is a small piece of ownership in a company. If a company has 1 billion shares and you own 100, you own one ten-millionth of it. Its price is simply the last price at which a buyer and a seller agreed to trade.</p>
<p>Prices move because the crowd keeps changing its mind about what the company is worth. Earnings, guidance, new products, interest rates, lawsuits and plain mood all feed into that. <b>News is the fuel; buyers and sellers are the engine.</b></p>
<h3>Ways to make (or lose) money</h3>
<ul><li><b>Going long:</b> buy, hope to sell higher later.</li><li><b>Going short:</b> borrow shares, sell them, hope to buy them back cheaper. Losses on a short have no fixed limit, because a price can keep rising.</li><li><b>ETFs</b> (like SPY or QQQ) are baskets of many stocks that trade like one stock. They are a simple way to trade "the market".</li></ul>
<div class="key"><b>Key points</b>A share is part-ownership. Price is just the latest agreed trade. Long profits when price rises, short profits when it falls, and shorts carry open-ended risk.</div>`,
      },
      {
        id: 'hours',
        title: 'Exchanges, hours and market data',
        body: `<p>US stocks trade on exchanges such as the NYSE and Nasdaq. Your broker routes your order to them.</p>
<table><tr><th>Session</th><th>Time (New York)</th><th>What to know</th></tr>
<tr><td>Pre-market</td><td>4:00 – 9:30 am</td><td>Thin trading, wide spreads, news reactions start here</td></tr>
<tr><td>Regular</td><td>9:30 am – 4:00 pm</td><td>Most volume; the official open and close</td></tr>
<tr><td>After-hours</td><td>4:00 – 8:00 pm</td><td>Earnings often land here; prices jump around</td></tr></table>
<p>The first and last 30 minutes of the regular session are the busiest and most volatile. Big moves often happen at the open as the market digests overnight news.</p>
<p>The market is closed on weekends and US market holidays. News that comes out while it's closed shows up as a <b>gap</b>: the next open is far from the last close.</p>
<div class="key"><b>Key points</b>Regular hours are 9:30–4:00 New York time. Extended hours have fewer traders and wider spreads. Overnight news creates gaps at the open.</div>`,
      },
      {
        id: 'quotes',
        title: 'Bid, ask, spread and volume',
        body: `<p>Every stock has two prices at any moment:</p>
<ul><li><b>Bid:</b> the highest price a buyer is offering right now. You sell at the bid.</li><li><b>Ask:</b> the lowest price a seller will accept. You buy at the ask.</li><li><b>Spread:</b> the gap between them. It's a hidden cost every time you trade.</li></ul>
<p>Example: bid $100.00, ask $100.04. Buy 100 shares at market and you pay $100.04. If you sold straight away you'd get $100.00, an instant $4 loss. Big stocks like Apple have spreads of a cent or two; small, thinly traded stocks can have spreads of 1% or more.</p>
<p><b>Volume</b> is how many shares traded. High volume means many participants, tight spreads and easier fills. A move on unusually high volume (high <b>relative volume</b>, RVOL) shows real conviction behind it.</p>
<p>The Trading screen shows the live bid, ask and spread on its BUY and SELL buttons, and simulated fills use the same rule: buys at the ask, sells at the bid.</p>
<div class="key"><b>Key points</b>Buy at the ask, sell at the bid; the spread is a cost. Prefer liquid stocks with tight spreads. Volume shows how much conviction is behind a move.</div>`,
      },
      {
        id: 'orders',
        title: 'Order types',
        body: `<table><tr><th>Order</th><th>What it does</th><th>Risk</th></tr>
<tr><td><b>Market</b></td><td>Fills right away at the best available price</td><td>You don't control the price (slippage)</td></tr>
<tr><td><b>Limit</b></td><td>Fills only at your price or better</td><td>May never fill</td></tr>
<tr><td><b>Stop</b></td><td>Becomes a market order once the price touches your level</td><td>Can fill far beyond your level after a gap</td></tr>
<tr><td><b>Stop-limit</b></td><td>Becomes a limit order at your level</td><td>May not fill at all in a fast drop</td></tr></table>
<p>A <b>stop-loss</b> is a stop order placed to get you out if the trade goes wrong. A <b>take-profit</b> is a limit order to exit at your target. Placed together after an entry they form a <b>bracket</b>: when one fills, the other is cancelled (one-cancels-other, OCO).</p>
<p>In the <a data-goto="paper">Trading screen</a> you can place all of these, see them as lines on the chart and drag them to new prices.</p>
<div class="key"><b>Key points</b>Market = certainty of filling; limit = certainty of price. Stops protect you but don't guarantee a price. Use brackets so every trade has a planned exit.</div>`,
      },
    ],
    quiz: [
      { q: 'You want to buy right now. Which price will a market order fill at?', options: ['The bid', 'The ask', 'The last trade', 'The day\'s open'], answer: 1, why: 'Buyers pay the ask (the lowest price a seller accepts); sellers receive the bid.' },
      { q: 'Which order guarantees your price but not that it fills?', options: ['Market', 'Stop', 'Limit', 'Trailing stop'], answer: 2, why: 'A limit order only fills at your price or better, so it may not fill at all.' },
      { q: 'When are regular US market hours (New York time)?', options: ['8:00 am – 5:00 pm', '9:30 am – 4:00 pm', '4:00 am – 8:00 pm', '10:00 am – 3:30 pm'], answer: 1, why: 'The regular session runs 9:30 am to 4:00 pm Eastern. Pre-market and after-hours are extra sessions.' },
      { q: 'A stock last closed at $50. Bad news comes out overnight and it opens at $44. Your stop-loss was at $48. Roughly where does it fill?', options: ['$48', 'Around $44', '$50', 'It doesn\'t fill'], answer: 1, why: 'A stop becomes a market order when touched. After a gap down it fills near the open, far below your stop.' },
      { q: 'Why does a wide spread matter?', options: ['It increases dividends', 'It\'s a cost you pay on every round trip', 'It makes stops more reliable', 'It doesn\'t matter for small trades'], answer: 1, why: 'You buy at the ask and sell at the bid, so the spread comes out of your result on every trade.' },
    ],
  },
  {
    id: 'charts',
    title: 'Reading price charts',
    summary: 'Candles, timeframes, trends, support and resistance.',
    lessons: [
      {
        id: 'candles',
        title: 'Candlestick anatomy',
        body: `<p>Each candle shows four prices for one period (a minute, a day, a week):</p>
<ul><li><b>Open</b> and <b>close</b> form the thick <b>body</b>. Green (or hollow) means it closed higher than it opened; red means it closed lower.</li><li><b>High</b> and <b>low</b> are the ends of the thin lines, called <b>shadows</b> or <b>wicks</b>.</li></ul>
<p>Read a candle as a story of the battle between buyers and sellers. A long lower shadow means sellers pushed price down but buyers pushed it back. A long green body with tiny shadows means buyers controlled the whole period. A tiny body means neither side won.</p>
<p>The <a data-goto="patterns">Pattern library</a> shows the classic one-, two- and three-candle patterns, and <a data-goto="puzzles">Candle puzzles</a> lets you practise spotting them on real charts.</p>
<div class="key"><b>Key points</b>Body = open to close; shadows = high and low. Long shadows show rejection; long bodies show control; tiny bodies show indecision.</div>`,
      },
      {
        id: 'timeframes',
        title: 'Timeframes',
        body: `<p>The same stock can look bullish on one timeframe and bearish on another. A 5-minute chart can be falling inside a daily uptrend.</p>
<table><tr><th>Style</th><th>Holds for</th><th>Main chart</th><th>Check also</th></tr>
<tr><td>Day trading</td><td>Minutes–hours</td><td>1–5 minute</td><td>Daily for key levels</td></tr>
<tr><td>Swing trading</td><td>Days–weeks</td><td>Daily</td><td>Weekly for the big trend</td></tr>
<tr><td>Position trading</td><td>Weeks–months</td><td>Weekly</td><td>Monthly</td></tr></table>
<p>A good habit is <b>top-down analysis</b>: start on the higher timeframe to see the trend and big levels, then zoom in to time your entry. Trades that go with the higher-timeframe trend have the wind at their back.</p>
<p>Shorter timeframes have more noise. Signals on a 1-minute chart are far less meaningful than the same signal on a daily chart.</p>
<div class="key"><b>Key points</b>Pick a timeframe that matches how long you'll hold. Check one level higher for the trend. Lower timeframes = more noise.</div>`,
      },
      {
        id: 'trend',
        title: 'Trends',
        body: `<p>An <b>uptrend</b> is a series of higher highs and higher lows. A <b>downtrend</b> is lower highs and lower lows. Anything else is a <b>range</b> (sideways).</p>
<p>A simple way to see the trend is a moving average. If price is above a rising 50-day average, the medium-term trend is up. Many traders only buy stocks in uptrends and only short stocks in downtrends.</p>
<p>Trends tend to persist more often than they reverse; this is the "momentum" effect, one of the best-documented findings in finance. That's why "the trend is your friend" is a cliché: buying a falling stock because it "looks cheap" fights the odds.</p>
<p>Trends end too. Warning signs: a failed new high, a break of the last higher low, or a big reversal candle on heavy volume at a key level.</p>
<div class="key"><b>Key points</b>Uptrend = higher highs and higher lows. Trade with the trend more than against it. A broken higher low is the first sign an uptrend may be ending.</div>`,
      },
      {
        id: 'levels',
        title: 'Support and resistance',
        body: `<p><b>Support</b> is a price area where buying has stopped falls before. <b>Resistance</b> is an area where selling has stopped rises. They exist because traders remember prices: people who missed buying at $50 want to buy if it comes back; people who bought at $60 and watched it fall want to sell when it gets back to $60.</p>
<ul><li>The more times a level has held, and the more volume traded there, the more it matters.</li><li>Round numbers ($100, $50) and the previous day's high and low often act as levels.</li><li>When resistance breaks, it often becomes support (and the other way round). This "role reversal" is a classic entry point.</li></ul>
<p>Use the horizontal line tool in the Trading screen (Alt+H) to mark levels. Candlestick patterns are far more meaningful <b>at</b> a level than in the middle of nowhere.</p>
<div class="key"><b>Key points</b>Levels are areas, not exact prices. Broken resistance often becomes support. Patterns at a level beat patterns in the middle of a range.</div>`,
      },
    ],
    quiz: [
      { q: 'A candle has a small body near its high and a long lower shadow. What happened?', options: ['Buyers controlled the whole day', 'Sellers pushed down, buyers pushed back', 'Nothing traded', 'The stock gapped up'], answer: 1, why: 'The long lower shadow shows a big drop during the period that buyers then reversed.' },
      { q: 'Which sequence describes an uptrend?', options: ['Lower highs, lower lows', 'Higher highs, higher lows', 'Equal highs and lows', 'Higher highs, lower lows'], answer: 1, why: 'An uptrend makes higher highs and higher lows.' },
      { q: 'A stock breaks above resistance at $80 and later pulls back to $80. What often happens?', options: ['$80 acts as support', 'It must fall to zero', 'Resistance always holds forever', 'The stock is delisted'], answer: 0, why: 'Broken resistance often turns into support: the role-reversal idea.' },
      { q: 'You swing trade, holding for days to weeks. Which chart is your main one?', options: ['1-minute', 'Daily', 'Monthly', 'Tick chart'], answer: 1, why: 'Swing traders mostly use daily charts and check the weekly for the bigger trend.' },
      { q: 'Why check a higher timeframe before entering?', options: ['To find the bigger trend and key levels', 'Because lower timeframes are illegal', 'To get better dividends', 'It isn\'t useful'], answer: 0, why: 'Top-down analysis shows the trend and levels your trade is operating inside.' },
    ],
  },
  {
    id: 'patterns',
    title: 'Candlestick patterns, honestly',
    summary: 'The classic patterns, what the data really says, and how to use them well.',
    lessons: [
      {
        id: 'classic',
        title: 'The classic patterns',
        body: `<p>Candlestick patterns come from 18th-century Japanese rice traders and were popularised in the West by Steve Nison. They group into three families:</p>
<ul><li><b>Reversal</b> patterns after a move: hammer, shooting star, engulfing, morning and evening star, harami, piercing line, dark cloud cover, tweezers.</li><li><b>Continuation</b> patterns: marubozu, three white soldiers, three black crows.</li><li><b>Indecision</b>: doji and spinning top.</li></ul>
<p>Most reversal patterns <b>need a trend before them</b>. A hammer only means something after a fall; the identical shape after a rise is called a hanging man and is read the opposite way.</p>
<p>Open the <a data-goto="patterns">Pattern library</a> to see each one drawn, explained, and with a real example from the data.</p>
<div class="key"><b>Key points</b>Three families: reversal, continuation, indecision. Context decides the name and meaning: the same shape after a rise and after a fall are different patterns.</div>`,
      },
      {
        id: 'evidence',
        title: 'What the data actually says',
        body: `<p>Here's something most trading courses won't tell you: <b>on their own, most candlestick patterns barely predict anything.</b> Academic tests on US stocks (for example Marshall, Young and Rose, 2006) found that classic patterns had no reliable profit after costs.</p>
<p>Market Radar measured every pattern on about 50,000 real trading days of large US stocks. In this data the price was higher five days later on about 53% of all days, and most patterns land within a few points of that. Some even did the opposite of their textbook meaning. Check the live numbers in the <a data-goto="patterns">Pattern library</a>.</p>
<p>Why? Big stocks are watched by millions of traders and algorithms. A pattern anyone can see on a chart is already "priced in".</p>
<h3>So are patterns useless?</h3>
<p>No, but they're a tool for <b>timing</b>, not a reason to trade. A hammer at a strong support level, in an uptrend, after good news, on high volume, with a tight stop just below it is a far better setup than a hammer anywhere. The pattern tells you <i>where to put your stop</i> and <i>when sellers may be exhausted</i>, while the edge comes from the context.</p>
<div class="key"><b>Key points</b>Patterns alone are close to a coin flip in big stocks. Use them for timing and stop placement at levels you already care about, never as the whole reason for a trade.</div>`,
      },
      {
        id: 'using',
        title: 'Using patterns well',
        body: `<p>A practical checklist before acting on a pattern:</p>
<ol><li><b>Location:</b> is it at support or resistance, a round number or yesterday's high or low?</li><li><b>Trend:</b> does it agree with the higher-timeframe trend? A bullish pattern in an uptrend pullback beats one in a downtrend.</li><li><b>Volume:</b> was volume above average on the pattern candle?</li><li><b>Confirmation:</b> did the next candle follow through, for example closing above a hammer's high?</li><li><b>Catalyst:</b> is there news behind the move? See <a data-goto="before">Before the move</a>.</li><li><b>Risk:</b> is the distance to the stop (beyond the pattern's extreme) small enough for a good reward-to-risk?</li></ol>
<p>Practise in <a data-goto="puzzles">Candle puzzles</a>: real charts cut off at a pattern. You'll quickly feel how often "textbook" signals fail, and you'll start reading the context instead.</p>
<div class="key"><b>Key points</b>Location, trend, volume, confirmation, catalyst, risk. If you can't tick most of them, skip the trade.</div>`,
      },
    ],
    quiz: [
      { q: 'A hammer shape appears after a strong rise. What is it called?', options: ['Hammer', 'Hanging man', 'Shooting star', 'Doji'], answer: 1, why: 'The same shape after a rise is a hanging man and is read as a possible top.' },
      { q: 'According to the data, how predictive are most candlestick patterns on their own in large US stocks?', options: ['Very: over 80% accurate', 'Close to a coin flip', 'They always predict the opposite', 'They predict exact prices'], answer: 1, why: 'Most patterns land within a few points of an ordinary day; the context is what matters.' },
      { q: 'What is the best use of a pattern?', options: ['As the only reason for a trade', 'Timing an entry and placing a stop at a level you already like', 'Predicting the exact target price', 'Ignoring the trend'], answer: 1, why: 'Patterns are timing tools; the edge comes from location, trend, volume and catalysts.' },
      { q: 'What confirms a hammer for many traders?', options: ['The next candle closes above the hammer\'s high', 'The stock pays a dividend', 'Volume falls to zero', 'A doji appears'], answer: 0, why: 'Follow-through above the hammer shows buyers really took control.' },
      { q: 'Which family does a doji belong to?', options: ['Reversal', 'Continuation', 'Indecision', 'Volume'], answer: 2, why: 'A doji shows neither side won: indecision.' },
    ],
  },
  {
    id: 'indicators',
    title: 'Indicators that matter',
    summary: 'Moving averages, VWAP, ATR, RSI and volume, and what each is good for.',
    lessons: [
      {
        id: 'ma',
        title: 'Moving averages and VWAP',
        body: `<p>A <b>moving average</b> smooths price to show the trend.</p>
<ul><li><b>SMA</b> (simple) averages the last N closes equally. The 50-day and 200-day SMAs are watched by huge numbers of traders.</li><li><b>EMA</b> (exponential) weights recent prices more, so it reacts faster. The 9 and 21 EMAs are popular for short-term trading.</li><li><b>VWAP</b> (volume-weighted average price) is the average price paid today, weighted by volume. Institutions use it as a benchmark. Above VWAP, buyers are in control for the day; below it, sellers are.</li></ul>
<p>Uses: trend filter (only buy above the 50-day), dynamic support (pullbacks to the 21 EMA in strong trends), and day-trading bias (above or below VWAP). All of these are in the Trading screen under <b>ƒx Indicators</b>.</p>
<p>Moving averages <b>lag</b>: they describe what has happened. Crossovers alone make poor signals in sideways markets.</p>
<div class="key"><b>Key points</b>SMA/EMA show trend; VWAP shows who's winning today. They lag, so use them as filters and context, not as triggers on their own.</div>`,
      },
      {
        id: 'atr',
        title: 'ATR: how much a stock normally moves',
        body: `<p><b>Average True Range (ATR)</b> is the average size of a stock's daily move, gaps included. If a $100 stock has a 14-day ATR of $3, a normal day moves about 3%.</p>
<p>ATR is one of the most useful numbers in trading because it scales everything to the stock:</p>
<ul><li><b>Stops:</b> a stop 0.3 ATR away will be hit by normal noise; 1–2 ATR gives the trade room. Market Radar's trade ideas use 1.5× ATR.</li><li><b>Targets:</b> a target of 10 ATR in a week is fantasy; 2–3 ATR is realistic.</li><li><b>Reactions:</b> a stock that moved less than one ATR after big news hasn't really reacted yet. That's exactly what <a data-goto="before">Before the move</a> looks for.</li></ul>
<div class="key"><b>Key points</b>ATR = a normal day's move. Put stops 1–2 ATR away, set targets in ATR terms, and compare news reactions to ATR.</div>`,
      },
      {
        id: 'rsi',
        title: 'RSI and volume',
        body: `<p><b>RSI</b> (Relative Strength Index, usually 14 periods) runs from 0 to 100 and measures how strong recent gains are compared with losses. Above 70 is called overbought, below 30 oversold.</p>
<p>The common mistake is shorting because RSI is above 70. Strong stocks can stay overbought for weeks. A more useful reading: in an uptrend, a pullback that takes RSI down to 40–50 and turns up is often a buying opportunity; and a new price high with a lower RSI high (divergence) warns the move is tiring.</p>
<p><b>Volume</b> confirms moves. A breakout on two to three times normal volume (RVOL 2–3×) has real participation; a breakout on low volume often fails. Market Radar shows RVOL on every signal.</p>
<div class="key"><b>Key points</b>Overbought is not a sell signal in a strong trend. Use RSI for pullbacks and divergences. High relative volume confirms breakouts and news moves.</div>`,
      },
    ],
    quiz: [
      { q: 'A stock trades at $100 with an ATR of $4. Which stop gives the trade reasonable room?', options: ['$99.50', 'About $94', '$60', '$99.90'], answer: 1, why: 'About 1.5 ATR ($6) below gives room for normal daily noise.' },
      { q: 'What does VWAP tell a day trader?', options: ['The dividend yield', 'The average price paid today, weighted by volume', 'Tomorrow\'s close', 'The 200-day trend'], answer: 1, why: 'VWAP is today\'s volume-weighted average price, a benchmark for who is in control.' },
      { q: 'RSI is 78 in a strong uptrend. What\'s the sensible reading?', options: ['Short immediately', 'Strong momentum; overbought can last', 'The stock will crash tomorrow', 'RSI is broken'], answer: 1, why: 'Strong stocks can stay overbought for long periods. It is not a sell signal by itself.' },
      { q: 'A breakout happens on 3× normal volume. What does that suggest?', options: ['Strong participation, more likely to hold', 'Nobody cares', 'It will definitely fail', 'Volume doesn\'t matter'], answer: 0, why: 'High relative volume shows conviction behind the move.' },
      { q: 'What is the main weakness of moving averages?', options: ['They lag price', 'They predict the future perfectly', 'They only work on Fridays', 'They ignore closes'], answer: 0, why: 'They are averages of past prices, so they always lag.' },
    ],
  },
  {
    id: 'news',
    title: 'Trading the news',
    summary: 'Which news moves stocks, why prices under-react, and how Market Radar finds it.',
    lessons: [
      {
        id: 'catalysts',
        title: 'Catalysts that move stocks',
        body: `<p>A <b>catalyst</b> is news that changes what a company is worth. Research shows some catalysts matter much more than others:</p>
<table><tr><th>Catalyst</th><th>Why it matters</th></tr>
<tr><td>Earnings surprise</td><td>Actual results vs expectations. Big beats and misses keep drifting for weeks</td></tr>
<tr><td>Guidance change</td><td>Management raising or cutting its own forecast is often bigger than the quarter itself</td></tr>
<tr><td>Analyst up/downgrade</td><td>Moves prices, especially from respected analysts and with target changes</td></tr>
<tr><td>FDA decisions, trial results</td><td>Can double or halve a biotech overnight</td></tr>
<tr><td>Share offerings</td><td>New shares dilute owners, usually negative</td></tr>
<tr><td>Insider buying</td><td>Executives buying with their own money is a meaningful positive</td></tr>
<tr><td>Macro data (CPI, jobs, Fed)</td><td>Moves the whole market at once</td></tr></table>
<p>The <a data-goto="guide">Research guide</a> lists the studies behind each one and how Market Radar scores it.</p>
<div class="key"><b>Key points</b>Earnings surprises, guidance, analyst changes and insider buying are among the best-studied catalysts. Macro releases move everything, so check the <a data-goto="calendar">economic calendar</a>.</div>`,
      },
      {
        id: 'drift',
        title: 'Why prices under-react',
        body: `<p>You'd think a stock jumps to its new fair value the moment news comes out. Often it doesn't. Decades of research on <b>post-earnings-announcement drift</b> (Ball and Brown, 1968; Bernard and Thomas, 1989) found that after big earnings surprises, stocks keep drifting the same way for weeks.</p>
<p>Reasons include investors anchoring to old views, big funds building positions slowly over days, and news being hard to interpret at first. The drift is strongest when the first reaction was small relative to the news.</p>
<p>That's the idea behind <a data-goto="before">Before the move</a>: strong news, but a move smaller than a normal day (ATR). It's also why a stock that has already jumped 15% on news often has little left; the easy move is gone.</p>
<div class="key"><b>Key points</b>Prices often under-react to news and drift afterwards. The best setups pair strong news with a muted reaction. Chasing a huge gap is a different, riskier trade.</div>`,
      },
      {
        id: 'earnings',
        title: 'Earnings season',
        body: `<p>Four times a year companies report results. Earnings are <b>binary events</b>: a stock can gap 10% or more overnight in either direction, straight through any stop-loss.</p>
<ul><li>Know the dates. The <a data-goto="earnings">Earnings</a> page lists upcoming reports.</li><li>Holding through earnings is a gamble on the gap. Many swing traders close or shrink positions before the report.</li><li>Trading <b>after</b> the report (the reaction) is usually safer than guessing before it.</li><li>A stock with a long streak of beats tends to keep beating, but the market expects that, so the reaction to a "normal" beat can still be negative.</li></ul>
<div class="key"><b>Key points</b>Earnings can gap through stops. Know the dates, size down or close before them, and prefer trading the reaction over guessing the result.</div>`,
      },
    ],
    quiz: [
      { q: 'What is post-earnings-announcement drift?', options: ['Stocks keep moving in the direction of an earnings surprise for weeks', 'Stocks always fall after earnings', 'Earnings are paid as dividends', 'Prices freeze after earnings'], answer: 0, why: 'Research since the 1960s shows prices tend to keep drifting after big surprises.' },
      { q: 'Which setup does "Before the move" look for?', options: ['Huge gaps that already happened', 'Strong news with a move smaller than a normal day', 'Stocks with no news', 'Penny stocks only'], answer: 1, why: 'Strong news plus a muted reaction is where drift has the most room.' },
      { q: 'You hold a swing trade with a stop 5% away, and the company reports earnings tonight. What\'s the main risk?', options: ['None, the stop protects you', 'A gap can blow through the stop', 'Earnings can\'t move a stock', 'The spread disappears'], answer: 1, why: 'Stops fill at the next available price, which after a gap can be far beyond your level.' },
      { q: 'Which is usually a negative catalyst?', options: ['Guidance raised', 'Insider buying', 'A new share offering', 'Analyst upgrade'], answer: 2, why: 'Offerings dilute existing shareholders, so they usually push the price down.' },
      { q: 'Why check the economic calendar?', options: ['Macro releases can move the whole market', 'It lists dividends', 'It shows your trades', 'It has no use'], answer: 0, why: 'CPI, jobs data and Fed decisions move all stocks at once.' },
    ],
  },
  {
    id: 'risk',
    title: 'Risk management',
    summary: 'The part that actually keeps you in the game: position size, stops and the maths of losing.',
    lessons: [
      {
        id: 'sizing',
        title: 'Position sizing: the 1% rule',
        body: `<p>Professional traders decide <b>how much they can lose</b> before they think about how much they can make. A common rule: risk no more than 1% (at most 2%) of your account on a single trade.</p>
<p><b>Formula:</b> shares = (account × risk %) ÷ (entry price − stop price)</p>
<p>Example: $10,000 account, 1% risk = $100. Buy at $50 with a stop at $48 ($2 risk per share). Shares = 100 ÷ 2 = <b>50 shares</b> ($2,500 position). If the stop hits you lose about $100, not your account.</p>
<p>Notice the position is $2,500 even though you only risk $100. The stop distance, not your conviction, decides the size. A volatile stock with a wide stop gets fewer shares.</p>
<p>The Trading screen does this for you: choose <b>Size by → Risk %</b>, set a stop-loss, and the share count is calculated.</p>
<div class="key"><b>Key points</b>Risk 1% per trade. Size = risk dollars ÷ distance to stop. Wider stop = fewer shares. Decide the loss first.</div>`,
      },
      {
        id: 'rmultiple',
        title: 'Reward-to-risk and expectancy',
        body: `<p>Measure every trade in <b>R</b>, where 1R is the amount you risked. A trade risking $100 that makes $200 is +2R; one stopped out is −1R.</p>
<p><b>Expectancy</b> = (win rate × average win) − (loss rate × average loss).</p>
<table><tr><th>Win rate</th><th>Reward : risk</th><th>Expectancy per trade</th></tr>
<tr><td>40%</td><td>2 : 1</td><td>0.4×2 − 0.6×1 = <b>+0.2R</b></td></tr>
<tr><td>60%</td><td>1 : 1</td><td>0.6×1 − 0.4×1 = <b>+0.2R</b></td></tr>
<tr><td>70%</td><td>0.5 : 1</td><td>0.7×0.5 − 0.3×1 = <b>+0.05R</b></td></tr>
<tr><td>30%</td><td>2 : 1</td><td>0.3×2 − 0.7×1 = <b>−0.1R</b></td></tr></table>
<p>You don't need to be right most of the time. With 2:1 trades you only need to win more than 1 in 3 to come out ahead (before costs). That's why Market Radar's trade ideas use 2R targets and show the break-even win rate.</p>
<div class="key"><b>Key points</b>Think in R. Expectancy, not win rate, decides profitability. With 2:1 reward-to-risk, break-even is about 33%.</div>`,
      },
      {
        id: 'drawdown',
        title: 'The maths of losing',
        body: `<p>Losses hurt more than gains help, because you need a bigger percentage gain to recover:</p>
<table><tr><th>Loss</th><th>Gain needed to get back</th></tr><tr><td>10%</td><td>11%</td></tr><tr><td>25%</td><td>33%</td></tr><tr><td>50%</td><td>100%</td></tr><tr><td>75%</td><td>300%</td></tr></table>
<p>Losing streaks are normal. Even a solid 50%-win-rate strategy will have runs of 6–8 losses in a row over a few hundred trades. At 1% risk, eight losses cost about 8%. At 10% risk they cost more than half your account.</p>
<p>Rules that protect you:</p>
<ul><li>Always use a stop, and never move it further away.</li><li>Set a daily or weekly loss limit (for example 3% of the account) and stop trading when you hit it.</li><li>Avoid holding through earnings at full size.</li><li>Be careful with leverage and shorts; both can lose more than you expect.</li></ul>
<div class="key"><b>Key points</b>A 50% loss needs a 100% gain to recover. Losing streaks are guaranteed; small risk per trade is what lets you survive them.</div>`,
      },
    ],
    quiz: [
      { q: '$20,000 account, 1% risk, entry $40, stop $38. How many shares?', options: ['50', '100', '500', '200'], answer: 1, why: '$200 risk ÷ $2 per share = 100 shares.' },
      { q: 'You win 40% of trades with 2:1 reward-to-risk. What\'s your expectancy?', options: ['−0.2R', '+0.2R', '0', '+0.8R'], answer: 1, why: '0.4 × 2 − 0.6 × 1 = +0.2R per trade.' },
      { q: 'After a 50% loss, what gain gets you back to even?', options: ['50%', '75%', '100%', '25%'], answer: 2, why: 'Half the money has to double to get back to the start.' },
      { q: 'With 2:1 trades, roughly what win rate breaks even (before costs)?', options: ['50%', '33%', '66%', '10%'], answer: 1, why: 'Win 1, lose 2: +2R − 2R = 0. That is one win in three.' },
      { q: 'Your trade is near its stop. What should you do?', options: ['Move the stop further away', 'Add more shares', 'Let the stop do its job', 'Remove the stop'], answer: 2, why: 'Moving stops further away turns small losses into big ones. Honour the plan.' },
    ],
  },
  {
    id: 'plan',
    title: 'Planning and executing trades',
    summary: 'Setups, a written trading plan, checklists and a trade journal.',
    lessons: [
      {
        id: 'setup',
        title: 'Anatomy of a trade plan',
        body: `<p>Every trade needs answers <b>before</b> you enter:</p>
<ol><li><b>Why?</b> The setup: what news, pattern or level gives you an edge.</li><li><b>Entry:</b> the price or trigger (for example a break of the morning high).</li><li><b>Stop:</b> where you're proven wrong, usually beyond a level or about 1.5 ATR.</li><li><b>Target:</b> where you'll take profit, ideally 2R or more.</li><li><b>Size:</b> from the 1% rule.</li><li><b>Time:</b> how long you'll give it before exiting anyway.</li></ol>
<p>Market Radar's <a data-goto="trades">Trade ideas</a> follow exactly this structure. Click <b>Trade this</b> and the plan loads into the order panel, including the bracket.</p>
<p>Don't chase. If a stock gaps far beyond your entry, the reward-to-risk is gone; let it go. There is always another trade.</p>
<div class="key"><b>Key points</b>Why, entry, stop, target, size, time. If you can't write all six down, you don't have a trade yet.</div>`,
      },
      {
        id: 'checklist',
        title: 'A pre-trade checklist',
        body: `<p>Pilots use checklists because good habits beat memory under pressure. A trading version:</p>
<ul><li>☐ Is there a clear catalyst or setup?</li><li>☐ Does it agree with the higher-timeframe trend and the market's mood (SPY/QQQ)?</li><li>☐ Any earnings or big economic release before my time frame ends?</li><li>☐ Is the stop at a logical level, not just a random percentage?</li><li>☐ Is the reward at least 2× the risk?</li><li>☐ Is my size within 1% risk, and my total exposure sensible?</li><li>☐ Is the stock liquid, with a tight spread and good volume?</li><li>☐ Am I calm, or am I chasing, bored or trying to win back a loss?</li></ul>
<p>Use <a data-goto="paper">alerts</a> (right-click the chart, or Alt+A) so price comes to you instead of you staring at the screen.</p>
<div class="key"><b>Key points</b>A checklist removes impulse trades. The last question, about your state of mind, matters as much as the chart.</div>`,
      },
      {
        id: 'journal',
        title: 'Keep a trading journal',
        body: `<p>The fastest way to improve is to write down every trade: the setup, entry, stop, target, size, result in R, and how you felt. Then review weekly.</p>
<p>After 30–50 trades patterns appear: maybe your morning trades lose and your afternoon ones win; maybe you cut winners early; maybe one setup makes all the money. You can only see this if you record it.</p>
<p>Market Radar keeps your simulated trade history in the Trading screen (History tab), and the <a data-goto="track">Track record</a> page measures how the app's own ideas performed, a good model for judging yourself honestly.</p>
<div class="key"><b>Key points</b>Record every trade in R. Review weekly. Do more of what works, cut what doesn't. Be as honest with yourself as the track record is with the app.</div>`,
      },
    ],
    quiz: [
      { q: 'Which is NOT part of a complete trade plan?', options: ['Entry', 'Stop', 'A friend\'s tip with no reason', 'Position size'], answer: 2, why: 'A plan has a reason, entry, stop, target, size and time frame. A tip with no reason isn\'t a setup.' },
      { q: 'A stock gaps 8% above your planned entry. What\'s usually best?', options: ['Chase it at any price', 'Skip it or wait; the reward-to-risk changed', 'Double the size', 'Remove the stop'], answer: 1, why: 'Chasing a gap ruins the planned reward-to-risk.' },
      { q: 'Why keep a trading journal?', options: ['Brokers require it', 'To find what works and what doesn\'t in your own trading', 'To pay less tax', 'It isn\'t useful'], answer: 1, why: 'Only recorded trades reveal your real strengths and leaks.' },
      { q: 'What should a stop be based on?', options: ['A random 1%', 'A level or volatility (ATR) that proves the idea wrong', 'Your mood', 'The dividend'], answer: 1, why: 'Stops belong where the trade idea is invalidated, sized by volatility.' },
      { q: 'You just took two losses and feel the urge to win it back fast. What does the checklist say?', options: ['Trade bigger', 'Take a break; that\'s revenge trading', 'Remove all stops', 'Short everything'], answer: 1, why: 'Trading to win back losses is revenge trading, one of the fastest ways to blow up.' },
    ],
  },
  {
    id: 'psychology',
    title: 'Trading psychology',
    summary: 'The biases that cost traders money, and habits that beat them.',
    lessons: [
      {
        id: 'biases',
        title: 'Your brain vs the market',
        body: `<p>Behavioural finance research (Kahneman and Tversky, Odean and others) shows traders lose money in predictable ways:</p>
<ul><li><b>Loss aversion:</b> losses hurt about twice as much as equal gains feel good, so people hold losers too long hoping to get back to even.</li><li><b>The disposition effect:</b> selling winners too early and riding losers. Studies of brokerage accounts found that the winners people sold went on to beat the losers they kept.</li><li><b>Overconfidence:</b> a few wins feel like skill, leading to bigger size and more trades. Odean and Barber found the most active traders earned the least.</li><li><b>FOMO:</b> chasing a stock because it's moving and everyone's talking about it.</li><li><b>Recency:</b> assuming what just happened will keep happening.</li></ul>
<div class="key"><b>Key points</b>Cut losers, let winners run. More trading is not better trading. A rule written in advance beats a decision made in the heat of the moment.</div>`,
      },
      {
        id: 'discipline',
        title: 'Discipline habits',
        body: `<ul><li><b>Plan the trade, trade the plan.</b> Every decision (entry, stop, target, size) is made before you click buy.</li><li><b>Use brackets.</b> Stop-loss and take-profit orders placed at entry remove the temptation to fiddle.</li><li><b>Daily loss limit.</b> Hit it, and you're done for the day. No exceptions.</li><li><b>Smaller size when you're unsure</b>, or after a losing streak.</li><li><b>Walk away after a big win too.</b> Euphoria leads to careless trades just like frustration does.</li><li><b>Judge the process, not one outcome.</b> A good trade can lose and a bad trade can win. Over many trades, process wins.</li></ul>
<p>The <a data-goto="puzzles">Candle puzzles</a> are a safe way to see this: you'll make good calls that lose and bad calls that win. Over hundreds of puzzles, only consistent reasoning holds up.</p>
<div class="key"><b>Key points</b>Rules before trades. Brackets on every trade. Loss limits. Judge yourself on process over many trades, not on the last one.</div>`,
      },
    ],
    quiz: [
      { q: 'What is the disposition effect?', options: ['Selling winners too early and holding losers', 'Buying only dividend stocks', 'Trading only on Mondays', 'Using too many indicators'], answer: 0, why: 'People like locking in gains and avoid admitting losses, which is the opposite of what works.' },
      { q: 'What did research on very active traders find?', options: ['They earned the most', 'They earned the least after costs', 'Activity doesn\'t matter', 'They never lose'], answer: 1, why: 'Barber and Odean found the most active traders had the worst returns.' },
      { q: 'You hit your daily loss limit at 11 am. What now?', options: ['Trade bigger to win it back', 'Stop trading for the day', 'Remove the limit', 'Switch to a riskier stock'], answer: 1, why: 'The limit only works if you respect it.' },
      { q: 'A well-planned trade hits its stop. Was it a bad trade?', options: ['Yes, every loss is a mistake', 'Not necessarily; judge the process over many trades', 'Yes, stops are always wrong', 'Only if it was on a Friday'], answer: 1, why: 'Good process still produces losses; it wins over many trades.' },
      { q: 'What is FOMO in trading?', options: ['A type of order', 'Fear of missing out: chasing moves', 'A moving average', 'A tax rule'], answer: 1, why: 'Fear of missing out leads to chasing stocks after big moves.' },
    ],
  },
  {
    id: 'live',
    title: 'From practice to real money',
    summary: 'When and how to go live, brokers, rules and taxes.',
    lessons: [
      {
        id: 'practice',
        title: 'Practise first, then start small',
        body: `<p>Use the simulated account in the <a data-goto="paper">Trading screen</a> until you have a plan you follow consistently. A reasonable bar before risking real money:</p>
<ul><li>At least 30–50 practice trades, all with a written plan and a stop.</li><li>Positive expectancy in R over those trades.</li><li>You followed your rules on nearly every trade.</li></ul>
<p>Practice is easier than real trading: fills are kinder and no real fear or greed is involved. So when you go live, <b>start with small size</b>, perhaps a quarter of your planned risk, and scale up only as results hold.</p>
<p>Only trade money you can afford to lose. Never trade money you need for rent, bills or school.</p>
<div class="key"><b>Key points</b>Prove a consistent process in practice first. Start live trading small. Only use money you can afford to lose.</div>`,
      },
      {
        id: 'broker',
        title: 'Brokers and rules',
        body: `<p>To trade for real you need a brokerage account. Market Radar connects to <b>Alpaca</b>: on the Trading screen click <b>+ Connect broker</b> for a step-by-step guide, and start with Alpaca's free paper account.</p>
<p>Rules worth knowing in the US (check your broker for current details; rules change):</p>
<ul><li><b>Settlement:</b> stock trades settle one business day after the trade (T+1).</li><li><b>Cash vs margin accounts:</b> margin lets you borrow and short, but amplifies losses. A cash account can only spend settled money.</li><li><b>Pattern day trader rule:</b> in a US margin account, making four or more day trades within five business days has required at least $25,000 in the account. Regulators have been reviewing this rule, so check your broker's current policy.</li><li><b>Minimum age:</b> brokerage accounts generally require you to be an adult (18+ in most places); younger traders need a custodial account set up by a parent.</li></ul>
<div class="key"><b>Key points</b>Start with a paper account. Understand cash vs margin and the day-trading rules where you live. Rules change, so check with your broker.</div>`,
      },
      {
        id: 'taxes',
        title: 'Taxes and record keeping (basics)',
        body: `<p>Trading profits are usually taxable. Rules depend on your country; in the US, for example:</p>
<ul><li><b>Short-term gains</b> (held one year or less) are taxed as ordinary income; <b>long-term gains</b> (over a year) usually get a lower rate.</li><li>The <b>wash-sale rule</b> disallows a loss if you buy the same or a substantially identical security within 30 days before or after selling it at a loss.</li><li>Your broker sends a yearly tax form, but keep your own records too.</li></ul>
<p>This is general information, not tax advice. Speak to a tax professional where you live, especially once your trading grows.</p>
<div class="key"><b>Key points</b>Profits are taxable and holding periods matter. Watch the wash-sale rule. Keep records and get proper tax advice.</div>`,
      },
    ],
    quiz: [
      { q: 'You\'re profitable in practice. How should you start live trading?', options: ['With your full size immediately', 'Small size, scaling up as results hold', 'With borrowed money', 'Without stops'], answer: 1, why: 'Real trading adds fear and worse fills; start small.' },
      { q: 'What does T+1 settlement mean?', options: ['Trades settle one business day after the trade', 'You can trade once a day', 'Taxes are due tomorrow', 'Orders expire in one day'], answer: 0, why: 'US stock trades settle one business day after the trade date.' },
      { q: 'What does margin do?', options: ['Reduces risk', 'Lets you borrow, amplifying gains and losses', 'Guarantees profits', 'Lowers taxes'], answer: 1, why: 'Borrowing magnifies both directions.' },
      { q: 'Under the US wash-sale rule, a loss can be disallowed if you rebuy the same stock within…', options: ['1 day', '30 days', '1 year', 'It never applies'], answer: 1, why: 'Buying within 30 days before or after the loss sale triggers it.' },
      { q: 'What money should you trade with?', options: ['Rent money', 'Money you can afford to lose', 'A loan', 'School fees'], answer: 1, why: 'Trading can lose money; only risk what you can afford to lose.' },
    ],
  },
];
