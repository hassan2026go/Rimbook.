const assert = require("node:assert/strict");
const C = require("../ledger-core.js");
const ev = s => { const r = C.evaluate(s); return r.ok ? r.text : "ERR:" + r.error; };

// ---- calculator: exact decimals, no float drift ----
assert.equal(ev("0.1+0.2"), "0.3");
assert.equal(ev("1.1*1.1"), "1.21");
assert.equal(ev("10/4"), "2.5");
assert.equal(ev("1/3*3"), "1");
assert.equal(ev("2+3*4"), "14");
assert.equal(ev("(2+3)*4"), "20");
assert.equal(ev("-5+2"), "-3");
assert.equal(ev("50+10%"), "55");
assert.equal(ev("200-25%"), "150");
assert.equal(ev("200*10%"), "20");
assert.equal(ev("50%"), "0.5");
assert.equal(ev("١٠٫٥+٢"), "12.5", "Arabic-Indic digits and decimal mark");
assert.equal(ev("6×7÷2"), "21");
assert.equal(ev("1,000+500"), "1500");
assert.match(ev("5/0"), /صفر/);
assert.match(ev("2+"), /ERR/);
assert.match(ev("2**3"), /ERR/);
assert.match(ev("abc"), /ERR/);
assert.match(ev("(2+3"), /قوس/);
assert.equal(ev("0.000000001"), "0");
assert.equal(ev("123456789012*1000"), "123456789012000");

// ---- amounts: integer minor units only ----
assert.equal(C.parseMinor("1,234.56"), 123456);
assert.equal(C.parseMinor("1.234,56"), 123456);
assert.equal(C.parseMinor("12,345"), 1234500);
assert.equal(C.parseMinor("2,5"), 250);
assert.equal(C.parseMinor("٢٥٫٧٥"), 2575);
assert.equal(C.parseMinor("0,500"), 50);
assert.equal(C.parseMinor("19.999"), null, "more than 2 decimals is rejected, never silently rounded");
assert.equal(C.parseMinor("-5"), null);
assert.equal(C.parseMinor("abc"), null);
assert.equal(C.parseMinor(""), null);
assert.equal(C.parseMinor("99999999999"), null, "above the per-entry cap");
assert.equal(C.formatMinor(123456), "1,234.56");
assert.equal(C.formatMinor(5), "0.05");
assert.equal(C.formatMinor(-250), "-2.50");
assert.equal(C.roundToMinor(C.evaluate("10/3").value), 333);
assert.equal(C.roundToMinor(C.evaluate("2.675").value), 268, "exact half rounds up (no float 2.67 surprise)");

// ---- ledger operations ----
let n = 0;
const ctx = () => ({ id: "id" + (++n), now: 1700000000000 + n });
let store = C.emptyStore();
let r = C.createBook(store, { name: "ورشة", currency: "USD" }, ctx()); assert.ok(r.ok); store = r.store; const book = r.book.id;
assert.equal(C.createBook(store, { name: " ورشة " }, ctx()).ok, false, "duplicate book name");
const add = (raw, o) => C.addEntry(store, Object.assign({ bookId: book, date: "2026-11-10" }, raw), Object.assign(ctx(), o || {}));
const must = res => { assert.ok(res.ok, res.error); store = res.store; return res.entry; };

must(add({ kind: "income", amount: 100000, category: "مبيعات" }));       // 1000.00
must(add({ kind: "expense", amount: 25050, category: "مواد" }));          // 250.50
must(add({ kind: "receivable", amount: 40000, party: "علي" }));            // credit sale, no cash moved
must(add({ kind: "payable", amount: 15000, party: "المورد", cashNow: true, tag: "advance" })); // cash received now
let s = C.summarize(store.entries.filter(e => e.bookId === book));
assert.equal(s.income, 100000); assert.equal(s.expense, 25050); assert.equal(s.profit, 74950);
assert.equal(s.cash, 100000 - 25050 + 15000, "cash: income - expense + cash loan received");
assert.equal(s.receivableOpen, 40000); assert.equal(s.payableOpen, 15000);
assert.equal(s.net, s.cash + 40000 - 15000);

// settlements cannot exceed the open balance
let over = add({ kind: "collected", amount: 40001, party: " علي " }); assert.equal(over.ok, false); assert.match(over.error, /الرصيد المفتوح/);
const col = must(add({ kind: "collected", amount: 15000, party: "علي", date: "2026-11-12" }));
s = C.summarize(store.entries);
assert.equal(s.receivableOpen, 25000); assert.equal(s.cash, 100000 - 25050 + 15000 + 15000);
assert.equal(add({ kind: "paid", amount: 1, party: "غير موجود" }).ok, false, "settling an unknown party is rejected");

// no double recording
const tok = { token: "form-1" };
must(add(Object.assign({ kind: "expense", amount: 700, category: "نقل" }, tok)));
const again = add(Object.assign({ kind: "expense", amount: 700, category: "نقل" }, tok));
assert.equal(again.ok, false); assert.equal(again.duplicate, "token", "same form token twice is ignored");
const similar = add({ kind: "expense", amount: 700, category: "نقل", token: "form-2" });
assert.equal(similar.ok, false); assert.equal(similar.duplicate, "similar", "identical entry needs explicit confirmation");
must(add({ kind: "expense", amount: 700, category: "نقل", token: "form-3" }, { allowDuplicate: true }));

// validation
assert.equal(add({ kind: "income", amount: 0 }).ok, false);
assert.equal(add({ kind: "income", amount: 10.5 }).ok, false, "fractional minor units rejected");
assert.equal(add({ kind: "income", amount: 100, date: "2026-02-30" }).ok, false);
assert.equal(add({ kind: "bogus", amount: 100 }).ok, false);
assert.equal(add({ kind: "receivable", amount: 100 }).ok, false, "debt needs a party");

// reversal: immutable log, balances recomputed, linked debt protected
const before = store.entries.length;
assert.equal(C.reverseEntry(store, store.entries.find(e => e.kind === "receivable").id, ctx()).ok, false, "cannot cancel a debt that already has a collection");
must(C.reverseEntry(store, col.id, ctx()));
assert.equal(store.entries.length, before + 1, "reversal adds an entry, nothing is deleted");
s = C.summarize(store.entries);
assert.equal(s.receivableOpen, 40000);
assert.equal(C.reverseEntry(store, col.id, ctx()).ok, false, "no second reversal");
const incomeId = store.entries.find(e => e.kind === "income").id;
const revised = C.reviseEntry(store, incomeId, { amount: 120000 }, ctx()); assert.ok(revised.ok, revised.error); store = revised.store;
s = C.summarize(store.entries);
assert.equal(s.income, 120000, "revision replaces the old figure exactly once");
assert.ok(store.audit.some(a => a.action === "entry_revise") && store.audit.some(a => a.action === "entry_reverse"));
assert.ok(C.validateStore(store).ok);

// date range & per-month breakdown
const ranged = C.summarize(store.entries, { from: "2026-12-01", to: "2026-12-31" });
assert.equal(ranged.income, 0);
assert.equal(C.summarize(store.entries, { from: "2026-11-01", to: "2026-11-30" }).byMonth["2026-11"].income, 120000);

// books are independent
let r2 = C.createBook(store, { name: "شخصي" }, ctx()); store = r2.store;
const personalId = r2.book.id;
must(C.addEntry(store, { bookId: personalId, kind: "expense", amount: 9999, date: "2026-11-11" }, ctx()));
assert.equal(C.summarize(store.entries.filter(e => e.bookId === personalId)).expense, 9999);
assert.equal(C.summarize(store.entries.filter(e => e.bookId === book)).expense, 25050 + 700 + 700);
assert.equal(C.addEntry(store, { bookId: personalId, kind: "collected", amount: 100, party: "علي", date: "2026-11-11" }, ctx()).ok, false, "debts never leak between books");

// ---- export / import / restore ----
const env = C.makeEnvelope(store, [book], 1);
assert.ok(C.verifyEnvelope(JSON.parse(JSON.stringify(env))).ok);
const tampered = JSON.parse(JSON.stringify(env)); tampered.data.entries[0].amount += 1;
assert.equal(C.verifyEnvelope(tampered).ok, false, "tampered or corrupted file is rejected");
const sumBefore = JSON.stringify(C.summarize(store.entries.filter(e => e.bookId === book)));
const replaced = C.importEnvelope(C.emptyStore(), JSON.parse(JSON.stringify(env)), "replace", ctx());
assert.ok(replaced.ok, replaced.error);
assert.equal(JSON.stringify(C.summarize(replaced.store.entries.filter(e => e.bookId === book))), sumBefore, "balances identical after restore");
const appended = C.importEnvelope(store, JSON.parse(JSON.stringify(env)), "append", ctx());
assert.ok(appended.ok, appended.error);
assert.equal(appended.store.books.length, store.books.length + 1);
assert.ok(new Set(appended.store.books.map(b => b.id)).size === appended.store.books.length, "ids remapped without collisions");
assert.ok(appended.store.books.some(b => /مستورد/.test(b.name)));
assert.ok(C.validateStore(appended.store).ok);
const importedBook = appended.store.books.find(b => /مستورد/.test(b.name));
assert.equal(JSON.stringify(C.summarize(appended.store.entries.filter(e => e.bookId === importedBook.id))), sumBefore, "imported copy has identical balances");

// csv
const csv = C.toCsv(C.addEntry(store, { bookId: book, kind: "expense", amount: 100, date: "2026-11-15", note: '=HYPERLINK("x")', category: "a,b" }, ctx()).store, book);
assert.ok(csv.includes("'=HYPERLINK") && csv.includes('"a,b"'), "CSV neutralises formulas and quotes commas");
assert.ok(!C.validateStore({ version: 1, books: [{ id: "b", name: "x" }], entries: [{ id: "e", bookId: "b", kind: "income", amount: 1.5, date: "2026-01-01" }], audit: [] }).ok);

console.log("Ledger core and calculator tests passed.");
