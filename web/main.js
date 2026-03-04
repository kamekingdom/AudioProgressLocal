const state = {
  running: false,
  paused: false,
  skipInFlight: false,
  mode: "A",
  pass: 0,
  animationHandle: null,
  audioCtx: null,
  pannerNode: null,
  audioEl: null,
  mediaNode: null,
  gainNode: null,
  selectedAudio: "",
};

const els = {
  audioSelect: document.getElementById("audioSelect"),
  reloadBtn: document.getElementById("reloadBtn"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  skipBtn: document.getElementById("skipBtn"),
  skipCount: document.getElementById("skipCount"),
  sidebarHoverZone: document.getElementById("sidebarHoverZone"),
  sidebarClose: document.getElementById("sidebarClose"),
  sidebar: document.getElementById("sidebar"),
  sidebarBackdrop: document.getElementById("sidebarBackdrop"),
  mainArea: document.querySelector(".main-area"),
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

function resolveMode(mode) {
  if (mode === "A") {
    return "B";
  }
  if (mode === "B") {
    return "A";
  }
  return mode;
}

function trajectoryFromProgress(mode, progress) {
  const p = clamp01(progress);

  if (mode === "N") {
    return { x: 0.0, y: 0.0, z: 0.0 };
  }

  if (mode === "A") {
    const y = 0.1;
    const theta = Math.PI * p;
    const x = 3.6 * Math.cos(theta);
    const z = 3.6 * Math.sin(theta);
    return { x, y, z };
  }

  // For UI Mode A (resolved to internal B):
  // Side(y-z): move upward from chin to top on a semicircle.
  // Top(x-z): start near center, rise around middle, return to start.
  const theta = Math.PI * p - Math.PI / 2;
  const y = -0.2 + 1.6 * Math.sin(theta);
  const z = 2.0 + 0.8 * Math.cos(theta);
  const x = 0.0;
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

function mapSidePoint(mode, pos, progress, w, h) {
  if (mode === "A") {
    const x = w * 0.33;
    const y = h * 0.47;
    return { x, y };
  }
  if (mode === "B") {
    const p = clamp01(progress);
    const theta = Math.PI * p - Math.PI / 2;
    const cx = w * 0.37;
    const cy = h * 0.47;
    const r = Math.min(w, h) * 0.28;
    return {
      x: cx - r * Math.cos(theta),
      y: cy - r * Math.sin(theta),
    };
  }
  return mapSideYZ(pos, w, h);
}

function mapTopPoint(mode, pos, progress, w, h) {
  if (mode === "N") {
    return { x: w * 0.5, y: h * 0.33 };
  }

  if (mode === "A") {
    const cx = w * 0.5;
    const cy = h * 0.58;
    const r = Math.min(w * 0.46, h * 0.58);
    const theta = Math.PI * clamp01(progress);
    return {
      x: cx + r * Math.cos(theta),
      y: cy - r * Math.sin(theta),
    };
  }
  return mapTopXZ(pos, w, h);
}

function clearOverlay(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

function drawDashedRoute(ctx, nodes2d, showArrows = true, arrowTs = null) {
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

  if (!showArrows) {
    return;
  }

  // Draw directional arrows along the route.
  const ts = Array.isArray(arrowTs) && arrowTs.length > 0 ? arrowTs : [0.25, 0.5, 0.75];
  for (const t of ts) {
    const idx = Math.min(Math.floor(t * (nodes2d.length - 1)), nodes2d.length - 2);
    const a = nodes2d[idx];
    const b = nodes2d[idx + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.0001) {
      continue;
    }

    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const headLen = 12;
    const halfW = 5;
    const tipX = a.x + dx * 0.5;
    const tipY = a.y + dy * 0.5;
    const baseX = tipX - ux * headLen;
    const baseY = tipY - uy * headLen;

    ctx.save();
    ctx.fillStyle = "rgba(90, 173, 245, 0.95)";
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + px * halfW, baseY + py * halfW);
    ctx.lineTo(baseX - px * halfW, baseY - py * halfW);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawCurrentPoint(ctx, p) {
  ctx.fillStyle = "#26d595";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
  ctx.fill();
}

function drawRouteAndPosition(mode, progress, showCurrent = true) {
  const activeMode = resolveMode(mode);
  const sideW = els.sideCanvas.clientWidth;
  const sideH = els.sideCanvas.clientHeight;
  const topW = els.topCanvas.clientWidth;
  const topH = els.topCanvas.clientHeight;

  clearOverlay(sideCtx, sideW, sideH);
  clearOverlay(topCtx, topW, topH);

  const sideRoute = [];
  const topRoute = [];
  const sideAnchor = mapSidePoint(
    activeMode,
    trajectoryFromProgress(activeMode, progress),
    progress,
    sideW,
    sideH,
  );
  for (let i = 0; i <= 100; i += 1) {
    const sampleProgress = i / 100;
    const pos = trajectoryFromProgress(activeMode, sampleProgress);
    if (activeMode === "A") {
      const tinyOffset = Math.sin(sampleProgress * Math.PI * 2) * 10;
      sideRoute.push({ x: sideAnchor.x, y: sideAnchor.y + tinyOffset });
    } else {
      sideRoute.push(mapSidePoint(activeMode, pos, sampleProgress, sideW, sideH));
    }
    topRoute.push(mapTopPoint(activeMode, pos, sampleProgress, topW, topH));
  }

  drawDashedRoute(sideCtx, sideRoute, activeMode !== "A");
  drawDashedRoute(topCtx, topRoute, true, activeMode === "B" ? [0.25] : null);

  if (showCurrent) {
    const now = trajectoryFromProgress(activeMode, progress);
    drawCurrentPoint(sideCtx, mapSidePoint(activeMode, now, progress, sideW, sideH));
    drawCurrentPoint(topCtx, mapTopPoint(activeMode, now, progress, topW, topH));
  }
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

function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  els.sidebar.setAttribute("aria-hidden", String(!open));
  els.sidebarBackdrop.classList.add("hidden");
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

function updatePauseButton() {
  els.pauseBtn.textContent = state.paused ? "再開" : "一時停止";
}

function setPhaseLabelForPass(passNumber) {
  if (passNumber === 1) {
    els.phaseLabel.textContent = "1回目: 現在地非表示 + 音源移動";
  } else if (passNumber === 2) {
    els.phaseLabel.textContent = "2回目: 可視化 + Progress";
  }
}

function setPannerPosition(pos) {
  if (!state.pannerNode) {
    return;
  }

  if ("positionX" in state.pannerNode && state.pannerNode.positionX) {
    state.pannerNode.positionX.value = pos.x;
    state.pannerNode.positionY.value = pos.y;
    state.pannerNode.positionZ.value = pos.z;
    return;
  }

  if (typeof state.pannerNode.setPosition === "function") {
    state.pannerNode.setPosition(pos.x, pos.y, pos.z);
  }
}

async function setupAudioForPass() {
  await ensureAudioContext();
  cleanupAudioGraph();

  const src = `/audio/${encodeURIComponent(state.selectedAudio)}`;
  state.audioEl = new Audio(src);
  state.audioEl.crossOrigin = "anonymous";

  state.mediaNode = state.audioCtx.createMediaElementSource(state.audioEl);
  state.gainNode = state.audioCtx.createGain();
  state.gainNode.gain.value = 1.0;

  try {
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
    state.mediaNode.connect(state.pannerNode);
    state.pannerNode.connect(state.gainNode);
  } catch (_err) {
    // Fallback: keep playback alive even when spatial node construction fails.
    state.pannerNode = null;
    state.mediaNode.connect(state.gainNode);
  }

  state.gainNode.connect(state.audioCtx.destination);

  const listener = state.audioCtx.listener;
  if (listener) {
    if (listener.positionX && "value" in listener.positionX) {
      listener.positionX.value = 0;
      listener.positionY.value = 0;
      listener.positionZ.value = 0;
      listener.forwardX.value = 0;
      listener.forwardY.value = 0;
      listener.forwardZ.value = -1;
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    } else if (typeof listener.setPosition === "function" && typeof listener.setOrientation === "function") {
      listener.setPosition(0, 0, 0);
      listener.setOrientation(0, 0, -1, 0, 1, 0);
    }
  }
}

async function startPass(passNumber) {
  state.paused = false;
  updatePauseButton();
  state.pass = passNumber;
  els.progressWrap.classList.remove("hidden");

  if (passNumber === 1) {
    setPhaseLabelForPass(passNumber);
    els.progressWrap.classList.add("unknown-progress");
    els.progressFill.style.width = "100%";
    els.timeText.textContent = "--.- / --.- sec";
    showVisualization();
    drawRouteAndPosition(state.mode, 0, false);
  } else {
    setPhaseLabelForPass(passNumber);
    els.progressWrap.classList.remove("unknown-progress");
    els.progressFill.style.width = "0%";
    els.timeText.textContent = "0.0 / 0.0 sec";
    showVisualization();
    drawRouteAndPosition(state.mode, 0, true);
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

  const activeMode = resolveMode(state.mode);
  const pos = trajectoryFromProgress(activeMode, progress);
  setPannerPosition(pos);

  if (state.pass === 1) {
    drawRouteAndPosition(state.mode, progress, false);
  } else if (state.pass === 2) {
    drawRouteAndPosition(state.mode, progress, true);
    els.progressFill.style.width = `${progress * 100}%`;
    els.timeText.textContent = `${current.toFixed(1)} / ${duration.toFixed(1)} sec`;
  }
}

function stopRun(label = "停止") {
  state.running = false;
  state.paused = false;
  state.skipInFlight = false;
  state.pass = 0;

  if (state.animationHandle) {
    cancelAnimationFrame(state.animationHandle);
    state.animationHandle = null;
  }

  cleanupAudioGraph();

  els.startBtn.disabled = !els.audioSelect.value;
  els.stopBtn.disabled = true;
  els.pauseBtn.disabled = true;
  els.skipBtn.disabled = true;
  els.skipCount.disabled = false;
  els.audioSelect.disabled = false;
  els.reloadBtn.disabled = false;
  els.progressWrap.classList.add("hidden");
  els.progressWrap.classList.remove("unknown-progress");
  els.phaseLabel.textContent = label;
  els.progressFill.style.width = "0%";
  showVisualization();
  drawRouteAndPosition(getMode(), 0, false);
  updatePauseButton();
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
    state.paused = false;
    state.skipInFlight = false;
    els.startBtn.disabled = true;
    els.stopBtn.disabled = false;
    els.pauseBtn.disabled = false;
    els.skipBtn.disabled = false;
    els.skipCount.disabled = false;
    els.audioSelect.disabled = true;
    els.reloadBtn.disabled = true;
    setSidebarOpen(false);

    await startPass(1);
    state.animationHandle = requestAnimationFrame(animationLoop);
  } catch (err) {
    stopRun("エラー停止");
    alert(`再生に失敗しました: ${String(err)}`);
  }
}

async function togglePause() {
  if (!state.running || !state.audioEl || state.skipInFlight) {
    return;
  }

  if (!state.paused) {
    state.paused = true;
    if (state.animationHandle) {
      cancelAnimationFrame(state.animationHandle);
      state.animationHandle = null;
    }
    state.audioEl.pause();
    els.phaseLabel.textContent = "一時停止中";
    updatePauseButton();
    return;
  }

  try {
    await state.audioEl.play();
    state.paused = false;
    setPhaseLabelForPass(state.pass);
    updatePauseButton();
    state.animationHandle = requestAnimationFrame(animationLoop);
  } catch (err) {
    alert(`再開に失敗しました: ${String(err)}`);
  }
}

async function skipPasses() {
  if (!state.running || state.skipInFlight) {
    return;
  }

  state.skipInFlight = true;
  els.skipBtn.disabled = true;
  els.pauseBtn.disabled = true;

  try {
    if (state.pass === 1) {
      await startPass(2);
      if (state.running && !state.animationHandle) {
        state.animationHandle = requestAnimationFrame(animationLoop);
      }
      return;
    }
    stopRun("スキップ完了");
  } catch (err) {
    stopRun("エラー停止");
    alert(`スキップに失敗しました: ${String(err)}`);
  } finally {
    if (state.running) {
      els.skipBtn.disabled = false;
      els.pauseBtn.disabled = false;
    }
    state.skipInFlight = false;
  }
}

function onModeChanged() {
  state.mode = getMode();
  els.modeLabel.textContent =
    state.mode === "A" ? "Mode A" : state.mode === "B" ? "Mode B" : "No Motion";

  if (!state.running) {
    showVisualization();
    drawRouteAndPosition(state.mode, 0, false);
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
    drawRouteAndPosition(getMode(), 0, false);
  }
});

els.startBtn.addEventListener("click", startRun);
els.stopBtn.addEventListener("click", () => stopRun("停止"));
els.pauseBtn.addEventListener("click", togglePause);
els.skipBtn.addEventListener("click", skipPasses);
els.reloadBtn.addEventListener("click", loadAudioList);
els.sidebarClose.addEventListener("click", () => setSidebarOpen(false));
els.sidebarHoverZone.addEventListener("mouseenter", () => setSidebarOpen(true));
els.sidebar.addEventListener("mouseenter", () => setSidebarOpen(true));
document.addEventListener("mousemove", (event) => {
  if (event.clientX <= 16) {
    setSidebarOpen(true);
    return;
  }
  if (event.clientX >= 380 && !els.sidebar.matches(":hover")) {
    setSidebarOpen(false);
  }
});

document.querySelectorAll("input[name='mode']").forEach((radio) => {
  radio.addEventListener("change", onModeChanged);
});

setupImageFallback();
resizeCanvases();
showVisualization();
setSidebarOpen(false);
loadAudioList();
onModeChanged();
updatePauseButton();
