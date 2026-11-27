const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const D = require("../diary-core.js");

const els = {}, toasts = [], storage = new Map(), shareCalls = [], cacheHits = new Set();
const makeEl = tag => ({ tag, dataset: {}, style: {}, value: "", checked: false, innerHTML: "", textContent: "", id: "", setAttribute() {}, addEventListener() {}, click() {}, remove() { delete els[this.id]; }, append() {}, querySelector: () => ({ textContent: "", addEventListener() {}, style: {}, dataset: {} }) });
let scripts = ["./a.js", "./b.js", "./c.js"];
const ctx = {
  console, JSON, Math, Date, Number, String, Array, Object, Set, Map, BigInt, Promise, Error, RegExp,
  setTimeout: fn => { fn(); return 0; }, clearTimeout() {},
  esc: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  iso: d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10), toast: m => toasts.push(m), render() {}, go() {}, confirm: () => true, prompt: () => "", VIEWS: { more: () => "" }, TABS: {},
  RB: { data: { settings: {}, profile: {} } },
  localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
  Blob: class { constructor(p) { this.text = p.join(""); } }, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  navigator: { onLine: true }, location: { hash: "" }, Event: class { constructor(t) { this.type = t; } },
  FileReader: class { readAsText(f) { this.result = f.text; this.onload(); } },
  caches: { match: async s => cacheHits.has(s) ? {} : undefined },
  document: { getElementById: id => els[id] || null, createElement: tag => makeEl(tag), body: { append(el) { if (el.id) els[el.id] = el; } }, addEventListener() {}, querySelectorAll: () => scripts.map(s => ({ getAttribute: () => s })) }
};
ctx.window = ctx; ctx.window.RimbookLedgerCore = require("../ledger-core.js"); ctx.window.RimbookDiaryCore = D;
ctx.window.RimbookShare = { open: o => shareCalls.push(o) };
vm.createContext(ctx);
const run = f => vm.runInContext(read(f), ctx);
run("dictation.js"); run("diary.js");
const set = (id, props) => { els[id] = Object.assign(makeEl("input"), { id }, props); };
const st = () => JSON.parse(storage.get("rimbook_diary_v1") || '{"entries":[],"profile":{}}');
const count = () => ctx.RimbookData.diary.count();
const tick = () => new Promise(r => setImmediate(r));

(async () => {
  // fresh and blank
  assert.match(ctx.VIEWS.diary(), /مفكرتي اليومية/); assert.equal(count(), 0);
  // quick buttons: one tap for work/off, an exact amount for money
  ctx.diaryQuick("work"); assert.equal(count(), 1);
  ctx.diaryQuick("pay"); assert.ok(els["rimbook-diary-modal"], "money needs an amount");
  set("dq-amt", { value: "0" }); ctx.diaryQuickSave("pay"); assert.equal(count(), 1, "zero is rejected");
  set("dq-amt", { value: "12.345" }); ctx.diaryQuickSave("pay"); assert.equal(count(), 1, "three decimals are rejected, never rounded");
  set("dq-amt", { value: "1,200.50" }); ctx.diaryQuickSave("pay"); assert.equal(count(), 2); assert.equal(st().entries.find(e => e.type === "pay").amount, 120050);
  ctx.diaryUndo(); assert.equal(count(), 1, "undo restores the previous state");

  // ===== VOICE, Android app, NO internet: the bridge decides, the diary only previews =====
  ctx.window.Capacitor = { isNativePlatform: () => true }; ctx.navigator.onLine = false;
  let bridge = null; ctx.rimbookOfflineSpeechStart = async (lang, pref) => { bridge = [lang, pref]; return { transcript: "اليوم عملت وقبضت خمسمية" }; };
  const before = count();
  await ctx.diaryVoice();
  assert.deepEqual(bridge, ["ar", "auto"], "offline voice goes through the offline-capable bridge (no online gate)");
  assert.equal(count(), before, "nothing is saved until the user confirms");
  assert.ok(els["rimbook-diary-modal"].innerHTML.includes("هذا ما فهمته") && els["rimbook-diary-modal"].innerHTML.includes("500.00"), "a preview shows what was understood");
  ctx.diaryPreviewSave(); assert.equal(count(), before + 1, "work replaces today's earlier work status; the payment is added"); assert.equal(st().entries.filter(e => e.type === "work").length, 1); assert.ok(st().entries.some(e => e.type === "pay" && e.amount === 50000)); assert.ok(!els["rimbook-diary-modal"], "confirmed and closed");

  // a statement with a missing amount cannot be saved until it is fixed
  ctx.rimbookOfflineSpeechStart = async () => ({ transcript: "قبضت" });
  await ctx.diaryVoice(); toasts.length = 0; const n1 = count(); ctx.diaryPreviewSave();
  assert.equal(count(), n1); assert.ok(toasts.some(t => /المبالغ الناقصة/.test(t)));
  ctx.diaryPreviewAmount(0, "75"); ctx.diaryPreviewSave(); assert.equal(count(), n1 + 1);
  // the user can edit the transcript in the preview
  ctx.rimbookOfflineSpeechStart = async () => ({ transcript: "خصم عشرة" }); await ctx.diaryVoice();
  set("pv-text", { value: "خصم عشرين", setSelectionRange() {}, focus() {} }); set("pv-items", {}); ctx.diaryPreviewText("خصم عشرين");   // (the stub does not parse modal HTML, so provide the two fields a real DOM would have) assert.ok(els["rimbook-diary-modal"].innerHTML.includes("20.00"));
  ctx.diaryPreviewDrop(0); ctx.diaryPreviewSave(); assert.ok(toasts.at(-1) && /لا يوجد ما يُحفظ/.test(toasts.at(-1)), "an emptied preview saves nothing");
  els["rimbook-diary-modal"] && delete els["rimbook-diary-modal"];
  // engine failure (no model, no internet) explains what to do and saves nothing
  ctx.rimbookOfflineSpeechStart = async () => { throw new Error("لا يوجد اتصال بالإنترنت ومحرك العربية المحلي غير مثبت"); };
  toasts.length = 0; const n2 = count(); await ctx.diaryVoice(); assert.ok(toasts.some(t => /غير مثبت/.test(t))); assert.equal(count(), n2);

  // ===== plain browser, NO internet: honest failure, no fake offline voice =====
  ctx.window.Capacitor = undefined; ctx.SpeechRecognition = class { start() { throw new Error("must not start offline"); } };
  toasts.length = 0; await ctx.diaryVoice(); assert.ok(toasts.some(t => /يحتاج إنترنت/.test(t)), "a browser says it needs internet for voice"); assert.equal(count(), n2);
  ctx.navigator.onLine = true;

  // typed text uses the same preview (no silent save)
  set("dn-text", { value: "مكافأة 200" }); const n3 = count(); ctx.diaryParseNote(); assert.equal(count(), n3); ctx.diaryPreviewSave(); assert.equal(count(), n3 + 1);

  // ===== offline readiness: measured on the device, never assumed =====
  const ready = async (facts) => { Object.assign(ctx, facts.ctx || {}); set("diary-ready-box", { innerHTML: "" }); ctx.diaryGo("ready"); ctx.VIEWS.diary(); await tick(); await tick(); return els["diary-ready-box"].innerHTML; };
  ctx.window.Capacitor = { isNativePlatform: () => true }; ctx.rimbookOfflineSpeechCheck = async () => ({ languageStatus: "installed", microphone: true });
  let html = await ready({}); assert.ok(html.includes("🟢") && html.includes("الصوت دون إنترنت جاهز"));
  ctx.rimbookOfflineSpeechCheck = async () => ({ languageStatus: "missing" });
  html = await ready({}); assert.ok(html.includes("🟡") && html.includes("غير مثبتة"));
  ctx.window.Capacitor = undefined; ["./a.js", "./b.js", "./c.js", "./index.html"].forEach(s => cacheHits.add(s));
  html = await ready({}); assert.ok(html.includes("كل ملفات التطبيق مخزنة") && html.includes("يحتاج إنترنت دائماً"), "a browser never claims offline voice");
  cacheHits.delete("./b.js"); html = await ready({}); assert.ok(html.includes("🔴") && html.includes("b.js"), "a missing cached file is reported");
  // the live voice test shows the transcript without saving anything
  ctx.window.Capacitor = { isNativePlatform: () => true }; ctx.rimbookOfflineSpeechStart = async () => ({ transcript: "اختبار الصوت" });
  const n4 = count(); set("diary-ready-out", {}); await ctx.diaryVoiceTest(); assert.ok(els["diary-ready-out"].innerHTML.includes("اختبار الصوت")); assert.equal(count(), n4);

  // ===== importing the old standalone diary =====
  const old = { app: "mufakkirati", v: 2, entries: [{ id: 11.1, date: "2026-10-01", type: "work", amount: 0 }, { id: 12.1, date: "2026-10-02", type: "pay", amount: 100 }], profile: { name: "", dw: 40, cur: "$" } };
  const input = { files: [{ text: JSON.stringify(old) }], value: "x" }; const n5 = count();
  ctx.diaryImportOld(input); assert.equal(count(), n5 + 2); assert.equal(st().profile.dw, 4000);
  ctx.diaryImportOld({ files: [{ text: JSON.stringify(old) }], value: "x" }); assert.equal(count(), n5 + 2, "importing twice never duplicates");
  toasts.length = 0; ctx.diaryImportOld({ files: [{ text: '{"app":"other"}' }], value: "x" }); assert.ok(toasts.some(t => /ليس ملف نسخة/.test(t)));

  // ===== report goes through the share center with the manager prefilled =====
  set("pf-name", { value: "ياسر" }); set("pf-job", { value: "" }); set("pf-work", { value: "" }); set("pf-phone", { value: "" }); set("pf-email", { value: "" }); set("pf-city", { value: "" }); set("pf-cur", { value: "$" });
  set("pf-dw", { value: "50" }); set("pf-otr", { value: "10" }); set("mg-name", { value: "المدير" }); set("mg-wa", { value: "96170123456" }); set("mg-em", { value: "m@x.org" }); ctx.diarySaveProfile();
  assert.equal(st().profile.dw, 5000);
  ctx.diaryShareReport(); assert.equal(shareCalls.at(-1).phone, "96170123456"); assert.equal(shareCalls.at(-1).email, "m@x.org"); assert.match(shareCalls.at(-1).text, /تقرير/);
  set("pf-dw", { value: "5.555" }); toasts.length = 0; ctx.diarySaveProfile(); assert.ok(toasts.some(t => /الأجر غير صحيح/.test(t)));
  // hostile text is escaped
  set("dn-text", { value: '<img src=x onerror=alert(1)>' }); ctx.diaryParseNote(); ctx.diaryPreviewSave(); ctx.diaryGo("log"); assert.ok(!ctx.VIEWS.diary().includes("<img src=x"));
  console.log("Diary UI and offline readiness tests passed.");
})().catch(e => { console.error(e); process.exit(1); });
