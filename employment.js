/* Rimbook employment add-on UI — own storage key `rimbook_employment_v1`.
   Employers, workers and employments each keep an independent archive. It never reads or writes the main workers/payroll data. */
(function () {
  "use strict";
  const E = window.RimbookEmploymentCore, L = window.RimbookLedgerCore;
  if (!E || !L) return;
  const KEY = "rimbook_employment_v1", PREV = "rimbook_employment_prev";
  const $ = id => document.getElementById(id);
  const val = id => ($(id)?.value || "").trim();
  const safe = v => esc(String(v ?? ""));
  const todayStr = () => iso(new Date());
  const ui = { screen: "home", id: null };
  let store = load();

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
      if (!raw) return E.emptyStore();
      const parsed = JSON.parse(raw);
      if (E.validateStore(parsed).ok) return parsed;
    } catch (_) { /* keep the damaged text aside */ }
    try { if (raw) localStorage.setItem(KEY + "_corrupt_" + Date.now(), raw); } catch (_) {}
    setTimeout(() => toast("بيانات علاقات العمل تالفة؛ حُفظت نسخة منها. استعد من ملف نسخة احتياطية."), 800);
    return E.emptyStore();
  }
  function commit(next) {
    try {
      const json = JSON.stringify(next);
      localStorage.setItem(KEY, json);
      if (localStorage.getItem(KEY) !== json) throw new Error("readback");
      store = next; return true;
    } catch (_) { toast("تعذر الحفظ؛ لم يُسجَّل التغيير. تحقق من مساحة التخزين."); return false; }
  }
  const byId = (list, id) => list.find(x => x.id === id);
  const employer = id => byId(store.employers, id), person = id => byId(store.people, id), employment = id => byId(store.employments, id);
  const cur = m => { const e = employer(m.employerId); return e && e.currency ? " " + safe(e.currency) : ""; };
  const money = (v, m) => L.formatMinor(v) + cur(m);
  const isWorkerMode = () => !!(RB.data.profile && RB.data.profile.role === "worker");
  const can = (m, perm) => !isWorkerMode() || m.perms[perm];                 // UI visibility only: this is a local convenience, not a security boundary

  window.empGo = (screen, id) => { ui.screen = screen; ui.id = id || null; render(); };
  const closeModal = () => document.getElementById("rimbook-emp-modal")?.remove();
  function openModal(html, key) {
    closeModal();
    const modal = document.createElement("div");
    modal.id = "rimbook-emp-modal";
    modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    modal.dataset.key = key || "";
    modal.style.cssText = "position:fixed;inset:0;z-index:10060;background:#000a;display:flex;align-items:center;justify-content:center;padding:12px";
    modal.innerHTML = '<div class="card" style="width:min(100%,540px);max-height:92vh;overflow:auto;margin:0;background:var(--card)">' + html + '</div>';
    document.body.append(modal);
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    return modal;
  }
  const head = title => '<div class="row" style="justify-content:space-between"><b>' + title + '</b><button type="button" onclick="document.getElementById(\'rimbook-emp-modal\')?.remove()">✕</button></div>';
  const apply = (r, okMsg) => { if (!r.ok) { toast(r.error); return false; } if (!commit(r.store)) return false; if (okMsg) toast(okMsg); render(); return true; };

  /* ---------------- employers & people ---------------- */
  window.empAddEmployer = function () {
    if (apply(E.addEmployer(store, { name: val("emp-ename"), currency: val("emp-ecur") || (RB.data.settings && RB.data.settings.currency) || "" }), "تمت إضافة الجهة")) { /* rendered */ }
  };
  window.empAddPerson = function () { apply(E.addPerson(store, { name: val("emp-pname"), phone: val("emp-pphone") }), "تمت إضافة العامل"); };
  window.empArchiveEmployer = function (id, archived) {
    if (archived && !confirm("أرشفة الجهة تخفيها دون حذف سجلاتها. متابعة؟")) return;
    if (apply(E.archiveEmployer(store, id, archived)) && archived) { ui.screen = "home"; render(); }
  };

  /* ---------------- start / move / end ---------------- */
  const permsBoxes = (p, prefix) => ['seeWage|يستطيع العامل رؤية الأجر', 'seeBalance|يستطيع العامل رؤية رصيده', 'addHours|يستطيع العامل تسجيل ساعاته بنفسه'].map(x => {
    const [k, label] = x.split("|");
    return '<label style="display:block;margin:4px 0"><input type="checkbox" id="' + prefix + k + '"' + (p[k] ? " checked" : "") + '> ' + label + '</label>';
  }).join("");
  const readPerms = prefix => ({ seeWage: !!$(prefix + "seeWage")?.checked, seeBalance: !!$(prefix + "seeBalance")?.checked, addHours: !!$(prefix + "addHours")?.checked });
  const wageFields = (prefix, d) => '<label class="muted" for="' + prefix + 'type">نوع الأجر</label><select id="' + prefix + 'type" style="width:100%;margin:4px 0 8px">' +
    Object.keys(E.WAGE_TYPES).map(k => '<option value="' + k + '"' + (d.wageType === k ? " selected" : "") + '>' + E.WAGE_TYPES[k] + '</option>').join("") + '</select>' +
    '<label class="muted" for="' + prefix + 'wage">الأجر (لليوم أو للساعة أو للشهر)</label><input id="' + prefix + 'wage" inputmode="decimal" dir="ltr" placeholder="0.00" style="width:100%;margin:4px 0 8px">' +
    '<label class="muted" for="' + prefix + 'hours">ساعات الدوام اليومي (اختياري)</label><input id="' + prefix + 'hours" inputmode="decimal" dir="ltr" placeholder="8" style="width:100%;margin:4px 0 8px">';
  window.empOpenStart = function (employerId, personId) {
    const e = employer(employerId); if (!e) return;
    const opts = store.people.map(p => '<option value="' + p.id + '"' + (p.id === personId ? " selected" : "") + '>' + safe(p.name) + '</option>').join("");
    openModal(head("➕ علاقة عمل جديدة — " + safe(e.name)) +
      '<label class="muted" for="es-person">العامل</label><select id="es-person" style="width:100%;margin:4px 0 8px"><option value="">— اختر —</option>' + opts + '</select>' +
      '<input id="es-newname" maxlength="60" placeholder="أو اكتب اسم عامل جديد" style="width:100%;margin:4px 0 8px">' +
      wageFields("es-", { wageType: "daily" }) +
      '<label class="muted" for="es-start">تاريخ البدء</label><input id="es-start" type="date" value="' + todayStr() + '" style="width:100%;margin:4px 0 8px">' +
      '<div class="card" style="margin:8px 0"><b>صلاحيات هذه العلاقة</b>' + permsBoxes({ seeWage: true, seeBalance: true, addHours: false }, "es-p-") +
      '<p class="muted">الصلاحيات تتحكم بما يظهر للعامل في التطبيق على هذا الجهاز، وليست حماية أمنية: من يملك الجهاز أو النسخة الاحتياطية يرى البيانات.</p></div>' +
      '<div class="row"><button class="p" type="button" onclick="empSaveStart(\'' + e.id + '\')">بدء علاقة العمل</button></div>');
  };
  const amountOrNull = id => { const t = val(id); return t ? L.parseMinor(t) : undefined; };
  window.empSaveStart = function (employerId) {
    let personId = val("es-person"), working = store;
    const newName = val("es-newname");
    if (!personId && newName) {
      const r = E.addPerson(store, { name: newName }); if (!r.ok) return toast(r.error);
      working = r.store; personId = r.person.id;
    }
    const wage = amountOrNull("es-wage");
    if (wage === undefined || wage === null) return toast("أدخل أجراً صحيحاً (خانتان عشريتان كحد أقصى)");
    const r = E.startEmployment(working, { employerId, personId, wageType: val("es-type"), wage, startDate: val("es-start"), normalHours: val("es-hours") || null, perms: readPerms("es-p-") });
    if (!r.ok) return toast(r.error);
    if (!commit(r.store)) return;
    closeModal(); toast("بدأت علاقة العمل"); ui.screen = "employment"; ui.id = r.employment.id; render();
  };
  window.empOpenEnd = function (id) {
    const m = employment(id); if (!m || m.endDate) return;
    const s = E.summarizeEmployment(store, id);
    openModal(head("⏹️ إنهاء علاقة العمل") +
      '<p class="muted">المتبقي حالياً: <b>' + money(s.balance, m) + '</b>. تبقى سجلاته كاملة في أرشيف هذه الجهة، ويمكنك تسجيل دفعات لاحقة لتصفية المستحقات.</p>' +
      '<label class="muted" for="ee-date">تاريخ الانتهاء</label><input id="ee-date" type="date" value="' + todayStr() + '" min="' + safe(s.lastDate || m.startDate) + '" style="width:100%;margin:4px 0 8px">' +
      '<label class="muted" for="ee-reason">السبب (اختياري)</label><input id="ee-reason" maxlength="200" style="width:100%;margin:4px 0 8px">' +
      '<div class="row"><button class="p" type="button" onclick="empSaveEnd(\'' + id + '\')">إنهاء</button><button type="button" onclick="document.getElementById(\'rimbook-emp-modal\')?.remove()">إلغاء</button></div>');
  };
  window.empSaveEnd = function (id) {
    if (!confirm("إنهاء علاقة العمل؟ لن يمكن إضافة أيام عمل بعد تاريخ الانتهاء.")) return;
    const r = E.endEmployment(store, id, { endDate: val("ee-date"), reason: val("ee-reason") });
    if (!r.ok) return toast(r.error);
    if (!commit(r.store)) return;
    closeModal(); toast(r.balance > 0 ? "انتهت العلاقة، وبقي مستحق للعامل في الأرشيف" : "انتهت علاقة العمل"); render();
  };
  window.empOpenMove = function (personId) {
    const p = person(personId); if (!p) return;
    const active = store.employments.filter(m => m.personId === personId && !m.endDate);
    const employers = store.employers.filter(e => !e.archived);
    if (!active.length) return toast("لا توجد علاقة عمل مفتوحة لنقلها. ابدأ علاقة جديدة من صفحة الجهة.");
    openModal(head("🔀 نقل " + safe(p.name) + " إلى جهة أخرى") +
      '<p class="muted">تُنهى العلاقة الحالية بسجلاتها ومستحقاتها كما هي، وتبدأ علاقة جديدة مستقلة. لا يُنقل أو يُدمج أي سجل.</p>' +
      '<label class="muted" for="em-from">العلاقة الحالية</label><select id="em-from" style="width:100%;margin:4px 0 8px">' + active.map(m => '<option value="' + m.id + '">' + safe((employer(m.employerId) || {}).name) + '</option>').join("") + '</select>' +
      '<label class="muted" for="em-end">تاريخ انتهاء العلاقة الحالية</label><input id="em-end" type="date" value="' + todayStr() + '" style="width:100%;margin:4px 0 8px">' +
      '<label class="muted" for="em-to">الجهة الجديدة</label><select id="em-to" style="width:100%;margin:4px 0 8px">' + employers.map(e => '<option value="' + e.id + '">' + safe(e.name) + '</option>').join("") + '</select>' +
      wageFields("em-", { wageType: "daily" }) +
      '<label class="muted" for="em-start">تاريخ بدء العلاقة الجديدة</label><input id="em-start" type="date" value="' + todayStr() + '" style="width:100%;margin:4px 0 8px">' +
      '<div class="card" style="margin:8px 0"><b>صلاحيات العلاقة الجديدة</b>' + permsBoxes({ seeWage: true, seeBalance: true, addHours: false }, "em-p-") + '</div>' +
      '<div class="row"><button class="p" type="button" onclick="empSaveMove()">نقل</button></div>');
  };
  window.empSaveMove = function () {
    const wage = amountOrNull("em-wage");
    if (wage === undefined || wage === null) return toast("أدخل أجراً صحيحاً");
    if (!confirm("تأكيد النقل؟ ستُنهى العلاقة الحالية وتبدأ علاقة جديدة مستقلة.")) return;
    const r = E.moveWorker(store, { fromEmploymentId: val("em-from"), endDate: val("em-end"), toEmployerId: val("em-to"),
      next: { wageType: val("em-type"), wage, startDate: val("em-start"), normalHours: val("em-hours") || null, perms: readPerms("em-p-") } });
    if (!r.ok) return toast(r.error);
    if (!commit(r.store)) return;
    closeModal(); toast(r.balanceLeft > 0 ? "تم النقل. المستحق السابق محفوظ في أرشيف الجهة القديمة." : "تم النقل"); ui.screen = "employment"; ui.id = r.employment.id; render();
  };
  window.empOpenWage = function (id) {
    const m = employment(id); if (!m || m.endDate) return;
    openModal(head("💲 تغيير الأجر") + '<p class="muted">الأجر الحالي: ' + money(E.wageOn(m, todayStr()), m) + '. التغيير يسري من تاريخ لاحق لآخر يوم مسجَّل ولا يغيّر ما حُسب سابقاً.</p>' +
      '<label class="muted" for="ew-wage">الأجر الجديد</label><input id="ew-wage" inputmode="decimal" dir="ltr" style="width:100%;margin:4px 0 8px">' +
      '<label class="muted" for="ew-from">يسري من</label><input id="ew-from" type="date" value="' + todayStr() + '" style="width:100%;margin:4px 0 8px">' +
      '<div class="row"><button class="p" type="button" onclick="empSaveWage(\'' + id + '\')">حفظ</button></div>');
  };
  window.empSaveWage = function (id) {
    const wage = amountOrNull("ew-wage");
    if (wage === undefined || wage === null) return toast("أدخل أجراً صحيحاً");
    if (apply(E.changeWage(store, id, { from: val("ew-from"), wage }), "تم تغيير الأجر")) closeModal();
  };
  window.empSavePerms = function (id) { apply(E.setPerms(store, id, readPerms("ep-")), "تم حفظ الصلاحيات"); };

  /* ---------------- entries ---------------- */
  window.empOpenEntry = function (employmentId, kind) {
    const m = employment(employmentId); if (!m) return;
    // a worker who may add his own hours can only add work days/hours; managers get every kind
    const allowed = Object.keys(E.KINDS).filter(k => k !== "reversal" && !(m.wageType === "monthly" && k === "work") && !(m.wageType !== "monthly" && k === "salary"))
      .filter(k => !isWorkerMode() || k === "work");
    const token = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const modal = openModal(head("➕ قيد — " + safe((person(m.personId) || {}).name) + " · " + safe((employer(m.employerId) || {}).name)) +
      '<label class="muted" for="en-kind">النوع</label><select id="en-kind" onchange="empEntryKind()" style="width:100%;margin:4px 0 8px">' + allowed.map(k => '<option value="' + k + '"' + (k === kind ? " selected" : "") + '>' + E.KINDS[k] + '</option>').join("") + '</select>' +
      '<label class="muted" for="en-date">التاريخ</label><input id="en-date" type="date" value="' + safe(m.endDate && todayStr() > m.endDate ? m.endDate : todayStr()) + '" style="width:100%;margin:4px 0 8px">' +
      '<div id="en-month-box" style="display:none"><label class="muted" for="en-month">شهر الراتب</label><input id="en-month" type="month" value="' + todayStr().slice(0, 7) + '" style="width:100%;margin:4px 0 8px"></div>' +
      '<div id="en-hours-box" style="display:none"><label class="muted" for="en-hours">عدد الساعات</label><input id="en-hours" inputmode="decimal" dir="ltr" placeholder="8" style="width:100%;margin:4px 0 8px"></div>' +
      '<label class="muted" for="en-amount">المبلغ <span id="en-hint"></span></label><input id="en-amount" inputmode="decimal" dir="ltr" placeholder="يُحسب من الأجر إن تُرك فارغاً" style="width:100%;margin:4px 0 8px">' +
      '<label class="muted" for="en-note">ملاحظة</label><input id="en-note" maxlength="300" style="width:100%;margin:4px 0 8px">' +
      '<div class="row"><button class="p" type="button" onclick="empSaveEntry()">حفظ</button><button type="button" onclick="document.getElementById(\'rimbook-emp-modal\')?.remove()">إلغاء</button></div>', employmentId);
    modal.dataset.token = token; empEntryKind();
  };
  window.empEntryKind = function () {
    const k = val("en-kind"); if (!$("en-month-box")) return;
    $("en-month-box").style.display = k === "salary" ? "block" : "none";
    const m = employment($("rimbook-emp-modal")?.dataset.key);
    $("en-hours-box").style.display = m && m.wageType === "hourly" && k === "work" ? "block" : "none";
  };
  window.empSaveEntry = function (allowDuplicate) {
    const modal = $("rimbook-emp-modal"); if (!modal) return;
    const hoursText = val("en-hours"); let hours100;
    if (hoursText) { const d = L.parseDecimal(hoursText); if (d === null || d % (10n ** 10n) !== 0n) return toast("الساعات: خانتان عشريتان كحد أقصى"); hours100 = Number(d / (10n ** 10n)); }
    const amountText = val("en-amount"); let amount;
    if (amountText) { amount = L.parseMinor(amountText); if (amount === null) return toast("المبلغ غير صحيح (خانتان عشريتان كحد أقصى)"); }
    const raw = { employmentId: modal.dataset.key, kind: val("en-kind"), date: val("en-date"), month: val("en-month"), hours100, amount, note: val("en-note"), token: modal.dataset.token };
    const r = E.addEntry(store, raw, { allowDuplicate: allowDuplicate === true });
    if (!r.ok) {
      if (r.duplicate === "token") { closeModal(); render(); return toast("سُجّلت هذه العملية من قبل"); }
      if (r.duplicate === "similar" && confirm(r.error + "\nتسجيلها مرة ثانية فعلاً؟")) return empSaveEntry(true);
      return toast(r.error);
    }
    if (!commit(r.store)) return;
    closeModal(); toast(r.entry.manual ? "تم التسجيل (مبلغ يدوي يختلف عن حساب الأجر)" : "تم التسجيل"); render();
  };
  window.empReverse = function (id) {
    const reason = prompt("سبب إلغاء القيد (اختياري). لا يُحذف القيد؛ يُضاف قيد إلغاء ويبقى الأثر:", "");
    if (reason === null) return;
    apply(E.reverseEntry(store, id, { reason, today: todayStr() }), "تم إلغاء القيد");
  };

  /* ---------------- screens ---------------- */
  const card = (label, v, m, style) => '<div class="card"><small class="muted">' + label + '</small><h3 style="' + (style || "") + '">' + money(v, m) + '</h3></div>';
  function employmentRow(d, showEmployer) {
    const m = d.employment, s = d.summary, active = E.isActive(m, todayStr()) && !m.endDate;
    return '<button class="card" type="button" style="text-align:right;width:100%" onclick="empGo(\'employment\',\'' + m.id + '\')"><b>' + safe(showEmployer ? (d.employer || {}).name : (d.person || {}).name) + '</b> ' + (active ? "🟢" : "⚪ منتهية") +
      '<br><small class="muted">' + safe(m.startDate) + ' ← ' + safe(m.endDate || "مستمرة") + ' · ' + E.WAGE_TYPES[m.wageType] +
      (can(m, "seeBalance") ? ' · ' + (s.balance >= 0 ? "المتبقي للعامل " : "على العامل ") + money(Math.abs(s.balance), m) : "") + '</small></button>';
  }
  function homeScreen() {
    const employers = store.employers.filter(e => !e.archived), archived = store.employers.filter(e => e.archived);
    return '<div class="card"><b style="font-size:18px">🏢 جهات العمل والعاملون</b><p class="muted">لكل علاقة عمل أجرها وفترتها وصلاحياتها وسجلاتها المستقلة. عند انتقال عامل إلى جهة أخرى تبقى سجلاته القديمة ومستحقاته كما هي في أرشيف الجهة السابقة، ولا تختلط. مستقل عن المفكرة وأجور العمال.</p></div>' +
      '<div class="card"><b>الجهات</b>' + (employers.map(e => {
        const list = E.archiveByEmployer(store, e.id), open = list.filter(d => !d.employment.endDate).length;
        return '<button class="card" type="button" style="text-align:right;width:100%" onclick="empGo(\'employer\',\'' + e.id + '\')"><b>🏢 ' + safe(e.name) + '</b><br><small class="muted">علاقات مفتوحة: ' + open + ' · الكل: ' + list.length + '</small></button>';
      }).join("") || '<p class="muted">لا توجد جهات بعد.</p>') +
      '<div class="grid2"><input id="emp-ename" maxlength="60" placeholder="اسم الجهة أو الشركة" style="width:100%"><input id="emp-ecur" maxlength="8" placeholder="العملة" style="width:100%"></div><button class="p" type="button" style="margin-top:8px" onclick="empAddEmployer()">➕ إضافة جهة</button></div>' +
      '<div class="card"><b>العاملون</b>' + (store.people.map(p => {
        const list = E.archiveByPerson(store, p.id);
        return '<button class="card" type="button" style="text-align:right;width:100%" onclick="empGo(\'person\',\'' + p.id + '\')"><b>👷 ' + safe(p.name) + '</b><br><small class="muted">علاقات عمل: ' + list.length + '</small></button>';
      }).join("") || '<p class="muted">لا يوجد عاملون بعد.</p>') +
      '<div class="grid2"><input id="emp-pname" maxlength="60" placeholder="اسم العامل" style="width:100%"><input id="emp-pphone" maxlength="30" placeholder="الهاتف (اختياري)" style="width:100%"></div><button class="p" type="button" style="margin-top:8px" onclick="empAddPerson()">➕ إضافة عامل</button></div>' +
      backupCard() + (archived.length ? '<div class="card"><b>جهات مؤرشفة</b>' + archived.map(e => '<div class="item"><span>' + safe(e.name) + '</span><span class="row"><button type="button" onclick="empGo(\'employer\',\'' + e.id + '\')">فتح</button><button type="button" onclick="empArchiveEmployer(\'' + e.id + '\',false)">استرجاع</button></span></div>').join("") + '</div>' : "");
  }
  function employerScreen() {
    const e = employer(ui.id); if (!e) return homeScreen();
    const list = E.archiveByEmployer(store, e.id);
    return '<div class="card"><div class="row" style="justify-content:space-between"><button type="button" onclick="empGo(\'home\')">→ الرجوع</button>' +
      (e.archived ? "" : '<button type="button" onclick="empArchiveEmployer(\'' + e.id + '\',true)">أرشفة</button>') + '</div><h2>🏢 ' + safe(e.name) + '</h2><p class="muted">أرشيف هذه الجهة وحدها' + (e.currency ? " · العملة " + safe(e.currency) : "") + '</p>' +
      (e.archived ? "" : '<button class="p" type="button" style="width:100%;min-height:46px" onclick="empOpenStart(\'' + e.id + '\')">➕ علاقة عمل جديدة</button>') + '</div>' +
      '<div class="card"><b>علاقات العمل (' + list.length + ')</b>' + (list.map(d => employmentRow(d, false)).join("") || '<p class="muted">لا توجد علاقات.</p>') + '</div>' +
      '<div class="card"><b>أرشيف الجهة</b><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button type="button" onclick="empExport(\'employer\',\'' + e.id + '\')">⬇️ تصدير أرشيف الجهة</button></div></div>';
  }
  function personScreen() {
    const p = person(ui.id); if (!p) return homeScreen();
    const list = E.archiveByPerson(store, p.id);
    return '<div class="card"><button type="button" onclick="empGo(\'home\')">→ الرجوع</button><h2>👷 ' + safe(p.name) + '</h2>' + (p.phone ? '<p class="muted">' + safe(p.phone) + '</p>' : "") +
      '<div class="row" style="flex-wrap:wrap;gap:8px"><button class="p" type="button" onclick="empOpenMove(\'' + p.id + '\')">🔀 نقل إلى جهة أخرى</button><button type="button" onclick="empShare(\'person\',\'' + p.id + '\')">📤 ملف العامل (كشوف مستقلة)</button><button type="button" onclick="empExport(\'person\',\'' + p.id + '\')">⬇️ تصدير ملف العامل</button></div></div>' +
      '<div class="card"><b>تاريخ العمل (كل جهة على حدة)</b><p class="muted">لا تُجمع مبالغ الجهات المختلفة لأن عملاتها وشروطها مستقلة.</p>' + (list.map(d => employmentRow(d, true)).join("") || '<p class="muted">لا توجد علاقات عمل. ابدأ من صفحة جهة.</p>') + '</div>';
  }
  const ACTION = { employment_start: "بدء علاقة", employment_end: "إنهاء علاقة", wage_change: "تغيير أجر", entry_add: "إضافة قيد", entry_reverse: "إلغاء قيد", perms_change: "تغيير صلاحيات" };
  function employmentScreen() {
    const m = employment(ui.id); if (!m) return homeScreen();
    const p = person(m.personId) || {}, e = employer(m.employerId) || {}, s = E.summarizeEmployment(store, m.id);
    const reversed = new Set(store.entries.filter(x => x.kind === "reversal").map(x => x.reverses));
    const rows = store.entries.filter(x => x.employmentId === m.id).slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 150).map(x => {
      const gone = reversed.has(x.id), isRev = x.kind === "reversal";
      return '<div class="item" style="' + (gone ? "opacity:.5;text-decoration:line-through" : "") + '"><span><b>' + E.KINDS[x.kind] + (x.kind === "salary" ? " " + safe(x.month) : "") + (x.amount && (can(m, "seeWage") || ["payment", "advance"].includes(x.kind)) ? " — " + money(x.amount, m) : "") + '</b><br><small class="muted">' + safe(x.date) +
        (x.hours100 ? " · " + L.formatMinor(x.hours100) + " ساعة" : "") + (x.manual ? " · مبلغ يدوي" : "") + (x.note ? " · " + safe(x.note) : "") + (gone ? " · مُلغى" : "") + '</small></span>' +
        (!gone && !isRev && !isWorkerMode() ? '<button type="button" onclick="empReverse(\'' + x.id + '\')">إلغاء القيد</button>' : "") + '</div>';
    }).join("");
    const active = !m.endDate;
    const quick = (k, label) => '<button type="button" onclick="empOpenEntry(\'' + m.id + '\',\'' + k + '\')">' + label + '</button>';
    const kinds = m.wageType === "monthly" ? [["salary", "💼 راتب شهر"]] : [["work", "🧱 يوم عمل"]];
    const auditRows = store.audit.filter(a => a.refs && a.refs.employmentId === m.id).slice(-30).reverse().map(a =>
      '<div class="item"><span><b>' + (ACTION[a.action] || safe(a.action)) + '</b><br><small class="muted">' + safe(new Date(a.t).toLocaleString("ar")) + (a.detail && a.detail.amount ? " · " + L.formatMinor(a.detail.amount) : "") + (a.detail && a.detail.reason ? " · " + safe(a.detail.reason) : "") + '</small></span></div>').join("");
    const canManage = !isWorkerMode();
    return '<div class="card"><div class="row" style="justify-content:space-between"><button type="button" onclick="empGo(\'employer\',\'' + e.id + '\')">→ ' + safe(e.name) + '</button><button type="button" onclick="empGo(\'person\',\'' + p.id + '\')">👷 ' + safe(p.name) + '</button></div>' +
      '<h2>' + safe(p.name) + ' · ' + safe(e.name) + '</h2><p class="muted">' + safe(m.startDate) + ' ← ' + safe(m.endDate || "مستمرة") + ' · ' + E.WAGE_TYPES[m.wageType] + (can(m, "seeWage") ? ' ' + money(E.wageOn(m, m.endDate || todayStr()), m) : "") + (m.normalHours ? " · " + m.normalHours + " ساعة يومياً" : "") + '</p>' +
      (active && (canManage || m.perms.addHours) ? '<div class="row" style="flex-wrap:wrap;gap:8px">' + kinds.map(k => quick(k[0], k[1])).join("") + (canManage ? quick("absence", "🚫 غياب") + quick("holiday", "🌴 عطلة") + quick("bonus", "➕ مكافأة") + quick("deduction", "➖ خصم") + quick("advance", "🤝 سلفة") : "") + '</div>' : "") +
      (canManage ? '<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">' + quick("payment", "💵 دفعة") + (active ? '<button type="button" onclick="empOpenWage(\'' + m.id + '\')">💲 تغيير الأجر</button><button type="button" onclick="empOpenEnd(\'' + m.id + '\')">⏹️ إنهاء العلاقة</button>' : "") + '</div>' : "") + '</div>' +
      (can(m, "seeBalance") ? '<div class="grid2">' + card("المستحق", s.earned, m) + card("المدفوع", s.payments, m) + card("السلف", s.advances, m) + card("الخصومات", s.deductions, m) + '</div>' +
        '<div class="card"><small class="muted">' + (s.balance >= 0 ? "المتبقي للعامل" : "على العامل (سُلف زائدة)") + '</small><h3>' + money(Math.abs(s.balance), m) + '</h3><small class="muted">أيام عمل: ' + s.days + (s.hours100 ? " · ساعات: " + L.formatMinor(s.hours100) : "") + " · غياب: " + s.absences + '</small></div>' : "") +
      '<div class="card"><b>السجلات</b>' + (rows || '<p class="muted">لا توجد سجلات.</p>') + '</div>' +
      '<div class="card"><b>كشف الحساب</b><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button type="button" onclick="empShare(\'employment\',\'' + m.id + '\')">📤 مشاركة الكشف</button><button type="button" onclick="empExport(\'employment\',\'' + m.id + '\')">⬇️ تصدير هذه العلاقة</button></div></div>' +
      (canManage ? '<div class="card"><b>الصلاحيات</b>' + permsBoxes(m.perms, "ep-") + '<button type="button" style="margin-top:6px" onclick="empSavePerms(\'' + m.id + '\')">حفظ الصلاحيات</button><p class="muted">تتحكم بما يظهر للعامل داخل التطبيق على هذا الجهاز فقط.</p></div>' : "") +
      '<div class="card"><b>سجل التعديلات</b>' + (auditRows || '<p class="muted">لا يوجد.</p>') + '</div>';
  }

  /* ---------------- statements, export, import ---------------- */
  const download = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type: type || "application/json;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  window.empShare = function (kind, id) {
    const text = kind === "person" ? E.personStatement(store, id) : E.statement(store, id);
    if (!text) return;
    if (window.RimbookShare) return window.RimbookShare.open({ title: "إرسال كشف الحساب", text, subject: "كشف حساب — ريمبوك", filename: "rimbook-statement.txt" });
    openModal(head("📤 مشاركة كشف الحساب") +
      '<p class="muted">يُجهَّز الكشف على جهازك فقط، وتختار أنت التطبيق والمستلم. لا يُرسل شيء لأي خدمة قبل اختيارك.</p>' +
      '<textarea id="es-text" rows="10" style="width:100%;margin:6px 0">' + safe(text) + '</textarea>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px"><button class="p" type="button" onclick="empSend(\'share\')">📤 مشاركة</button><button type="button" onclick="empSend(\'whatsapp\')">واتساب</button><button type="button" onclick="empSend(\'email\')">بريد</button><button type="button" onclick="empSend(\'copy\')">نسخ</button><button type="button" onclick="empSend(\'file\')">ملف</button></div>');
  };
  window.empSend = async function (channel) {
    const text = ($("es-text")?.value || "").trim(); if (!text) return;
    const open = url => { const w = window.open(url, "_blank", "noopener"); if (!w) location.href = url; };
    if (channel === "whatsapp") return open("https://wa.me/?text=" + encodeURIComponent(text));
    if (channel === "email") return open("mailto:?subject=" + encodeURIComponent("كشف حساب — ريمبوك") + "&body=" + encodeURIComponent(text));
    if (channel === "file") { download("rimbook-statement-" + todayStr() + ".txt", text, "text/plain;charset=utf-8"); return toast("تم تجهيز الملف"); }
    if (channel === "copy") { try { await navigator.clipboard.writeText(text); toast("تم النسخ"); } catch (_) { toast("تعذر النسخ"); } return; }
    try { if (navigator.share) { await navigator.share({ title: "كشف حساب — ريمبوك", text }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); toast("المشاركة غير متاحة؛ نُسخ الكشف"); } catch (_) { toast("المشاركة غير متاحة"); }
  };
  window.empExport = function (scope, id) {
    const sc = scope === "employer" ? { employerId: id } : scope === "person" ? { personId: id } : scope === "employment" ? { employmentId: id } : null;
    const env = E.makeEnvelope(store, sc);
    download("rimbook-employment-" + (scope || "all") + "-" + todayStr() + ".json", JSON.stringify(env));
    toast("تم تجهيز ملف النسخة الاحتياطية");
  };
  window.empPickImport = () => $("emp-file")?.click();
  window.empImportFile = function (input) {
    const file = input.files && input.files[0]; input.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast("تعذر قراءة الملف");
    reader.onload = () => {
      let env; try { env = JSON.parse(String(reader.result)); } catch (_) { return toast("الملف ليس بصيغة صحيحة"); }
      const ver = E.verifyEnvelope(env); if (!ver.ok) return toast(ver.error);
      const replace = confirm("ملف سليم: " + ver.data.employments.length + " علاقة عمل و" + ver.data.entries.length + " قيد.\n\nموافق = استبدال كل البيانات الحالية (تُحفظ نسخة للتراجع).\nإلغاء = الاحتفاظ بالحالية وإضافة المستورد كنسخ جديدة.");
      if (!replace && !confirm("إضافة المستورد إلى بياناتك الحالية كنسخ جديدة؟")) return;
      const r = E.importEnvelope(store, env, replace ? "replace" : "append");
      if (!r.ok) return toast(r.error);
      try { localStorage.setItem(PREV, JSON.stringify(store)); } catch (_) { if (replace && !confirm("تعذر حفظ نسخة التراجع. المتابعة بالاستبدال؟")) return; }
      if (commit(r.store)) { ui.screen = "home"; toast(replace ? "تمت الاستعادة" : "تم الاستيراد"); render(); }
    };
    reader.readAsText(file);
  };
  window.empUndoImport = function () {
    try {
      const prev = JSON.parse(localStorage.getItem(PREV) || "null");
      if (!prev || !E.validateStore(prev).ok) return toast("لا توجد نسخة صالحة للتراجع");
      if (!confirm("التراجع إلى ما قبل آخر استيراد؟")) return;
      if (commit(prev)) { localStorage.removeItem(PREV); ui.screen = "home"; toast("تم التراجع"); render(); }
    } catch (_) { toast("تعذر التراجع"); }
  };
  function backupCard() {
    return '<div class="card"><b>🗄️ نسخ احتياطي واستعادة</b><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button type="button" onclick="empExport()">⬇️ تصدير الكل</button><button type="button" onclick="empPickImport()">⬆️ استيراد ملف</button>' +
      (localStorage.getItem(PREV) ? '<button type="button" onclick="empUndoImport()">↩️ تراجع عن آخر استيراد</button>' : "") + '</div><input id="emp-file" type="file" accept="application/json,.json" hidden onchange="empImportFile(this)"><p class="muted">الملف يحمل بصمة سلامة؛ أي ملف تالف أو معدّل يدوياً يُرفض.</p></div>';
  }

  window.RimbookData = window.RimbookData || {};
  window.RimbookData.employment = {
    label: "جهات العمل والعاملون",
    export: () => E.makeEnvelope(store), verify: env => E.verifyEnvelope(env),
    import(env, mode) { const r = E.importEnvelope(store, env, mode); if (!r.ok) return r; return commit(r.store) ? { ok: true } : { ok: false, error: "تعذر الحفظ" }; },
    snapshot: () => JSON.stringify(store),
    restore(json) { try { const s = JSON.parse(json); return E.validateStore(s).ok && commit(s) ? { ok: true } : { ok: false, error: "نسخة غير صالحة" }; } catch (_) { return { ok: false, error: "نسخة غير صالحة" }; } },
    count: () => store.entries.length
  };
  VIEWS.employment = function () {
    return ui.screen === "employer" ? employerScreen() : ui.screen === "person" ? personScreen() : ui.screen === "employment" ? employmentScreen() : homeScreen();
  };

  /* ---------------- registration ---------------- */
  TABS.employment = ["🏢", "جهات العمل"];
  const baseMore = VIEWS.more;
  if (typeof baseMore === "function") {
    VIEWS.more = function () {
      return baseMore() + '<div class="card"><b>جهات العمل والأرشيف</b><p class="muted">علاقات عمل مستقلة لكل عامل وجهة.</p><button class="card" type="button" style="min-height:76px;text-align:right;width:100%" onclick="go(\'employment\')"><b>🏢 جهات العمل والعاملون</b></button></div>';
    };
  }
  render();
})();
