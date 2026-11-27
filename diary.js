/* Rimbook daily diary ("مفكرتي اليومية", merged into Rimbook) — own storage key `rimbook_diary_v1`.
   Voice goes through Rimbook's speech bridge: the installed Arabic model works WITHOUT internet in the Android app;
   a plain browser can never do offline voice (its recognizer is online), and the readiness page says so honestly.
   Voice/text only produces a PREVIEW; nothing is saved until the user confirms. */
(function () {
  "use strict";
  const D = window.RimbookDiaryCore, L = window.RimbookLedgerCore;
  if (!D || !L) return;
  const KEY = "rimbook_diary_v1", PREV = "rimbook_diary_prev";
  const $ = id => document.getElementById(id);
  const val = id => ($(id)?.value || "").trim();
  const safe = v => esc(String(v ?? ""));
  const todayStr = () => iso(new Date());
  const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const ICONS = { work: "✅", off: "🛏️", pay: "💵", bonus: "🎁", deduct: "⚠️", adv: "💸", dli: "📈", dme: "📉", ot: "⏱️", note: "📝" };
  const ui = { page: "today", date: todayStr(), mode: "w", off: 0, cal: todayStr().slice(0, 7), undo: null, preview: null };
  const isNative = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());
  let store = load();

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); if (!raw) return D.emptyStore(); const parsed = JSON.parse(raw); if (D.validateStore(parsed).ok) return parsed; } catch (_) {}
    try { if (raw) localStorage.setItem(KEY + "_corrupt_" + Date.now(), raw); } catch (_) {}
    setTimeout(() => toast("بيانات المفكرة اليومية تالفة؛ حُفظت نسخة منها."), 800);
    return D.emptyStore();
  }
  function commit(next) {
    try { const json = JSON.stringify(next); localStorage.setItem(KEY, json); if (localStorage.getItem(KEY) !== json) throw new Error("readback"); store = next; return true; }
    catch (_) { toast("تعذر الحفظ؛ لم يُسجَّل التغيير. تحقق من مساحة التخزين."); return false; }
  }
  const money = v => D.fmt(v, store.profile.cur);
  const dl = d => { try { return new Date(d + "T00:00:00").toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long" }); } catch (_) { return d; } };
  /* every change keeps the previous state in memory so "تراجع" works */
  const apply = (r, msg) => { if (!r.ok) { toast(r.error); return false; } const prev = store; if (!commit(r.store)) return false; ui.undo = prev; if (msg) toast(msg); render(); return true; };
  window.diaryUndo = function () { if (ui.undo && commit(ui.undo)) { ui.undo = null; toast("تم التراجع"); render(); } };
  window.diaryGo = p => { ui.page = p; render(); };

  /* ---------------- modals ---------------- */
  const closeModal = () => document.getElementById("rimbook-diary-modal")?.remove();
  function openModal(html) {
    closeModal();
    const m = document.createElement("div"); m.id = "rimbook-diary-modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
    m.style.cssText = "position:fixed;inset:0;z-index:10060;background:#000a;display:flex;align-items:center;justify-content:center;padding:12px";
    m.innerHTML = '<div class="card" style="width:min(100%,520px);max-height:92vh;overflow:auto;margin:0;background:var(--card)">' + html + '</div>';
    document.body.append(m); m.addEventListener("click", e => { if (e.target === m) closeModal(); });
    return m;
  }
  const head = t => '<div class="row" style="justify-content:space-between"><b>' + t + '</b><button type="button" onclick="document.getElementById(\'rimbook-diary-modal\')?.remove()">✕</button></div>';

  /* ---------------- quick entries ---------------- */
  const ASK = { pay: "💵 الدفعة", bonus: "🎁 المكافأة", deduct: "⚠️ الخصم", adv: "💸 السلفة", dli: "📈 دين لك", dme: "📉 دين عليك" };
  window.diaryQuick = function (type) {
    if (type === "work" || type === "off") return apply(D.setDay(store, ui.date, type), type === "work" ? "سُجّل يوم عمل ✅" : "سُجّلت عطلة 🛏️");
    openModal(head(ASK[type] || "المبلغ") + '<label class="muted" for="dq-amt">المبلغ</label><input id="dq-amt" inputmode="decimal" dir="ltr" placeholder="0.00" style="width:100%;font-size:26px;margin:6px 0">' +
      (type === "dli" || type === "dme" ? '<input id="dq-who" maxlength="60" placeholder="الاسم" style="width:100%;margin:4px 0">' : "") +
      '<div class="row"><button class="p" type="button" onclick="diaryQuickSave(\'' + type + '\')">حفظ</button></div>');
  };
  window.diaryQuickSave = function (type) {
    const amount = L.parseMinor(val("dq-amt"));
    if (amount === null || amount < 1) return toast("أدخل مبلغاً صحيحاً أكبر من صفر (خانتان عشريتان كحد أقصى)");
    if (apply(D.addEntries(store, [{ type, amount, who: val("dq-who") }], ui.date), "تم الحفظ")) closeModal();
  };
  window.diaryParseNote = function () {                                     // typed text goes through the same preview as voice
    const t = val("dn-text"); if (!t) return;
    showPreview(t);
  };
  window.diarySetDate = v => { if (L.isDate(v)) { ui.date = v; } };

  /* ---------------- voice -> preview -> confirm ---------------- */
  async function listen(onText) {
    const D2 = window.RimbookDictation;
    if (!D2 || typeof D2.capture !== "function") throw new Error("الإملاء الصوتي غير متاح");
    openModal(head("🎤 أتحدث…") + '<p id="dv-partial" class="muted" style="min-height:48px">تحدّث الآن بوضوح…</p><div class="row"><button class="p" type="button" onclick="diaryStopListen()">⏹ إنهاء</button></div>');
    try { return await D2.capture(t => { const p = $("dv-partial"); if (p) p.textContent = t; }); }
    finally { closeModal(); }
  }
  window.diaryStopListen = function () { try { window.RimbookDictation.stop(); } catch (_) {} };
  window.diaryVoice = async function () {
    try {
      const text = (await listen()).trim();
      if (!text) return toast("لم يُسمع كلام واضح، حاول مجدداً");
      showPreview(text);
    } catch (e) { toast(String((e && e.message) || e)); }
  };
  function showPreview(text) {
    ui.preview = { text, items: D.parseText(text) };
    renderPreview();
  }
  function renderPreview() {
    const pv = ui.preview; if (!pv) return;
    const rows = pv.items.map((it, i) => '<div class="item"><span>' + (ICONS[it.type] || "📝") + ' <b>' + safe(D.itemLabel(it, store.profile.cur)) + '</b>' +
      (it.missing ? '<br><input id="pv-amt-' + i + '" inputmode="decimal" dir="ltr" placeholder="أدخل ' + (it.type === "ot" ? "الساعات" : "المبلغ") + '" style="width:60%" oninput="diaryPreviewAmount(' + i + ',this.value)">' : "") + '</span>' +
      '<button type="button" onclick="diaryPreviewDrop(' + i + ')">✕</button></div>').join("");
    openModal(head("🎤 هذا ما فهمته") + '<p class="muted">راجع ثم احفظ. لا يُحفظ شيء قبل تأكيدك.</p>' +
      '<textarea id="pv-text" rows="3" style="width:100%" oninput="diaryPreviewText(this.value)">' + safe(pv.text) + '</textarea><div id="pv-items">' + (rows || '<p class="muted">لم أفهم شيئاً. أعد المحاولة.</p>') + '</div>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px"><button class="p" type="button" onclick="diaryPreviewSave()">✓ احفظ الكل</button><button type="button" onclick="diaryVoice()">🎤 أعد التسجيل</button></div>');
  }
  window.diaryPreviewText = v => { const keep = $("pv-text"); ui.preview.text = v; ui.preview.items = D.parseText(v); const box = $("pv-items");
    if (box) { const cur = keep && keep.value; renderPreview(); const t = $("pv-text"); if (t) { t.value = cur; t.focus(); try { t.setSelectionRange(cur.length, cur.length); } catch (_) {} } } };
  window.diaryPreviewDrop = i => { ui.preview.items.splice(i, 1); renderPreview(); };
  window.diaryPreviewAmount = (i, v) => {
    const it = ui.preview.items[i]; if (!it) return;
    if (it.type === "ot") { const d = L.parseDecimal(v), h = d === null ? 0 : Math.round(Number(d) / 1e12 * 2); it.amount = h >= 1 && h <= 48 ? h : 0; }
    else { const m = L.parseMinor(v); it.amount = m !== null && m >= 1 ? m : 0; }
    it.missing = !it.amount;
  };
  window.diaryPreviewSave = function () {
    const pv = ui.preview; if (!pv || !pv.items.length) return toast("لا يوجد ما يُحفظ");
    if (pv.items.some(i => i.missing || (i.type !== "work" && i.type !== "off" && i.type !== "note" && !i.amount))) return toast("أكمل المبالغ الناقصة أو احذف البند");
    if (apply(D.addEntries(store, pv.items.map(i => ({ type: i.type, amount: i.amount || 0, who: i.who, place: i.place, note: i.note })), ui.date), "سُجّل الكل ✅")) { ui.preview = null; closeModal(); }
  };

  /* ---------------- pages ---------------- */
  const nav = () => '<div class="row" style="flex-wrap:wrap;gap:6px">' + [["today", "🏠 اليوم"], ["summary", "📊 الملخص"], ["calendar", "📅 التقويم"], ["log", "📒 السجل"], ["me", "👤 حسابي"], ["backup", "💾 استيراد وتصدير"], ["ready", "📶 دون إنترنت"]]
    .map(([k, l]) => '<button type="button" class="' + (ui.page === k ? "p" : "") + '" onclick="diaryGo(\'' + k + '\')">' + l + '</button>').join("") + '</div>';
  const statCard = (label, v) => '<div class="card"><small class="muted">' + label + '</small><h3>' + v + '</h3></div>';

  function todayPage() {
    const all = D.summarize(store, "0000-01-01", "9999-12-31"), ex = D.summarize(store, "0000-01-01", "9999-12-31");
    const extras = [["🎁 مكافآت", ex.bonus], ["⚠️ خصومات", ex.ded], ["💸 سلف", ex.adv], ["📈 لك", ex.dli], ["📉 عليك", ex.dme]].filter(x => x[1]).map(x => '<span class="muted"> ' + x[0] + ' ' + money(x[1]) + ' ·</span>').join("");
    const big = (t, icon, label) => '<button class="card" type="button" style="min-height:84px;font-size:16px" onclick="diaryQuick(\'' + t + '\')">' + icon + '<br><b>' + label + '</b></button>';
    return '<div class="grid2">' + statCard("أيام العمل", all.days) + statCard("أيام العطل", all.offs) + statCard("الدفعات (" + all.payCount + ")", money(all.got)) + statCard("المتبقي", money(all.balance)) + '</div>' + (extras ? '<div class="card">' + extras + '</div>' : "") +
      '<div class="card"><label class="muted" for="dd-date">📅 التاريخ</label><input id="dd-date" type="date" value="' + safe(ui.date) + '" onchange="diarySetDate(this.value)" style="width:100%;margin:4px 0 10px">' +
      '<button class="p" type="button" style="width:100%;min-height:56px;font-size:19px" onclick="diaryVoice()">🎤 تحدّث (اليوم + دفعات + مكافآت…)</button>' +
      '<div class="grid2" style="margin-top:8px">' + big("work", "✅", "عمل") + big("off", "🛏️", "عطلة") + big("pay", "💵", "دفعة") + big("bonus", "🎁", "مكافأة") + big("deduct", "⚠️", "خصم") + big("adv", "💸", "سلفة") + big("dli", "📈", "دين لك") + big("dme", "📉", "دين عليك") + '</div>' +
      '<label class="muted" for="dn-text" style="display:block;margin-top:10px">✍️ اكتب أو أملِ (مثال: اليوم عملت وقبضت 500)</label><textarea id="dn-text" rows="2" style="width:100%" placeholder="اكتب هنا — اضغط 🎤 الصغير لتُملي"></textarea>' +
      '<button type="button" style="margin-top:6px" onclick="diaryParseNote()">مراجعة وحفظ</button></div>' +
      (ui.undo ? '<div class="card"><button type="button" onclick="diaryUndo()">↩️ تراجع عن آخر تغيير</button></div>' : "");
  }
  function range() {
    const n = new Date();
    if (ui.mode === "m") { const a = new Date(n.getFullYear(), n.getMonth() + ui.off, 1), b = new Date(a.getFullYear(), a.getMonth() + 1, 0); return [iso(a), iso(b), MONTHS[a.getMonth()] + " " + a.getFullYear()]; }
    const a = new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 1) % 7) + ui.off * 7), b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
    return [iso(a), iso(b), "من " + iso(a) + " إلى " + iso(b)];
  }
  window.diaryMode = m => { ui.mode = m; ui.off = 0; render(); };
  window.diaryShift = d => { if (d > 0 && ui.off >= 0) return; ui.off += d; render(); };
  function entryRow(e, del) {
    const amt = e.type === "ot" ? D.halves(e.amount) + " ساعة" : e.amount ? money(e.amount) : "";
    return '<div class="item"><span>' + (ICONS[e.type] || "📝") + ' <b>' + D.TYPES[e.type] + (e.who ? " — " + safe(e.who) : "") + (amt ? " " + amt : "") + '</b><br><small class="muted">' + safe(dl(e.date)) + (e.note && e.type !== "note" ? " · " + safe(e.note) : "") + '</small>' + (e.type === "note" ? '<br>' + safe(e.note) : "") + '</span>' +
      (del ? '<button type="button" onclick="diaryDelete(\'' + e.id + '\')">حذف</button>' : "") + '</div>';
  }
  function summaryPage() {
    const [f, t, lab] = range(), s = D.summarize(store, f, t), p = store.profile;
    const wage = (p.dw || p.otr) ? '<div class="card"><b>الحساب</b>' + [["💰 المستحق", s.due], ["💵 المقبوض", s.got], ["💸 السلف", s.adv], ["🎁 المكافآت", s.bonus], ["⚠️ الخصومات", s.ded]].map(x => '<div class="item"><span>' + x[0] + '</span><b>' + money(x[1]) + '</b></div>').join("") +
      '<div class="item"><span>🏦 الباقي لك</span><b>' + money(s.balance) + '</b></div></div>' : '<div class="card muted">أدخل الأجر اليومي في «حسابي» لحساب المستحقات.</div>';
    return '<div class="card"><div class="row" style="gap:8px"><button type="button" class="' + (ui.mode === "w" ? "p" : "") + '" onclick="diaryMode(\'w\')">أسبوعي</button><button type="button" class="' + (ui.mode === "m" ? "p" : "") + '" onclick="diaryMode(\'m\')">شهري</button></div>' +
      '<div class="row" style="justify-content:space-between;margin-top:8px"><button type="button" onclick="diaryShift(1)">‹</button><b>' + safe(lab) + '</b><button type="button" onclick="diaryShift(-1)">›</button></div></div>' +
      '<div class="grid2">' + statCard("أيام العمل", s.days) + statCard("أيام العطل", s.offs) + statCard("ساعات إضافية", D.halves(s.otHalves)) + statCard("الدفعات (" + s.payCount + ")", money(s.got)) + '</div>' + wage +
      '<div class="card"><div class="row" style="flex-wrap:wrap;gap:8px"><button class="p" type="button" onclick="diaryShareReport()">✉️ إرسال التقرير (واتساب/بريد)</button><button type="button" onclick="diarySay()">🔊 اسمعني الملخص</button></div></div>' +
      '<div class="card"><b>التفاصيل</b>' + (s.entries.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => entryRow(e, false)).join("") || '<p class="muted">لا توجد تسجيلات في هذه الفترة.</p>') + '</div>';
  }
  window.diaryShareReport = function () {
    const [f, t, lab] = range(), text = D.reportText(store, f, t, lab), m = store.manager;
    if (window.RimbookShare) window.RimbookShare.open({ title: "إرسال التقرير", text, subject: "تقرير — ريمبوك", filename: "rimbook-diary-report.txt", phone: m.wa || "", email: m.em || "" });
    else toast("مركز الإرسال غير متاح");
  };
  window.diarySay = function () {
    const [f, t, lab] = range(), s = D.summarize(store, f, t), text = lab + ". أيام العمل " + s.days + "، أيام العطلة " + s.offs + ".";
    if (typeof window.rimbookNativeSpeak === "function") return window.rimbookNativeSpeak(text);
    if (window.speechSynthesis) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "ar-SA"; speechSynthesis.speak(u); } else toast("النطق غير متاح على هذا الجهاز");
  };
  function calendarPage() {
    const [y, m] = ui.cal.split("-").map(Number), first = new Date(y, m - 1, 1), n = new Date(y, m, 0).getDate(), we = store.profile.we, tdy = todayStr();
    const marks = {}; store.entries.filter(e => e.date.startsWith(ui.cal)).forEach(e => { const o = marks[e.date] = marks[e.date] || { t: "", ot: 0 }; if (e.type === "work" || e.type === "off") o.t = e.type; else if (e.type === "ot") o.ot += e.amount; });
    let cells = DAYS.map(d => '<div class="muted" style="text-align:center;font-size:12px">' + d.slice(0, 3) + '</div>').join("");
    for (let i = 0; i < first.getDay(); i++) cells += "<div></div>";
    for (let d = 1; d <= n; d++) {
      const k = ui.cal + "-" + String(d).padStart(2, "0"), x = marks[k] || {}, wd = new Date(y, m - 1, d).getDay();
      cells += '<button type="button" onclick="diaryOpenDay(\'' + k + '\')" style="min-height:48px;border-radius:10px;' + (x.t === "work" ? "background:#1e8449;color:#fff;" : x.t === "off" ? "background:#d32f2f;color:#fff;" : "") + (we.includes(wd) ? "opacity:.6;" : "") + (k === tdy ? "outline:2px solid #b07300;" : "") + '">' + d + (x.ot ? '<br><small>' + D.halves(x.ot) + 'س</small>' : "") + '</button>';
    }
    return '<div class="card"><div class="row" style="justify-content:space-between"><button type="button" onclick="diaryCalShift(1)">‹</button><b>' + MONTHS[m - 1] + ' ' + y + '</b><button type="button" onclick="diaryCalShift(-1)">›</button></div>' +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:8px">' + cells + '</div><p class="muted">اضغط أي يوم لتسجيله عملاً أو عطلة أو إضافة ساعات إضافية.</p></div>';
  }
  window.diaryCalShift = d => { const [y, m] = ui.cal.split("-").map(Number), x = new Date(y, m - 1 + d, 1); ui.cal = x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"); render(); };
  window.diaryOpenDay = function (k) {
    const ot = store.entries.filter(e => e.date === k && e.type === "ot").reduce((a, e) => a + e.amount, 0);
    openModal(head(safe(dl(k))) + '<div class="row" style="gap:8px"><button class="p" type="button" onclick="diaryDay(\'' + k + '\',\'work\')">✅ عمل</button><button type="button" onclick="diaryDay(\'' + k + '\',\'off\')">🛏️ عطلة</button></div>' +
      '<div class="row" style="justify-content:space-between;margin:10px 0"><button type="button" onclick="diaryOt(\'' + k + '\',-1)">−</button><span>⏱️ ساعات إضافية: <b>' + D.halves(ot) + '</b></span><button type="button" onclick="diaryOt(\'' + k + '\',1)">+</button></div>' +
      '<div class="row" style="gap:8px"><button type="button" onclick="diaryClearDay(\'' + k + '\')">مسح اليوم</button></div>');
  };
  window.diaryDay = (k, t) => { if (apply(D.setDay(store, k, t))) closeModal(); };
  window.diaryOt = (k, d) => { if (apply(D.addOt(store, k, d))) window.diaryOpenDay(k); };
  window.diaryClearDay = k => { if (apply(D.clearDay(store, k))) closeModal(); };
  window.diaryDelete = id => { if (confirm("حذف هذا القيد؟ (يمكنك التراجع)")) apply(D.deleteEntry(store, id), "تم الحذف"); };
  window.diaryClearAll = () => { if (confirm("مسح كل سجلات المفكرة اليومية؟ (يمكنك التراجع فوراً)")) apply(D.clearAll(store), "تم المسح"); };
  function logPage() {
    const list = store.entries.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 300);
    return '<div class="card"><b>📒 السجل الكامل (' + store.entries.length + ')</b>' + (list.map(e => entryRow(e, true)).join("") || '<p class="muted">لا توجد سجلات بعد.</p>') + '</div>' +
      (store.entries.length ? '<div class="card"><button type="button" onclick="diaryClearAll()">مسح الكل</button></div>' : "");
  }
  function mePage() {
    const p = store.profile, m = store.manager;
    const field = (id, label, v, extra) => '<label class="muted" for="' + id + '">' + label + '</label><input id="' + id + '" value="' + safe(v) + '" ' + (extra || "") + ' onchange="diarySaveProfile()" style="width:100%;margin:4px 0 8px">';
    return '<div class="card"><b>👤 حسابي</b>' + field("pf-name", "الاسم", p.name, 'maxlength="60"') + field("pf-job", "المهنة", p.job, 'maxlength="60"') + field("pf-work", "جهة العمل", p.work, 'maxlength="60"') +
      field("pf-phone", "الهاتف", p.phone, 'type="tel" dir="ltr"') + field("pf-email", "البريد", p.email, 'type="email" dir="ltr"') + field("pf-city", "المدينة", p.city, 'maxlength="60"') + field("pf-cur", "رمز العملة", p.cur, 'maxlength="6"') +
      field("pf-dw", "الأجر اليومي", p.dw ? L.plainMinor(p.dw) : "", 'inputmode="decimal" dir="ltr"') + field("pf-otr", "أجر الساعة الإضافية", p.otr ? L.plainMinor(p.otr) : "", 'inputmode="decimal" dir="ltr"') +
      '<label class="muted">أيام العطلة الأسبوعية</label><div class="row" style="flex-wrap:wrap;gap:6px">' + DAYS.map((d, i) => '<button type="button" class="' + (p.we.includes(i) ? "p" : "") + '" onclick="diaryToggleWeekend(' + i + ')">' + d + '</button>').join("") + '</div></div>' +
      '<div class="card"><b>👔 مدير العمل (لإرسال التقارير بسرعة)</b>' + field("mg-name", "اسم المدير", m.name, 'maxlength="80"') + field("mg-wa", "رقم واتساب (بصيغة دولية)", m.wa, 'type="tel" dir="ltr"') + field("mg-em", "بريد المدير", m.em, 'type="email" dir="ltr"') +
      '<p class="muted">يُحفظ على جهازك فقط، ولا يُرسل شيء إلا عندما تضغط إرسال.</p></div>';
  }
  window.diarySaveProfile = function () {
    const dw = val("pf-dw") ? L.parseMinor(val("pf-dw")) : 0, otr = val("pf-otr") ? L.parseMinor(val("pf-otr")) : 0;
    if (dw === null || otr === null) return toast("الأجر غير صحيح (خانتان عشريتان كحد أقصى)");
    apply(D.updateProfile(store, { name: val("pf-name"), job: val("pf-job"), work: val("pf-work"), phone: val("pf-phone"), email: val("pf-email"), city: val("pf-city"), cur: val("pf-cur"), dw, otr,
      manager: { name: val("mg-name"), wa: val("mg-wa"), em: val("mg-em") } }), "تم الحفظ");
  };
  window.diaryToggleWeekend = i => { const s = new Set(store.profile.we); s.has(i) ? s.delete(i) : s.add(i); apply(D.updateProfile(store, { we: [...s] })); };

  const download = (name, text, type) => { const url = URL.createObjectURL(new Blob([text], { type: type || "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); };
  window.diaryCsv = () => { download("rimbook-diary-" + todayStr() + ".csv", D.toCsv(store)); toast("تم تجهيز ملف CSV"); };
  window.diaryPickOld = () => $("diary-old-file")?.click();
  window.diaryImportOld = function (input) {
    const file = input.files && input.files[0]; input.value = ""; if (!file) return;
    const reader = new FileReader(); reader.onerror = () => toast("تعذر قراءة الملف");
    reader.onload = () => {
      let json; try { json = JSON.parse(String(reader.result)); } catch (_) { return toast("الملف ليس بصيغة صحيحة"); }
      const r = D.importOld(store, json); if (!r.ok) return toast(r.error);
      if (!confirm("سيُستورد " + r.imported + " قيد" + (r.skipped ? " (تخطّي " + r.skipped + " مكرر)" : "") + (r.invalid ? " (و" + r.invalid + " غير صالح)" : "") + ".\nمتابعة؟")) return;
      if (apply(r, "تم استيراد " + r.imported + " قيد من مفكرتك القديمة")) ui.page = "log", render();
    };
    reader.readAsText(file);
  };
  function backupPage() {
    return '<div class="card"><b>📥 استيراد من «مفكرتي اليومية» القديمة</b><p class="muted">من التطبيق القديم: «نسخ ومشاركة» ← «مشاركة نسخة (JSON)» ثم اختر الملف هنا. الاستيراد لا يكرر ما استُورد سابقاً.</p>' +
      '<button class="p" type="button" onclick="diaryPickOld()">📁 اختيار ملف النسخة القديمة</button><input id="diary-old-file" type="file" accept=".json,.txt,application/json" hidden onchange="diaryImportOld(this)"></div>' +
      '<div class="card"><b>📤 تصدير وإرسال</b><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button type="button" onclick="diaryCsv()">📊 تصدير Excel (CSV)</button><button type="button" onclick="diaryShareReport()">✉️ إرسال تقرير</button></div>' +
      '<p class="muted">النسخة الاحتياطية الكاملة (مع بقية الأقسام) من «المزيد» ← «نسخة احتياطية شاملة».</p></div>';
  }

  /* ---------------- offline readiness (honest, measured on this device) ---------------- */
  async function gatherFacts() {
    const f = { native: isNative(), online: navigator.onLine !== false, serviceWorker: !!(navigator.serviceWorker && navigator.serviceWorker.controller), webSpeech: !!(window.SpeechRecognition || window.webkitSpeechRecognition), filesTotal: 0, filesMissing: [], speechInstalled: null, mic: null };
    const srcs = [...document.querySelectorAll("script[src]")].map(s => s.getAttribute("src")).filter(s => s && !/^https?:/.test(s));
    if (f.native) { f.filesTotal = srcs.length + 1; }                         // the files are bundled inside the app itself
    else {
      try {
        if (window.caches) {
          f.filesTotal = srcs.length + 1;
          for (const s of srcs) if (!(await caches.match(s))) f.filesMissing.push(s);
          if (!(await caches.match("./index.html")) && !(await caches.match("./"))) f.filesMissing.push("index.html");
        }
      } catch (_) {}
    }
    if (f.native && typeof window.rimbookOfflineSpeechCheck === "function") {
      try { const c = await window.rimbookOfflineSpeechCheck(); f.speechInstalled = c ? c.languageStatus === "installed" : null; if (c && typeof c.microphone === "boolean") f.mic = c.microphone; } catch (_) {}
    }
    return f;
  }
  async function fillReady() {
    const box = $("diary-ready-box"); if (!box) return;
    const r = D.evaluateReadiness(await gatherFacts());
    box.innerHTML = '<div class="item"><span><b>' + (r.level === "ready" ? "🟢" : r.level === "partial" ? "🟡" : "🔴") + ' ' + safe(r.summary) + '</b></span></div>' + r.checks.map(c => '<div class="item"><span>' + safe(c.text) + '</span></div>').join("");
  }
  window.diaryReadyRefresh = () => fillReady();
  window.diaryVoiceTest = async function () {
    const out = $("diary-ready-out"); if (out) out.textContent = "أتحدث… (جرّب الآن في وضع الطيران إن أردت التأكد)";
    try { const text = (await listen()).trim(); if ($("diary-ready-out")) $("diary-ready-out").innerHTML = text ? '✅ سمع التطبيق: <b>' + safe(text) + '</b>' : "لم يُسمع كلام واضح"; }
    catch (e) { if ($("diary-ready-out")) $("diary-ready-out").textContent = "❌ " + String((e && e.message) || e); }
  };
  function readyPage() {
    setTimeout(fillReady, 0);
    return '<div class="card"><b>📶 العمل دون إنترنت</b><div id="diary-ready-box" class="muted">جارٍ الفحص…</div><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button type="button" onclick="diaryReadyRefresh()">🔄 إعادة الفحص</button><button class="p" type="button" onclick="diaryVoiceTest()">🎙️ اختبر الصوت الآن</button></div>' +
      '<div id="diary-ready-out" class="muted" style="margin-top:8px"></div>' +
      '<p class="muted">للتأكد الحقيقي: نزّل حزمة العربية مرة واحدة بإنترنت (صفحة «الصوت»)، ثم فعّل وضع الطيران واضغط «اختبر الصوت الآن». الكتابة والتسجيل والتقويم والتقارير كلها تعمل دون إنترنت؛ الإرسال بواتساب أو البريد يحتاج إنترنت عند الإرسال فقط.</p></div>';
  }

  VIEWS.diary = function () {
    const body = ui.page === "summary" ? summaryPage() : ui.page === "calendar" ? calendarPage() : ui.page === "log" ? logPage() : ui.page === "me" ? mePage() : ui.page === "backup" ? backupPage() : ui.page === "ready" ? readyPage() : todayPage();
    return '<div class="card"><b style="font-size:18px">📔 مفكرتي اليومية</b><p class="muted">تسجيل أيام العمل والدفعات والمكافآت والخصومات بالصوت أو الكتابة، دون إنترنت. بياناتك على هاتفك فقط.</p>' + nav() + '</div>' + body;
  };

  window.RimbookData = window.RimbookData || {};
  window.RimbookData.diary = {
    label: "المفكرة اليومية",
    export: () => D.makeEnvelope(store), verify: env => D.verifyEnvelope(env),
    import(env, mode) { const r = D.importEnvelope(store, env, mode); if (!r.ok) return r; return commit(r.store) ? { ok: true } : { ok: false, error: "تعذر الحفظ" }; },
    snapshot: () => JSON.stringify(store),
    restore(json) { try { const s = JSON.parse(json); return D.validateStore(s).ok && commit(s) ? { ok: true } : { ok: false, error: "نسخة غير صالحة" }; } catch (_) { return { ok: false, error: "نسخة غير صالحة" }; } },
    count: () => store.entries.length
  };

  TABS.diary = ["📔", "مفكرتي اليومية"];
  const baseMore = VIEWS.more;
  if (typeof baseMore === "function") VIEWS.more = function () {
    return baseMore() + '<div class="card"><b>مفكرتي اليومية</b><p class="muted">عمل ودفعات بالصوت والكتابة، دون إنترنت.</p><button class="card" type="button" style="min-height:76px;text-align:right;width:100%" onclick="go(\'diary\')"><b>📔 مفكرتي اليومية</b></button></div>';
  };
  // shortcuts from the app icon (manifest): #diary and #diary-calendar
  const h = String((typeof location !== "undefined" && location.hash) || "");
  if (h === "#diary" || h === "#today") setTimeout(() => go("diary"), 0);
  else if (h === "#diary-calendar") { ui.page = "calendar"; setTimeout(() => go("diary"), 0); }
  render();
})();
