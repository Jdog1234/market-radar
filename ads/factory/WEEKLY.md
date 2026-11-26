# Weekly ad run

Claude follows this every Sunday. The output is 14 ads (two a day, Monday to Sunday) waiting for Jake to review. **Claude never posts anything.**

## 1. Find this week's trends

1. Open TikTok Creative Center in the browser: `https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en?period=7&region=US`.
   - If Jake is logged in, it shows the full list. Also check the Education and Financial Services industry filters.
   - If not, it shows only the top 3. Use those, and say so in the summary.
2. Search the web for this week's TikTok trend roundups (Virlo, Know Your Meme, SocialPilot and similar) to learn what each trend actually is.
3. Keep only trends whose **format or phrase** can carry a learning-app joke. Skip any trend that needs its own audio (unless that sound is in the Commercial Music Library), footage of real people, or a game, anime or show character. Note why each skipped trend was skipped.
4. Pick enough trends for 14 ads. One trend can carry two or three different jokes.

## 2. Write 14 specs

Create `weeks/<Sunday's date YYYY-MM-DD>/specs/NN-slug.json`, numbered 01–14 in posting order. Copy the shape of `weeks/2026-11-26/specs/*.json`.

- **Screenshots:** use only the ones in `shots/manifest.json`. Ring spots are listed there.
- **Character:** she's the same tsundere mascot every time. Faces: `hmph`, `shock`, `pout`, `blush`, `smug`. Poses: `big` (before the first panel), `side` (beside screenshots) and `end` (the last line, always).
- **Lines:** at most 4 words per second, bubbles under 75 characters. Use `say` for anything the voice would misread (numbers, "XP", "Hmph").
- **Joke and claims:** the joke is about *learning* (pride, confusion, small wins, honest stats). Never about money, wins or results.
- **Trend field:** fill in `trend` (name, type, source, fit) honestly, including what was not borrowed.
- **Post caption:** must say "Free plan" and "Not financial advice". Use 4–6 hashtags with no money-making tags.

Then run `node ads/factory/check.js <spec>` on each one, and fix every FAIL by rewriting the spec. Never weaken `check.js` to get a spec through.

## 3. Build

```bash
node ads/factory/make.js ads/factory/weeks/<date>
```

This takes about 5 minutes per ad, so run it in the background. It writes `out/NN-slug.mp4`, covers, compliance reports and `out/review.html`.

## 4. Hand over

Open `out/review.html` and check every ad's REVIEW notes. Then send Jake a short summary:
- the trends used and the trends skipped, with reasons;
- anything that needs his judgment;
- the path to the review page.

He schedules the ads in TikTok himself.
