(function (root, factory) {
  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  root.CardcadeTrickRules = rules;
})(globalThis, function () {
  const value = card => "23456789TJQKA".indexOf(card.rank === "10" ? "T" : card.rank);
  const points = card => card.suit === "H" ? 1 : card.id === "QS" ? 13 : 0;
  function legal(hand, trick, game, broken) {
    if (trick.length) {
      const following = hand.filter(c => c.suit === trick[0].card.suit);
      if (following.length) return following;
    } else {
      const restricted = game === "spades" ? "S" : "H";
      const others = hand.filter(c => c.suit !== restricted);
      if (!broken && others.length) return others;
    }
    return hand;
  }
  function winner(trick, trump = null) {
    return trick.reduce((best, play) => {
      if (play.card.suit === best.card.suit) return value(play.card) > value(best.card) ? play : best;
      return play.card.suit === trump ? play : best;
    }).seat;
  }
  function scoreSpades(players, teams) {
    return teams.map(team => {
      const members = players.filter(p => p.team === team.id);
      const bid = members.reduce((n, p) => n + p.bid, 0);
      const tricks = members.filter(p => p.bid > 0).reduce((n, p) => n + p.tricks, 0);
      const extra = Math.max(0, tricks - bid) + members.filter(p => p.bid === 0).reduce((n, p) => n + p.tricks, 0);
      const nil = members.filter(p => p.bid === 0).reduce((n, p) => n + (p.tricks === 0 ? 100 : -100), 0);
      const bags = team.bags + extra;
      const delta = (tricks >= bid ? bid * 10 + extra : -bid * 10 + extra) + nil - Math.floor(bags / 10) * 100;
      return { ...team, score: team.score + delta, bags: bags % 10, delta };
    });
  }
  return { value, points, legal, winner, scoreSpades };
});
