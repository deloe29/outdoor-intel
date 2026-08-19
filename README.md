# Outdoor Intel 3.3

A no-API-key outdoor news aggregation dashboard for hunting, fishing, conservation, wildlife regulations and research.

## Run on macOS

Requires Node.js 18+.

```bash
cd outdoor-intel-v3.3
npm start
```

Open http://localhost:3000

No `npm install` is required because the project has zero external npm dependencies.

## What 3.3 changes

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
