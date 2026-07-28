import { computeTotal } from "./rules.js";

function rankPlayers(state) {
  const ranked = state.players
    .map((p) => ({ player: p, total: computeTotal(state.variant, p.scores) }))
    .sort((a, b) => b.total - a.total);

  let rank = 0;
  let lastTotal = null;
  ranked.forEach((entry, i) => {
    if (entry.total !== lastTotal) rank = i + 1;
    entry.rank = rank;
    lastTotal = entry.total;
  });
  return ranked;
}

export function renderPodium(podiumEl, tableEl, state) {
  const ranked = rankPlayers(state);
  const top3 = ranked.slice(0, 3);

  podiumEl.innerHTML = "";
  const order = [1, 0, 2]; // silver, gold, bronze visual order
  const classes = ["silver", "gold", "bronze"];
  const medal = ["🥈", "🥇", "🥉"];

  order.forEach((entryIndex, slot) => {
    const entry = top3[entryIndex];
    if (!entry) return;
    const div = document.createElement("div");
    div.className = "podium-slot";
    div.innerHTML = `
      <div class="podium-name">${medal[slot]} ${entry.player.name}</div>
      <div class="podium-score">${entry.total} point</div>
      <div class="podium-bar ${classes[slot]}">${entry.rank}</div>
    `;
    podiumEl.appendChild(div);
  });

  tableEl.innerHTML = "";
  const table = document.createElement("table");
  const head = document.createElement("tr");
  head.innerHTML = "<th>#</th><th>Spiller</th><th>Point</th>";
  table.appendChild(head);
  ranked.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${entry.rank}</td><td>${entry.player.name}</td><td>${entry.total}</td>`;
    table.appendChild(tr);
  });
  tableEl.appendChild(table);
}
