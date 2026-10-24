# LE COMMERÇANT

A sunny Haussmannian street in Paris. You are the shopkeeper. Hooded, masked rioters pour
down both sides of the boulevard for your glass storefront, and every wave brings more of them.
Punch and kick them back and hold the line as long as you can — **the raid never stops until the
glass breaks, the shop burns and the merchant is left crying**. The longer you stand and the more
rioters you drop, the higher your score.

Playable mini-game: **no betting**. Shared **leaderboard** and street **chat**, plus procedural
sound (punches, glass, bottles, fire, sirens).

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000, SQLite in ./data
```

Controls: `A/D` or `←/→` move along the storefront · `W/S` or `↑/↓` step in/out · `J` or left
click punch · `K` or right click kick · `M` mute · `C` chat · `Enter` replay. Touch pads appear
on mobile.

## Structure

| Path | What |
| --- | --- |
| `server/index.js` | HTTP + WebSocket: static game, score board, street chat |
| `server/store.js` | SQLite persistence (`DB_PATH`), Postgres (`DATABASE_URL`), in-memory fallback |
| `public/js/engine.js` | Playable endless raid sim: merchant, rioter waves, marchers, barricades, gas, glass HP, burn, cry |
| `public/js/arena.js` | three.js: daylight Haussmannian street, merchant, rioters with bats, CRS, FX, input |
| `public/js/audio.js` | Procedural SFX (punches, glass, bottles, fire, sirens, gas) |
| `public/js/nav.js` | Top nav, menu, socials |
| `public/index.html` | HUD (glass integrity, score, wave) + chat & leaderboard panel + overlays |

## Environment

| Var | Purpose |
| --- | --- |
| `SHOP_NAME` | Storefront name on the shop sign and HUD (default `ÉPICERIE DU COIN`) |
| `DB_PATH` | SQLite file path (default `./data/le-commercant.db`) |
| `DATABASE_URL` | Optional Postgres connection string; overrides SQLite when set |
| `X_URL`, `TELEGRAM_URL` | Nav links, hidden when unset |
| `PORT` | HTTP port (default `3000`) |

## API

`GET /api/config` · `GET /api/leaderboard` · `POST /api/score` · WebSocket `/ws` (chat + live board)

## Deploy to Fly.io

The repo includes `fly.toml` (app `le-commercant`, region `cdg`) and a `Dockerfile`.

```bash
fly launch --no-deploy          # first time only, or reuse the committed fly.toml
fly volumes create le_commercant_data --region cdg --size 1
fly deploy
```

The volume is mounted at `/data`, so `DB_PATH=/data/le-commercant.db` survives restarts and
redeploys. Set `fly secrets set SHOP_NAME="..." X_URL="..." TELEGRAM_URL="..."` as needed.
