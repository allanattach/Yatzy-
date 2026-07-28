// Counts pips on photographed dice, entirely in the browser: no model file, no
// service, no API key — a static site can't hold a secret, and this has to work
// offline.
//
// The approach is deliberately classical rather than learned:
//   1. Downscale and grayscale the photo.
//   2. Otsu threshold to split light from dark.
//   3. Treat dice bodies as blobs of one polarity, pips as blobs of the other
//      inside them. Both polarities are tried (light dice with dark pips, and
//      dark dice with light pips) and the more plausible reading wins.
//   4. Filter die candidates by size, squareness and fill, then keep the N
//      largest — we know how many dice to expect, which is a strong constraint.
//   5. Count pip blobs inside each die, rejecting ones that are the wrong size
//      or too far from round.
//
// It is best-effort by nature: contrast, shadows, motion blur and dice touching
// each other all degrade it. Callers must treat the result as a suggestion to be
// confirmed, never as truth.

const WORK_WIDTH = 720; // enough detail for pips, small enough to stay fast

function toGray(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Rec. 601 luma; pips are a brightness feature, colour adds nothing here.
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return { gray, width, height };
}

// Otsu: pick the threshold that maximises between-class variance.
function otsuThreshold(gray) {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
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

  const sub = new Uint8Array(boxW * boxH);
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const isDark = gray[(y0 + y) * width + (x0 + x)] < threshold;
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
// many boxes along its longer axis — enough to read each face separately.
function splitClumps(blobs, expected) {
  const singles = blobs.filter((b) => {
    const r = b.w / b.h;
    return r > 0.7 && r < 1.4;
  });
  const reference = singles.length
    ? singles.map((b) => b.area).sort((a, b) => a - b)[Math.floor(singles.length / 2)]
    : 0;
  if (!reference) return blobs;

  const out = [];
  for (const blob of blobs) {
    const k = Math.round(blob.area / reference);
    if (k < 2 || k > expected) {
      out.push(blob);
      continue;
    }
    const horizontal = blob.w >= blob.h;
    const span = horizontal ? blob.w : blob.h;
    const step = span / k;
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

function readAtErosion(gray, width, height, mask, threshold, diceAreLight, expected, level) {
  const imageArea = width * height;
  const { blobs } = labelBlobs(mask, width, height, 1);
  const usable = blobs.filter((b) => isPlausibleDie(b, imageArea) || b.area / imageArea > 0.0006);
  const candidates = splitClumps(usable, expected)
    .filter((b) => b.split || isPlausibleDie(b, imageArea))
    .sort((a, b) => b.area - a.area)
    .slice(0, expected);

  const dice = [];
  for (const blob of candidates) {
    // Erosion pulled the outline in; grow the box back so the outermost pips
    // are inside it again. A box cut out of a clump keeps its edges, since
    // growing it would reach into the neighbouring die.
    const grow = blob.split ? 0 : level;
    const box = {
      minX: Math.max(0, blob.minX - grow),
      minY: Math.max(0, blob.minY - grow),
      w: blob.w + grow * 2,
      h: blob.h + grow * 2,
      area: blob.area,
    };
    dice.push({ value: countPips(gray, width, height, box, diceAreLight, threshold), box });
  }

  const valid = dice.filter((d) => d.value >= 1 && d.value <= 6);
  return {
    diceAreLight,
    level,
    found: dice.length,
    valid: valid.length,
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
  const threshold = otsuThreshold(gray);

  const readings = [
    readWithPolarity(gray, width, height, threshold, true, expected),
    readWithPolarity(gray, width, height, threshold, false, expected),
  ];
  readings.sort((a, b) => scoreReading(b, expected) - scoreReading(a, expected));
  const best = readings[0];

  const values = best.values.filter((v) => v >= 1 && v <= 6);
  return {
    values,
    found: best.found,
    expected,
    // Only a complete, entirely in-range reading is worth pre-filling from.
    complete: values.length === expected && best.found === expected,
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
