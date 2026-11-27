const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const jsFiles = fs.readdirSync(root).filter(f => f.endsWith(".js"));

/* ---------- 1. the shipped source contains no demo/sample data or accounts ---------- */
const app = read("app.js");
const def = app.slice(app.indexOf("const def = () => ({"), app.indexOf("const normalizeData"));
assert.ok(/profile:\s*\{\s*name:\s*""/.test(def), "default profile has no name");
assert.ok(/items:\s*\[\],\s*habits:\s*\[\],\s*goals:\s*\[\],\s*projects:\s*\[\],\s*workers:\s*\[\],\s*purchases:\s*\[\],\s*contacts:\s*\[\],\s*invoices:\s*\[\]/.test(def), "every default list is empty");
for (const f of jsFiles) {
  const src = read(f);
  for (const key of ["items", "workers", "projects", "invoices", "purchases", "contacts", "entries", "employers", "people", "employments", "books"]) {
    assert.ok(!new RegExp("\\b" + key + "\\s*:\\s*\\[\\s*\\{").test(src), f + " must not seed " + key);
  }
  assert.ok(!src.includes("ياسر الحسين"), f + " must not carry the old diary's default personal name");
}
assert.ok(!fs.existsSync(path.join(root, "firebase-config.js")), "no cloud account configuration is shipped");

/* ---------- 2. a fresh install starts completely empty ---------- */
const els = {}, toasts = [], storage = new Map(), sess = new Map(), RBcalls = [], alarmSyncs = [];
const makeEl = tag => ({ tag, dataset: {}, style: {}, value: "", checked: false, innerHTML: "", id: "", setAttribute() {}, addEventListener() {}, click() {}, remove() { delete els[this.id]; }, append() {}, querySelector: () => ({ textContent: "", addEventListener() {}, style: {}, dataset: {} }) });
const store = m => ({ getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), get length() { return m.size; }, key: i => [...m.keys()][i] ?? null });
const ctx = {
  console, JSON, Math, Date, Number, String, Array, Object, Set, Map, BigInt, Promise, Error, RegExp,
  setTimeout: fn => { fn(); return 0; }, clearTimeout() {},
  esc: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  iso: d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10), toast: m => toasts.push(m), render() {}, go() {}, confirm: () => true, prompt: () => "", VIEWS: { more: () => "<div>more</div>" }, TABS: {},
  RB: { data: { settings: { currency: "$" }, items: [], workers: [], projects: [], invoices: [], purchases: [], contacts: [], profile: { name: "", role: "employee" } }, add() { RBcalls.push("add"); }, transact() { RBcalls.push("transact"); } },
  localStorage: store(storage), sessionStorage: store(sess), Blob: class {}, File: class {}, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  navigator: { onLine: true }, FileReader: class {}, location: { protocol: "https:", origin: "https://x.example", pathname: "/", hash: "", href: "https://x.example/" },
  Event: class { constructor(t) { this.type = t; } },
  document: { getElementById: id => els[id] || null, createElement: tag => makeEl(tag), body: { append(el) { if (el.id) els[el.id] = el; } }, addEventListener() {}, querySelectorAll: () => [] }
};
ctx.window = ctx;
ctx.window.RimbookLedgerCore = require("../ledger-core.js"); ctx.window.RimbookCalendarCore = require("../calendar-core.js"); ctx.window.RimbookEmploymentCore = require("../employment-core.js");
ctx.window.RimbookProjectsCore = require("../projects-core.js"); ctx.window.RimbookDiaryCore = require("../diary-core.js");
ctx.window.RimbookAlarms = { sync: async a => { alarmSyncs.push(a); }, syncFromCalendar() {} };
vm.createContext(ctx);
const run = f => vm.runInContext(read(f), ctx);
for (const f of ["ledgers.js", "calendar.js", "employment.js", "projects.js", "share-center.js", "backup-all.js", "diary.js", "wipe-all.js"]) run(f);

(async () => {
  const mods = Object.keys(ctx.RimbookData);
  assert.deepEqual(mods.sort(), ["calendar", "diary", "employment", "ledgers", "projects"]);
  for (const k of mods) assert.equal(ctx.RimbookData[k].count(), 0, k + " starts empty");
  assert.equal(ctx.RimbookWipe.inventory().length, 0, "nothing to wipe on a clean install");
  assert.equal(ctx.RimbookLedgers.books().length, 0, "no default accounts/books");
  assert.equal(ctx.RimbookProjects.list().length, 0);
  const diary = JSON.parse(JSON.stringify(ctx.RimbookData.diary.export().data));
  assert.equal(diary.profile.name, ""); assert.equal(diary.profile.dw, 0); assert.equal(diary.profile.otr, 0); assert.equal(diary.profile.cur, ""); assert.equal(diary.entries.length, 0);
  assert.deepEqual(RBcalls, []);

  /* ---------- 3. the explicit wipe removes everything, and only what belongs to Rimbook ---------- */
  const set = (id, props) => { els[id] = Object.assign(makeEl("input"), { id }, props); };
  set("lb-name", { value: "ورشة" }); set("lb-cur", { value: "USD" }); ctx.ledgerCreateBook();
  const bookId = ctx.RimbookLedgers.books()[0].id; ctx.RimbookLedgers.post({ bookId, kind: "income", amount: 12345, date: "2026-11-20" });
  set("emp-ename", { value: "شركة" }); set("emp-ecur", { value: "USD" }); ctx.empAddEmployer();
  set("pj-name", { value: "مشروع" }); set("pj-client", { value: "" }); set("pj-desc", { value: "" }); set("pj-main", { value: "" }); set("pj-account", { checked: false }); ctx.projCreate();
  ctx.diaryQuick("work");
  storage.set("rimbook.v6", JSON.stringify({ items: [{ id: 1 }], workers: [{ id: 2 }] })); ctx.RB.data.items = [{ id: 1 }]; ctx.RB.data.workers = [{ id: 2 }];
  storage.set("rimbook_recipients_v1", JSON.stringify([{ id: "r1", name: "المدير", phone: "1", email: "" }]));
  storage.set("rimbook_ledgers_prev", "{}"); storage.set("rimbook_calendar_v1_corrupt_123", "{bad"); sess.set("rimbook_tmp", "1");
  storage.set("unrelated_site_key", "keep me");
  const inv = ctx.RimbookWipe.inventory(); const total = inv.reduce((a, r) => a + r.count, 0);
  assert.ok(inv.some(r => /الدفاتر/.test(r.label)) && inv.some(r => /العمال/.test(r.label)) && total >= 6, "the inventory lists what will be erased");
  assert.ok([...storage.keys()].filter(k => /^rimbook/.test(k)).length >= 6);

  assert.equal(ctx.RimbookWipe.confirmed(""), false); assert.equal(ctx.RimbookWipe.confirmed("delete"), false); assert.equal(ctx.RimbookWipe.confirmed(" امسح "), true);
  ctx.wipeAllOpen(); assert.ok(els["rimbook-wipe-modal"].innerHTML.includes("لا يمكن التراجع"));
  set("wipe-word", { value: "خطأ" }); await ctx.wipeAllGo();
  assert.ok(storage.has("rimbook.v6"), "without the typed word nothing is erased");

  let reloads = 0; const res = await ctx.RimbookWipe.run({ reloadFn: () => { reloads++; } });
  assert.deepEqual([...storage.keys()], ["unrelated_site_key"], "every rimbook key (data, snapshots, corrupt copies) is gone; other sites' keys are untouched");
  assert.equal(sess.size, 0); assert.ok(res.removed >= 7); assert.equal(res.left.length, 0); assert.equal(reloads, 1, "the app reloads into a clean state");
  assert.equal(alarmSyncs.length, 1); assert.equal(JSON.stringify(alarmSyncs[0]), "[]", "scheduled phone reminders are cancelled");
  // after reloading from the wiped storage every module is empty again
  const ctx2 = Object.assign({}, ctx); delete ctx2.RimbookData;
  const fresh = vm.createContext(Object.assign({}, ctx, { window: null, RimbookData: undefined })); fresh.window = fresh; fresh.RimbookLedgerCore = ctx.RimbookLedgerCore; fresh.RimbookCalendarCore = ctx.RimbookCalendarCore; fresh.RimbookEmploymentCore = ctx.RimbookEmploymentCore; fresh.RimbookProjectsCore = ctx.RimbookProjectsCore; fresh.RimbookDiaryCore = ctx.RimbookDiaryCore;
  for (const f of ["ledgers.js", "calendar.js", "employment.js", "projects.js", "diary.js"]) vm.runInContext(read(f), fresh);
  for (const k of Object.keys(fresh.RimbookData)) assert.equal(fresh.RimbookData[k].count(), 0, k + " is empty after the wipe");
  console.log("Clean start and wipe tests passed.");
})().catch(e => { console.error(e); process.exit(1); });
