// Theme preference: an explicit light or dark choice, or follow the device.
//
// The stored value is the *preference*, while the data-theme attribute always
// carries the *resolved* theme — so the stylesheet never has to know about
// "auto". An inline script in the document head applies the same resolution
// before first paint, which is what stops a light flash on a dark device.

export const THEME_KEY = "yatzy.theme";
const MODES = ["auto", "light", "dark"];

const LABELS = {
  auto: "Tema: følger enheden",
  light: "Tema: lyst",
  dark: "Tema: mørkt",
};
const GLYPHS = { auto: "◐", light: "☀", dark: "☾" };

// Matches the sticky header, so the browser's own chrome blends into the page
// rather than sitting on it as a stripe.
const BROWSER_CHROME = { light: "#ffffff", dark: "#24201a" };

function darkQuery() {
  return window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
}

export function storedPreference() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return MODES.includes(value) ? value : "auto";
  } catch (err) {
    return "auto"; // private mode with storage denied
  }
}

function resolve(preference) {
  if (preference === "light" || preference === "dark") return preference;
  const q = darkQuery();
  return q && q.matches ? "dark" : "light";
}

function apply(preference) {
  const theme = resolve(preference);
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", BROWSER_CHROME[theme]);
  return theme;
}

// Wires up a button that cycles auto → light → dark. Returns nothing; the
// button's own label reports the current state.
export function initThemeControl(button) {
  let preference = storedPreference();

  function refresh() {
    apply(preference);
    if (!button) return;
    button.querySelector(".btn-icon").textContent = GLYPHS[preference];
    button.setAttribute("aria-label", LABELS[preference]);
    button.title = LABELS[preference];
  }

  refresh();

  if (button) {
    button.addEventListener("click", () => {
      preference = MODES[(MODES.indexOf(preference) + 1) % MODES.length];
      try {
        localStorage.setItem(THEME_KEY, preference);
      } catch (err) {
        console.error("Temavalg kunne ikke gemmes", err);
      }
      refresh();
    });
  }

  // Follow the device live, but only while that is what was asked for.
  const q = darkQuery();
  if (q) {
    const onChange = () => {
      if (preference === "auto") refresh();
    };
    if (typeof q.addEventListener === "function") q.addEventListener("change", onChange);
    else if (typeof q.addListener === "function") q.addListener(onChange); // older Safari
  }
}
