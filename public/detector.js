// Pluggable detectors. A detector is: async (ImageData) => [{x, y, w, h, label, score}]
// Register your own with Detectors.register(name, fn), e.g. an onnxruntime-web model.
const Detectors = {
  list: {},
  register(name, fn) { this.list[name] = fn; },
};

// Built-in: contrast regions. Splits the image into a coarse grid, scores each cell by how
// different its colour is from its wider neighbourhood, groups neighbouring high-score cells,
// and returns one box per group. Fast, dependency-free, and good enough for a demo.
Detectors.register('contrast-regions', async (img, opts = {}) => {
  const cell = opts.cell || 10, sens = opts.sensitivity ?? 0.5, R = 6;
  const { width: W, height: H, data } = img;
  const gw = Math.ceil(W / cell), gh = Math.ceil(H / cell), mean = new Float32Array(gw * gh * 3), cnt = new Float32Array(gw * gh);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = ((y / cell) | 0) * gw + ((x / cell) | 0), i = (y * W + x) * 4;
    mean[c * 3] += data[i]; mean[c * 3 + 1] += data[i + 1]; mean[c * 3 + 2] += data[i + 2]; cnt[c]++;
  }
  for (let c = 0; c < gw * gh; c++) for (let k = 0; k < 3; k++) mean[c * 3 + k] /= cnt[c] || 1;
  const energy = new Float32Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    // Neighbourhood median colour: robust "background" estimate around this cell.
    const ch = [[], [], []];
    for (let y = Math.max(0, cy - R); y <= Math.min(gh - 1, cy + R); y++)
      for (let x = Math.max(0, cx - R); x <= Math.min(gw - 1, cx + R); x++) { const c = y * gw + x; for (let k = 0; k < 3; k++) ch[k].push(mean[c * 3 + k]); }
    const med = ch.map(a => a.sort((p, q) => p - q)[a.length >> 1]), c = cy * gw + cx;
    energy[c] = Math.hypot(mean[c * 3] - med[0], mean[c * 3 + 1] - med[1], mean[c * 3 + 2] - med[2]);
  }
  // Cells that look like the frame border (wall, table, sky...) are treated as background.
  const border = [];
  for (let x = 0; x < gw; x += 2) border.push(x, (gh - 1) * gw + x);
  for (let y = 0; y < gh; y++) border.push(y * gw, y * gw + gw - 1);
  const dist = (a, b) => Math.hypot(mean[a * 3] - mean[b * 3], mean[a * 3 + 1] - mean[b * 3 + 1], mean[a * 3 + 2] - mean[b * 3 + 2]);
  for (let c = 0; c < gw * gh; c++) if (energy[c] && border.some(b => dist(c, b) < 18)) energy[c] = 0;
  // Only join neighbouring cells whose colours are similar, so touching objects stay separate.
  const near = (a, b) => dist(a, b) < 45;
  const sorted = Array.from(energy).sort((a, b) => a - b);
  const thr = Math.max(12, sorted[Math.floor(sorted.length * (0.5 + 0.45 * (1 - sens)))] || 1);
  const on = energy.map(e => (e > thr ? 1 : 0)), seen = new Uint8Array(gw * gh), boxes = [];
  for (let s = 0; s < gw * gh; s++) {
    if (!on[s] || seen[s]) continue;
    let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1, n = 0, sum = 0; const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const c = stack.pop(), cx = c % gw, cy = (c / gw) | 0; n++; sum += energy[c];
      minx = Math.min(minx, cx); maxx = Math.max(maxx, cx); miny = Math.min(miny, cy); maxy = Math.max(maxy, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, k = ny * gw + nx;
        if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && on[k] && !seen[k] && near(c, k)) { seen[k] = 1; stack.push(k); }
      }
    }
    if (n < 4) continue;
    const bw = (maxx - minx + 1) * cell, bh = (maxy - miny + 1) * cell;
    if (bw > W * 0.8 || bh > H * 0.8 || bw / bh > 6 || bh / bw > 6) continue; // skip background bands
    boxes.push({ x: minx * cell, y: miny * cell, w: Math.min(W, (maxx + 1) * cell) - minx * cell,
      h: Math.min(H, (maxy + 1) * cell) - miny * cell, label: 'region', score: Math.min(1, sum / n / (thr * 2.5)) });
  }
  // Drop boxes that sit mostly inside a bigger box.
  boxes.sort((a, b) => b.w * b.h - a.w * a.h);
  const inside = (a, b) => { const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); return ix * iy > 0.6 * a.w * a.h; };
  return boxes.filter((b, i) => !boxes.slice(0, i).some(big => inside(b, big))).slice(0, opts.max || 20);
});
