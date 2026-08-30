import { randomInt } from "node:crypto";
import rummyDeck from "../../../../shared/rotating-rummy-deck.js";
import routeLibrary from "../../../../shared/rotating-rummy-routes.js";
import rules from "../../../../shared/rotating-rummy-rules.js";
import { GameError as RoomError } from "../../game-error.js";

const DEAL_COUNT = 10;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

export class MatchEngine {
  constructor({ shuffleDeck = secureShuffle, selectRouteDeck = randomRouteDeck } = {}) {
    this.shuffleDeck = shuffleDeck;
    this.selectRouteDeck = selectRouteDeck;
  }

  createMatch(roomPlayers, { routeDeckId = null, round = 1, carryProgress = new Map() } = {}) {
    if (!Array.isArray(roomPlayers) || roomPlayers.length < MIN_PLAYERS || roomPlayers.length > MAX_PLAYERS) {
      throw new RoomError("Rotating Rummy requires two to four occupied seats.", "INVALID_PLAYER_COUNT");
    }
    const routeDeck = routeDeckId ? routeLibrary.routeDeckById(routeDeckId) : this.selectRouteDeck(routeLibrary.ROUTE_DECKS);
    if (!routeDeck || routeDeck.routes.length !== 10) {
      throw new RoomError("Rotating Rummy could not select a complete Route Deck.", "INVALID_ROUTE_DECK", 500);
    }

    const players = roomPlayers
      .slice()
      .sort((left, right) => left.seat - right.seat)
      .map((player) => createMatchPlayer({
        seat: player.seat,
        name: player.name,
        avatar: initialsForName(player.name, `P${player.seat}`),
        type: player.type === "bot" ? "bot" : "human",
        style: player.style || (player.type === "bot" ? "steady" : "human"),
        progress: carryProgress.get(player.seat)
      }));

    const stock = this.shuffleDeck(rummyDeck.makeDeck());
    validateDeck(stock);
    for (let cardIndex = 0; cardIndex < DEAL_COUNT; cardIndex += 1) {
      for (const player of players) player.hand.push(stock.pop());
    }
    for (const player of players) player.hand = rules.sortCards(player.hand, "rank");

    const openerIndex = stock.findLastIndex((card) => card.kind === "number");
    if (openerIndex < 0) throw new RoomError("Rotating Rummy could not find a numbered opening discard.", "INVALID_DECK", 500);
    const [openingCard] = stock.splice(openerIndex, 1);
    const normalizedRound = Number.isInteger(round) && round > 0 ? round : 1;
    const openingPlayer = players[(normalizedRound - 1) % players.length];

    return {
      round: normalizedRound,
      phase: "playing",
      routeDeckId: routeDeck.id,
      routeDeckName: routeDeck.name,
      totalRoutes: routeDeck.routes.length,
      players,
      activeSeat: openingPlayer.seat,
      turnStage: "draw",
      stock,
      discardPile: [openingCard],
      roundWinnerSeat: null,
      winnerSeat: null,
      roundOver: false,
      matchOver: false,
      lastMoveText: `${openingPlayer.name} opens Route ${openingPlayer.routeIndex + 1}.`,
      log: [`Opening discard: ${rummyDeck.cardLabel(openingCard)}.`]
    };
  }

  drawStock(match, seat) {
    const player = requireActivePlayer(match, seat, "draw");
    const card = this.#drawFromStock(match, player);
    if (!card) throw new RoomError("The stock is empty. Take the discard instead.", "STOCK_EMPTY", 409);
    match.turnStage = "play";
    player.lastPlay = { kind: "draw", label: "Drew stock", cards: [] };
    match.lastMoveText = `${player.name} drew from the stock.`;
    match.log.unshift(match.lastMoveText);
    return match;
  }

  drawDiscard(match, seat) {
    const player = requireActivePlayer(match, seat, "draw");
    const card = match.discardPile.pop();
    if (!card) throw new RoomError("There is no discard to take.", "DISCARD_EMPTY", 409);
    player.hand.push(card);
    player.hand = rules.sortCards(player.hand, "rank");
    match.turnStage = "play";
    player.lastPlay = { kind: "draw", label: `Took ${rummyDeck.cardLabel(card)}`, cards: [{ ...card }] };
    match.lastMoveText = `${player.name} took ${rummyDeck.cardLabel(card)} from the discard.`;
    match.log.unshift(match.lastMoveText);
    return match;
  }

  completeRoute(match, seat, cardIds) {
    const player = requireActivePlayer(match, seat, "play");
    if (player.routeComplete) {
      throw new RoomError("Your current Route is already complete.", "ROUTE_ALREADY_COMPLETE", 409);
    }
    const route = currentRoute(match, player);
    if (!route) throw new RoomError("You have already cleared every Route.", "ROUTES_COMPLETE", 409);
    const selected = cardsOwnedBy(player, cardIds);
    if (player.hand.length - selected.length < 1) {
      throw new RoomError("Keep at least one card in hand to end your turn with a discard.", "DISCARD_REQUIRED", 409);
    }
    const evaluation = rules.evaluateRoute(selected, route);
    if (!evaluation.ok) throw new RoomError(evaluation.reason, "INVALID_ROUTE", 409);

    const selectedIds = new Set(selected.map((card) => card.id));
    player.hand = rules.sortCards(player.hand.filter((card) => !selectedIds.has(card.id)), "rank");
    player.routeComplete = true;
    player.completedThisRound = true;
    player.routeMeld = evaluation.groups.map((group) => group.map((card) => ({ ...card })));
    player.lastPlay = {
      kind: "route",
      label: `Completed ${route.name}`,
      cards: selected.map((card) => ({ ...card }))
    };
    match.lastMoveText = `${player.name} completed Route ${player.routeIndex + 1}: ${route.name}.`;
    match.log.unshift(match.lastMoveText);
    return match;
  }

  link(match, seat, targetSeat, groupIndex, cardIds) {
    const player = requireActivePlayer(match, seat, "play");
    if (!player.routeComplete) {
      throw new RoomError("Complete your current Route before linking cards.", "ROUTE_NOT_COMPLETE", 409);
    }
    const target = getPlayer(match, targetSeat);
    if (!target?.routeComplete || !Array.isArray(target.routeMeld)) {
      throw new RoomError("That player has no completed Route to link to.", "LINK_TARGET_UNAVAILABLE", 409);
    }
    const normalizedGroupIndex = Number(groupIndex);
    const targetRoute = currentRoute(match, target);
    const requirement = targetRoute?.requirements?.[normalizedGroupIndex];
    const targetGroup = target.routeMeld[normalizedGroupIndex];
    if (!Number.isInteger(normalizedGroupIndex) || !requirement || !Array.isArray(targetGroup)) {
      throw new RoomError("That Route group is not available for linking.", "LINK_GROUP_UNAVAILABLE", 409);
    }

    const selected = cardsOwnedBy(player, cardIds);
    if (player.hand.length - selected.length < 1) {
      throw new RoomError("Keep one card to discard after linking to a Route.", "DISCARD_REQUIRED", 409);
    }
    const expandedGroup = [...targetGroup, ...selected];
    if (!rules.canExtendRequirement(expandedGroup, requirement)) {
      throw new RoomError("Those cards cannot link to that Route group.", "INVALID_ROUTE_LINK", 409);
    }

    const selectedIds = new Set(selected.map((card) => card.id));
    player.hand = rules.sortCards(player.hand.filter((card) => !selectedIds.has(card.id)), "rank");
    target.routeMeld[normalizedGroupIndex] = rules.sortCards(expandedGroup, "rank").map((card) => ({ ...card }));
    player.lastPlay = {
      kind: "link",
      label: `Linked ${selected.length} card${selected.length === 1 ? "" : "s"} to ${target.name}'s Route`,
      cards: selected.map((card) => ({ ...card }))
    };
    match.lastMoveText = `${player.name} linked ${selected.length} card${selected.length === 1 ? "" : "s"} to ${target.name}'s Route.`;
    match.log.unshift(match.lastMoveText);
    return match;
  }

  discard(match, seat, cardId) {
    const player = requireActivePlayer(match, seat, "play");
    const card = player.hand.find((candidate) => candidate.id === String(cardId));
    if (!card) throw new RoomError("That card is not in your hand.", "CARD_NOT_OWNED", 404);
    if (player.hand.length === 1 && !player.routeComplete) {
      throw new RoomError("Complete your current Route before going out.", "ROUTE_REQUIRED", 409);
    }

    player.hand = player.hand.filter((candidate) => candidate.id !== card.id);
    match.discardPile.push(card);
    player.lastPlayedCard = { ...card };
    player.lastPlay = { kind: "discard", label: `Discarded ${rummyDeck.cardLabel(card)}`, cards: [{ ...card }] };
    match.lastMoveText = `${player.name} discarded ${rummyDeck.cardLabel(card)}.`;
    match.log.unshift(match.lastMoveText);

    if (player.hand.length === 0) {
      finishRound(match, player);
      return match;
    }

    match.turnStage = "draw";
    const target = nextPlayer(match, player.seat);
    if (card.kind === "lock" && target) {
      const afterTarget = nextPlayer(match, target.seat);
      match.activeSeat = afterTarget?.seat ?? null;
      match.lastMoveText = `${player.name} discarded a Pass. Play moves past ${target.name}.`;
      match.log[0] = match.lastMoveText;
    } else {
      match.activeSeat = target?.seat ?? null;
    }
    return match;
  }

  nextRound(match) {
    if (!match?.roundOver) throw new RoomError("The current Rotating Rummy round is still in progress.", "ROUND_IN_PROGRESS", 409);
    if (match.matchOver) throw new RoomError("This Rotating Rummy match is complete.", "MATCH_COMPLETE", 409);
    const carryProgress = new Map(match.players.map((player) => [player.seat, ({
      routeIndex: player.routeIndex,
      score: player.score
    })]));
    const players = match.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      type: player.type,
      style: player.style
    }));
    return this.createMatch(players, {
      routeDeckId: match.routeDeckId,
      round: match.round + 1,
      carryProgress
    });
  }

  runBotTurn(match) {
    if (!match || match.roundOver) return false;
    const player = getPlayer(match, match.activeSeat);
    if (!player || player.type !== "bot") return false;
    const route = currentRoute(match, player);

    if (match.turnStage === "draw") {
      const topCard = match.discardPile.at(-1);
      const completionFromDiscard = !player.routeComplete && topCard
        ? rules.findRouteCompletion([...player.hand, topCard], route)
        : null;
      if (completionFromDiscard) this.drawDiscard(match, player.seat);
      else this.drawStock(match, player.seat);
    }

    if (!player.routeComplete) {
      const completion = rules.findRouteCompletion(player.hand, route);
      if (completion) this.completeRoute(match, player.seat, completion.cards.map((card) => card.id));
    }

    while (player.routeComplete && player.hand.length > 1) {
      const link = findBestLink(match, player);
      if (!link) break;
      this.link(match, player.seat, link.targetSeat, link.groupIndex, link.cards.map((card) => card.id));
    }

    const discard = player.routeComplete
      ? player.hand.slice().sort((left, right) => rules.cardPoints(right) - rules.cardPoints(left) || right.id.localeCompare(left.id))[0]
      : rules.recommendedDiscard(player.hand, route);
    if (!discard) throw new RoomError("Rotating Rummy CPU could not choose a discard.", "BOT_DISCARD_FAILED", 500);
    this.discard(match, player.seat, discard.id);
    return true;
  }

  replaceWithBot(match, seat) {
    const player = getPlayer(match, seat);
    if (!player || player.type !== "human") return false;
    player.type = "bot";
    player.style = "steady";
    player.name = `${player.name} · Bot`;
    match.log.unshift(`${player.name} took over the Route table.`);
    return true;
  }

  viewFor(match, seat, connections = new Map()) {
    const viewer = getPlayer(match, seat);
    if (!viewer || viewer.type !== "human") {
      throw new RoomError("No private Rotating Rummy view exists for this seat.", "SEAT_NOT_FOUND", 404);
    }
    const routeDeck = routeLibrary.routeDeckById(match.routeDeckId);
    if (!routeDeck) throw new RoomError("This match has an unknown Route Deck.", "INVALID_ROUTE_DECK", 500);
    const viewerRoute = currentRoute(match, viewer);
    const yourTurn = match.activeSeat === viewer.seat && !match.roundOver;

    return {
      type: "rotating_rummy_match_state",
      state: {
        phase: match.phase,
        round: match.round,
        activeSeat: match.activeSeat,
        turnStage: match.turnStage,
        routeDeck: projectRouteDeck(routeDeck),
        totalRoutes: match.totalRoutes,
        topCard: { ...match.discardPile.at(-1) },
        stockCount: match.stock.length,
        roundWinnerSeat: match.roundWinnerSeat,
        winnerSeat: match.winnerSeat,
        roundOver: match.roundOver,
        matchOver: match.matchOver,
        actions: {
          drawStock: yourTurn && match.turnStage === "draw",
          drawDiscard: yourTurn && match.turnStage === "draw" && match.discardPile.length > 0,
          completeRoute: yourTurn && match.turnStage === "play" && !viewer.routeComplete && Boolean(viewerRoute),
          link: yourTurn && match.turnStage === "play" && viewer.routeComplete,
          discard: yourTurn && match.turnStage === "play"
        },
        players: match.players.map((player) => ({
          seat: player.seat,
          name: player.name,
          avatar: player.avatar,
          type: player.type,
          cardCount: player.hand.length,
          routeIndex: player.routeIndex,
          routeComplete: player.routeComplete,
          completedThisRound: player.completedThisRound,
          currentRoute: projectRoute(currentRoute(match, player), player.routeIndex),
          routeMeld: player.routeMeld.map((group) => group.map((card) => ({ ...card }))),
          lastPlay: player.lastPlay ? {
            kind: player.lastPlay.kind,
            label: player.lastPlay.label,
            cards: player.lastPlay.cards.map((card) => ({ ...card }))
          } : null,
          lastPlayedCard: player.lastPlayedCard ? { ...player.lastPlayedCard } : null,
          score: player.score,
          roundPenalty: player.roundPenalty,
          connected: player.type === "bot" ? true : connections.get(player.seat) === true
        })),
        yourRoute: projectRoute(viewerRoute, viewer.routeIndex),
        lastMoveText: match.lastMoveText,
        log: match.log.slice(0, 18)
      },
      hand: viewer.hand.map((card) => ({ ...card }))
    };
  }

  #drawFromStock(match, player) {
    if (!match.stock.length) this.#recycleDiscard(match);
    const card = match.stock.pop();
    if (!card) return null;
    player.hand.push(card);
    player.hand = rules.sortCards(player.hand, "rank");
    return card;
  }

  #recycleDiscard(match) {
    if (match.discardPile.length <= 1) return;
    const topCard = match.discardPile.pop();
    match.stock = this.shuffleDeck(match.discardPile);
    match.discardPile = [topCard];
    match.log.unshift("The discard stack returned to the stock.");
  }
}

export function secureShuffle(deck) {
  const shuffled = deck.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function randomRouteDeck(routeDecks) {
  return routeDecks[randomInt(routeDecks.length)];
}

function createMatchPlayer({ seat, name, avatar, type, style, progress = null }) {
  const routeIndex = Number.isInteger(progress?.routeIndex) ? Math.max(0, Math.min(10, progress.routeIndex)) : 0;
  const score = Number.isFinite(progress?.score) ? progress.score : 0;
  return {
    seat,
    name,
    avatar,
    type,
    style,
    hand: [],
    routeIndex,
    routeComplete: false,
    completedThisRound: false,
    routeMeld: [],
    lastPlay: null,
    lastPlayedCard: null,
    score,
    roundPenalty: 0
  };
}

function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 108) {
    throw new RoomError("Rotating Rummy requires its complete 108-card deck.", "INVALID_DECK", 500);
  }
  if (new Set(deck.map((card) => card.id)).size !== 108) {
    throw new RoomError("The Rotating Rummy deck contains duplicate cards.", "INVALID_DECK", 500);
  }
  if (deck.filter((card) => card.kind === "number").length !== 96
    || deck.filter((card) => card.kind === "glitch").length !== 8
    || deck.filter((card) => card.kind === "lock").length !== 4) {
    throw new RoomError("The Rotating Rummy deck has an invalid card distribution.", "INVALID_DECK", 500);
  }
}

function requireActivePlayer(match, seat, stage) {
  if (!match || match.roundOver || match.phase !== "playing") {
    throw new RoomError("No Rotating Rummy round is currently active.", "MATCH_NOT_ACTIVE", 409);
  }
  const player = getPlayer(match, seat);
  if (!player) throw new RoomError("Seat not found.", "SEAT_NOT_FOUND", 404);
  if (match.activeSeat !== player.seat) throw new RoomError("It is not your turn.", "NOT_YOUR_TURN", 409);
  if (stage && match.turnStage !== stage) {
    throw new RoomError(stage === "draw" ? "Draw before making your Route play." : "Draw a card before laying down or discarding.", "WRONG_TURN_STAGE", 409);
  }
  return player;
}

function cardsOwnedBy(player, cardIds) {
  if (!Array.isArray(cardIds) || !cardIds.length) {
    throw new RoomError("Select the cards for your Route.", "ROUTE_CARDS_REQUIRED", 409);
  }
  const requested = cardIds.map(String);
  if (new Set(requested).size !== requested.length) {
    throw new RoomError("A card can only be selected once.", "DUPLICATE_CARD", 409);
  }
  const byId = new Map(player.hand.map((card) => [card.id, card]));
  const selected = requested.map((cardId) => byId.get(cardId));
  if (selected.some((card) => !card)) throw new RoomError("One of those cards is not in your hand.", "CARD_NOT_OWNED", 404);
  return selected;
}

function currentRoute(match, player) {
  return routeLibrary.routeFor(match.routeDeckId, player.routeIndex);
}

function findBestLink(match, player) {
  const maxLinkCount = player.hand.length - 1;
  if (!player.routeComplete || maxLinkCount < 1) return null;
  const targets = match.players.flatMap((target) => {
    if (!target.routeComplete) return [];
    const route = currentRoute(match, target);
    return target.routeMeld.map((group, groupIndex) => ({
      target,
      group,
      groupIndex,
      requirement: route?.requirements?.[groupIndex]
    })).filter((candidate) => candidate.requirement && candidate.requirement.type !== "spectrum");
  });

  for (let count = maxLinkCount; count >= 1; count -= 1) {
    for (const cards of chooseCardSets(player.hand, count)) {
      for (const candidate of targets) {
        if (rules.canExtendRequirement([...candidate.group, ...cards], candidate.requirement)) {
          return { targetSeat: candidate.target.seat, groupIndex: candidate.groupIndex, cards };
        }
      }
    }
  }
  return null;
}

function chooseCardSets(cards, count, start = 0, selected = []) {
  if (count === 0) return [selected];
  if (!Array.isArray(cards) || cards.length - start < count) return [];
  const choices = [];
  for (let index = start; index <= cards.length - count; index += 1) {
    choices.push(...chooseCardSets(cards, count - 1, index + 1, [...selected, cards[index]]));
  }
  return choices;
}

function projectRoute(route, routeIndex) {
  if (!route) return null;
  return {
    number: routeIndex + 1,
    id: route.id,
    name: route.name,
    description: route.description,
    cardCount: routeLibrary.routeCardCount(route)
  };
}

function projectRouteDeck(routeDeck) {
  return {
    id: routeDeck.id,
    name: routeDeck.name,
    description: routeDeck.description,
    routes: routeDeck.routes.map((route, index) => projectRoute(route, index))
  };
}

function getPlayer(match, seat) {
  return match.players.find((player) => player.seat === Number(seat));
}

function nextPlayer(match, fromSeat) {
  const fromIndex = match.players.findIndex((player) => player.seat === Number(fromSeat));
  if (fromIndex < 0) return null;
  return match.players[(fromIndex + 1) % match.players.length];
}

function finishRound(match, winner) {
  const winningRouteNumber = winner.routeIndex + 1;
  const points = match.players
    .filter((player) => player.seat !== winner.seat)
    .flatMap((player) => player.hand)
    .reduce((total, card) => total + rules.cardPoints(card), 0);
  winner.score += points;

  for (const player of match.players) {
    player.roundPenalty = player.hand.reduce((total, card) => total + rules.cardPoints(card), 0);
    player.completedThisRound = player.routeComplete;
    if (player.routeComplete) player.routeIndex = Math.min(match.totalRoutes, player.routeIndex + 1);
  }

  match.roundWinnerSeat = winner.seat;
  match.roundOver = true;
  match.activeSeat = null;
  match.turnStage = "complete";
  match.matchOver = winner.routeIndex >= match.totalRoutes;
  if (match.matchOver) {
    match.phase = "complete";
    match.winnerSeat = winner.seat;
    match.lastMoveText = `${winner.name} cleared Route ${winningRouteNumber} and wins Rotating Rummy.`;
  } else {
    match.lastMoveText = `${winner.name} cleared Route ${winningRouteNumber} and ends the round.`;
  }
  match.log.unshift(match.lastMoveText);
}

function initialsForName(name, fallback) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] || fallback || "P").slice(0, 2);
  return letters.toUpperCase();
}
