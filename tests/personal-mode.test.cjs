const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const read = f => fs.readFileSync(require("node:path").join(__dirname, "..", f), "utf8");

function slice(src, start, end) {
  const a = src.indexOf(start), b = src.indexOf(end, a);
  assert.ok(a >= 0 && b > a, "cannot extract: " + start);
  return src.slice(a, b);
}

// ---- ownership scopes: personal / worker / admin never mix ----
const app = read("app.js");
const ownerSrc = slice(app, "window.rimbookOwner = (function", "function go(t){") ;
function ownerFor(profile, workers) {
  const ctx = { window: {}, RB: { data: { profile, workers } } };
  vm.runInNewContext(ownerSrc, ctx);
  return ctx.window.rimbookOwner;
}
const workers = [{ id: "w1", name: "علي", active: true }];
const personal = ownerFor({ role: "worker", workerId: "" }, workers);
assert.equal(personal.kind(), "personal", "a worker with no link is in personal mode, not blocked");
assert.equal(personal.owns({ scope: "personal" }), true);
assert.equal(personal.owns({ workerId: null }), false, "personal mode must not see manager rows that have no worker");
assert.equal(personal.owns({ workerId: "w1" }), false);
assert.equal(JSON.stringify(personal.fields()), JSON.stringify({ workerId: null, scope: "personal" }));

const linked = ownerFor({ role: "worker", workerId: "w1" }, workers);
assert.equal(linked.kind(), "worker");
assert.equal(linked.owns({ workerId: "w1" }), true);
assert.equal(linked.owns({ workerId: "w2" }), false);
assert.equal(linked.owns({ scope: "personal", workerId: "w1" }), false, "linked view must not mix personal rows in");

const staleLink = ownerFor({ role: "worker", workerId: "gone" }, workers);
assert.equal(staleLink.kind(), "personal", "a deleted worker record must degrade to personal mode, not an error wall");

const admin = ownerFor({ role: "employee" }, workers);
assert.equal(admin.kind(), "admin");
assert.equal(admin.owns({ workerId: "w1" }), true);
assert.equal(admin.owns({ scope: "personal" }), false, "administrative views must not show personal records");

// ---- schedule builder ----
const nb = read("notebook.js");
const buildSrc = slice(nb, "const weekdayName = day =>", "const closeShare");
function scheduleCtx(profile, items) {
  const data = { profile, workers, settings: { currency: "USD" }, items };
  const ctx = {
    window: {}, RB: { data, all: t => items.filter(i => i.type === t) },
    today: () => "2026-11-24",
    addDays: (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); },
    validDate: v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")),
    categoryLabel: c => ({ appointment: "موعد" }[c] || "تذكير"),
    Date, Math, Number, String, Set, Object
  };
  vm.runInNewContext(buildSrc, ctx);
  ctx.window.rimbookOwner = ownerFor(profile, workers);
  return ctx.window.rimbookBuildSchedule;
}
const items = [
  { type: "event", id: "e1", title: "دوام الموقع", d: "2026-11-25", t: "08:00", end: "16:00", notebookKind: "shift" },
  { type: "event", id: "e2", title: "موعد خارج الفترة", d: "2026-12-30", t: "10:00" },
  { type: "work", id: "p1", k: "work", d: "2026-11-24", normalHours: 8, otHours: 2, due: 50, scope: "personal", workerId: null },
  { type: "work", id: "p2", k: "payment", d: "2026-11-24", rec: 20, scope: "personal", workerId: null },
  { type: "work", id: "m1", k: "work", d: "2026-11-24", normalHours: 8, due: 999, workerId: "w1" },
  { type: "work", id: "m2", k: "payment", d: "2026-11-24", rec: 777, workerId: null }
];
const build = scheduleCtx({ role: "worker", workerId: "", name: "سالم" }, items);
const text = build({ from: "2026-11-24", to: "2026-11-30", recipient: "المدير", money: false });
assert.match(text, /سالم/); assert.match(text, /إلى: المدير/);
assert.match(text, /08:00–16:00 — دوام الموقع \(دوام\)/, "shifts appear with their time range");
assert.match(text, /يوم عمل — 8 ساعة \+ 2 إضافي/);
assert.ok(!text.includes("خارج الفترة"), "items outside the range are excluded");
assert.ok(!text.includes("999") && !text.includes("777"), "administrative records must never leak into a personal schedule");
assert.ok(!text.includes("المستحق") && !text.includes("دفعة مستلمة"), "money is hidden unless requested");
const withMoney = build({ from: "2026-11-24", to: "2026-11-30", money: true });
assert.match(withMoney, /المستحق: 50/); assert.match(withMoney, /المستلم: 20/); assert.match(withMoney, /المتبقي: 30/);

// ---- source-level guarantees for the design rules ----
const voice = read("voice-ledger.js");
const handler = slice(voice, "function handleVoiceTranscript(transcript){", "window.voiceLedgerConvertLast");
assert.ok(!/parseSpoken\(/.test(handler), "a transcript must never be parsed into a work/financial movement automatically");
assert.ok(handler.includes('type:"note"'), "a transcript is saved as a plain note");
assert.ok(voice.includes("window.voiceLedgerConvertLast") && voice.includes("pending=parsed"), "conversion is an explicit action that still goes through review");
const workforce = read("workforce.js"), pro = read("pro.js");
for (const [name, src] of [["workforce.js", workforce], ["pro.js", pro], ["voice-ledger.js", voice]]) {
  assert.ok(!/اربط ملف العامل من/.test(src) && !/يجب ربط حسابك بملف عامل/.test(src), name + " must not demand linking for personal use");
}
assert.ok(pro.includes("rimbookPersonalHome"), "worker home must work without a link");
assert.ok(workforce.includes("function personalLedger()"), "worker ledger must work without a link");
assert.ok(workforce.includes("rimbookSaveWorkerNotes"), "manager has a notes box per worker");
assert.ok(nb.includes('/^([01]\\d|2[0-3]):[0-5]\\d$/') && !nb.includes('[01]\\\\d'), "time validation regex must not be double-escaped");
const re = /^([01]\d|2[0-3]):[0-5]\d$/;
assert.ok(re.test("09:30") && re.test("23:59") && !re.test("24:00"));
const speech = read("offline-speech.js"), java = read("android-native/OfflineSpeechPlugin.java");
assert.ok(java.includes("runOnUiThread(()->beginOnlineOnMain(c))"), "SpeechRecognizer must run on the main thread");
assert.ok(speech.includes('startOnce(language, "online")') && speech.includes('startOnce(language, "local")'), "auto mode tries online then the local model");
console.log("Personal mode, scheduling and speech routing tests passed.");
