// Chance of finishing a turn with points in each lower-section category when
// you play toward it: keeping the dice that serve the target and rerolling the
// rest, for each supported roll count.
//
// Indexed as CATEGORY_ODDS[dice][rolls][category]. Produced by Monte Carlo
// simulation, 200.000 turns per combination, scored with this app's own rules
// (js/rules.js) so the figures cannot drift from the implemented scoring. If a
// category's scoring changes, regenerate these rather than adjusting them by
// hand.
//
// The upper section is deliberately absent: those categories always score
// (often 0), so a hit/miss probability would be meaningless for them.
export const CATEGORY_ODDS = {
  5: {
    3: {
      onePair: 0.99913,
      twoPairs: 0.75208,
      threeKind: 0.74439,
      fourKind: 0.29002,
      smallStraight: 0.19639,
      largeStraight: 0.19651,
      fullHouse: 0.3577,
      chance: 1,
      yatzy: 0.04557,
    },
    4: {
      onePair: 0.99995,
      twoPairs: 0.85584,
      threeKind: 0.85681,
      fourKind: 0.44783,
      smallStraight: 0.31173,
      largeStraight: 0.31304,
      fullHouse: 0.50885,
      chance: 1,
      yatzy: 0.1006,
    },
    5: {
      onePair: 0.99999,
      twoPairs: 0.91609,
      threeKind: 0.92053,
      fourKind: 0.58476,
      smallStraight: 0.41618,
      largeStraight: 0.41335,
      fullHouse: 0.62182,
      chance: 1,
      yatzy: 0.17091,
    },
  },
  6: {
    3: {
      onePair: 1,
      twoPairs: 0.95803,
      threePairs: 0.271,
      threeKind: 0.88831,
      fourKind: 0.50328,
      fiveKind: 0.15751,
      villa: 0.1617,
      smallStraight: 0.43668,
      largeStraight: 0.43551,
      fullStraight: 0.19807,
      fullHouse: 0.75965,
      tower: 0.18695,
      chance: 1,
      maxiYatzy: 0.01996,
    },
    4: {
      onePair: 1,
      twoPairs: 0.98572,
      threePairs: 0.3875,
      threeKind: 0.95304,
      fourKind: 0.67816,
      fiveKind: 0.29252,
      villa: 0.27104,
      smallStraight: 0.59971,
      largeStraight: 0.59793,
      fullStraight: 0.31106,
      fullHouse: 0.87711,
      tower: 0.3053,
      chance: 1,
      maxiYatzy: 0.05418,
    },
    5: {
      onePair: 1,
      twoPairs: 0.99484,
      threePairs: 0.48678,
      threeKind: 0.9804,
      fourKind: 0.80167,
      fiveKind: 0.43363,
      villa: 0.37873,
      smallStraight: 0.71845,
      largeStraight: 0.71888,
      fullStraight: 0.41572,
      fullHouse: 0.93627,
      tower: 0.41061,
      chance: 1,
      maxiYatzy: 0.10684,
    },
  },
  12: {
    3: {
      onePair: 1,
      twoPairs: 1,
      threePairs: 1,
      fourPairs: 0.99856,
      threeKind: 1,
      fourKind: 0.99549,
      fiveKind: 0.92986,
      sixKind: 0.74045,
      villa: 0.99648,
      smallStraight: 0.97144,
      largeStraight: 0.97135,
      fullStraight: 0.95124,
      doubleFullStraight: 0.11245,
      fullHouse: 1,
      tower: 0.99425,
      chance: 1,
      gigantYatzy: 0.00015,
    },
    4: {
      onePair: 1,
      twoPairs: 1,
      threePairs: 1,
      fourPairs: 0.99979,
      threeKind: 1,
      fourKind: 0.99944,
      fiveKind: 0.98257,
      sixKind: 0.90319,
      villa: 0.99947,
      smallStraight: 0.99333,
      largeStraight: 0.99333,
      fullStraight: 0.9862,
      doubleFullStraight: 0.2076,
      fullHouse: 1,
      tower: 0.99938,
      chance: 1,
      gigantYatzy: 0.00127,
    },
    5: {
      onePair: 1,
      twoPairs: 1,
      threePairs: 1,
      fourPairs: 0.99997,
      threeKind: 1,
      fourKind: 0.99997,
      fiveKind: 0.99599,
      sixKind: 0.96838,
      villa: 0.99996,
      smallStraight: 0.99843,
      largeStraight: 0.99845,
      fullStraight: 0.99614,
      doubleFullStraight: 0.30821,
      fullHouse: 1,
      tower: 0.99991,
      chance: 1,
      gigantYatzy: 0.00588,
    },
  },
};

// Falls back to the standard three-roll table if an unexpected roll count ever
// reaches here, so the panel shows something reasonable rather than blanks.
export function oddsFor(dice, rolls) {
  const perDice = CATEGORY_ODDS[dice];
  if (!perDice) return {};
  return perDice[rolls] || perDice[3] || {};
}

// Categories that provably always score, so they can be stated as certain
// rather than as a measured "almost always": Chance is the sum of the dice,
// which can never be zero. A simulated 1.0 elsewhere is not proof — six dice
// showing 1-2-3-4-5-6 have no pair — so those stay "næsten altid".
const ALWAYS_SCORES = new Set(["chance"]);

// Danish formatting, and no false precision: a simulated 0,012% is reported as
// "under 0,1%" rather than pretending the third decimal is meaningful.
export function formatOdds(p, key) {
  if (ALWAYS_SCORES.has(key)) return "altid";
  if (p === undefined || p === null) return "";
  if (p >= 0.995) return "næsten altid";
  if (p < 0.001) return "under 0,1%";
  if (p >= 0.1) return `${Math.round(p * 100)}%`;
  return `${(p * 100).toFixed(1).replace(".", ",")}%`;
}

// Roughly "1 in N turns", for the long shots where a percentage reads as zero.
export function formatFrequency(p) {
  if (!p || p >= 0.1) return "";
  const n = Math.round(1 / p);
  if (n < 10) return "";
  const rounded = n >= 1000 ? Math.round(n / 500) * 500 : Math.round(n / 5) * 5;
  return `ca. hver ${rounded.toLocaleString("da-DK")}. tur`;
}
