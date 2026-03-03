const state = {
  running: false,
  mode: "A",
  pass: 0,
  animationHandle: null,
  audioCtx: null,
  pannerNode: null,
  audioEl: null,
  mediaNode: null,
  gainNode: null,
  selectedAudio: "",
  theme: "light",
};

const els = {
  audioSelect: document.getElementById("audioSelect"),
  reloadBtn: document.getElementById("reloadBtn"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  themeToggle: document.getElementById("themeToggle"),
  phaseLabel: document.getElementById("phaseLabel"),
  modeLabel: document.getElementById("modeLabel"),
  timeText: document.getElementById("timeText"),
  progressWrap: document.getElementById("progressWrap"),
  progressFill: document.getElementById("progressFill"),
  darkLayer: document.getElementById("darkLayer"),
  viewsWrap: document.getElementById("viewsWrap"),
  sideCanvas: document.getElementById("sideCanvas"),
  topCanvas: document.getElementById("topCanvas"),
  sideImg: document.getElementById("sideImg"),
  topImg: document.getElementById("topImg"),
};

const sideCtx = els.sideCanvas.getContext("2d");
const topCtx = els.topCanvas.getContext("2d");

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function trajectoryFromProgress(mode, progress) {
  const p = clamp01(progress);

  if (mode === "N") {
    return { x: 1.8, y: 0.0, z: 0.0 };
  }

  if (mode === "A") {
    const y = lerp(-0.9, 1.1, p);
    const theta = 2 * Math.PI * p;
    const x = 1.3 * Math.sin(theta);
    const z = 1.6 * (1 - Math.cos(theta));
    return { x, y, z };
  }

  const x = lerp(2.8, -2.8, p);
  const forwardArc = Math.sin(Math.PI * p);
  const z = 1.5 * forwardArc;
  const sinkArc = Math.sin(Math.PI * p);
  const y = 0.45 - 1.0 * sinkArc;
  return { x, y, z };
}

function resizeCanvasToElement(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
}

function resetCanvasTransform(ctx) {
  const scale = window.devicePixelRatio || 1;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function resizeCanvases() {
  resizeCanvasToElement(els.sideCanvas);
  resizeCanvasToElement(els.topCanvas);
  resetCanvasTransform(sideCtx);
  resetCanvasTransform(topCtx);
}

function getMode() {
  const checked = document.querySelector("input[name='mode']:checked");
  return checked ? checked.value : "A";
}

function mapSideYZ(pos, w, h) {
  const padX = 0.08 * w;
  const padY = 0.1 * h;
  const zMin = -0.4;
  const zMax = 3.4;
  const yMin = -1.2;
  const yMax = 1.3;

  const x = lerp(padX, w - padX, (pos.z - zMin) / (zMax - zMin));
  const y = lerp(h - padY, padY, (pos.y - yMin) / (yMax - yMin));
  return { x, y };
}

function mapTopXZ(pos, w, h) {
  const padX = 0.08 * w;
  const padY = 0.1 * h;
  const xMin = -3.2;
  const xMax = 3.2;
  const zMin = -0.4;
  const zMax = 3.4;

  const x = lerp(padX, w - padX, (pos.x - xMin) / (xMax - xMin));
  const y = lerp(h - padY, padY, (pos.z - zMin) / (zMax - zMin));
  return { x, y };
}

function clearOverlay(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

function drawDashedRoute(ctx, nodes2d) {
  if (nodes2d.length < 2) {
    return;
  }

  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(90, 173, 245, 0.95)";
  ctx.beginPath();
  ctx.moveTo(nodes2d[0].x, nodes2d[0].y);
  for (let i = 1; i < nodes2d.length; i += 1) {
    ctx.lineTo(nodes2d[i].x, nodes2d[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCurrentPoint(ctx, p) {
  ctx.fillStyle = "#26d595";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawRouteAndPosition(mode, progress) {
  const sideW = els.sideCanvas.clientWidth;
  const sideH = els.sideCanvas.clientHeight;
  const topW = els.topCanvas.clientWidth;
  const topH = els.topCanvas.clientHeight;

  clearOverlay(sideCtx, sideW, sideH);
  clearOverlay(topCtx, topW, topH);

  const sideRoute = [];
  const topRoute = [];
  for (let i = 0; i <= 100; i += 1) {
    const pos = trajectoryFromProgress(mode, i / 100);
    sideRoute.push(mapSideYZ(pos, sideW, sideH));
    topRoute.push(mapTopXZ(pos, topW, topH));
  }

  drawDashedRoute(sideCtx, sideRoute);
  drawDashedRoute(topCtx, topRoute);

  const now = trajectoryFromProgress(mode, progress);
  drawCurrentPoint(sideCtx, mapSideYZ(now, sideW, sideH));
  drawCurrentPoint(topCtx, mapTopXZ(now, topW, topH));
}

function showDarkOnly() {
  els.darkLayer.classList.remove("hidden");
  els.viewsWrap.classList.add("hidden");
}

function showVisualization() {
  els.darkLayer.classList.add("hidden");
  els.viewsWrap.classList.remove("hidden");
  resizeCanvases();
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  els.themeToggle.textContent = theme === "light" ? "Dark Mode" : "Light Mode";
  try {
    localStorage.setItem("audio_progress_theme", theme);
  } catch (_e) {
    // no-op
  }
}

function initTheme() {
  let theme = "light";
  try {
    const saved = localStorage.getItem("audio_progress_theme");
    if (saved === "light" || saved === "dark") {
      theme = saved;
    }
  } catch (_e) {
    // no-op
  }
  applyTheme(theme);
}

async function loadAudioList() {
  const files = await eel.list_audio_files()();
  els.audioSelect.innerHTML = "";

  if (!files || files.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "audio/ に音源がありません";
    els.audioSelect.appendChild(opt);
    els.audioSelect.disabled = true;
    els.startBtn.disabled = true;
    return;
  }

  for (const name of files) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    els.audioSelect.appendChild(opt);
  }

  els.audioSelect.disabled = false;
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

function cleanupAudioGraph() {
  if (state.audioEl) {
    state.audioEl.pause();
    state.audioEl.src = "";
    state.audioEl.onended = null;
  }

  if (state.mediaNode) {
    state.mediaNode.disconnect();
  }

  if (state.pannerNode) {
    state.pannerNode.disconnect();
  }

  if (state.gainNode) {
    state.gainNode.disconnect();
  }

  state.audioEl = null;
  state.mediaNode = null;
  state.pannerNode = null;
  state.gainNode = null;
}

function setPannerPosition(pos) {
  if (!state.pannerNode) {
    return;
  }

  state.pannerNode.positionX.value = pos.x;
  state.pannerNode.positionY.value = pos.y;
  state.pannerNode.positionZ.value = pos.z;
}

async function setupAudioForPass() {
  await ensureAudioContext();
  cleanupAudioGraph();

  const src = `/audio/${encodeURIComponent(state.selectedAudio)}`;
  state.audioEl = new Audio(src);
  state.audioEl.crossOrigin = "anonymous";

  state.mediaNode = state.audioCtx.createMediaElementSource(state.audioEl);
  state.pannerNode = new PannerNode(state.audioCtx, {
    panningModel: "HRTF",
    distanceModel: "inverse",
    refDistance: 1,
    maxDistance: 10000,
    rolloffFactor: 0,
    coneInnerAngle: 360,
    coneOuterAngle: 360,
    positionX: 0,
    positionY: 0,
    positionZ: 0,
  });

  state.gainNode = state.audioCtx.createGain();
  state.gainNode.gain.value = 1.0;

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

async function startPass(passNumber) {
  state.pass = passNumber;
  els.progressFill.style.width = "0%";
  els.timeText.textContent = "0.0 / 0.0 sec";

  if (passNumber === 1) {
    els.phaseLabel.textContent = "1回目: 暗転 + 音源移動";
    els.progressWrap.classList.add("hidden");
    showDarkOnly();
  } else {
    els.phaseLabel.textContent = "2回目: 可視化 + Progress";
    els.progressWrap.classList.remove("hidden");
    showVisualization();
    drawRouteAndPosition(state.mode, 0);
  }

  await setupAudioForPass();

  state.audioEl.onended = async () => {
    if (!state.running) {
      return;
    }

    if (state.pass === 1) {
      await startPass(2);
      return;
    }

    stopRun("完了");
  };

  await state.audioEl.play();
}

function updateMotionAndUI() {
  if (!state.audioEl) {
    return;
  }

  const duration = Number.isFinite(state.audioEl.duration) ? state.audioEl.duration : 0;
  const current = state.audioEl.currentTime || 0;
  const progress = duration > 0 ? clamp01(current / duration) : 0;

  const pos = trajectoryFromProgress(state.mode, progress);
  setPannerPosition(pos);

  if (state.pass === 2) {
    drawRouteAndPosition(state.mode, progress);
    els.progressFill.style.width = `${progress * 100}%`;
    els.timeText.textContent = `${current.toFixed(1)} / ${duration.toFixed(1)} sec`;
  }
}

function stopRun(label = "停止") {
  if (!state.running) {
    return;
  }

  state.running = false;
  state.pass = 0;

  if (state.animationHandle) {
    cancelAnimationFrame(state.animationHandle);
    state.animationHandle = null;
  }

  cleanupAudioGraph();

  els.startBtn.disabled = false;
  els.stopBtn.disabled = true;
  els.audioSelect.disabled = false;
  els.reloadBtn.disabled = false;
  els.progressWrap.classList.add("hidden");
  els.phaseLabel.textContent = label;
  els.progressFill.style.width = "0%";
  showDarkOnly();
  clearOverlay(sideCtx, els.sideCanvas.clientWidth, els.sideCanvas.clientHeight);
  clearOverlay(topCtx, els.topCanvas.clientWidth, els.topCanvas.clientHeight);
}

function animationLoop() {
  if (!state.running) {
    return;
  }

  updateMotionAndUI();
  state.animationHandle = requestAnimationFrame(animationLoop);
}

async function startRun() {
  if (state.running) {
    return;
  }

  state.selectedAudio = els.audioSelect.value;
  if (!state.selectedAudio) {
    alert("audio/ の音源を選択してください。");
    return;
  }

  state.mode = getMode();
  els.modeLabel.textContent =
    state.mode === "A" ? "Mode A" : state.mode === "B" ? "Mode B" : "No Motion";

  try {
    state.running = true;
    els.startBtn.disabled = true;
    els.stopBtn.disabled = false;
    els.audioSelect.disabled = true;
    els.reloadBtn.disabled = true;

    await startPass(1);
    state.animationHandle = requestAnimationFrame(animationLoop);
  } catch (err) {
    stopRun("エラー停止");
    alert(`再生に失敗しました: ${String(err)}`);
  }
}

function onModeChanged() {
  state.mode = getMode();
  els.modeLabel.textContent =
    state.mode === "A" ? "Mode A" : state.mode === "B" ? "Mode B" : "No Motion";

  if (!state.running) {
    showVisualization();
    drawRouteAndPosition(state.mode, 0);
    showDarkOnly();
  }
}

function setupImageFallback() {
  els.topImg.addEventListener("error", () => {
    els.topImg.src = "/image/front.png";
  });
}

window.addEventListener("resize", () => {
  resizeCanvases();
  if (!state.running) {
    showVisualization();
    drawRouteAndPosition(getMode(), 0);
    showDarkOnly();
  }
});

els.startBtn.addEventListener("click", startRun);
els.stopBtn.addEventListener("click", () => stopRun("停止"));
els.reloadBtn.addEventListener("click", loadAudioList);
els.themeToggle.addEventListener("click", () => {
  applyTheme(state.theme === "light" ? "dark" : "light");
});

document.querySelectorAll("input[name='mode']").forEach((radio) => {
  radio.addEventListener("change", onModeChanged);
});

setupImageFallback();
initTheme();
resizeCanvases();
showDarkOnly();
loadAudioList();
onModeChanged();
