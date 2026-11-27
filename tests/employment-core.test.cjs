const assert = require("node:assert/strict");
const E = require("../employment-core.js");
let n = 0; const ctx = () => ({ id: "x" + (++n), now: 1700000000000 + n });
let s = E.emptyStore();
const ok = (r, label) => { assert.ok(r.ok, (label || "") + " " + r.error); s = r.store; return r; };

const A = ok(E.addEmployer(s, { name: "شركة النور", currency: "USD" }, ctx())).employer;
const B = ok(E.addEmployer(s, { name: "ورشة الأمل", currency: "EUR" }, ctx())).employer;
assert.equal(E.addEmployer(s, { name: " شركة  النور " }, ctx()).ok, false, "duplicate employer name");
const P = ok(E.addPerson(s, { name: "سالم" }, ctx())).person;

// --- an employment has its own wage, period, permissions ---
const m1 = ok(E.startEmployment(s, { employerId: A.id, personId: P.id, wageType: "daily", wage: 5000, startDate: "2026-01-01", normalHours: 8, perms: { addHours: true } }, ctx())).employment;
assert.deepEqual(JSON.parse(JSON.stringify(m1.perms)), { seeWage: true, seeBalance: true, addHours: true });
assert.equal(E.startEmployment(s, { employerId: A.id, personId: P.id, wageType: "daily", wage: 100, startDate: "2026-02-01" }, ctx()).ok, false, "overlap with the same employer is refused");
assert.equal(E.startEmployment(s, { employerId: A.id, personId: P.id, wageType: "daily", wage: 0, startDate: "2027-01-01" }, ctx()).ok, false);
assert.equal(E.startEmployment(s, { employerId: A.id, personId: P.id, wageType: "weekly", wage: 100, startDate: "2027-01-01" }, ctx()).ok, false);

const add = (raw, o) => E.addEntry(s, Object.assign({ employmentId: m1.id }, raw), Object.assign(ctx(), o || {}));
ok(add({ kind: "work", date: "2026-01-05" }));                         // daily wage applied: 50.00
ok(add({ kind: "work", date: "2026-01-06", amount: 6000 }));           // manual override
const e2 = s.entries.find(e => e.date === "2026-01-06"); assert.equal(e2.manual, true, "override is flagged");
assert.equal(s.entries.find(e => e.date === "2026-01-05").amount, 5000);
assert.equal(add({ kind: "work", date: "2026-01-05" }).ok, false, "one status per day");
assert.equal(add({ kind: "absence", date: "2026-01-05" }).ok, false);
ok(add({ kind: "absence", date: "2026-01-07" })); assert.equal(s.entries.find(e => e.date === "2026-01-07").amount, 0);
ok(add({ kind: "holiday", date: "2026-01-08" }));
ok(add({ kind: "bonus", date: "2026-01-09", amount: 1000 }));
ok(add({ kind: "deduction", date: "2026-01-09", amount: 500 }));
ok(add({ kind: "advance", date: "2026-01-10", amount: 2000 }));
ok(add({ kind: "payment", date: "2026-01-31", amount: 4000 }));
assert.equal(add({ kind: "work", date: "2025-12-31" }).ok, false, "no work before the relation starts");
assert.equal(add({ kind: "salary", date: "2026-01-31", month: "2026-01" }).ok, false, "salary is for monthly wages only");
let sum = E.summarizeEmployment(s, m1.id);
assert.equal(sum.earned, 5000 + 6000 + 5000 + 1000);                   // work, work, paid holiday, bonus
assert.equal(sum.balance, 17000 - 500 - 4000 - 2000);
assert.equal(sum.days, 2); assert.equal(sum.absences, 1);

// --- double-recording guards ---
const t1 = add({ kind: "payment", date: "2026-02-01", amount: 100, token: "f1" }); ok(t1);
assert.equal(add({ kind: "payment", date: "2026-02-01", amount: 100, token: "f1" }).duplicate, "token");
assert.equal(add({ kind: "payment", date: "2026-02-01", amount: 100, token: "f2" }).duplicate, "similar");
ok(add({ kind: "payment", date: "2026-02-01", amount: 100, token: "f3" }, { allowDuplicate: true }));

// --- reversal keeps the trail and the day becomes free again ---
const rev = ok(E.reverseEntry(s, s.entries.find(e => e.date === "2026-01-06").id, ctx()));
assert.equal(E.reverseEntry(s, s.entries.find(e => e.date === "2026-01-06").id, ctx()).ok, false);
ok(add({ kind: "work", date: "2026-01-06" }));
assert.equal(E.summarizeEmployment(s, m1.id).earned, 5000 + 5000 + 5000 + 1000);

// --- changing the wage never rewrites computed history ---
assert.equal(E.changeWage(s, m1.id, { from: "2026-01-20", wage: 7000 }, ctx()).ok, true);
assert.equal(E.changeWage(s, m1.id, { from: "2026-01-08", wage: 7000 }, ctx()).ok, false, "cannot change the wage retroactively over recorded days");
ok(E.changeWage(s, m1.id, { from: "2026-01-20", wage: 7000 }, ctx()));
ok(add({ kind: "work", date: "2026-01-21" })); assert.equal(s.entries.find(e => e.date === "2026-01-21").amount, 7000, "new wage from its effective date");
ok(add({ kind: "work", date: "2026-01-19" }));

ok(E.setPerms(s, m1.id, { seeWage: false, addHours: false }, ctx()));
assert.equal(s.employments.find(x => x.id === m1.id).perms.seeWage, false); assert.ok(s.audit.some(a => a.action === "perms_change"));
// --- ending: cannot end before the last recorded day; balance stays as a claim; payments after the end are allowed ---
assert.equal(E.endEmployment(s, m1.id, { endDate: "2026-01-10" }, ctx()).ok, false);
const ended = ok(E.endEmployment(s, m1.id, { endDate: "2026-02-28", reason: "انتقال" }, ctx()));
assert.ok(ended.balance > 0, "unpaid balance is reported at the end");
assert.equal(E.endEmployment(s, m1.id, { endDate: "2026-03-01" }, ctx()).ok, false, "already ended");
assert.equal(add({ kind: "work", date: "2026-03-05" }).ok, false, "no work after the end date");
assert.equal(add({ kind: "advance", date: "2026-03-05", amount: 100 }).ok, false, "no advance after the end");
const owed = E.summarizeEmployment(s, m1.id).balance;
ok(add({ kind: "payment", date: "2026-03-10", amount: owed }));
assert.equal(E.summarizeEmployment(s, m1.id).balance, 0, "rights preserved: the old balance can be settled after the move");

// --- the worker moves to another employer: separate records, no mixing ---
const m2 = ok(E.startEmployment(s, { employerId: B.id, personId: P.id, wageType: "hourly", wage: 1000, startDate: "2026-03-01" }, ctx())).employment;
const add2 = raw => E.addEntry(s, Object.assign({ employmentId: m2.id }, raw), ctx());
assert.equal(add2({ kind: "work", date: "2026-03-02" }).ok, false, "hourly work needs hours");
ok(add2({ kind: "work", date: "2026-03-02", hours100: 750 })); assert.equal(s.entries.at(-1).amount, 7500, "7.5h x 10.00");
assert.equal(add2({ kind: "work", date: "2026-02-20", hours100: 800 }).ok, false, "new employer cannot receive pre-start days");
ok(add2({ kind: "payment", date: "2026-03-05", amount: 3000 }));
const a1 = E.archiveByPerson(s, P.id);
assert.equal(a1.length, 2);
assert.equal(a1.find(x => x.employment.id === m1.id).summary.balance, 0);
assert.equal(a1.find(x => x.employment.id === m2.id).summary.balance, 7500 - 3000);
assert.equal(E.archiveByEmployer(s, A.id).length, 1); assert.equal(E.archiveByEmployer(s, B.id).length, 1);
assert.equal(E.summarizeEmployment(s, m1.id).entries > 5, true, "old employer's archive untouched by the new job");

// --- guided move (atomic) ---
const Q = ok(E.addPerson(s, { name: "منصور" }, ctx())).person;
const C = ok(E.addEmployer(s, { name: "مصنع الشرق" }, ctx())).employer;
const q1 = ok(E.startEmployment(s, { employerId: A.id, personId: Q.id, wageType: "monthly", wage: 300000, startDate: "2026-01-01" }, ctx())).employment;
ok(E.addEntry(s, { employmentId: q1.id, kind: "salary", month: "2026-01", date: "2026-01-31" }, ctx())); assert.equal(s.entries.at(-1).amount, 300000);
assert.equal(E.addEntry(s, { employmentId: q1.id, kind: "salary", month: "2026-01", date: "2026-01-31" }, ctx()).ok, false, "one salary per month");
assert.equal(E.addEntry(s, { employmentId: q1.id, kind: "work", date: "2026-01-05" }, ctx()).ok, false, "monthly wage has no day wage");
const before = JSON.stringify(s);
const bad = E.moveWorker(s, { fromEmploymentId: q1.id, endDate: "2026-01-15", toEmployerId: C.id, next: { wageType: "daily", wage: 0, startDate: "2026-02-01" } }, ctx());
assert.equal(bad.ok, false); assert.equal(JSON.stringify(s), before, "a failed move changes nothing");
const mv = ok(E.moveWorker(s, { fromEmploymentId: q1.id, endDate: "2026-02-10", toEmployerId: C.id, next: { wageType: "daily", wage: 4000, startDate: "2026-02-11" } }, ctx()));
assert.equal(mv.balanceLeft, 300000, "the unpaid salary stays with the old employer");
assert.equal(E.archiveByPerson(s, Q.id).length, 2);
assert.equal(E.moveWorker(s, { fromEmploymentId: q1.id, endDate: "2026-02-20", toEmployerId: C.id, next: {} }, ctx()).ok, false, "already ended");

// --- archiving an employer requires closed relations ---
assert.equal(E.archiveEmployer(s, C.id, true, ctx()).ok, false);

// --- statements ---
const st = E.statement(s, m1.id);
assert.match(st, /سالم/); assert.match(st, /شركة النور/); assert.match(st, /USD/); assert.ok(!st.includes("ورشة الأمل"), "a statement never mixes another employer's data");
assert.match(E.personStatement(s, P.id), /لا تُجمع مبالغها/);

// --- validation, backup and restore ---
assert.ok(E.validateStore(s).ok);
const env = E.makeEnvelope(s, { personId: P.id }, 1);
assert.equal(env.data.employments.length, 2); assert.ok(!env.data.employments.some(m => m.personId === Q.id));
assert.ok(E.verifyEnvelope(JSON.parse(JSON.stringify(env))).ok);
const tampered = JSON.parse(JSON.stringify(env)); tampered.data.entries[0].amount += 1;
assert.equal(E.verifyEnvelope(tampered).ok, false);
const whole = E.makeEnvelope(s, null, 1);
const restored = E.importEnvelope(E.emptyStore(), JSON.parse(JSON.stringify(whole)), "replace", ctx()); assert.ok(restored.ok, restored.error);
assert.equal(JSON.stringify(E.archiveByPerson(restored.store, P.id).map(x => x.summary)), JSON.stringify(E.archiveByPerson(s, P.id).map(x => x.summary)), "identical balances after restore");
const appended = E.importEnvelope(s, JSON.parse(JSON.stringify(env)), "append", ctx()); assert.ok(appended.ok, appended.error);
assert.equal(appended.store.people.length, s.people.length + 1, "import appends copies without colliding ids");
assert.ok(E.validateStore(appended.store).ok);
const hostile = JSON.parse(JSON.stringify(s)); hostile.people[0].id = "a'b";
assert.equal(E.validateStore(hostile).ok, false, "ids must be inert strings");
const corrupt = JSON.parse(JSON.stringify(s)); corrupt.entries.find(e => e.kind === "work").date = "2020-01-01";
assert.equal(E.validateStore(corrupt).ok, false, "a work day outside the employment period is invalid");
assert.ok(s.audit.some(a => a.action === "employment_end") && s.audit.some(a => a.action === "wage_change") && s.audit.some(a => a.action === "entry_reverse"));
console.log("Employment core tests passed.");
