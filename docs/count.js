// Federal House-style full distribution for the five candidates on the Trinity ballot.
const candidates = [0, 1, 2, 3, 4];
const zeroes = () => candidates.map(() => 0);

// A null means the host has confirmed an empty square on the paper.
export function classify(input) {
  const ranks = Array.isArray(input) ? [...input] : [];
  const informal = (reason) => ({ formal: false, ranks, reason });
  if (ranks.length !== candidates.length)
    return informal("Check all five boxes.");

  const marked = ranks.filter((rank) => rank !== null);
  if (marked.some((rank) => !Number.isInteger(rank) || rank < 1 || rank > 5)) {
    return informal("Use a number from 1 to 5 in each marked box.");
  }
  if (new Set(marked).size !== marked.length)
    return informal("A preference number is repeated.");
  if (marked.length === 5) return { formal: true, ranks, reason: "" };
  if (marked.length === 4 && !marked.includes(5)) {
    ranks[ranks.indexOf(null)] = 5;
    return {
      formal: true,
      ranks,
      reason: "The blank box counts as fifth preference.",
    };
  }
  return informal(
    "A single blank counts as last only when the other boxes contain 1 to 4.",
  );
}

function lowest(group, totals) {
  const minimum = Math.min(...group.map((id) => totals[id]));
  return group.filter((id) => totals[id] === minimum);
}

// Section 274(9) looks for a single candidate below *all* the other tied
// candidates at an earlier count. Keep the original tied group throughout.
function exclusion(tied, history) {
  if (tied.length === 1) return tied[0];
  for (let i = history.length - 1; i >= 0; i--) {
    const past = lowest(tied, history[i].totals);
    if (past.length === 1) return past[0];
  }
  return null;
}

// Ballots are arrays of ranks in printed candidate order. The report carries
// the outgoing transfers on the round that excluded the candidate.
export function count(ballots, draws = {}) {
  const report = { rounds: [], tie: null, winner: null, finalTie: false };
  if (!Array.isArray(ballots))
    throw new TypeError("Expected an array of ballots.");
  if (!ballots.length) return report;
  const preferences = Array.from(ballots, (ballot, index) => {
    const result = classify(ballot);
    if (!result.formal)
      throw new RangeError(`Ballot ${index + 1}: ${result.reason}`);
    return [...candidates].sort((a, b) => result.ranks[a] - result.ranks[b]);
  });
  let active = [...candidates];
  while (active.length >= 2) {
    const totals = zeroes();
    for (const order of preferences)
      totals[order.find((id) => active.includes(id))]++;
    const previous = report.rounds.at(-1);
    if (previous) {
      for (const id of active)
        previous.transfers[id] = totals[id] - previous.totals[id];
    }
    const round = { totals, active, excluded: null, transfers: zeroes() };
    if (active.length === 2) {
      report.rounds.push(round);
      const [a, b] = active;
      report.finalTie = totals[a] === totals[b];
      if (!report.finalTie) report.winner = totals[a] > totals[b] ? a : b;
      return report;
    }
    const tied = lowest(active, totals);
    const id = exclusion(tied, report.rounds);
    report.rounds.push(round);
    if (id !== null) {
      round.excluded = id;
    } else {
      // A re-opened reveal with the same count must use the host's recorded lot.
      const key = report.rounds
        .map((r) => r.active.join("") + "=" + r.totals.join(","))
        .join("/");
      const drawn = draws?.[key];
      if (!tied.includes(drawn)) {
        report.tie = { key, candidates: tied };
        return report;
      }
      round.excluded = drawn;
    }
    active = active.filter((id) => id !== round.excluded);
  }
  return report;
}
