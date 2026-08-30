# Snap

Snap is Cardcade's finite Standard 52 reaction game for two to four players. It is available in Solo and Multiplayer with CPU support.

Every reveal follows one server-owned state machine:

```text
WAITING FOR READY → COUNTDOWN → REACTION → WAITING FOR READY
                                            or FINISHED
```

The server deals one opening card face up before players are asked to READY, so the first countdown always leads to a real two-card SNAP comparison. All participating players press **READY** before the upcoming card is public. Once everyone is locked in, the server reserves the next round-robin reveal source, consumes any skip-next-reveal penalties reached in that order, and publishes an absolute three-second countdown deadline. At the deadline the server removes exactly one hidden card from that player's draw pile, places it in the center, and opens a short reaction window with a unique sequence ID.

The server recognizes two SNAP patterns by rank, regardless of suit: adjacent equal ranks (for example `7♠ → 7♥`) and a sandwich, where equal ranks are separated by one arbitrary center card (for example `7♠ → K♥ → 7♦`). The middle sandwich card may be any card. The first server-accepted **SNAP** on either pattern captures the complete center pile. A SNAP when neither pattern is present gives that player one pending skip of their next scheduled reveal contribution; it does not remove READY or reaction eligibility. Duplicate submissions cannot stack penalties or award a pile twice, and sequence IDs reject packets from older reveals.

Captured cards are scoring cards and never return to play. After all personal draw piles are empty, the final reaction window resolves before captured cards are counted. Uncaptured center cards remain neutral, and equal highest totals produce a tie.

CPU players use the same READY and SNAP paths. Their SNAP response is deliberately held for roughly 0.75–1.4 seconds, depending on style, so a quick human has a fair opportunity instead of racing an instant server action. They never receive hidden draw-pile identities through a client projection. Match snapshots retain phase deadlines, reaction sequence, readiness, center cards, scoring, and pending penalties for reconnect and process restart.

Hot Seat is intentionally unavailable: one shared device cannot give several human players independent, simultaneous reaction controls fairly.
