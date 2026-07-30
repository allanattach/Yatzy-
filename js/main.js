import {
  createGame,
  currentPlayer,
  applyScore,
  strikeCategory,
  DEFAULT_MAX_ROLLS,
} from "./game.js";
import { getRuleset, bonusParPerFace } from "./rules.js";
import { oddsFor, formatOdds, formatFrequency } from "./odds.js";
import { initThemeControl } from "./theme.js";
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
  const rolls = Number(document.querySelector('input[name="rolls"]:checked').value);
  const names = Array.from(playerList.querySelectorAll("input[type=text]"))
    .map((inp, i) => inp.value.trim() || `Spiller ${i + 1}`);
  if (names.length === 0) return;

  state = createGame(variant, mode, names, rolls);
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
  // Games saved before the roll count was configurable carry no maxRolls.
  if (!state.maxRolls) state.maxRolls = DEFAULT_MAX_ROLLS;
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

// ---------- Theme ----------
initThemeControl(document.getElementById("btn-theme"));

// ---------- Fullscreen ----------
// Hidden entirely where the API is unavailable — notably Safari on iPhone,
// which only allows fullscreen for video — rather than offering a dead button.
const btnFullscreen = document.getElementById("btn-fullscreen");
const docEl = document.documentElement;
const requestFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
const exitFs = document.exitFullscreen || document.webkitExitFullscreen;

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

const fullscreenLabel = btnFullscreen.querySelector(".btn-label");

function syncFullscreenButton() {
  const on = Boolean(fullscreenElement());
  const text = on ? "Afslut fuld skærm" : "Fuld skærm";
  // The visible label is hidden on narrow screens, so the accessible name has
  // to come from aria-label rather than the button's text.
  fullscreenLabel.textContent = text;
  btnFullscreen.setAttribute("aria-label", text);
  btnFullscreen.setAttribute("aria-pressed", String(on));
}

if (requestFs && exitFs) {
  btnFullscreen.hidden = false;
  syncFullscreenButton();
  btnFullscreen.addEventListener("click", async () => {
    try {
      if (fullscreenElement()) await exitFs.call(document);
      else await requestFs.call(docEl);
    } catch (err) {
      // A rejected request (permissions policy, iPad quirks) shouldn't leave the
      // label out of step with reality.
      console.error("Fuld skærm blev afvist", err);
    }
    syncFullscreenButton();
  });
  // Keep the label honest when the user leaves fullscreen with Esc or a gesture.
  document.addEventListener("fullscreenchange", syncFullscreenButton);
  document.addEventListener("webkitfullscreenchange", syncFullscreenButton);
}

// ---------- Rules dialog ----------
const rulesDialog = document.getElementById("rules-dialog");
const rulesContent = document.getElementById("rules-content");
document.getElementById("btn-rules").addEventListener("click", () => {
  const variant = state ? state.variant : Number(document.querySelector('input[name="variant"]:checked').value);
  const rolls = state ? state.maxRolls : Number(document.querySelector('input[name="rolls"]:checked').value);
  const { upper, lower, bonusThreshold, bonusPoints } = getRuleset(variant);
  // Odds depend on how many rolls a turn gets, so they follow the setting.
  const odds = oddsFor(variant, rolls);
  const parCount = bonusParPerFace(variant);

  const rows = lower
    .map((cat) => {
      const p = odds[cat.key];
      const chance = formatOdds(p, cat.key);
      const freq = formatFrequency(p);
      return `<tr>
        <td>${cat.label}</td>
        <td class="odds-value">${chance}${freq ? ` <span class="odds-freq">${freq}</span>` : ""}</td>
      </tr>`;
    })
    .join("");

  rulesContent.innerHTML = `
    <h3>${variant} terninger</h3>
    <p>Op til ${rolls} kast pr. tur.${rolls === 3 ? "" : " (Valgt ved spilstart – de officielle regler bruger 3.)"}</p>
    <p><strong>Øvre sektion:</strong> ${upper.map((c) => c.label).join(", ")}</p>
    <p><strong>Bonus:</strong> ${bonusPoints} point hvis øvre sektion når ${bonusThreshold} i alt.${
      parCount
        ? ` Det svarer præcis til <strong>${parCount} af hver værdi</strong> – ${parCount} ettere (${parCount}), ${parCount} toere (${parCount * 2}), og så videre op til ${parCount} seksere (${parCount * 6}). Får du flere end ${parCount} af en værdi, har du et forspring til at hente en anden.`
        : ""
    }</p>
    <h4>Nedre sektion – hvor svær er posten?</h4>
    <table class="odds-table">
      <tr><th>Post</th><th>Chance pr. tur</th></tr>
      ${rows}
    </table>
    <p class="odds-note">Chancen er sandsynligheden for at få point i posten, hvis du spiller efter den:
    ${rolls} kast, hvor du beholder de terninger der tjener målet. Beregnet ved simulering af 200.000 ture
    med spillets egne pointregler, så tallene er vejledende – ikke en garanti.</p>
    <p>Du kan altid vælge at <em>stryge</em> en post i stedet for at bruge kastet – den post får 0 point.</p>
  `;
  rulesDialog.hidden = false;
  // The panel scrolls now that it carries the odds table, and the element is
  // reused between openings — without this it reopens wherever it was left.
  // Must come after unhiding: scrollTop is ignored on a display:none element.
  const dialogBox = rulesDialog.querySelector(".dialog");
  if (dialogBox) dialogBox.scrollTop = 0;
});
document.getElementById("btn-close-rules").addEventListener("click", () => { rulesDialog.hidden = true; });

showScreen("setup");
