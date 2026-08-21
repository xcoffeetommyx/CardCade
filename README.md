# Cardcade

Cardcade is a single home for multiple physical-feeling digital card games. Players enter through one launcher, choose Solo or Multiplayer, browse games by deck family, and use one global room code before the host selects a game.

This repository is currently a local platform preview. The launcher, game registry, room-code flow, live lobby, Docker image, privacy boundary, and restart-safe SQLite snapshots are implemented. ThreeSeven is the first playable module in Solo and Multiplayer; Thirteen is the next game to migrate.

## Run locally

Cardcade requires Node.js 22 or newer.

```powershell
npm install
npm test
npm start
```

Open `http://localhost:4380`.

For Docker:

```powershell
docker compose up --build
```

The Compose port is deliberately bound to `127.0.0.1`. A server can expose that loopback service through its own Tailscale Serve/Funnel configuration without embedding a private hostname in the application or repository.

## Platform boundary

- The room exists before a game is selected.
- A shareable six-character room code locates a room.
- A separate random token authenticates each browser session and is never included in the public room state.
- The game registry owns catalog metadata and player limits.
- Each game module will own rules, legal actions, scoring, rounds, and CPU strategy.
- Deck families group games in the launcher; they do not impose shared rank strength or rules.
- The shared standard 52-card presentation uses ThreeSeven's proven adaptive fan geometry, overlap hit testing, readable pixel ranks, and selection motion.
- ThreeSeven runs server-authoritatively in both Solo and Multiplayer and keeps each hand private.
- Active rooms and matches are written to a single SQLite snapshot database so Docker restarts can recover them.

See [docs/architecture.md](docs/architecture.md) and [docs/privacy-and-deployment.md](docs/privacy-and-deployment.md).

## Repository status

No GitHub remote is configured during local development. Do not add a production hostname, private Funnel address, reconnect token, or room code to tracked files.

The bundled Pixelify Sans font is distributed under the SIL Open Font License; its license is retained beside the font files.
