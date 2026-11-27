const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const Core = require("../ledger-core.js");
const Cal = require("../calendar-core.js");

const els = {}, toasts = [], storage = new Map(), RBcalls = [];
const makeEl = tag => ({ tag, dataset: {}, style: {}, value: "", checked: false, innerHTML: "", id: "", setAttribute() {}, addEventListener() {}, click() {}, remove() { delete els[this.id]; }, append() {} });
const ctx = {
  console, JSON, Math, Date, Number, String, Array, Object, Set, Map, BigInt, Promise, Error,
  setTimeout: fn => { fn(); return 0; }, clearTimeout() {},
  esc: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  iso: d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10), toast: m => toasts.push(m), render() {}, go() {},
  confirm: () => true, prompt: () => "1", VIEWS: { more: () => "<div>more</div>" }, TABS: {},
  RB: { data: { settings: { currency: "USD" }, items: [], workers: [], projects: [{ name: "مشروع الفيلا" }] }, add() { RBcalls.push("add"); }, transact() { RBcalls.push("transact"); } },
  localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
  Blob: class { constructor(p) { this.text = p.join(""); } }, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  navigator: {}, FileReader: class {},
  document: { getElementById: id => els[id] || null, createElement: tag => makeEl(tag), body: { append(el) { if (el.id) els[el.id] = el; } } }
};
ctx.window = ctx; ctx.window.RimbookLedgerCore = Core; ctx.window.RimbookCalendarCore = Cal;
vm.createContext(ctx);
const run = f => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
run("ledgers.js"); run("calendar.js");
const set = (id, props) => { els[id] = Object.assign(makeEl("input"), { id }, props); };
const rbBefore = JSON.stringify(ctx.RB.data);
const cal = () => JSON.parse(storage.get("rimbook_calendar_v1"));
const led = () => JSON.parse(storage.get("rimbook_ledgers_v1"));

// views render in all three modes
for (const v of ["month", "week", "day"]) { ctx.calSetView(v); const html = ctx.VIEWS.calendar(); assert.match(html, /التقويم/); }
assert.ok(ctx.TABS.calendar); assert.match(ctx.VIEWS.more(), /التقويم والملاحظات/);

// a normal note stays out of every account
function fillItem(o) {
  ctx.calOpenItem(o.type || "note", o.date || "2026-11-25");
  const m = els["rimbook-cal-modal"]; assert.ok(m);
  set("ci-type", { value: o.type || "note" }); set("ci-title", { value: o.title || "" }); set("ci-date", { value: o.date || "2026-11-25" });
  set("ci-time", { value: o.time || "" }); set("ci-body", { value: o.body || "" });
  ctx.__calMode = o.mode || "none";
  set("ci-kind", { value: o.kind || "expense" }); set("ci-amount", { value: o.amount || "" }); set("ci-cat", { value: o.cat || "" }); set("ci-party", { value: o.party || "" });
  return m;
}
fillItem({ title: "ملاحظة عادية", body: "نص", mode: "none" }); ctx.calSaveItem();
assert.equal(cal().items.length, 1); assert.equal(cal().items[0].finance.mode, "none");
assert.equal(storage.get("rimbook_ledgers_v1"), undefined, "a normal note creates nothing in the ledgers");

// a financial note is a draft only
fillItem({ title: "دفعة الإسمنت", mode: "party", kind: "payable", amount: "2,500.00", party: "مورد الإسمنت", cat: "مواد", date: "2026-11-26" }); ctx.calSaveItem();
assert.equal(cal().items.length, 2);
assert.equal(cal().items[1].finance.amount, 250000);
assert.equal(storage.get("rimbook_ledgers_v1"), undefined, "a financial draft is not a ledger entry");
let html = ctx.VIEWS.calendar(); ctx.calGoDay("2026-11-26"); html = ctx.VIEWS.calendar();
assert.match(html, /مسودة مالية/); assert.match(html, /لم تدخل أي حساب/);

// invalid amount is rejected
fillItem({ title: "x", mode: "ledger", kind: "expense", amount: "1.999" }); ctx.calSaveItem();
assert.equal(cal().items.length, 2); assert.ok(toasts.some(t => /خانتان/.test(t)));
delete els["rimbook-cal-modal"];

// posting needs a ledger, then explicit consent
const draftId = cal().items[1].id;
ctx.calPost(draftId);
assert.equal(storage.get("rimbook_ledgers_v1"), undefined, "no ledger yet: nothing recorded");
set("lb-name", { value: "ورشة" }); set("lb-cur", { value: "USD" }); ctx.ledgerCreateBook();
ctx.calPost(draftId);
assert.ok(els["rimbook-cal-modal"].innerHTML.includes("2,500.00"), "preview shows the amount before posting");
set("cp-book", { value: led().books[0].id }); set("cp-consent", { checked: false }); set("cp-cash", { checked: false });
ctx.calPostConfirm();
assert.equal(led().entries.length, 0, "no consent, no entry");
els["cp-consent"].checked = true;
const modal = els["rimbook-cal-modal"];
ctx.calPostConfirm();
assert.equal(led().entries.length, 1); assert.equal(led().entries[0].amount, 250000); assert.equal(led().entries[0].kind, "payable");
assert.ok(cal().items[1].posted, "note is marked as posted");

// replaying the confirmation (double tap / retry) never records twice
els["rimbook-cal-modal"] = modal; els["cp-consent"].checked = true;
ctx.calPostConfirm();
assert.equal(led().entries.length, 1, "second confirmation is ignored");
ctx.calPost(draftId);
assert.ok(toasts.some(t => /رُحِّلت/.test(t)));

// crash between the two saves: ledger has it, calendar does not -> retry reconciles without duplicating
const s = cal(); s.items[1].posted = null; storage.set("rimbook_calendar_v1", JSON.stringify(s));
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "calendar.js"), "utf8"), ctx);   // reload from storage
ctx.calPost(draftId);
els["cp-book"] = Object.assign(makeEl("select"), { id: "cp-book", value: led().books[0].id }); set("cp-consent", { checked: true }); set("cp-cash", { checked: false });
ctx.calPostConfirm();
assert.equal(led().entries.length, 1, "reconciled with the existing entry");
assert.ok(cal().items[1].posted && cal().items[1].posted.entryId === led().entries[0].id);

// reverse in the ledger -> note shows warning and can be unlinked and re-posted once
ctx.ledgerReverseEntry(led().entries[0].id);
ctx.calGoDay("2026-11-26"); html = ctx.VIEWS.calendar(); assert.match(html, /أُلغي القيد في الدفتر/);
ctx.calUnlink(draftId); assert.equal(cal().items[1].posted, null);
ctx.calPost(draftId); set("cp-book", { value: led().books[0].id }); set("cp-consent", { checked: true }); set("cp-cash", { checked: false });
ctx.calPostConfirm();
const active = Core.effectiveEntries(led().entries);
assert.equal(active.length, 1, "exactly one active entry after the deliberate re-post");

// hostile text is escaped
fillItem({ title: '<img src=x onerror=alert(1)>', date: "2026-11-27" }); ctx.calSaveItem();
ctx.calGoDay("2026-11-27"); assert.ok(!ctx.VIEWS.calendar().includes("<img src=x"));

// search + navigation + backup
ctx.calSearch("الإسمنت"); assert.match(ctx.VIEWS.calendar(), /نتائج البحث \(1\)/);
ctx.calSetView("month"); const d0 = ctx.window.eval ? null : null;
ctx.calExport(); assert.ok(toasts.some(t => /النسخة الاحتياطية/.test(t)));

// isolation: no writes into the main app data
assert.equal(JSON.stringify(ctx.RB.data), rbBefore); assert.deepEqual(RBcalls, []);

// damaged storage is preserved
storage.set("rimbook_calendar_v1", "{oops"); run("calendar.js");
assert.ok([...storage.keys()].some(k => k.startsWith("rimbook_calendar_v1_corrupt_")));
console.log("Calendar UI smoke tests passed.");
