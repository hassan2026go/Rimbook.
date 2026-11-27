/* Rimbook side ledgers + calculator — an independent add-on.
   Own storage key, own logic (ledger-core.js). It never reads or writes the notebook, workers, payroll or purchases data. */
(function () {
  "use strict";
  const Core = window.RimbookLedgerCore;
  if (!Core) return;
  const KEY = "rimbook_ledgers_v1", PREV = "rimbook_ledgers_prev";
  const $ = id => document.getElementById(id);
  const val = id => ($(id)?.value || "").trim();
  const safe = v => esc(String(v ?? ""));
  const todayStr = () => iso(new Date());
  const ui = { bookId: null, kind: "", category: "", from: "", to: "" };
  let store = load();

  /* ---------------- persistence (all-or-nothing, verified read-back) ---------------- */
  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
      if (!raw) return Core.emptyStore();
      const parsed = JSON.parse(raw);
      if (Core.validateStore(parsed).ok) return parsed;
    } catch (_) { /* fall through: keep the damaged text aside */ }
    try { if (raw) localStorage.setItem(KEY + "_corrupt_" + Date.now(), raw); } catch (_) {}   // never overwrite silently
    setTimeout(() => toast("بيانات الدفاتر تالفة؛ حُفظت نسخة منها. استعد من ملف نسخة احتياطية."), 800);
    return Core.emptyStore();
  }
  function commit(next) {
    try {
      const json = JSON.stringify(next);
      localStorage.setItem(KEY, json);
      if (localStorage.getItem(KEY) !== json) throw new Error("readback");
      store = next;
      return true;
    } catch (_) {
      toast("تعذر الحفظ؛ لم تُسجَّل العملية. تحقق من مساحة التخزين.");
      return false;
    }
  }
  const book = id => store.books.find(b => b.id === id);
  const money = (minor, b) => Core.formatMinor(minor) + (b && b.currency ? " " + safe(b.currency) : "");
  const bookEntries = id => store.entries.filter(e => e.bookId === id);

  /* ---------------- books ---------------- */
  window.ledgerCreateBook = function (presetName) {
    const name = presetName || val("lb-name");
    const currency = presetName ? (RB.data.settings && RB.data.settings.currency) || "" : (val("lb-cur") || (RB.data.settings && RB.data.settings.currency) || "");
    const r = Core.createBook(store, { name, currency });
    if (!r.ok) return toast(r.error);
    if (!commit(r.store)) return;
    ui.bookId = r.book.id; toast("تم إنشاء الدفتر"); render();
  };
  window.ledgerOpenBook = id => { ui.bookId = id; ui.kind = ui.category = ui.from = ui.to = ""; render(); };
  window.ledgerBack = () => { ui.bookId = null; render(); };
  window.ledgerArchive = function (id, archived) {
    if (archived && !confirm("أرشفة الدفتر تخفيه من القائمة دون حذف بياناته. متابعة؟")) return;
    const r = Core.archiveBook(store, id, archived);
    if (!r.ok) return toast(r.error);
    if (commit(r.store)) { if (archived) ui.bookId = null; render(); }
  };
  window.ledgerSettle = function (i, kind) {
    const p = (ui.partyList || [])[i]; if (!p || !ui.bookId) return;
    ledgerOpenEntry(ui.bookId, { kind, party: p.party, amountText: Core.plainMinor(kind === "collected" ? p.receivableOpen : p.payableOpen) });
  };
  window.ledgerSetFilter = function (key, value) { ui[key] = value; render(); };

  /* ---------------- entry modal (explicit save; one-time token prevents double recording) ---------------- */
  const closeModal = () => document.getElementById("rimbook-ledger-modal")?.remove();
  function datalist(id, values) { return '<datalist id="' + id + '">' + [...new Set(values.filter(Boolean))].slice(0, 40).map(v => '<option value="' + safe(v) + '">').join("") + '</datalist>'; }
  window.ledgerOpenEntry = function (bookId, preset, reviseId) {
    closeModal();
    const b = book(bookId); if (!b) return;
    preset = preset || {};
    const entries = bookEntries(bookId);
    const token = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const kinds = ["income", "expense", "receivable", "payable", "collected", "paid"];
    const modal = document.createElement("div");
    modal.id = "rimbook-ledger-modal";
    modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    modal.dataset.book = bookId; modal.dataset.token = token; modal.dataset.revise = reviseId || "";
    modal.style.cssText = "position:fixed;inset:0;z-index:10040;background:#000a;display:flex;align-items:center;justify-content:center;padding:12px";
    const kind = preset.kind || "income";
    modal.innerHTML = '<div class="card" style="width:min(100%,520px);max-height:92vh;overflow:auto;margin:0;background:var(--card)">' +
      '<div class="row" style="justify-content:space-between"><b>' + (reviseId ? "✏️ تعديل القيد (يُنشأ قيد إلغاء ثم قيد جديد)" : "➕ عملية جديدة") + ' — ' + safe(b.name) + '</b><button type="button" onclick="document.getElementById(\'rimbook-ledger-modal\')?.remove()">✕</button></div>' +
      '<label class="muted" for="le-kind">نوع العملية</label><select id="le-kind" onchange="ledgerKindChanged()" style="width:100%;margin:4px 0 8px">' +
      kinds.map(k => '<option value="' + k + '"' + (k === kind ? " selected" : "") + '>' + Core.KINDS[k] + '</option>').join("") + '</select>' +
      '<label class="muted" for="le-amount">المبلغ (خانتان عشريتان كحد أقصى)</label><input id="le-amount" inputmode="decimal" dir="ltr" placeholder="0.00" value="' + safe(preset.amountText || "") + '" style="width:100%;margin:4px 0 8px;font-size:20px">' +
      '<label class="muted" for="le-date">التاريخ</label><input id="le-date" type="date" value="' + safe(preset.date || todayStr()) + '" style="width:100%;margin:4px 0 8px">' +
      '<label class="muted" for="le-category">التصنيف</label><input id="le-category" list="le-cats" maxlength="40" value="' + safe(preset.category || "") + '" placeholder="مثلاً: مواد، أجور، مبيعات" style="width:100%;margin:4px 0 8px">' + datalist("le-cats", entries.map(e => e.category)) +
      '<label class="muted" for="le-party" id="le-party-label">الجهة (إلزامية للديون والتحصيل والسداد)</label><input id="le-party" list="le-parties" maxlength="60" value="' + safe(preset.party || "") + '" placeholder="اسم الشخص أو الجهة أو المشروع" style="width:100%;margin:4px 0 8px">' + datalist("le-parties", entries.map(e => e.party)) +
      '<div id="le-debt-opts" style="display:none"><label class="muted" style="display:block;margin:4px 0"><input id="le-advance" type="checkbox"' + (preset.tag === "advance" ? " checked" : "") + '> هذه سلفة</label>' +
      '<label class="muted" style="display:block;margin:4px 0"><input id="le-cash" type="checkbox"' + (preset.cashNow ? " checked" : "") + '> تحرّك المال فعلاً الآن (قرض/سلفة نقدية) — اتركه فارغاً للبيع أو الشراء الآجل</label></div>' +
      '<label class="muted" for="le-note">ملاحظة</label><textarea id="le-note" rows="2" maxlength="300" style="width:100%;margin:4px 0 10px">' + safe(preset.note || "") + '</textarea>' +
      '<div class="row"><button class="p" type="button" onclick="ledgerSaveEntry()">حفظ</button><button type="button" onclick="document.getElementById(\'rimbook-ledger-modal\')?.remove()">إلغاء</button></div></div>';
    document.body.append(modal);
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    ledgerKindChanged();
  };
  window.ledgerKindChanged = function () {
    const k = val("le-kind"), debt = k === "receivable" || k === "payable";
    const box = $("le-debt-opts"); if (box) box.style.display = debt ? "block" : "none";
  };
  window.ledgerSaveEntry = function (allowDuplicate) {
    const modal = $("rimbook-ledger-modal"); if (!modal) return;
    const amount = Core.parseMinor(val("le-amount"));
    if (amount === null || amount < 1) return toast("أدخل مبلغاً صحيحاً أكبر من صفر بخانتين عشريتين كحد أقصى");
    const raw = {
      bookId: modal.dataset.book, kind: val("le-kind"), amount, date: val("le-date"), category: val("le-category"),
      party: val("le-party"), note: val("le-note"), token: modal.dataset.token,
      cashNow: !!$("le-cash")?.checked, tag: $("le-advance")?.checked ? "advance" : ""
    };
    const reviseId = modal.dataset.revise;
    const r = reviseId
      ? Core.reviseEntry(store, reviseId, raw, { reason: "تعديل", today: todayStr() })
      : Core.addEntry(store, raw, { allowDuplicate: allowDuplicate === true });
    if (!r.ok) {
      if (r.duplicate === "token") { closeModal(); render(); return toast("سُجّلت هذه العملية من قبل"); }
      if (r.duplicate === "similar" && confirm(r.error + "\nهل تريد تسجيلها مرة ثانية فعلاً؟")) return ledgerSaveEntry(true);
      return toast(r.error);
    }
    if (!commit(r.store)) return;
    closeModal(); toast(reviseId ? "تم تعديل القيد وحُفظ الأثر في السجل" : "تم تسجيل العملية"); render();
  };
  window.ledgerEditEntry = function (id) {
    const e = store.entries.find(x => x.id === id); if (!e) return;
    window.ledgerOpenEntry(e.bookId, { kind: e.kind, amountText: Core.plainMinor(e.amount), date: e.date, category: e.category, party: e.party, note: e.note, tag: e.tag, cashNow: e.cashNow }, id);
  };
  window.ledgerReverseEntry = function (id) {
    const e = store.entries.find(x => x.id === id); if (!e) return;
    const reason = prompt("سبب إلغاء القيد (اختياري). لن يُحذف القيد؛ يُضاف قيد إلغاء ويبقى الأثر في السجل:", "");
    if (reason === null) return;
    const r = Core.reverseEntry(store, id, { reason, today: todayStr() });
    if (!r.ok) return toast(r.error);
    if (commit(r.store)) { toast("تم إلغاء القيد"); render(); }
  };

  /* ---------------- book screen ---------------- */
  const KIND_SIGN = { income: "＋", collected: "＋", expense: "－", paid: "－", receivable: "◁", payable: "▷", reversal: "↺" };
  const ACTION = { book_create: "إنشاء دفتر", book_archive: "أرشفة دفتر", book_unarchive: "إلغاء أرشفة", entry_add: "إضافة قيد", entry_reverse: "إلغاء قيد", entry_revise: "تعديل قيد", import: "استيراد", restore: "استعادة" };
  function bookScreen(b) {
    const all = bookEntries(b.id);
    const range = { from: ui.from || undefined, to: ui.to || undefined };
    const s = Core.summarize(all, range);
    const reversed = new Set(all.filter(e => e.kind === "reversal").map(e => e.reverses));
    const cats = [...new Set(all.map(e => e.category).filter(Boolean))];
    let list = all.filter(e => (!ui.from || e.date >= ui.from) && (!ui.to || e.date <= ui.to) && (!ui.kind || e.kind === ui.kind) && (!ui.category || e.category === ui.category));
    list = list.slice().sort((a, c) => c.date.localeCompare(a.date) || c.createdAt - a.createdAt);
    const card = (label, v, extra) => '<div class="card"><small class="muted">' + label + '</small><h3 style="' + (extra || "") + '">' + money(v, b) + '</h3></div>';
    const rows = list.slice(0, 200).map(e => {
      const gone = reversed.has(e.id), isRev = e.kind === "reversal";
      const actions = (!gone && !isRev) ? '<div class="row"><button type="button" onclick="ledgerEditEntry(\'' + e.id + '\')">تعديل</button><button type="button" onclick="ledgerReverseEntry(\'' + e.id + '\')">إلغاء القيد</button></div>' : "";
      return '<div class="item" style="' + (gone ? "opacity:.5;text-decoration:line-through" : "") + '"><span><b>' + KIND_SIGN[e.kind] + ' ' + Core.KINDS[e.kind] + (e.tag === "advance" ? " (سلفة)" : "") + ' — ' + money(e.amount, b) + '</b><br><small class="muted">' +
        safe(e.date) + (e.party ? " · " + safe(e.party) : "") + (e.category ? " · " + safe(e.category) : "") + (e.note ? " · " + safe(e.note) : "") + (gone ? " · مُلغى" : "") + (e.revisionOf ? " · تصحيح" : "") + '</small></span>' + actions + '</div>';
    }).join("");
    ui.partyList = s.parties.filter(p => p.receivableOpen > 0 || p.payableOpen > 0);
    const parties = ui.partyList.map((p, i) =>
      '<div class="item"><span><b>' + safe(p.party) + '</b><br><small class="muted">' + (p.receivableOpen ? "لي عنده: " + money(p.receivableOpen, b) : "") + (p.receivableOpen && p.payableOpen ? " · " : "") + (p.payableOpen ? "عليّ له: " + money(p.payableOpen, b) : "") + '</small></span>' +
      '<div class="row">' + (p.receivableOpen ? '<button type="button" onclick="ledgerSettle(' + i + ',\'collected\')">تحصيل</button>' : "") +
      (p.payableOpen ? '<button type="button" onclick="ledgerSettle(' + i + ',\'paid\')">سداد</button>' : "") + '</div></div>').join("");
    const catRows = Object.entries(s.byCategory).sort((a, c) => (c[1].income + c[1].expense) - (a[1].income + a[1].expense)).map(([name, v]) =>
      '<div class="item"><span><b>' + safe(name) + '</b></span><span class="muted">دخل ' + money(v.income, b) + ' · مصروف ' + money(v.expense, b) + '</span></div>').join("");
    const monthRows = Object.entries(s.byMonth).sort().reverse().slice(0, 12).map(([m, v]) =>
      '<div class="item"><span><b>' + safe(m) + '</b></span><span class="muted">دخل ' + money(v.income, b) + ' · مصروف ' + money(v.expense, b) + ' · ' + (v.income - v.expense >= 0 ? "ربح " : "خسارة ") + money(Math.abs(v.income - v.expense), b) + '</span></div>').join("");
    const auditRows = store.audit.filter(a => a.bookId === b.id).slice(-40).reverse().map(a =>
      '<div class="item"><span><b>' + (ACTION[a.action] || safe(a.action)) + '</b><br><small class="muted">' + safe(new Date(a.t).toLocaleString("ar")) + (a.detail && a.detail.amount ? " · " + Core.formatMinor(a.detail.amount) : "") + (a.detail && a.detail.kind ? " · " + safe(Core.KINDS[a.detail.kind] || a.detail.kind) : "") + (a.detail && a.detail.reason ? " · " + safe(a.detail.reason) : "") + '</small></span></div>').join("");
    return '<div class="card"><div class="row" style="justify-content:space-between"><button type="button" onclick="ledgerBack()">→ الدفاتر</button><button type="button" onclick="ledgerArchive(\'' + b.id + '\',true)">أرشفة</button></div>' +
      '<h2>📒 ' + safe(b.name) + '</h2><p class="muted">دفتر مستقل: لا يدخل في المفكرة ولا في أجور العمال. الأرقام تُحسب من القيود فقط.</p>' +
      '<button class="p" type="button" style="width:100%;min-height:48px" onclick="ledgerOpenEntry(\'' + b.id + '\')">➕ عملية جديدة</button></div>' +
      '<div class="card"><b>الفترة والتصفية</b><div class="grid2"><div><label class="muted" for="lf-from">من</label><input id="lf-from" type="date" value="' + safe(ui.from) + '" onchange="ledgerSetFilter(\'from\',this.value)" style="width:100%"></div>' +
      '<div><label class="muted" for="lf-to">إلى</label><input id="lf-to" type="date" value="' + safe(ui.to) + '" onchange="ledgerSetFilter(\'to\',this.value)" style="width:100%"></div></div>' +
      '<div class="grid2"><select aria-label="النوع" onchange="ledgerSetFilter(\'kind\',this.value)" style="width:100%"><option value="">كل الأنواع</option>' + Object.keys(Core.KINDS).map(k => '<option value="' + k + '"' + (ui.kind === k ? " selected" : "") + '>' + Core.KINDS[k] + '</option>').join("") + '</select>' +
      '<select aria-label="التصنيف" onchange="ledgerSetFilter(\'category\',this.value)" style="width:100%"><option value="">كل التصنيفات</option>' + cats.map(c => '<option value="' + safe(c) + '"' + (ui.category === c ? " selected" : "") + '>' + safe(c) + '</option>').join("") + '</select></div></div>' +
      '<div class="grid2">' + card("الرصيد النقدي", s.cash, s.cash < 0 ? "color:var(--bad,#c0392b)" : "") + card(s.profit >= 0 ? "الربح" : "الخسارة", Math.abs(s.profit)) + card("دخل", s.income) + card("مصروف", s.expense) + card("ديون لي (مفتوحة)", s.receivableOpen) + card("ديون عليّ (مفتوحة)", s.payableOpen) + '</div>' +
      '<div class="card"><small class="muted">الصافي = الرصيد النقدي + ديون لي − ديون عليّ</small><h3>' + money(s.net, b) + '</h3></div>' +
      (parties ? '<div class="card"><b>الأطراف والديون المفتوحة</b>' + parties + '</div>' : "") +
      '<div class="card"><b>القيود (' + list.length + ')</b>' + (rows || '<p class="muted">لا توجد قيود مطابقة.</p>') + '</div>' +
      (catRows ? '<div class="card"><b>حسب التصنيف</b>' + catRows + '</div>' : "") +
      (monthRows ? '<div class="card"><b>حسب الشهر</b>' + monthRows + '</div>' : "") +
      '<div class="card"><b>نسخ احتياطي وتصدير</b><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button type="button" onclick="ledgerExport(\'' + b.id + '\')">⬇️ تصدير هذا الدفتر</button><button type="button" onclick="ledgerCsv(\'' + b.id + '\')">📄 CSV</button><button type="button" onclick="ledgerShareFile(\'' + b.id + '\')">📤 مشاركة الملف</button><button type="button" onclick="ledgerShareReport(\'' + b.id + '\')">✉️ إرسال التقرير (واتساب/بريد)</button></div></div>' +
      '<div class="card"><b>سجل التعديلات</b>' + (auditRows || '<p class="muted">لا يوجد.</p>') + '</div>';
  }

  /* ---------------- ledgers home ---------------- */
  VIEWS.ledgers = function () {
    const b = ui.bookId && book(ui.bookId);
    if (b) return bookScreen(b);
    const active = store.books.filter(x => !x.archived), archived = store.books.filter(x => x.archived);
    const cardFor = x => {
      const s = Core.summarize(bookEntries(x.id));
      return '<button class="card" type="button" style="text-align:right;width:100%" onclick="ledgerOpenBook(\'' + x.id + '\')"><b style="font-size:17px">📒 ' + safe(x.name) + '</b><br><small class="muted">الرصيد النقدي: ' + money(s.cash, x) + ' · قيود: ' + bookEntries(x.id).length + '</small></button>';
    };
    const presets = ["شخصي", "ورشة", "مشتريات"].filter(n => !active.some(x => x.name === n));
    return '<div class="card"><b style="font-size:18px">📚 الدفاتر الجانبية</b><p class="muted">كل دفتر مستقل تماماً عن الآخر وعن المفكرة وأجور العمال. تُسجَّل القيود ولا تُحذف؛ التصحيح بقيد إلغاء، وكل تعديل يُحفظ في السجل. البيانات على هاتفك فقط.</p></div>' +
      (active.length ? active.map(cardFor).join("") : '<div class="card muted">لا توجد دفاتر بعد. أنشئ أول دفتر.</div>') +
      '<div class="card"><b>➕ دفتر جديد</b><div class="grid2"><input id="lb-name" maxlength="40" placeholder="اسم الدفتر" style="width:100%"><input id="lb-cur" maxlength="8" placeholder="العملة (اختياري)" style="width:100%"></div>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button class="p" type="button" onclick="ledgerCreateBook()">إنشاء</button>' +
      presets.map(n => '<button type="button" onclick="ledgerCreateBook(\'' + n + '\')">+ ' + n + '</button>').join("") + '</div></div>' +
      '<div class="card"><b>🗄️ نسخ احتياطي واستعادة (كل الدفاتر)</b><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button type="button" onclick="ledgerExport()">⬇️ تصدير الكل</button><button type="button" onclick="ledgerPickImport()">⬆️ استيراد ملف</button>' +
      (localStorage.getItem(PREV) ? '<button type="button" onclick="ledgerUndoRestore()">↩️ التراجع عن آخر استيراد</button>' : "") + '</div>' +
      '<input id="ledger-file" type="file" accept="application/json,.json" hidden onchange="ledgerImportFile(this)"><p class="muted">الملف يحمل بصمة سلامة؛ أي ملف تالف أو معدّل يدوياً يُرفض.</p></div>' +
      '<div class="card"><button type="button" onclick="go(\'calculator\')" style="width:100%">🧮 الحاسبة</button></div>' +
      (archived.length ? '<div class="card"><b>المؤرشفة</b>' + archived.map(x => '<div class="item"><span>' + safe(x.name) + '</span><button type="button" onclick="ledgerArchive(\'' + x.id + '\',false)">استرجاع</button></div>').join("") + '</div>' : "");
  };

  /* ---------------- export / import / restore ---------------- */
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || "application/json;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const stamp = () => todayStr();
  window.ledgerExport = function (bookId) {
    const env = Core.makeEnvelope(store, bookId ? [bookId] : null);
    download("rimbook-ledgers-" + (bookId ? "book-" : "all-") + stamp() + ".json", JSON.stringify(env));
    toast("تم تجهيز ملف النسخة الاحتياطية");
  };
  window.ledgerCsv = function (bookId) { download("rimbook-ledger-" + stamp() + ".csv", Core.toCsv(store, bookId), "text/csv;charset=utf-8"); toast("تم تجهيز ملف CSV"); };
  window.ledgerShareFile = async function (bookId) {
    const env = Core.makeEnvelope(store, [bookId]);
    const file = new File([JSON.stringify(env)], "rimbook-ledger-" + stamp() + ".json", { type: "application/json" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "دفتر ريمبوك" }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    ledgerExport(bookId); toast("المشاركة المباشرة غير متاحة؛ نُزّل الملف لترسله بنفسك");
  };
  window.ledgerPickImport = () => $("ledger-file")?.click();
  window.ledgerImportFile = function (input) {
    const file = input.files && input.files[0]; input.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast("تعذر قراءة الملف");
    reader.onload = () => {
      let env; try { env = JSON.parse(String(reader.result)); } catch (_) { return toast("الملف ليس بصيغة صحيحة"); }
      const ver = Core.verifyEnvelope(env);
      if (!ver.ok) return toast(ver.error);
      const books = ver.data.books.length, entries = ver.data.entries.length;
      const replace = confirm("ملف سليم: " + books + " دفتر و" + entries + " قيد.\n\nموافق = استبدال كل الدفاتر الحالية (تُحفظ نسخة للتراجع).\nإلغاء = الاحتفاظ بالحالية وإضافة المستورد كنسخ جديدة.");
      if (!replace && !confirm("إضافة الدفاتر المستوردة كنسخ جديدة إلى دفاترك الحالية؟")) return;
      const r = Core.importEnvelope(store, env, replace ? "replace" : "append", { reason: "import" });
      if (!r.ok) return toast(r.error);
      try { localStorage.setItem(PREV, JSON.stringify(store)); } catch (_) { if (replace && !confirm("تعذر حفظ نسخة التراجع. المتابعة بالاستبدال؟")) return; }
      if (commit(r.store)) { ui.bookId = null; toast(replace ? "تمت الاستعادة" : "تم استيراد الدفاتر كنسخ جديدة"); render(); }
    };
    reader.readAsText(file);
  };
  window.ledgerUndoRestore = function () {
    try {
      const prev = JSON.parse(localStorage.getItem(PREV) || "null");
      if (!prev || !Core.validateStore(prev).ok) return toast("لا توجد نسخة صالحة للتراجع");
      if (!confirm("التراجع إلى حالة الدفاتر قبل آخر استيراد؟")) return;
      if (commit(prev)) { localStorage.removeItem(PREV); ui.bookId = null; toast("تم التراجع"); render(); }
    } catch (_) { toast("تعذر التراجع"); }
  };

  /* ---------------- calculator ---------------- */
  const calc = { history: [], last: null };
  window.ledgerCalcKey = function (k) {
    const box = $("calc-expr"); if (!box) return;
    if (k === "C") { box.value = ""; $("calc-result").textContent = ""; calc.last = null; return; }
    if (k === "⌫") { box.value = box.value.slice(0, -1); return ledgerCalcLive(); }
    if (k === "=") return ledgerCalcEval(true);
    box.value += k; ledgerCalcLive();
  };
  window.ledgerCalcLive = function () {
    const r = Core.evaluate($("calc-expr").value), out = $("calc-result");
    if (r.ok) { out.textContent = "= " + r.text; out.style.color = ""; calc.last = r; }
    else { out.textContent = $("calc-expr").value ? "" : ""; calc.last = null; }
  };
  window.ledgerCalcEval = function (commitResult) {
    const box = $("calc-expr"), r = Core.evaluate(box.value), out = $("calc-result");
    if (!r.ok) { out.textContent = r.error; out.style.color = "var(--bad,#c0392b)"; calc.last = null; return; }
    out.textContent = "= " + r.text; out.style.color = ""; calc.last = r;
    if (commitResult) {
      calc.history.unshift({ expr: box.value, text: r.text }); calc.history = calc.history.slice(0, 10);
      box.value = r.text; renderCalcHistory();
    }
  };
  function renderCalcHistory() {
    const h = $("calc-history"); if (!h) return;
    h.innerHTML = calc.history.map((x, i) => '<button type="button" class="item" style="width:100%;text-align:right" onclick="ledgerCalcReuse(' + i + ')"><span dir="ltr">' + safe(x.expr) + ' = <b>' + safe(x.text) + '</b></span></button>').join("");
  }
  window.ledgerCalcReuse = i => { const x = calc.history[i]; if (!x) return; $("calc-expr").value = x.text; ledgerCalcLive(); };
  window.ledgerCalcSave = function () {
    const r = calc.last || Core.evaluate(val("calc-expr"));
    if (!r.ok) return toast("احسب نتيجة صحيحة أولاً");
    if (r.value < 0n) return toast("النتيجة سالبة؛ سجّل المبلغ موجباً واختر نوع العملية");
    const active = store.books.filter(b => !b.archived);
    if (!active.length) { toast("أنشئ دفتراً أولاً"); return go("ledgers"); }
    const minor = Core.roundToMinor(r.value);
    if (minor < 1 || minor > Core.MAX_MINOR) return toast("المبلغ خارج الحدود المسموحة للقيد");
    const bookId = active.length === 1 ? active[0].id : (() => {
      const pick = prompt("اختر رقم الدفتر:\n" + active.map((b, i) => (i + 1) + ". " + b.name).join("\n"), "1");
      const b = active[Number(pick) - 1]; return b && b.id;
    })();
    if (!bookId) return;
    ui.bookId = bookId; go("ledgers");
    setTimeout(() => ledgerOpenEntry(bookId, { amountText: Core.plainMinor(minor) }), 0);   // the user still reviews and confirms
  };
  VIEWS.calculator = function () {
    const keys = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "%", "⌫"];
    return '<div class="card"><b style="font-size:18px">🧮 الحاسبة الدقيقة</b><p class="muted">حساب عشري دقيق (0.1+0.2 = 0.3). النسبة المئوية: 50+10% = 55. لا تُسجَّل أي نتيجة في الحسابات إلا بضغطك على زر الحفظ ومراجعتك للقيد.</p>' +
      '<input id="calc-expr" dir="ltr" inputmode="decimal" autocomplete="off" oninput="ledgerCalcLive()" onkeydown="if(event.key===\'Enter\'){event.preventDefault();ledgerCalcEval(true)}" placeholder="0" style="width:100%;font-size:26px;padding:12px;text-align:left">' +
      '<div id="calc-result" dir="ltr" style="min-height:34px;font-size:22px;text-align:left;margin:6px 0"></div>' +
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">' + keys.map(k => '<button type="button" onclick="ledgerCalcKey(\'' + k + '\')" style="min-height:54px;font-size:20px">' + k + '</button>').join("") +
      '<button class="p" type="button" onclick="ledgerCalcKey(\'=\')" style="grid-column:1/-1;min-height:54px;font-size:22px">=</button></div>' +
      '<button type="button" style="width:100%;margin-top:10px;min-height:46px" onclick="ledgerCalcSave()">💾 حفظ الناتج كقيد في دفتر (بعد مراجعتك)</button></div>' +
      '<div class="card"><b>آخر العمليات</b><div id="calc-history"></div></div>';
  };

  /* ---------------- registration (no change to existing screens except an extra card in the More menu) ---------------- */
  /* Narrow API for other add-ons (e.g. the calendar). Posting is the ONLY way in, it goes through the same
     validation, duplicate-token guard and audit log as manual entries, and callers must ask the user first. */
  window.RimbookLedgers = {
    books: () => store.books.filter(b => !b.archived).map(b => ({ id: b.id, name: b.name, currency: b.currency })),
    post(raw, opts) {
      const r = Core.addEntry(store, raw, { allowDuplicate: !!(opts && opts.allowDuplicate) });
      if (!r.ok) return r;
      if (!commit(r.store)) return { ok: false, error: "تعذر الحفظ في الدفتر" };
      render();
      return { ok: true, entryId: r.entry.id };
    },
    findByToken: (bookId, token) => { const e = store.entries.find(x => x.bookId === bookId && x.token === token); return e ? e.id : null; },
    status(bookId, entryId) {
      const e = store.entries.find(x => x.bookId === bookId && x.id === entryId);
      if (!e) return "missing";
      return store.entries.some(x => x.kind === "reversal" && x.reverses === entryId) ? "reversed" : "active";
    },
    bookName: id => (book(id) || {}).name || "",
    createBook(name, currency) {
      const r = Core.createBook(store, { name, currency: currency || (RB.data.settings && RB.data.settings.currency) || "" });
      if (!r.ok) return r;
      if (!commit(r.store)) return { ok: false, error: "تعذر الحفظ" };
      return { ok: true, bookId: r.book.id };
    },
    exists: id => !!book(id),
    summary(bookId) { const b = book(bookId); return b ? Object.assign({ currency: b.currency, name: b.name, count: bookEntries(bookId).length }, Core.summarize(bookEntries(bookId))) : null; },
    openEntry: (bookId, preset) => window.ledgerOpenEntry(bookId, preset),
    openBook: bookId => { window.ledgerOpenBook(bookId); go("ledgers"); },
    reportText: bookId => reportText(bookId)
  };
  window.RimbookData = window.RimbookData || {};
  window.RimbookData.ledgers = {
    label: "الدفاتر الجانبية",
    export: () => Core.makeEnvelope(store),
    verify: env => Core.verifyEnvelope(env),
    import(env, mode) { const r = Core.importEnvelope(store, env, mode); if (!r.ok) return r; return commit(r.store) ? { ok: true } : { ok: false, error: "تعذر الحفظ" }; },
    snapshot: () => JSON.stringify(store),
    restore(json) { try { const s = JSON.parse(json); return Core.validateStore(s).ok && commit(s) ? { ok: true } : { ok: false, error: "نسخة غير صالحة" }; } catch (_) { return { ok: false, error: "نسخة غير صالحة" }; } },
    count: () => store.entries.length
  };
  function reportText(bookId) {
    const b = book(bookId); if (!b) return "";
    const s = Core.summarize(bookEntries(bookId), { from: ui.from || undefined, to: ui.to || undefined });
    const m = v => Core.formatMinor(v) + (b.currency ? " " + b.currency : "");
    const lines = ["📒 تقرير دفتر: " + b.name, "التاريخ: " + todayStr() + (ui.from || ui.to ? " · الفترة: " + (ui.from || "…") + " ← " + (ui.to || "…") : ""), "",
      "الرصيد النقدي: " + m(s.cash), (s.profit >= 0 ? "الربح: " : "الخسارة: ") + m(Math.abs(s.profit)), "الدخل: " + m(s.income), "المصروف: " + m(s.expense),
      "ديون لي: " + m(s.receivableOpen), "ديون عليّ: " + m(s.payableOpen), "الصافي: " + m(s.net)];
    const open = s.parties.filter(p => p.receivableOpen > 0 || p.payableOpen > 0);
    if (open.length) { lines.push("", "الأطراف:"); open.forEach(p => lines.push("• " + p.party + (p.receivableOpen ? " — له عندي/لي عنده: " + m(p.receivableOpen) : "") + (p.payableOpen ? " — عليّ له: " + m(p.payableOpen) : ""))); }
    lines.push("", "— من ريمبوك");
    return lines.join("\n");
  }
  window.ledgerShareReport = function (bookId) {
    const text = reportText(bookId); if (!text) return;
    if (window.RimbookShare) window.RimbookShare.open({ title: "إرسال تقرير الدفتر", text, subject: "تقرير دفتر — ريمبوك", filename: "rimbook-ledger-report.txt" });
    else toast("مركز الإرسال غير متاح");
  };
  TABS.ledgers = ["📚", "الدفاتر"];
  TABS.calculator = ["🧮", "الحاسبة"];
  const baseMore = VIEWS.more;
  if (typeof baseMore === "function") {
    VIEWS.more = function () {
      return baseMore() + '<div class="card"><b>الأدوات المالية الجانبية</b><p class="muted">مستقلة عن المفكرة وأجور العمال.</p><div class="grid2">' +
        '<button class="card" type="button" style="min-height:76px;text-align:right" onclick="go(\'ledgers\')"><b>📚 الدفاتر الجانبية</b></button>' +
        '<button class="card" type="button" style="min-height:76px;text-align:right" onclick="go(\'calculator\')"><b>🧮 الحاسبة</b></button></div></div>';
    };
  }
  render();
  setTimeout(renderCalcHistory, 0);
})();
