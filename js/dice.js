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

const SHAKE_MS = 900; // how long the cup rattles before it is tipped
const POUR_LEAD_MS = 150; // head start the cup gets before the dice spill out
const FLICKER_MS = 70; // how fast faces change while a die is airborne

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function randomFace() {
  return 1 + Math.floor(Math.random() * 6);
}

// Repaints an existing die in place, so a die can change face mid-flight
// without being torn out of the DOM (which would restart its animation).
function paintFace(die, value) {
  const on = new Set(PIP_PATTERNS[value] || []);
  die.querySelectorAll(".pip").forEach((pip, i) => {
    pip.classList.toggle("on", on.has(i));
  });
}

function dieFace(value, { held, clickable } = {}) {
  const die = document.createElement("div");
  die.className = "die" + (held ? " held" : "");
  die.style.cursor = clickable ? "pointer" : "default";
  for (let i = 0; i < 9; i++) {
    const pip = document.createElement("div");
    pip.className = "pip";
    die.appendChild(pip);
  }
  paintFace(die, value);
  return die;
}

// Guards against a second throw (or a hold toggle) landing mid-animation.
let rolling = false;

export function renderVirtualDice(container, state, { onChange }) {
  container.hidden = false;
  container.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "cup-wrap";

  const stage = document.createElement("div");
  stage.className = "cup-stage";
  const cup = document.createElement("div");
  cup.className = "cup";
  stage.appendChild(cup);
  wrap.appendChild(stage);

  const rollsLeft = state.maxRolls - state.rollsUsed;
  const canRoll = !state.gameOver && rollsLeft > 0 && !rolling;
  const clickable = state.rollsUsed > 0 && rollsLeft > 0 && !state.gameOver && !rolling;

  // Before the first throw the dice are still inside the cup, so they are kept
  // in the DOM (the throw animates them) but hidden rather than shown blank.
  const stowed = state.rollsUsed === 0;

  const diceRow = document.createElement("div");
  diceRow.className = "dice-row";
  const dieEls = state.dice.map((value, i) => {
    const die = dieFace(value, { held: state.held[i], clickable });
    if (stowed) die.classList.add("stowed");
    if (clickable) {
      die.addEventListener("click", () => {
        if (rolling) return;
        toggleHold(state, i);
        renderVirtualDice(container, state, { onChange });
        onChange();
      });
    }
    diceRow.appendChild(die);
    return die;
  });
  wrap.appendChild(diceRow);

  const shadow = document.createElement("div");
  shadow.className = "dice-shadow" + (stowed ? " stowed" : "");
  wrap.appendChild(shadow);

  const hint = document.createElement("div");
  hint.className = "hold-hint";
  hint.textContent =
    state.rollsUsed > 0
      ? "Klik på en terning for at beholde/frigive den til næste kast."
      : "Ryst bægeret og kast alle terninger.";
  wrap.appendChild(hint);

  const controls = document.createElement("div");
  controls.className = "roll-controls";

  const rollBtn = document.createElement("button");
  rollBtn.className = "btn btn-primary";
  rollBtn.type = "button";
  rollBtn.disabled = !canRoll;
  rollBtn.textContent =
    state.rollsUsed === 0 ? "Ryst og kast" : `Kast igen (${rollsLeft} tilbage)`;
  rollBtn.addEventListener("click", throwDice);
  controls.appendChild(rollBtn);
  wrap.appendChild(controls);

  container.appendChild(wrap);

  async function throwDice() {
    if (rolling || !canRoll) return;
    rolling = true;
    rollBtn.disabled = true;
    document.body.classList.add("dice-rolling");

    const flickers = [];
    try {
      if (prefersReducedMotion()) {
        rollDice(state);
        return;
      }

      const airborne = state.dice.map((_, i) => i).filter((i) => !state.held[i]);
      // Tighten the stagger for the 12-dice variant, or the throw drags on.
      const stagger = airborne.length > 6 ? 0.04 : 0.08;

      cup.classList.add("shaking");
      await sleep(SHAKE_MS);
      cup.classList.remove("shaking");

      cup.classList.add("pouring");
      await sleep(POUR_LEAD_MS);

      rollDice(state);
      shadow.classList.remove("stowed");

      let lastSettle = 0;
      airborne.forEach((idx, n) => {
        const die = dieEls[idx];
        if (!die) return;
        die.classList.remove("stowed");

        // Alternate which side of the cup mouth each die spills from, and give
        // every die its own arc and airtime so the throw never looks canned.
        const fx = (n % 2 === 0 ? -1 : 1) * (34 + Math.random() * 54);
        // Whole turns only, so a die comes to rest upright and the later
        // re-render can't visibly snap its rotation.
        const spin = 360 * (1 + Math.floor(Math.random() * 3));
        const dur = 0.6 + Math.random() * 0.26;
        const delay = n * stagger;

        die.style.setProperty("--fx", `${fx.toFixed(0)}px`);
        die.style.setProperty("--spin", `${spin}deg`);
        die.style.setProperty("--dur", `${dur.toFixed(2)}s`);
        die.style.setProperty("--delay", `${delay.toFixed(2)}s`);
        die.classList.add("tumbling");

        const flicker = setInterval(() => paintFace(die, randomFace()), FLICKER_MS);
        flickers.push(flicker);

        const settleAt = (delay + dur) * 1000;
        lastSettle = Math.max(lastSettle, settleAt);
        setTimeout(() => {
          clearInterval(flicker);
          paintFace(die, state.dice[idx]);
          die.classList.remove("tumbling");
          die.classList.add("landed");
        }, Math.max(0, settleAt - FLICKER_MS));
      });

      await sleep(lastSettle + 180);
    } finally {
      flickers.forEach(clearInterval);
      rolling = false;
      document.body.classList.remove("dice-rolling");
      renderVirtualDice(container, state, { onChange });
      onChange();
    }
  }
}
