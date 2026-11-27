/* Rimbook employment core — pure logic, independent of the main workers/payroll data, the notebook and the ledgers.
   Model: employers, workers (people) and EMPLOYMENTS. Every employment has its own wage, period, permissions and records.
   Records are immutable (corrections are reversal entries) and are never merged across employments, so when a worker moves
   to another employer the previous records stay intact, attached to the old employer, with their unpaid balance. */
(function (root) {
  "use strict";
  const Ledger = (typeof module !== "undefined" && module.exports && typeof require === "function") ? require("./ledger-core.js") : root.RimbookLedgerCore;
  const VERSION = 1;
  const KINDS = {
    work: "يوم عمل", salary: "راتب شهر", bonus: "مكافأة", holiday: "عطلة", absence: "غياب",
    deduction: "خصم", payment: "دفعة مستلمة", advance: "سلفة", reversal: "قيد إلغاء"
  };
  const WAGE_TYPES = { daily: "أجر يومي", hourly: "أجر بالساعة", monthly: "راتب شهري" };
  const EARN = ["work", "salary", "bonus", "holiday"];          // increase what the employer owes
  const DAY_MARKS = ["work", "holiday", "absence"];              // at most one per employment per date, inside the period
  const POSITIVE_ONLY = ["work", "salary", "bonus", "deduction", "payment", "advance"];
  const PERMS = ["seeWage", "seeBalance", "addHours"];
  const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
  const isDate = Ledger.isDate;
  const isMonth = v => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ""));
  const clone = v => JSON.parse(JSON.stringify(v));
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const text = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  const lc = v => text(v, 80).toLowerCase().replace(/\s+/g, " ");

  const emptyStore = () => ({ version: VERSION, employers: [], people: [], employments: [], entries: [], audit: [] });
  const audit = (s, ctx, action, refs, detail) =>
    s.audit.push({ id: ctx.id ? ctx.id + "-a" + s.audit.length : newId(), t: ctx.now || Date.now(), action, refs: refs || {}, detail: detail || {} });

  /* ---------------- helpers ---------------- */
  const effective = entries => {
    const reversed = new Set(entries.filter(e => e.kind === "reversal").map(e => e.reverses));
    return entries.filter(e => e.kind !== "reversal" && !reversed.has(e.id));
  };
  const entriesOf = (store, employmentId) => store.entries.filter(e => e.employmentId === employmentId);
  const wageOn = (employment, date) => {
    let wage = employment.wageHistory[0].wage;
    employment.wageHistory.forEach(h => { if (h.from <= date) wage = h.wage; });
    return wage;
  };
  const overlaps = (a, b) => a.startDate <= (b.endDate || "9999-12-31") && b.startDate <= (a.endDate || "9999-12-31");
  const monthStart = m => m + "-01";
  const monthEnd = m => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
  const lastEarning = (store, id) => effective(entriesOf(store, id)).filter(e => DAY_MARKS.includes(e.kind) || e.kind === "salary" || e.kind === "bonus")
    .reduce((m, e) => { const d = e.kind === "salary" ? monthEnd(e.month) : e.date; return d > m ? d : m; }, "");

  /* amount the wage rules suggest; the user may override it (the entry is then flagged `manual`) */
  function suggest(employment, kind, date, hours100) {
    const wage = wageOn(employment, date), type = employment.wageType;
    if (kind === "absence") return 0;
    if (kind === "work" || kind === "holiday") {
      if (type === "daily") return wage;
      if (type === "hourly") return kind === "holiday" ? 0 : (Number.isInteger(hours100) && hours100 > 0 ? Math.floor((wage * hours100 + 50) / 100) : null);
      return null;
    }
    if (kind === "salary") return type === "monthly" ? wage : null;
    return null;
  }

  /* ---------------- summaries ---------------- */
  function summarizeEmployment(store, employmentId) {
    const e = effective(entriesOf(store, employmentId));
    const sum = kinds => e.filter(x => kinds.includes(x.kind)).reduce((t, x) => t + x.amount, 0);
    const earned = sum(EARN), deductions = sum(["deduction"]), payments = sum(["payment"]), advances = sum(["advance"]);
    const work = e.filter(x => x.kind === "work");
    const byMonth = {};
    e.forEach(x => {
      const m = x.kind === "salary" ? x.month : x.date.slice(0, 7);
      const row = byMonth[m] = byMonth[m] || { earned: 0, deductions: 0, payments: 0, advances: 0 };
      if (EARN.includes(x.kind)) row.earned += x.amount; else if (x.kind === "deduction") row.deductions += x.amount;
      else if (x.kind === "payment") row.payments += x.amount; else if (x.kind === "advance") row.advances += x.amount;
    });
    return {
      earned, deductions, payments, advances, balance: earned - deductions - payments - advances,
      days: work.length, hours100: work.reduce((t, x) => t + (x.hours100 || 0), 0),
      absences: e.filter(x => x.kind === "absence").length, holidays: e.filter(x => x.kind === "holiday").length,
      entries: e.length, byMonth,
      lastDate: e.reduce((m, x) => { const d = x.kind === "salary" ? monthEnd(x.month) : x.date; return d > m ? d : m; }, "")
    };
  }
  const describe = (store, employment) => ({
    employment, employer: store.employers.find(x => x.id === employment.employerId), person: store.people.find(x => x.id === employment.personId),
    summary: summarizeEmployment(store, employment.id)
  });
  const archiveByEmployer = (store, employerId) => store.employments.filter(x => x.employerId === employerId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate)).map(x => describe(store, x));
  const archiveByPerson = (store, personId) => store.employments.filter(x => x.personId === personId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate)).map(x => describe(store, x));
  const isActive = (employment, today) => !employment.endDate || employment.endDate >= (today || "0000-00-00");

  /* ---------------- validation ---------------- */
  function validateStore(store) {
    const errors = [], bad = m => { errors.push(m); return false; };
    if (!store || typeof store !== "object" || store.version !== VERSION) return { ok: false, errors: ["إصدار غير مدعوم"] };
    for (const k of ["employers", "people", "employments", "entries", "audit"]) if (!Array.isArray(store[k])) return { ok: false, errors: ["الحقل " + k + " مفقود"] };
    const ids = new Set(), uniq = (id, what) => { if (typeof id !== "string" || !SAFE_ID.test(id)) return bad(what + " بمعرّف غير صالح"); if (ids.has(id)) return bad("معرّف مكرر"); ids.add(id); return true; };
    store.employers.forEach(x => { if (uniq(x && x.id, "جهة") && (typeof x.name !== "string" || !x.name.trim() || x.name.length > 60)) bad("اسم جهة غير صالح"); });
    store.people.forEach(x => { if (uniq(x && x.id, "عامل") && (typeof x.name !== "string" || !x.name.trim() || x.name.length > 60)) bad("اسم عامل غير صالح"); });
    const employerIds = new Set(store.employers.map(x => x.id)), personIds = new Set(store.people.map(x => x.id));
    store.employments.forEach(m => {
      if (!uniq(m && m.id, "علاقة عمل")) return;
      if (!employerIds.has(m.employerId) || !personIds.has(m.personId)) bad("علاقة عمل تشير إلى جهة أو عامل غير موجود");
      if (!WAGE_TYPES[m.wageType]) bad("نوع أجر غير معروف");
      if (!isDate(m.startDate) || (m.endDate != null && (!isDate(m.endDate) || m.endDate < m.startDate))) bad("فترة علاقة العمل غير صالحة");
      if (!Array.isArray(m.wageHistory) || !m.wageHistory.length) return bad("سجل الأجر مفقود");
      let prev = "";
      m.wageHistory.forEach((h, i) => {
        if (!isDate(h.from) || !Number.isInteger(h.wage) || h.wage < 1 || h.wage > Ledger.MAX_MINOR) bad("أجر غير صالح");
        if (i === 0 && h.from !== m.startDate) bad("أول أجر يجب أن يبدأ مع العلاقة");
        if (h.from <= prev && i > 0) bad("سجل الأجر غير مرتب"); prev = h.from;
      });
      if (!m.perms || PERMS.some(p => typeof m.perms[p] !== "boolean")) bad("صلاحيات غير صالحة");
    });
    store.employments.forEach((a, i) => store.employments.slice(i + 1).forEach(b => {
      if (a.employerId === b.employerId && a.personId === b.personId && overlaps(a, b)) bad("علاقتا عمل متداخلتان مع الجهة نفسها");
    }));
    const byId = new Map(store.employments.map(m => [m.id, m])), eIds = new Set(), reversedTargets = new Set();
    store.entries.forEach(x => {
      if (!uniq(x && x.id, "قيد")) return;
      eIds.add(x.id);
      const m = byId.get(x.employmentId);
      if (!m) return bad("قيد بلا علاقة عمل");
      if (!Object.prototype.hasOwnProperty.call(KINDS, x.kind)) bad("نوع قيد غير معروف");
      if (!Number.isInteger(x.amount) || x.amount < 0 || x.amount > Ledger.MAX_MINOR) bad("مبلغ غير صالح");
      if (x.kind !== "reversal" && POSITIVE_ONLY.includes(x.kind) && x.amount < 1) bad("مبلغ يجب أن يكون أكبر من صفر");
      if (x.kind === "absence" && x.amount !== 0) bad("الغياب بلا مبلغ");
      if (!isDate(x.date)) bad("تاريخ غير صالح");
      if (x.kind === "salary" && !isMonth(x.month)) bad("شهر الراتب غير صالح");
      if (x.hours100 != null && (!Number.isInteger(x.hours100) || x.hours100 < 1 || x.hours100 > 2400)) bad("ساعات غير صالحة");
      if (x.kind === "reversal") { if (reversedTargets.has(x.reverses)) bad("قيد مُلغى مرتين"); reversedTargets.add(x.reverses); }
      else {
        const inPeriod = d => d >= m.startDate && d <= (m.endDate || "9999-12-31");
        if (DAY_MARKS.includes(x.kind) && !inPeriod(x.date)) bad("سجل يوم خارج فترة علاقة العمل");
        if (x.kind === "salary" && !(monthEnd(x.month) >= m.startDate && monthStart(x.month) <= (m.endDate || "9999-12-31"))) bad("راتب شهر خارج فترة علاقة العمل");
      }
    });
    store.entries.forEach(x => { if (x.kind === "reversal") { const t = store.entries.find(y => y.id === x.reverses); if (!t || t.kind === "reversal" || t.employmentId !== x.employmentId) bad("قيد إلغاء غير صالح"); } });
    if (!errors.length) {                                              // one status per day, one salary per month
      const seen = new Set();
      store.employments.forEach(m => effective(entriesOf(store, m.id)).forEach(x => {
        const key = DAY_MARKS.includes(x.kind) ? m.id + "|d|" + x.date : x.kind === "salary" ? m.id + "|m|" + x.month : null;
        if (key) { if (seen.has(key)) bad("سجل مكرر لليوم أو الشهر نفسه"); seen.add(key); }
      }));
    }
    const aud = new Set();
    store.audit.forEach(a => { if (!a || typeof a.id !== "string" || !SAFE_ID.test(a.id) || aud.has(a.id)) bad("سجل تعديلات تالف"); else aud.add(a.id); });
    return { ok: errors.length === 0, errors };
  }
  const finish = (s, extra) => { const v = validateStore(s); return v.ok ? Object.assign({ ok: true, store: s }, extra || {}) : { ok: false, error: v.errors[0] }; };

  /* ---------------- employers & people ---------------- */
  function addEmployer(store, raw, ctx) {
    ctx = ctx || {};
    const name = text(raw && raw.name, 60);
    if (!name) return { ok: false, error: "اكتب اسم الجهة" };
    const s = clone(store);
    if (s.employers.some(x => !x.archived && lc(x.name) === lc(name))) return { ok: false, error: "توجد جهة بهذا الاسم" };
    const employer = { id: ctx.id || newId(), name, currency: text(raw.currency, 8), archived: false, created: ctx.now || Date.now() };
    s.employers.push(employer); audit(s, ctx, "employer_add", { employerId: employer.id }, { name });
    return finish(s, { employer });
  }
  function addPerson(store, raw, ctx) {
    ctx = ctx || {};
    const name = text(raw && raw.name, 60);
    if (!name) return { ok: false, error: "اكتب اسم العامل" };
    const s = clone(store);
    const person = { id: ctx.id || newId(), name, phone: text(raw.phone, 30), notes: text(raw.notes, 500), created: ctx.now || Date.now() };
    s.people.push(person); audit(s, ctx, "person_add", { personId: person.id }, { name });
    return finish(s, { person });
  }
  function archiveEmployer(store, id, archived, ctx) {
    const s = clone(store), x = s.employers.find(e => e.id === id);
    if (!x) return { ok: false, error: "الجهة غير موجودة" };
    if (archived && s.employments.some(m => m.employerId === id && isActive(m))) return { ok: false, error: "أنهِ علاقات العمل المفتوحة مع هذه الجهة أولاً" };
    x.archived = !!archived; audit(s, ctx || {}, archived ? "employer_archive" : "employer_unarchive", { employerId: id }, {});
    return finish(s);
  }

  /* ---------------- employments ---------------- */
  function startEmployment(store, raw, ctx) {
    ctx = ctx || {};
    const s = clone(store);
    const employer = s.employers.find(x => x.id === raw.employerId), person = s.people.find(x => x.id === raw.personId);
    if (!employer || employer.archived) return { ok: false, error: "اختر جهة عمل صالحة" };
    if (!person) return { ok: false, error: "اختر العامل" };
    if (!WAGE_TYPES[raw.wageType]) return { ok: false, error: "اختر نوع الأجر" };
    if (!Number.isInteger(raw.wage) || raw.wage < 1 || raw.wage > Ledger.MAX_MINOR) return { ok: false, error: "أدخل أجراً صحيحاً أكبر من صفر" };
    if (!isDate(raw.startDate)) return { ok: false, error: "تاريخ البدء غير صحيح" };
    const hours = raw.normalHours == null || raw.normalHours === "" ? null : Number(raw.normalHours);
    if (hours !== null && !(hours > 0 && hours <= 24)) return { ok: false, error: "ساعات الدوام بين 0 و24" };
    const p = raw.perms || {};
    const m = {
      id: ctx.id || newId(), employerId: employer.id, personId: person.id, wageType: raw.wageType, normalHours: hours,
      startDate: raw.startDate, endDate: null, endReason: "", wageHistory: [{ from: raw.startDate, wage: raw.wage }],
      perms: { seeWage: p.seeWage !== false, seeBalance: p.seeBalance !== false, addHours: !!p.addHours }, notes: text(raw.notes, 500), created: ctx.now || Date.now()
    };
    if (s.employments.some(o => o.employerId === m.employerId && o.personId === m.personId && overlaps(o, m)))
      return { ok: false, error: "توجد علاقة عمل متداخلة مع هذه الجهة لهذا العامل؛ أنهِها أولاً" };
    s.employments.push(m); audit(s, ctx, "employment_start", { employmentId: m.id, employerId: m.employerId, personId: m.personId }, { wageType: m.wageType, wage: raw.wage, startDate: m.startDate });
    return finish(s, { employment: m });
  }
  function endEmployment(store, id, raw, ctx) {
    ctx = ctx || {};
    const s = clone(store), m = s.employments.find(x => x.id === id);
    if (!m) return { ok: false, error: "علاقة العمل غير موجودة" };
    if (m.endDate) return { ok: false, error: "علاقة العمل منتهية مسبقاً" };
    if (!isDate(raw.endDate) || raw.endDate < m.startDate) return { ok: false, error: "تاريخ الانتهاء غير صحيح" };
    const last = lastEarning(s, id);
    if (last && raw.endDate < last) return { ok: false, error: "يوجد سجلات حتى " + last + "؛ لا يمكن إنهاء العلاقة قبله" };
    m.endDate = raw.endDate; m.endReason = text(raw.reason, 200);
    const balance = summarizeEmployment(s, id).balance;
    audit(s, ctx, "employment_end", { employmentId: id }, { endDate: raw.endDate, balance, reason: m.endReason });
    return finish(s, { balance });
  }
  function changeWage(store, id, raw, ctx) {
    const s = clone(store), m = s.employments.find(x => x.id === id);
    if (!m || m.endDate) return { ok: false, error: "علاقة العمل غير متاحة للتعديل" };
    if (!isDate(raw.from) || raw.from < m.startDate) return { ok: false, error: "تاريخ سريان الأجر غير صحيح" };
    if (!Number.isInteger(raw.wage) || raw.wage < 1 || raw.wage > Ledger.MAX_MINOR) return { ok: false, error: "أدخل أجراً صحيحاً" };
    if (raw.from <= m.wageHistory[m.wageHistory.length - 1].from) return { ok: false, error: "يجب أن يكون التاريخ بعد آخر تغيير في الأجر" };
    const last = lastEarning(s, id);
    if (last && raw.from <= last) return { ok: false, error: "توجد قيود حتى " + last + " حُسبت بالأجر القديم؛ اختر تاريخاً بعدها" };
    m.wageHistory.push({ from: raw.from, wage: raw.wage });
    audit(s, ctx || {}, "wage_change", { employmentId: id }, { from: raw.from, wage: raw.wage });
    return finish(s);
  }
  function setPerms(store, id, perms, ctx) {
    const s = clone(store), m = s.employments.find(x => x.id === id);
    if (!m) return { ok: false, error: "علاقة العمل غير موجودة" };
    PERMS.forEach(p => { if (typeof perms[p] === "boolean") m.perms[p] = perms[p]; });
    audit(s, ctx || {}, "perms_change", { employmentId: id }, clone(m.perms));
    return finish(s);
  }
  /* A guided move: end the current employment and start a new one with another employer, atomically. Nothing is merged. */
  function moveWorker(store, raw, ctx) {
    ctx = ctx || {};
    const ended = endEmployment(store, raw.fromEmploymentId, { endDate: raw.endDate, reason: raw.reason || "انتقال إلى جهة أخرى" }, Object.assign({}, ctx, { id: ctx.id ? ctx.id + "-e" : undefined }));
    if (!ended.ok) return ended;
    const old = store.employments.find(x => x.id === raw.fromEmploymentId);
    if (old.employerId === raw.toEmployerId) return { ok: false, error: "اختر جهة مختلفة للانتقال" };
    const started = startEmployment(ended.store, Object.assign({}, raw.next, { employerId: raw.toEmployerId, personId: old.personId }), Object.assign({}, ctx, { id: ctx.id ? ctx.id + "-s" : undefined }));
    if (!started.ok) return started;
    return Object.assign({}, started, { balanceLeft: ended.balance });
  }

  /* ---------------- entries ---------------- */
  const fingerprint = x => [x.employmentId, x.kind, x.date, x.amount, x.month || "", x.hours100 || ""].join("|");
  function addEntry(store, raw, ctx) {
    ctx = ctx || {};
    const s = clone(store), m = s.employments.find(x => x.id === raw.employmentId);
    if (!m) return { ok: false, error: "علاقة العمل غير موجودة" };
    const kind = raw.kind;
    if (!Object.prototype.hasOwnProperty.call(KINDS, kind) || kind === "reversal") return { ok: false, error: "اختر نوع القيد" };
    if (!isDate(raw.date)) return { ok: false, error: "التاريخ غير صحيح" };
    if (m.wageType === "monthly" && kind === "work") return { ok: false, error: "راتب شهري: سجّل «راتب شهر» بدل يوم عمل" };
    if (m.wageType !== "monthly" && kind === "salary") return { ok: false, error: "«راتب شهر» للراتب الشهري فقط" };
    const x = { employmentId: m.id, kind, date: raw.date, note: text(raw.note, 300) };
    if (raw.hours100 != null && raw.hours100 !== "") {
      if (!Number.isInteger(raw.hours100) || raw.hours100 < 1 || raw.hours100 > 2400) return { ok: false, error: "الساعات بين 0.01 و24" };
      x.hours100 = raw.hours100;
    }
    if (m.wageType === "hourly" && kind === "work" && !x.hours100) return { ok: false, error: "أدخل عدد الساعات" };
    if (kind === "salary") { if (!isMonth(raw.month)) return { ok: false, error: "اختر شهر الراتب" }; x.month = raw.month; }
    // the period rules that keep a worker's old and new employers apart
    const inPeriod = d => d >= m.startDate && d <= (m.endDate || "9999-12-31");
    if (DAY_MARKS.includes(kind) && !inPeriod(x.date)) return { ok: false, error: "التاريخ خارج فترة علاقة العمل (" + m.startDate + " → " + (m.endDate || "مفتوحة") + ")" };
    if (kind === "salary" && !(monthEnd(x.month) >= m.startDate && monthStart(x.month) <= (m.endDate || "9999-12-31"))) return { ok: false, error: "الشهر خارج فترة علاقة العمل" };
    if ((kind === "bonus" || kind === "deduction") && !inPeriod(x.date)) return { ok: false, error: "التاريخ خارج فترة علاقة العمل" };
    if ((kind === "payment" || kind === "advance") && x.date < m.startDate) return { ok: false, error: "لا يمكن تسجيل دفعة قبل بدء علاقة العمل" };
    if (kind === "advance" && m.endDate && x.date > m.endDate) return { ok: false, error: "لا سلفة بعد انتهاء علاقة العمل (الدفعات مسموحة لتصفية المستحقات)" };
    const eff = effective(s.entries.filter(e => e.employmentId === m.id));
    if (DAY_MARKS.includes(kind) && eff.some(e => DAY_MARKS.includes(e.kind) && e.date === x.date)) return { ok: false, error: "يوجد سجل لهذا اليوم؛ صحّحه بقيد إلغاء أولاً" };
    if (kind === "salary" && eff.some(e => e.kind === "salary" && e.month === x.month)) return { ok: false, error: "سُجّل راتب هذا الشهر من قبل" };
    const suggested = suggest(m, kind, x.date, x.hours100);
    let amount = raw.amount == null || raw.amount === "" ? suggested : raw.amount;
    if (amount === null || amount === undefined) return { ok: false, error: "أدخل المبلغ" };
    if (!Number.isInteger(amount) || amount < 0 || amount > Ledger.MAX_MINOR) return { ok: false, error: "مبلغ غير صالح (خانتان عشريتان كحد أقصى)" };
    if (kind === "absence") amount = 0;
    else if (POSITIVE_ONLY.includes(kind) && amount < 1) return { ok: false, error: "أدخل مبلغاً أكبر من صفر" };
    x.amount = amount;
    if (suggested !== null && suggested !== amount) x.manual = true;
    if (raw.token) {
      x.token = text(raw.token, 64);
      if (s.entries.some(e => e.employmentId === m.id && e.token === x.token)) return { ok: false, duplicate: "token", error: "سُجّلت هذه العملية من قبل" };
    }
    if (!ctx.allowDuplicate && (kind === "payment" || kind === "advance" || kind === "bonus" || kind === "deduction") && eff.some(e => fingerprint(e) === fingerprint(x)))
      return { ok: false, duplicate: "similar", error: "توجد عملية مطابقة (نفس اليوم والنوع والمبلغ)" };
    x.id = ctx.id || newId(); x.createdAt = ctx.now || Date.now();
    s.entries.push(x);
    audit(s, ctx, "entry_add", { employmentId: m.id, entryId: x.id }, { kind, amount, date: x.date, manual: !!x.manual });
    return finish(s, { entry: x });
  }
  function reverseEntry(store, id, ctx) {
    ctx = ctx || {};
    const s = clone(store), t = s.entries.find(e => e.id === id);
    if (!t || t.kind === "reversal") return { ok: false, error: "القيد غير موجود" };
    if (s.entries.some(e => e.kind === "reversal" && e.reverses === id)) return { ok: false, error: "هذا القيد مُلغى مسبقاً" };
    const rev = { id: ctx.id ? ctx.id + "-r" : newId(), employmentId: t.employmentId, kind: "reversal", reverses: id, amount: t.amount, date: ctx.today || t.date, note: text(ctx.reason, 300), createdAt: ctx.now || Date.now() };
    s.entries.push(rev);
    audit(s, ctx, "entry_reverse", { employmentId: t.employmentId, entryId: id }, { kind: t.kind, amount: t.amount, reason: rev.note });
    return finish(s, { entry: rev });
  }

  /* ---------------- statements (plain text a worker or employer can keep or send) ---------------- */
  function statement(store, employmentId, opts) {
    opts = opts || {};
    const m = store.employments.find(x => x.id === employmentId);
    if (!m) return "";
    const employer = store.employers.find(x => x.id === m.employerId), person = store.people.find(x => x.id === m.personId);
    const cur = employer && employer.currency ? " " + employer.currency : "";
    const money = v => Ledger.formatMinor(v) + cur;
    const rows = effective(entriesOf(store, m.id)).filter(e => (!opts.from || e.date >= opts.from) && (!opts.to || e.date <= opts.to))
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    const sum = summarizeEmployment(store, m.id);
    const lines = ["📄 كشف حساب — " + (person ? person.name : ""), "الجهة: " + (employer ? employer.name : ""),
      "الفترة: " + m.startDate + " ← " + (m.endDate || "مستمرة"), "نوع الأجر: " + WAGE_TYPES[m.wageType], ""];
    rows.forEach(e => lines.push(e.date + " · " + KINDS[e.kind] + (e.kind === "salary" ? " " + e.month : "") + (e.hours100 ? " · " + Ledger.formatMinor(e.hours100) + " ساعة" : "") + (e.amount ? " · " + money(e.amount) : "") + (e.note ? " · " + e.note : "")));
    if (!rows.length) lines.push("لا توجد سجلات.");
    lines.push("", "المستحق: " + money(sum.earned), "الخصومات: " + money(sum.deductions), "المدفوع: " + money(sum.payments), "السلف: " + money(sum.advances),
      (sum.balance >= 0 ? "المتبقي للعامل: " : "على العامل: ") + money(Math.abs(sum.balance)), "", "— من ريمبوك");
    return lines.join("\n");
  }
  function personStatement(store, personId) {
    const person = store.people.find(x => x.id === personId);
    if (!person) return "";
    const list = archiveByPerson(store, personId);
    const blocks = list.map(d => statement(store, d.employment.id));
    return ["🗂️ ملف العامل — " + person.name, "عدد علاقات العمل: " + list.length, "(كل جهة في كشف مستقل ولا تُجمع مبالغها)", ""].concat(blocks.join("\n\n──────────\n\n")).join("\n");
  }

  /* ---------------- export / import ---------------- */
  function scopeIds(store, scope) {
    scope = scope || {};
    const empl = store.employments.filter(m => scope.employmentId ? m.id === scope.employmentId : scope.employerId ? m.employerId === scope.employerId : scope.personId ? m.personId === scope.personId : true);
    return { empl, employerIds: new Set(empl.map(m => m.employerId)), personIds: new Set(empl.map(m => m.personId)), emplIds: new Set(empl.map(m => m.id)) };
  }
  function makeEnvelope(store, scope, now) {
    const sc = scopeIds(store, scope), whole = !scope || (!scope.employerId && !scope.personId && !scope.employmentId);
    const data = {
      employers: store.employers.filter(x => whole || sc.employerIds.has(x.id) || x.id === (scope && scope.employerId)),
      people: store.people.filter(x => whole || sc.personIds.has(x.id) || x.id === (scope && scope.personId)),
      employments: sc.empl, entries: store.entries.filter(e => sc.emplIds.has(e.employmentId)),
      audit: store.audit.filter(a => whole || !a.refs || !a.refs.employmentId || sc.emplIds.has(a.refs.employmentId))
    };
    return { format: "rimbook-employment", version: VERSION, exportedAt: now || Date.now(), data: clone(data), checksum: Ledger.checksum(data) };
  }
  function verifyEnvelope(env) {
    if (!env || env.format !== "rimbook-employment") return { ok: false, error: "هذا ليس ملف علاقات عمل ريمبوك" };
    if (env.version !== VERSION) return { ok: false, error: "إصدار الملف غير مدعوم" };
    if (!env.data || Ledger.checksum(env.data) !== env.checksum) return { ok: false, error: "الملف تالف أو عُدّل يدوياً (فشل فحص السلامة)" };
    const v = validateStore(Object.assign({ version: VERSION }, env.data));
    return v.ok ? { ok: true, data: env.data } : { ok: false, error: "محتوى الملف غير صالح: " + v.errors[0] };
  }
  function importEnvelope(store, env, mode, ctx) {
    ctx = ctx || {};
    const ver = verifyEnvelope(env);
    if (!ver.ok) return ver;
    const data = clone(ver.data);
    let s;
    if (mode === "replace") s = Object.assign({ version: VERSION }, data);
    else {
      s = clone(store);
      const used = new Set([].concat(s.employers, s.people, s.employments, s.entries, s.audit).map(x => x.id));
      const fresh = id => { let n = id; while (used.has(n)) n = newId(); used.add(n); return n; };
      const map = {};
      for (const k of ["employers", "people", "employments", "entries"]) data[k].forEach(x => { map[x.id] = fresh(x.id); });
      data.employers.forEach(x => s.employers.push(Object.assign({}, x, { id: map[x.id] })));
      data.people.forEach(x => s.people.push(Object.assign({}, x, { id: map[x.id] })));
      data.employments.forEach(x => s.employments.push(Object.assign({}, x, { id: map[x.id], employerId: map[x.employerId], personId: map[x.personId] })));
      data.entries.forEach(x => s.entries.push(Object.assign({}, x, { id: map[x.id], employmentId: map[x.employmentId], reverses: x.reverses ? map[x.reverses] : undefined })));
      data.audit.forEach(a => s.audit.push({ id: fresh(a.id), t: a.t, action: a.action, detail: a.detail, refs: {} }));
    }
    audit(s, ctx, mode === "replace" ? "restore" : "import", {}, { employments: data.employments.length, entries: data.entries.length });
    return finish(s);
  }

  const api = {
    KINDS, WAGE_TYPES, PERMS, EARN, DAY_MARKS,
    emptyStore, validateStore, effective, wageOn, suggest, isActive,
    addEmployer, addPerson, archiveEmployer, startEmployment, endEmployment, changeWage, setPerms, moveWorker,
    addEntry, reverseEntry, summarizeEmployment, archiveByEmployer, archiveByPerson, statement, personStatement,
    makeEnvelope, verifyEnvelope, importEnvelope
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RimbookEmploymentCore = api;
})(typeof window !== "undefined" ? window : globalThis);
