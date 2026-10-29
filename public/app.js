const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d'), video = $('video');
let source = null, boxes = [], fileName = 'image.png', drag = null;

function setImage(drawable, w, h, name) {
  const scale = Math.min(1, 960 / w);
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  const off = document.createElement('canvas'); off.width = canvas.width; off.height = canvas.height;
  off.getContext('2d').drawImage(drawable, 0, 0, off.width, off.height);
  source = off; fileName = name; boxes = []; render(); detect();
}

$('file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image(); img.onload = () => setImage(img, img.width, img.height, f.name);
  img.src = URL.createObjectURL(f);
};
$('sample').onclick = () => { const img = new Image(); img.onload = () => setImage(img, img.width, img.height, 'sample.png'); img.src = 'sample.png'; };
$('cam').onclick = async () => {
  try { video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true }); video.hidden = false; $('snap').hidden = false; }
  catch (err) { alert('Camera unavailable: ' + err.message); }
};
$('snap').onclick = () => setImage(video, video.videoWidth, video.videoHeight, `frame-${Date.now()}.png`);
$('detect').onclick = detect;
$('sens').oninput = detect;
$('clear').onclick = () => { boxes = []; render(); };

async function detect() {
  if (!source) return;
  const img = source.getContext('2d').getImageData(0, 0, source.width, source.height);
  const auto = await Detectors.list[$('detector').value](img, { sensitivity: +$('sens').value });
  boxes = boxes.filter(b => b.manual).concat(auto);
  render();
}

// Draw your own boxes by dragging on the canvas.
// Convert mouse position to canvas pixels (the canvas may be scaled by CSS).
const pos = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };
canvas.onmousedown = e => { if (!source) return; const [x, y] = pos(e); drag = { x0: x, y0: y, x1: x, y1: y }; };
canvas.onmousemove = e => { if (drag) { [drag.x1, drag.y1] = pos(e); render(); } };
canvas.onmouseup = () => {
  if (!drag) return;
  const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
  drag = null;
  if (w > 5 && h > 5) boxes.push({ x, y, w, h, label: $('label').value || 'object', score: 1, manual: true });
  render();
};

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (source) ctx.drawImage(source, 0, 0);
  ctx.lineWidth = 2; ctx.font = '13px system-ui';
  for (const b of boxes) {
    const color = b.manual ? '#2563eb' : '#f59e0b';
    ctx.strokeStyle = color; ctx.strokeRect(b.x, b.y, b.w, b.h);
    const tag = `${b.label} ${(b.score * 100) | 0}%`;
    ctx.fillStyle = color; ctx.fillRect(b.x, Math.max(0, b.y - 18), ctx.measureText(tag).width + 8, 18);
    ctx.fillStyle = '#fff'; ctx.fillText(tag, b.x + 4, Math.max(13, b.y - 5));
  }
  if (drag) { ctx.strokeStyle = '#2563eb'; ctx.setLineDash([4, 3]); ctx.strokeRect(drag.x0, drag.y0, drag.x1 - drag.x0, drag.y1 - drag.y0); ctx.setLineDash([]); }
  $('count').textContent = `${boxes.length} boxes`;
  $('json').textContent = JSON.stringify(toCoco(), null, 2);
}

function toCoco() {
  const labels = [...new Set(boxes.map(b => b.label))];
  return {
    images: [{ id: 1, file_name: fileName, width: canvas.width, height: canvas.height }],
    categories: labels.map((name, i) => ({ id: i + 1, name })),
    annotations: boxes.map((b, i) => ({ id: i + 1, image_id: 1, category_id: labels.indexOf(b.label) + 1,
      bbox: [b.x, b.y, b.w, b.h].map(Math.round), area: Math.round(b.w * b.h), score: +b.score.toFixed(2), iscrowd: 0 })),
  };
}

$('export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(toCoco(), null, 2)], { type: 'application/json' }));
  a.download = fileName.replace(/\.\w+$/, '') + '.coco.json'; a.click();
};
for (const name of Object.keys(Detectors.list)) $('detector').add(new Option(name, name));
