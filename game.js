const API = "https://api.tts.quest/v3/voicevox/synthesis";
const BEST_KEY = "katsudon-stream-best-v2";

const DIFFS = {
  easy: {
    label: "EASY",
    seconds: 80,
    baseRise: 2.6,
    lateRise: 4.2,
    holdPower: 20,
    stamDrain: 16,
    stamRecover: 28,
    eventMin: 7.5,
    eventMax: 11,
    eventSpikeScale: 0.85,
    reverseHold: 8.0,
    desc: "配信 80秒 / 逆噴射 8秒 / イベントゆるめ",
  },
  hard: {
    label: "HARD",
    seconds: 68,
    baseRise: 3.4,
    lateRise: 6.8,
    holdPower: 18,
    stamDrain: 21,
    stamRecover: 24,
    eventMin: 5.5,
    eventMax: 8.5,
    eventSpikeScale: 1,
    reverseHold: 0.8,
    desc: "配信 68秒 / 逆噴射 0.8秒 / 標準",
  },
  extreme: {
    label: "EXTREME",
    seconds: 55,
    baseRise: 4.6,
    lateRise: 9.2,
    holdPower: 16,
    stamDrain: 26,
    stamRecover: 20,
    eventMin: 3.8,
    eventMax: 6.2,
    eventSpikeScale: 1.25,
    reverseHold: 0.4,
    desc: "配信 55秒 / 逆噴射 0.4秒 / 容赦なし",
  },
};

const EVENTS = [
  { id: "laugh", label: "笑いが込み上げた", line: "笑ったら終わりだ。歯を食いしばれ。", speech: "わらったら、おわりだ。はをくいしばれ。", spike: 17 },
  { id: "superchat", label: "スパチャが来た", line: "お礼を言いながら、踏ん張れ。", speech: "おれいをいいながら、ふんばれ。", spike: 13 },
  { id: "water", label: "水を飲んでしまった", line: "なんで今飲む…", speech: "なんでいまのむ。", spike: 19 },
  { id: "chat", label: "コメント祭り", line: "盛り上がるほどキツい。", speech: "もりあがるほど、きつい。", spike: 11 },
  { id: "stand", label: "立ち上がりそうになった", line: "椅子にへばりつけ。", speech: "いすに、へばりつけ。", spike: 15 },
  { id: "stomach", label: "お腹が鳴った", line: "マイクに入るな…", speech: "マイクに、はいるな。", spike: 12 },
];

const LINES = {
  idle: [
    { text: "今日もまったりいきます。", speech: "きょうも、まったりいきます。" },
    { text: "コメント、見えてるよ。", speech: "コメント、みえてるよ。" },
    { text: "……ん、大丈夫。", speech: "ん、だいじょうぶ。" },
  ],
  hold: [
    { text: "……っ、まだいける。", speech: "っ、まだいける。" },
    { text: "踏ん張る、踏ん張る…", speech: "ふんばる、ふんばる。" },
    { text: "声、裏返るなよ。", speech: "こえ、うらがえるなよ。" },
  ],
  warn: [
    { text: "ちょっと、危ないかも。", speech: "ちょっと、あぶないかも。" },
    { text: "息、吸いたい…", speech: "いき、すいたい。" },
  ],
  reverseWarn: [
    { text: "これ以上は無理だ…！", speech: "これいじょうは、むりだ。" },
    { text: "離さないと、まずい…", speech: "はなさないと、まずい。" },
  ],
  clear: { text: "配信、無事終了。ありがとう。", speech: "はいしん、ぶじしゅうりょう。ありがとう。" },
  over: { text: "トイレに駆け込む…！", speech: "トイレに、かけこむ。" },
  reverse: { text: "逆噴射——配信強制終了。", speech: "ぎゃくふんしゃ。はいしん、きょうせいしゅうりょう。" },
};

const CHATS = [
  "すみ！", "草", "今日もまったり", "顔色わるくない？", "お腹鳴ってない？",
  "え、立つ？", "成ったか", "寝方ミスった", "みんな楽しんでくれててよかった",
  "店味", "来るなら、来い", "のっぴきならない事情", "ちゃんと出来るように頑張る。",
];
const NAMES = ["すみ", "草回避", "店味", "雨嵐", "采配", "成ったか", "ねかた", "チャイルド"];

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cache = new Map();
const pending = new Map();
let seq = 0;
let audioCtx = null;
let activeSource = null;
let activeAudio = null;

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
  stopVoice();
  const audio = new Audio();
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";
  audio.src = url;
  audio.volume = 0.92;
  activeAudio = audio;
  const tryPlay = async () => {
    try {
      await audio.play();
      return true;
    } catch {
      return false;
    }
  };
  if (await tryPlay()) return;
  unlockVoice();
  await sleep(60);
  if (my !== seq) return;
  if (await tryPlay()) return;
  unlockVoice();
  await sleep(80);
  if (my !== seq) return;
  const a2 = new Audio(url);
  a2.volume = 0.92;
  activeAudio = a2;
  await a2.play().catch(() => {});
}
function speak(speech, enabled) {
  if (!enabled || !speech) return;
  const my = ++seq;
  unlockVoice();
  void (async () => {
    try {
      const url = await synth(speech);
      if (my !== seq) return;
      await playUrl(url, my);
    } catch (err) {
      console.debug("Zundamon unavailable:", err);
    }
  })();
}

function readBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return { clears: 0, viewers: 0 };
    const d = JSON.parse(raw);
    return { clears: d.clears ?? 0, viewers: d.viewers ?? 0 };
  } catch { return { clears: 0, viewers: 0 }; }
}
function writeBest(viewers) {
  const prev = readBest();
  const next = { clears: prev.clears + 1, viewers: Math.max(prev.viewers, Math.round(viewers)) };
  localStorage.setItem(BEST_KEY, JSON.stringify(next));
  return next;
}
function formatClock(s) {
  const n = Math.max(0, Math.ceil(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

let difficulty = "easy";
let voiceOn = localStorage.getItem("katsudon-game-voice") !== "0";
let phase = "title";
let hold = false;
let chatSeq = 0;
let eventCooldown = 5;
let lastLineAt = 0;
let lastLineKey = "";

const sim = {
  timeLeft: 80, urge: 16, stamina: 100, viewers: 40,
  lockout: 0, event: null, eventT: 0, holdTime: 0,
  flash: 0, trauma: 0, nextChat: 0.8, chat: [],
};

function resetSim() {
  const d = DIFFS[difficulty];
  sim.timeLeft = d.seconds;
  sim.urge = 14 + Math.random() * 6;
  sim.stamina = 100;
  sim.viewers = 32 + Math.floor(Math.random() * 22);
  sim.lockout = 0; sim.event = null; sim.eventT = 0; sim.holdTime = 0;
  sim.flash = 0; sim.trauma = 0; sim.nextChat = 0.6; sim.chat = [];
  eventCooldown = d.eventMin * 0.7;
  hold = false; lastLineAt = 0; lastLineKey = "";
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function setLine(key, entry, forceSpeak = false) {
  $("line").textContent = entry.text;
  if (forceSpeak || key !== lastLineKey) {
    lastLineKey = key; lastLineAt = performance.now();
    speak(entry.speech, voiceOn);
  }
}
function pushChat() {
  const item = { id: ++chatSeq, name: pick(NAMES), text: pick(CHATS) };
  sim.chat = [...sim.chat.slice(-8), item];
  const box = $("chatList"); if (!box) return;
  const el = document.createElement("p");
  el.className = "c";
  el.innerHTML = `<span class="n">${item.name}</span> ${item.text}`;
  box.appendChild(el);
  while (box.children.length > 9) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}
function show(id) {
  $("title").classList.toggle("hidden", id !== "title");
  $("play").classList.toggle("hidden", id !== "play");
  $("result").classList.toggle("hidden", id !== "result");
  document.body.classList.toggle("playing", id === "play");
}
function syncDiffUI() {
  document.querySelectorAll("#diff button").forEach((b) => {
    b.classList.toggle("on", b.dataset.diff === difficulty);
  });
  $("diffDesc").textContent = DIFFS[difficulty].desc;
}
function syncVoiceUI() {
  $("voiceToggle").textContent = voiceOn ? "ずんだもん ON" : "ずんだもん OFF";
  $("voiceToggle").setAttribute("aria-pressed", voiceOn ? "true" : "false");
}
function renderBest() {
  const b = readBest();
  $("bestStats").textContent = b.clears > 0 ? `クリア ${b.clears} 回 / 最高視聴 ${b.viewers} 人` : "";
}
function paintPlay() {
  const d = DIFFS[difficulty];
  $("clock").textContent = formatClock(sim.timeLeft);
  $("viewers").textContent = `${Math.round(sim.viewers)} 人が視聴中`;
  $("diffBadge").textContent = d.label;
  $("urgeNum").textContent = String(Math.round(sim.urge));
  $("stamNum").textContent = String(Math.round(sim.stamina));
  $("holdNum").textContent = sim.holdTime.toFixed(1);
  const urgeBar = $("urgeBar");
  urgeBar.style.width = `${Math.min(100, sim.urge)}%`;
  urgeBar.classList.toggle("danger", sim.urge > 88);
  urgeBar.classList.toggle("warn", sim.urge > 72 && sim.urge <= 88);
  $("stamBar").style.width = `${sim.stamina}%`;
  const holdPct = Math.min(100, (sim.holdTime / d.reverseHold) * 100);
  const holdBar = $("holdBar");
  holdBar.style.width = `${holdPct}%`;
  holdBar.classList.toggle("danger", holdPct > 75);
  holdBar.classList.toggle("warn", holdPct > 55 && holdPct <= 75);
  const btn = $("holdBtn");
  btn.classList.toggle("on", hold && sim.lockout <= 0);
  btn.classList.toggle("risk", holdPct > 55);
  btn.classList.toggle("boom", holdPct > 80);
  if (sim.lockout > 0) btn.textContent = "踏ん張り切れない…";
  else if (holdPct > 80) btn.textContent = "逆噴射寸前…！";
  else if (hold) btn.textContent = "我慢中…";
  else btn.textContent = "踏ん張る";
  const tint = $("camTint");
  if (sim.urge > 88) tint.style.background = "rgba(196,90,58,.28)";
  else if (sim.urge > 72) tint.style.background = "rgba(212,162,74,.18)";
  else if (holdPct > 70) tint.style.background = "rgba(212,162,74,.22)";
  else tint.style.background = "transparent";
  if (sim.event) {
    $("eventBanner").classList.remove("hidden");
    $("eventLabel").textContent = sim.event.label;
  } else $("eventBanner").classList.add("hidden");
  const shake = sim.trauma * sim.trauma;
  if (shake > 0.02) {
    $("wrap").style.transform = `translate(${(Math.random() * 2 - 1) * shake * 9}px, ${(Math.random() * 2 - 1) * shake * 7}px)`;
  } else $("wrap").style.transform = "";
}
function endGame(kind) {
  phase = kind; hold = false; stopVoice(); show("result");
  if (kind === "clear") {
    $("resultKicker").textContent = "STREAM COMPLETE";
    $("resultTitle").textContent = "配信、無事終了。";
    $("resultLead").textContent = `便意を我慢して、最後まで喋り切れました。視聴者は ${Math.round(sim.viewers)} 人。`;
    speak(LINES.clear.speech, voiceOn); writeBest(sim.viewers); renderBest();
  } else if (kind === "reverse") {
    $("resultKicker").textContent = "REVERSE THRUST";
    $("resultTitle").textContent = "逆噴射した。";
    $("resultLead").textContent = `踏ん張りすぎて限界を超えました。残り ${formatClock(sim.timeLeft)}。配信は強制終了です。`;
    speak(LINES.reverse.speech, voiceOn);
  } else {
    $("resultKicker").textContent = "STREAM INTERRUPTED";
    $("resultTitle").textContent = "トイレに駆け込んだ。";
    $("resultLead").textContent = `残り ${formatClock(sim.timeLeft)}。カツドンさんは席を立ち、配信は強制終了です。`;
    speak(LINES.over.speech, voiceOn);
  }
}
function startGame() {
  unlockVoice();
  resetSim();
  phase = "playing";
  $("chatList").innerHTML = "";
  pushChat();
  show("play");
  setLine("idle", pick(LINES.idle), true);
  paintPlay();
}

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (phase !== "playing") {
    sim.flash = Math.max(0, sim.flash - dt * 2.4);
    sim.trauma = Math.max(0, sim.trauma - dt * 1.6);
    return;
  }
  acc += dt;
  const d = DIFFS[difficulty];
  while (acc >= STEP) {
    acc -= STEP;
    sim.timeLeft -= STEP;
    sim.lockout = Math.max(0, sim.lockout - STEP);
    sim.flash = Math.max(0, sim.flash - STEP * 2.6);
    sim.trauma = Math.max(0, sim.trauma - STEP * 1.35);
    sim.nextChat -= STEP;
    const late = 1 - sim.timeLeft / d.seconds;
    const baseRise = d.baseRise + late * d.lateRise;
    const canHold = hold && sim.lockout <= 0 && sim.stamina > 0;
    if (canHold) {
      sim.holdTime += STEP;
      sim.stamina = Math.max(0, sim.stamina - d.stamDrain * STEP);
      sim.urge = Math.max(0, sim.urge - d.holdPower * STEP);
      if (sim.stamina <= 0) {
        sim.lockout = 0.7;
        sim.trauma = Math.min(1, sim.trauma + 0.28);
        sim.holdTime = 0;
      }
      if (sim.holdTime >= d.reverseHold) {
        sim.trauma = 1; endGame("reverse"); return;
      }
    } else {
      sim.holdTime = 0;
      sim.stamina = Math.min(100, sim.stamina + d.stamRecover * STEP);
      sim.urge += baseRise * STEP;
    }
    if (sim.event) {
      sim.eventT -= STEP;
      sim.urge += (sim.event.spike / 1.15) * d.eventSpikeScale * STEP;
      if (sim.eventT <= 0) sim.event = null;
    } else {
      eventCooldown -= STEP;
      if (eventCooldown <= 0) {
        const ev = pick(EVENTS);
        sim.event = ev; sim.eventT = 1.35; sim.flash = 1;
        sim.trauma = Math.min(1, sim.trauma + 0.45);
        eventCooldown = d.eventMin + Math.random() * (d.eventMax - d.eventMin) - late * 1.2;
        pushChat();
        setLine("event-" + ev.id, { text: ev.line, speech: ev.speech }, true);
      }
    }
    if (sim.nextChat <= 0) {
      pushChat();
      sim.nextChat = 1.1 + Math.random() * 1.4;
      sim.viewers += 0.7 + late * 1.6 + (canHold ? 0 : 0.45);
    }
    const holdPct = sim.holdTime / d.reverseHold;
    if (now - lastLineAt > 2800) {
      if (holdPct > 0.7 && canHold) setLine("reverseWarn", pick(LINES.reverseWarn), true);
      else if (sim.urge > 80) setLine("warn", pick(LINES.warn), true);
      else if (canHold) setLine("hold", pick(LINES.hold), true);
      else if (!sim.event) setLine("idle", pick(LINES.idle), true);
    }
    if (sim.urge >= 100) { sim.urge = 100; endGame("over"); return; }
    if (sim.timeLeft <= 0) { sim.timeLeft = 0; endGame("clear"); return; }
  }
  paintPlay();
}

function setDifficulty(next) {
  if (!DIFFS[next]) return;
  difficulty = next;
  try { localStorage.setItem("katsudon-game-diff", next); } catch {}
  document.querySelectorAll("#diff [data-diff]").forEach((b) => {
    const on = b.getAttribute("data-diff") === difficulty;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const desc = document.getElementById("diffDesc");
  if (desc) desc.textContent = DIFFS[difficulty].desc;
  const badge = document.getElementById("diffBadge");
  if (badge) badge.textContent = DIFFS[difficulty].label;
}
window.__setDiff = setDifficulty;

function bindDifficultyButtons() {
  const root = document.getElementById("diff");
  if (!root) return;
  root.querySelectorAll("[data-diff]").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    const apply = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const key = btn.getAttribute("data-diff");
      setDifficulty(key);
    };
    // Android WebView: pointerdown + click + touchend の三重バインド
    btn.addEventListener("pointerdown", apply, { passive: false });
    btn.addEventListener("touchend", apply, { passive: false });
    btn.addEventListener("click", apply);
    btn.onclick = apply;
  });
}
bindDifficultyButtons();

$("voiceToggle").onclick = () => {
  voiceOn = !voiceOn;
  localStorage.setItem("katsudon-game-voice", voiceOn ? "1" : "0");
  syncVoiceUI();
  if (!voiceOn) stopVoice();
  else { unlockVoice(); speak("すみ！", true); }
};
$("startBtn").onclick = () => { unlockVoice(); startGame(); };
$("retryBtn").onclick = () => {
  document.body.classList.remove("playing");
  show("title");
  phase = "title";
  $("wrap").style.transform = "";
};
const holdBtn = $("holdBtn");
const setHold = (v) => { hold = v; };
holdBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); setHold(true); });
holdBtn.addEventListener("pointerup", () => setHold(false));
holdBtn.addEventListener("pointercancel", () => setHold(false));
holdBtn.addEventListener("pointerleave", () => setHold(false));
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key === " ") { e.preventDefault(); setHold(true); }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.key === " ") { e.preventDefault(); setHold(false); }
});
window.addEventListener("pointerdown", () => unlockVoice(), { once: true });
(function initDiff() {
  let saved = "easy";
  try {
    const s = localStorage.getItem("katsudon-game-diff");
    if (s && DIFFS[s]) saved = s;
  } catch {}
  setDifficulty(saved);
})();
syncVoiceUI(); renderBest(); show("title");
requestAnimationFrame(tick);
