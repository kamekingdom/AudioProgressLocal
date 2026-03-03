const state = {
  running: false,
  mode: "A",
  pass: 0,
  runStartAt: 0,
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
  phaseLabel: document.getElementById("phaseLabel"),
  modeLabel: document.getElementById("modeLabel"),
  timeText: document.getElementById("timeText"),
  progressWrap: document.getElementById("progressWrap"),
  progressFill: document.getElementById("progressFill"),
  stage: document.getElementById("stage"),
  canvas: document.getElementById("vizCanvas"),
};

const ctx = els.canvas.getContext("2d");

function resizeCanvas() {
  const rect = els.stage.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  els.canvas.width = Math.floor(rect.width * scale);
  els.canvas.height = Math.floor(rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function getMode() {
  const checked = document.querySelector("input[name='mode']:checked");
  return checked ? checked.value : "A";
}

function easeInOutSine(x) {
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

function pathPosition(mode, tSec) {
  if (mode === "N") {
    return { x: 1.8, y: 0.0, z: 0.0 };
  }

  if (mode === "A") {
    const w = 0.58;
    const r = 2.8;
    return {
      x: Math.cos(tSec * w) * r,
      y: Math.sin(tSec * w * 0.5) * 0.55,
      z: Math.sin(tSec * w) * r,
    };
  }

  const loop = 10;
  const phase = (tSec % loop) / loop;
  const eased = easeInOutSine(phase);
  return {
    x: (eased * 2 - 1) * 3.2,
    y: Math.sin(tSec * 0.7) * 0.3,
    z: Math.sin(tSec * 0.35) * 2.2,
  };
}

function projectToCanvas(pos, width, height) {
  const zoom = 95;
  const cx = width / 2;
  const cy = height / 2;

  return {
    x: cx + pos.x * zoom,
    y: cy + pos.z * zoom * 0.5 - pos.y * zoom * 0.4,
  };
}

function drawDarkStage() {
  const w = els.stage.clientWidth;
  const h = els.stage.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
}

function drawVisualStage(pos, elapsedAudioSec) {
  const w = els.stage.clientWidth;
  const h = els.stage.clientHeight;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#05080f";
  ctx.fillRect(0, 0, w, h);

  const listener = { x: 0, y: 0, z: 0 };
  const lp = projectToCanvas(listener, w, h);
  const sp = projectToCanvas(pos, w, h);

  ctx.strokeStyle = "rgba(130, 167, 207, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lp.x, lp.y);
  ctx.lineTo(sp.x, sp.y);
  ctx.stroke();

  ctx.fillStyle = "#e7f0ff";
  ctx.beginPath();
  ctx.arc(lp.x, lp.y, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#25d196";
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#99b3d1";
  ctx.font = "14px sans-serif";
  ctx.fillText("Listener", lp.x + 10, lp.y - 10);
  ctx.fillText(
    `Source x:${pos.x.toFixed(2)} y:${pos.y.toFixed(2)} z:${pos.z.toFixed(2)}`,
    sp.x + 12,
    sp.y - 12,
  );

  const duration = Number.isFinite(state.audioEl?.duration) ? state.audioEl.duration : 0;
  const progress = duration > 0 ? Math.min(elapsedAudioSec / duration, 1) : 0;
  els.progressFill.style.width = `${progress * 100}%`;
  els.timeText.textContent = `${elapsedAudioSec.toFixed(1)} / ${duration.toFixed(1)} sec`;
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
  state.runStartAt = performance.now();

  els.progressFill.style.width = "0%";
  els.timeText.textContent = "0.0 / 0.0 sec";

  if (passNumber === 1) {
    els.phaseLabel.textContent = "1回目: 暗転 + 音源移動";
    els.progressWrap.classList.add("hidden");
  } else {
    els.phaseLabel.textContent = "2回目: 可視化 + Progress";
    els.progressWrap.classList.remove("hidden");
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
  drawDarkStage();
}

function animationLoop() {
  if (!state.running) {
    return;
  }

  const elapsed = (performance.now() - state.runStartAt) / 1000;
  const position = pathPosition(state.mode, elapsed);
  setPannerPosition(position);

  if (state.pass === 1) {
    drawDarkStage();
  } else {
    const audioElapsed = state.audioEl ? state.audioEl.currentTime : 0;
    drawVisualStage(position, audioElapsed);
  }

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

window.addEventListener("resize", resizeCanvas);
els.startBtn.addEventListener("click", startRun);
els.stopBtn.addEventListener("click", () => stopRun("停止"));
els.reloadBtn.addEventListener("click", loadAudioList);

resizeCanvas();
drawDarkStage();
loadAudioList();
