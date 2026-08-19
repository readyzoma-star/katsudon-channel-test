import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const ARCHIVE = [
  { id: 0, title: "メインビジュアル", kicker: "ARCHIVE 01", description: "桜の公園でおどける、いちばん見慣れた顔。まずはここから眺めてください。", src: "./archive/01.jpg", x: -5.4, y: 2.15, z: 0, scale: 3.15, rotY: 0.12 },
  { id: 1, title: "プロフィールシート", kicker: "ARCHIVE 02", description: "カツドンの雰囲気・衣装・空気感を一枚にまとめたファン向けの記録です。", src: "./archive/02.png", x: 0, y: 2.15, z: -0.5, scale: 3.35, rotY: 0 },
  { id: 2, title: "街のイラスト", kicker: "ARCHIVE 03", description: "夕暮れの街並みと、ひとり歩くシルエット。世界観をゆっくり味わうための絵です。", src: "./archive/03.jpg", x: 5.2, y: 2.15, z: 0, scale: 2.2, rotY: -0.1 },
  { id: 3, title: "シーン切り取り", kicker: "ARCHIVE 04", description: "公園で指を差す、ほんの一瞬。構図ごと残しておきたい場面です。", src: "./archive/04.jpg", x: -5.2, y: -2.05, z: 0.5, scale: 2.45, rotY: 0.1 },
  { id: 4, title: "休日のカット", kicker: "ARCHIVE 05", description: "黄色いパーカーでベンチに座る空気。何度でも見返したくなる一枚です。", src: "./archive/05.jpg", x: 0, y: -2.05, z: -0.15, scale: 2.45, rotY: 0 },
  { id: 5, title: "ひとこと", kicker: "ARCHIVE 06", description: "黄色い帽子で誰かに話しかけるカット。コメントが流れ出すきっかけにもなります。", src: "./archive/06.jpg", x: 5.2, y: -2.05, z: 0.5, scale: 2.7, rotY: -0.1 },
];

const QUOTES = [
  { text: "あなたのインナーチャイルド、今日も元気？", speech: "あなたのインナーチャイルド、今日も元気？" },
  { text: "尊厳が破壊される", speech: "尊厳が破壊される" },
  { text: "来るなら、来い", speech: "来るなら、来い", source: "sm27974075" },
  { text: "次世代を代表するセルフエクスプレッショナー", speech: "次世代を代表するセルフエクスプレッショナー", source: "sm26863523" },
  { text: "店味", speech: "てんみ" },
  { text: "アイブライト", speech: "アイブライト", source: "sm29740916" },
  { text: "宇宙の采配", speech: "宇宙の采配" },
  { text: "感謝感激雨嵐", speech: "感謝感激、雨あらし", source: "sm29835544" },
  { text: "草回避www", speech: "草回避" },
  { text: "のっぴきならない事情", speech: "のっぴきならない事情", source: "第3期『引退します。』" },
  { text: "成ったか", speech: "なったか", source: "sm42200128" },
  { text: "寝方ミスった", speech: "寝方ミスった", source: "sm42875342" },
  { text: "みんな楽しんでくれててよかった", speech: "みんな楽しんでくれててよかった", source: "sm42555570" },
  { text: "睡眠が壊れる", speech: "睡眠が壊れる" },
  { text: "ちゃんと出来るように頑張る。", speech: "ちゃんと出来るように頑張る。" },
  { text: "すみ！", speech: "すみ！" },
  { text: "にんげんは しっぱいするもの まなぶもの", speech: "にんげんは、しっぱいするもの。まなぶもの。" },
];
const MORAL = { text: "モラルのある盗撮をお願いします", speech: "モラルのある盗撮をお願いします" };
const COLORS = ["#f6f3ec", "#d7ece0", "#c9dff0", "#f0d9c8", "#e4e0f0", "#f2e6b8"];

const API = "https://api.tts.quest/v3/voicevox/synthesis";
const cache = new Map();
const pending = new Map();
let seq = 0;
let audioCtx = null;
let activeSource = null;
let activeAudio = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}
function unlockVoice() {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}
function stopVoice() {
  if (activeSource) {
    try { activeSource.stop(); } catch {}
    activeSource.disconnect();
    activeSource = null;
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio.load();
    activeAudio = null;
  }
}
async function waitReady(statusUrl) {
  for (let i = 0; i < 24; i += 1) {
    const data = await (await fetch(statusUrl, { mode: "cors", cache: "no-store" })).json();
    if (data.isAudioError) throw new Error("VOICE status error");
    if (data.isAudioReady) return;
    await sleep(180 + i * 40);
  }
}
async function synth(text, attempt = 0) {
  if (cache.has(text)) return cache.get(text);
  if (pending.has(text)) return pending.get(text);
  const task = (async () => {
    const url = new URL(API);
    url.searchParams.set("speaker", "3");
    url.searchParams.set("text", text);
    const data = await (await fetch(url, { mode: "cors", cache: "no-store" })).json();
    if (data.retryAfter != null && attempt < 4) {
      await sleep((Number(data.retryAfter) + 1) * 1000);
      pending.delete(text);
      return synth(text, attempt + 1);
    }
    const mp3 = data.mp3DownloadUrl || data.mp3StreamingUrl;
    if (!mp3) throw new Error(data.errorMessage || "VOICE API error");
    if (data.audioStatusUrl) await waitReady(data.audioStatusUrl);
    cache.set(text, mp3);
    return mp3;
  })();
  pending.set(text, task);
  try { return await task; } finally { if (pending.get(text) === task) pending.delete(text); }
}
async function playUrl(url, my) {
  if (my !== seq) return;
  unlockVoice();
  const ctx = getCtx();
  if (ctx) {
    if (ctx.state === "suspended") await ctx.resume();
    const res = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!res.ok) throw new Error(`audio HTTP ${res.status}`);
    const raw = await res.arrayBuffer();
    if (my !== seq) return;
    const decoded = await ctx.decodeAudioData(raw.slice(0));
    if (my !== seq) return;
    stopVoice();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.92;
    source.buffer = decoded;
    source.connect(gain).connect(ctx.destination);
    source.onended = () => { if (activeSource === source) activeSource = null; };
    activeSource = source;
    source.start();
    return;
  }
  stopVoice();
  const audio = new Audio(url);
  activeAudio = audio;
  audio.volume = 0.92;
  await audio.play();
}
function playQuoteVoice(speech, enabled, onError) {
  if (!enabled || !speech) return;
  const my = ++seq;
  unlockVoice();
  void (async () => {
    try {
      await playUrl(await synth(speech), my);
    } catch (err) {
      console.debug("Zundamon voice unavailable:", err);
      if (my === seq) onError?.();
    }
  })();
}

const state = {
  selected: 0,
  voiceEnabled: localStorage.getItem("fanVoiceEnabled") !== "0",
  lastQuote: -1,
  sameTap: 0,
  lastTapped: -1,
  lastTapAt: 0,
};

const $ = (id) => document.getElementById(id);
const comments = $("comments");
function makeComment(text, extra = {}) {
  const el = document.createElement("div");
  el.className = "nico";
  el.textContent = text;
  el.style.top = `${extra.top ?? 8 + Math.random() * 62}%`;
  el.style.fontSize = `${extra.size ?? 16 + Math.floor(Math.random() * 10)}px`;
  el.style.color = extra.color ?? COLORS[Math.floor(Math.random() * COLORS.length)];
  el.style.animationDuration = `${extra.duration ?? 6.4 + Math.random() * 2.2}s`;
  if (extra.delay) el.style.animationDelay = `-${extra.delay}s`;
  comments.appendChild(el);
  el.addEventListener("animationend", () => el.remove(), { once: true });
}
function voiceError() {
  makeComment("ずんだもん準備中 — もう一度タップ", { top: 12, size: 14, color: "#ffd36f", duration: 3.2 });
}
function emitQuote(quote) {
  unlockVoice();
  let chosen = quote;
  if (!chosen) {
    let n = state.lastQuote;
    while (n === state.lastQuote) n = Math.floor(Math.random() * QUOTES.length);
    state.lastQuote = n;
    chosen = QUOTES[n];
  }
  makeComment(chosen.text);
  playQuoteVoice(chosen.speech, state.voiceEnabled, voiceError);
}
function floodMoral() {
  unlockVoice();
  playQuoteVoice(MORAL.speech, state.voiceEnabled);
  for (let row = 0; row < 12; row += 1) {
    for (let lane = 0; lane < 2; lane += 1) {
      makeComment(MORAL.text, {
        top: 6 + row * 7,
        size: 15 + ((row + lane) % 5),
        color: COLORS[(row + lane) % COLORS.length],
        duration: 5.6 + Math.random() * 1.4,
        delay: Math.random() * 1.4,
      });
    }
  }
}
function renderInfo() {
  const item = ARCHIVE[state.selected];
  $("eyebrow").textContent = item.kicker;
  $("title").textContent = item.title;
  $("count").textContent = `0${item.id + 1}/06`;
  $("desc").textContent = item.description;
  $("strip").querySelectorAll("button").forEach((b, i) => b.classList.toggle("active", i === state.selected));
}
function select(index) {
  state.selected = ((index % 6) + 6) % 6;
  renderInfo();
}
function tapPhoto(index) {
  const next = ((index % 6) + 6) % 6;
  const now = Date.now();
  const count = state.lastTapped === next && now - state.lastTapAt < 2800 ? state.sameTap + 1 : 1;
  state.selected = next;
  state.lastTapped = next;
  state.lastTapAt = now;
  state.sameTap = count;
  renderInfo();
  if (count >= 3) {
    state.sameTap = 0;
    state.lastTapped = -1;
    state.lastTapAt = 0;
    floodMoral();
    return;
  }
  emitQuote();
}

const strip = $("strip");
ARCHIVE.forEach((item) => {
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = `<img src="${item.src}" alt=""><span>${item.title}</span>`;
  b.addEventListener("click", () => {
    if (item.id === state.selected) tapPhoto(item.id);
    else select(item.id);
  });
  strip.appendChild(b);
});
renderInfo();

$("infoCard").addEventListener("click", (e) => {
  if (e.target.closest("button")) return;
  tapPhoto(state.selected);
});
$("quotesBtn").onclick = () => $("quotes").classList.remove("hidden");
$("quotesClose").onclick = () => $("quotes").classList.add("hidden");
$("helpBtn").onclick = () => $("help").classList.remove("hidden");
$("helpClose").onclick = () => $("help").classList.add("hidden");
$("hideBtn").onclick = () => {
  $("chrome").classList.add("hidden");
  $("restoreBtn").classList.remove("hidden");
};
$("restoreBtn").onclick = () => {
  $("chrome").classList.remove("hidden");
  $("restoreBtn").classList.add("hidden");
};
$("randomBtn").onclick = () => {
  let n = state.selected;
  while (n === state.selected) n = Math.floor(Math.random() * 6);
  select(n);
};
$("lightboxBtn").onclick = () => {
  const item = ARCHIVE[state.selected];
  $("lightboxImg").src = item.src;
  $("lightboxImg").alt = item.title;
  $("lightboxCap").textContent = item.title;
  $("lightbox").classList.remove("hidden");
};
$("lightboxClose").onclick = () => $("lightbox").classList.add("hidden");
$("lightbox").addEventListener("click", (e) => {
  if (e.target.id === "lightbox") $("lightbox").classList.add("hidden");
});

function syncVoice() {
  $("voiceBtn").textContent = state.voiceEnabled ? "ずんだもん" : "音声オフ";
  $("voiceBtn").classList.toggle("on", state.voiceEnabled);
  $("voiceBtn").setAttribute("aria-pressed", state.voiceEnabled ? "true" : "false");
}
syncVoice();
$("voiceBtn").onclick = () => {
  state.voiceEnabled = !state.voiceEnabled;
  localStorage.setItem("fanVoiceEnabled", state.voiceEnabled ? "1" : "0");
  syncVoice();
  if (!state.voiceEnabled) { stopVoice(); return; }
  unlockVoice();
  playQuoteVoice("すみ！", true, voiceError);
};

const quoteList = $("quoteList");
QUOTES.forEach((q) => {
  const li = document.createElement("li");
  li.innerHTML = `<button type="button"><strong>${q.text}</strong>${q.source ? `<small>${q.source}</small>` : ""}</button>`;
  li.querySelector("button").onclick = () => emitQuote(q);
  quoteList.appendChild(li);
});

window.addEventListener("pointerdown", () => unlockVoice(), { once: true });
window.addEventListener("keydown", (e) => {
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key >= "1" && e.key <= "6") select(Number(e.key) - 1);
  if (e.key === "ArrowRight") select(state.selected + 1);
  if (e.key === "ArrowLeft") select(state.selected - 1);
  if (e.key.toLowerCase() === "r") $("randomBtn").click();
  if (e.key.toLowerCase() === "q") $("quotes").classList.toggle("hidden");
  if (e.key === "?" || e.key === "/") $("help").classList.remove("hidden");
  if (e.key.toLowerCase() === "h") {
    $("chrome").classList.toggle("hidden");
    $("restoreBtn").classList.toggle("hidden", !$("chrome").classList.contains("hidden"));
  }
  if (e.key === "Escape") {
    $("lightbox").classList.add("hidden");
    $("quotes").classList.add("hidden");
    $("help").classList.add("hidden");
    $("chrome").classList.remove("hidden");
    $("restoreBtn").classList.add("hidden");
  }
});

const host = $("stage");
const scene = new THREE.Scene();
scene.background = null;
scene.fog = new THREE.FogExp2(0xd5e4d4, 0.012);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(0, 0.2, 13.4);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff, 1));
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 8;
controls.maxDistance = 24;
controls.maxPolarAngle = Math.PI * 0.82;
controls.target.set(0, 0.1, 0);

const planes = [];
const loader = new THREE.TextureLoader();
let loaded = 0;
ARCHIVE.forEach((item, index) => {
  loader.load(item.src, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    const aspect = texture.image.width / texture.image.height;
    const geo = new THREE.PlaneGeometry(item.scale * aspect, item.scale);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(item.x, item.y, item.z);
    mesh.rotation.y = item.rotY;
    mesh.userData = { index, baseX: item.x, baseY: item.y, baseZ: item.z, baseRotY: item.rotY, phase: index * 1.4, floatSpeed: 0.32 + index * 0.05, floatAmp: 0.045 + (index % 2) * 0.016 };
    scene.add(mesh);
    planes.push(mesh);
    loaded += 1;
    if (loaded === ARCHIVE.length) $("loading").classList.add("hide");
  }, undefined, () => {
    loaded += 1;
    if (loaded === ARCHIVE.length) $("loading").classList.add("hide");
  });
});

const particleCount = 42;
const positions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i += 1) {
  positions[i * 3] = (Math.random() - 0.5) * 28;
  positions[i * 3 + 1] = Math.random() * 12 - 3;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
}
const particleGeo = new THREE.BufferGeometry();
particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
const particles = new THREE.Points(particleGeo, new THREE.PointsMaterial({
  color: 0xf4f1ea, size: 0.045, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending,
}));
scene.add(particles);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tap = { object: null, x: 0, y: 0, id: -1 };
function setPointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}
renderer.domElement.addEventListener("pointerdown", (e) => {
  setPointer(e);
  const hit = raycaster.intersectObjects(planes, false)[0];
  tap.object = hit?.object ?? null;
  tap.x = e.clientX; tap.y = e.clientY; tap.id = e.pointerId;
  if (hit) controls.enableRotate = false;
});
renderer.domElement.addEventListener("pointerup", (e) => {
  if (tap.id !== e.pointerId) return;
  const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 22;
  const target = tap.object;
  tap.object = null; tap.id = -1;
  controls.enableRotate = true;
  if (moved || !target) return;
  const index = Number(target.userData.index);
  if (Number.isInteger(index)) tapPhoto(index);
});
renderer.domElement.addEventListener("pointercancel", () => {
  tap.object = null; tap.id = -1; controls.enableRotate = true;
});

const clock = new THREE.Clock();
function resize() {
  const w = host.clientWidth || innerWidth;
  const h = host.clientHeight || innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
resize();
new ResizeObserver(resize).observe(host);

function tick() {
  requestAnimationFrame(tick);
  const t = clock.getElapsedTime();
  planes.forEach((mesh) => {
    const u = mesh.userData;
    const focused = state.selected === u.index;
    const floatY = u.baseY + Math.sin(t * u.floatSpeed + u.phase) * u.floatAmp;
    const idleRotY = u.baseRotY + Math.sin(t * 0.2 + u.phase) * 0.028;
    const idleRotZ = Math.sin(t * 0.16 + u.phase * 0.6) * 0.009;
    const targetX = focused ? THREE.MathUtils.lerp(u.baseX, 0, 0.42) : u.baseX;
    const targetY = focused ? THREE.MathUtils.lerp(floatY, 0.2, 0.35) : floatY;
    const targetZ = focused ? u.baseZ + 2.1 : u.baseZ;
    mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, targetX, focused ? 0.16 : 0.12);
    mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, targetY, focused ? 0.16 : 0.12);
    mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, targetZ, focused ? 0.18 : 0.14);
    mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, focused ? 0 : idleRotY, focused ? 0.18 : 0.1);
    mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, focused ? 0 : idleRotZ, focused ? 0.18 : 0.1);
  });
  const pos = particles.geometry.attributes.position.array;
  for (let i = 0; i < particleCount; i += 1) {
    pos[i * 3 + 1] += 0.003 + (i % 4) * 0.0007;
    if (pos[i * 3 + 1] > 10) pos[i * 3 + 1] = -4;
    pos[i * 3] += Math.sin(t * 0.25 + i) * 0.0016;
  }
  particles.geometry.attributes.position.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}
tick();
