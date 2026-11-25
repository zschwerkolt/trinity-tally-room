// Five-row paper-ballot reader. All image processing and inference run on the device.
const ROWS = 5;
const featureSize = 16;
const modelPath = new URL("./digits.bin", import.meta.url);
let modelPromise;

function loadModel() {
  if (!modelPromise) {
    modelPromise = fetch(modelPath)
      .then(async (response) => {
        if (!response.ok)
          throw new Error("The handwriting reader could not be loaded.");
        const weights = new Float32Array(await response.arrayBuffer());
        if (weights.length !== 36666)
          throw new Error("Incomplete handwriting model.");
        return weights;
      })
      .catch((error) => {
        modelPromise = null;
        throw error;
      });
  }
  return modelPromise;
}

function greyscale(canvas) {
  const scale = Math.min(1, 1400 / Math.max(canvas.width, canvas.height));
  let source = canvas;
  if (scale < 1) {
    source = document.createElement("canvas");
    source.width = Math.round(canvas.width * scale);
    source.height = Math.round(canvas.height * scale);
    source
      .getContext("2d")
      .drawImage(canvas, 0, 0, source.width, source.height);
  }
  const { width, height } = source;
  const rgba = source
    .getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, width, height).data;
  const grey = new Uint8Array(width * height);
  const integral = new Uint32Array((width + 1) * (height + 1));
  const stride = width + 1;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const pixel = 4 * i;
      grey[i] =
        (77 * rgba[pixel] + 150 * rgba[pixel + 1] + 29 * rgba[pixel + 2]) >> 8;
      sum += grey[i];
      integral[(y + 1) * stride + x + 1] = sum + integral[y * stride + x + 1];
    }
  }
  return { width, height, grey, integral, scale };
}

function inkMask(photo, contrast) {
  const { width, height, grey, integral } = photo;
  const radius = Math.max(6, Math.round(Math.min(width, height) * 0.025));
  const stride = width + 1;
  const ink = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width, x + radius + 1);
      const total =
        integral[bottom * stride + right] -
        integral[bottom * stride + left] -
        integral[top * stride + right] +
        integral[top * stride + left];
      const i = y * width + x;
      const background = total / ((right - left) * (bottom - top));
      ink[i] = grey[i] < background - contrast ? 1 : 0;
    }
  }
  return ink;
}

function boxCandidates(ink, width, height) {
  const visited = new Uint8Array(ink.length);
  const stack = new Int32Array(ink.length);
  const minSide = Math.max(7, Math.floor(Math.min(width, height) / 160));
  const maxSide = Math.min(height / 4, width / 3);
  const candidates = [];
  for (let start = 0; start < ink.length; start++) {
    if (visited[start] || !ink[start]) continue;
    visited[start] = 1;
    stack[0] = start;
    let head = 0,
      tail = 1;
    let left = width,
      right = 0,
      top = height,
      bottom = 0;
    let minSum = Infinity,
      maxSum = -Infinity,
      minDiff = Infinity,
      maxDiff = -Infinity;
    let tl, tr, br, bl;
    while (head < tail) {
      const index = stack[head++];
      const y = Math.floor(index / width),
        x = index - y * width;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      const sum = x + y,
        diff = x - y;
      if (sum < minSum) {
        minSum = sum;
        tl = [x, y];
      }
      if (sum > maxSum) {
        maxSum = sum;
        br = [x, y];
      }
      if (diff < minDiff) {
        minDiff = diff;
        bl = [x, y];
      }
      if (diff > maxDiff) {
        maxDiff = diff;
        tr = [x, y];
      }
      for (
        let ny = Math.max(0, y - 1);
        ny <= Math.min(y + 1, height - 1);
        ny++
      ) {
        for (
          let nx = Math.max(0, x - 1);
          nx <= Math.min(x + 1, width - 1);
          nx++
        ) {
          const n = ny * width + nx;
          if (ink[n] && !visited[n]) {
            visited[n] = 1;
            stack[tail++] = n;
          }
        }
      }
    }
    const w = right - left + 1,
      h = bottom - top + 1;
    if (
      Math.min(w, h) < minSide ||
      Math.max(w, h) > maxSide ||
      w / h < 0.62 ||
      w / h > 1.65
    )
      continue;
    if (tail < (w + h) * 0.9 || tail > w * h * 0.64) continue;
    const corners = [tl, tr, br, bl];
    // Score four straight printed edges, allowing for modest camera tilt.
    let hits = 0;
    const samples = 16;
    for (let side = 0; side < 4; side++) {
      const a = corners[side],
        b = corners[(side + 1) % 4];
      for (let n = 0; n < samples; n++) {
        const f = (n + 0.5) / samples;
        const x = Math.round(a[0] + f * (b[0] - a[0]));
        const y = Math.round(a[1] + f * (b[1] - a[1]));
        if (
          ink[y * width + x] ||
          ink[y * width + x + 1] ||
          ink[y * width + x - 1] ||
          ink[(y + 1) * width + x] ||
          ink[(y - 1) * width + x]
        )
          hits++;
      }
    }
    const quality = hits / (4 * samples);
    if (quality >= 0.73)
      candidates.push({
        x: left,
        y: top,
        w,
        h,
        cx: (left + right) / 2,
        cy: (top + bottom) / 2,
        corners,
        quality,
      });
  }
  return candidates
    .sort((a, b) => b.quality - a.quality || b.h - a.h)
    .slice(0, 220);
}

function findColumn(candidates) {
  let best = null,
    bestScore = -Infinity;
  for (const first of candidates) {
    for (const second of candidates) {
      const dx = second.cx - first.cx,
        dy = second.cy - first.cy;
      if (dy < 0.77 * first.h || dy > 1.8 * first.h || Math.abs(dx) > 0.5 * dy)
        continue;
      if (
        Math.abs(second.w / first.w - 1) > 0.22 ||
        Math.abs(second.h / first.h - 1) > 0.22
      )
        continue;
      const column = [first, second];
      let score = first.quality + second.quality;
      for (let row = 2; row < ROWS; row++) {
        const prev = column[row - 1],
          prior = column[row - 2];
        const expectedX = prev.cx + (prev.cx - prior.cx) * 0.5 + dx * 0.5;
        const expectedY = prev.cy + (prev.cy - prior.cy) * 0.5 + dy * 0.5;
        let match = null,
          minError = Infinity;
        for (const box of candidates) {
          const positionError =
            Math.hypot(box.cx - expectedX, box.cy - expectedY) / prev.h;
          const sizeError =
            Math.abs(box.w / prev.w - 1) + Math.abs(box.h / prev.h - 1);
          if (positionError > 0.34 || sizeError > 0.38) continue;
          const error = positionError + 0.35 * sizeError;
          if (error < minError) {
            match = box;
            minError = error;
          }
        }
        if (!match) break;
        column.push(match);
        score += match.quality - minError;
      }
      if (column.length === ROWS && score > bestScore) {
        best = column;
        bestScore = score;
      }
    }
  }
  return best;
}

function extractGlyph(photo, box) {
  const { grey, width } = photo;
  const [tl, tr, br, bl] = box.corners;
  const size = 48;
  const patch = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    // Trim printed outlines before measuring the inner pencil marks.
    const v = 0.12 + (0.76 * (y + 0.5)) / size;
    for (let x = 0; x < size; x++) {
      const u = 0.12 + (0.76 * (x + 0.5)) / size;
      const px =
        (1 - v) * ((1 - u) * tl[0] + u * tr[0]) +
        v * ((1 - u) * bl[0] + u * br[0]);
      const py =
        (1 - v) * ((1 - u) * tl[1] + u * tr[1]) +
        v * ((1 - u) * bl[1] + u * br[1]);
      patch[y * size + x] = grey[Math.round(py) * width + Math.round(px)];
    }
  }
  const sorted = patch.slice().sort();
  const paper = sorted[Math.floor(patch.length * 0.72)];
  const dark = sorted[Math.floor(patch.length * 0.025)];
  const difference = paper - dark;
  if (difference < 18) return { state: "blank" };
  const threshold = paper - Math.max(9, difference * 0.39);
  let minX = size,
    maxX = -1,
    minY = size,
    maxY = -1,
    total = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      patch[i] = patch[i] < threshold ? 1 : 0;
      if (!patch[i]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      total++;
    }
  }
  const gw = maxX - minX + 1,
    gh = maxY - minY + 1;
  if (
    gh < size * 0.22 ||
    total < size * size * 0.012 ||
    total > size * size * 0.65
  )
    return { state: "unreadable" };
  const scale = (featureSize - 2) / Math.max(gw, gh);
  const fw = Math.max(1, Math.round(gw * scale)),
    fh = Math.max(1, Math.round(gh * scale));
  const offsetX = Math.floor((featureSize - fw) / 2),
    offsetY = Math.floor((featureSize - fh) / 2);
  const features = new Float32Array(featureSize * featureSize);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      let coverage = 0;
      for (let sy = 0; sy < 4; sy++) {
        const yy = minY + Math.floor(((y + (sy + 0.5) / 4) * gh) / fh);
        for (let sx = 0; sx < 4; sx++) {
          const xx = minX + Math.floor(((x + (sx + 0.5) / 4) * gw) / fw);
          coverage += patch[yy * size + xx];
        }
      }
      features[(y + offsetY) * featureSize + x + offsetX] = coverage / 16;
    }
  }
  return { state: "ink", features };
}

function classify(features, model) {
  let offset = 0,
    layer = features;
  for (const count of [112, 64, 10]) {
    const bias = offset + layer.length * count;
    const output = Float32Array.from(model.subarray(bias, bias + count));
    for (let i = 0; i < layer.length; i++) {
      for (let j = 0; j < count; j++)
        output[j] += layer[i] * model[offset + i * count + j];
    }
    if (count !== 10)
      for (let j = 0; j < count; j++) output[j] = Math.max(0, output[j]);
    layer = output;
    offset = bias + count;
  }
  const max = Math.max(...layer),
    digit = layer.indexOf(max);
  const confidence =
    1 / layer.reduce((sum, value) => sum + Math.exp((value - max) / 1.6), 0);
  if (digit < 1 || digit > 5 || confidence < 0.55)
    return { rank: null, state: "unreadable", confidence };
  return { rank: digit, state: "digit", confidence };
}

export async function readBallot(canvas) {
  const photo = greyscale(canvas);
  let column;
  for (const contrast of [13, 7, 23]) {
    column = findColumn(
      boxCandidates(inkMask(photo, contrast), photo.width, photo.height),
    );
    if (column) break;
  }
  if (!column)
    return {
      ranks: Array(ROWS).fill(null),
      boxes: [],
      confidence: Array(ROWS).fill(0),
      states: Array(ROWS).fill("unreadable"),
    };
  const model = await loadModel();
  const rows = column.map((box) => {
    const glyph = extractGlyph(photo, box);
    return glyph.features
      ? classify(glyph.features, model)
      : { rank: null, state: glyph.state, confidence: 0 };
  });
  return {
    ranks: rows.map((row) => row.rank),
    confidence: rows.map((row) => row.confidence),
    states: rows.map((row) => row.state),
    boxes: column.map(({ x, y, w, h }) => ({
      x: x / photo.scale,
      y: y / photo.scale,
      w: w / photo.scale,
      h: h / photo.scale,
    })),
  };
}
