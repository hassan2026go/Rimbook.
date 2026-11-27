const assert = require("node:assert/strict");
const Cal = require("../calendar-core.js");
const L = require("../ledger-core.js");

// ---- date grids ----
assert.equal(Cal.addDays("2026-02-28", 1), "2026-03-01");
assert.equal(Cal.addDays("2026-12-31", 1), "2027-01-01");
assert.equal(Cal.addMonths("2026-01-31", 1), "2026-02-28", "month end is clamped");
assert.equal(Cal.addMonths("2026-12-15", 1), "2027-01-15");
assert.equal(Cal.addMonths("2026-01-15", -1), "2025-12-15");
assert.equal(Cal.weekday("2026-11-25"), 3);                       // Wednesday
assert.equal(Cal.startOfWeek("2026-11-25", 6), "2026-11-21");      // Saturday start
assert.equal(Cal.startOfWeek("2026-11-25", 0), "2026-11-22");      // Sunday start
assert.equal(Cal.startOfWeek("2026-11-21", 6), "2026-11-21");
const grid = Cal.monthGrid("2026-11", 6);
assert.ok(grid.every(w => w.length === 7));
assert.equal(grid[0][0].date, "2026-10-31"); assert.equal(grid[0][0].inMonth, false);
assert.equal(grid.flat().filter(d => d.inMonth).length, 30);
assert.equal(grid.flat().find(d => d.date === "2026-11-30").inMonth, true);
assert.equal(Cal.monthGrid("2026-02", 0).flat().filter(d => d.inMonth).length, 28);
assert.equal(Cal.monthGrid("2028-02", 0).flat().filter(d => d.inMonth).length, 29, "leap year");

// ---- items ----
let n = 0; const ctx = () => ({ id: "c" + (++n), now: 1700000000000 + n });
let store = Cal.emptyStore();
const ok = r => { assert.ok(r.ok, r.error); store = r.store; return r.item; };
const plain = ok(Cal.createItem(store, { type: "note", date: "2026-11-25", title: "ملاحظة عادية", body: "نص" }, ctx()));
assert.equal(plain.finance.mode, "none");
assert.equal(Cal.createItem(store, { type: "appointment", date: "2026-11-25", title: "" }, ctx()).ok, false, "appointment needs a title");
assert.equal(Cal.createItem(store, { type: "note", date: "2026-02-30", title: "x" }, ctx()).ok, false);
assert.equal(Cal.createItem(store, { type: "appointment", date: "2026-11-25", time: "25:00", title: "x" }, ctx()).ok, false);
assert.equal(Cal.createItem(store, { type: "note", date: "2026-11-25", title: "x", finance: { mode: "party", kind: "expense", amount: 100 } }, ctx()).ok, false, "party mode needs a party");
assert.equal(Cal.createItem(store, { type: "note", date: "2026-11-25", title: "x", finance: { mode: "ledger", kind: "expense", amount: 10.5 } }, ctx()).ok, false);
const task = ok(Cal.createItem(store, { type: "task", date: "2026-11-26", title: "اتصل بالمورد" }, ctx()));
ok(Cal.toggleDone(store, task.id, ctx())); assert.equal(store.items.find(i => i.id === task.id).done, true);
assert.equal(Cal.toggleDone(store, plain.id, ctx()).ok, false);

// a plain note can never be posted; financial drafts are not entries
assert.equal(Cal.prepareLedgerPost(plain).ok, false);
const fin = ok(Cal.createItem(store, { type: "note", date: "2026-11-27", title: "دفعة المورد", finance: { mode: "party", kind: "payable", amount: 250000, party: "مورد الإسمنت", category: "مواد" } }, ctx()));
const prep = Cal.prepareLedgerPost(fin);
assert.ok(prep.ok); assert.equal(prep.raw.amount, 250000); assert.equal(prep.raw.token, "cal-" + fin.id + "-1"); assert.equal(prep.raw.date, "2026-11-27");
assert.equal(Cal.prepareLedgerPost(ok(Cal.createItem(store, { type: "note", date: "2026-11-27", title: "بلا مبلغ", finance: { mode: "ledger", kind: "expense" } }, ctx()))).ok, false, "draft without an amount cannot post");

// end-to-end with a real ledger: posts once, never twice
let ls = L.emptyStore(); const lb = L.createBook(ls, { name: "ورشة" }, ctx()); ls = lb.store;
const post = () => L.addEntry(ls, Object.assign({ bookId: lb.book.id }, prep.raw), ctx());
const p1 = post(); assert.ok(p1.ok, p1.error); ls = p1.store;
const p2 = post(); assert.equal(p2.ok, false); assert.equal(p2.duplicate, "token", "ledger refuses the same calendar token twice");
ok(Cal.markPosted(store, fin.id, { bookId: lb.book.id, entryId: p1.entry.id }, ctx()));
assert.equal(Cal.markPosted(store, fin.id, { bookId: lb.book.id, entryId: p1.entry.id }, ctx()).ok, false, "cannot mark twice");
assert.equal(Cal.prepareLedgerPost(store.items.find(i => i.id === fin.id)).ok, false, "posted note cannot be prepared again");
const other = ok(Cal.createItem(store, { type: "note", date: "2026-11-27", title: "أخرى", finance: { mode: "ledger", kind: "expense", amount: 5 } }, ctx()));
assert.equal(Cal.markPosted(store, other.id, { bookId: lb.book.id, entryId: p1.entry.id }, ctx()).ok, false, "one ledger entry can belong to one note only");

// finance fields are locked once posted; text can still change
assert.equal(Cal.updateItem(store, fin.id, { finance: { amount: 1 } }, ctx()).ok, false);
ok(Cal.updateItem(store, fin.id, { body: "تفاصيل إضافية" }, ctx()));
// unlink is only possible after the ledger entry is reversed; then re-posting uses a fresh token
assert.equal(Cal.unlinkPosted(store, fin.id, "active", ctx()).ok, false);
const rv = L.reverseEntry(ls, p1.entry.id, ctx()); ls = rv.store;
ok(Cal.unlinkPosted(store, fin.id, "reversed", ctx()));
const again = Cal.prepareLedgerPost(store.items.find(i => i.id === fin.id));
assert.equal(again.raw.token, "cal-" + fin.id + "-2");
const p3 = L.addEntry(ls, Object.assign({ bookId: lb.book.id }, again.raw), Object.assign(ctx(), { allowDuplicate: true })); assert.ok(p3.ok, p3.error);
assert.equal(L.summarize(p3.store.entries).payableOpen, 250000, "exactly one active entry after the deliberate re-post");

// audit of finance actions
const actions = store.audit.map(a => a.action);
for (const a of ["item_create", "post", "unlink"]) assert.ok(actions.includes(a), a);

// queries
assert.equal(Cal.itemsInRange(store, "2026-11-25", "2026-11-26").length, 2);
const marks = Cal.dayMarks(store, "2026-11-01", "2026-11-30");
assert.equal(marks["2026-11-25"].count, 1); assert.equal(marks["2026-11-26"].openTasks, 0);
assert.ok(marks["2026-11-27"].pendingFinance >= 1);
assert.equal(Cal.search(store, "المورد").length >= 2, true);
assert.equal(Cal.search(store, "   ").length, 0);

// soft delete keeps the trail
const before = store.items.length;
ok(Cal.deleteItem(store, plain.id, ctx()));
assert.equal(store.items.length, before); assert.equal(Cal.itemsInRange(store, "2026-11-25", "2026-11-25").length, 0);
assert.equal(Cal.deleteItem(store, plain.id, ctx()).ok, false);

// settings + backup
assert.equal(Cal.setWeekStart(store, 3).ok, false); ok(Cal.setWeekStart(store, 0)); assert.equal(store.settings.weekStart, 0);
const env = Cal.makeEnvelope(store, 1);
assert.ok(Cal.verifyEnvelope(JSON.parse(JSON.stringify(env))).ok);
const bad = JSON.parse(JSON.stringify(env)); bad.data.items[0].title += "!";
assert.equal(Cal.verifyEnvelope(bad).ok, false);
const restored = Cal.importEnvelope(Cal.emptyStore(), JSON.parse(JSON.stringify(env)), "replace", ctx());
assert.ok(restored.ok, restored.error); assert.equal(restored.store.items.length, store.items.length);
const merged = Cal.importEnvelope(store, JSON.parse(JSON.stringify(env)), "append", ctx());
assert.ok(merged.ok, merged.error);
assert.equal(merged.store.items.filter(i => i.posted).length, store.items.filter(i => i.posted).length, "append import never creates a second link to the same ledger entry");
assert.ok(Cal.validateStore(merged.store).ok);
assert.equal(Cal.validateStore({ version: 1, settings: { weekStart: 6 }, audit: [], items: [{ id: "a'b", type: "note", date: "2026-01-01", title: "", body: "x", finance: { mode: "none" } }] }).ok, false, "ids must be inert strings");
console.log("Calendar core tests passed.");
