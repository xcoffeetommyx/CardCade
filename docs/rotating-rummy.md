# Rotating Rummy Routes

Rotating Rummy is CardCade's original route-completion rummy game. A match selects one Route Deck containing ten public Routes; four Route Decks provide a forty-Route pool.

## Deck

- 96 numbered cards: values 1–12, four color lanes, two copies of each.
- 6 Glitches: wildcards that may stand in for a number or color while completing a Route.
- 6 Locks: discard-only interruption cards that skip the next player. Locks never count toward a Route.

## Round flow

Each player begins with ten cards. On a turn, draw one card from the stock or discard pile, optionally complete the current Route by laying down its exact card groups, then discard one card. Once a player has completed their Route, they may **Link** compatible cards onto any completed Route group at the table before their discard. A player cannot go out until their current Route is complete.

The round ends when a player goes out **or as soon as everyone has completed their current Route**. Every player who completed their own Route advances one Route number; players who did not complete theirs retry it next round. The host deals the next round when the table is ready. When everyone completes their Route, no further discard is needed and no go-out bonus is awarded.

A player who goes out after completing Route 10 wins the match. Otherwise, players who advance past Route 10 at round end win (sharing the win if several finish together). A go-out winner earns the point value of all opponents' remaining cards as their round score.

CPU turns show one action at a time, with a 1.6-second pause before each draw, Route completion, Link, or discard in every mode.

## Route vocabulary

- **Set**: matching numbers.
- **Run**: consecutive numbers.
- **Color lane**: cards sharing a color.
- **Parity**: all odd or all even numbers.
- **Spectrum**: one card from each color lane.
- **Mirror**: value pairs totaling 13.
- **Step-two pattern**: evenly spaced values such as 2, 4, 6, 8.
- **Pair run**: consecutive matching pairs.
- **Link**: an extra card or card group added to a completed Route group while keeping that group's pattern valid. Spectrum groups already contain every color lane and cannot take Links.

The route labels, compositions, terminology, and card presentation are original CardCade material; this document intentionally describes only the CardCade ruleset.
