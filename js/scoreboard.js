import {
  getRuleset,
  suggestCategories,
  computeUpperBonus,
  computeTotal,
  bonusParPerFace,
  fixedScoreFor,
} from "./rules.js";
import { currentPlayer } from "./game.js";

// How far a score sits above or below the bonus target, in words — short enough
// to stay on one line on a phone.
function describeDelta(delta) {
  if (delta === 0) return "præcis på mål";
  return delta > 0 ? `${delta} over mål` : `${Math.abs(delta)} under mål`;
}

export function renderCurrentScorecard(container, state, diceReady, { onApply, onStrike }) {
  container.innerHTML = "";
  const player = currentPlayer(state);
  const { upper, lower, bonusThreshold, bonusPoints } = getRuleset(state.variant);
  const suggestions = suggestCategories(state.variant, state.dice, player.scores);
  const suggestionMap = Object.fromEntries(suggestions.map((s) => [s.key, s.score]));
  // With physical dice a flat-scoring category is claimed outright, so show
  // what it will actually award rather than 0 for an empty tally.
  if (state.mode === "physical") {
    for (const key of Object.keys(suggestionMap)) {
      const fixed = fixedScoreFor(state.variant, key);
      if (fixed !== null) suggestionMap[key] = fixed;
    }
  }
  const openScores = Object.values(suggestionMap);
  const maxScore = openScores.length ? Math.max(...openScores) : 0;
  // How many of each face the bonus works out to, e.g. 4 of each for 84.
  const parCount = bonusParPerFace(state.variant);

  const table = document.createElement("table");
  table.className = "score-table";

  function addSectionDivider(label) {
    const tr = document.createElement("tr");
    tr.className = "section-divider";
    const td = document.createElement("td");
    td.colSpan = 3;
    td.textContent = label;
    tr.appendChild(td);
    table.appendChild(tr);
  }

  function addCategoryRow(cat) {
    const tr = document.createElement("tr");
    const filled = player.scores[cat.key] !== null;
    tr.className = "score-row " + (filled ? "filled" : "open");

    const nameTd = document.createElement("td");
    nameTd.textContent = cat.label;
    if (filled && player.struck.includes(cat.key)) {
      const tag = document.createElement("span");
      tag.className = "tag-struck";
      tag.textContent = " (streget)";
      nameTd.appendChild(tag);
    }
    // Spell out what this row needs for the bonus: the count of that face, and
    // the points it comes to. Filled rows say how far off that target they are.
    const par = cat.section === "upper" && parCount ? parCount * cat.face : null;
    if (par !== null) {
      const hint = document.createElement("span");
      hint.className = "par-hint";
      if (filled) {
        // The target has served its purpose once the row is scored; what
        // matters now is only whether it helped or hurt the bonus.
        const delta = player.scores[cat.key] - par;
        hint.classList.add(delta >= 0 ? "par-over" : "par-under");
        hint.textContent = describeDelta(delta);
      } else {
        hint.textContent = `mål ${parCount} stk. = ${par}`;
      }
      nameTd.appendChild(hint);
    }
    tr.appendChild(nameTd);

    const scoreTd = document.createElement("td");
    if (filled) {
      scoreTd.textContent = player.scores[cat.key];
    } else {
      const s = suggestionMap[cat.key];
      scoreTd.textContent = diceReady ? s : "–";
      scoreTd.className = "suggestion-score";
      if (diceReady && s === maxScore && maxScore > 0) tr.classList.add("best");
    }
    tr.appendChild(scoreTd);

    // The buttons are laid out by an inner wrapper, never by the <td> itself:
    // display:flex on a table cell drops it out of the row's height
    // calculation, which leaves its bottom border misaligned with the others.
    const actionsTd = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "score-actions";
    actionsTd.appendChild(actions);
    if (!filled) {
      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.className = "btn btn-primary btn-small";
      applyBtn.textContent = "Vælg";
      applyBtn.disabled = !diceReady;
      applyBtn.addEventListener("click", () => onApply(cat.key));
      actions.appendChild(applyBtn);

      const strikeBtn = document.createElement("button");
      strikeBtn.type = "button";
      strikeBtn.className = "btn btn-strike btn-small";
      strikeBtn.textContent = "Stryg";
      strikeBtn.addEventListener("click", () => onStrike(cat.key));
      actions.appendChild(strikeBtn);
    }
    tr.appendChild(actionsTd);
    table.appendChild(tr);
  }

  addSectionDivider("Øvre sektion");
  upper.forEach(addCategoryRow);

  const { upperTotal, earned, bonus } = computeUpperBonus(state.variant, player.scores);
  const bonusTr = document.createElement("tr");
  bonusTr.className = "score-row filled";
  const bonusName = document.createElement("td");
  bonusName.textContent = `Bonus (ved ${bonusThreshold}+)`;
  if (parCount) {
    const hint = document.createElement("span");
    hint.className = "par-hint";
    hint.textContent = `${parCount} af hver værdi`;
    bonusName.appendChild(hint);
  }

  const bonusVal = document.createElement("td");
  if (earned) {
    bonusVal.textContent = `+${bonus}`;
  } else {
    bonusVal.textContent = `${upperTotal}/${bonusThreshold}`;
    // Running position against the target, counting only the rows already
    // filled — and a plain warning once the bonus is arithmetically out of
    // reach, so nobody keeps chasing it.
    const filledUpper = upper.filter((c) => player.scores[c.key] !== null);
    const stillOpen = upper.filter((c) => player.scores[c.key] === null);
    const ceiling = upperTotal + stillOpen.reduce((sum, c) => sum + state.variant * c.face, 0);
    const hint = document.createElement("span");
    hint.className = "par-hint";
    if (ceiling < bonusThreshold) {
      hint.classList.add("par-under");
      hint.textContent = "kan ikke nås";
    } else if (parCount && filledUpper.length) {
      const runningPar = filledUpper.reduce((sum, c) => sum + parCount * c.face, 0);
      const delta = upperTotal - runningPar;
      hint.classList.add(delta >= 0 ? "par-over" : "par-under");
      hint.textContent = describeDelta(delta);
    }
    if (hint.textContent) bonusVal.appendChild(hint);
  }
  bonusTr.appendChild(bonusName);
  bonusTr.appendChild(bonusVal);
  bonusTr.appendChild(document.createElement("td"));
  table.appendChild(bonusTr);

  addSectionDivider("Nedre sektion");
  lower.forEach(addCategoryRow);

  const totalTr = document.createElement("tr");
  totalTr.className = "score-row filled";
  const totalName = document.createElement("td");
  totalName.innerHTML = "<strong>Total</strong>";
  const totalVal = document.createElement("td");
  totalVal.innerHTML = `<strong>${computeTotal(state.variant, player.scores)}</strong>`;
  totalTr.appendChild(totalName);
  totalTr.appendChild(totalVal);
  totalTr.appendChild(document.createElement("td"));
  table.appendChild(totalTr);

  container.appendChild(table);
}

export function renderScoreboard(container, state) {
  container.innerHTML = "";
  const { upper, lower, bonusThreshold } = getRuleset(state.variant);
  const table = document.createElement("table");
  table.className = "scoreboard";

  const headRow = document.createElement("tr");
  headRow.appendChild(document.createElement("th"));
  state.players.forEach((p, i) => {
    const th = document.createElement("th");
    th.textContent = p.name;
    if (i === state.currentPlayerIndex && !state.gameOver) th.classList.add("active-player");
    headRow.appendChild(th);
  });
  table.appendChild(headRow);

  function addRow(label, valueFn) {
    const tr = document.createElement("tr");
    const th = document.createElement("td");
    th.textContent = label;
    tr.appendChild(th);
    state.players.forEach((p, i) => {
      const td = document.createElement("td");
      const html = valueFn(p);
      td.innerHTML = html;
      if (i === state.currentPlayerIndex && !state.gameOver) td.classList.add("active-col");
      tr.appendChild(td);
    });
    table.appendChild(tr);
  }

  function cellFor(p, key) {
    const v = p.scores[key];
    if (v === null) return "–";
    return p.struck.includes(key) ? `${v}<span class="tag-struck">×</span>` : String(v);
  }

  upper.forEach((cat) => addRow(cat.label, (p) => cellFor(p, cat.key)));
  addRow(`Bonus (${bonusThreshold}+)`, (p) => {
    const { earned, bonus } = computeUpperBonus(state.variant, p.scores);
    return earned ? `+${bonus}` : "–";
  });
  lower.forEach((cat) => addRow(cat.label, (p) => cellFor(p, cat.key)));

  const totalTr = document.createElement("tr");
  totalTr.className = "total-row";
  const totalHead = document.createElement("td");
  totalHead.textContent = "Total";
  totalTr.appendChild(totalHead);
  state.players.forEach((p, i) => {
    const td = document.createElement("td");
    td.textContent = computeTotal(state.variant, p.scores);
    if (i === state.currentPlayerIndex && !state.gameOver) td.classList.add("active-col");
    totalTr.appendChild(td);
  });
  table.appendChild(totalTr);

  container.appendChild(table);
}
