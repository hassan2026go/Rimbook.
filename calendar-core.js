/* Rimbook calendar core — pure logic, no DOM, independent of the notebook, payroll and ledger storage.
   A "financial note" is only a DRAFT inside the calendar. It becomes a ledger entry solely through an explicit
   posting step, guarded against double posting (one-time token + `posted` link + one-item-per-entry invariant). */
(function (root) {
  "use strict";
  const Ledger = (typeof module !== "undefined" && module.exports && typeof require === "function") ? require("./ledger-core.js") : root.RimbookLedgerCore;
  const VERSION = 1;
  const TYPES = { note: "ملاحظة", appointment: "موعد", task: "مهمة" };
  const MODES = { none: "ملاحظة عادية — لا تدخل في أي حسابات", ledger: "ملاحظة مالية — للحسابات الجانبية", party: "ملاحظة مالية مرتبطة بجهة أو مشروع" };
  const REMIND_MINUTES = [0, 5, 10, 15, 30, 60, 1440];          // lead time before the item; null = no reminder
  const FIN_KINDS = ["income", "expense", "receivable", "payable", "collected", "paid"];
  const PARTY_KINDS = ["receivable", "payable", "collected", "paid"];
  const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
  const isDate = Ledger.isDate;
  const isTime = v => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const clone = v => JSON.parse(JSON.stringify(v));
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const text = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

  /* ---------------- dates (pure string/UTC arithmetic: no DST or timezone drift) ---------------- */
  const parse = d => new Date(d + "T00:00:00Z");
  const fmt = d => d.toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return fmt(x); };
  const weekday = d => parse(d).getUTCDay();                       // 0 = Sunday
  const startOfWeek = (d, weekStart) => addDays(d, -((weekday(d) - weekStart + 7) % 7));
  const addMonths = (d, n) => {
    const x = parse(d), day = x.getUTCDate();
    const target = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, last));
    return fmt(target);
  };
  function monthGrid(ym, weekStart) {                              // ym = "YYYY-MM"
    const first = ym + "-01";
    const [y, m] = ym.split("-").map(Number);
    const lastDay = fmt(new Date(Date.UTC(y, m, 0)));
    const weeks = [];
    for (let start = startOfWeek(first, weekStart); start <= lastDay; start = addDays(start, 7)) {
      weeks.push(Array.from({ length: 7 }, (_, i) => { const date = addDays(start, i); return { date, inMonth: date.startsWith(ym) }; }));
    }
    return weeks;
  }

  /* ---------------- store ---------------- */
  const emptyStore = () => ({ version: VERSION, settings: { weekStart: 6, allDayHour: 9 }, items: [], audit: [] });
  const live = store => store.items.filter(i => !i.deletedAt);
  const audit = (s, ctx, action, itemId, detail) =>
    s.audit.push({ id: ctx.id ? ctx.id + "-a" + s.audit.length : newId(), t: ctx.now || Date.now(), action, itemId: itemId || null, detail: detail || {} });

  function normalizeItem(raw) {
    const errors = [];
    const item = {
      type: raw.type, date: raw.date, time: raw.time || "", title: text(raw.title, 120), body: text(raw.body, 2000),
      done: raw.type === "task" ? !!raw.done : false,
      projectId: raw.projectId ? text(raw.projectId, 80) : "",
      remind: raw.remind === undefined || raw.remind === null || raw.remind === "" ? null : Number(raw.remind),
      finance: { mode: "none" }
    };
    if (item.remind !== null && !REMIND_MINUTES.includes(item.remind)) errors.push("قيمة التذكير غير صالحة");
    if (item.projectId && !SAFE_ID.test(item.projectId)) errors.push("مشروع غير صالح");
    if (!TYPES[item.type]) errors.push("اختر نوع العنصر");
    if (!isDate(item.date)) errors.push("التاريخ غير صحيح");
    if (!isTime(item.time)) errors.push("الوقت غير صحيح");
    if (item.type === "note" ? (!item.title && !item.body) : !item.title) errors.push(item.type === "note" ? "اكتب عنواناً أو نص الملاحظة" : "اكتب العنوان");
    const f = raw.finance || {};
    const mode = f.mode || "none";
    if (!Object.prototype.hasOwnProperty.call(MODES, mode)) errors.push("نوع الملاحظة غير معروف");
    else if (mode !== "none") {
      const fin = { mode, kind: f.kind, amount: f.amount == null || f.amount === "" ? null : f.amount, category: text(f.category, 40), party: text(f.party, 60) };
      if (!FIN_KINDS.includes(fin.kind)) errors.push("اختر نوع العملية المالية");
      if (fin.amount !== null && (!Number.isInteger(fin.amount) || fin.amount < 1 || fin.amount > Ledger.MAX_MINOR)) errors.push("مبلغ غير صالح (خانتان عشريتان كحد أقصى)");
      if (mode === "party" && !fin.party) errors.push("اكتب اسم الجهة أو المشروع");
      item.finance = fin;
    }
    return { item, errors };
  }
  const financeKey = f => JSON.stringify([f.mode, f.kind || null, f.amount == null ? null : f.amount, f.category || "", f.party || ""]);

  function createItem(store, raw, ctx) {
    ctx = ctx || {};
    const { item, errors } = normalizeItem(raw);
    if (errors.length) return { ok: false, error: errors[0] };
    const s = clone(store);
    item.id = ctx.id || newId(); item.seq = 1; item.posted = null;
    item.createdAt = ctx.now || Date.now(); item.updatedAt = item.createdAt;
    s.items.push(item);
    if (item.finance.mode !== "none") audit(s, ctx, "item_create", item.id, { mode: item.finance.mode, amount: item.finance.amount });
    return finish(s, { item });
  }
  function updateItem(store, id, fields, ctx) {
    ctx = ctx || {};
    const s = clone(store), cur = s.items.find(i => i.id === id && !i.deletedAt);
    if (!cur) return { ok: false, error: "العنصر غير موجود" };
    const merged = Object.assign({}, cur, fields, { finance: Object.assign({}, cur.finance, fields.finance || {}) });
    if (fields.finance && fields.finance.mode === "none") merged.finance = { mode: "none" };
    const { item, errors } = normalizeItem(merged);
    if (errors.length) return { ok: false, error: errors[0] };
    if (cur.posted && financeKey(item.finance) !== financeKey(cur.finance))
      return { ok: false, error: "هذه الملاحظة رُحِّلت إلى دفتر؛ عدّل العملية من الدفتر نفسه (إلغاء ثم قيد جديد)" };
    const before = financeKey(cur.finance), changedFinance = financeKey(item.finance) !== before;
    Object.assign(cur, item, { updatedAt: ctx.now || Date.now() });
    if (changedFinance) audit(s, ctx, "finance_edit", id, { from: before, mode: item.finance.mode, amount: item.finance.amount });
    return finish(s, { item: cur });
  }
  function toggleDone(store, id, ctx) {
    const s = clone(store), cur = s.items.find(i => i.id === id && !i.deletedAt);
    if (!cur || cur.type !== "task") return { ok: false, error: "ليست مهمة" };
    cur.done = !cur.done; cur.updatedAt = (ctx && ctx.now) || Date.now();
    return finish(s, { item: cur });
  }
  function deleteItem(store, id, ctx) {                        // soft delete: the record and its audit trail remain
    ctx = ctx || {};
    const s = clone(store), cur = s.items.find(i => i.id === id && !i.deletedAt);
    if (!cur) return { ok: false, error: "العنصر غير موجود" };
    cur.deletedAt = ctx.now || Date.now();
    if (cur.finance.mode !== "none") audit(s, ctx, "item_delete", id, { posted: !!cur.posted });
    return finish(s);
  }

  /* ---------------- queries ---------------- */
  const sortItems = (a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "") || a.createdAt - b.createdAt;
  const itemsInRange = (store, from, to) => live(store).filter(i => i.date >= from && i.date <= to).sort(sortItems);
  function dayMarks(store, from, to) {                         // for month cells
    const marks = {};
    itemsInRange(store, from, to).forEach(i => {
      const m = marks[i.date] = marks[i.date] || { count: 0, openTasks: 0, pendingFinance: 0 };
      m.count++;
      if (i.type === "task" && !i.done) m.openTasks++;
      if (i.finance.mode !== "none" && !i.posted) m.pendingFinance++;
    });
    return marks;
  }
  function search(store, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];
    return live(store).filter(i => [i.title, i.body, i.finance.party, i.finance.category].some(v => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => sortItems(b, a)).slice(0, 100);
  }

  /* ---------------- explicit, idempotent posting to a ledger ---------------- */
  function prepareLedgerPost(item) {
    if (!item || item.deletedAt) return { ok: false, error: "العنصر غير موجود" };
    const f = item.finance;
    if (f.mode === "none") return { ok: false, error: "هذه ملاحظة عادية ولا تدخل في الحسابات" };
    if (item.posted) return { ok: false, error: "رُحِّلت هذه الملاحظة من قبل" };
    if (!FIN_KINDS.includes(f.kind)) return { ok: false, error: "حدد نوع العملية أولاً" };
    if (!Number.isInteger(f.amount) || f.amount < 1) return { ok: false, error: "أضف المبلغ إلى الملاحظة أولاً" };
    if (PARTY_KINDS.includes(f.kind) && !text(f.party, 60)) return { ok: false, error: "هذا النوع يحتاج اسم الجهة" };
    const label = item.title || item.body.slice(0, 40);
    return {
      ok: true,
      raw: { kind: f.kind, amount: f.amount, date: item.date, category: f.category, party: f.party, note: "من التقويم: " + label, token: "cal-" + item.id + "-" + (item.seq || 1) }
    };
  }
  function markPosted(store, id, link, ctx) {
    ctx = ctx || {};
    const s = clone(store), cur = s.items.find(i => i.id === id && !i.deletedAt);
    if (!cur) return { ok: false, error: "العنصر غير موجود" };
    if (cur.posted) return { ok: false, error: "رُحِّلت هذه الملاحظة من قبل" };
    if (!link || !SAFE_ID.test(String(link.bookId)) || !SAFE_ID.test(String(link.entryId))) return { ok: false, error: "رابط الدفتر غير صالح" };
    if (s.items.some(i => i.posted && i.posted.bookId === link.bookId && i.posted.entryId === link.entryId)) return { ok: false, error: "هذا القيد مربوط بملاحظة أخرى" };
    cur.posted = { bookId: link.bookId, entryId: link.entryId, seq: cur.seq || 1, at: ctx.now || Date.now() };
    cur.updatedAt = cur.posted.at;
    audit(s, ctx, "post", id, { bookId: link.bookId, entryId: link.entryId, amount: cur.finance.amount, kind: cur.finance.kind });
    return finish(s, { item: cur });
  }
  function unlinkPosted(store, id, ledgerStatus, ctx) {         // only when the ledger entry was reversed or is gone
    ctx = ctx || {};
    const s = clone(store), cur = s.items.find(i => i.id === id && !i.deletedAt);
    if (!cur || !cur.posted) return { ok: false, error: "الملاحظة غير مرحّلة" };
    if (ledgerStatus !== "reversed" && ledgerStatus !== "missing") return { ok: false, error: "القيد ما زال فعّالاً في الدفتر؛ ألغِه من الدفتر أولاً" };
    audit(s, ctx, "unlink", id, { bookId: cur.posted.bookId, entryId: cur.posted.entryId, status: ledgerStatus });
    cur.posted = null; cur.seq = (cur.seq || 1) + 1;            // a fresh token, so a deliberate re-post is possible
    return finish(s, { item: cur });
  }

  /* ---------------- reminders: a pure plan of the alarms the phone should hold ---------------- */
  /* Only FUTURE reminders are planned (a reminder whose moment has passed is never re-created, so a re-sync can't make it ring again).
     Notification text never contains amounts: lock screens are visible to others. */
  function planAlarms(store, nowMs, opts) {
    opts = opts || {};
    const horizon = (opts.horizonDays || 400) * 86400000, max = opts.max || 200;
    const allDayHour = Number.isInteger(store.settings && store.settings.allDayHour) ? store.settings.allDayHour : 9;
    const plan = [];
    live(store).forEach(i => {
      if (i.remind == null || (i.type === "task" && i.done)) return;
      const [y, m, d] = i.date.split("-").map(Number);
      const [hh, mm] = i.time ? i.time.split(":").map(Number) : [allDayHour, 0];
      const base = new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
      const at = base - i.remind * 60000;
      if (!Number.isFinite(at) || at <= nowMs + 5000 || at > nowMs + horizon) return;
      const kind = i.finance.mode !== "none" && !i.posted ? "استحقاق مالي" : TYPES[i.type];
      const when = i.time ? i.time : "طوال اليوم";
      const lead = i.remind === 0 ? "الآن" : i.remind === 1440 ? "غداً" : i.remind === 60 ? "بعد ساعة" : "بعد " + i.remind + " دقيقة";
      plan.push({ id: "cal-" + i.id, title: i.title || i.body.slice(0, 60) || TYPES[i.type], body: kind + " · " + when + (i.remind ? " · " + lead : ""), at });
    });
    return plan.sort((a, b) => a.at - b.at).slice(0, max);
  }
  /* Plain-text agenda for sharing. Never includes amounts. */
  function agendaText(store, from, to, opts) {
    opts = opts || {};
    const days = {};
    itemsInRange(store, from, to).filter(i => !opts.projectId || i.projectId === opts.projectId).forEach(i => (days[i.date] = days[i.date] || []).push(i));
    const lines = ["📅 " + (opts.title || "جدولي"), "الفترة: " + from + " ← " + to, ""];
    const keys = Object.keys(days).sort();
    if (!keys.length) lines.push("لا توجد بنود في هذه الفترة.");
    keys.forEach(d => {
      lines.push(d);
      days[d].forEach(i => lines.push("• " + (i.time ? i.time + " — " : "") + (i.title || i.body.slice(0, 60)) + " (" + TYPES[i.type] + (i.type === "task" && i.done ? " ✓" : "") + ")"));
      lines.push("");
    });
    lines.push("— من ريمبوك");
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function setAllDayHour(store, hour) {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { ok: false, error: "ساعة غير صالحة" };
    const s = clone(store); s.settings.allDayHour = hour; return finish(s);
  }

  /* ---------------- validation & backup ---------------- */
  function validateStore(store) {
    const errors = [], bad = m => { errors.push(m); return false; };
    if (!store || typeof store !== "object" || store.version !== VERSION) return { ok: false, errors: ["إصدار غير مدعوم"] };
    if (!Array.isArray(store.items) || !Array.isArray(store.audit)) return { ok: false, errors: ["بنية غير صالحة"] };
    if (!store.settings || ![0, 1, 6].includes(store.settings.weekStart)) bad("إعداد بداية الأسبوع غير صالح");
    else if (store.settings.allDayHour != null && !(Number.isInteger(store.settings.allDayHour) && store.settings.allDayHour >= 0 && store.settings.allDayHour <= 23)) bad("ساعة التذكير الافتراضية غير صالحة");
    const ids = new Set(), links = new Set();
    store.items.forEach(i => {
      if (!i || typeof i.id !== "string" || !SAFE_ID.test(i.id)) return bad("معرّف غير صالح");
      if (ids.has(i.id)) return bad("معرّف مكرر");
      ids.add(i.id);
      if (!TYPES[i.type]) bad("نوع غير معروف");
      if (!isDate(i.date)) bad("تاريخ غير صالح");
      if (!isTime(i.time || "")) bad("وقت غير صالح");
      if (i.remind != null && !REMIND_MINUTES.includes(i.remind)) bad("قيمة تذكير غير صالحة");
      if (i.projectId && !SAFE_ID.test(String(i.projectId))) bad("مشروع غير صالح");
      if (typeof i.title !== "string" || typeof i.body !== "string") bad("نص غير صالح");
      const f = i.finance;
      if (!f || !Object.prototype.hasOwnProperty.call(MODES, f.mode)) return bad("بيانات مالية غير صالحة");
      if (f.mode !== "none") {
        if (!FIN_KINDS.includes(f.kind)) bad("نوع عملية غير صالح");
        if (f.amount != null && (!Number.isInteger(f.amount) || f.amount < 1 || f.amount > Ledger.MAX_MINOR)) bad("مبلغ غير صالح");
      }
      if (i.posted) {
        if (f.mode === "none") bad("ملاحظة عادية مرحّلة");
        if (!SAFE_ID.test(String(i.posted.bookId)) || !SAFE_ID.test(String(i.posted.entryId))) bad("رابط ترحيل غير صالح");
        const key = i.posted.bookId + ":" + i.posted.entryId;
        if (links.has(key)) bad("قيد مربوط بأكثر من ملاحظة"); links.add(key);
      }
    });
    const aud = new Set();
    store.audit.forEach(a => { if (!a || typeof a.id !== "string" || !SAFE_ID.test(a.id) || aud.has(a.id)) bad("سجل تعديلات تالف"); else aud.add(a.id); });
    return { ok: errors.length === 0, errors };
  }
  function finish(s, extra) {
    const v = validateStore(s);
    return v.ok ? Object.assign({ ok: true, store: s }, extra || {}) : { ok: false, error: v.errors[0] };
  }
  function setWeekStart(store, weekStart) {
    if (![0, 1, 6].includes(weekStart)) return { ok: false, error: "قيمة غير صالحة" };
    const s = clone(store); s.settings.weekStart = weekStart; return finish(s);
  }
  const makeEnvelope = (store, now) => {
    const data = { settings: clone(store.settings), items: clone(store.items), audit: clone(store.audit) };
    return { format: "rimbook-calendar", version: VERSION, exportedAt: now || Date.now(), data, checksum: Ledger.checksum(data) };
  };
  function verifyEnvelope(env) {
    if (!env || env.format !== "rimbook-calendar") return { ok: false, error: "هذا ليس ملف تقويم ريمبوك" };
    if (env.version !== VERSION) return { ok: false, error: "إصدار الملف غير مدعوم" };
    if (!env.data || Ledger.checksum(env.data) !== env.checksum) return { ok: false, error: "الملف تالف أو عُدّل يدوياً (فشل فحص السلامة)" };
    const v = validateStore({ version: VERSION, settings: env.data.settings, items: env.data.items, audit: env.data.audit });
    return v.ok ? { ok: true, data: env.data } : { ok: false, error: "محتوى الملف غير صالح: " + v.errors[0] };
  }
  function importEnvelope(store, env, mode, ctx) {
    ctx = ctx || {};
    const ver = verifyEnvelope(env);
    if (!ver.ok) return ver;
    const data = clone(ver.data);
    let s;
    if (mode === "replace") s = { version: VERSION, settings: data.settings, items: data.items, audit: data.audit };
    else {
      s = clone(store);
      const used = new Set(s.items.map(i => i.id)), usedA = new Set(s.audit.map(a => a.id));
      const links = new Set(s.items.filter(i => i.posted).map(i => i.posted.bookId + ":" + i.posted.entryId));
      data.items.forEach(i => {
        if (used.has(i.id)) { i.id = newId(); i.posted = null; }                    // collision: becomes a plain copy, never a second link
        else if (i.posted && links.has(i.posted.bookId + ":" + i.posted.entryId)) i.posted = null;
        used.add(i.id); if (i.posted) links.add(i.posted.bookId + ":" + i.posted.entryId);
        s.items.push(i);
      });
      data.audit.forEach(a => { if (usedA.has(a.id)) a.id = newId(); usedA.add(a.id); s.audit.push(a); });
    }
    audit(s, ctx, mode === "replace" ? "restore" : "import", null, { items: data.items.length });
    return finish(s);
  }

  const api = {
    TYPES, MODES, FIN_KINDS, PARTY_KINDS, REMIND_MINUTES,
    addDays, addMonths, weekday, startOfWeek, monthGrid,
    emptyStore, normalizeItem, createItem, updateItem, toggleDone, deleteItem,
    itemsInRange, dayMarks, search, prepareLedgerPost, markPosted, unlinkPosted,
    validateStore, setWeekStart, planAlarms, setAllDayHour, agendaText, makeEnvelope, verifyEnvelope, importEnvelope
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RimbookCalendarCore = api;
})(typeof window !== "undefined" ? window : globalThis);
