# Privacy and deployment

## Repository-safe configuration

Cardcade never needs to know its public URL. Browser requests use relative paths, and WebSocket connections derive `ws:` or `wss:` from `location.protocol` and `location.host`.

The following must never be committed:

- a private Tailscale or Funnel hostname;
- account credentials or auth keys;
- room session tokens;
- live room codes from private games;
- a production `.env` file;
- snapshot databases or logs containing player activity.

The Git ignore rules exclude `.env`, `.env.*`, `data/`, and log files. `.env.example` contains only a harmless local port example.

## Docker and Tailscale

The Compose service publishes Cardcade only on host loopback:

```text
127.0.0.1:4380 → container:4380
```

Configure Tailscale Serve or Funnel on the server itself to proxy to that loopback address. Keep that machine-specific command and hostname in a private server runbook outside this repository.

This arrangement provides:

- one Docker instance for the launcher, rooms, and all game modules;
- one same-origin WebSocket connection through the reverse proxy;
- no need to open Cardcade directly on every network interface;
- no public address embedded in JavaScript, Compose, documentation, or Git history.

## Room security

The six-character room code is intended to be shared. A separate 256-bit random reconnect token is stored locally in the player's browser. WebSockets authenticate with their first message so the token does not appear in a URL or routine proxy access log.

For a later public launch, add rate limits to room creation/join attempts, structured security logging without tokens, and a clear data-retention policy before exposing Funnel broadly.
