import { getRuleset, suggestCategories, computeUpperBonus, computeTotal } from "./rules.js";
import { currentPlayer } from "./game.js";

export function renderCurrentScorecard(container, state, diceReady, { onApply, onStrike }) {
  container.innerHTML = "";
  const player = currentPlayer(state);
  const { upper, lower, bonusThreshold, bonusPoints } = getRuleset(state.variant);
  const suggestions = suggestCategories(state.variant, state.dice, player.scores);
  const suggestionMap = Object.fromEntries(suggestions.map((s) => [s.key, s.score]));
  const maxScore = suggestions.length ? Math.max(...suggestions.map((s) => s.score)) : 0;

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

    const actionsTd = document.createElement("td");
    actionsTd.className = "score-actions";
    if (!filled) {
      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.className = "btn btn-primary btn-small";
      applyBtn.textContent = "Vælg";
      applyBtn.disabled = !diceReady;
      applyBtn.addEventListener("click", () => onApply(cat.key));
      actionsTd.appendChild(applyBtn);

      const strikeBtn = document.createElement("button");
      strikeBtn.type = "button";
      strikeBtn.className = "btn btn-strike btn-small";
      strikeBtn.textContent = "Stryg";
      strikeBtn.addEventListener("click", () => onStrike(cat.key));
      actionsTd.appendChild(strikeBtn);
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
  const bonusVal = document.createElement("td");
  bonusVal.textContent = earned ? `+${bonus}` : `${upperTotal}/${bonusThreshold}`;
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
