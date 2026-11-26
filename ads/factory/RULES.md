# Ad rules

`check.js` enforces these on every ad before it gets built. **FAIL** blocks the ad. **REVIEW** means a person must look before scheduling it.

**This is a rule list, not legal advice.** It catches the known risks for a US TikTok ad for a trading-education app. No checker can promise an ad breaks no rule in every state: the laws are broad (the FTC Act and every state's consumer-protection law ban anything "deceptive"), and TikTok's reviewers decide case by case. Have a lawyer read this file once. If they change anything, update `check.js` to match.

Researched November 26, 2026. Sources are listed at the bottom.

## What every ad gets automatically (built into `engine.html`, so no ad can drop it)

| Item | Why |
|---|---|
| A disclaimer on screen the whole time: "Educational app. Not financial advice. No promises of profit. Trading involves risk of loss." | TikTok's financial-services policy requires "proper disclaimers". FTC: claims need clear context. |
| An "Animated character · AI voice" label | TikTok requires labels on fully AI-generated audio: "If uncertain… label it". |
| An end card, at least 4.5s, with the full disclaimer and "Pro renews automatically until you cancel" | State automatic-renewal laws and ROSCA. Disclosure next to the price is the strictest reading. |
| The price stated exactly: "Free plan, no card needed. Pro is $19/month or $149/year." | TikTok bans ads whose price doesn't match the landing page. `check.js` compares against the website. |
| The call to action as plain text, not a button | TikTok bans "fake call-to-action buttons". |
| No stock symbols in screenshots (puzzles are shown before the answer reveals the stock) | TikTok's US policy bans ads for "single securities". |

## What `check.js` blocks (FAIL)

| Rule | Blocks | Source |
|---|---|---|
| R1 earnings | Profit, income or results claims: guaranteed, risk-free, get rich, passive income, quit your job, "$X a day", returns, gains, win rate, beat the market, side hustle | FTC Act §5; TikTok "get-rich-quick" and "must not promise or exaggerate results" |
| R2 personal advice | "your portfolio", tailored, personalized, stock picks, what to buy | Advisers Act definition and the publisher exclusion (stay general and impersonal) |
| R3 absolutes | #1, number one, best app, fastest, only app, 100% accurate | TikTok misleading-content policy ("absolute terms") |
| R4 single securities | Company names, tickers ($ABC or known symbols), screenshots marked `ticker: true` | TikTok US financial-services policy ("Single securities" not allowed) |
| R5 restricted products | Penny stocks, options, forex, crypto, CFDs, spread betting, precious metals, prediction markets, leverage | TikTok US financial-services policy |
| R6 pricing | Any price other than $19/month or $149/year; "free trial" (there isn't one), "free forever", "100% free" | TikTok price-consistency rule; state auto-renewal laws; ROSCA |
| R7 people & IP | Real people, celebrities, franchises, brands, game and anime characters | NY Civil Rights Law §50; Cal. Civil Code §3344; TN ELVIS Act (voices); TikTok "likeness of a public figure"; copyright |
| R8 youth | Kids, teens, high school, under-18 framing | TikTok: financial ads must be 18+ |
| R10/R14 audio | Any music except a Commercial Music Library sound added inside TikTok; trending sounds that aren't in that library | TikTok music licensing (only the CML is cleared for business use) |
| R11 structure | Under 9s or over 60s; end card shorter than 4.5s; overlapping lines; speech too fast to read; bubbles over 75 characters | Disclosures must be readable ("clear and conspicuous", FTC 2023 guidance) |
| R12 hashtags | #passiveincome, #getrich, #financialfreedom, #stocktips, #money…, #crypto…, #forex… | Same as R1 and R5 |
| R13 testimonials | "I made / I earned / users made / changed my life", even from the cartoon | FTC Endorsement Guides (16 CFR 255) |

## What `check.js` flags for a person (REVIEW)

- **R4c** Capitalized words that could be read as a stock symbol.
- **R7b** Proper nouns mid-sentence: make sure none is a real person, brand or franchise.
- **R15** Percentages: each must be a real figure from the app, shown as past data with its comparison (for example, "51% vs 53% any day"), never as a return.

## Trends: what we take, what we never take

- **We take:** formats (POV, loading-bar transitions, "tell me without telling me"), phrases and joke structures, and topics.
- **We never take:** the trend's audio unless it's in the Commercial Music Library, its footage, the people in it, or any game, anime or show character it's built on. For example, #lucia (a video game character) and the Roblox clip behind "huss huss huss" are both off-limits, even though the phrase is fine.

## The checklist each ad's post must follow (on the review page)

Content disclosure "Your brand" on · AI-generated label on · Audience 18+ · Commercial Music Library sounds only · bio link to the website with matching prices · no stock picks in replies.

## Known gaps

- TikTok's US financial-services policy also says advertisers may need to "be licensed by local and regional authorities", and doesn't say whether an education app counts. Organic posts (what we do) are not ads. **If you ever pay to Promote a post, TikTok may ask for proof of licensing or reject it.**
- State investment-adviser laws, NASAA guidance and the FTC earnings-claim cases against trading-course sellers were not read in full (some pages blocked automated reading). The rules above follow their common thread: no results claims, nothing personal.
- The Business Opportunity Rule probably doesn't apply (we don't sell a business), but it wasn't verified.

## Sources

- TikTok financial-services ad policy: https://ads.tiktok.com/help/article/tiktok-ads-policy-financial-services
- TikTok misleading and false content: https://ads.tiktok.com/help/article/tiktok-ads-policy-misleading-and-false-content
- TikTok ad disclaimers: https://ads.tiktok.com/help/article/about-ad-disclaimers-in-tiktok-ads-manager
- TikTok Creative Center: https://ads.tiktok.com/help/article?aid=14099 and the Commercial Music Library at https://ads.tiktok.com/business/creativecenter/music
- Investment adviser definition, 15 U.S.C. 80b-2(a)(11): https://www.law.cornell.edu/uscode/text/15/80b-2
- FTC Endorsement Guides FAQ: https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
- NY Civil Rights Law §50: https://www.nysenate.gov/legislation/laws/CVR/50
- State auto-renewal laws: https://clauseaudit.com/saas/auto-renewal-laws-by-state, https://www.zwillgen.com/auto-renewal/auto-renewal-update-legal-landscape-imposes-complex-obligations-subscription-businesses/, https://help.loopwork.co/en/articles/12708349-united-states-automatic-renewal-laws-requirements-loop-compliance
