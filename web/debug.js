const state = {
  running: false,
  mode: "A",
  audioCtx: null,
  pannerNode: null,
  audioEl: null,
  mediaNode: null,
  gainNode: null,
  selectedAudio: "",
  raf: null,
  trail: [],
};

const els = {
  audioSelect: document.getElementById("audioSelect"),
  reloadBtn: document.getElementById("reloadBtn"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  info: document.getElementById("info"),
  xyzCanvas: document.getElementById("xyzCanvas"),
};

const ctx = els.xyzCanvas.getContext("2d");

const VIEW = {
  yaw: (-35 * Math.PI) / 180,
  pitch: (18 * Math.PI) / 180,
  distance: 12,
  zoom: 78,
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function trajectoryFromProgress(mode, progress) {
  const p = clamp01(progress);
  if (mode === "N") return { x: 1.8, y: 0.0, z: 0.0 };

  if (mode === "A") {
    const y = 0.1;
    const theta = Math.PI * p;
    const x = 3.6 * Math.cos(theta);
    const z = 3.6 * Math.sin(theta);
    return { x, y, z };
  }

  const theta = Math.PI * p - Math.PI / 2;
  const y = -0.2 + 1.6 * Math.sin(theta);
  const z = 2.0 + 0.8 * Math.cos(theta);
  const x = 0.0;
  return { x, y, z };
}

function resizeCanvas() {
  const rect = els.xyzCanvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  els.xyzCanvas.width = Math.max(1, Math.floor(rect.width * scale));
  els.xyzCanvas.height = Math.max(1, Math.floor(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function projectXYZ(pos, w, h) {
  const cy = Math.cos(VIEW.yaw);
  const sy = Math.sin(VIEW.yaw);
  const cp = Math.cos(VIEW.pitch);
  const sp = Math.sin(VIEW.pitch);

  const x1 = cy * pos.x - sy * pos.z;
  const z1 = sy * pos.x + cy * pos.z;

  const y2 = cp * pos.y - sp * z1;
  const z2 = sp * pos.y + cp * z1;

  const denom = Math.max(0.01, VIEW.distance - z2);
  const s = (VIEW.zoom / denom) * Math.min(w, h) / 540;

  return {
    x: w * 0.5 + x1 * s,
    y: h * 0.56 - y2 * s,
  };
}

function clearCanvas(w, h) {
  ctx.clearRect(0, 0, w, h);
}

function drawAxes(w, h) {
  const o = projectXYZ({ x: 0, y: 0, z: 0 }, w, h);
  const ax = projectXYZ({ x: 2.2, y: 0, z: 0 }, w, h);
  const ay = projectXYZ({ x: 0, y: 2.2, z: 0 }, w, h);
  const az = projectXYZ({ x: 0, y: 0, z: 2.2 }, w, h);

  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(95, 118, 142, 0.45)";
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(ax.x, ax.y);
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(ay.x, ay.y);
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(az.x, az.y);
  ctx.stroke();

  ctx.fillStyle = "rgba(95, 118, 142, 0.9)";
  ctx.beginPath();
  ctx.arc(o.x, o.y, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#6b8298";
  ctx.font = "12px sans-serif";
  ctx.fillText("x+", ax.x + 4, ax.y);
  ctx.fillText("y+", ay.x + 4, ay.y);
  ctx.fillText("z+", az.x + 4, az.y);
  ctx.restore();
}

function drawPath(points2d, color, dashed = false) {
  if (points2d.length < 2) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  if (dashed) ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(points2d[0].x, points2d[0].y);
  for (let i = 1; i < points2d.length; i += 1) {
    ctx.lineTo(points2d[i].x, points2d[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCurrent(point2d) {
  ctx.fillStyle = "#21c48f";
  ctx.beginPath();
  ctx.arc(point2d.x, point2d.y, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawRouteArrows(route2d) {
  if (route2d.length < 2 || state.mode === "N") return;

  const ts = [0.25, 0.5, 0.75];
  for (const t of ts) {
    const idx = Math.min(Math.floor(t * (route2d.length - 1)), route2d.length - 2);
    const a = route2d[idx];
    const b = route2d[idx + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;

    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const tipX = a.x + dx * 0.5;
    const tipY = a.y + dy * 0.5;
    const headLen = 11;
    const halfW = 4.5;
    const baseX = tipX - ux * headLen;
    const baseY = tipY - uy * headLen;

    ctx.save();
    ctx.fillStyle = "#5aaef5";
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + px * halfW, baseY + py * halfW);
    ctx.lineTo(baseX - px * halfW, baseY - py * halfW);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function render(pos, progress) {
  const w = els.xyzCanvas.clientWidth;
  const h = els.xyzCanvas.clientHeight;

  clearCanvas(w, h);
  drawAxes(w, h);

  const route3d = [];
  for (let i = 0; i <= 120; i += 1) {
    route3d.push(trajectoryFromProgress(state.mode, i / 120));
  }
  const route2d = route3d.map((p) => projectXYZ(p, w, h));
  drawPath(route2d, "#9ab9d6", true);
  drawRouteArrows(route2d);

  const trail2d = state.trail.map((s) => projectXYZ(s.pos, w, h));
  drawPath(trail2d, "#5aaef5", false);

  drawCurrent(projectXYZ(pos, w, h));

  const fb = pos.z < 0 ? "FRONT(-z)" : "BACK(+z)";
  els.info.textContent = `x:${pos.x.toFixed(2)} y:${pos.y.toFixed(2)} z:${pos.z.toFixed(2)} / ${fb} / p:${(progress * 100).toFixed(1)}%`;
}

async function loadAudioList() {
  const files = await eel.list_audio_files()();
  els.audioSelect.innerHTML = "";

  if (!files || files.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "audio/ に音源がありません";
    els.audioSelect.appendChild(opt);
    els.startBtn.disabled = true;
    return;
  }

  for (const name of files) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    els.audioSelect.appendChild(opt);
  }
  els.startBtn.disabled = false;
}

async function ensureAudioContext() {
  if (state.audioCtx == null) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (state.audioCtx.state === "suspended") {
    await state.audioCtx.resume();
  }
}

function setPannerPosition(pos) {
  if (!state.pannerNode) return;
  state.pannerNode.positionX.value = pos.x;
  state.pannerNode.positionY.value = pos.y;
  state.pannerNode.positionZ.value = pos.z;
}

function cleanupAudio() {
  if (state.audioEl) {
    state.audioEl.pause();
    state.audioEl.src = "";
    state.audioEl.onended = null;
  }
  if (state.mediaNode) state.mediaNode.disconnect();
  if (state.pannerNode) state.pannerNode.disconnect();
  if (state.gainNode) state.gainNode.disconnect();

  state.audioEl = null;
  state.mediaNode = null;
  state.pannerNode = null;
  state.gainNode = null;
}

async function setupAudio() {
  await ensureAudioContext();
  cleanupAudio();

  const src = `/audio/${encodeURIComponent(state.selectedAudio)}`;
  state.audioEl = new Audio(src);
  state.mediaNode = state.audioCtx.createMediaElementSource(state.audioEl);
  state.pannerNode = new PannerNode(state.audioCtx, {
    panningModel: "HRTF",
    distanceModel: "inverse",
    rolloffFactor: 0,
    positionX: 0,
    positionY: 0,
    positionZ: 0,
  });
  state.gainNode = state.audioCtx.createGain();

  state.mediaNode.connect(state.pannerNode);
  state.pannerNode.connect(state.gainNode);
  state.gainNode.connect(state.audioCtx.destination);

  const listener = state.audioCtx.listener;
  listener.positionX.value = 0;
  listener.positionY.value = 0;
  listener.positionZ.value = 0;
  listener.forwardX.value = 0;
  listener.forwardY.value = 0;
  listener.forwardZ.value = -1;
  listener.upX.value = 0;
  listener.upY.value = 1;
  listener.upZ.value = 0;
}

function tick() {
  if (!state.running || !state.audioEl) return;

  const duration = Number.isFinite(state.audioEl.duration) ? state.audioEl.duration : 0;
  const current = state.audioEl.currentTime || 0;
  const progress = duration > 0 ? clamp01(current / duration) : 0;
  const pos = trajectoryFromProgress(state.mode, progress);

  setPannerPosition(pos);

  if (state.trail.length === 0 || progress - state.trail[state.trail.length - 1].progress > 0.004) {
    state.trail.push({ progress, pos });
  }

  render(pos, progress);
  state.raf = requestAnimationFrame(tick);
}

function stopRun() {
  state.running = false;
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = null;
  cleanupAudio();
  els.startBtn.disabled = false;
  els.stopBtn.disabled = true;
}

async function startRun() {
  if (state.running) return;

  state.selectedAudio = els.audioSelect.value;
  if (!state.selectedAudio) {
    alert("audio/ の音源を選択してください。");
    return;
  }

  const checked = document.querySelector("input[name='mode']:checked");
  state.mode = checked ? checked.value : "A";
  state.trail = [];

  await setupAudio();
  try {
    await state.audioEl.play();
  } catch (e) {
    alert(`再生失敗: ${String(e)}`);
    stopRun();
    return;
  }

  state.running = true;
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  state.audioEl.onended = () => stopRun();
  tick();
}

window.addEventListener("resize", () => {
  resizeCanvas();
  render(trajectoryFromProgress(state.mode, 0), 0);
});

document.querySelectorAll("input[name='mode']").forEach((radio) => {
  radio.addEventListener("change", () => {
    if (state.running) return;
    state.mode = radio.value;
    state.trail = [];
    render(trajectoryFromProgress(state.mode, 0), 0);
  });
});

els.reloadBtn.addEventListener("click", loadAudioList);
els.startBtn.addEventListener("click", startRun);
els.stopBtn.addEventListener("click", stopRun);

resizeCanvas();
loadAudioList();
render(trajectoryFromProgress("A", 0), 0);
