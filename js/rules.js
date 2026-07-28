// Rules engine: category definitions and scoring for the 5-, 6- and 12-dice variants.
// Ruleset notes (no single universal "official" source exists for the 6- and 12-dice
// variants, so a well-documented, internally consistent set was chosen for each — see
// the in-app rules panel for the exact list shown to players):
//  - 5 dice:  classic Yatzy, bonus at 63+ -> 50 points.
//  - 6 dice:  "Maxi Yatzy", bonus at 84+ -> 100 points.
//  - 12 dice: "Gigant Yatzy", same turn structure (3 rolls, pick a category),
//             categories scaled up, bonus at 168+ -> 200 points.

function counts(dice) {
  const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const d of dice) c[d]++;
  return c;
}

function sumAll(dice) {
  return dice.reduce((a, b) => a + b, 0);
}

function upperScore(dice, face) {
  return counts(dice)[face] * face;
}

function nOfKind(dice, n) {
  const c = counts(dice);
  for (let v = 6; v >= 1; v--) {
    if (c[v] >= n) return v * n;
  }
  return 0;
}

function fixedIfNOfKind(dice, n, points) {
  const c = counts(dice);
  for (let v = 6; v >= 1; v--) {
    if (c[v] >= n) return points;
  }
  return 0;
}

function kPairs(dice, k) {
  const c = counts(dice);
  let found = 0;
  let total = 0;
  for (let v = 6; v >= 1 && found < k; v--) {
    while (c[v] >= 2 && found < k) {
      c[v] -= 2;
      found++;
      total += v * 2;
    }
  }
  return found === k ? total : 0;
}

function straight(dice, values, points) {
  const c = counts(dice);
  return values.every((v) => c[v] >= 1) ? points : 0;
}

function doubleStraight(dice, values, points) {
  const c = counts(dice);
  return values.every((v) => c[v] >= 2) ? points : 0;
}

// Finds distinct values to fill each group size (descending), maximizing
// sum(value * size). Brute-forces over permutations since the domain (faces
// 1-6, at most 4 groups) is tiny.
function bestMultiGroup(dice, groupSizes) {
  const c = counts(dice);
  const faces = [1, 2, 3, 4, 5, 6];
  let best = 0;

  function permute(remainingFaces, remainingGroups, used) {
    if (remainingGroups.length === 0) {
      let score = 0;
      for (const [face, size] of used) score += face * size;
      best = Math.max(best, score);
      return;
    }
    const size = remainingGroups[0];
    for (let i = 0; i < remainingFaces.length; i++) {
      const face = remainingFaces[i];
      if (c[face] >= size) {
        const next = remainingFaces.slice(0, i).concat(remainingFaces.slice(i + 1));
        permute(next, remainingGroups.slice(1), used.concat([[face, size]]));
      }
    }
  }

  permute(faces, groupSizes, []);
  return best;
}

const UPPER_CATEGORIES = [
  { key: "ones", label: "Ettere", face: 1 },
  { key: "twos", label: "Toere", face: 2 },
  { key: "threes", label: "Treere", face: 3 },
  { key: "fours", label: "Firere", face: 4 },
  { key: "fives", label: "Femmere", face: 5 },
  { key: "sixes", label: "Seksere", face: 6 },
];

function buildRuleset(variant) {
  const upper = UPPER_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    section: "upper",
    face: c.face,
    score: (dice) => upperScore(dice, c.face),
  }));

  let lower = [];
  let bonusThreshold;
  let bonusPoints;

  const onePair = {
    key: "onePair",
    label: "Ét par",
    section: "lower",
    score: (dice) => kPairs(dice, 1),
  };
  const twoPairs = {
    key: "twoPairs",
    label: "To par",
    section: "lower",
    score: (dice) => kPairs(dice, 2),
  };
  const threePairs = {
    key: "threePairs",
    label: "Tre par",
    section: "lower",
    score: (dice) => kPairs(dice, 3),
  };
  const fourPairs = {
    key: "fourPairs",
    label: "Fire par",
    section: "lower",
    score: (dice) => kPairs(dice, 4),
  };
  const threeKind = {
    key: "threeKind",
    label: "Tre ens",
    section: "lower",
    score: (dice) => nOfKind(dice, 3),
  };
  const fourKind = {
    key: "fourKind",
    label: "Fire ens",
    section: "lower",
    score: (dice) => nOfKind(dice, 4),
  };
  const fiveKind = {
    key: "fiveKind",
    label: "Fem ens",
    section: "lower",
    score: (dice) => nOfKind(dice, 5),
  };
  const sixKind = {
    key: "sixKind",
    label: "Seks ens",
    section: "lower",
    score: (dice) => nOfKind(dice, 6),
  };
  const smallStraight = {
    key: "smallStraight",
    label: "Lille straight",
    section: "lower",
    score: (dice) => straight(dice, [1, 2, 3, 4, 5], 15),
  };
  const largeStraight = {
    key: "largeStraight",
    label: "Stor straight",
    section: "lower",
    score: (dice) => straight(dice, [2, 3, 4, 5, 6], 20),
  };
  const fullStraight = {
    key: "fullStraight",
    label: "Fuld straight (1-6)",
    section: "lower",
    score: (dice) => straight(dice, [1, 2, 3, 4, 5, 6], 30),
  };
  const doubleFullStraight = {
    key: "doubleFullStraight",
    label: "Dobbelt fuld straight",
    section: "lower",
    score: (dice) => doubleStraight(dice, [1, 2, 3, 4, 5, 6], 60),
  };
  const fullHouse = {
    key: "fullHouse",
    label: "Hus",
    section: "lower",
    score: (dice) => bestMultiGroup(dice, [3, 2]),
  };
  const villa = {
    key: "villa",
    label: "Villa (2 x tre ens)",
    section: "lower",
    score: (dice) => bestMultiGroup(dice, [3, 3]),
  };
  const tower = {
    key: "tower",
    label: "Tårn (fire ens + par)",
    section: "lower",
    score: (dice) => bestMultiGroup(dice, [4, 2]),
  };
  const chance = {
    key: "chance",
    label: "Chance",
    section: "lower",
    score: (dice) => sumAll(dice),
  };

  if (variant === 5) {
    lower = [
      onePair,
      twoPairs,
      threeKind,
      fourKind,
      smallStraight,
      largeStraight,
      fullHouse,
      chance,
      { key: "yatzy", label: "Yatzy", section: "lower", score: (dice) => fixedIfNOfKind(dice, 5, 50) },
    ];
    bonusThreshold = 63;
    bonusPoints = 50;
  } else if (variant === 6) {
    lower = [
      onePair,
      twoPairs,
      threePairs,
      threeKind,
      fourKind,
      fiveKind,
      villa,
      smallStraight,
      largeStraight,
      fullStraight,
      fullHouse,
      tower,
      chance,
      { key: "maxiYatzy", label: "Maxi Yatzy", section: "lower", score: (dice) => fixedIfNOfKind(dice, 6, 100) },
    ];
    bonusThreshold = 84;
    bonusPoints = 100;
  } else if (variant === 12) {
    lower = [
      onePair,
      twoPairs,
      threePairs,
      fourPairs,
      threeKind,
      fourKind,
      fiveKind,
      sixKind,
      villa,
      smallStraight,
      largeStraight,
      fullStraight,
      doubleFullStraight,
      fullHouse,
      tower,
      chance,
      { key: "gigantYatzy", label: "Gigant Yatzy", section: "lower", score: (dice) => fixedIfNOfKind(dice, 12, 200) },
    ];
    bonusThreshold = 168;
    bonusPoints = 200;
  } else {
    throw new Error(`Unknown variant: ${variant}`);
  }

  return { upper, lower, bonusThreshold, bonusPoints };
}

const RULESET_CACHE = {};
export function getRuleset(variant) {
  if (!RULESET_CACHE[variant]) RULESET_CACHE[variant] = buildRuleset(variant);
  return RULESET_CACHE[variant];
}

export function getAllCategories(variant) {
  const { upper, lower } = getRuleset(variant);
  return upper.concat(lower);
}

export function scoreCategory(variant, categoryKey, dice) {
  const cat = getAllCategories(variant).find((c) => c.key === categoryKey);
  if (!cat) throw new Error(`Unknown category: ${categoryKey}`);
  return cat.score(dice);
}

// Every bonus threshold is a multiple of 21 (1+2+…+6), so it corresponds
// exactly to holding N of every face: 63 = 3 of each, 84 = 4 of each,
// 168 = 8 of each. Returns null if a threshold ever stops dividing evenly, so
// callers can fall back to showing only the running total.
export function bonusParPerFace(variant) {
  const { bonusThreshold } = getRuleset(variant);
  return bonusThreshold % 21 === 0 ? bonusThreshold / 21 : null;
}

// Returns upper-section total, whether the bonus is earned and its value.
export function computeUpperBonus(variant, scores) {
  const { upper, bonusThreshold, bonusPoints } = getRuleset(variant);
  let upperTotal = 0;
  for (const cat of upper) {
    const v = scores[cat.key];
    if (typeof v === "number") upperTotal += v;
  }
  const earned = upperTotal >= bonusThreshold;
  return { upperTotal, earned, bonus: earned ? bonusPoints : 0, bonusThreshold, bonusPoints };
}

// Grand total for a player given their scores map ({categoryKey: number}).
export function computeTotal(variant, scores) {
  const { upper, lower } = getRuleset(variant);
  let total = 0;
  for (const cat of upper.concat(lower)) {
    const v = scores[cat.key];
    if (typeof v === "number") total += v;
  }
  const { bonus } = computeUpperBonus(variant, scores);
  return total + bonus;
}

// Ranks every still-open category by the score the current dice would give it.
export function suggestCategories(variant, dice, scores) {
  const all = getAllCategories(variant);
  const open = all.filter((c) => scores[c.key] === undefined || scores[c.key] === null);
  const suggestions = open.map((c) => ({ key: c.key, label: c.label, section: c.section, score: c.score(dice) }));
  suggestions.sort((a, b) => b.score - a.score);
  return suggestions;
}
