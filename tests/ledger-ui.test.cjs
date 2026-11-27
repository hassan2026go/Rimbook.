const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const core = require("../ledger-core.js");

const els = {}; const toasts = []; const downloads = []; const storage = new Map();
const makeEl = tag => ({ tag, dataset: {}, style: {}, value: "", checked: false, innerHTML: "", id: "",
  setAttribute() {}, addEventListener() {}, click() { if (tag === "a") downloads.push({ name: this.download, href: this.href }); },
  remove() { delete els[this.id]; }, append() {} });
const blobs = new Map(); let blobN = 0;
const RBcalls = [];
const ctx = {
  console, JSON, Math, Date, Number, String, Array, Object, Set, Map, BigInt, Promise, Error,
  setTimeout: fn => { fn(); return 0; }, clearTimeout() {},
  esc: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  iso: d => d.toISOString().slice(0, 10), toast: m => toasts.push(m), render() {}, go() {},
  confirm: () => true, prompt: () => "1",
  VIEWS: { more: () => "<div>more</div>" }, TABS: {},
  RB: { data: { settings: { currency: "USD" }, items: [], workers: [] }, add() { RBcalls.push("add"); }, transact() { RBcalls.push("transact"); } },
  localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
  Blob: class { constructor(p) { this.text = p.join(""); } }, File: class { constructor(p, n) { this.text = p.join(""); this.name = n; } },
  URL: { createObjectURL: b => { const u = "blob:" + (++blobN); blobs.set(u, b.text); return u; }, revokeObjectURL() {} },
  navigator: {}, FileReader: class {},
  document: { getElementById: id => els[id] || null, createElement: tag => makeEl(tag), body: { append(el) { if (el.id) els[el.id] = el; } } }
};
ctx.window = ctx; ctx.window.RimbookLedgerCore = core;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "ledgers.js"), "utf8"), ctx);
const set = (id, props) => { els[id] = Object.assign(makeEl("input"), { id }, props); };
const rbBefore = JSON.stringify(ctx.RB.data);

assert.match(ctx.VIEWS.ledgers(), /لا توجد دفاتر/);
assert.ok(ctx.TABS.ledgers && ctx.TABS.calculator);
assert.match(ctx.VIEWS.more(), /الدفاتر الجانبية/);

// create a book
set("lb-name", { value: "ورشة" }); set("lb-cur", { value: "USD" });
ctx.ledgerCreateBook();
const saved = () => JSON.parse(storage.get("rimbook_ledgers_v1"));
assert.equal(saved().books.length, 1);
const bookId = saved().books[0].id;

// add an entry through the modal
function fill(v) {
  set("le-kind", { value: v.kind }); set("le-amount", { value: v.amount }); set("le-date", { value: v.date || "2026-11-20" });
  set("le-category", { value: v.category || "" }); set("le-party", { value: v.party || "" }); set("le-note", { value: v.note || "" });
  set("le-cash", { checked: !!v.cash }); set("le-advance", { checked: !!v.advance });
}
ctx.ledgerOpenEntry(bookId);
const modal = els["rimbook-ledger-modal"]; assert.ok(modal, "modal opens");
fill({ kind: "income", amount: "1,500.50", category: "مبيعات" });
ctx.ledgerSaveEntry();
assert.equal(saved().entries.length, 1);
assert.equal(saved().entries[0].amount, 150050, "stored as integer minor units");

// double tap / replay of the same form is ignored
els["rimbook-ledger-modal"] = modal; fill({ kind: "income", amount: "1,500.50", category: "مبيعات" });
ctx.ledgerSaveEntry();
assert.equal(saved().entries.length, 1, "same form token never records twice");
assert.ok(toasts.some(t => /سُجّلت/.test(t)));

// invalid amount is rejected without writing
ctx.ledgerOpenEntry(bookId); fill({ kind: "expense", amount: "12.345" }); ctx.ledgerSaveEntry();
assert.equal(saved().entries.length, 1); assert.ok(toasts.some(t => /خانتين/.test(t)));
closeAll();
function closeAll() { delete els["rimbook-ledger-modal"]; }

// debt + hostile text is escaped in the rendered screen
ctx.ledgerOpenEntry(bookId); fill({ kind: "receivable", amount: "300", party: '<img src=x onerror=alert(1)>' }); ctx.ledgerSaveEntry();
ctx.ledgerOpenBook(bookId);
const html = ctx.VIEWS.ledgers();
assert.ok(!html.includes("<img src=x"), "user text must be escaped");
assert.ok(html.includes("1,500.50") && html.includes("USD"));
assert.match(html, /ديون لي/);

// settle via the party button, then reverse
ctx.ledgerSettle(0, "collected");
assert.ok(els["rimbook-ledger-modal"].innerHTML.includes('value="300.00"'), "settle button pre-fills the open balance");
fill({ kind: "collected", amount: "300.00", party: '<img src=x onerror=alert(1)>', date: "2026-11-21" });
ctx.ledgerSaveEntry();
assert.equal(saved().entries.length, 3);
const collected = saved().entries.find(e => e.kind === "collected");
ctx.ledgerReverseEntry(collected.id);
assert.equal(saved().entries.length, 4, "reversal adds a row; nothing is deleted");
assert.ok(saved().audit.length >= 4);

// export is verifiable
ctx.ledgerExport(bookId);
const exported = JSON.parse(blobs.get(downloads[downloads.length - 1].href));
assert.ok(core.verifyEnvelope(exported).ok);
ctx.ledgerCsv(bookId);
assert.ok(blobs.get(downloads[downloads.length - 1].href).startsWith("\ufeff"));

// calculator
ctx.VIEWS.calculator();
set("calc-expr", { value: "" }); set("calc-result", {});
for (const k of ["5", "0", "+", "1", "0", "%", "="]) ctx.ledgerCalcKey(k);
assert.equal(els["calc-expr"].value, "55");
assert.equal(els["calc-result"].textContent, "= 55");
els["calc-expr"].value = "5/0"; ctx.ledgerCalcEval(true);
assert.match(els["calc-result"].textContent, /صفر/);

// add-on isolation: the notebook/payroll data store was never touched
assert.equal(JSON.stringify(ctx.RB.data), rbBefore);
assert.deepEqual(RBcalls, [], "ledgers must not write to RB data");

// corrupted storage is preserved and not silently overwritten
storage.set("rimbook_ledgers_v1", "{bad json");
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "ledgers.js"), "utf8"), ctx);
assert.ok([...storage.keys()].some(k => k.startsWith("rimbook_ledgers_v1_corrupt_")), "damaged data is kept aside");
console.log("Ledger UI smoke tests passed.");
