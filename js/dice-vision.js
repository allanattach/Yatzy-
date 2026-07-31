// Counts pips on photographed dice, entirely in the browser: no model file, no
// service, no API key — a static site can't hold a secret, and this has to work
// offline.
//
// The approach is deliberately classical rather than learned:
//   1. Downscale and grayscale the photo.
//   2. Otsu threshold to split light from dark — and, because one cut is not
//      enough under a table lamp, split each side of it again to get a ladder
//      of thresholds to try.
//   3. Treat dice bodies as blobs of one polarity, pips as blobs of the other
//      inside them. Both polarities are tried (light dice with dark pips, and
//      dark dice with light pips) and the more plausible reading wins.
//   4. Count pips on every shape that could be a die, cut apart the blobs that
//      measure a whole number of dice, and keep the group whose sizes agree and
//      whose positions sit together — we know how many dice to expect, which is
//      a strong constraint.
//   5. Only trust a full reading that survives being cut at other thresholds.
//
// It is best-effort by nature: contrast, shadows, motion blur and dice touching
// each other all degrade it. Callers must treat the result as a suggestion to be
// confirmed, never as truth.

// Dice can occupy a small part of a wide phone photo, so there has to be enough
// resolution left for their pips after downscaling.
const WORK_WIDTH = 1000;

function toGray(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Rec. 601 luma; pips are a brightness feature, colour adds nothing here.
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return { gray, width, height };
}

// Otsu: pick the threshold that maximises between-class variance. Restricting
// it to a slice of the range runs the same split again inside one class, which
// is how white dice get separated from a merely bright table.
function otsuThreshold(gray, lo = 0, hi = 255) {
  const hist = new Array(256).fill(0);
  let total = 0;
  for (const v of gray) {
    if (v < lo || v > hi) continue;
    hist[v]++;
    total++;
  }
  if (total === 0) return Math.round((lo + hi) / 2);
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = Math.round((lo + hi) / 2);
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

// Iterative flood fill (a recursive one blows the stack on photo-sized blobs).
function labelBlobs(mask, width, height, wanted) {
  const labels = new Int32Array(width * height).fill(-1);
  const blobs = [];
  const stack = [];

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== wanted || labels[start] !== -1) continue;
    const id = blobs.length;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let area = 0;

    stack.push(start);
    labels[start] = id;
    while (stack.length) {
      const p = stack.pop();
      const x = p % width;
      const y = (p - x) / width;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0) { const n = p - 1; if (mask[n] === wanted && labels[n] === -1) { labels[n] = id; stack.push(n); } }
      if (x < width - 1) { const n = p + 1; if (mask[n] === wanted && labels[n] === -1) { labels[n] = id; stack.push(n); } }
      if (y > 0) { const n = p - width; if (mask[n] === wanted && labels[n] === -1) { labels[n] = id; stack.push(n); } }
      if (y < height - 1) { const n = p + width; if (mask[n] === wanted && labels[n] === -1) { labels[n] = id; stack.push(n); } }
    }

    blobs.push({ id, area, minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return { labels, blobs };
}

function isPlausibleDie(blob, imageArea) {
  const { w, h, area } = blob;
  if (w < 18 || h < 18) return false; // too small to read pips from
  const ratio = w / h;
  if (ratio < 0.55 || ratio > 1.8) return false; // dice photograph roughly square
  // The pips are holes in this blob, so a six-spot face is far from solid, and a
  // rotated die brings background corners into its box. Real photos measure
  // around 0.46 here — the original 0.55 threshold rejected most of a throw.
  const fill = area / (w * h);
  if (fill < 0.33) return false;
  const share = area / imageArea;
  return share > 0.0006 && share < 0.35;
}

// Shrinks the mask by one pixel. Dice that merely touch are joined by a thin
// bridge, which a couple of passes breaks — separating them without noticeably
// moving the dice themselves.
function erode(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!mask[p]) continue;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) continue;
      if (mask[p - 1] && mask[p + 1] && mask[p - width] && mask[p + width]) out[p] = 1;
    }
  }
  return out;
}

// Counts pips inside one die. Pips are the opposite polarity to the die body,
// which means they are *holes* in the die's own blob — so they must be found by
// looking at the raw pixels in the die's box, not by walking the die's blob.
//
// The discriminator is enclosure: a pip is a pip-coloured region that does not
// touch the edge of the box. Background bleeding in at the corners of a rotated
// die, and shadow along an edge, both touch the border and are rejected.
function countPips(gray, width, height, dieBlob, pipIsDark, threshold) {
  const { minX, minY, w, h } = dieBlob;
  const inset = Math.max(1, Math.round(Math.min(w, h) * 0.06));
  const x0 = Math.max(0, minX + inset);
  const y0 = Math.max(0, minY + inset);
  const x1 = Math.min(width, minX + w - inset);
  const y1 = Math.min(height, minY + h - inset);
  const boxW = x1 - x0;
  const boxH = y1 - y0;
  if (boxW < 6 || boxH < 6) return null;

  // Threshold within the die rather than against the whole photo. A pip is dark
  // relative to its own face, which holds under a lamp on one side of the table
  // and shade on the other — a single global cut does not.
  const patch = new Uint8ClampedArray(boxW * boxH);
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      patch[y * boxW + x] = gray[(y0 + y) * width + (x0 + x)];
    }
  }
  const localThreshold = otsuThreshold(patch);
  // Fall back to the global cut if this patch has no real split of its own
  // (a blank face has nothing to separate, and Otsu would invent a boundary).
  let min = 255;
  let max = 0;
  for (const v of patch) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const cut = max - min > 40 ? localThreshold : threshold;

  const sub = new Uint8Array(boxW * boxH);
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const isDark = patch[y * boxW + x] < cut;
      sub[y * boxW + x] = (pipIsDark ? isDark : !isDark) ? 1 : 0;
    }
  }

  const { blobs } = labelBlobs(sub, boxW, boxH, 1);
  // Sized against the die's box rather than its blob area: the blob shrinks
  // when the face carries many pips, which would otherwise move the goalposts.
  const boxArea = dieBlob.w * dieBlob.h;
  const pips = blobs.filter((b) => {
    // Enclosed by the die face, rather than leaking in from outside it.
    if (b.minX === 0 || b.minY === 0 || b.maxX === boxW - 1 || b.maxY === boxH - 1) return false;
    const rel = b.area / boxArea;
    if (rel < 0.004 || rel > 0.09) return false; // pips occupy a narrow size band
    const ratio = b.w / b.h;
    if (ratio < 0.45 || ratio > 2.2) return false;
    const fill = b.area / (b.w * b.h);
    return fill > 0.45; // pips are round and solid
  });
  return pips.length;
}

// Dice resting against each other share a whole edge, which erosion won't part.
// Such a blob is a multiple of a single die's area, so it can be cut into that
// many boxes along its longer axis — enough to read each face separately. The
// reference is what one die measures in this photo, taken from the dice already
// identified rather than guessed from the blob mix.
//
// The candidates deliberately come from every blob rather than from the ones
// that already look like a die: two dice side by side are twice as long as they
// are wide, which is exactly the shape the squareness test throws away.
function splitClumpsAgainst(blobs, reference, expected) {
  if (!reference) return [];
  const out = [];
  for (const blob of blobs) {
    if (blob.w < 18 || blob.h < 18) continue;
    if (blob.area / (blob.w * blob.h) < 0.33) continue;
    const multiple = blob.area / reference;
    const k = Math.round(multiple);
    // Only blobs that measure close to a whole number of dice are cut; a blob
    // half a die too big is a die with a shadow, not two dice.
    if (k < 2 || k > expected || Math.abs(multiple - k) > 0.3) continue;
    const horizontal = blob.w >= blob.h;
    const span = horizontal ? blob.w : blob.h;
    const across = horizontal ? blob.h : blob.w;
    const step = span / k;
    // A row of k dice is k times as long as it is deep. Blobs that are already
    // die-shaped are cut on the strength of their area alone (dice can overlap
    // at an angle); the elongated ones have to look like an actual row.
    const squarish = blob.w / blob.h >= 0.55 && blob.w / blob.h <= 1.8;
    if (!squarish && (step / across < 0.6 || step / across > 1.7)) continue;
    for (let i = 0; i < k; i++) {
      out.push({
        minX: horizontal ? Math.round(blob.minX + i * step) : blob.minX,
        minY: horizontal ? blob.minY : Math.round(blob.minY + i * step),
        w: horizontal ? Math.round(step) : blob.w,
        h: horizontal ? blob.h : Math.round(step),
        area: Math.round(blob.area / k),
        split: true,
      });
    }
  }
  return out;
}

// Real dice in one photograph are all the same size, so the right answer is the
// group of candidates whose sizes agree — not the biggest shapes in frame. In a
// cluttered room the biggest bright shapes are place mats and tiles, and the
// dice are among the smallest things there.
const MAX_SIZE_SPREAD = 2.2; // biggest vs smallest die in one throw
const MAX_SCATTER = 7; // how far a throw may spread, in die widths

// A throw also lands together, so candidates scattered across the whole frame
// are not one set of dice however similar their sizes.
function withinReach(window) {
  const widths = window.map((d) => d.box.w);
  const median = widths.slice().sort((a, b) => a - b)[Math.floor(widths.length / 2)];
  const minX = Math.min(...window.map((d) => d.box.minX));
  const maxX = Math.max(...window.map((d) => d.box.minX + d.box.w));
  const minY = Math.min(...window.map((d) => d.box.minY));
  const maxY = Math.max(...window.map((d) => d.box.minY + d.box.h));
  return Math.hypot(maxX - minX, maxY - minY) <= median * MAX_SCATTER;
}

// How much of box a lies inside box b, as a fraction of a's own area.
function overlapFraction(a, b) {
  const x = Math.max(0, Math.min(a.minX + a.w, b.minX + b.w) - Math.max(a.minX, b.minX));
  const y = Math.max(0, Math.min(a.minY + a.h, b.minY + b.h) - Math.max(a.minY, b.minY));
  return (x * y) / Math.max(1, a.w * a.h);
}

// Two dice cannot occupy the same table. A clump and the slices cut out of it
// both stand as candidates, and this is what stops a set from counting the same
// pixels twice — once whole and once in pieces.
function noneOverlap(window) {
  for (let i = 0; i < window.length; i++) {
    for (let j = i + 1; j < window.length; j++) {
      if (overlapFraction(window[i].box, window[j].box) > 0.5) return false;
      if (overlapFraction(window[j].box, window[i].box) > 0.5) return false;
    }
  }
  return true;
}

function tightestWindow(sorted, size) {
  let best = null;
  let bestSpread = Infinity;
  for (let i = 0; i + size <= sorted.length; i++) {
    const window = sorted.slice(i, i + size);
    const spread = window[window.length - 1].box.area / Math.max(1, window[0].box.area);
    if (spread > MAX_SIZE_SPREAD || !withinReach(window) || !noneOverlap(window)) continue;
    if (spread < bestSpread) {
      bestSpread = spread;
      best = window;
    }
  }
  return best;
}

function pickConsistentSet(candidates, expected) {
  if (candidates.length <= expected) return candidates;
  const sorted = candidates.slice().sort((a, b) => a.box.area - b.box.area);
  return tightestWindow(sorted, expected) || [];
}

function readAtErosion(gray, width, height, mask, threshold, diceAreLight, expected, level) {
  const imageArea = width * height;
  const { blobs } = labelBlobs(mask, width, height, 1);

  // Erosion pulled outlines in; grow a box back so the outermost pips are
  // inside it again. A box cut out of a clump keeps its edges, since growing it
  // would reach into the neighbouring die.
  const read = (blob) => {
    const grow = blob.split ? 0 : level;
    const box = {
      minX: Math.max(0, blob.minX - grow),
      minY: Math.max(0, blob.minY - grow),
      w: blob.w + grow * 2,
      h: blob.h + grow * 2,
      area: blob.area,
    };
    return { value: countPips(gray, width, height, box, diceAreLight, threshold), box };
  };

  // Every plausible shape is read, not just the largest few — a die is
  // identified by carrying one to six pips, which is what tells it apart from a
  // place mat or a bright patch of table.
  const geometric = blobs.filter((b) => isPlausibleDie(b, imageArea));
  let dieLike = geometric.map(read).filter((d) => d.value >= 1 && d.value <= 6);

  if (dieLike.length > 0) {
    // Some dice may be fused even when the count already looks right: a blob
    // that is really two dice, plus a stray shape elsewhere in the frame, makes
    // up the number between them. Clumps are sized against what a single die
    // actually measures here. Both the smallest reading and the middle one are
    // tried, because when most of the throw has fused, the middle reading is
    // itself a clump and would measure two dice as one.
    const areas = dieLike.map((d) => d.box.area).sort((a, b) => a - b);
    const references = [...new Set([areas[0], areas[Math.floor(areas.length / 2)]])];
    const pieces = [];
    for (const reference of references) {
      for (const piece of splitClumpsAgainst(blobs, reference, expected)) {
        // The two references often cut the same clump the same way; keep one.
        if (pieces.some((p) => overlapFraction(piece, p) > 0.6)) continue;
        pieces.push(piece);
      }
    }
    // Whole clumps stay in the running alongside their slices — a blob read as
    // one die may be one die, and choosing between the two readings is what
    // the size-agreement step below is for.
    dieLike = dieLike.concat(pieces.map(read).filter((d) => d.value >= 1 && d.value <= 6));
  }

  const dice = pickConsistentSet(dieLike, expected) || [];
  return {
    diceAreLight,
    level,
    found: dice.length,
    valid: dice.length,
    values: dice.map((d) => d.value),
    boxes: dice.map((d) => d.box),
  };
}

function readWithPolarity(gray, width, height, threshold, diceAreLight, expected) {
  let mask = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const light = gray[i] >= threshold;
    mask[i] = (diceAreLight ? light : !light) ? 1 : 0;
  }

  // Dice that touch merge into one blob, so a single pass can't find them all.
  // Erode progressively and keep the level that reads the whole throw; the
  // expected dice count is what makes this decidable.
  let best = null;
  for (let level = 0; level <= 6; level++) {
    if (level > 0) mask = erode(mask, width, height);
    const reading = readAtErosion(gray, width, height, mask, threshold, diceAreLight, expected, level);
    if (!best || scoreReading(reading, expected) > scoreReading(best, expected)) best = reading;
    if (reading.found === expected && reading.valid === expected) break;
  }
  return best;
}

// Prefers the reading that finds the expected number of dice with every pip
// count in range; falls back to whichever got closest.
function scoreReading(reading, expected) {
  const complete = reading.found === expected ? 2 : 0;
  const allValid = reading.valid === reading.found && reading.found > 0 ? 2 : 0;
  return complete + allValid + reading.valid - Math.abs(reading.found - expected);
}

export async function detectDice(source, expected) {
  const bitmap = await loadBitmap(source);
  const scale = Math.min(1, WORK_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (typeof bitmap.close === "function") bitmap.close();

  const { gray } = toGray(ctx.getImageData(0, 0, width, height));
  const base = otsuThreshold(gray);

  const cache = new Map();
  function bestAt(t) {
    const key = Math.max(1, Math.min(254, Math.round(t)));
    if (cache.has(key)) return cache.get(key);
    // Light dice on a darker surface are the common case; the opposite polarity
    // is only worth its own full pass when that reading came up short.
    const light = readWithPolarity(gray, width, height, key, true, expected);
    let winner = light;
    if (light.found !== expected) {
      const dark = readWithPolarity(gray, width, height, key, false, expected);
      if (scoreReading(dark, expected) > scoreReading(light, expected)) winner = dark;
    }
    cache.set(key, winner);
    return winner;
  }

  // One global cut is not enough in a dimly lit room: a lamp on the table makes
  // patches of wood as bright as the dice, and they fuse into one blob. Splitting
  // each side of the first cut again gives a harsher threshold that keeps only
  // the white faces, and a gentler one for dark dice on a light surface.
  const ladder = [base, otsuThreshold(gray, base, 255), otsuThreshold(gray, 0, base)];
  const tried = [];
  for (const t of ladder) {
    const key = Math.max(1, Math.min(254, Math.round(t)));
    if (tried.includes(key)) continue;
    tried.push(key);
  }

  let best = null;
  let bestThreshold = tried[0];
  for (const t of tried) {
    const reading = bestAt(t);
    if (!best || scoreReading(reading, expected) > scoreReading(best, expected)) {
      best = reading;
      bestThreshold = t;
    }
  }
  const values = best.values.filter((v) => v >= 1 && v <= 6);
  const full = values.length === expected && best.found === expected;

  // A correct reading is stable: cut the picture somewhere else and the same
  // dice come back. A wrong one is usually a coincidence of one particular
  // threshold, and falls apart. Only a reading that survives this is trusted
  // enough to fill in — a confidently wrong score is far worse than asking the
  // player to tally. The other rungs of the ladder are already computed, so
  // they get the first say; deliberate nudges only run if they disagree.
  let confirmed = false;
  if (full) {
    const fingerprint = values.slice().sort((a, b) => a - b).join(",");
    const agrees = (t) => {
      const other = bestAt(t);
      const otherValues = other.values.filter((v) => v >= 1 && v <= 6);
      return (
        otherValues.length === expected &&
        otherValues.slice().sort((a, b) => a - b).join(",") === fingerprint
      );
    };
    // Two independent agreements, not one: a single coincidence is cheap, and
    // in a dim photo two neighbouring cuts can be wrong the same way.
    const witnesses = [...tried.filter((t) => t !== bestThreshold), base - 10, base + 10];
    let seconds = 0;
    for (const t of witnesses) {
      if (agrees(t)) seconds++;
      if (seconds >= 2) break;
    }
    confirmed = seconds >= 2;
  }

  return {
    values,
    found: best.found,
    expected,
    complete: full && confirmed,
    unstable: full && !confirmed,
    darkDice: !best.diceAreLight,
  };
}

function loadBitmap(source) {
  if (typeof createImageBitmap === "function" && (source instanceof Blob || source instanceof File)) {
    return createImageBitmap(source);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Billedet kunne ikke indlæses"));
    img.src = source instanceof Blob ? URL.createObjectURL(source) : source;
  });
}
