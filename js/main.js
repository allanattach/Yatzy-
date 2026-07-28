import { createGame, currentPlayer, applyScore, strikeCategory } from "./game.js";
import { getRuleset } from "./rules.js";
import { saveState, loadState, clearState } from "./storage.js";
import { renderVirtualDice } from "./dice.js";
import { renderPhysicalDice, isPhysicalReadingComplete } from "./camera.js";
import { renderCurrentScorecard, renderScoreboard } from "./scoreboard.js";
import { renderPodium } from "./podium.js";

let state = null;

const screens = {
  setup: document.getElementById("screen-setup"),
  game: document.getElementById("screen-game"),
  podium: document.getElementById("screen-podium"),
};
const btnNewGame = document.getElementById("btn-new-game");

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
  btnNewGame.hidden = name === "setup";
}

// ---------- Setup screen ----------
const playerList = document.getElementById("player-list");
const btnAddPlayer = document.getElementById("btn-add-player");
const btnStart = document.getElementById("btn-start");
const resumeBanner = document.getElementById("resume-banner");
const btnResume = document.getElementById("btn-resume");
const btnDiscard = document.getElementById("btn-discard");

function addPlayerRow(name = "") {
  const li = document.createElement("li");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = `Spiller ${playerList.children.length + 1}`;
  input.value = name;
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-player";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => {
    if (playerList.children.length > 1) li.remove();
  });
  li.appendChild(input);
  li.appendChild(removeBtn);
  playerList.appendChild(li);
}

btnAddPlayer.addEventListener("click", () => addPlayerRow());

btnStart.addEventListener("click", () => {
  const variant = Number(document.querySelector('input[name="variant"]:checked').value);
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const names = Array.from(playerList.querySelectorAll("input[type=text]"))
    .map((inp, i) => inp.value.trim() || `Spiller ${i + 1}`);
  if (names.length === 0) return;

  state = createGame(variant, mode, names);
  saveState(state);
  showScreen("game");
  renderGameScreen();
});

const savedOnLoad = loadState();
if (savedOnLoad && !savedOnLoad.gameOver) {
  resumeBanner.hidden = false;
} else {
  addPlayerRow();
  addPlayerRow();
}

btnResume.addEventListener("click", () => {
  state = savedOnLoad;
  resumeBanner.hidden = true;
  showScreen("game");
  renderGameScreen();
});

btnDiscard.addEventListener("click", () => {
  clearState();
  resumeBanner.hidden = true;
  if (playerList.children.length === 0) {
    addPlayerRow();
    addPlayerRow();
  }
});

btnNewGame.addEventListener("click", () => {
  if (!confirm("Er du sikker på at du vil starte et nyt spil? Det nuværende spil slettes.")) return;
  clearState();
  state = null;
  playerList.innerHTML = "";
  addPlayerRow();
  addPlayerRow();
  showScreen("setup");
});

// ---------- Game screen ----------
const virtualArea = document.getElementById("virtual-dice-area");
const physicalArea = document.getElementById("physical-dice-area");
const scorecardEl = document.getElementById("current-scorecard");
const scoreboardEl = document.getElementById("scoreboard-wrap");
const roundNumberEl = document.getElementById("round-number");
const currentPlayerNameEl = document.getElementById("current-player-name");

function diceReady() {
  return state.mode === "virtual" ? state.rollsUsed > 0 : isPhysicalReadingComplete(state);
}

function refreshDiceIndependentUI() {
  roundNumberEl.textContent = state.round;
  currentPlayerNameEl.textContent = currentPlayer(state).name;
  renderCurrentScorecard(scorecardEl, state, diceReady(), { onApply: handleApply, onStrike: handleStrike });
  renderScoreboard(scoreboardEl, state);
  saveState(state);
}

function renderGameScreen() {
  if (state.gameOver) {
    renderPodiumScreen();
    return;
  }
  if (state.mode === "virtual") {
    physicalArea.hidden = true;
    renderVirtualDice(virtualArea, state, { onChange: refreshDiceIndependentUI });
  } else {
    virtualArea.hidden = true;
    renderPhysicalDice(physicalArea, state, { onChange: refreshDiceIndependentUI });
  }
  refreshDiceIndependentUI();
}

function handleApply(categoryKey) {
  applyScore(state, categoryKey);
  showScreen(state.gameOver ? "podium" : "game");
  renderGameScreen();
}

function handleStrike(categoryKey) {
  strikeCategory(state, categoryKey);
  showScreen(state.gameOver ? "podium" : "game");
  renderGameScreen();
}

// ---------- Podium screen ----------
const podiumEl = document.getElementById("podium");
const finalTableEl = document.getElementById("final-table");
const btnPlayAgain = document.getElementById("btn-play-again");

function renderPodiumScreen() {
  showScreen("podium");
  renderPodium(podiumEl, finalTableEl, state);
  saveState(state);
}

btnPlayAgain.addEventListener("click", () => {
  clearState();
  state = null;
  playerList.innerHTML = "";
  addPlayerRow();
  addPlayerRow();
  showScreen("setup");
});

// ---------- Rules dialog ----------
const rulesDialog = document.getElementById("rules-dialog");
const rulesContent = document.getElementById("rules-content");
document.getElementById("btn-rules").addEventListener("click", () => {
  const variant = state ? state.variant : Number(document.querySelector('input[name="variant"]:checked').value);
  const { upper, lower, bonusThreshold, bonusPoints } = getRuleset(variant);
  rulesContent.innerHTML = `
    <h3>${variant} terninger</h3>
    <p>Op til 3 kast pr. tur. Øvre sektion bonus: ${bonusPoints} point ved ${bonusThreshold}+ i alt.</p>
    <p><strong>Øvre sektion:</strong> ${upper.map((c) => c.label).join(", ")}</p>
    <p><strong>Nedre sektion:</strong> ${lower.map((c) => c.label).join(", ")}</p>
    <p>Du kan altid vælge at <em>stryge</em> en post i stedet for at bruge kastet – den post får 0 point.</p>
  `;
  rulesDialog.hidden = false;
});
document.getElementById("btn-close-rules").addEventListener("click", () => { rulesDialog.hidden = true; });

showScreen("setup");
