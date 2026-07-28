function currentTally(dice) {
  const t = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  dice.forEach((v) => { if (v >= 1 && v <= 6) t[v]++; });
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
  intro.textContent = "Kast dine fysiske terninger. Tag evt. et billede som hjælp, og tæl så øjnene op herunder for at få forslag til poster.";
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

  photoBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      thumb.src = reader.result;
      thumb.hidden = false;
    };
    reader.readAsDataURL(file);
  });

  wrap.appendChild(photoBtn);
  wrap.appendChild(fileInput);
  wrap.appendChild(thumb);

  const grid = document.createElement("div");
  grid.className = "tally-grid";
  const tally = currentTally(state.dice);

  for (let face = 1; face <= 6; face++) {
    const cell = document.createElement("div");
    cell.className = "tally-cell";

    const label = document.createElement("div");
    label.className = "tally-face";
    label.textContent = `⚀⚁⚂⚃⚄⚅`[face - 1] || String(face);
    cell.appendChild(label);

    const counter = document.createElement("div");
    counter.className = "tally-counter";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "−";
    minus.addEventListener("click", () => {
      if (decrementFace(state.dice, face)) {
        renderPhysicalDice(container, state, { onChange });
        onChange();
      }
    });

    const count = document.createElement("span");
    count.textContent = tally[face];

    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.disabled = totalSet(state.dice) >= state.variant;
    plus.addEventListener("click", () => {
      if (incrementFace(state.dice, face)) {
        renderPhysicalDice(container, state, { onChange });
        onChange();
      }
    });

    counter.appendChild(minus);
    counter.appendChild(count);
    counter.appendChild(plus);
    cell.appendChild(counter);
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);

  const total = totalSet(state.dice);
  const totalLine = document.createElement("div");
  totalLine.className = "tally-total" + (total === state.variant ? " ok" : "");
  totalLine.textContent = `${total} af ${state.variant} terninger talt op` + (total === state.variant ? " ✓" : "");
  wrap.appendChild(totalLine);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "btn btn-ghost btn-small";
  resetBtn.textContent = "Nulstil optælling";
  resetBtn.style.marginTop = "0.5rem";
  resetBtn.addEventListener("click", () => {
    state.dice = new Array(state.variant).fill(0);
    thumb.hidden = true;
    renderPhysicalDice(container, state, { onChange });
    onChange();
  });
  wrap.appendChild(resetBtn);

  container.appendChild(wrap);
}
