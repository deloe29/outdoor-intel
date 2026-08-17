# Production deployment

## Recommended hosting
This app is a long-running Node process and refreshes its feed cache on a timer. An always-on Node host such as Railway is the simplest fit.

## Environment variables
- `PORT` — supplied by most hosts automatically.
- `REFRESH_MINUTES` — defaults to `15`; minimum `5`.
- `SITE_URL` — your final canonical origin, e.g. `https://example.com`.

## Automatic refreshing
The server warms the feed immediately on startup and then force-refreshes all discovery feeds every `REFRESH_MINUTES`. Visitors read the warmed in-memory dataset; they do not have to wait for the scheduled refresh.

## Health check
`GET /health`

## SEO endpoints
- `/robots.txt`
- `/sitemap.xml`

## Railway
1. Put this folder in a GitHub repo.
2. Create a Railway project from the repo.
3. Railway will run `npm start` and provide `PORT` automatically.
4. Add `REFRESH_MINUTES=15` and `SITE_URL=https://your-domain.com`.
5. Add your custom domain in Railway.

## Docker
`docker build -t outdoor-intel .`
`docker run --rm -p 3000:3000 -e REFRESH_MINUTES=15 outdoor-intel`
