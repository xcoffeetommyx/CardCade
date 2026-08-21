# PWA mobile shell

Cardcade is progressively enhanced: it remains a normal website when installation APIs or service workers are unavailable, and becomes a standalone phone app when launched from a Home Screen icon.

## Installation surfaces

The web app manifest supplies a stable app id, standalone display mode, matching launch/background colors, 192px and 512px PNG icons, and a separate maskable icon. The HTML head also supplies Apple-specific Home Screen metadata, a 180px `apple-touch-icon`, translucent status-bar behavior, and launch images matched to iPhone SE, mini, standard, Plus, and Pro Max portrait viewports.

On iPhone and iPad, use **Share → Add to Home Screen** and leave **Open as Web App** enabled when that choice is available. On browsers with `beforeinstallprompt`, Cardcade exposes the native install prompt through its own **Install app** button. No browser or OS is assumed without feature detection.

## Safe layout

Every shell uses `viewport-fit=cover` plus safe-area insets for notches, Dynamic Island, rounded landscape edges, and the Home indicator. The portrait launcher scales into common phone viewports without scrolling when at least 620 CSS pixels of height are available; exceptionally short viewports keep normal scrolling instead of clipping controls.

## Offline and updates

The service worker pre-caches the launcher, catalog, fonts, shared presentation modules, icons, and Apple launch images. The launcher and game library remain readable offline, but creating, joining, resuming, or playing a server-authoritative game still requires a network connection.

Updates install into a separate cache and wait. Cardcade shows **Update ready** and reloads only after the player chooses **Update**, avoiding an uncontrolled mid-turn client replacement. Room WebSockets use a bounded reconnect delay and show a persistent offline/reconnecting state instead of relying on a transient toast.

Service workers and Chromium PWA installation require a secure context outside loopback development. Configure HTTPS on the deployment host through private infrastructure and keep its hostname outside this repository.
