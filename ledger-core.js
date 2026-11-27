/* Rimbook side-ledgers core — pure logic, no DOM, no dependency on the notebook or payroll data.
   Money is stored as INTEGER minor units (cents). The calculator uses exact fixed-point BigInt arithmetic.
   Entries are never edited or deleted: corrections are reversal entries, and every change is audited. */
(function (root) {
  "use strict";

  const ONE = 10n ** 12n;              // fixed-point scale for the calculator (12 decimals)
  const MINOR_UNIT = 10n ** 10n;       // ONE / 100  -> converts scaled value to 2-decimal minor units
  const MAX_ABS = 10n ** 30n;
  const MAX_MINOR = 100000000000;      // 1,000,000,000.00 per entry keeps every sum inside Number's safe range
  const VERSION = 1;
  const KINDS = {
    income:     "دخل / إيراد",
    expense:    "مصروف",
    receivable: "دين لي / مستحق لي",
    payable:    "دين عليّ / مستحق عليّ",
    collected:  "تحصيل (قبضت)",
    paid:       "سداد (دفعت)",
    reversal:   "قيد إلغاء"
  };
  const AR = "٠١٢٣٤٥٦٧٨٩", FA = "۰۱۲۳۴۵۶۷۸۹";

  /* ---------------- exact decimals ---------------- */
  function normDigits(input) {
    return String(input == null ? "" : input)
      .replace(/[٠-٩۰-۹]/g, ch => { const i = AR.indexOf(ch); return String(i >= 0 ? i : FA.indexOf(ch)); })
      .replace(/٫/g, ".").replace(/٬/g, ",").replace(/\s+/g, "");
  }
  function divRound(n, d) {            // integer division, half away from zero
    if (d < 0n) { n = -n; d = -d; }
    const neg = n < 0n, a = neg ? -n : n;
    let q = a / d;
    if ((a % d) * 2n >= d) q += 1n;
    return neg ? -q : q;
  }
  function parseDecimal(input) {
    const s = normDigits(input);
    if (!s || !/^[0-9.,]+$/.test(s)) return null;
    const hasDot = s.includes("."), hasComma = s.includes(",");
    let intPart = "", frac = "";
    if (hasDot && hasComma) {
      const li = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
      const dec = s[li], thou = dec === "." ? "," : ".";
      const head = s.slice(0, li);
      if (!new RegExp("^\\d{1,3}(?:\\" + thou + "\\d{3})*$").test(head)) return null;
      intPart = head.split(thou).join(""); frac = s.slice(li + 1);
    } else if (hasDot || hasComma) {
      const sep = hasDot ? "." : ",", parts = s.split(sep);
      if (parts.length > 2) {
        if (!new RegExp("^\\d{1,3}(?:\\" + sep + "\\d{3})+$").test(s)) return null;
        intPart = parts.join("");
      } else if (sep === "," && parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3 && parts[0] !== "0") {
        intPart = parts[0] + parts[1];                    // "12,345" -> 12345
      } else { intPart = parts[0]; frac = parts[1]; }     // "2,5" / "2.5" -> 2.5
    } else intPart = s;
    if (intPart === "" && frac === "") return null;
    if (intPart === "") intPart = "0";
    if (!/^\d+$/.test(intPart) || (frac !== "" && !/^\d+$/.test(frac)) || frac.length > 12) return null;
    return BigInt(intPart) * ONE + BigInt((frac + "000000000000").slice(0, 12));
  }
  function formatDecimal(v, maxDp) {
    maxDp = maxDp == null ? 8 : maxDp;
    const neg = v < 0n;
    const a = divRound(neg ? -v : v, 10n ** BigInt(12 - maxDp));
    const p = 10n ** BigInt(maxDp), ip = a / p;
    const fp = (a % p).toString().padStart(maxDp, "0").replace(/0+$/, "");
    const text = ip.toString() + (fp ? "." + fp : "");
    return neg && (ip !== 0n || fp) ? "-" + text : text;
  }
  function evaluate(expr) {
    const fail = message => ({ ok: false, error: message });
    let s = normDigits(expr).replace(/×/g, "*").replace(/÷/g, "/").replace(/[−–—]/g, "-").replace(/,/g, "");
    if (!s) return fail("اكتب عملية حسابية");
    const tokens = s.match(/\d+\.?\d*|\.\d+|[()+\-*/%]/g) || [];
    if (tokens.join("") !== s) return fail("يوجد رمز غير مفهوم في العملية");
    let i = 0;
    const err = m => { throw { calcError: m }; };
    const peek = () => tokens[i], next = () => tokens[i++];
    const resolve = x => x.pct ? divRound(x.v, 100n) : x.v;
    const guard = v => { if (v > MAX_ABS || v < -MAX_ABS) err("الرقم كبير جداً"); return v; };
    function primary() {
      const t = next();
      if (t === undefined) err("العملية ناقصة");
      if (t === "(") { const inner = expr_(); if (next() !== ")") err("قوس غير مغلق"); return { v: resolve(inner), pct: false }; }
      if (/^[\d.]/.test(t)) { const v = parseDecimal(t); if (v === null) err("رقم غير صحيح: " + t); return { v, pct: false }; }
      return err("تعبير غير صحيح");
    }
    function postfix() {
      let p = primary();
      while (peek() === "%") { next(); p = { v: p.pct ? divRound(p.v, 100n) : p.v, pct: true }; }
      return p;
    }
    function unary() {
      if (peek() === "-") { next(); return { v: -resolve(unary()), pct: false }; }
      if (peek() === "+") { next(); return { v: resolve(unary()), pct: false }; }
      return postfix();
    }
    function term() {
      let left = unary();
      while (peek() === "*" || peek() === "/") {
        const op = next(), right = unary(), l = resolve(left), r = resolve(right);
        if (op === "/") { if (r === 0n) err("لا يمكن القسمة على صفر"); left = { v: guard(divRound(l * ONE, r)), pct: false }; }
        else left = { v: guard(divRound(l * r, ONE)), pct: false };
      }
      return left;
    }
    function expr_() {
      let left = term();
      while (peek() === "+" || peek() === "-") {
        const op = next(), right = term(), l = resolve(left);
        const r = right.pct ? divRound(l * right.v, 100n * ONE) : right.v;   // 50 + 10% = 55
        left = { v: guard(op === "+" ? l + r : l - r), pct: false };
      }
      return left;
    }
    try {
      const result = expr_();
      if (i !== tokens.length) err("تعبير غير صحيح");
      const value = guard(resolve(result));
      return { ok: true, value, text: formatDecimal(value) };
    } catch (e) {
      if (e && e.calcError) return fail(e.calcError);
      throw e;
    }
  }

  /* ---------------- money in minor units ---------------- */
  function parseMinor(input) {            // "1,234.56" -> 123456 ; null when invalid or more than 2 decimals
    const d = parseDecimal(input);
    if (d === null || d % MINOR_UNIT !== 0n) return null;
    const m = d / MINOR_UNIT;
    return m > BigInt(MAX_MINOR) ? null : Number(m);
  }
  function roundToMinor(scaled) { return Number(divRound(scaled, MINOR_UNIT)); }
  function group(intStr) { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function formatMinor(minor) {
    const neg = minor < 0, a = BigInt(Math.abs(minor));
    return (neg ? "-" : "") + group((a / 100n).toString()) + "." + (a % 100n).toString().padStart(2, "0");
  }
  const plainMinor = minor => formatMinor(minor).replace(/,/g, "");

  /* ---------------- helpers ---------------- */
  const clone = v => JSON.parse(JSON.stringify(v));
  const emptyStore = () => ({ version: VERSION, books: [], entries: [], audit: [] });
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
  const isDate = v => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) return false;
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  };
  const partyKey = p => String(p || "").trim().replace(/\s+/g, " ").toLowerCase();
  const fingerprint = e => [e.bookId, e.kind, e.date, e.amount, partyKey(e.party), String(e.category || "").trim().toLowerCase()].join("|");
  const text = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

  function effectiveEntries(entries) {
    const reversed = new Set(entries.filter(e => e.kind === "reversal").map(e => e.reverses));
    return entries.filter(e => e.kind !== "reversal" && !reversed.has(e.id));
  }

  /* ---------------- calculations ---------------- */
  function partyBalances(entries) {       // open debts per party (effective entries only)
    const map = new Map();
    const row = e => {
      const k = partyKey(e.party);
      if (!map.has(k)) map.set(k, { party: text(e.party, 60), receivable: 0, collected: 0, payable: 0, paid: 0 });
      return map.get(k);
    };
    effectiveEntries(entries).forEach(e => {
      if (e.kind === "receivable") row(e).receivable += e.amount;
      else if (e.kind === "collected") row(e).collected += e.amount;
      else if (e.kind === "payable") row(e).payable += e.amount;
      else if (e.kind === "paid") row(e).paid += e.amount;
    });
    return [...map.values()].map(r => ({ ...r, receivableOpen: r.receivable - r.collected, payableOpen: r.payable - r.paid }));
  }
  /* Definitions (kept deliberately simple and explicit):
     profit/loss  = income - expense                       (inside the chosen date range; debts do not count)
     cash balance = income - expense + collected - paid
                    - receivable(cashNow) + payable(cashNow)   (a cash loan given/received moves cash; a credit sale does not)
     open debts   = receivable - collected / payable - paid     (all dates up to `to`, per party)
     net position = cash balance + open receivable - open payable */
  function summarize(entries, opts) {
    opts = opts || {};
    const inRange = e => (!opts.from || e.date >= opts.from) && (!opts.to || e.date <= opts.to);
    const upTo = e => !opts.to || e.date <= opts.to;
    const eff = effectiveEntries(entries);
    const sum = (list, kind) => list.filter(e => e.kind === kind).reduce((t, e) => t + e.amount, 0);
    const ranged = eff.filter(inRange), upto = eff.filter(upTo);
    const income = sum(ranged, "income"), expense = sum(ranged, "expense");
    const cash = sum(upto, "income") - sum(upto, "expense") + sum(upto, "collected") - sum(upto, "paid")
      - upto.filter(e => e.kind === "receivable" && e.cashNow).reduce((t, e) => t + e.amount, 0)
      + upto.filter(e => e.kind === "payable" && e.cashNow).reduce((t, e) => t + e.amount, 0);
    const parties = partyBalances(upto);
    const receivableOpen = parties.reduce((t, p) => t + p.receivableOpen, 0);
    const payableOpen = parties.reduce((t, p) => t + p.payableOpen, 0);
    const byCategory = {}, byMonth = {};
    ranged.filter(e => e.kind === "income" || e.kind === "expense").forEach(e => {
      const c = text(e.category, 40) || "بدون تصنيف";
      (byCategory[c] = byCategory[c] || { income: 0, expense: 0 })[e.kind] += e.amount;
      (byMonth[e.date.slice(0, 7)] = byMonth[e.date.slice(0, 7)] || { income: 0, expense: 0 })[e.kind] += e.amount;
    });
    return { income, expense, profit: income - expense, cash, receivableOpen, payableOpen, net: cash + receivableOpen - payableOpen, parties, byCategory, byMonth, count: ranged.length };
  }

  /* ---------------- validation ---------------- */
  function validateStore(store) {
    const errors = [];
    const bad = m => { errors.push(m); return false; };
    if (!store || typeof store !== "object") return { ok: false, errors: ["بنية غير صالحة"] };
    if (store.version !== VERSION) bad("إصدار غير مدعوم");
    ["books", "entries", "audit"].forEach(k => { if (!Array.isArray(store[k])) bad("الحقل " + k + " مفقود"); });
    if (errors.length) return { ok: false, errors };
    const bookIds = new Set();
    store.books.forEach(b => {
      if (!b || typeof b.id !== "string" || !SAFE_ID.test(b.id)) return bad("دفتر بلا معرّف صالح");
      if (bookIds.has(b.id)) return bad("معرّف دفتر مكرر");
      bookIds.add(b.id);
      if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 40) bad("اسم دفتر غير صالح");
    });
    const byId = new Map(), reversedTargets = new Set();
    store.entries.forEach(e => {
      if (!e || typeof e.id !== "string" || !SAFE_ID.test(e.id)) return bad("قيد بلا معرّف صالح");
      if (byId.has(e.id)) return bad("معرّف قيد مكرر");
      byId.set(e.id, e);
      if (!bookIds.has(e.bookId)) bad("قيد يشير إلى دفتر غير موجود");
      if (!Object.prototype.hasOwnProperty.call(KINDS, e.kind)) bad("نوع قيد غير معروف");
      if (!Number.isInteger(e.amount) || e.amount < 1 || e.amount > MAX_MINOR) bad("مبلغ غير صالح (يجب أن يكون عدداً صحيحاً بوحدات صغرى)");
      if (!isDate(e.date)) bad("تاريخ غير صالح");
      ["category", "party", "note"].forEach(f => { if (e[f] != null && typeof e[f] !== "string") bad("حقل نصي غير صالح"); });
      if (e.kind === "reversal") {
        if (typeof e.reverses !== "string") bad("قيد إلغاء بلا هدف");
        else { if (reversedTargets.has(e.reverses)) bad("قيد مُلغى مرتين"); reversedTargets.add(e.reverses); }
      } else if (e.reverses != null) bad("حقل إلغاء في قيد عادي");
      if (["receivable", "payable", "collected", "paid"].includes(e.kind) && !partyKey(e.party)) bad("قيد دين بلا اسم جهة");
    });
    store.entries.forEach(e => {
      if (e.kind !== "reversal") return;
      const t = byId.get(e.reverses);
      if (!t || t.kind === "reversal" || t.bookId !== e.bookId) bad("قيد إلغاء يشير إلى قيد غير صالح");
    });
    const auditIds = new Set();
    store.audit.forEach(a => { if (!a || typeof a.id !== "string" || !SAFE_ID.test(a.id) || auditIds.has(a.id)) bad("سجل تعديلات مكرر أو تالف"); else auditIds.add(a.id); });
    if (!errors.length) {
      store.books.forEach(b => {
        partyBalances(store.entries.filter(e => e.bookId === b.id)).forEach(p => {
          if (p.receivableOpen < 0 || p.payableOpen < 0) bad("رصيد دين سالب للجهة «" + p.party + "»");
        });
      });
    }
    return { ok: errors.length === 0, errors };
  }

  /* ---------------- operations (return a NEW store, never mutate) ---------------- */
  const audit = (s, ctx, action, bookId, entryId, detail) =>
    s.audit.push({ id: (ctx.id ? ctx.id + "-a" + s.audit.length : newId()), t: ctx.now || Date.now(), action, bookId: bookId || null, entryId: entryId || null, detail: detail || {} });
  const finish = (s, extra) => {
    const v = validateStore(s);
    return v.ok ? Object.assign({ ok: true, store: s }, extra || {}) : { ok: false, error: v.errors[0] };
  };

  function createBook(store, raw, ctx) {
    ctx = ctx || {};
    const s = clone(store), name = text(raw && raw.name, 40);
    if (!name) return { ok: false, error: "اكتب اسم الدفتر" };
    if (s.books.some(b => !b.archived && b.name.trim().toLowerCase() === name.toLowerCase())) return { ok: false, error: "يوجد دفتر بهذا الاسم" };
    const book = { id: ctx.id || newId(), name, currency: text(raw && raw.currency, 8), created: ctx.now || Date.now(), archived: false };
    s.books.push(book);
    audit(s, ctx, "book_create", book.id, null, { name });
    return finish(s, { book });
  }
  function archiveBook(store, id, archived, ctx) {
    ctx = ctx || {};
    const s = clone(store), b = s.books.find(x => x.id === id);
    if (!b) return { ok: false, error: "الدفتر غير موجود" };
    b.archived = !!archived;
    audit(s, ctx, archived ? "book_archive" : "book_unarchive", id, null, { name: b.name });
    return finish(s);
  }
  function normalizeEntry(raw) {
    const errors = [], e = {
      bookId: raw.bookId, kind: raw.kind, amount: raw.amount, date: raw.date,
      category: text(raw.category, 40), party: text(raw.party, 60), note: text(raw.note, 300)
    };
    if (!Object.prototype.hasOwnProperty.call(KINDS, e.kind) || e.kind === "reversal") errors.push("اختر نوع العملية");
    if (!Number.isInteger(e.amount) || e.amount < 1 || e.amount > MAX_MINOR) errors.push("أدخل مبلغاً صحيحاً أكبر من صفر (خانتان عشريتان كحد أقصى)");
    if (!isDate(e.date)) errors.push("التاريخ غير صحيح");
    if (["receivable", "payable", "collected", "paid"].includes(e.kind) && !partyKey(e.party)) errors.push("اكتب اسم الجهة للدين أو التحصيل أو السداد");
    if (e.kind === "receivable" || e.kind === "payable") {
      e.cashNow = !!raw.cashNow;
      if (raw.tag === "advance") e.tag = "advance";
    }
    if (raw.token) e.token = text(raw.token, 64);
    if (raw.revisionOf) e.revisionOf = String(raw.revisionOf);
    return { entry: e, errors };
  }
  function checkSettle(entries, e) {
    if (e.kind !== "collected" && e.kind !== "paid") return null;
    const p = partyBalances(entries.filter(x => x.bookId === e.bookId)).find(x => partyKey(x.party) === partyKey(e.party));
    const open = p ? (e.kind === "collected" ? p.receivableOpen : p.payableOpen) : 0;
    if (e.amount > open) return "المبلغ أكبر من الرصيد المفتوح لهذه الجهة (" + formatMinor(open) + ")";
    return null;
  }
  function addEntry(store, raw, ctx) {
    ctx = ctx || {};
    const s = clone(store), book = s.books.find(b => b.id === raw.bookId);
    if (!book || book.archived) return { ok: false, error: "الدفتر غير موجود أو مؤرشف" };
    const { entry, errors } = normalizeEntry(raw);
    if (errors.length) return { ok: false, error: errors[0] };
    if (entry.token && s.entries.some(x => x.bookId === entry.bookId && x.token === entry.token))
      return { ok: false, duplicate: "token", error: "سُجّلت هذه العملية من قبل" };
    if (!ctx.allowDuplicate) {
      const fp = fingerprint(entry);
      if (effectiveEntries(s.entries).some(x => fingerprint(x) === fp))
        return { ok: false, duplicate: "similar", error: "توجد عملية مطابقة (نفس اليوم والنوع والمبلغ والجهة)" };
    }
    const settle = checkSettle(s.entries, entry);
    if (settle) return { ok: false, error: settle };
    entry.id = ctx.id || newId();
    entry.createdAt = ctx.now || Date.now();
    s.entries.push(entry);
    audit(s, ctx, "entry_add", entry.bookId, entry.id, { kind: entry.kind, amount: entry.amount, date: entry.date, party: entry.party, category: entry.category });
    return finish(s, { entry });
  }
  function reverseEntry(store, id, ctx) {
    ctx = ctx || {};
    const s = clone(store), target = s.entries.find(e => e.id === id);
    if (!target || target.kind === "reversal") return { ok: false, error: "القيد غير موجود" };
    if (s.entries.some(e => e.kind === "reversal" && e.reverses === id)) return { ok: false, error: "هذا القيد مُلغى مسبقاً" };
    const rev = { id: ctx.id ? ctx.id + "-r" : newId(), bookId: target.bookId, kind: "reversal", reverses: id, amount: target.amount, date: ctx.today || target.date, note: text(ctx.reason, 300), createdAt: ctx.now || Date.now() };
    s.entries.push(rev);
    audit(s, ctx, "entry_reverse", target.bookId, id, { reversal: rev.id, reason: rev.note, kind: target.kind, amount: target.amount });
    const out = finish(s, { entry: rev });
    return out.ok ? out : { ok: false, error: /سالب/.test(out.error) ? "لا يمكن إلغاء قيد عليه تحصيل أو سداد؛ ألغِ التحصيل أو السداد أولاً" : out.error };
  }
  function reviseEntry(store, id, fields, ctx) {
    ctx = ctx || {};
    const orig = store.entries.find(e => e.id === id);
    if (!orig || orig.kind === "reversal") return { ok: false, error: "القيد غير موجود" };
    const rev = reverseEntry(store, id, Object.assign({}, ctx, { reason: ctx.reason || "تعديل", id: ctx.id ? ctx.id + "-x" : undefined }));
    if (!rev.ok) return rev;
    const merged = Object.assign({}, orig, fields, { bookId: orig.bookId, revisionOf: id, token: fields.token });
    const added = addEntry(rev.store, merged, Object.assign({}, ctx, { allowDuplicate: true, id: ctx.id }));
    if (!added.ok) return added;
    added.store.audit.push({ id: ctx.id ? ctx.id + "-rv" : newId(), t: ctx.now || Date.now(), action: "entry_revise", bookId: orig.bookId, entryId: id, detail: { newEntry: added.entry.id } });
    return finish(added.store, { entry: added.entry });
  }

  /* ---------------- export / import ---------------- */
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
    return JSON.stringify(v);
  }
  function checksum(v) {                  // cyrb53 — detects accidental corruption (not a security feature)
    const str = stable(v);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16) + "-" + str.length;
  }
  function makeEnvelope(store, bookIds, now) {
    const ids = new Set(bookIds && bookIds.length ? bookIds : store.books.map(b => b.id));
    const data = {
      books: store.books.filter(b => ids.has(b.id)),
      entries: store.entries.filter(e => ids.has(e.bookId)),
      audit: store.audit.filter(a => !a.bookId || ids.has(a.bookId))
    };
    return { format: "rimbook-ledgers", version: VERSION, exportedAt: now || Date.now(), data: clone(data), checksum: checksum(data) };
  }
  function verifyEnvelope(env) {
    if (!env || env.format !== "rimbook-ledgers") return { ok: false, error: "هذا ليس ملف دفاتر ريمبوك" };
    if (env.version !== VERSION) return { ok: false, error: "إصدار الملف غير مدعوم" };
    if (!env.data || checksum(env.data) !== env.checksum) return { ok: false, error: "الملف تالف أو عُدّل يدوياً (فشل فحص السلامة)" };
    const v = validateStore({ version: VERSION, books: env.data.books, entries: env.data.entries, audit: env.data.audit });
    return v.ok ? { ok: true, data: env.data } : { ok: false, error: "محتوى الملف غير صالح: " + v.errors[0] };
  }
  function importEnvelope(store, env, mode, ctx) {
    ctx = ctx || {};
    const ver = verifyEnvelope(env);
    if (!ver.ok) return ver;
    const data = clone(ver.data);
    let s;
    if (mode === "replace") {
      s = { version: VERSION, books: data.books, entries: data.entries, audit: data.audit };
    } else {
      s = clone(store);
      const usedBook = new Set(s.books.map(b => b.id)), usedEntry = new Set(s.entries.map(e => e.id)), usedAudit = new Set(s.audit.map(a => a.id));
      const names = new Set(s.books.map(b => b.name.trim().toLowerCase()));
      const bookMap = {}, entryMap = {};
      const fresh = (used, id) => { let n = id; while (used.has(n)) n = newId(); used.add(n); return n; };
      data.books.forEach(b => {
        const nid = fresh(usedBook, b.id); bookMap[b.id] = nid;
        let name = b.name; if (names.has(name.trim().toLowerCase())) name = (name + " (مستورد)").slice(0, 40);
        names.add(name.trim().toLowerCase());
        s.books.push(Object.assign({}, b, { id: nid, name }));
      });
      data.entries.forEach(e => { entryMap[e.id] = fresh(usedEntry, e.id); });
      data.entries.forEach(e => {
        const c = Object.assign({}, e, { id: entryMap[e.id], bookId: bookMap[e.bookId] });
        if (c.reverses) c.reverses = entryMap[c.reverses];
        if (c.revisionOf) c.revisionOf = entryMap[c.revisionOf] || c.revisionOf;
        s.entries.push(c);
      });
      data.audit.forEach(a => s.audit.push(Object.assign({}, a, { id: fresh(usedAudit, a.id), bookId: a.bookId ? bookMap[a.bookId] : null, entryId: a.entryId ? (entryMap[a.entryId] || null) : null })));
    }
    audit(s, ctx, mode === "replace" ? "restore" : "import", null, null, { books: data.books.length, entries: data.entries.length });
    return finish(s);
  }
  function toCsv(store, bookId) {
    const cell = v => {
      let t = String(v == null ? "" : v);
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;               // neutralise spreadsheet formula injection
      return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const entries = store.entries.filter(e => e.bookId === bookId).slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    const reversed = new Set(entries.filter(e => e.kind === "reversal").map(e => e.reverses));
    const rows = [["date", "type", "amount", "category", "party", "note", "status"]];
    entries.forEach(e => rows.push([e.date, KINDS[e.kind], plainMinor(e.amount), e.category, e.party, e.note, e.kind === "reversal" ? "reversal" : reversed.has(e.id) ? "reversed" : "active"]));
    return "\ufeff" + rows.map(r => r.map(cell).join(",")).join("\r\n");
  }

  const api = {
    KINDS, MAX_MINOR, VERSION,
    parseDecimal, formatDecimal, evaluate, parseMinor, roundToMinor, formatMinor, plainMinor,
    emptyStore, effectiveEntries, partyBalances, summarize, validateStore, checkSettle,
    createBook, archiveBook, addEntry, reverseEntry, reviseEntry,
    checksum, makeEnvelope, verifyEnvelope, importEnvelope, toCsv, isDate
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RimbookLedgerCore = api;
})(typeof window !== "undefined" ? window : globalThis);
