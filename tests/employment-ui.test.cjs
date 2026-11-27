const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const L = require("../ledger-core.js");
const E = require("../employment-core.js");

const els = {}, toasts = [], storage = new Map(), RBcalls = [], opened = [];
const makeEl = tag => ({ tag, dataset: {}, style: {}, value: "", checked: false, innerHTML: "", id: "", setAttribute() {}, addEventListener() {}, click() {}, remove() { delete els[this.id]; }, append() {} });
const listeners = {};
const ctx = {
  console, JSON, Math, Date, Number, String, Array, Object, Set, Map, BigInt, Promise, Error,
  setTimeout: fn => { fn(); return 0; }, clearTimeout() {},
  esc: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  iso: d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10), toast: m => toasts.push(m), render() {}, go() {},
  confirm: () => true, prompt: () => "", VIEWS: { more: () => "<div>more</div>" }, TABS: {},
  RB: { data: { settings: { currency: "USD" }, items: [], workers: [], profile: { role: "employee" } }, add() { RBcalls.push("add"); }, transact() { RBcalls.push("transact"); } },
  localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
  Blob: class { constructor(p) { this.text = p.join(""); } }, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  navigator: {}, FileReader: class {}, location: { protocol: "https:", origin: "https://rimbook.example", pathname: "/app/" },
  addEventListener: (n, fn) => { listeners[n] = fn; },
  document: { getElementById: id => els[id] || null, createElement: tag => makeEl(tag), body: { append(el) { if (el.id) els[el.id] = el; } } }
};
ctx.window = ctx; ctx.window.RimbookLedgerCore = L; ctx.window.RimbookEmploymentCore = E;
vm.createContext(ctx);
const run = f => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
run("employment.js"); run("install-share.js");
const set = (id, props) => { els[id] = Object.assign(makeEl("input"), { id }, props); };
const emp = () => JSON.parse(storage.get("rimbook_employment_v1"));
const rbBefore = JSON.stringify(ctx.RB.data);

assert.match(ctx.VIEWS.employment(), /جهات العمل والعاملون/);
assert.match(ctx.VIEWS.more(), /جهات العمل والأرشيف/); assert.match(ctx.VIEWS.more(), /مشاركة التطبيق/);

// employers + people
set("emp-ename", { value: "شركة النور" }); set("emp-ecur", { value: "USD" }); ctx.empAddEmployer();
set("emp-ename", { value: "ورشة الأمل" }); set("emp-ecur", { value: "EUR" }); ctx.empAddEmployer();
set("emp-pname", { value: "سالم" }); set("emp-pphone", { value: "" }); ctx.empAddPerson();
assert.equal(emp().employers.length, 2); assert.equal(emp().people.length, 1);
const [A, B] = emp().employers, P = emp().people[0];

// start an employment with a new worker typed inline
function fillStart(o) {
  ctx.empOpenStart(o.employerId, o.personId);
  set("es-person", { value: o.personId || "" }); set("es-newname", { value: o.newName || "" }); set("es-type", { value: o.type || "daily" });
  set("es-wage", { value: o.wage || "" }); set("es-hours", { value: "8" }); set("es-start", { value: o.start || "2026-01-01" });
  set("es-p-seeWage", { checked: true }); set("es-p-seeBalance", { checked: true }); set("es-p-addHours", { checked: !!o.addHours });
  ctx.empSaveStart(o.employerId);
}
fillStart({ employerId: A.id, personId: P.id, wage: "50.00", start: "2026-01-01", addHours: true });
assert.equal(emp().employments.length, 1);
const m1 = emp().employments[0];
assert.equal(m1.wageHistory[0].wage, 5000, "wage stored as integer minor units");
toasts.length = 0; fillStart({ employerId: A.id, personId: P.id, wage: "10", start: "2026-02-01" });
assert.equal(emp().employments.length, 1); assert.ok(toasts.some(t => /متداخلة/.test(t)), "overlap with the same employer refused");
fillStart({ employerId: B.id, personId: "", newName: "جديد", wage: "1.999" });
assert.equal(emp().people.length, 1, "a rejected form creates no worker");

// entries through the modal, with replay protection
function fillEntry(employmentId, o) {
  ctx.empOpenEntry(employmentId, o.kind);
  const modal = els["rimbook-emp-modal"]; assert.ok(modal);
  set("en-kind", { value: o.kind }); set("en-date", { value: o.date }); set("en-month", { value: o.month || "" }); set("en-hours", { value: o.hours || "" });
  set("en-amount", { value: o.amount || "" }); set("en-note", { value: "" });
  return modal;
}
const modal = fillEntry(m1.id, { kind: "work", date: "2026-01-05" }); ctx.empSaveEntry();
assert.equal(emp().entries.length, 1); assert.equal(emp().entries[0].amount, 5000);
els["rimbook-emp-modal"] = modal; fillEntry; set("en-kind", { value: "work" }); set("en-date", { value: "2026-01-05" }); set("en-month", { value: "" }); set("en-hours", { value: "" }); set("en-amount", { value: "" }); set("en-note", { value: "" });
ctx.empSaveEntry();
assert.equal(emp().entries.length, 1, "replaying the same form never records twice");
fillEntry(m1.id, { kind: "payment", date: "2026-01-31", amount: "30" }); ctx.empSaveEntry();
assert.equal(emp().entries.length, 2);
let html = (ctx.empGo("employment", m1.id), ctx.VIEWS.employment());
assert.match(html, /المتبقي للعامل/); assert.ok(html.includes("20.00 USD"), "balance 50 - 30 = 20.00 in the employer currency");

// end, move, and the old archive stays intact
ctx.empOpenEnd(m1.id); set("ee-date", { value: "2026-01-31" }); set("ee-reason", { value: "" }); ctx.empSaveEnd(m1.id);
assert.equal(emp().employments[0].endDate, "2026-01-31");
ctx.empOpenMove(P.id); // no open relation left -> refuses
assert.ok(toasts.some(t => /لا توجد علاقة عمل مفتوحة/.test(t)));
fillStart({ employerId: B.id, personId: P.id, wage: "12", type: "hourly", start: "2026-02-01" });
assert.equal(emp().employments.length, 2);
const m2 = emp().employments[1];
fillEntry(m2.id, { kind: "work", date: "2026-02-02" }); ctx.empSaveEntry();
assert.equal(emp().entries.length, 2, "hourly work without hours is rejected");
fillEntry(m2.id, { kind: "work", date: "2026-02-02", hours: "7.5" }); ctx.empSaveEntry();
assert.equal(emp().entries.at(-1).amount, 9000, "7.5 h x 12.00");
ctx.empGo("person", P.id); html = ctx.VIEWS.employment();
assert.match(html, /تاريخ العمل/); assert.match(html, /لا تُجمع مبالغ الجهات/);
assert.ok(html.includes("20.00 USD") && html.includes("90.00 EUR"), "each employer keeps its own balance and currency");
assert.equal(emp().entries.filter(e => e.employmentId === m1.id).length, 2, "old employer's records unchanged by the new job");

// the guided move
ctx.empGo("home"); set("emp-pname", { value: "منصور" }); set("emp-pphone", { value: "" }); ctx.empAddPerson();
const Q = emp().people[1];
fillStart({ employerId: A.id, personId: Q.id, wage: "100", type: "monthly", start: "2026-01-01" });
const q1 = emp().employments.at(-1);
ctx.empOpenMove(Q.id); set("em-from", { value: q1.id }); set("em-end", { value: "2026-02-10" }); set("em-to", { value: B.id });
set("em-type", { value: "daily" }); set("em-wage", { value: "40" }); set("em-hours", { value: "" }); set("em-start", { value: "2026-02-11" });
set("em-p-seeWage", { checked: true }); set("em-p-seeBalance", { checked: true }); set("em-p-addHours", { checked: false });
ctx.empSaveMove();
assert.equal(emp().employments.filter(m => m.personId === Q.id).length, 2);
assert.equal(emp().employments.find(m => m.id === q1.id).endDate, "2026-02-10");

// worker mode: permissions only change what the UI shows
ctx.empGo("employment", m1.id);
const managerHtml = ctx.VIEWS.employment();
ctx.RB.data.profile.role = "worker";
let sec = E.setPerms(emp(), m1.id, { seeWage: false, seeBalance: false }, {}); storage.set("rimbook_employment_v1", JSON.stringify(sec.store));
run("employment.js"); ctx.empGo("employment", m1.id);
const workerHtml = ctx.VIEWS.employment();
assert.ok(!workerHtml.includes("المتبقي للعامل") && !/50\.00 USD/.test(workerHtml), "hidden balance and wage in worker mode");
assert.ok(!workerHtml.includes("إلغاء القيد") && !workerHtml.includes("empOpenEnd"), "worker cannot reverse or end");
ctx.RB.data.profile.role = "employee";

// statements and exports are local; hostile text is escaped
ctx.empShare("person", P.id);
const shared = els["rimbook-emp-modal"].innerHTML;
assert.match(shared, /لا يُرسل شيء لأي خدمة قبل اختيارك/); assert.ok(shared.includes("شركة النور") && shared.includes("ورشة الأمل"));
set("emp-ename", { value: '<img src=x onerror=alert(1)>' }); set("emp-ecur", { value: "" }); ctx.empGo("home"); ctx.empAddEmployer();
assert.ok(!ctx.VIEWS.employment().includes("<img src=x"));
ctx.empExport("person", P.id); ctx.empExport("employment", m1.id); ctx.empExport();

// install & share helpers
assert.equal(ctx.RimbookInstallShare.canInstall(), false);
let prompted = false;
listeners.beforeinstallprompt({ preventDefault() {}, prompt: async () => { prompted = true; }, userChoice: Promise.resolve({ outcome: "accepted" }) });
assert.equal(ctx.RimbookInstallShare.canInstall(), true); assert.match(ctx.VIEWS.more(), /تثبيت التطبيق الآن/);
(async () => {
  const r = await ctx.RimbookInstallShare.install(); assert.equal(r.ok, true); assert.ok(prompted);
  assert.equal(ctx.RimbookInstallShare.canInstall(), false, "the prompt can only be used once");
  assert.equal((await ctx.RimbookInstallShare.install()).ok, false);
  let sharedArg = null; ctx.navigator.share = async a => { sharedArg = a; };
  assert.equal((await ctx.RimbookInstallShare.share()).via, "share");
  assert.match(sharedArg.text, /ريمبوك/); assert.ok(sharedArg.text.includes("https://rimbook.example/app/"));
  assert.ok(!/worker|عامل:|\d{3,}/.test(sharedArg.text.replace("https://rimbook.example/app/", "")), "the share text contains no user data");
  delete ctx.navigator.share; let copied = ""; ctx.navigator.clipboard = { writeText: async t => { copied = t; } };
  assert.equal((await ctx.RimbookInstallShare.share()).via, "copy"); assert.match(copied, /ريمبوك/);
  ctx.window.Capacitor = { isNativePlatform: () => true }; assert.equal(ctx.RimbookInstallShare.isInstalled(), true);

  assert.equal(JSON.stringify(ctx.RB.data.items) + JSON.stringify(ctx.RB.data.workers), "[][]", "no writes into the main workers data");
  assert.deepEqual(RBcalls, []);
  storage.set("rimbook_employment_v1", "{bad"); run("employment.js");
  assert.ok([...storage.keys()].some(k => k.startsWith("rimbook_employment_v1_corrupt_")), "damaged data is kept aside");
  console.log("Employment UI and install/share tests passed.");
})().catch(e => { console.error(e); process.exit(1); });
