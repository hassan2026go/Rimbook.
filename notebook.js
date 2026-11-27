/* Rimbook unified notebook: notes, appointments and reminders in one working area.
   Existing records keep their original types and IDs; no migration deletes old data. */
(function () {
  "use strict";
  let mode = "note";
  const $id = id => document.getElementById(id);
  const value = id => ($id(id)?.value || "").trim();
  const today = () => iso(new Date());
  const validDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const parsed = new Date(value + "T00:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  const safe = value => esc(String(value ?? ""));
  const addDays = (day, n) => { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const projects = () => Array.isArray(RB.data.projects) ? RB.data.projects : [];
  const projectOptions = () => '<option value="">عام — غير مرتبط بمشروع</option>' +
    projects().map(p => '<option value="' + safe(p.id) + '" ' +
      (RB.data.activeProject === p.id ? "selected" : "") + '>' + safe(p.name) + '</option>').join("");
  const records = () => RB.all("note").concat(RB.all("event"))
    .slice().sort((a, b) => String(b.d || "").localeCompare(String(a.d || "")) ||
      Number(b.created || 0) - Number(a.created || 0));
  const categoryLabel = key => ({
    wage: "موعد أجور", payment: "دفعة", advance: "سلفة",
    holiday: "عطلة", appointment: "موعد", other: "تذكير"
  }[key] || "موعد");

  window.notebookSetMode = function (next) {
    if (!["note", "appointment", "reminder", "shift"].includes(next)) return;
    mode = next;
    render();
  };

  window.notebookAdd = function () {
    const title = value("nb-title");
    const date = value("nb-date") || today();
    const time = value("nb-time");
    const project = value("nb-project") || null;
    if (mode === "note") {
      const body = value("nb-body");
      if (!body) return toast("اكتب نص الملاحظة أولاً");
      if (!RB.add({ type: "note", title, body, d: today(), project })) return;
      toast("تم حفظ الملاحظة");
    } else if (mode === "shift") {
      const end = value("nb-end");
      const weeks = Math.max(0, Math.min(26, Math.floor(Number(value("nb-repeat")) || 0)));
      if (!validDate(date)) return toast("أدخل تاريخاً تقويمياً صحيحاً");
      if (date < today()) return toast("اختر اليوم أو تاريخاً قادماً");
      if (end && end <= (time || "09:00")) return toast("وقت نهاية الدوام يجب أن يكون بعد وقت البداية");
      let added = 0;
      for (let i = 0; i <= weeks; i++) {
        const day = addDays(date, i * 7);
        if (RB.add({ type: "event", title: title || "دوام", d: day, t: time || "09:00", end: end || "", project,
          reminderCategory: "", notebookKind: "shift", reminderEnabled: false, notebookEntry: true })) added++;
      }
      if (!added) return;
      toast(added > 1 ? "تم إنشاء " + added + " دوامات في جدولك" : "تم حفظ الدوام في جدولك");
    } else {
      if (!title) return toast("اكتب عنوان الموعد أو التذكير");
      if (!validDate(date)) return toast("أدخل تاريخاً تقويمياً صحيحاً");
      if (date < today()) return toast("اختر اليوم أو تاريخاً قادماً");
      const reminderCategory = mode === "reminder" ? (value("nb-category") || "other") : "";
      if (!RB.add({
        type: "event", title, d: date, t: time || "09:00", project,
        reminderCategory, notebookKind: mode, reminderEnabled: mode === "reminder",
        reminderLead: 15, notebookEntry: true
      })) return;
      toast(mode === "reminder" ? "تم حفظ التذكير" : "تم حفظ الموعد");
    }
    render();
  };

  window.notebookEdit = function (id) {
    const row = RB.data.items.find(x => String(x.id) === String(id) && x.type === "event");
    if (!row) return;
    document.getElementById("rimbook-notebook-edit-modal")?.remove();
    const modal = document.createElement("div");
    modal.id = "rimbook-notebook-edit-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "تعديل الموعد أو التذكير");
    modal.style.cssText = "position:fixed;inset:0;z-index:130;background:#000a;display:flex;align-items:center;justify-content:center;padding:14px";
    const field = (key, label, type, current) =>
      '<label class="muted" for="nb-edit-' + key + '">' + label + '</label>' +
      '<input id="nb-edit-' + key + '" type="' + type + '" value="' + safe(current || "") +
      '" style="width:100%;margin:4px 0 10px">';
    const options = '<option value="">عام — غير مرتبط بمشروع</option>' +
      projects().map(p => '<option value="' + safe(p.id) + '" ' +
        (String(row.project || "") === String(p.id) ? "selected" : "") + '>' + safe(p.name) + '</option>').join("");
    const reminderControls = row.reminderCategory
      ? '<label class="muted" for="nb-edit-category">نوع التذكير</label><select id="nb-edit-category" style="width:100%;margin:4px 0 10px">' +
        ["wage","payment","advance","holiday","appointment","other"].map(key =>
          '<option value="' + key + '" ' + (row.reminderCategory === key ? "selected" : "") + '>' + categoryLabel(key) + '</option>').join("") +
        '</select><label class="muted"><input id="nb-edit-enabled" type="checkbox" ' +
        (row.reminderEnabled !== false ? "checked" : "") + '> تفعيل التنبيه</label>'
      : "";
    modal.innerHTML = '<div class="card" style="width:min(100%,480px);max-height:88vh;overflow:auto;margin:0;background:var(--card)">' +
      '<div class="row" style="justify-content:space-between"><b>تعديل ' + (row.reminderCategory ? "التذكير" : "الموعد") +
      '</b><button type="button" onclick="document.getElementById(\'rimbook-notebook-edit-modal\')?.remove()">إغلاق ✕</button></div>' +
      field("title","العنوان","text",row.title) + field("date","التاريخ","date",row.d || today()) +
      field("time","الوقت","time",row.t || "09:00") +
      '<label class="muted" for="nb-edit-project">المشروع</label><select id="nb-edit-project" style="width:100%;margin:4px 0 10px">' + options + '</select>' +
      reminderControls + '<div class="row"><button class="p" type="button" style="flex:1" onclick="notebookSaveEdit(\'' +
      safe(row.id) + '\')">حفظ التعديلات</button><button type="button" onclick="document.getElementById(\'rimbook-notebook-edit-modal\')?.remove()">إلغاء</button></div></div>';
    document.body.append(modal);
  };

  window.notebookSaveEdit = function (id) {
    const row = RB.data.items.find(x => String(x.id) === String(id) && x.type === "event");
    if (!row) return toast("السجل غير موجود");
    const title = value("nb-edit-title"), date = value("nb-edit-date"), time = value("nb-edit-time");
    const project = value("nb-edit-project") || null;
    if (!title) return toast("اكتب عنوان الموعد أو التذكير");
    if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return toast("تحقق من صحة التاريخ والوقت");
    if (date < today() && date !== row.d) return toast("لا يمكن نقل الموعد إلى تاريخ ماضٍ");
    if (project && !projects().some(p => String(p.id) === String(project))) return toast("المشروع المحدد غير موجود");
    const changes = { title, d: date, t: time, project };
    if (row.reminderCategory) {
      const category = value("nb-edit-category");
      if (!["wage","payment","advance","holiday","appointment","other"].includes(category)) return toast("نوع التذكير غير صحيح");
      changes.reminderCategory = category;
      changes.reminderEnabled = !!$id("nb-edit-enabled")?.checked;
    }
    if (!RB.patch(id, changes)) return toast("تعذر حفظ التعديلات");
    document.getElementById("rimbook-notebook-edit-modal")?.remove();
    render(); toast("تم تعديل السجل وحفظه");
  };

  window.editNote = function (id) {
    const row = RB.data.items.find(x => String(x.id) === String(id) && x.type === "note");
    if (!row) return toast("الملاحظة غير موجودة");
    document.getElementById("rimbook-note-edit-modal")?.remove();
    const options = '<option value="">عام — غير مرتبط بمشروع</option>' +
      projects().map(p => '<option value="' + safe(p.id) + '" ' +
        (String(row.project || "") === String(p.id) ? "selected" : "") + '>' + safe(p.name) + '</option>').join("");
    const modal = document.createElement("div");
    modal.id = "rimbook-note-edit-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "تعديل الملاحظة");
    modal.style.cssText = "position:fixed;inset:0;z-index:130;background:#000a;display:flex;align-items:center;justify-content:center;padding:14px";
    modal.innerHTML = '<div class="card" style="width:min(100%,520px);max-height:88vh;overflow:auto;margin:0;background:var(--card)">' +
      '<div class="row" style="justify-content:space-between"><b>تعديل الملاحظة</b><button type="button" onclick="document.getElementById(\'rimbook-note-edit-modal\')?.remove()">إغلاق ✕</button></div>' +
      '<label class="muted" for="nb-note-edit-title">عنوان الملاحظة (اختياري)</label><input id="nb-note-edit-title" maxlength="140" value="' +
      safe(row.title || "") + '" style="width:100%;margin:4px 0 10px">' +
      '<label class="muted" for="nb-note-edit-body">نص الملاحظة</label><textarea id="nb-note-edit-body" rows="7" maxlength="12000" style="width:100%;margin:4px 0 10px">' +
      safe(row.body || "") + '</textarea><label class="muted" for="nb-note-edit-project">المشروع</label><select id="nb-note-edit-project" style="width:100%;margin:4px 0 10px">' +
      options + '</select><div class="row"><button class="p" type="button" style="flex:1" onclick="notebookSaveNoteEdit(\'' +
      safe(row.id) + '\')">حفظ التعديلات</button><button type="button" onclick="document.getElementById(\'rimbook-note-edit-modal\')?.remove()">إلغاء</button></div></div>';
    document.body.append(modal);
  };

  window.notebookSaveNoteEdit = function (id) {
    const row = RB.data.items.find(x => String(x.id) === String(id) && x.type === "note");
    if (!row) return toast("الملاحظة غير موجودة");
    const title = value("nb-note-edit-title"), body = ($id("nb-note-edit-body")?.value || "").trim();
    const project = value("nb-note-edit-project") || null;
    if (!body) return toast("لا يمكن حفظ ملاحظة فارغة");
    if (project && !projects().some(p => String(p.id) === String(project))) return toast("المشروع المحدد غير موجود");
    if (!RB.patch(id, { title, body, project })) return toast("تعذر حفظ التعديلات");
    document.getElementById("rimbook-note-edit-modal")?.remove();
    render(); toast("تم تعديل الملاحظة وحفظها");
  };

  window.notebookDelete = function (id) {
    const row = RB.data.items.find(x => String(x.id) === String(id));
    if (!row || !["note", "event"].includes(row.type)) return;
    if (!confirm("هل تريد حذف هذا السجل؟")) return;
    if (!RB.remove(id)) return;
    render();
  };

  window.notebookToggleReminder = function (id, enabled) {
    if (!RB.patch(id, { reminderEnabled: !!enabled })) return;
    render();
    toast(enabled ? "تم تفعيل التذكير" : "تم إيقاف التذكير");
  };

  window.notebookScreen = function () {
    const rows = records();
    const noteCount = rows.filter(x => x.type === "note").length;
    const eventCount = rows.filter(x => x.type === "event" && !x.reminderCategory).length;
    const own = window.rimbookOwner ? window.rimbookOwner.kind() : "admin";
    const reminderCount = rows.filter(x => x.type === "event" && x.reminderCategory).length;
    const form = mode === "note"
      ? '<label class="muted" for="nb-title">عنوان الملاحظة (اختياري)</label>' +
        '<input id="nb-title" maxlength="140" placeholder="مثلاً: ملاحظات اجتماع" style="width:100%;margin:4px 0 10px">' +
        '<label class="muted" for="nb-body">نص الملاحظة</label>' +
        '<textarea id="nb-body" rows="5" maxlength="12000" placeholder="اكتب ملاحظتك هنا..." style="width:100%;margin:4px 0 10px"></textarea>'
      : mode === "shift"
      ? '<label class="muted" for="nb-title">اسم الدوام (اختياري)</label><input id="nb-title" maxlength="140" placeholder="مثلاً: دوام الموقع" style="width:100%;margin:4px 0 10px">' +
        '<div class="grid3"><div><label class="muted" for="nb-date">التاريخ</label><input id="nb-date" type="date" min="' + today() + '" value="' + today() + '" style="width:100%;margin:4px 0 10px"></div>' +
        '<div><label class="muted" for="nb-time">من</label><input id="nb-time" type="time" value="08:00" style="width:100%;margin:4px 0 10px"></div>' +
        '<div><label class="muted" for="nb-end">إلى</label><input id="nb-end" type="time" value="16:00" style="width:100%;margin:4px 0 10px"></div></div>' +
        '<label class="muted" for="nb-repeat">كرّر أسبوعياً لعدد أسابيع إضافية (0 = مرة واحدة)</label><input id="nb-repeat" type="number" min="0" max="26" step="1" value="0" style="width:100%;margin:4px 0 10px">'
      : '<label class="muted" for="nb-title">' + (mode === "reminder" ? "عنوان التذكير أو اسم الشخص" : "عنوان الموعد") + '</label>' +
        '<input id="nb-title" maxlength="140" placeholder="اكتب العنوان" style="width:100%;margin:4px 0 10px">' +
        '<div class="grid2"><div><label class="muted" for="nb-date">التاريخ</label><input id="nb-date" type="date" min="' + today() + '" value="' + today() + '" style="width:100%;margin:4px 0 10px"></div>' +
        '<div><label class="muted" for="nb-time">الوقت</label><input id="nb-time" type="time" value="09:00" style="width:100%;margin:4px 0 10px"></div></div>' +
        (mode === "reminder"
          ? '<label class="muted" for="nb-category">نوع التذكير</label><select id="nb-category" style="width:100%;margin:4px 0 10px"><option value="wage">موعد الأجور</option><option value="payment">دفعة</option><option value="advance">سلفة</option><option value="holiday">عطلة</option><option value="appointment">اجتماع أو موعد</option><option value="other">أخرى</option></select><p class="muted">التنبيه المحلي يعتمد على إذن الإشعارات وتشغيل التطبيق أو المتصفح.</p>'
          : "");
    const list = rows.map(x => {
      const isNote = x.type === "note";
      const label = isNote ? "ملاحظة" : (x.notebookKind === "shift" ? "دوام" : (x.reminderCategory ? categoryLabel(x.reminderCategory) : "موعد"));
      const details = isNote
        ? '<p style="white-space:pre-wrap">' + safe(x.body || "") + '</p>' +
          (typeof attachmentsSection === "function" ? attachmentsSection(x) : "") +
          (typeof noteSpeakBtn === "function" ? noteSpeakBtn(x) : "")
        : '<p class="muted">' + safe(x.d || "") + ' · ' + safe(x.t || "") + (x.end ? ' – ' + safe(x.end) : "") + '</p>' +
          (x.reminderCategory
            ? '<label class="muted"><input type="checkbox" ' + (x.reminderEnabled !== false ? "checked" : "") +
              ' onchange="notebookToggleReminder(\'' + safe(x.id) + '\',this.checked)"> تفعيل التنبيه</label>'
            : "");
      return '<div class="item" style="display:block;padding:10px 0"><div class="row" style="justify-content:space-between"><b>' +
        safe(x.title || label) + '</b><span class="tag">' + label + '</span></div><small class="muted">' +
        safe(x.d || "") + ' · ' + safe((projects().find(p => p.id === x.project) || {}).name || "عام") +
        '</small>' + details + '<div class="row">' +
        (isNote ? '<button type="button" onclick="editNote(\'' + safe(x.id) + '\')">تعديل</button>' :
          '<button type="button" onclick="notebookEdit(\'' + safe(x.id) + '\')">تعديل</button>') +
        '<button class="danger" type="button" onclick="notebookDelete(\'' + safe(x.id) + '\')">حذف</button></div></div>'
    }).join("");
    return '<div class="card"><b style="font-size:17px">📒 المفكرة والسجل اليومي</b>' +
      '<p class="muted">مكان واحد للملاحظات والمواعيد والتذكيرات والمرفقات، مع ربط السجلات بالمشاريع عند الحاجة.</p>' +
      '<div class="grid3"><div class="card">ملاحظات<h3>' + noteCount + '</h3></div><div class="card">مواعيد<h3>' + eventCount + '</h3></div><div class="card">تذكيرات<h3>' + reminderCount + '</h3></div></div></div>' +
      '<div class="card"><b>📤 أرسل جدولك</b><p class="muted">أنشئ جدولاً من مواعيدك ودوامك وساعات عملك، ثم أرسله بواتساب أو رسالة أو بريد إلى أي شخص تختاره. لا يتطلب ربطاً بمدير أو بملف عامل.</p>' +
      '<button class="p" type="button" style="width:100%;min-height:46px" onclick="notebookShareSchedule()">📤 إنشاء الجدول وإرساله</button>' +
      '<button type="button" style="width:100%;min-height:46px;margin-top:8px" onclick="go(\'diary\')">📔 مفكرتي اليومية (عمل ودفعات بالصوت)</button></div>' +
      '<div class="card"><b>إضافة سجل جديد</b><div class="strip" style="margin:8px 0">' +
      '<button type="button" class="' + (mode === "note" ? "p" : "") + '" onclick="notebookSetMode(\'note\')">📝 ملاحظة</button>' +
      '<button type="button" class="' + (mode === "appointment" ? "p" : "") + '" onclick="notebookSetMode(\'appointment\')">📅 موعد</button>' +
      '<button type="button" class="' + (mode === "reminder" ? "p" : "") + '" onclick="notebookSetMode(\'reminder\')">⏰ تذكير</button>' +
      '<button type="button" class="' + (mode === "shift" ? "p" : "") + '" onclick="notebookSetMode(\'shift\')">🕘 دوام</button></div>' +
      form + '<label class="muted" for="nb-project">المشروع (اختياري)</label><select id="nb-project" style="width:100%;margin:4px 0 12px">' + projectOptions() + '</select>' +
      '<button class="p" type="button" style="width:100%;min-height:46px" onclick="notebookAdd()">حفظ السجل</button></div>' +
      '<div class="card"><b>السجل المحفوظ (' + rows.length + ')</b>' +
      (list || '<p class="muted">لا توجد سجلات بعد.</p>') + '</div>';
  };

  /* ---------- Schedule sharing: no account link, no manager link; the sender picks the recipient ---------- */
  const weekdayName = day => { try { return new Date(day + "T00:00:00").toLocaleDateString("ar", { weekday: "long" }); } catch (_) { return ""; } };
  const hoursText = n => { const v = Math.round(Number(n || 0) * 100) / 100; return String(v); };
  const moneyText = n => (Math.round(Number(n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " " + String((RB.data.settings && RB.data.settings.currency) || "");
  window.rimbookBuildSchedule = function (opts) {
    opts = opts || {};
    const from = validDate(opts.from) ? opts.from : today();
    const to = validDate(opts.to) && opts.to >= from ? opts.to : addDays(from, 6);
    const owner = window.rimbookOwner;
    const owns = row => owner ? owner.owns(row) : true;
    const inRange = d => typeof d === "string" && d >= from && d <= to;
    const days = {};
    const put = (day, line) => { (days[day] = days[day] || []).push(line); };
    if (opts.events !== false) {
      RB.all("event").filter(x => inRange(x.d)).forEach(x => {
        const kind = x.notebookKind === "shift" ? "دوام" : (x.reminderCategory ? categoryLabel(x.reminderCategory) : "موعد");
        put(x.d, { t: x.t || "", text: "• " + (x.t ? x.t + (x.end ? "–" + x.end : "") + " — " : "") + (x.title || kind) + " (" + kind + ")" });
      });
    }
    const workRows = RB.all("work").filter(x => inRange(x.d) && owns(x) && !x.isReversal && !x.reversedBy);
    const reversed = new Set(RB.all("work").filter(x => x.isReversal && x.reversalOf != null).map(x => String(x.reversalOf)));
    let due = 0, paid = 0, adv = 0, totalHours = 0, workDays = 0;
    workRows.filter(x => !reversed.has(String(x.id))).forEach(x => {
      if (opts.work !== false && ["work", "holiday", "absence"].includes(x.k)) {
        const h = Number(x.normalHours || 0), o = Number(x.otHours || 0);
        const label = x.k === "work" ? "يوم عمل" + (h ? " — " + hoursText(h) + " ساعة" : "") + (o ? " + " + hoursText(o) + " إضافي" : "") : x.k === "holiday" ? "عطلة" : "غياب";
        put(x.d, { t: "~", text: "• " + label });
        if (x.k === "work") { workDays++; totalHours += h + o; }
      }
      due += Number(x.workerDue ?? x.due) || 0;
      paid += Number(x.workerPaid ?? x.rec) || 0;
      adv += Number(x.workerAdvance ?? x.advance) || 0;
      if (opts.money && (x.workerPaid || x.rec)) put(x.d, { t: "~~", text: "• دفعة مستلمة: " + moneyText(x.workerPaid ?? x.rec) });
      if (opts.money && (x.workerAdvance || x.advance)) put(x.d, { t: "~~", text: "• سلفة: " + moneyText(x.workerAdvance ?? x.advance) });
    });
    if (opts.tasks !== false && owner && owner.linked()) {
      RB.all("task").filter(x => !x.done && inRange(x.due) && String(x.workerId || "") === String(owner.linked().id))
        .forEach(x => put(x.due, { t: "~~~", text: "• مهمة: " + (x.title || "") }));
    }
    const name = String(opts.name || (RB.data.profile && RB.data.profile.name) || "").trim();
    const lines = ["📅 جدول العمل" + (name ? " — " + name : ""), "الفترة: " + from + " ← " + to];
    if (opts.recipient) lines.push("إلى: " + String(opts.recipient).trim());
    lines.push("");
    const keys = Object.keys(days).sort();
    if (!keys.length) lines.push("لا توجد بنود في هذه الفترة.");
    keys.forEach(day => {
      lines.push(weekdayName(day) + " " + day);
      days[day].sort((a, b) => String(a.t).localeCompare(String(b.t))).forEach(l => lines.push(l.text));
      lines.push("");
    });
    if (opts.work !== false && workDays) lines.push("الإجمالي: " + workDays + " يوم عمل · " + hoursText(totalHours) + " ساعة");
    if (opts.money && (due || paid || adv)) {
      lines.push("المستحق: " + moneyText(due) + " · المستلم: " + moneyText(paid) + " · السلف: " + moneyText(adv) + " · المتبقي: " + moneyText(due - paid - adv));
    }
    lines.push("", "— أُرسل من ريمبوك");
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  };

  const closeShare = () => document.getElementById("rimbook-schedule-modal")?.remove();
  const shareOpts = () => ({
    from: value("sh-from"), to: value("sh-to"), recipient: value("sh-name"),
    events: !!$id("sh-events")?.checked, work: !!$id("sh-work")?.checked,
    tasks: !!$id("sh-tasks")?.checked, money: !!$id("sh-money")?.checked
  });
  window.notebookShareRefresh = function () {
    const box = $id("sh-text"); if (!box) return;
    box.value = window.rimbookBuildSchedule(shareOpts());
  };
  window.notebookSharePreset = function (kind) {
    const start = today();
    const end = kind === "month" ? (() => { const d = new Date(start + "T00:00:00Z"); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); })() : addDays(start, 6);
    $id("sh-from").value = start; $id("sh-to").value = end; notebookShareRefresh();
  };
  window.notebookShareSchedule = function () {
    closeShare();
    const owner = window.rimbookOwner;
    const hasLink = !!(owner && owner.linked());
    const modal = document.createElement("div");
    modal.id = "rimbook-schedule-modal";
    modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); modal.setAttribute("aria-label", "إرسال جدول العمل");
    modal.style.cssText = "position:fixed;inset:0;z-index:10030;background:#000a;display:flex;align-items:center;justify-content:center;padding:12px";
    const chk = (id, label, on) => '<label class="muted" style="display:block;margin:4px 0"><input id="' + id + '" type="checkbox" ' + (on ? "checked" : "") + ' onchange="notebookShareRefresh()"> ' + label + '</label>';
    modal.innerHTML = '<div class="card" style="width:min(100%,520px);max-height:92vh;overflow:auto;margin:0;background:var(--card)">' +
      '<div class="row" style="justify-content:space-between"><b>📤 إرسال جدول العمل</b><button type="button" onclick="document.getElementById(\'rimbook-schedule-modal\')?.remove()">إغلاق ✕</button></div>' +
      '<div class="grid2"><div><label class="muted" for="sh-from">من</label><input id="sh-from" type="date" value="' + today() + '" onchange="notebookShareRefresh()" style="width:100%"></div>' +
      '<div><label class="muted" for="sh-to">إلى</label><input id="sh-to" type="date" value="' + addDays(today(), 6) + '" onchange="notebookShareRefresh()" style="width:100%"></div></div>' +
      '<div class="row" style="margin:8px 0"><button type="button" onclick="notebookSharePreset(\'week\')">هذا الأسبوع</button><button type="button" onclick="notebookSharePreset(\'month\')">هذا الشهر</button></div>' +
      chk("sh-events", "المواعيد والدوام والتذكيرات", true) + chk("sh-work", "أيام وساعات العمل المسجلة", true) +
      (hasLink ? chk("sh-tasks", "المهام المسندة إليّ", true) : '<input id="sh-tasks" type="checkbox" hidden>') +
      chk("sh-money", "إظهار المبالغ (الأجور والدفعات والسلف) — غير مفعّل افتراضياً", false) +
      '<label class="muted" for="sh-name">اسم المستلم (اختياري، يظهر في رأس الجدول)</label><input id="sh-name" maxlength="80" placeholder="مثلاً: المدير" oninput="notebookShareRefresh()" style="width:100%;margin:4px 0 8px">' +
      '<label class="muted" for="sh-phone">رقم الهاتف (اختياري، لواتساب أو الرسائل)</label><input id="sh-phone" type="tel" inputmode="tel" placeholder="+..." style="width:100%;margin:4px 0 8px">' +
      '<label class="muted" for="sh-email">البريد الإلكتروني (اختياري)</label><input id="sh-email" type="email" placeholder="name@example.com" style="width:100%;margin:4px 0 8px">' +
      '<label class="muted" for="sh-text">نص الجدول — يمكنك تعديله قبل الإرسال</label><textarea id="sh-text" rows="10" style="width:100%;margin:4px 0 10px"></textarea>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px"><button class="p" type="button" onclick="notebookShareSend(\'share\')">📤 مشاركة</button><button type="button" onclick="notebookShareSend(\'whatsapp\')">واتساب</button>' +
      '<button type="button" onclick="notebookShareSend(\'sms\')">رسالة SMS</button><button type="button" onclick="notebookShareSend(\'email\')">بريد</button>' +
      '<button type="button" onclick="notebookShareSend(\'copy\')">نسخ</button><button type="button" onclick="notebookShareSend(\'file\')">تنزيل ملف</button></div>' +
      '<p class="muted">لا يُحفظ المستلم ولا يُربط به أي حساب؛ يصل الجدول فقط عبر القناة التي تختارها.</p></div>';
    document.body.append(modal);
    modal.addEventListener("click", e => { if (e.target === modal) closeShare(); });
    notebookShareRefresh();
  };
  window.notebookShareSend = async function (channel) {
    const text = ($id("sh-text")?.value || "").trim();
    if (!text) return toast("لا يوجد جدول لإرساله");
    const phone = (value("sh-phone")).replace(/[^\d+]/g, ""), email = value("sh-email");
    const subject = "جدول العمل — ريمبوك";
    const open = url => { const w = window.open(url, "_blank", "noopener"); if (!w) location.href = url; };
    if (channel === "whatsapp") return open("https://wa.me/" + phone.replace(/\D/g, "") + "?text=" + encodeURIComponent(text));
    if (channel === "sms") return open("sms:" + phone + "?body=" + encodeURIComponent(text));
    if (channel === "email") {
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return toast("تحقق من البريد الإلكتروني");
      return open("mailto:" + encodeURIComponent(email) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text));
    }
    if (channel === "copy") {
      try { await navigator.clipboard.writeText(text); toast("تم نسخ الجدول"); } catch (_) { toast("تعذر النسخ؛ حدد النص وانسخه يدوياً"); }
      return;
    }
    if (channel === "file") {
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = "rimbook-schedule-" + today() + ".txt";
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      return toast("تم تجهيز ملف الجدول");
    }
    try {
      if (navigator.share) { await navigator.share({ title: subject, text }); return; }
    } catch (error) { if (error && error.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); toast("المشاركة المباشرة غير متاحة؛ نُسخ الجدول لتلصقه حيث تريد"); }
    catch (_) { toast("المشاركة غير متاحة؛ استخدم واتساب أو البريد أو تنزيل الملف"); }
  };

  // Redirect all former entry points to the unified notebook without breaking old links.
  const originalGo = window.go;
  window.go = function (route) {
    const aliases = { agenda: "notebook", notes: "notebook", reminders: "notebook" };
    return originalGo(aliases[route] || route);
  };
  delete VIEWS.habits;
  delete TABS.habits;
  TABS.notebook = ["📒", "المفكرة"];
  ["employee", "worker"].forEach(role => {
    const old = ROLES[role].tabs.filter(tab => !["agenda", "notes", "reminders", "habits"].includes(tab));
    const at = Math.max(0, old.indexOf("tasks") + 1);
    old.splice(at, 0, "notebook");
    ROLES[role].tabs = old;
  });
  VIEWS.notebook = window.notebookScreen;
  if (["agenda", "notes", "reminders", "habits"].includes(view)) view = "notebook";
  render();
})();
