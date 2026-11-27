/* Rimbook daily diary core ("مفكرتي اليومية", merged) — pure logic, no DOM.
   Money is stored as INTEGER minor units; overtime is stored as INTEGER half-hours; entries are plain personal records and never
   touch payroll, ledgers or the main app data. Voice/text is parsed into a PREVIEW only: nothing is saved without confirmation. */
(function (root) {
  "use strict";
  const Ledger = (typeof module !== "undefined" && module.exports && typeof require === "function") ? require("./ledger-core.js") : root.RimbookLedgerCore;
  const VERSION = 1;
  const TYPES = { work: "يوم عمل", off: "عطلة", pay: "دفعة", bonus: "مكافأة", deduct: "خصم", adv: "سلفة", dli: "دين لك", dme: "دين عليك", ot: "ساعات إضافية", note: "ملاحظة" };
  const MONEY = ["pay", "bonus", "deduct", "adv", "dli", "dme"];
  const SAFE_ID = /^[A-Za-z0-9_:.-]{1,80}$/;
  const isDate = Ledger.isDate;
  const clone = v => JSON.parse(JSON.stringify(v));
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const text = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  const DEFAULT_PROFILE = () => ({ name: "", job: "", work: "", phone: "", email: "", city: "", cur: "", dw: 0, otr: 0, we: [5, 6], pic: "" });
  const emptyStore = () => ({ version: VERSION, entries: [], profile: DEFAULT_PROFILE(), manager: { name: "", wa: "", em: "" }, audit: [] });
  const audit = (s, ctx, action, detail) => s.audit.push({ id: ctx.id ? ctx.id + "-a" + s.audit.length : newId(), t: ctx.now || Date.now(), action, detail: detail || {} });

  /* ---------------- validation ---------------- */
  function validateStore(store) {
    const errors = [], bad = m => { errors.push(m); return false; };
    if (!store || typeof store !== "object" || store.version !== VERSION || !Array.isArray(store.entries) || !Array.isArray(store.audit)) return { ok: false, errors: ["بنية غير صالحة"] };
    const ids = new Set();
    store.entries.forEach(e => {
      if (!e || typeof e.id !== "string" || !SAFE_ID.test(e.id) || ids.has(e.id)) return bad("معرّف قيد غير صالح أو مكرر");
      ids.add(e.id);
      if (!TYPES[e.type]) bad("نوع غير معروف");
      if (!isDate(e.date)) bad("تاريخ غير صالح");
      if (e.type === "ot") { if (!Number.isInteger(e.amount) || e.amount < 1 || e.amount > 48) bad("ساعات إضافية غير صالحة"); }
      else if (MONEY.includes(e.type)) { if (!Number.isInteger(e.amount) || e.amount < 1 || e.amount > Ledger.MAX_MINOR) bad("مبلغ غير صالح"); }
      else if (e.amount !== 0 && e.amount != null) bad("هذا النوع بلا مبلغ");
      ["who", "place", "note"].forEach(f => { if (e[f] != null && typeof e[f] !== "string") bad("حقل نصي غير صالح"); });
    });
    const p = store.profile;
    if (!p || typeof p !== "object" || !Number.isInteger(p.dw) || p.dw < 0 || !Number.isInteger(p.otr) || p.otr < 0 || !Array.isArray(p.we) || p.we.some(d => !(d >= 0 && d <= 6)) || (p.pic && String(p.pic).length > 80000)) bad("بيانات الحساب غير صالحة");
    if (!store.manager || typeof store.manager !== "object") bad("بيانات المدير غير صالحة");
    const a = new Set(); store.audit.forEach(x => { if (!x || typeof x.id !== "string" || !SAFE_ID.test(x.id) || a.has(x.id)) bad("سجل تعديلات تالف"); else a.add(x.id); });
    return { ok: errors.length === 0, errors };
  }
  const finish = (s, extra) => { const v = validateStore(s); return v.ok ? Object.assign({ ok: true, store: s }, extra || {}) : { ok: false, error: v.errors[0] }; };

  /* ---------------- entries ---------------- */
  function normalizeItem(it, date) {
    if (!it || !TYPES[it.type]) return { error: "نوع غير معروف" };
    const e = { type: it.type, date, amount: 0, who: text(it.who, 60), place: text(it.place, 60), note: text(it.note, 300) };
    if (!isDate(date)) return { error: "التاريخ غير صحيح" };
    if (it.type === "ot") { const h = Number(it.amount); if (!Number.isInteger(h) || h < 1 || h > 48) return { error: "الساعات الإضافية بين نصف ساعة و24 ساعة" }; e.amount = h; }
    else if (MONEY.includes(it.type)) { if (!Number.isInteger(it.amount) || it.amount < 1 || it.amount > Ledger.MAX_MINOR) return { error: "أدخل مبلغاً صحيحاً أكبر من صفر" }; e.amount = it.amount; }
    else if (it.type === "note" && !e.note) return { error: "اكتب نص الملاحظة" };
    if (!e.note && it.type !== "note") delete e.note;
    return { entry: e };
  }
  /* Adds entries atomically (all or none). A work/off item replaces the day's previous work/off status. */
  function addEntries(store, items, date, ctx) {
    ctx = ctx || {};
    if (!Array.isArray(items) || !items.length) return { ok: false, error: "لا يوجد ما يُحفظ" };
    const s = clone(store), added = [];
    for (const it of items) {
      const r = normalizeItem(it, date); if (r.error) return { ok: false, error: r.error };
      if (r.entry.type === "work" || r.entry.type === "off") s.entries = s.entries.filter(e => !(e.date === date && (e.type === "work" || e.type === "off")));
      r.entry.id = (ctx.id ? ctx.id + "-" + added.length : newId()); r.entry.createdAt = ctx.now || Date.now();
      s.entries.push(r.entry); added.push(r.entry);
    }
    audit(s, ctx, "add", { count: added.length, date });
    return finish(s, { entries: added });
  }
  function setDay(store, date, type, ctx) { return addEntries(store, [{ type }], date, ctx); }
  function addOt(store, date, deltaHalves, ctx) {
    const s = clone(store), cur = s.entries.find(e => e.date === date && e.type === "ot");
    if (cur) { cur.amount += deltaHalves; if (cur.amount < 1) s.entries = s.entries.filter(e => e !== cur); }
    else if (deltaHalves > 0) s.entries.push({ id: (ctx && ctx.id) || newId(), type: "ot", date, amount: deltaHalves, createdAt: (ctx && ctx.now) || Date.now() });
    if (s.entries.some(e => e.type === "ot" && e.amount > 48)) return { ok: false, error: "الحد الأقصى 24 ساعة إضافية في اليوم" };
    return finish(s);
  }
  function clearDay(store, date, ctx) {
    const s = clone(store); s.entries = s.entries.filter(e => !(e.date === date && ["work", "off", "ot"].includes(e.type)));
    audit(s, ctx || {}, "clear_day", { date }); return finish(s);
  }
  function deleteEntry(store, id, ctx) {
    const s = clone(store), e = s.entries.find(x => x.id === id);
    if (!e) return { ok: false, error: "القيد غير موجود" };
    s.entries = s.entries.filter(x => x.id !== id); audit(s, ctx || {}, "delete", { type: e.type, date: e.date, amount: e.amount });
    return finish(s);
  }
  function clearAll(store, ctx) { const s = clone(store); const n = s.entries.length; s.entries = []; audit(s, ctx || {}, "clear_all", { count: n }); return finish(s); }
  function updateProfile(store, fields) {
    const s = clone(store), p = s.profile;
    ["name", "job", "work", "phone", "email", "city", "cur"].forEach(k => { if (fields[k] !== undefined) p[k] = text(fields[k], k === "cur" ? 6 : 60); });
    ["dw", "otr"].forEach(k => { if (fields[k] !== undefined) { if (!Number.isInteger(fields[k]) || fields[k] < 0 || fields[k] > Ledger.MAX_MINOR) return; p[k] = fields[k]; } });
    if (Array.isArray(fields.we)) p.we = fields.we.filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
    if (fields.pic !== undefined) p.pic = String(fields.pic).length <= 80000 ? String(fields.pic) : p.pic;
    if (fields.manager) ["name", "wa", "em"].forEach(k => { if (fields.manager[k] !== undefined) s.manager[k] = text(fields.manager[k], 80); });
    return finish(s);
  }

  /* ---------------- summaries (exact integers) ---------------- */
  function summarize(store, from, to) {
    const L = store.entries.filter(e => e.date >= from && e.date <= to);
    const sum = t => L.filter(e => e.type === t).reduce((a, e) => a + e.amount, 0);
    const days = L.filter(e => e.type === "work").length, otHalves = sum("ot"), p = store.profile;
    const due = days * p.dw + Math.round(otHalves * p.otr / 2);
    const got = sum("pay"), adv = sum("adv"), bonus = sum("bonus"), ded = sum("deduct");
    return { days, offs: L.filter(e => e.type === "off").length, otHalves, due, got, adv, bonus, ded, dli: sum("dli"), dme: sum("dme"), payCount: L.filter(e => e.type === "pay").length,
      balance: due - got - adv + bonus - ded, count: L.length, entries: L };
  }
  const fmt = (minor, cur) => Ledger.formatMinor(minor) + (cur ? " " + cur : "");
  const halves = h => (h / 2).toString();

  function reportText(store, from, to, label) {
    const s = summarize(store, from, to), p = store.profile, c = p.cur;
    return ["📊 تقرير " + (label || ""), "👤 العامل: " + (p.name || "—"), "📅 " + from + " ← " + to, "",
      "✅ أيام العمل: " + s.days, "🛏️ العطل: " + s.offs, "⏱️ ساعات إضافية: " + halves(s.otHalves),
      "💵 الدفعات: " + fmt(s.got, c) + " (" + s.payCount + ")", "🎁 المكافآت: " + fmt(s.bonus, c), "⚠️ الخصومات: " + fmt(s.ded, c), "💸 السلف: " + fmt(s.adv, c), "",
      "💰 المستحق: " + fmt(s.due, c), "🏦 الباقي للعامل: " + fmt(s.balance, c), "", "— من ريمبوك"].join("\n");
  }
  function toCsv(store) {
    const cell = v => { let t = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const rows = [["date", "type", "amount", "who", "place", "note"]];
    store.entries.slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).forEach(e =>
      rows.push([e.date, TYPES[e.type], e.type === "ot" ? halves(e.amount) + "h" : e.amount ? Ledger.plainMinor(e.amount) : "", e.who, e.place, e.note]));
    return "\ufeff" + rows.map(r => r.map(cell).join(",")).join("\r\n");
  }

  /* ---------------- Arabic parser (voice or text -> PREVIEW items) ---------------- */
  const norm = s => String(s).replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
  const NUMS = {};
  ("واحد:1 احد:1 اثنين:2 اثنان:2 اثنتين:2 اثنا:2 ساعتين:2 ثلاث:3 ثلاثه:3 اربع:4 اربعه:4 خمس:5 خمسه:5 ست:6 سته:6 سبع:7 سبعه:7 ثمان:8 ثماني:8 ثمانيه:8 تسع:9 تسعه:9 عشر:10 عشره:10 " +
    "احدعشر:11 اثناعشر:12 عشرين:20 عشرون:20 ثلاثين:30 ثلاثون:30 اربعين:40 اربعون:40 خمسين:50 خمسون:50 ستين:60 ستون:60 سبعين:70 سبعون:70 ثمانين:80 ثمانون:80 تسعين:90 تسعون:90 " +
    "ميه:100 مائه:100 مئه:100 ميتين:200 مئتين:200 مائتين:200 مئتان:200 ثلاثميه:300 ثلاثمئه:300 ثلاثمائه:300 اربعميه:400 اربعمئه:400 اربعمائه:400 خمسميه:500 خمسمئه:500 خمسمائه:500 " +
    "ستميه:600 ستمئه:600 ستمائه:600 سبعميه:700 سبعمئه:700 سبعمائه:700 ثمانميه:800 ثمانمئه:800 ثمانمائه:800 تسعميه:900 تسعمئه:900 تسعمائه:900 الف:1000 الاف:1000 آلاف:1000 الفين:2000 مليون:1000000 مليونين:2000000")
    .split(" ").forEach(p => { const [k, v] = p.split(":"); NUMS[norm(k)] = Number(v); });
  const KW = {};
  [["work", "عمل عملت دوام اشتغلت شغلت داومت شغل"], ["off", "عطله اجازه راحه استراحه عطل"], ["pay", "دفعه قبضت استلمت قبض وصلني دفعوا"],
    ["adv", "سلفه استلفت سلف"], ["bonus", "مكافاه مكافأة اكراميه بونص"], ["deduct", "خصم خصمه غرامه عقوبه"], ["ot", "اضافي اضافيه اضافيتين اضافيات"],
    ["lend", "اعطيت اقرضت سلفت"], ["borrow", "اقترضت استدنت"], ["debt", "دين مديون"], ["place", "ورشه مشروع موقع مصنع محل مزرعه"]
  ].forEach(([k, list]) => list.split(" ").forEach(w => { KW[norm(w)] = k; }));
  const FILLER = new Set(["دفعه", "مبلغ", "بقيمه", "قيمه", "ب", "الف", "ال", "بمبلغ"].map(norm).filter(w => !NUMS[w]));
  const STOP = new Set(["علي", "على", "عند", "لي", "له", "لك", "ل", "من", "الي", "الى", "ان", "في", "مع"].map(norm));
  const isNumTok = w => /^\d+([.]\d+)?$/.test(w) || NUMS[w] !== undefined;

  /* number starting at tokens[i]; returns { minor, end } (end = index after the number) or null; minor = null if digits are malformed */
  function numberAt(tk, i) {
    let cur = 0, tot = 0, used = false, bad = false, j = i;
    for (; j < tk.length; j++) {
      const w = tk[j];
      if (/^\d+([.]\d+)?$/.test(w)) { const m = Ledger.parseMinor(w); if (m === null) bad = true; else cur = m; used = true; continue; }
      const v = NUMS[w];
      if (v === undefined) break;
      if (v >= 1000) { tot += (cur || 100) * v; cur = 0; }
      else if ((v === 100) && cur >= 100 && cur <= 900) cur *= 100;           // "ثلاث مية" -> 300
      else cur += v * 100;
      used = true;
    }
    return used ? { minor: bad ? null : tot + cur, end: j } : null;
  }
  function tokenize(raw) {
    const ascii = String(raw).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/٫/g, ".").replace(/(\d)[,٬،](\d{3})(?!\d)/g, "$1$2");
    const original = ascii.split(/[\s،؛!?؟,]+/).map(w => w.replace(/\.+$/, "")).filter(Boolean);
    const tk = original.map(w => {
      let n = norm(w);
      if (n.length > 2 && n[0] === "و" && (NUMS[n.slice(1)] !== undefined || KW[n.slice(1)])) n = n.slice(1);
      return n;
    });
    return { original, tk };
  }
  function parseText(raw) {
    const { original, tk } = tokenize(raw);
    const out = [], used = new Set();
    let place = "";
    const findNumber = (from, maxSkip, kind) => {                                  // skip filler/name words, stop at the next keyword
      for (let j = from; j < Math.min(tk.length, from + maxSkip + 1); j++) {
        if (isNumTok(tk[j])) return numberAt(tk, j);
        if (KW[tk[j]] === kind) { used.add(j); continue; }                          // "قبضت دفعة 500": the second payment word is the same payment
        if (KW[tk[j]]) break;
      }
      return null;
    };
    const findWho = from => {
      for (let j = from; j < Math.min(tk.length, from + 4); j++) {
        if (STOP.has(tk[j]) || FILLER.has(tk[j])) continue;
        if (isNumTok(tk[j]) || KW[tk[j]]) break;
        let name = original[j]; if (/^ل./.test(name) && name.length > 3) name = name.slice(1);
        used.add(j); return name;
      }
      return "";
    };
    const money = (type, i, who) => {
      const n = findNumber(i + 1, who ? 5 : 3, KW[tk[i]]);
      if (n) { for (let j = i + 1; j < n.end; j++) used.add(j); }
      const item = { type, amount: n && n.minor !== null ? n.minor : 0 };
      if (!n || n.minor === null || n.minor < 1) item.missing = true;
      if (who) item.who = who;
      out.push(item);
    };
    for (let i = 0; i < tk.length; i++) {
      if (used.has(i)) continue;
      const k = KW[tk[i]];
      if (!k) continue;
      if (k === "work" || k === "off") { out.push({ type: k }); continue; }
      if (k === "place") { const parts = []; for (let j = i + 1; j < tk.length && parts.length < 3; j++) { if (KW[tk[j]] || isNumTok(tk[j])) break; parts.push(original[j]); used.add(j); } if (parts.length) place = parts.join(" "); continue; }
      if (k === "ot") {                                                       // number just before ("ساعتين إضافيتين", "3 ساعات اضافية") or after
        let n = null;
        for (let j = Math.max(0, i - 3); j < i; j++) if (isNumTok(tk[j])) { n = numberAt(tk, j); break; }
        if (!n) n = findNumber(i + 1, 1);
        const hours = n && n.minor !== null ? n.minor / 100 : 0, h2 = Math.round(hours * 2);
        out.push(h2 >= 1 && h2 <= 48 ? { type: "ot", amount: h2 } : { type: "ot", amount: 0, missing: true });
        continue;
      }
      if (k === "lend") { money("dli", i, findWho(i + 1)); continue; }
      if (k === "borrow") { money("dme", i, findWho(i + 1)); continue; }
      if (k === "debt") {
        const near = tk.slice(i + 1, i + 3);
        const type = near.some(w => w === "علي" || w === "على") ? "dme" : "dli";
        money(type, i, findWho(i + 1)); continue;
      }
      money(k, i, "");                                                         // pay / adv / bonus / deduct
    }
    if (place) out.forEach(x => { if (x.type === "work") x.place = place; });
    if (!out.length) out.push({ type: "note", note: String(raw).trim().slice(0, 300) });
    return out;
  }
  const itemLabel = (it, cur) => ({ work: "يوم عمل" + (it.place ? " — " + it.place : ""), off: "عطلة", pay: "دفعة", bonus: "مكافأة", deduct: "خصم", adv: "سلفة", dli: "دين لك", dme: "دين عليك",
    ot: "ساعات إضافية", note: it.note || "ملاحظة" })[it.type] + (MONEY.includes(it.type) ? (it.who ? " " + it.who : "") + " " + (it.amount ? fmt(it.amount, cur) : "(بلا مبلغ)") : it.type === "ot" ? " " + halves(it.amount || 0) + " س" : "");

  /* ---------------- importing the old standalone diary ("mufakkirati") backup ---------------- */
  function importOld(store, json, ctx) {
    ctx = ctx || {};
    if (!json || json.app !== "mufakkirati" || !Array.isArray(json.entries)) return { ok: false, error: "هذا ليس ملف نسخة «مفكرتي اليومية»" };
    const s = clone(store), have = new Set(s.entries.map(e => e.src).filter(Boolean));
    let imported = 0, skipped = 0, invalid = 0;
    const MAP = { work: "work", off: "off", pay: "pay", bonus: "bonus", deduct: "deduct", adv: "adv", dli: "dli", dme: "dme", ot: "ot", note: "note" };
    json.entries.forEach(o => {
      const type = o && MAP[o.type];
      if (!type || !isDate(o.date)) { invalid++; return; }
      const src = "m:" + String(o.id).slice(0, 40);
      if (have.has(src)) { skipped++; return; }
      const e = { id: "i" + newId() + imported, type, date: o.date, amount: 0, who: text(o.who, 60), place: text(o.place, 60), note: text(o.note, 300), src, createdAt: Number(o.ts) || Date.now() };
      const raw = Number(o.amount);
      if (type === "ot") { const h = Math.round(raw * 2); if (!(h >= 1 && h <= 48)) { invalid++; return; } e.amount = h; }
      else if (MONEY.includes(type)) { const m = Math.round(raw * 100); if (!Number.isInteger(m) || m < 1 || m > Ledger.MAX_MINOR) { invalid++; return; } e.amount = m; }
      else if (type === "note" && !e.note) { invalid++; return; }
      if (!e.who) delete e.who; if (!e.place) delete e.place; if (!e.note) delete e.note;
      s.entries.push(e); have.add(src); imported++;
    });
    const pr = json.profile || {};
    ["name", "job", "work", "phone", "email", "city", "cur"].forEach(k => { if (!s.profile[k] && pr[k]) s.profile[k] = text(pr[k], k === "cur" ? 6 : 60); });
    ["dw", "otr"].forEach(k => { const m = Math.round(Number(pr[k]) * 100); if (!s.profile[k] && Number.isInteger(m) && m > 0 && m <= Ledger.MAX_MINOR) s.profile[k] = m; });
    if (!s.profile.pic && typeof pr.pic === "string" && pr.pic.length <= 80000 && /^data:image\//.test(pr.pic)) s.profile.pic = pr.pic;
    audit(s, ctx, "import_old", { imported, skipped, invalid });
    const r = finish(s, { imported, skipped, invalid });
    return r;
  }

  /* ---------------- offline readiness (pure: the UI gathers the facts) ---------------- */
  function evaluateReadiness(f) {
    const checks = [];
    const cached = f.filesTotal > 0 && (f.filesMissing || []).length === 0;
    checks.push({ id: "files", ok: cached, text: f.filesTotal === 0 ? "لم يُتحقق من تخزين الملفات (افتح التطبيق مرة بإنترنت ثم أعد الفحص)" : cached ? "✅ كل ملفات التطبيق مخزنة وتعمل دون إنترنت (" + f.filesTotal + ")" : "❌ ملفات غير مخزنة: " + f.filesMissing.slice(0, 4).join("، ") });
    checks.push({ id: "sw", ok: !!f.serviceWorker || !!f.native, text: f.native ? "✅ تطبيق أندرويد: الملفات داخل التطبيق نفسه" : f.serviceWorker ? "✅ المخزّن الذكي (Service Worker) يعمل" : "⚠️ المخزّن الذكي غير مفعّل بعد؛ أعد فتح الصفحة مرة بإنترنت" });
    let voiceOk = false;
    if (f.native) {
      if (f.speechInstalled === true) { voiceOk = true; checks.push({ id: "voice", ok: true, text: "✅ الصوت دون إنترنت جاهز: حزمة العربية مثبتة" }); }
      else if (f.speechInstalled === false) checks.push({ id: "voice", ok: false, text: "❌ حزمة العربية غير مثبتة: نزّلها مرة واحدة بإنترنت من صفحة «الصوت» ليعمل الصوت دون إنترنت" });
      else checks.push({ id: "voice", ok: false, text: "⚠️ تعذر معرفة حالة حزمة العربية؛ افتح صفحة «الصوت» وتحقق منها" });
    } else {
      checks.push({ id: "voice", ok: false, text: "ℹ️ في المتصفح الصوت يحتاج إنترنت دائماً (قيد من المتصفح). للصوت دون إنترنت استخدم تطبيق أندرويد بعد تنزيل حزمة العربية." + (f.webSpeech ? "" : " (متصفحك لا يدعم الإملاء أصلاً)") });
    }
    if (f.native && f.mic === false) checks.push({ id: "mic", ok: false, text: "❌ إذن الميكروفون غير ممنوح" });
    const level = cached && (f.native || f.serviceWorker) ? (voiceOk ? "ready" : "partial") : "not";
    return { level, checks, summary: level === "ready" ? "جاهز: الكتابة والصوت يعملان دون إنترنت" : level === "partial" ? "الكتابة والتسجيل يعملان دون إنترنت؛ الصوت دون إنترنت غير جاهز بعد" : "غير جاهز دون إنترنت بعد" };
  }

  /* ---------------- backup (same envelope pattern as the other add-ons) ---------------- */
  const makeEnvelope = (store, now) => { const data = { entries: clone(store.entries), profile: clone(store.profile), manager: clone(store.manager), audit: clone(store.audit) }; return { format: "rimbook-diary", version: VERSION, exportedAt: now || Date.now(), data, checksum: Ledger.checksum(data) }; };
  function verifyEnvelope(env) {
    if (!env || env.format !== "rimbook-diary") return { ok: false, error: "هذا ليس ملف مفكرة ريمبوك اليومية" };
    if (env.version !== VERSION) return { ok: false, error: "إصدار الملف غير مدعوم" };
    if (!env.data || Ledger.checksum(env.data) !== env.checksum) return { ok: false, error: "الملف تالف أو عُدّل يدوياً (فشل فحص السلامة)" };
    const v = validateStore(Object.assign({ version: VERSION }, env.data));
    return v.ok ? { ok: true, data: env.data } : { ok: false, error: "محتوى الملف غير صالح: " + v.errors[0] };
  }
  function importEnvelope(store, env, mode, ctx) {
    const ver = verifyEnvelope(env); if (!ver.ok) return ver;
    const data = clone(ver.data); let s;
    if (mode === "replace") s = Object.assign({ version: VERSION }, data);
    else { s = clone(store); const ids = new Set(s.entries.map(e => e.id)); data.entries.forEach(e => { if (ids.has(e.id)) e.id = newId(); ids.add(e.id); s.entries.push(e); }); }
    audit(s, ctx || {}, mode === "replace" ? "restore" : "import", { entries: data.entries.length });
    return finish(s);
  }

  const api = { TYPES, MONEY, emptyStore, validateStore, addEntries, setDay, addOt, clearDay, deleteEntry, clearAll, updateProfile, summarize, reportText, toCsv, parseText, itemLabel,
    importOld, evaluateReadiness, makeEnvelope, verifyEnvelope, importEnvelope, fmt, halves };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RimbookDiaryCore = api;
})(typeof window !== "undefined" ? window : globalThis);
