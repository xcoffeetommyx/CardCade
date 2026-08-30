# Snap

Snap is Cardcade's finite Standard 52 reaction game for two to four players. It is available in Solo and Multiplayer with CPU support.

Every reveal follows one server-owned state machine:

```text
WAITING FOR READY → COUNTDOWN → REACTION → WAITING FOR READY
                                            or FINISHED
```

All participating players press **READY** before the upcoming card is public. Once everyone is locked in, the server reserves the next round-robin reveal source, consumes any skip-next-reveal penalties reached in that order, and publishes an absolute three-second countdown deadline. At the deadline the server removes exactly one hidden card from that player's draw pile, places it in the center, compares its rank with the immediately previous card, and opens a short reaction window with a unique sequence ID.

The first server-accepted **SNAP** on equal ranks captures the complete center pile. A SNAP on unequal ranks gives that player one pending skip of their next scheduled reveal contribution; it does not remove READY or reaction eligibility. Duplicate submissions cannot stack penalties or award a pile twice, and sequence IDs reject packets from older reveals.

Captured cards are scoring cards and never return to play. After all personal draw piles are empty, the final reaction window resolves before captured cards are counted. Uncaptured center cards remain neutral, and equal highest totals produce a tie.

CPU players use the same READY and SNAP paths after server-scheduled human-style delays. They never receive hidden draw-pile identities through a client projection. Match snapshots retain phase deadlines, reaction sequence, readiness, center cards, scoring, and pending penalties for reconnect and process restart.

Hot Seat is intentionally unavailable: one shared device cannot give several human players independent, simultaneous reaction controls fairly.
