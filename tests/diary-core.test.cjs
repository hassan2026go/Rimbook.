const assert = require("node:assert/strict");
const D = require("../diary-core.js");
const P = t => D.parseText(t).map(x => { const o = { type: x.type }; if (x.amount) o.amount = x.amount; if (x.who) o.who = x.who; if (x.place) o.place = x.place; if (x.missing) o.missing = true; if (x.note) o.note = x.note; return o; });
const j = v => JSON.stringify(v);

// ---- the phrase table from the old app's help page (several never worked there) ----
assert.equal(j(P("اليوم عملت")), j([{ type: "work" }]));
assert.equal(j(P("أخذت عطلة")), j([{ type: "off" }]));
assert.equal(j(P("قبضت خمسمية")), j([{ type: "pay", amount: 50000 }]));
assert.equal(j(P("مكافأة 200")), j([{ type: "bonus", amount: 20000 }]), "bonus keywords are normalized (the old app never matched them)");
assert.equal(j(P("خصم 50")), j([{ type: "deduct", amount: 5000 }]));
assert.equal(j(P("أخذت سلفة 300")), j([{ type: "adv", amount: 30000 }]));
assert.equal(j(P("دين عليّ لعلي 500")), j([{ type: "dme", amount: 50000, who: "علي" }]));
assert.equal(j(P("أعطيت محمد مية")), j([{ type: "dli", amount: 10000, who: "محمد" }]));
// ---- compound statements, fillers and number forms ----
assert.equal(j(P("قبضت دفعة 500")), j([{ type: "pay", amount: 50000 }]), "one payment, not a payment plus an empty one");
assert.equal(j(P("اليوم عملت وقبضت ألفين ومكافأة 200")), j([{ type: "work" }, { type: "pay", amount: 200000 }, { type: "bonus", amount: 20000 }]));
assert.equal(j(P("قبضت مية وخمسين")), j([{ type: "pay", amount: 15000 }]));
assert.equal(j(P("قبضت ثلاث مية")), j([{ type: "pay", amount: 30000 }]));
assert.equal(j(P("قبضت ٢٥٠")), j([{ type: "pay", amount: 25000 }]), "Arabic-Indic digits");
assert.equal(j(P("قبضت 1,500")), j([{ type: "pay", amount: 150000 }]), "a thousands separator is not two numbers");
assert.equal(j(P("قبضت 12.5")), j([{ type: "pay", amount: 1250 }]));
assert.equal(j(P("قبضت 12.555")), j([{ type: "pay", missing: true }]), "more than 2 decimals is flagged, never rounded");
assert.equal(j(P("قبضت 5 الاف")), j([{ type: "pay", amount: 500000 }]));
assert.equal(j(P("قبضت")), j([{ type: "pay", missing: true }]), "a payment without an amount is flagged");
assert.equal(j(P("عملت في ورشة الأمل")), j([{ type: "work", place: "الأمل" }]));
assert.equal(j(P("ساعتين إضافيتين")), j([{ type: "ot", amount: 4 }]), "2 overtime hours = 4 half-hours");
assert.equal(j(P("3 ساعات اضافية")), j([{ type: "ot", amount: 6 }]));
assert.equal(j(P("اتصل بالمورد غداً")), j([{ type: "note", note: "اتصل بالمورد غداً" }]));

// ---- store: exact integer money ----
let s = D.emptyStore(); let n = 0; const ctx = () => ({ id: "x" + (++n), now: 1700000000000 + n });
const ok = r => { assert.ok(r.ok, r.error); s = r.store; return r; };
ok(D.updateProfile(s, { name: "ياسر", cur: "$", dw: 5000, otr: 1000 }));
for (const d of ["2026-11-01", "2026-11-02", "2026-11-03"]) ok(D.setDay(s, d, "work", ctx()));
ok(D.setDay(s, "2026-11-04", "off", ctx()));
ok(D.addOt(s, "2026-11-02", 3)); ok(D.addOt(s, "2026-11-02", 1));                       // 4 half-hours = 2h
ok(D.addEntries(s, [{ type: "pay", amount: 4000 }, { type: "adv", amount: 1000 }, { type: "bonus", amount: 2000 }, { type: "deduct", amount: 500 }], "2026-11-05", ctx()));
let sum = D.summarize(s, "2026-11-01", "2026-11-30");
assert.equal(sum.days, 3); assert.equal(sum.otHalves, 4);
assert.equal(sum.due, 3 * 5000 + 2 * 1000, "3 days x 50 + 2h x 10 = 170.00");
assert.equal(sum.balance, 17000 - 4000 - 1000 + 2000 - 500);
assert.equal(D.summarize(s, "2026-12-01", "2026-12-31").days, 0);
// a work/off day is replaced, never duplicated
ok(D.setDay(s, "2026-11-01", "off", ctx())); assert.equal(s.entries.filter(e => e.date === "2026-11-01" && (e.type === "work" || e.type === "off")).length, 1);
assert.equal(D.summarize(s, "2026-11-01", "2026-11-30").days, 2);
// atomic: one bad item saves nothing
const before = JSON.stringify(s);
assert.equal(D.addEntries(s, [{ type: "work" }, { type: "pay", amount: 0 }], "2026-11-09", ctx()).ok, false); assert.equal(JSON.stringify(s), before);
assert.equal(D.addEntries(s, [{ type: "pay", amount: 100.5 }], "2026-11-09", ctx()).ok, false, "fractional minor units rejected");
assert.equal(D.addEntries(s, [{ type: "work" }], "2026-02-30", ctx()).ok, false);
assert.equal(D.addOt(s, "2026-11-02", 100).ok, false);
ok(D.addOt(s, "2026-11-02", -4)); assert.ok(!s.entries.some(e => e.type === "ot"), "overtime back to zero removes the entry");
const del = s.entries.find(e => e.type === "pay"); ok(D.deleteEntry(s, del.id, ctx())); assert.ok(s.audit.some(a => a.action === "delete"));
assert.ok(D.validateStore(s).ok);
assert.match(D.reportText(s, "2026-11-01", "2026-11-30", "نوفمبر"), /المستحق: 100\.00 \$/);
assert.ok(D.toCsv(s).startsWith("\ufeff")); ok(D.addEntries(s, [{ type: "note", note: "=cmd()" }], "2026-11-10", ctx())); assert.ok(D.toCsv(s).includes("'=cmd()"));

// ---- importing the old standalone diary backup ----
const old = { app: "mufakkirati", v: 2, entries: [
  { id: 1.5, date: "2026-10-01", type: "work", amount: 0, ts: 1 }, { id: 2.5, date: "2026-10-02", type: "pay", amount: 250.5 }, { id: 3.5, date: "2026-10-03", type: "ot", amount: 1.5 },
  { id: 4.5, date: "2026-10-04", type: "bonus", amount: 0 }, { id: 5.5, date: "bad", type: "work" }, { id: 6.5, date: "2026-10-05", type: "weird" }, { id: 7.5, date: "2026-10-06", type: "dli", amount: 100, who: "علي" }],
  profile: { name: "ياسر الحسين", dw: 45.5, otr: 8, cur: "$", pic: "" } };
let t = D.emptyStore(); const imp = D.importOld(t, old, ctx()); assert.ok(imp.ok, imp.error); t = imp.store;
assert.equal(imp.imported, 4); assert.equal(imp.invalid, 3);
assert.equal(t.entries.find(e => e.type === "pay").amount, 25050); assert.equal(t.entries.find(e => e.type === "ot").amount, 3);
assert.equal(t.profile.dw, 4550); assert.equal(t.profile.name, "ياسر الحسين");
const again = D.importOld(t, old, ctx()); assert.equal(again.imported, 0); assert.equal(again.skipped, 4, "re-importing never duplicates");
assert.equal(D.importOld(t, { app: "other" }, ctx()).ok, false);
assert.ok(D.validateStore(t).ok);

// ---- backup envelope ----
const env = JSON.parse(JSON.stringify(D.makeEnvelope(s, 1))); assert.ok(D.verifyEnvelope(env).ok);
env.data.entries[0].amount = env.data.entries[0].amount ? env.data.entries[0].amount + 1 : 0; env.data.profile.name += "x"; assert.equal(D.verifyEnvelope(env).ok, false);
const rep = D.importEnvelope(D.emptyStore(), JSON.parse(JSON.stringify(D.makeEnvelope(s, 1))), "replace", ctx()); assert.ok(rep.ok); assert.equal(D.summarize(rep.store, "2026-11-01", "2026-11-30").balance, D.summarize(s, "2026-11-01", "2026-11-30").balance);

// ---- offline readiness verdicts ----
const R = D.evaluateReadiness;
assert.equal(R({ native: true, serviceWorker: false, filesTotal: 30, filesMissing: [], speechInstalled: true, mic: true }).level, "ready");
assert.equal(R({ native: true, filesTotal: 30, filesMissing: [], speechInstalled: false }).level, "partial");
const web = R({ native: false, serviceWorker: true, filesTotal: 30, filesMissing: [], webSpeech: true });
assert.equal(web.level, "partial"); assert.ok(web.checks.find(c => c.id === "voice").text.includes("يحتاج إنترنت دائماً"), "a browser can never claim offline voice");
assert.equal(R({ native: false, serviceWorker: true, filesTotal: 30, filesMissing: ["a.js"] }).level, "not");
assert.equal(R({ native: false, serviceWorker: false, filesTotal: 0, filesMissing: [] }).level, "not");
assert.equal(R({ native: true, filesTotal: 5, filesMissing: [], speechInstalled: true, mic: false }).checks.some(c => c.id === "mic" && !c.ok), true);
console.log("Diary core tests passed.");
