import { rollDice, toggleHold } from "./game.js";

const PIP_PATTERNS = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function dieFace(value, { held, clickable, justRolled } = {}) {
  const die = document.createElement("div");
  die.className = "die" + (held ? " held" : "") + (justRolled ? " rolling" : "");
  die.style.cursor = clickable ? "pointer" : "default";
  const on = new Set(PIP_PATTERNS[value] || []);
  for (let i = 0; i < 9; i++) {
    const pip = document.createElement("div");
    pip.className = "pip" + (on.has(i) ? " on" : "");
    die.appendChild(pip);
  }
  return die;
}

export function renderVirtualDice(container, state, { onChange }) {
  container.hidden = false;
  container.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "cup-wrap";

  const cup = document.createElement("div");
  cup.className = "cup";
  wrap.appendChild(cup);

  const diceRow = document.createElement("div");
  diceRow.className = "dice-row";
  const rollsLeft = state.maxRolls - state.rollsUsed;
  const canRoll = !state.gameOver && rollsLeft > 0;

  state.dice.forEach((value, i) => {
    const clickable = state.rollsUsed > 0 && rollsLeft > 0 && !state.gameOver;
    const die = dieFace(value, { held: state.held[i], clickable });
    if (clickable) {
      die.addEventListener("click", () => {
        toggleHold(state, i);
        onChange();
      });
    }
    diceRow.appendChild(die);
  });
  wrap.appendChild(diceRow);

  const hint = document.createElement("div");
  hint.className = "hold-hint";
  hint.textContent = state.rollsUsed > 0 ? "Klik på en terning for at beholde/frigive den til næste kast." : "Klik på bægeret for at kaste alle terninger.";
  wrap.appendChild(hint);

  const controls = document.createElement("div");
  controls.className = "roll-controls";

  const rollBtn = document.createElement("button");
  rollBtn.className = "btn btn-primary";
  rollBtn.type = "button";
  rollBtn.disabled = !canRoll;
  rollBtn.textContent = state.rollsUsed === 0 ? "Kast terninger" : `Kast igen (${rollsLeft} tilbage)`;
  rollBtn.addEventListener("click", () => {
    if (!canRoll) return;
    rollBtn.disabled = true;
    cup.classList.add("shaking");
    setTimeout(() => {
      cup.classList.remove("shaking");
      rollDice(state);
      renderVirtualDice(container, state, { onChange });
      Array.from(container.querySelectorAll(".die")).forEach((el, i) => {
        if (!state.held[i]) el.classList.add("rolling");
      });
      onChange();
    }, 550);
  });
  controls.appendChild(rollBtn);
  wrap.appendChild(controls);

  container.appendChild(wrap);
}
