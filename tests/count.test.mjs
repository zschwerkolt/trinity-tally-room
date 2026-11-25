import assert from "node:assert/strict";
import test from "node:test";
import { classify, count } from "../docs/count.js";

test("five preferences and the single final blank", () => {
  const complete = [3, 4, 2, 5, 1];
  assert.deepEqual(classify(complete).ranks, complete);
  assert.equal(classify(complete).formal, true);
  const blank = Object.freeze([3, 4, 2, null, 1]);
  assert.equal(classify(blank).formal, true);
  assert.deepEqual(classify(blank).ranks, complete);
  assert.equal(blank[3], null);
});

test("incomplete, duplicate and invalid marks cannot enter the formal count", () => {
  const invalid = [
    null,
    [],
    [1, 2, 3, 4],
    [1, 2, 3, 4, 5, 6],
    [0, 2, 3, 4, 1],
    ["1", 2, 3, 4, 5],
    [1, 2, 3, 4, 4],
    [null, 2, 3, 4, 5],
    [null, null, 1, 2, 3],
    [1, 2, 3, 4, undefined],
    [1, 2, 3, 4, ,],
    Array(5).fill(null),
  ];
  for (const ballot of invalid) {
    assert.equal(classify(ballot).formal, false);
    assert.throws(() => count([ballot]), RangeError);
  }
  assert.deepEqual(count([]), {
    rounds: [],
    finalTie: false,
    tie: null,
    winner: null,
  });
  assert.throws(() => count(null), TypeError);
});

test("AEC five-fruit worked election, including all transfers", () => {
  // Ballots in Apple, Banana, Orange, Pear, Grape order.
  // https://education.aec.gov.au/democracy-rules/interactives/aec-voting-tool/
  const ballotStrings = [
    "31452",
    "52341",
    "21345",
    "12435",
    "34512",
    "13254",
    "25413",
    "23145",
    "34521",
    "42531",
    "12354",
    "32451",
    "23541",
    "32415",
    "53421",
    "25413",
    "13254",
    "41352",
    "23451",
    "13542",
    "31452",
    "13452",
    "51342",
    "32145",
    "12453",
  ];
  const result = count(ballotStrings.map((s) => [...s].map(Number)));
  assert.deepEqual(
    result.rounds.map((r) => r.totals),
    [
      [7, 5, 2, 4, 7],
      [8, 6, 0, 4, 7],
      [10, 7, 0, 0, 8],
      [13, 0, 0, 0, 12],
    ],
  );
  assert.deepEqual(
    result.rounds.map((r) => r.transfers),
    [
      [1, 1, 0, 0, 0],
      [2, 1, 0, 0, 1],
      [3, 0, 0, 0, 4],
      [0, 0, 0, 0, 0],
    ],
  );
  assert.deepEqual(
    result.rounds.map((r) => r.excluded),
    [2, 3, 1, null],
  );
  assert.equal(result.winner, 0);
  assert.equal(result.finalTie, false);
});

test("countback resolves a three-way tie by the previous unique low", () => {
  const ballots = ["12345", "21345", "23145", "23415", "23451"].flatMap(
    (s, i) => Array([4, 3, 3, 2, 1][i]).fill([...s].map(Number)),
  );
  // The only fifth-candidate vote goes to the fourth candidate.
  ballots[12] = [3, 4, 5, 2, 1];
  const result = count(ballots);
  assert.deepEqual(result.rounds[1].totals, [4, 3, 3, 3, 0]);
  assert.equal(result.rounds[1].excluded, 3);
});

test("a required draw is recorded, repeatable and never used to break a final tie", () => {
  const ballots = [
    [1, 2, 3, 4, 5],
    [2, 1, 3, 4, 5],
  ];
  const draws = {};
  const initial = count(ballots);
  assert.deepEqual(initial.tie.candidates, [2, 3, 4]);
  assert.equal(initial.winner, null);
  assert.deepEqual(count(ballots, { [initial.tie.key]: 0 }).tie, initial.tie);
  let result = initial;
  while (result.tie) {
    draws[result.tie.key] = result.tie.candidates[0];
    result = count(ballots, draws);
  }
  assert.deepEqual(result, count(ballots, draws));
  assert.equal(result.rounds.length, 4);
  assert.equal(result.winner, null);
  assert.equal(result.finalTie, true);
});
