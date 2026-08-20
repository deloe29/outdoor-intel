# Outdoor Intel 3.4

A no-API-key outdoor news aggregation dashboard for hunting, fishing, conservation, wildlife regulations and research.

## Run on macOS

Requires Node.js 18+.

```bash
cd outdoor-intel-v3.4
npm start
```

Open http://localhost:3000

No `npm install` is required because the project has zero external npm dependencies.

## What 3.4 changes

- Expands discovery from "hunting news" to **news that materially affects hunters and anglers**.
- Adds tightly-scoped discovery wires for public-land policy, federal rulemaking, courts/legal decisions, access/closures, land sales/transfers, wildfire, drought/water, energy, mining, logging, endangered-species actions, wildlife disease, conservation funding, tribal wildlife management, agriculture/Farm Bill habitat issues, and ballot/state-law changes.
- Keeps the existing 365-day index, species/state discovery, clustering, sorting, filters, summaries, and source attribution.
- Moves site/feed metrics off the main dashboard into a dedicated **Metrics** tab.
- Keeps reader-facing regulation and research intel on the main news page.

## Ingestion philosophy

Outdoor Intel should not only monitor stories labeled as hunting news. It also watches developments that can materially change habitat, public access, wildlife management, season opportunity, fisheries, or conservation. Broad-impact discovery queries still require outdoor, wildlife, land, fish, game, habitat, or recreation context so the feed does not become a generic political-news aggregator.

## Existing core behavior

- Newest-first by default
- 24-hour / 7-day / 30-day / 90-day / 1-year / all-indexed windows
- State and source filters
- Elk, Whitetail, Mule Deer, Big Game, Wolves & Predators, Fishing, Conservation, Regulations, and Research tabs
- All 50 state wildlife agencies plus major hunting/conservation publishers
- Story clustering across publishers
- Short summaries and "Why hunters should care" context
- Clustered Events / Individual Stories switch
- Automatic production refresh via `REFRESH_MINUTES`

## Data integrity

The metrics are derived from the indexed story stream. The app does not invent herd counts, draw odds, harvest statistics, or disease prevalence.

## Ingestion

The current build uses Google News RSS as a no-key discovery layer. Every story links to the original publisher. Individual feed failures are isolated so one unavailable query does not take down the dashboard.


### Event clustering upgrade
Version 3.4 clusters coverage by the underlying event rather than relying mainly on headline similarity. It uses named policy/entity phrases, actions (propose/repeal/approve/block/close/etc.), topic overlap, geography, and publication proximity. Different headlines covering the same Roadless Rule action should now collapse into one multi-source event.

### Summary upgrade
Summaries now prefer concrete factual sentences containing the actors, action, place, numbers/dates, and consequences. Cluster summaries can combine distinct facts from multiple outlets while still linking readers to the original publishers. The “Why hunters should care” text is also selected from story-specific signals such as access, public lands, disease, tags, closures, predators, habitat, and research instead of generic category boilerplate.


## v3.5 changes

- The feed initially displays 10 events/stories and reveals 10 more with **Load 10 more**.
- Added a dedicated **Hunting Strategy** tab for practical, free-to-discover tactics and how-to material from sources such as onX Hunt, Outdoor Life, Field & Stream, GOHUNT, MeatEater, National Deer Association, and RMEF.
- Hunting Strategy defaults to the one-year window because tactics content is evergreen rather than breaking news.
- Replaced generic “Why hunters should care” copy with article-specific summaries built from the concrete facts available in each feed item.
- Expanded HTML/entity sanitation so `&nbsp;`, numeric non-breaking spaces, smart punctuation entities, markup, and common encoding artifacts do not leak into visible copy.
