# Cardcade

Cardcade is a single home for multiple physical-feeling digital card games. Players enter through one launcher, choose Solo or Multiplayer, browse games by deck family, and use one global room code before the host selects a game.

This repository is currently a local platform preview. The launcher, game registry, room-code flow, live lobby, Docker image, and privacy boundary are implemented. The existing ThreeSeven and Thirteen rules are intentionally not duplicated yet; migrating ThreeSeven as the first playable module is the next milestone.

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
- The standard 52-card presentation will reuse the proven ThreeSeven card art, fan geometry, hit testing, and animation vocabulary.

See [docs/architecture.md](docs/architecture.md) and [docs/privacy-and-deployment.md](docs/privacy-and-deployment.md).

## Repository status

No GitHub remote is configured during local development. Do not add a production hostname, private Funnel address, reconnect token, or room code to tracked files.
