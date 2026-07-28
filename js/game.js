import { getAllCategories, scoreCategory } from "./rules.js";

export const DEFAULT_MAX_ROLLS = 3;

let nextPlayerId = 1;

export function createGame(variant, mode, playerNames, maxRolls = DEFAULT_MAX_ROLLS) {
  const categories = getAllCategories(variant);
  const players = playerNames.map((name) => ({
    id: nextPlayerId++,
    name,
    scores: Object.fromEntries(categories.map((c) => [c.key, null])),
    struck: [],
  }));

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
  };
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
  player.scores[categoryKey] = scoreCategory(state.variant, categoryKey, state.dice);
  return advanceTurn(state);
}

export function strikeCategory(state, categoryKey) {
  const player = currentPlayer(state);
  if (player.scores[categoryKey] !== null) return state;
  player.scores[categoryKey] = 0;
  player.struck.push(categoryKey);
  return advanceTurn(state);
}
