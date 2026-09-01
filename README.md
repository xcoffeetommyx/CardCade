# Cardcade

Cardcade is a single home for multiple physical-feeling digital card games. Players enter through one launcher, choose Solo or Multiplayer, browse games by deck family, and use one global room code before the host selects a game.

This repository is currently a local platform preview. The launcher, game registry, room-code flow, live lobby, Docker image, privacy boundary, and restart-safe SQLite snapshots are implemented. 3s & 7s, Thirteen, Blackjack, Texas Hold'em, Five Card Draw, JUAN, and Rotating Rummy are playable in Solo, Multiplayer, and private pass-the-device Hot Seat modes. Snap is playable in Solo and Multiplayer; simultaneous reactions are intentionally not offered in Hot Seat.

## Run locally

Cardcade requires Node.js 22 or newer.

```powershell
npm install
npm test
npm start
```

Open `http://localhost:4380/cardcade/`.

For Docker:

```powershell
docker compose up --build
```

Compose publishes the configured port on the host's network interfaces so phones on the same trusted LAN can test Cardcade. A server can also expose the service through its own Tailscale Serve/Funnel configuration without embedding a private hostname in the application or repository.

## Platform boundary

- The room exists before a game is selected.
- A shareable six-character room code locates a room.
- A separate random token authenticates each browser session and is never included in the public room state.
- The game registry owns catalog metadata and player limits.
- Each game module will own rules, legal actions, scoring, rounds, and CPU strategy.
- Deck families group games in the launcher; they do not impose shared rank strength or rules.
- The shared physical-card presentation uses ThreeSeven's proven adaptive fan geometry, overlap hit testing, readable pixel faces, and selection motion.
- 3s & 7s, Thirteen, Blackjack, Texas Hold'em, Five Card Draw, and Snap share Cardcade's rules-neutral standard 52-card deck. JUAN owns an original 108-card color/action deck, and Rotating Rummy owns an original 108-card Route deck; both reuse the physical fan and motion system with dedicated renderers.
- All current games run server-authoritatively in Solo and Multiplayer and keep hidden cards private.
- Hot Seat reuses those same runtimes with one private token per human seat and freely configurable CPU seats within each game's player limits. Human hands are removed between turns, and CPU turns run automatically on a covered table.
- Active rooms and matches are written to a single SQLite snapshot database so Docker restarts can recover them.

See [docs/architecture.md](docs/architecture.md), [docs/snap.md](docs/snap.md), [docs/juan.md](docs/juan.md), [docs/rotating-rummy.md](docs/rotating-rummy.md), and [docs/privacy-and-deployment.md](docs/privacy-and-deployment.md).

## Install on a phone

Cardcade includes a standalone manifest, Android/maskable icons, Apple Home Screen metadata, modern iPhone launch images, safe-area layout, an offline launcher shell, and controlled update prompts.

- On iPhone or iPad, open the browser Share menu, choose **Add to Home Screen**, keep **Open as Web App** enabled when shown, and launch Cardcade from its new icon.
- On Android, use Cardcade's **Install app** button when it appears or the browser's **Install app / Add to Home screen** command.
- Chromium installation and service workers require HTTPS outside `localhost`/`127.0.0.1`. Use the server's private HTTPS Tailscale or Funnel entry point for a fully installable phone build; never commit that address.

See [docs/pwa-mobile-shell.md](docs/pwa-mobile-shell.md) for platform behavior and update details.

## Repository status

Do not add a production hostname, private Funnel address, reconnect token, or room code to tracked files.

The bundled Pixelify Sans font is distributed under the SIL Open Font License; its license is retained beside the font files.
