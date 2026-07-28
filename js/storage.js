const STORAGE_KEY = "yatzy.game.v1";

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Kunne ikke gemme spillets tilstand", err);
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Kunne ikke indlæse gemt spil", err);
    return null;
  }
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
