# Outdoor Intel 3.1

A no-API-key local outdoor intelligence dashboard for hunting, fishing, conservation, wildlife regulations and research.

## Run on macOS

Requires Node.js 18+.

```bash
cd outdoor-intel-v3
npm start
```

Open http://localhost:3000

No `npm install` is required because the project has zero external npm dependencies.

## What 3.0 adds

- Default newest-first news feed
- State filter
- 24-hour / 7-day / 30-day / all-time windows
- Elk, Whitetail, Mule Deer, Big Game, Wolves & Predators, Fishing, Conservation, Regulations and Research tabs
- expanded discovery feeds, including all 50 state wildlife agencies
- Priority coverage for Field & Stream, onX Hunt, GOHUNT, MeatEater, Outdoor Life and other hunting/conservation sources
- Story/event clustering across publishers
- Multi-source importance boost
- Deterministic concise summaries (no AI API key required)
- “Why hunters should care” context
- Clustered Events / Individual Stories switch
- State activity pulse
- Regulation, research and predator signal counters
- Source filtering and full-text client-side search
- 10-minute server cache and manual refresh

## How story clustering works

Outdoor Intel compares normalized headline terms, publication time, states and topic overlap. Articles published within five days that cross a conservative similarity threshold are grouped into a single event. The most recent article becomes the event headline while every underlying publisher remains available under “sources covering this event.”

## Scoring

`Most Relevant` is based on weighted hunting/outdoor terms and preferred specialist sources. `Top Stories` blends relevance with freshness and then adds a modest multi-source boost to clustered events. `Newest first` ignores ranking scores and sorts chronologically.

## Data integrity

The Data/Signal panels in 3.0 are calculated from the live indexed story stream. The app intentionally does not invent population estimates, draw odds, harvest statistics or disease prevalence. Direct state/federal dataset adapters can be added as a separate data layer later.

## Ingestion

The local MVP uses Google News RSS as a no-key discovery layer. Links open at the original publisher. Individual feed failures are isolated so one unavailable publisher does not take down the dashboard.


## 3.1 changes
- Indexes stories up to 365 days old.
- Adds Last 90 days and Last 1 year filters.
- Adds dedicated Elk, Whitetail, and Mule Deer discovery feeds by relevant state.
