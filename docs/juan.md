# JUAN

JUAN is Cardcade's original color/action shedding game. It uses Cardcade's room, persistence, CPU, Hot Seat, and physical fan systems, but owns its deck definition, rules, card faces, names, and scoring.

## Deck

The complete deck contains 108 unique physical cards across four original color lanes: Blaze, Tide, Grove, and Spark.

For each color:

- one 0;
- two copies of every number from 1 through 9;
- two Pause cards;
- two Turnabout cards;
- two Double Draw cards.

The neutral cards are four Prism cards and four Prism Burst cards. This produces 76 number cards, 24 colored action cards, and 8 neutral cards.

## Play

Each player starts with seven cards. A numbered card opens the discard stack. On a turn, play one card matching the active color lane or printed face, or play a Prism. A Prism chooses the next active color. Pause skips the next player, Turnabout reverses direction, and Double Draw makes the next player take two cards and lose the turn.

Prism Burst chooses a color and puts the next player in a decision window. They can take four cards and lose their turn, or challenge the play. A challenge succeeds when the player who used Prism Burst still held a card in the previous active color: that player draws four cards and the target keeps their turn. A failed challenge makes the target draw six cards and lose their turn.

If no card is played, draw one. A playable drawn card may be played immediately; otherwise the turn ends. The player may also keep a playable drawn card. A player who reaches one card must press **Call JUAN** before the next player starts an action. Another player can catch a missed call immediately; CPUs visibly wait 2.6 seconds before calling so human players receive the same counter opportunity. Every successful call is announced at the table. If nobody catches a missed call first, the player with one card automatically draws two when the next action begins. Emptying the hand wins the round after any pending Prism Burst is resolved.

## Four-round match

A match is exactly four rounds. Round 1 chooses one opening player at random without changing room seat identity or clockwise player order. Each later round moves the opener forward by one player from that established origin. Direction returns to normal forward play for every fresh deal; a Turnabout affects only its current round.

The round winner scores the total point value of every card left in every opponent's hand. JUAN's existing point table is: a number scores its printed value plus one, Pause scores 12, Turnabout scores 14, Double Draw scores 18, Prism scores 25, and Prism Burst scores 35. Scores are cumulative and remain visible between rounds. The host starts the next round after everyone has had time to see the result.

After Round 4, the player with the highest cumulative score wins the match. Players tied for the highest score are joint winners; room seat order is never used as a tiebreaker.

The server is authoritative: other hands remain private, CPUs use the same legal-play checks, and active matches survive the same SQLite snapshot flow as the standard-deck games. Snapshots preserve the current round, cumulative scores, established opener origin, round-complete state, and final standings.

## Original presentation

JUAN does not import external card art. Its color names, action names, diagonal ribbon geometry, symbols, text, and pixel treatment are implemented as Cardcade-owned HTML and CSS. The reference informed only the broad idea of a readable four-color shedding deck.
