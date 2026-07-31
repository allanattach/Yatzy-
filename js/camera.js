import { detectDice } from "./dice-vision.js";

function currentTally(dice) {
  const t = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  dice.forEach((v) => {
    if (v >= 1 && v <= 6) t[v]++;
  });
  return t;
}

function totalSet(dice) {
  return dice.filter((v) => v > 0).length;
}

function incrementFace(dice, face) {
  const idx = dice.indexOf(0);
  if (idx === -1) return false;
  dice[idx] = face;
  return true;
}

function decrementFace(dice, face) {
  const idx = dice.lastIndexOf(face);
  if (idx === -1) return false;
  dice[idx] = 0;
  return true;
}

export function isPhysicalReadingComplete(state) {
  return totalSet(state.dice) === state.variant;
}

export function renderPhysicalDice(container, state, { onChange }) {
  container.hidden = false;
  container.innerHTML = "";

  const wrap = document.createElement("div");

  const intro = document.createElement("p");
  intro.className = "hold-hint";
  intro.textContent =
    "Kast dine fysiske terninger og tag et billede – appen tæller selv øjnene op. " +
    "Du behøver kun de terninger, posten bruger, og faste poster som straights og Yatzy kræver ingen.";
  wrap.appendChild(intro);

  const photoBtn = document.createElement("button");
  photoBtn.type = "button";
  photoBtn.className = "btn btn-ghost";
  photoBtn.textContent = "📷 Tag billede";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.capture = "environment";
  fileInput.hidden = true;

  const thumb = document.createElement("img");
  thumb.className = "photo-thumb";
  thumb.hidden = true;

  const status = document.createElement("p");
  status.className = "scan-status";
  status.hidden = true;

  function setStatus(text, kind) {
    status.hidden = !text;
    status.className = "scan-status" + (kind ? ` scan-${kind}` : "");
    status.textContent = text;
  }

  photoBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      thumb.src = reader.result;
      thumb.hidden = false;
    };
    reader.readAsDataURL(file);

    setStatus("Læser terningerne …", null);
    try {
      const result = await detectDice(file, state.variant);
      if (result.complete) {
        state.dice = result.values.slice().sort((a, b) => a - b);
        refreshTally();
        setStatus(
          `Læste ${result.values.length} terninger: ${state.dice.join(", ")}. Ret herunder, hvis noget er læst forkert.`,
          "ok"
        );
        onChange();
        return;
      }
      setStatus(
        result.found
          ? `Kunne kun læse ${result.found} af ${state.variant} terninger sikkert – tæl op herunder i stedet.`
          : "Kunne ikke genkende terningerne – tæl op herunder i stedet. Et billede lige ovenfra, med god belysning og terninger der ikke rører hinanden, virker bedst.",
        "warn"
      );
    } catch (err) {
      console.error("Terningegenkendelse fejlede", err);
      setStatus("Billedet kunne ikke analyseres – tæl op herunder i stedet.", "warn");
    }
  });

  wrap.appendChild(photoBtn);
  wrap.appendChild(fileInput);
  wrap.appendChild(thumb);
  wrap.appendChild(status);

  // The tally is built once and updated in place. Rebuilding the whole panel on
  // every change would throw away the photo and the scan message along with it.
  const grid = document.createElement("div");
  grid.className = "tally-grid";
  const countEls = {};
  const plusEls = {};

  for (let face = 1; face <= 6; face++) {
    const cell = document.createElement("div");
    cell.className = "tally-cell";

    const label = document.createElement("div");
    label.className = "tally-face";
    label.textContent = "⚀⚁⚂⚃⚄⚅"[face - 1] || String(face);
    cell.appendChild(label);

    const counter = document.createElement("div");
    counter.className = "tally-counter";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "−";
    minus.setAttribute("aria-label", `Én mindre med ${face}`);
    minus.addEventListener("click", () => {
      if (decrementFace(state.dice, face)) {
        refreshTally();
        onChange();
      }
    });

    const count = document.createElement("span");
    countEls[face] = count;

    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", `Én mere med ${face}`);
    plus.addEventListener("click", () => {
      if (incrementFace(state.dice, face)) {
        refreshTally();
        onChange();
      }
    });
    plusEls[face] = plus;

    counter.appendChild(minus);
    counter.appendChild(count);
    counter.appendChild(plus);
    cell.appendChild(counter);
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);

  const totalLine = document.createElement("div");
  wrap.appendChild(totalLine);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "btn btn-ghost btn-small";
  resetBtn.textContent = "Nulstil optælling";
  resetBtn.style.marginTop = "0.5rem";
  resetBtn.addEventListener("click", () => {
    state.dice = new Array(state.variant).fill(0);
    thumb.hidden = true;
    thumb.removeAttribute("src");
    setStatus("", null);
    refreshTally();
    onChange();
  });
  wrap.appendChild(resetBtn);

  function refreshTally() {
    const tally = currentTally(state.dice);
    const total = totalSet(state.dice);
    for (let face = 1; face <= 6; face++) {
      countEls[face].textContent = tally[face];
      plusEls[face].disabled = total >= state.variant;
    }
    totalLine.className = "tally-total" + (total === state.variant ? " ok" : "");
    totalLine.textContent =
      `${total} af ${state.variant} terninger talt op` + (total === state.variant ? " ✓" : "");
  }

  refreshTally();
  container.appendChild(wrap);
}
