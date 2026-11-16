(() => {
"use strict";
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const KEY = "qg_focus_v1", TIMER_KEY = "qg_timer_v2", PLANTS = "qg_plants";
const MIN = 1, MAX = 90, MAXTASKS = 20;
const CHIPS = [10, 15, 25, 45];

// ---------- Settings (saved in this browser) ----------
const cfg = { mins: 0, goal: "", tasks: [], env: "garden", vol: 40, away: true, chime: false, calm: false };
let timerMins = 0; // focus length from the Pomodoro timer page, if it has one saved
try { const t = JSON.parse(localStorage.getItem(TIMER_KEY)); const n = Math.round(+t.focus); if (n >= MIN && n <= MAX) timerMins = n; } catch (e) {}
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s && typeof s === "object") {
    const m = Math.round(+s.mins); if (m >= MIN && m <= MAX) cfg.mins = m;
    if (typeof s.goal === "string") cfg.goal = s.goal.slice(0, 80);
    if (["garden", "night", "rain", "minimal"].includes(s.env)) cfg.env = s.env;
    const v = Math.round(+s.vol); if (v >= 0 && v <= 100) cfg.vol = v;
    if (typeof s.away === "boolean") cfg.away = s.away;
    cfg.chime = s.chime === true; cfg.calm = s.calm === true;
    if (Array.isArray(s.tasks)) cfg.tasks = s.tasks.filter(t => t && typeof t.text === "string" && t.text.trim())
      .slice(0, MAXTASKS).map(t => ({ id: String(t.id || Math.random()).slice(0, 20), text: t.text.slice(0, 80), done: t.done === true }));
  }
} catch (e) {}
if (!cfg.mins) cfg.mins = timerMins || 25;
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };

// ---------- Elements ----------
const fmain = $("#fmain"), scene = $("#scene"), plantImg = $("#plant");
const ftime = $("#ftime"), stageEl = $("#stage"), pctEl = $("#pct"), pfill = $("#pfill"), msgEl = $("#msg"), countEl = $("#count");
const startBtn = $("#start"), endBtn = $("#end"), lenrow = $("#lenrow"), chipsEl = $("#chips");
const minus = $("#minus"), plus = $("#plus"), minsOut = $("#minsOut");
const goalIn = $("#goal"), goalline = $("#goalline"), goaltext = $("#goaltext");
const tasksEl = $("#tasks"), taskform = $("#taskform"), taskin = $("#taskin"), taskcount = $("#taskcount"), clearDone = $("#clearDone"), taskmsg = $("#taskmsg");
const calmBtn = $("#calmBtn"), awayBox = $("#awayBox"), chimeBox = $("#chimeBox"), vol = $("#vol");
const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
const fmt = ms => { const t = Math.ceil(ms / 1000); return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); };
const fmtAway = ms => { const s = Math.round(ms / 1000); return s < 60 ? s + " seconds" : Math.floor(s / 60) + " min" + (s % 60 ? " " + (s % 60) + " s" : ""); };

// ---------- Session state ----------
const S = { status: "idle", elapsed: 0, last: Date.now(), away: false, awayMs: 0, leaves: 0, bloom: false };
let note = "", noteUntil = 0, endArm = 0;
const total = () => cfg.mins * 60000;
const setNote = (t, ms) => { note = t; noteUntil = ms ? Date.now() + ms : Infinity; };

// ---------- Pixel plant (same drawing as the timer page) ----------
const cv = document.createElement("canvas"); cv.width = 25; cv.height = 28;
const g = cv.getContext("2d");
const C = { stem: "#3f9a55", stemD: "#2d7a42", leaf: "#62c870", leafD: "#3f9a55", soil: "#4a3226", soilL: "#6b4a3a",
            pot: "#b86f45", potD: "#8f522f", rim: "#cf8156", pet: "#ff8fb8", petD: "#e7639b", ctr: "#ffd84d", seed: "#e0c98a" };
function drawPlant(p) {
  g.clearRect(0, 0, 25, 28);
  const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  const row = (x1, x2, y, c) => { for (let x = x1; x <= x2; x++) px(x, y, c); };
  row(6, 18, 22, C.rim); row(7, 17, 23, C.pot); row(7, 17, 24, C.pot);
  row(8, 16, 25, C.pot); row(8, 16, 26, C.potD); row(9, 15, 27, C.potD);
  px(17, 23, C.potD); px(17, 24, C.potD); px(16, 25, C.pot);
  row(8, 16, 21, C.soil); px(10, 21, C.soilL); px(14, 21, C.soilL);
  const h = Math.min(15, Math.floor(p / 0.8 * 15));
  if (h === 0) { row(10, 14, 20, C.soil); px(12, 20, C.seed); }
  for (let i = 0; i < h; i++) px(12, 20 - i, i % 3 === 2 ? C.stemD : C.stem);
  [[3, 4], [6, 4], [9, 3], [12, 2]].forEach(([hk, cap]) => {
    if (h < hk) return;
    const s = Math.min(cap, 1 + Math.floor((h - hk) / 2)), ly = 20 - hk;
    for (let i = 1; i <= s; i++) {
      const y = ly - Math.floor(i / 2), c = i === s ? C.leafD : C.leaf;
      px(12 - i, y, c); px(12 + i, y, c);
      if (i >= 2) { px(12 - i, y + 1, C.leafD); px(12 + i, y + 1, C.leafD); }
    }
  });
  if (p >= 0.8 && p < 0.9) { px(12, 3, C.petD); row(11, 13, 4, C.pet); row(11, 13, 5, C.pet); row(11, 13, 6, C.leafD); }
  else if (p >= 0.9) {
    const r = p < 1 ? 2 : 3;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy; if (d2 > r * r) continue;
      px(12 + dx, 5 + dy, d2 <= (r === 2 ? 1 : 2) ? C.ctr : (d2 >= r * r - 1 ? C.petD : C.pet));
    }
  }
  plantImg.src = cv.toDataURL();
}
let lastKey = -1;
function updatePlant(p) { const k = p >= 1 ? 150 : Math.min(149, Math.floor(p * 150)); if (k === lastKey) return; lastKey = k; drawPlant(k / 150); }
const stageName = p => p >= 1 ? "Bloom" : p >= 0.9 ? "Opening" : p >= 0.8 ? "Bud" : p >= 0.5 ? "Growing" : p >= 0.2 ? "Seedling" : p > 0.04 ? "Sprout" : "Seed";

// ---------- Collection ----------
const plantTotal = () => { try { const a = JSON.parse(localStorage.getItem(PLANTS)); return Array.isArray(a) ? a.length : 0; } catch (e) { return 0; } };
function addPlant() {
  try {
    let a = JSON.parse(localStorage.getItem(PLANTS)); if (!Array.isArray(a)) a = [];
    a.push({ t: Date.now(), mins: cfg.mins, src: "focus", goal: cfg.goal.slice(0, 80) });
    localStorage.setItem(PLANTS, JSON.stringify(a.slice(-500)));
  } catch (e) {}
}

// ---------- Sound: ambient noise and a chime, both made in the browser ----------
let ac = null, master = null, cur = null;
const volGain = () => Math.pow(cfg.vol / 100, 2) * 0.6;
function audio() {
  try {
    if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); master = ac.createGain(); master.gain.value = volGain(); master.connect(ac.destination); }
    if (ac.state === "suspended") ac.resume();
    return ac;
  } catch (e) { return null; }
}
function noise(kind) {
  const len = ac.sampleRate * 3, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0), fade = Math.floor(ac.sampleRate * 0.05);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "white") d[i] = w; else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    if (i < fade) d[i] *= i / fade; else if (i > len - fade) d[i] *= (len - i) / fade;
  }
  return buf;
}
function stopSound() {
  if (!cur) return;
  const c = cur; cur = null;
  try { c.gain.gain.setTargetAtTime(0, ac.currentTime, 0.12); setTimeout(() => { try { c.src.stop(); c.lfo && c.lfo.stop(); } catch (e) {} }, 700); } catch (e) {}
}
function setSound(name) {
  stopSound();
  if (name === "off") return;
  const t = audio(); if (!t) return;
  try {
    const src = t.createBufferSource(), gn = t.createGain(); let lfo = null;
    src.buffer = noise(name === "rain" ? "white" : "brown"); src.loop = true; gn.gain.value = 0;
    if (name === "rain") {
      const hp = t.createBiquadFilter(), lp = t.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 700; lp.type = "lowpass"; lp.frequency.value = 6500;
      src.connect(hp); hp.connect(lp); lp.connect(gn);
    } else {
      const lp = t.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = name === "wind" ? 450 : 380;
      if (name === "wind") { lfo = t.createOscillator(); const lg = t.createGain(); lfo.frequency.value = 0.09; lg.gain.value = 220; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); }
      src.connect(lp); lp.connect(gn);
    }
    gn.connect(master); src.start();
    gn.gain.setTargetAtTime(name === "rain" ? 0.35 : 1, t.currentTime, 0.3);
    cur = { src, gain: gn, lfo };
  } catch (e) { cur = null; }
}
function chime() {
  if (!cfg.chime) return;
  const t = audio(); if (!t) return;
  try {
    const c = t.createGain(); c.gain.value = Math.max(0.35, volGain() / 0.6); c.connect(t.destination);
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = t.createOscillator(), v = t.createGain(), s = t.currentTime + i * 0.22;
      o.type = "sine"; o.frequency.value = f;
      v.gain.setValueAtTime(0.0001, s); v.gain.exponentialRampToValueAtTime(0.07, s + 0.03); v.gain.exponentialRampToValueAtTime(0.0001, s + 1.3);
      o.connect(v); v.connect(c); o.start(s); o.stop(s + 1.4);
    });
  } catch (e) {}
}

function celebrate() {
  if (reduce) return;
  const cols = ["#ff8fb8", "#f2c14e", "#5cc46a", "#ffffff"];
  for (let i = 0; i < 18; i++) {
    const s = document.createElement("i"); s.className = "fx";
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 90;
    s.style.setProperty("--dx", Math.cos(a) * d + "px"); s.style.setProperty("--dy", (Math.sin(a) * d - 40) + "px");
    s.style.background = cols[i % cols.length]; scene.appendChild(s); setTimeout(() => s.remove(), 1300);
  }
}

// ---------- Timekeeping: time only counts while you are here ----------
const awayNow = () => cfg.away && (document.hidden || !document.hasFocus());
function account() {
  const now = Date.now(), raw = Math.max(0, now - S.last); S.last = now;
  if (S.status === "running") { if (S.away) S.awayMs += raw; else S.elapsed += Math.min(raw, 1500); }
  const a = S.status === "running" && awayNow();
  if (a !== S.away) {
    S.away = a;
    if (a) S.leaves++; else setNote("Welcome back! Your plant waited for you.", 8000);
  }
}
function tick() {
  account();
  if (S.status === "running" && S.elapsed >= total()) { finish(); return; }
  render();
}
function start() {
  S.status = "running"; S.elapsed = 0; S.awayMs = 0; S.leaves = 0; S.bloom = false; S.away = false; S.last = Date.now();
  setNote("", 1); endArm = 0; render();
}
function pause() { account(); S.status = "paused"; S.away = false; setNote("Paused. It's okay to take a break.", 0); render(); }
function resume() { S.last = Date.now(); S.status = "running"; setNote("", 1); render(); }
function finish() {
  S.status = "idle"; S.bloom = true; S.away = false; addPlant(); celebrate(); chime();
  setNote("Bloom! Your plant is in your collection." + (S.awayMs > 3000 ? " You stepped away for " + fmtAway(S.awayMs) + ", and your plant waited." : " Nicely done."), 0);
  render();
}
function endEarly() {
  if (S.status === "idle") return;
  if (!endArm || Date.now() > endArm) { endArm = Date.now() + 4000; render(); return; }
  endArm = 0; account(); S.status = "idle"; S.elapsed = 0; S.away = false; S.bloom = false;
  setNote("Session ended. No plant this time, and that's okay. Ready when you are.", 0); render();
}
startBtn.addEventListener("click", () => { audio(); if (S.status === "running") pause(); else if (S.status === "paused") resume(); else start(); });
endBtn.addEventListener("click", endEarly);
["visibilitychange", "blur", "focus", "pageshow"].forEach(ev => (ev === "visibilitychange" ? document : window).addEventListener(ev, tick));

// ---------- Length ----------
function setMins(v) {
  v = Math.round(clamp(v, MIN, MAX));
  if (S.status !== "idle" || v === cfg.mins) return;
  cfg.mins = v; S.bloom = false; setNote("", 1); persist(); render();
}
minus.addEventListener("click", () => setMins(cfg.mins - 1));
plus.addEventListener("click", () => setMins(cfg.mins + 1));
function buildChips() {
  chipsEl.textContent = "";
  const list = CHIPS.map(n => ({ n, label: n + " min" }));
  if (timerMins && !CHIPS.includes(timerMins)) list.push({ n: timerMins, label: "My timer: " + timerMins });
  list.forEach(c => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = c.label; b.dataset.n = c.n;
    b.addEventListener("click", () => setMins(c.n)); chipsEl.appendChild(b);
  });
}

// ---------- Goal and steps ----------
goalIn.value = cfg.goal;
goalIn.addEventListener("input", () => { cfg.goal = goalIn.value.slice(0, 80); persist(); render(); });
const say = t => setText(taskmsg, t);
function renderTasks() {
  tasksEl.textContent = "";
  cfg.tasks.forEach(t => {
    const li = document.createElement("li"); if (t.done) li.className = "done";
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = t.done; cb.id = "t" + t.id;
    const lb = document.createElement("label"); lb.htmlFor = cb.id; lb.textContent = t.text;
    const d = document.createElement("button"); d.type = "button"; d.className = "del"; d.textContent = "×"; d.setAttribute("aria-label", "Delete step: " + t.text);
    cb.addEventListener("change", () => {
      t.done = cb.checked; persist(); renderTasks();
      say(t.done ? (cfg.tasks.every(x => x.done) ? "Every step is done. That's real progress." : "Nice. One step down.") : "");
    });
    d.addEventListener("click", () => { cfg.tasks = cfg.tasks.filter(x => x !== t); persist(); renderTasks(); say("Step removed."); });
    li.append(cb, lb, d); tasksEl.appendChild(li);
  });
  const done = cfg.tasks.filter(t => t.done).length;
  setText(taskcount, cfg.tasks.length ? done + " of " + cfg.tasks.length + " done" : "No steps yet. Add the first small one.");
  clearDone.hidden = done === 0;
}
taskform.addEventListener("submit", e => {
  e.preventDefault();
  const text = taskin.value.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!text) { say("Write a step first."); return; }
  if (cfg.tasks.length >= MAXTASKS) { say("That's " + MAXTASKS + " steps. Finish or clear some first."); return; }
  cfg.tasks.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text, done: false });
  taskin.value = ""; persist(); renderTasks(); say(""); taskin.focus();
});
clearDone.addEventListener("click", () => { cfg.tasks = cfg.tasks.filter(t => !t.done); persist(); renderTasks(); say("Finished steps cleared."); });

// ---------- Your space ----------
function paintGroup(box, attr, val) { box.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset[attr] === val))); }
function setEnv(e) { cfg.env = e; scene.dataset.env = e; paintGroup($("#envs"), "env", e); persist(); }
$("#envs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setEnv(b.dataset.env); });
$("#sounds").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; paintGroup($("#sounds"), "sound", b.dataset.sound); setSound(b.dataset.sound); });
vol.value = cfg.vol;
vol.addEventListener("input", () => { cfg.vol = +vol.value; persist(); if (master) master.gain.setTargetAtTime(volGain(), ac.currentTime, 0.05); });
awayBox.checked = cfg.away; chimeBox.checked = cfg.chime;
awayBox.addEventListener("change", () => { cfg.away = awayBox.checked; persist(); tick(); });
chimeBox.addEventListener("change", () => { cfg.chime = chimeBox.checked; persist(); if (cfg.chime) chime(); });
function setCalm(on) { cfg.calm = on; fmain.classList.toggle("calm", on); calmBtn.setAttribute("aria-pressed", String(on)); setText(calmBtn, on ? "Show everything" : "Distraction-free view"); persist(); }
calmBtn.addEventListener("click", () => setCalm(!cfg.calm));

// ---------- Render ----------
function baseMsg(p) {
  if (S.bloom && S.status === "idle") return "Bloom! Your plant is in your collection.";
  if (S.status === "idle") return "Press Start to plant your seed.";
  if (S.status === "paused") return "Paused. It's okay to take a break.";
  if (S.away) return "Paused while you're away. Your plant is waiting for you.";
  if (p < 0.25) return "Your seed is sprouting. One step at a time.";
  if (p < 0.6) return "Growing nicely. You're making progress.";
  if (p < 0.9) return "Almost in bud. Stay with it.";
  return "Nearly in bloom!";
}
function render() {
  const idle = S.status === "idle", running = S.status === "running";
  const p = clamp(idle ? (S.bloom ? 1 : 0) : S.elapsed / total(), 0, 1);
  setText(ftime, fmt(idle ? total() : total() - S.elapsed));
  updatePlant(p); scene.style.setProperty("--p", p.toFixed(3));
  scene.classList.toggle("away", running && S.away);
  setText(stageEl, stageName(p)); setText(pctEl, Math.floor(p * 100) + "%"); pfill.style.width = Math.floor(p * 100) + "%";
  setText(msgEl, (note && Date.now() < noteUntil) ? note : baseMsg(p));
  setText(startBtn, idle ? "Start session" : running ? "Pause" : "Resume");
  endBtn.disabled = idle;
  const armed = endArm && Date.now() < endArm; endBtn.dataset.confirm = armed ? "1" : "";
  setText(endBtn, armed ? "Tap again to end" : "End early");
  lenrow.hidden = !idle;
  setText(minsOut, cfg.mins + " min"); minus.disabled = cfg.mins <= MIN; plus.disabled = cfg.mins >= MAX;
  chipsEl.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.n === cfg.mins)));
  setText(countEl, String(plantTotal()));
  const goal = cfg.goal.trim(); goalline.hidden = !goal; setText(goaltext, goal);
  document.title = running ? fmt(total() - S.elapsed) + " · Focus Mode | QuizGarden" : "Focus Mode | QuizGarden";
}

buildChips(); renderTasks(); setEnv(cfg.env); setCalm(cfg.calm); render();
setInterval(tick, 250);
})();
