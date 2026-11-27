/* Rimbook calendar — independent add-on (own storage key `rimbook_calendar_v1`).
   It never reads or writes the notebook, workers, payroll or purchases data. A financial note stays a draft here until the user
   explicitly posts it to a side ledger. */
(function () {
  "use strict";
  const Cal = window.RimbookCalendarCore, Core = window.RimbookLedgerCore;
  if (!Cal || !Core) return;
  const KEY = "rimbook_calendar_v1", PREV = "rimbook_calendar_prev";
  const $ = id => document.getElementById(id);
  const val = id => ($(id)?.value || "").trim();
  const safe = v => esc(String(v ?? ""));
  const todayStr = () => iso(new Date());
  const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const REMIND_LABELS = { 0: "عند الموعد", 5: "قبله بـ 5 دقائق", 10: "قبله بـ 10 دقائق", 15: "قبله بـ 15 دقيقة", 30: "قبله بـ 30 دقيقة", 60: "قبله بساعة", 1440: "قبله بيوم" };
  const ui = { view: "month", date: todayStr(), q: "" };
  let store = load();

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
      if (!raw) return Cal.emptyStore();
      const parsed = JSON.parse(raw);
      if (Cal.validateStore(parsed).ok) return parsed;
    } catch (_) { /* keep damaged text aside below */ }
    try { if (raw) localStorage.setItem(KEY + "_corrupt_" + Date.now(), raw); } catch (_) {}
    setTimeout(() => toast("بيانات التقويم تالفة؛ حُفظت نسخة منها. استعد من ملف نسخة احتياطية."), 800);
    return Cal.emptyStore();
  }
  function commit(next) {
    try {
      const json = JSON.stringify(next);
      localStorage.setItem(KEY, json);
      if (localStorage.getItem(KEY) !== json) throw new Error("readback");
      store = next;
      if (window.RimbookAlarms) window.RimbookAlarms.syncFromCalendar(store);   // reminders always mirror the calendar
      return true;
    } catch (_) { toast("تعذر الحفظ؛ لم يُسجَّل التغيير. تحقق من مساحة التخزين."); return false; }
  }
  const item = id => store.items.find(i => i.id === id && !i.deletedAt);
  const dayLabel = d => DAYS[Cal.weekday(d)] + " " + Number(d.slice(8)) + " " + MONTHS[Number(d.slice(5, 7)) - 1];
  const finLabel = i => i.finance.mode === "none" ? "" : (i.finance.mode === "party" ? "💰🔗" : "💰");
  const ledgers = () => window.RimbookLedgers;

  /* ---------------- navigation ---------------- */
  window.calSetView = v => { ui.view = v; render(); };
  window.calGoDay = d => { ui.date = d; ui.view = "day"; render(); };
  window.calToday = () => { ui.date = todayStr(); render(); };
  window.calNav = function (dir) {
    ui.date = ui.view === "month" ? Cal.addMonths(ui.date, dir) : Cal.addDays(ui.date, ui.view === "week" ? 7 * dir : dir);
    render();
  };
  window.calShareRange = function (kind) {
    const from = kind === "week" ? Cal.startOfWeek(ui.date, store.settings.weekStart) : ui.date;
    const to = kind === "week" ? Cal.addDays(from, 6) : ui.date;
    const text = Cal.agendaText(store, from, to, { title: kind === "week" ? "جدول الأسبوع" : "جدول اليوم" });
    if (window.RimbookShare) window.RimbookShare.open({ title: "إرسال الجدول", text, subject: "جدول — ريمبوك", filename: "rimbook-schedule.txt" }); else toast("مركز الإرسال غير متاح");
  };
  window.calSearch = v => { ui.q = v; ui.view = "search"; render(); const box = $("cal-q"); if (box) { box.focus(); box.setSelectionRange(v.length, v.length); } };
  window.calWeekStart = v => { const r = Cal.setWeekStart(store, Number(v)); if (r.ok && commit(r.store)) render(); };

  /* ---------------- item modal ---------------- */
  const closeModal = () => document.getElementById("rimbook-cal-modal")?.remove();
  const partySuggestions = () => {
    const names = new Set(store.items.map(i => i.finance.party).filter(Boolean));
    try { (RB.data.projects || []).forEach(p => p && p.name && names.add(String(p.name))); } catch (_) {}     // read-only suggestions
    return [...names].slice(0, 50);
  };
  function openModal(html, id) {
    closeModal();
    const modal = document.createElement("div");
    modal.id = "rimbook-cal-modal";
    modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    modal.style.cssText = "position:fixed;inset:0;z-index:10050;background:#000a;display:flex;align-items:center;justify-content:center;padding:12px";
    modal.innerHTML = '<div class="card" style="width:min(100%,540px);max-height:92vh;overflow:auto;margin:0;background:var(--card)">' + html + '</div>';
    if (id) modal.dataset.item = id;
    document.body.append(modal);
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    return modal;
  }
  window.calOpenItem = function (type, date, id, projectId) {
    const cur = id ? item(id) : null;
    if (id && !cur) return;
    const f = cur ? cur.finance : { mode: "none" };
    const locked = !!(cur && cur.posted);
    const t = cur ? cur.type : type;
    const kinds = Cal.FIN_KINDS;
    const dis = locked ? " disabled" : "";
    openModal(
      '<div class="row" style="justify-content:space-between"><b>' + (cur ? "✏️ تعديل" : "➕ إضافة") + " " + Cal.TYPES[t] + '</b><button type="button" onclick="document.getElementById(\'rimbook-cal-modal\')?.remove()">✕</button></div>' +
      '<input id="ci-type" type="hidden" value="' + t + '">' +
      '<label class="muted" for="ci-title">' + (t === "note" ? "العنوان (اختياري)" : "العنوان") + '</label><input id="ci-title" maxlength="120" value="' + safe(cur ? cur.title : "") + '" style="width:100%;margin:4px 0 8px">' +
      '<div class="grid2"><div><label class="muted" for="ci-date">التاريخ</label><input id="ci-date" type="date" value="' + safe(cur ? cur.date : (date || ui.date)) + '" style="width:100%"></div>' +
      (t === "note" ? "" : '<div><label class="muted" for="ci-time">الوقت (اختياري)</label><input id="ci-time" type="time" value="' + safe(cur ? cur.time : "") + '" style="width:100%"></div>') + '</div>' +
      projectSelect(cur ? cur.projectId : projectId) +
      '<label class="muted" for="ci-remind">🔔 تذكير</label><select id="ci-remind" style="width:100%;margin:4px 0 8px"><option value="">بدون تذكير</option>' +
      Cal.REMIND_MINUTES.map(m => '<option value="' + m + '"' + (cur && cur.remind === m ? " selected" : "") + '>' + REMIND_LABELS[m] + '</option>').join("") + '</select>' +
      '<label class="muted" for="ci-body">التفاصيل</label><textarea id="ci-body" rows="3" maxlength="2000" style="width:100%;margin:4px 0 8px">' + safe(cur ? cur.body : "") + '</textarea>' +
      '<div class="card" style="margin:8px 0"><b>نوع الملاحظة</b>' +
      Object.keys(Cal.MODES).map(m => '<label style="display:block;margin:6px 0"><input type="radio" name="ci-mode" value="' + m + '"' + (f.mode === m ? " checked" : "") + dis + ' onchange="calModeChanged()"> ' + Cal.MODES[m] + '</label>').join("") +
      '<p class="muted">الملاحظة المالية تبقى مسودة في التقويم؛ لا تدخل أي دفتر إلا بترحيل صريح منك، ولا تمس حسابات المفكرة أو أجور العمال.</p>' +
      '<div id="ci-fin" style="display:none"><label class="muted" for="ci-kind">نوع العملية</label><select id="ci-kind"' + dis + ' style="width:100%;margin:4px 0 8px">' +
      kinds.map(k => '<option value="' + k + '"' + (f.kind === k ? " selected" : "") + '>' + Core.KINDS[k] + '</option>').join("") + '</select>' +
      '<label class="muted" for="ci-amount">المبلغ</label><input id="ci-amount" inputmode="decimal" dir="ltr"' + dis + ' value="' + (f.amount ? Core.plainMinor(f.amount) : "") + '" placeholder="0.00" style="width:100%;margin:4px 0 8px">' +
      '<label class="muted" for="ci-cat">التصنيف</label><input id="ci-cat" maxlength="40"' + dis + ' value="' + safe(f.category || "") + '" style="width:100%;margin:4px 0 8px">' +
      '<label class="muted" for="ci-party" id="ci-party-label">الجهة أو المشروع</label><input id="ci-party" list="ci-parties" maxlength="60"' + dis + ' value="' + safe(f.party || "") + '" style="width:100%;margin:4px 0 4px">' +
      '<datalist id="ci-parties">' + partySuggestions().map(p => '<option value="' + safe(p) + '">').join("") + '</datalist>' +
      (locked ? '<p class="muted">🔒 رُحِّلت إلى دفتر، فلا تُعدَّل بياناتها المالية من هنا.</p>' : "") + '</div></div>' +
      '<div class="row"><button class="p" type="button" onclick="calSaveItem()">حفظ</button><button type="button" onclick="document.getElementById(\'rimbook-cal-modal\')?.remove()">إلغاء</button></div>',
      id || "");
    calModeChanged();
  };
  function projectSelect(selected) {
    const list = window.RimbookProjects ? window.RimbookProjects.list() : [];
    if (!list.length) return '<input id="ci-project" type="hidden" value="' + safe(selected || "") + '">';
    return '<label class="muted" for="ci-project">📁 المشروع (اختياري)</label><select id="ci-project" style="width:100%;margin:4px 0 8px"><option value="">بدون مشروع</option>' +
      list.map(p => '<option value="' + p.id + '"' + (p.id === selected ? " selected" : "") + '>' + safe(p.name) + '</option>').join("") + '</select>';
  }
  window.calModeChanged = function () {
    const mode = (document.querySelector ? document.querySelector('input[name="ci-mode"]:checked') : null)?.value || window.__calMode || "none";
    const box = $("ci-fin"); if (box) box.style.display = mode === "none" ? "none" : "block";
  };
  const selectedMode = () => {
    const r = document.querySelector ? document.querySelector('input[name="ci-mode"]:checked') : null;
    return (r && r.value) || window.__calMode || "none";
  };
  window.calSaveItem = function () {
    const modal = $("rimbook-cal-modal"); if (!modal) return;
    const mode = selectedMode();
    const finance = { mode };
    if (mode !== "none") {
      const a = val("ci-amount"), amount = a ? Core.parseMinor(a) : null;
      if (a && amount === null) return toast("المبلغ غير صحيح (خانتان عشريتان كحد أقصى)");
      Object.assign(finance, { kind: val("ci-kind"), amount, category: val("ci-cat"), party: val("ci-party") });
    }
    const fields = { type: val("ci-type"), title: val("ci-title"), date: val("ci-date"), time: val("ci-time"), body: val("ci-body"), remind: val("ci-remind"), projectId: val("ci-project"), finance };
    const id = modal.dataset.item;
    const r = id ? Cal.updateItem(store, id, fields) : Cal.createItem(store, fields);
    if (!r.ok) return toast(r.error);
    if (!commit(r.store)) return;
    closeModal(); ui.date = fields.date; toast(id ? "تم حفظ التعديل" : "تمت الإضافة"); render();
  };
  window.calToggleDone = id => { const r = Cal.toggleDone(store, id); if (r.ok && commit(r.store)) render(); };
  window.calDelete = function (id) {
    const cur = item(id); if (!cur) return;
    if (!confirm("حذف «" + (cur.title || "الملاحظة") + "»؟" + (cur.posted ? "\nالقيد المرحَّل في الدفتر لن يتأثر." : ""))) return;
    const r = Cal.deleteItem(store, id);
    if (r.ok && commit(r.store)) { toast("تم الحذف"); render(); }
  };

  /* ---------------- explicit posting to a ledger ---------------- */
  window.calPost = function (id) {
    const cur = item(id); if (!cur) return;
    const prep = Cal.prepareLedgerPost(cur);
    if (!prep.ok) return toast(prep.error);
    if (!ledgers()) return toast("الدفاتر الجانبية غير متاحة");
    const books = ledgers().books();
    if (!books.length) { toast("أنشئ دفتراً جانبياً أولاً"); return go("ledgers"); }
    const r = prep.raw;
    openModal(
      '<div class="row" style="justify-content:space-between"><b>📥 ترحيل إلى دفتر</b><button type="button" onclick="document.getElementById(\'rimbook-cal-modal\')?.remove()">✕</button></div>' +
      '<div class="card"><b>' + Core.KINDS[r.kind] + ' — ' + Core.formatMinor(r.amount) + '</b><br><small class="muted">' + safe(r.date) + (r.party ? " · " + safe(r.party) : "") + (r.category ? " · " + safe(r.category) : "") + '</small></div>' +
      '<label class="muted" for="cp-book">الدفتر</label><select id="cp-book" style="width:100%;margin:4px 0 8px">' + books.map(b => '<option value="' + b.id + '">' + safe(b.name) + '</option>').join("") + '</select>' +
      (r.kind === "receivable" || r.kind === "payable" ? '<label class="muted" style="display:block;margin:6px 0"><input id="cp-cash" type="checkbox"> تحرّك المال فعلاً الآن (قرض نقدي) — اتركه فارغاً للآجل</label>' : "") +
      '<label style="display:block;margin:8px 0"><input id="cp-consent" type="checkbox"> أوافق على تسجيل هذه العملية في الدفتر المختار</label>' +
      '<p class="muted">لن تُسجَّل مرتين: إن ضغطت أكثر من مرة أو أعدت المحاولة فسيُعرف القيد نفسه. سيظهر الأثر في سجل الدفتر.</p>' +
      '<div class="row"><button class="p" type="button" onclick="calPostConfirm()">ترحيل</button><button type="button" onclick="document.getElementById(\'rimbook-cal-modal\')?.remove()">إلغاء</button></div>', id);
  };
  window.calPostConfirm = function () {
    const modal = $("rimbook-cal-modal"); if (!modal) return;
    const id = modal.dataset.item, cur = item(id);
    if (!cur) return;
    if (!$("cp-consent")?.checked) return toast("أكّد موافقتك على التسجيل أولاً");
    const prep = Cal.prepareLedgerPost(cur);
    if (!prep.ok) return toast(prep.error);
    const bookId = val("cp-book");
    const raw = Object.assign({}, prep.raw, { bookId, cashNow: !!$("cp-cash")?.checked });
    let res = ledgers().post(raw);
    if (!res.ok && res.duplicate === "token") {                          // an earlier attempt already reached the ledger: reconcile, don't repeat
      const existing = ledgers().findByToken(bookId, raw.token);
      if (existing) res = { ok: true, entryId: existing };
    }
    if (!res.ok && res.duplicate === "similar" && confirm(res.error + "\nهل تريد تسجيلها مرة ثانية فعلاً؟")) res = ledgers().post(raw, { allowDuplicate: true });
    if (!res.ok) return toast(res.error);
    const marked = Cal.markPosted(store, id, { bookId, entryId: res.entryId });
    if (!marked.ok) return toast("سُجّلت في الدفتر لكن تعذر وسمها هنا: " + marked.error);
    if (!commit(marked.store)) return toast("سُجّلت في الدفتر؛ أعد الترحيل لإكمال الربط ولن تتكرر العملية.");
    closeModal(); toast("تم الترحيل إلى الدفتر"); render();
  };
  window.calUnlink = function (id) {
    const cur = item(id); if (!cur || !cur.posted) return;
    const status = ledgers() ? ledgers().status(cur.posted.bookId, cur.posted.entryId) : "missing";
    const r = Cal.unlinkPosted(store, id, status);
    if (!r.ok) return toast(r.error);
    if (commit(r.store)) { toast("فُكّ الربط؛ يمكنك الترحيل من جديد"); render(); }
  };

  /* ---------------- rendering ---------------- */
  function itemCard(i, withDate) {
    const done = i.type === "task" && i.done;
    let postInfo = "";
    if (i.finance.mode !== "none") {
      const money = i.finance.amount ? Core.formatMinor(i.finance.amount) : "بلا مبلغ";
      if (i.posted) {
        const status = ledgers() ? ledgers().status(i.posted.bookId, i.posted.entryId) : "active";
        postInfo = status === "active"
          ? '<br><small>✅ رُحِّلت إلى دفتر «' + safe(ledgers() ? ledgers().bookName(i.posted.bookId) : "") + '» · ' + money + '</small>'
          : '<br><small>⚠️ أُلغي القيد في الدفتر · </small><button type="button" onclick="calUnlink(\'' + i.id + '\')">فك الربط لإعادة الترحيل</button>';
      } else {
        postInfo = '<br><small>💰 مسودة مالية: ' + Core.KINDS[i.finance.kind] + ' · ' + money + (i.finance.party ? " · " + safe(i.finance.party) : "") + ' · لم تدخل أي حساب</small>' +
          ' <button type="button" onclick="calPost(\'' + i.id + '\')">ترحيل إلى دفتر</button>';
      }
    }
    return '<div class="item" style="' + (done ? "opacity:.6" : "") + '"><span><b style="' + (done ? "text-decoration:line-through" : "") + '">' + (i.type === "task" ? (i.done ? "☑️ " : "⬜ ") : i.type === "appointment" ? "🕘 " : "📝 ") +
      safe(i.title || i.body.slice(0, 60)) + ' ' + finLabel(i) + '</b><br><small class="muted">' + (withDate ? safe(i.date) + " · " : "") + (i.time ? safe(i.time) + " · " : "") + Cal.TYPES[i.type] + (i.projectId && window.RimbookProjects && window.RimbookProjects.name(i.projectId) ? " · 📁 " + safe(window.RimbookProjects.name(i.projectId)) : "") + (i.remind != null ? " · 🔔 " + REMIND_LABELS[i.remind] : "") + (i.title && i.body ? " · " + safe(i.body.slice(0, 80)) : "") + '</small>' + postInfo + '</span>' +
      '<div class="row">' + (i.type === "task" ? '<button type="button" onclick="calToggleDone(\'' + i.id + '\')">' + (i.done ? "تراجع" : "تم") + '</button>' : "") +
      '<button type="button" onclick="calOpenItem(null,null,\'' + i.id + '\')">تعديل</button><button type="button" onclick="calDelete(\'' + i.id + '\')">حذف</button></div></div>';
  }
  const addButtons = date => '<div class="row" style="flex-wrap:wrap;gap:8px"><button type="button" onclick="calShareRange(\'day\')">✉️ أرسل جدول اليوم</button><button type="button" onclick="calShareRange(\'week\')">✉️ أرسل جدول الأسبوع</button><button class="p" type="button" onclick="calOpenItem(\'note\',\'' + date + '\')">📝 ملاحظة</button><button type="button" onclick="calOpenItem(\'appointment\',\'' + date + '\')">🕘 موعد</button><button type="button" onclick="calOpenItem(\'task\',\'' + date + '\')">⬜ مهمة</button></div>';

  function header() {
    const d = ui.date, title = ui.view === "month" ? MONTHS[Number(d.slice(5, 7)) - 1] + " " + d.slice(0, 4)
      : ui.view === "week" ? (() => { const s = Cal.startOfWeek(d, store.settings.weekStart); return Number(s.slice(8)) + " " + MONTHS[Number(s.slice(5, 7)) - 1] + " – " + (() => { const e = Cal.addDays(s, 6); return Number(e.slice(8)) + " " + MONTHS[Number(e.slice(5, 7)) - 1]; })(); })()
      : ui.view === "day" ? dayLabel(d) : "بحث";
    const tab = (v, label) => '<button type="button" class="' + (ui.view === v ? "p" : "") + '" onclick="calSetView(\'' + v + '\')">' + label + '</button>';
    return '<div class="card"><b style="font-size:18px">📆 التقويم</b><p class="muted">مستقل عن المفكرة والأجور. الملاحظات المالية مسودات لا تدخل أي حساب إلا بترحيلك الصريح.</p>' +
      '<div class="row" style="flex-wrap:wrap;gap:6px">' + tab("month", "شهري") + tab("week", "أسبوعي") + tab("day", "يومي") + '</div>' +
      '<div class="row" style="justify-content:space-between;margin-top:8px"><button type="button" onclick="calNav(1)" aria-label="التالي">‹</button><b>' + title + '</b><button type="button" onclick="calNav(-1)" aria-label="السابق">›</button></div>' +
      '<div class="row" style="margin-top:6px"><button type="button" onclick="calToday()">اليوم</button><input id="cal-q" type="search" placeholder="🔍 ابحث في ملاحظاتك" value="' + safe(ui.q) + '" oninput="calSearch(this.value)" style="flex:1"></div></div>';
  }
  function monthView() {
    const ym = ui.date.slice(0, 7), ws = store.settings.weekStart, weeks = Cal.monthGrid(ym, ws);
    const from = weeks[0][0].date, to = weeks[weeks.length - 1][6].date, marks = Cal.dayMarks(store, from, to), today = todayStr();
    const head = Array.from({ length: 7 }, (_, i) => '<div class="muted" style="text-align:center;font-size:12px">' + DAYS[(ws + i) % 7].slice(0, 3) + '</div>').join("");
    const cells = weeks.flat().map(c => {
      const m = marks[c.date];
      return '<button type="button" onclick="calGoDay(\'' + c.date + '\')" aria-label="' + dayLabel(c.date) + '" style="min-height:52px;padding:2px;border-radius:10px;' + (c.inMonth ? "" : "opacity:.4;") + (c.date === today ? "outline:2px solid var(--ac);" : "") + (c.date === ui.date ? "background:var(--ac);color:#fff;" : "") + '">' +
        Number(c.date.slice(8)) + (m ? '<br><small>' + (m.count > 3 ? "●●●+" : "●".repeat(m.count)) + (m.pendingFinance ? "💰" : "") + '</small>' : "") + '</button>';
    }).join("");
    return '<div class="card"><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">' + head + cells + '</div>' +
      '<p class="muted">● عنصر · 💰 ملاحظة مالية لم تُرحَّل</p></div>' +
      '<div class="card"><b>' + dayLabel(ui.date) + '</b>' + (Cal.itemsInRange(store, ui.date, ui.date).map(i => itemCard(i, false)).join("") || '<p class="muted">لا شيء في هذا اليوم.</p>') + addButtons(ui.date) + '</div>';
  }
  function weekView() {
    const start = Cal.startOfWeek(ui.date, store.settings.weekStart), end = Cal.addDays(start, 6), all = Cal.itemsInRange(store, start, end);
    return Array.from({ length: 7 }, (_, i) => {
      const d = Cal.addDays(start, i), list = all.filter(x => x.date === d);
      return '<div class="card"><div class="row" style="justify-content:space-between"><b>' + dayLabel(d) + (d === todayStr() ? " · اليوم" : "") + '</b><button type="button" onclick="calGoDay(\'' + d + '\')">فتح</button></div>' +
        (list.map(x => itemCard(x, false)).join("") || '<small class="muted">فارغ</small>') + '</div>';
    }).join("");
  }
  function dayView() {
    return '<div class="card"><b>' + dayLabel(ui.date) + '</b>' + (Cal.itemsInRange(store, ui.date, ui.date).map(i => itemCard(i, false)).join("") || '<p class="muted">لا شيء في هذا اليوم. أضف ملاحظة لتعود إليها لاحقاً.</p>') + addButtons(ui.date) + '</div>';
  }
  function searchView() {
    const found = Cal.search(store, ui.q);
    return '<div class="card"><b>نتائج البحث (' + found.length + ')</b>' + (found.map(i => itemCard(i, true)).join("") || '<p class="muted">لا نتائج.</p>') + '</div>';
  }
  function backupCard() {
    return '<div class="card"><b>🗄️ نسخ احتياطي للتقويم</b><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button type="button" onclick="calExport()">⬇️ تصدير</button><button type="button" onclick="calPickImport()">⬆️ استيراد</button>' +
      (localStorage.getItem(PREV) ? '<button type="button" onclick="calUndoImport()">↩️ تراجع عن آخر استيراد</button>' : "") + '</div>' +
      '<input id="cal-file" type="file" accept="application/json,.json" hidden onchange="calImportFile(this)">' +
      '<label class="muted" for="cal-ws" style="display:block;margin-top:8px">بداية الأسبوع</label><select id="cal-ws" onchange="calWeekStart(this.value)"><option value="6"' + (store.settings.weekStart === 6 ? " selected" : "") + '>السبت</option><option value="0"' + (store.settings.weekStart === 0 ? " selected" : "") + '>الأحد</option><option value="1"' + (store.settings.weekStart === 1 ? " selected" : "") + '>الاثنين</option></select></div>';
  }
  function alarmsCard() {
    return '<div class="card"><b>🔔 التنبيهات</b><div id="cal-alarm-box" class="muted">جارٍ فحص حالة التنبيهات…</div>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button type="button" onclick="calAlarmAction(\'notifications\')">السماح بالإشعارات</button>' +
      '<button type="button" onclick="calAlarmAction(\'exact\')">السماح بالمنبهات الدقيقة</button><button type="button" onclick="calAlarmAction(\'test\')">اختبار بعد 15 ثانية</button></div>' +
      '<label class="muted" for="cal-hour" style="display:block;margin-top:8px">ساعة تذكير العناصر بلا وقت</label><select id="cal-hour" onchange="calAllDayHour(this.value)">' +
      Array.from({ length: 24 }, (_, h) => '<option value="' + h + '"' + (h === (Number.isInteger(store.settings.allDayHour) ? store.settings.allDayHour : 9) ? " selected" : "") + '>' + String(h).padStart(2, "0") + ':00</option>').join("") + '</select>' +
      '<p class="muted">لتعمل التنبيهات عند إغلاق التطبيق: اسمح بالإشعارات وبالمنبهات الدقيقة. إن أوقفت التطبيق بالقوة من إعدادات النظام فلن يرن حتى تفتحه مرة أخرى (قيد من أندرويد).</p></div>';
  }
  async function fillAlarmBox() {
    const box = $("cal-alarm-box"); if (!box || !window.RimbookAlarms) return;
    const s = await window.RimbookAlarms.status();
    const parts = [];
    parts.push(s.native ? "التطبيق على أندرويد: تعمل التنبيهات حتى لو أُغلق التطبيق." : "أنت في المتصفح: التنبيهات تعمل والصفحة مفتوحة فقط.");
    parts.push(s.notificationsEnabled ? "✅ الإشعارات مسموحة" : "❌ الإشعارات غير مسموحة");
    if (s.native) parts.push(s.exactAllowed ? "✅ المنبهات الدقيقة مسموحة" : "⚠️ المنبهات الدقيقة غير مسموحة: قد يتأخر التنبيه بضع دقائق");
    if (typeof s.pending === "number") parts.push("تنبيهات مجدولة: " + s.pending);
    if (window.RimbookAlarms.lastError) parts.push("آخر خطأ: " + safe(window.RimbookAlarms.lastError));
    box.innerHTML = parts.map(p => "<div>" + p + "</div>").join("");
  }
  window.calAlarmAction = async function (kind) {
    const A = window.RimbookAlarms; if (!A) return;
    try {
      if (kind === "notifications") { await A.requestNotifications(); }
      else if (kind === "exact") { await A.openExactAlarmSettings(); }
      else if (kind === "test") {
        const s = await A.status();
        if (!s.notificationsEnabled) return toast("اسمح بالإشعارات أولاً");
        await A.testIn(15); toast("سيصلك تنبيه تجريبي بعد 15 ثانية. أغلق التطبيق لتتأكد أنه يعمل.");
      }
    } catch (e) { toast("تعذر تنفيذ الطلب: " + String((e && e.message) || e)); }
    fillAlarmBox();
  };
  window.calAllDayHour = v => { const r = Cal.setAllDayHour(store, Number(v)); if (r.ok && commit(r.store)) toast("تم حفظ ساعة التذكير"); };
  VIEWS.calendar = function () {
    const body = ui.view === "month" ? monthView() : ui.view === "week" ? weekView() : ui.view === "day" ? dayView() : searchView();
    setTimeout(fillAlarmBox, 0);
    return header() + body + alarmsCard() + backupCard();
  };

  /* ---------------- backup ---------------- */
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  window.calExport = () => { download("rimbook-calendar-" + todayStr() + ".json", JSON.stringify(Cal.makeEnvelope(store))); toast("تم تجهيز ملف النسخة الاحتياطية"); };
  window.calPickImport = () => $("cal-file")?.click();
  window.calImportFile = function (input) {
    const file = input.files && input.files[0]; input.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast("تعذر قراءة الملف");
    reader.onload = () => {
      let env; try { env = JSON.parse(String(reader.result)); } catch (_) { return toast("الملف ليس بصيغة صحيحة"); }
      const ver = Cal.verifyEnvelope(env);
      if (!ver.ok) return toast(ver.error);
      const replace = confirm("ملف سليم فيه " + ver.data.items.length + " عنصر.\n\nموافق = استبدال التقويم الحالي (تُحفظ نسخة للتراجع).\nإلغاء = الاحتفاظ بالحالي وإضافة المستورد.");
      if (!replace && !confirm("إضافة العناصر المستوردة إلى تقويمك الحالي؟")) return;
      const r = Cal.importEnvelope(store, env, replace ? "replace" : "append");
      if (!r.ok) return toast(r.error);
      try { localStorage.setItem(PREV, JSON.stringify(store)); } catch (_) { if (replace && !confirm("تعذر حفظ نسخة التراجع. المتابعة بالاستبدال؟")) return; }
      if (commit(r.store)) { toast(replace ? "تمت الاستعادة" : "تم الاستيراد"); render(); }
    };
    reader.readAsText(file);
  };
  window.calUndoImport = function () {
    try {
      const prev = JSON.parse(localStorage.getItem(PREV) || "null");
      if (!prev || !Cal.validateStore(prev).ok) return toast("لا توجد نسخة صالحة للتراجع");
      if (!confirm("التراجع إلى حالة التقويم قبل آخر استيراد؟")) return;
      if (commit(prev)) { localStorage.removeItem(PREV); toast("تم التراجع"); render(); }
    } catch (_) { toast("تعذر التراجع"); }
  };

  /* ---------------- API for other add-ons and the unified backup ---------------- */
  window.RimbookCalendar = {
    itemsForProject: (projectId, limit) => store.items.filter(i => !i.deletedAt && i.projectId === projectId).sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit || 20),
    openItem: (type, date, projectId) => window.calOpenItem(type, date || todayStr(), null, projectId),
    agendaText: (from, to, opts) => Cal.agendaText(store, from, to, opts)
  };
  window.RimbookData = window.RimbookData || {};
  window.RimbookData.calendar = {
    label: "التقويم والملاحظات",
    export: () => Cal.makeEnvelope(store), verify: env => Cal.verifyEnvelope(env),
    import(env, mode) { const r = Cal.importEnvelope(store, env, mode); if (!r.ok) return r; return commit(r.store) ? { ok: true } : { ok: false, error: "تعذر الحفظ" }; },
    snapshot: () => JSON.stringify(store),
    restore(json) { try { const s = JSON.parse(json); return Cal.validateStore(s).ok && commit(s) ? { ok: true } : { ok: false, error: "نسخة غير صالحة" }; } catch (_) { return { ok: false, error: "نسخة غير صالحة" }; } },
    count: () => store.items.length
  };

  /* ---------------- registration ---------------- */
  if (window.RimbookAlarms) setTimeout(() => window.RimbookAlarms.syncFromCalendar(store), 1500);
  if (typeof document.addEventListener === "function") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && window.RimbookAlarms) window.RimbookAlarms.syncFromCalendar(store); });
  TABS.calendar = ["📆", "التقويم"];
  const baseMore = VIEWS.more;
  if (typeof baseMore === "function") {
    VIEWS.more = function () {
      return baseMore() + '<div class="card"><b>التقويم</b><p class="muted">شهري وأسبوعي ويومي، مستقل عن المفكرة.</p><button class="card" type="button" style="min-height:76px;text-align:right;width:100%" onclick="go(\'calendar\')"><b>📆 التقويم والملاحظات</b></button></div>';
    };
  }
  render();
})();
