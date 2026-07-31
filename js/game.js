import { getAllCategories, scoreCategory, fixedScoreFor } from "./rules.js";

export const DEFAULT_MAX_ROLLS = 3;
const HISTORY_LIMIT = 20;

// Ids are derived from the players present rather than a module counter, which
// would restart at 1 on reload and collide with a resumed game's ids.
function nextPlayerId(players) {
  return players.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
}

function blankPlayer(variant, id, name) {
  return {
    id,
    name,
    scores: Object.fromEntries(getAllCategories(variant).map((c) => [c.key, null])),
    struck: [],
  };
}

export function createGame(variant, mode, playerNames, maxRolls = DEFAULT_MAX_ROLLS) {
  const players = playerNames.map((name, i) => blankPlayer(variant, i + 1, name));

  return {
    variant,
    mode, // "virtual" | "physical"
    players,
    currentPlayerIndex: 0,
    round: 1,
    dice: new Array(variant).fill(0),
    held: new Array(variant).fill(false),
    rollsUsed: 0,
    maxRolls,
    gameOver: false,
    finishedAt: null,
    history: [],
  };
}

// --- Undo -------------------------------------------------------------------
// Snapshots are taken before anything irreversible: scoring, striking, and
// changes to the player list. Rolling is deliberately excluded — undoing a roll
// would be a re-roll.

export function pushHistory(state) {
  const { history, ...rest } = state;
  const snapshot = JSON.parse(JSON.stringify(rest));
  state.history = [...(history || []), snapshot].slice(-HISTORY_LIMIT);
  return state;
}

export function canUndo(state) {
  return Boolean(state && state.history && state.history.length);
}

export function undo(state) {
  if (!canUndo(state)) return state;
  const history = state.history.slice(0, -1);
  return { ...state.history[state.history.length - 1], history };
}

// --- Players in play --------------------------------------------------------

export function addPlayer(state, name) {
  state.players.push(blankPlayer(state.variant, nextPlayerId(state.players), name));
  // Someone with a blank card means the game is no longer finished.
  state.gameOver = false;
  state.finishedAt = null;
  return state;
}

export function renamePlayer(state, id, name) {
  const player = state.players.find((p) => p.id === id);
  if (player && name.trim()) player.name = name.trim();
  return state;
}

export function removePlayer(state, id) {
  if (state.players.length <= 1) return state; // a game needs somebody
  const index = state.players.findIndex((p) => p.id === id);
  if (index === -1) return state;

  const wasCurrent = index === state.currentPlayerIndex;
  state.players.splice(index, 1);

  if (index < state.currentPlayerIndex) {
    state.currentPlayerIndex -= 1;
  } else if (wasCurrent) {
    // The slot now holds the next player; wrap if it was the last one.
    if (state.currentPlayerIndex >= state.players.length) state.currentPlayerIndex = 0;
    // Their turn is void, so the throw goes with them.
    state.dice = new Array(state.variant).fill(0);
    state.held = new Array(state.variant).fill(false);
    state.rollsUsed = 0;
  }

  if (state.players.every(isPlayerDone)) {
    state.gameOver = true;
  } else if (isPlayerDone(state.players[state.currentPlayerIndex])) {
    // Landed on somebody with a full card; move to one still playing.
    let next = state.currentPlayerIndex;
    do {
      next = (next + 1) % state.players.length;
    } while (isPlayerDone(state.players[next]));
    state.currentPlayerIndex = next;
  }
  return state;
}

export function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

export function rollDice(state) {
  if (state.gameOver || state.rollsUsed >= state.maxRolls) return state;
  state.dice = state.dice.map((v, i) => (state.held[i] ? v : 1 + Math.floor(Math.random() * 6)));
  state.rollsUsed += 1;
  return state;
}

export function toggleHold(state, index) {
  if (state.rollsUsed === 0 || state.gameOver) return state;
  state.held[index] = !state.held[index];
  return state;
}

export function setDiceFromValues(state, values) {
  state.dice = values.slice();
  if (state.rollsUsed === 0) state.rollsUsed = 1;
  return state;
}

export function isPlayerDone(player) {
  return Object.values(player.scores).every((v) => v !== null);
}

function advanceTurn(state) {
  state.dice = new Array(state.variant).fill(0);
  state.held = new Array(state.variant).fill(false);
  state.rollsUsed = 0;

  if (state.players.every(isPlayerDone)) {
    state.gameOver = true;
    state.finishedAt = state.finishedAt ?? "now";
    return state;
  }

  let next = state.currentPlayerIndex;
  do {
    next = (next + 1) % state.players.length;
    if (next === 0) state.round += 1;
  } while (isPlayerDone(state.players[next]));
  state.currentPlayerIndex = next;
  return state;
}

export function applyScore(state, categoryKey) {
  const player = currentPlayer(state);
  if (player.scores[categoryKey] !== null) return state;
  // With physical dice the player need only enter the dice that count, so a
  // flat-scoring category (the straights, Yatzy) can be claimed without
  // entering anything — computing it from a partial tally would score 0.
  const fixed = state.mode === "physical" ? fixedScoreFor(state.variant, categoryKey) : null;
  player.scores[categoryKey] =
    fixed !== null ? fixed : scoreCategory(state.variant, categoryKey, state.dice);
  return advanceTurn(state);
}

export function strikeCategory(state, categoryKey) {
  const player = currentPlayer(state);
  if (player.scores[categoryKey] !== null) return state;
  player.scores[categoryKey] = 0;
  player.struck.push(categoryKey);
  return advanceTurn(state);
}
