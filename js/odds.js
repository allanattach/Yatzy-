// Chance of finishing a turn with points in each lower-section category when
// you play toward it: three rolls, keeping the dice that serve the target and
// rerolling the rest.
//
// Produced by Monte Carlo simulation, 400.000 turns per category, scored with
// this app's own rules (js/rules.js) so the figures cannot drift from the
// implemented scoring. If a category's scoring changes, regenerate these rather
// than adjusting them by hand.
//
// The upper section is deliberately absent: those categories always score
// (often 0), so a hit/miss probability would be meaningless for them.
export const CATEGORY_ODDS = {
  5: {
    onePair: 0.99921,
    twoPairs: 0.75304,
    threeKind: 0.74382,
    fourKind: 0.29037,
    smallStraight: 0.19567,
    largeStraight: 0.19722,
    fullHouse: 0.35811,
    chance: 1,
    yatzy: 0.04562,
  },
  6: {
    onePair: 1,
    twoPairs: 0.95729,
    threePairs: 0.2711,
    threeKind: 0.88885,
    fourKind: 0.50095,
    fiveKind: 0.15761,
    villa: 0.16178,
    smallStraight: 0.43663,
    largeStraight: 0.43703,
    fullStraight: 0.19633,
    fullHouse: 0.7605,
    tower: 0.18711,
    chance: 1,
    maxiYatzy: 0.02075,
  },
  12: {
    onePair: 1,
    twoPairs: 1,
    threePairs: 1,
    fourPairs: 0.99878,
    threeKind: 1,
    fourKind: 0.99548,
    fiveKind: 0.92946,
    sixKind: 0.73916,
    villa: 0.99629,
    smallStraight: 0.97133,
    largeStraight: 0.97118,
    fullStraight: 0.95134,
    doubleFullStraight: 0.11203,
    fullHouse: 1,
    tower: 0.99425,
    chance: 1,
    gigantYatzy: 0.00012,
  },
};

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
