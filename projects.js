/* Rimbook "my projects" hub UI — own storage `rimbook_projects_v1`. Each project gets its own notes file, its own account
   (a dedicated side-ledger book) and its own calendar items. It only READS the main app's project names (to link) and never writes there. */
(function () {
  "use strict";
  const P = window.RimbookProjectsCore, L = window.RimbookLedgerCore;
  if (!P || !L) return;
  const KEY = "rimbook_projects_v1";
  const $ = id => document.getElementById(id);
  const val = id => ($(id)?.value || "").trim();
  const safe = v => esc(String(v ?? ""));
  const todayStr = () => iso(new Date());
  const ui = { id: null };
  let store = load();

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); if (!raw) return P.emptyStore(); const parsed = JSON.parse(raw); if (P.validateStore(parsed).ok) return parsed; } catch (_) {}
    try { if (raw) localStorage.setItem(KEY + "_corrupt_" + Date.now(), raw); } catch (_) {}
    setTimeout(() => toast("بيانات المشاريع تالفة؛ حُفظت نسخة منها. استعد من ملف نسخة احتياطية."), 800);
    return P.emptyStore();
  }
  function commit(next) {
    try { const json = JSON.stringify(next); localStorage.setItem(KEY, json); if (localStorage.getItem(KEY) !== json) throw new Error("readback"); store = next; return true; }
    catch (_) { toast("تعذر الحفظ؛ لم يُسجَّل التغيير."); return false; }
  }
  const project = id => store.projects.find(p => p.id === id);
  const ledgers = () => window.RimbookLedgers, calendar = () => window.RimbookCalendar;
  const apply = (r, msg) => { if (!r.ok) { toast(r.error); return false; } if (!commit(r.store)) return false; if (msg) toast(msg); render(); return true; };
  const mainProjects = () => { try { return (RB.data.projects || []).filter(p => p && p.id && p.name); } catch (_) { return []; } };

  window.RimbookProjects = {
    list: () => store.projects.filter(p => p.status !== "archived").map(p => ({ id: p.id, name: p.name })),
    name: id => (project(id) || {}).name || ""
  };
  window.projGo = id => { ui.id = id; render(); };

  window.projCreate = function () {
    const name = val("pj-name"); if (!name) return toast("اكتب اسم المشروع");
    let bookId = null;
    if ($("pj-account")?.checked) {
      if (!ledgers()) return toast("الدفاتر الجانبية غير متاحة");
      let res = ledgers().createBook("مشروع: " + name);
      if (!res.ok) res = ledgers().createBook("مشروع: " + name + " (" + todayStr() + ")");
      if (!res.ok) return toast("تعذر إنشاء حساب المشروع: " + res.error);
      bookId = res.bookId;
    }
    const r = P.createProject(store, { name, client: val("pj-client"), description: val("pj-desc"), mainProjectId: val("pj-main"), startDate: todayStr(), bookId });
    if (!r.ok) return toast(r.error);          // (an unused empty account book may remain; it is harmless and can be archived)
    if (!commit(r.store)) return;
    toast("تم إنشاء المشروع" + (bookId ? " وحسابه الخاص" : "")); ui.id = r.project.id; render();
  };
  window.projLinkAccount = function (id) {
    const p = project(id); if (!p || p.bookId || !ledgers()) return;
    const res = ledgers().createBook("مشروع: " + p.name); if (!res.ok) return toast(res.error);
    apply(P.updateProject(store, id, { bookId: res.bookId }), "تم إنشاء حساب المشروع");
  };
  window.projStatus = (id, status) => apply(P.setStatus(store, id, status), "تم التحديث");
  window.projSaveInfo = function (id) { apply(P.updateProject(store, id, { name: val("pj-e-name"), client: val("pj-e-client"), description: val("pj-e-desc"), mainProjectId: val("pj-e-main") }), "تم الحفظ"); };
  window.projAddFile = function (id) { if (apply(P.addFile(store, id, { title: val("pj-f-title"), body: val("pj-f-body") }), "أُضيفت الملاحظة")) { /* rendered */ } };
  window.projDelFile = function (id, fid) { if (confirm("حذف هذه الملاحظة من ملف المشروع؟")) apply(P.deleteFile(store, id, fid), "تم الحذف"); };
  window.projEntry = id => { const p = project(id); if (p && p.bookId && ledgers() && ledgers().exists(p.bookId)) ledgers().openEntry(p.bookId); else toast("لا يوجد حساب لهذا المشروع"); };
  window.projOpenAccount = id => { const p = project(id); if (p && p.bookId && ledgers() && ledgers().exists(p.bookId)) ledgers().openBook(p.bookId); else toast("لا يوجد حساب لهذا المشروع"); };
  window.projAddItem = (id, type) => { if (calendar()) calendar().openItem(type, todayStr(), id); };

  function reportText(p) {
    const lines = ["📁 تقرير مشروع: " + p.name, p.client ? "العميل/الجهة: " + p.client : "", "الحالة: " + P.STATUS[p.status], "التاريخ: " + todayStr(), ""].filter((x, i) => x !== "" || i > 3);
    if (p.bookId && ledgers() && ledgers().exists(p.bookId)) { const r = ledgers().reportText(p.bookId); if (r) lines.push(r.split("\n").slice(2, -2).join("\n"), ""); }
    const items = calendar() ? calendar().itemsForProject(p.id, 10).filter(i => !i.done && i.date >= todayStr()) : [];
    if (items.length) { lines.push("القادم:"); items.forEach(i => lines.push("• " + i.date + (i.time ? " " + i.time : "") + " — " + (i.title || i.body.slice(0, 50)))); lines.push(""); }
    if (p.files.length) { lines.push("آخر الملاحظات:"); p.files.slice(-5).forEach(f => lines.push("• " + f.title)); lines.push(""); }
    lines.push("— من ريمبوك");
    return lines.join("\n");
  }
  window.projShare = function (id) {
    const p = project(id); if (!p) return;
    if (window.RimbookShare) window.RimbookShare.open({ title: "إرسال تقرير المشروع", text: reportText(p), subject: "تقرير مشروع — ريمبوك", filename: "rimbook-project-report.txt" });
    else toast("مركز الإرسال غير متاح");
  };

  function listScreen() {
    const main = mainProjects();
    const cards = store.projects.slice().sort((a, b) => (a.status === "archived") - (b.status === "archived") || b.created - a.created).map(p => {
      const s = p.bookId && ledgers() && ledgers().summary(p.bookId);
      return '<button class="card" type="button" style="text-align:right;width:100%" onclick="projGo(\'' + p.id + '\')"><b>📁 ' + safe(p.name) + '</b> · ' + P.STATUS[p.status] +
        '<br><small class="muted">' + (p.client ? safe(p.client) + " · " : "") + (s ? "رصيد الحساب: " + L.formatMinor(s.cash) + (s.currency ? " " + safe(s.currency) : "") : "بلا حساب") + '</small></button>';
    }).join("");
    return '<div class="card"><b style="font-size:18px">📁 مشاريعي</b><p class="muted">لكل مشروع ملفه الخاص (ملاحظاته)، وحسابه الخاص، وجدوله. مستقلة عن بعضها وعن المفكرة.</p></div>' +
      (cards || '<div class="card muted">لا توجد مشاريع بعد. أنشئ أول مشروع.</div>') +
      '<div class="card"><b>➕ مشروع جديد</b><input id="pj-name" maxlength="60" placeholder="اسم المشروع" style="width:100%;margin:6px 0"><input id="pj-client" maxlength="60" placeholder="العميل أو الجهة (اختياري)" style="width:100%;margin:6px 0">' +
      '<textarea id="pj-desc" rows="2" maxlength="500" placeholder="وصف مختصر (اختياري)" style="width:100%;margin:6px 0"></textarea>' +
      (main.length ? '<label class="muted" for="pj-main">ربط بمشروع في التطبيق (اختياري، للقراءة فقط)</label><select id="pj-main" style="width:100%;margin:4px 0 8px"><option value="">بدون ربط</option>' + main.map(m => '<option value="' + safe(m.id) + '">' + safe(m.name) + '</option>').join("") + '</select>' : '<input id="pj-main" type="hidden" value="">') +
      '<label style="display:block;margin:6px 0"><input id="pj-account" type="checkbox" checked> إنشاء حساب مستقل لهذا المشروع</label><button class="p" type="button" onclick="projCreate()">إنشاء المشروع</button></div>';
  }
  function detailScreen(p) {
    const s = p.bookId && ledgers() && ledgers().exists(p.bookId) ? ledgers().summary(p.bookId) : null;
    const m = v => L.formatMinor(v) + (s && s.currency ? " " + safe(s.currency) : "");
    const items = calendar() ? calendar().itemsForProject(p.id, 8) : [];
    const main = mainProjects();
    const linkedMain = main.find(x => String(x.id) === String(p.mainProjectId));
    return '<div class="card"><button type="button" onclick="projGo(null)">→ مشاريعي</button><h2>📁 ' + safe(p.name) + '</h2><p class="muted">' + (p.client ? safe(p.client) + " · " : "") + P.STATUS[p.status] + (p.startDate ? " · منذ " + safe(p.startDate) : "") + '</p>' + (p.description ? '<p>' + safe(p.description) + '</p>' : "") +
      '<div class="row" style="flex-wrap:wrap;gap:8px"><button class="p" type="button" onclick="projShare(\'' + p.id + '\')">✉️ إرسال تقرير المشروع</button>' +
      (p.status === "active" ? '<button type="button" onclick="projStatus(\'' + p.id + '\',\'done\')">✅ مكتمل</button>' : '<button type="button" onclick="projStatus(\'' + p.id + '\',\'active\')">↩️ إعادة فتح</button>') +
      (p.status !== "archived" ? '<button type="button" onclick="projStatus(\'' + p.id + '\',\'archived\')">أرشفة</button>' : "") + '</div></div>' +
      '<div class="card"><b>💰 حساب المشروع</b>' + (s ? '<div class="grid2"><div class="card"><small class="muted">الرصيد النقدي</small><h3>' + m(s.cash) + '</h3></div><div class="card"><small class="muted">' + (s.profit >= 0 ? "الربح" : "الخسارة") + '</small><h3>' + m(Math.abs(s.profit)) + '</h3></div><div class="card"><small class="muted">ديون لي</small><h3>' + m(s.receivableOpen) + '</h3></div><div class="card"><small class="muted">ديون عليّ</small><h3>' + m(s.payableOpen) + '</h3></div></div>' +
        '<div class="row" style="flex-wrap:wrap;gap:8px"><button class="p" type="button" onclick="projEntry(\'' + p.id + '\')">➕ عملية في حساب المشروع</button><button type="button" onclick="projOpenAccount(\'' + p.id + '\')">📚 فتح الدفتر</button></div>'
        : '<p class="muted">لا يوجد حساب مربوط.</p><button type="button" onclick="projLinkAccount(\'' + p.id + '\')">إنشاء حساب للمشروع</button>') + '</div>' +
      '<div class="card"><b>📆 جدول المشروع</b>' + (items.map(i => '<div class="item"><span>' + (i.done ? "☑️ " : "") + safe(i.title || i.body.slice(0, 50)) + '<br><small class="muted">' + safe(i.date) + (i.time ? " · " + safe(i.time) : "") + '</small></span></div>').join("") || '<p class="muted">لا توجد عناصر لهذا المشروع.</p>') +
      '<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button type="button" onclick="projAddItem(\'' + p.id + '\',\'note\')">📝 ملاحظة</button><button type="button" onclick="projAddItem(\'' + p.id + '\',\'appointment\')">🕘 موعد</button><button type="button" onclick="projAddItem(\'' + p.id + '\',\'task\')">⬜ مهمة</button></div></div>' +
      '<div class="card"><b>🗂️ ملف المشروع</b>' + (p.files.slice().reverse().map(f => '<div class="item"><span><b>' + safe(f.title) + '</b><br><small class="muted">' + safe(new Date(f.at).toLocaleDateString("ar")) + '</small><br>' + safe(f.body).replace(/\n/g, "<br>") + '</span><button type="button" onclick="projDelFile(\'' + p.id + '\',\'' + f.id + '\')">حذف</button></div>').join("") || '<p class="muted">لا توجد ملاحظات بعد.</p>') +
      '<input id="pj-f-title" maxlength="80" placeholder="عنوان الملاحظة" style="width:100%;margin:8px 0 4px"><textarea id="pj-f-body" rows="3" maxlength="4000" placeholder="اكتب أو أملِ بصوتك 🎤" style="width:100%"></textarea><button class="p" type="button" onclick="projAddFile(\'' + p.id + '\')">إضافة إلى الملف</button></div>' +
      '<div class="card"><b>معلومات المشروع</b><input id="pj-e-name" maxlength="60" value="' + safe(p.name) + '" style="width:100%;margin:6px 0"><input id="pj-e-client" maxlength="60" value="' + safe(p.client) + '" placeholder="العميل" style="width:100%;margin:6px 0"><textarea id="pj-e-desc" rows="2" maxlength="500" style="width:100%">' + safe(p.description) + '</textarea>' +
      (main.length ? '<label class="muted" for="pj-e-main">مشروع التطبيق المرتبط (قراءة فقط)</label><select id="pj-e-main" style="width:100%;margin:4px 0"><option value="">بدون</option>' + main.map(x => '<option value="' + safe(x.id) + '"' + (String(x.id) === String(p.mainProjectId) ? " selected" : "") + '>' + safe(x.name) + '</option>').join("") + '</select>' : '<input id="pj-e-main" type="hidden" value="">') +
      '<button type="button" onclick="projSaveInfo(\'' + p.id + '\')">حفظ</button>' + (linkedMain ? ' <button type="button" onclick="go(\'projects\')">🧾 فواتير ومرفقات «' + safe(linkedMain.name) + '» في التطبيق</button>' : "") + '</div>';
  }
  VIEWS.myprojects = function () { const p = ui.id && project(ui.id); return p ? detailScreen(p) : listScreen(); };

  window.RimbookData = window.RimbookData || {};
  window.RimbookData.projects = {
    label: "مشاريعي",
    export: () => P.makeEnvelope(store), verify: env => P.verifyEnvelope(env),
    import(env, mode) { const r = P.importEnvelope(store, env, mode); if (!r.ok) return r; return commit(r.store) ? { ok: true } : { ok: false, error: "تعذر الحفظ" }; },
    snapshot: () => JSON.stringify(store),
    restore(json) { try { const s = JSON.parse(json); return P.validateStore(s).ok && commit(s) ? { ok: true } : { ok: false, error: "نسخة غير صالحة" }; } catch (_) { return { ok: false, error: "نسخة غير صالحة" }; } },
    count: () => store.projects.length
  };

  TABS.myprojects = ["📁", "مشاريعي"];
  const baseMore = VIEWS.more;
  if (typeof baseMore === "function") VIEWS.more = function () {
    return baseMore() + '<div class="card"><b>مشاريعي</b><p class="muted">لكل مشروع ملفه وحسابه وجدوله.</p><button class="card" type="button" style="min-height:76px;text-align:right;width:100%" onclick="go(\'myprojects\')"><b>📁 مشاريعي</b></button></div>';
  };
  render();
})();
