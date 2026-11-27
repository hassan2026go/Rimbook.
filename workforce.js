/* Rimbook Workforce — workers, attendance, daily work and payroll ledger.
   All worker money movements are append-only work records; corrections use documented reversals. */
(function () {
  "use strict";
  const D = RB.data;
  if (!Array.isArray(D.workers)) D.workers = [];
  // Payroll cycle assumptions are never prefilled; the manager must define them.

  let selectedWorkerId = "";
  const $id = id => document.getElementById(id);
  const val = id => ($id(id)?.value || "").trim();
  const num = id => Number(val(id));
  const today = () => iso(new Date());
  const validDate = value => { if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false; const date=new Date(value+"T00:00:00Z"); return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value; };
  const safe = value => esc(String(value ?? ""));
  const workers = () => (RB.data.workers || []).slice().sort((a,b) => String(a.name).localeCompare(String(b.name), "ar"));
  const projects = () => RB.data.projects || [];
  const projectName = id => projects().find(p => String(p.id) === String(id))?.name || "عام";
  const money = n => Number(n || 0).toLocaleString("ar", {minimumFractionDigits:2, maximumFractionDigits:2}) + " " + safe(RB.data.settings.currency || "USD");
  const workRows = id => RB.all("work").filter(x => String(x.workerId || "") === String(id));
  const reversedWorkIds = rows => new Set(rows.filter(x=>x.isReversal&&x.reversalOf!=null).map(x=>String(x.reversalOf)));
  const digits = value => String(value || "").replace(/[٠-٩۰-۹]/g, ch => {
    const a="٠١٢٣٤٥٦٧٨٩", p="۰۱۲۳۴۵۶۷۸۹", i=a.indexOf(ch); return String(i >= 0 ? i : p.indexOf(ch));
  });
  function parseWorkerMoney(value) {
    let s = digits(value).replace(/[\s$€£]/g,"").replace(/[٬]/g,",").replace(/[٫]/g,".");
    if (!s) return NaN;
    const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      const decimal = comma > dot ? "," : ".";
      const group = decimal === "," ? /\./g : /,/g;
      s = s.replace(group,"").replace(decimal,".");
    } else {
      const separator = comma >= 0 ? "," : dot >= 0 ? "." : "";
      if (separator) {
        const parts = s.split(separator);
        if (parts.length > 2) {
          const groups = parts.slice(1,-1).every(part => part.length === 3);
          if (parts[parts.length-1].length === 2 && groups) s = parts.slice(0,-1).join("")+"."+parts[parts.length-1];
          else if (parts.slice(1).every(part => part.length === 3)) s = parts.join("");
          else return NaN;
        } else if (parts[1].length === 3 && parts[0].length > 0) s = parts.join("");
        else s = parts[0]+"."+parts[1];
      }
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(s)) return NaN;
    return Number(s);
  }
  window.rimbookParseWorkerMoney = parseWorkerMoney;
  function monthEndDate(month) {
    const match=String(month||"").match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if(!match)return "";
    return new Date(Date.UTC(Number(match[1]),Number(match[2]),0)).toISOString().slice(0,10);
  }
  function isValidLedgerDate(value) {
    const date=String(value||"");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
    const parsed=new Date(date+"T00:00:00Z");
    return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date;
  }
  function summary(id, month) {
    const allRows=workRows(id);
    const cutoff=month?monthEndDate(month):"";
    const rows=month?(cutoff?allRows.filter(x=>isValidLedgerDate(x.d)&&String(x.d).startsWith(month)&&String(x.d)<=cutoff):[]):allRows;
    const throughRows=month?(cutoff?allRows.filter(x=>isValidLedgerDate(x.d)&&String(x.d)<=cutoff):[]):allRows;
    const reversedIds=new Set(throughRows.filter(x=>x.isReversal&&x.reversalOf!=null).map(x=>String(x.reversalOf)));
    const sumHours=(source,key)=>source.reduce((total,x)=>total+(Number.isFinite(Number(x[key]))?Number(x[key]):0),0);
    const sumMoneyCents=(source,key,legacyKey)=>source.reduce((total,x)=>{
      const value=Number(x[key]??(legacyKey?x[legacyKey]:undefined));
      return total+(Number.isFinite(value)?Math.round(value*100):0);
    },0);
    const dueCents=sumMoneyCents(rows,"workerDue","due"),paidCents=sumMoneyCents(rows,"workerPaid","rec"),advanceCents=sumMoneyCents(rows,"workerAdvance","advance");
    const balanceCents=sumMoneyCents(throughRows,"workerDue","due")-sumMoneyCents(throughRows,"workerPaid","rec")-sumMoneyCents(throughRows,"workerAdvance","advance");
    return {
      rows, days: rows.filter(x => x.k === "work" && !x.isReversal && !x.reversedBy && !reversedIds.has(String(x.id))).length,
      holidays: rows.filter(x => x.k === "holiday" && !x.isReversal && !x.reversedBy && !reversedIds.has(String(x.id))).length,
      absences: rows.filter(x => x.k === "absence" && !x.isReversal && !x.reversedBy && !reversedIds.has(String(x.id))).length,
      overtime: sumHours(rows,"otHours"), due: dueCents/100,
      paid: paidCents/100, advances: advanceCents/100,
      balance: balanceCents/100
    };
  }
  window.rimbookWorkerSummary = summary;
  function workerDailyRate(worker) {
    const rate = Math.max(0,Number(worker.wageRate) || 0);
    if (worker.wageType === "weekly") { const days=Number(RB.data.settings.payrollDaysPerWeek); return Number.isFinite(days)&&days>=1&&days<=7?rate/days:NaN; }
    if (worker.wageType === "monthly") { const days=Number(RB.data.settings.payrollDaysPerMonth); return Number.isFinite(days)&&days>=1&&days<=31?rate/days:NaN; }
    return rate;
  }
  function calculateWorkerPay(status,daily,normalHours,lateHours,plannedHours,overtimeHours,overtimeRate,overtimeEnabled,holidayPercent) {
    const nonNegative=value=>{const n=Number(value);return Number.isFinite(n)?Math.max(0,n):0;};
    const plannedInput=Number(plannedHours);
    const planned=Number.isFinite(plannedInput)&&plannedInput>0?plannedInput:0;
    const dailyRate=nonNegative(daily);
    const normal=nonNegative(normalHours);
    const late=Math.min(normal,nonNegative(lateHours));
    const extraHours=nonNegative(overtimeHours);
    const extraRate=nonNegative(overtimeRate);
    const holidayRate=Math.min(100,nonNegative(holidayPercent));
    const base=status==="work" && planned>0 ? dailyRate*Math.max(0,normal-late)/planned
      : status==="holiday" ? dailyRate*holidayRate/100 : 0;
    const overtimePay=status==="work"&&overtimeEnabled ? extraHours*extraRate : 0;
    return {
      base:Math.round(base*100)/100,
      overtimePay:Math.round(overtimePay*100)/100,
      workerDue:Math.round(Math.max(0,base+overtimePay)*100)/100
    };
  }
  window.rimbookCalculateWorkerPay = calculateWorkerPay;
  window.rimbookWorkerDailyRate = function (id) {
    const worker = workers().find(w => String(w.id) === String(id));
    return worker ? workerDailyRate(worker) : 0;
  };
  function selectProjects(id) {
    return '<option value="">عام — دون مشروع</option>' + projects().map(p =>
      '<option value="' + safe(p.id) + '" ' + (String(id || "") === String(p.id) ? "selected" : "") + '>' + safe(p.name) + '</option>'
    ).join("");
  }
  function selectWorkers(id, activeOnly=true) {
    const rows = workers().filter(w => !activeOnly || w.active !== false);
    return '<option value="">اختر العامل</option>' + rows.map(w =>
      '<option value="' + safe(w.id) + '" ' + (String(id || "") === String(w.id) ? "selected" : "") + '>' + safe(w.name) + '</option>'
    ).join("");
  }
  function wageLabel(type) { return ({daily:"يومي",weekly:"أسبوعي",monthly:"شهري"})[type] || "يومي"; }

  window.rimbookAddWorker = function () {
    const name = val("wf-name"), phone = digits(val("wf-phone")), email = val("wf-email"), jobTitle = val("wf-job");
    const wageType = val("wf-type"), wageRate = num("wf-rate"), overtimeRate = num("wf-ot");
    if (!name) return toast("اكتب اسم العامل");
    if (!["daily","weekly","monthly"].includes(wageType)) return toast("اختر طريقة الأجر");
    if (!Number.isFinite(wageRate) || wageRate < 0) return toast("أدخل أجراً صحيحاً");
    if (phone && phone.replace(/\D/g,"").length < 7) return toast("تحقق من رقم الهاتف");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return toast("تحقق من البريد الإلكتروني");
    const worker = {
      id: "w" + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
      name, phone, email, jobTitle, wageType, wageRate,
      overtimeRate: Number.isFinite(overtimeRate) && overtimeRate >= 0 ? overtimeRate : null,
      projectId: val("wf-project") || null, notes: val("wf-notes"),
      active: true, createdAt: Date.now()
    };
    if (!RB.transact(data => { if (!Array.isArray(data.workers)) data.workers=[]; data.workers.push(worker); })) return;
    render(); toast("تمت إضافة العامل وحفظ ملفه");
  };

  window.rimbookEditWorker = function (id) {
    const worker = workers().find(w => String(w.id) === String(id));
    if (!worker) return;
    document.getElementById("rimbook-worker-edit-modal")?.remove();
    const modal = document.createElement("div");
    modal.id = "rimbook-worker-edit-modal";
    modal.setAttribute("role","dialog");
    modal.setAttribute("aria-modal","true");
    modal.setAttribute("aria-labelledby","wf-edit-title");
    modal.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto";
    modal.innerHTML = `
      <form id="wf-edit-form" class="card" style="width:min(620px,100%);max-height:92vh;overflow:auto;margin:auto" onsubmit="event.preventDefault();rimbookSaveWorkerEdit(${JSON.stringify(String(id))})">
        <div class="row" style="justify-content:space-between;align-items:center">
          <b id="wf-edit-title" style="font-size:18px">تعديل ملف العامل</b>
          <button type="button" aria-label="إغلاق" onclick="document.getElementById('rimbook-worker-edit-modal')?.remove()">✕</button>
        </div>
        <p class="muted">عدّل بيانات العامل كاملة. لن تتأثر يومياته أو دفعاته أو سجلاته السابقة.</p>
        <label>الاسم الكامل</label><input id="wf-edit-name" required maxlength="120" value="${safe(worker.name)}" style="width:100%;margin:4px 0 10px">
        <label>رقم الهاتف مع رمز الدولة</label><input id="wf-edit-phone" type="tel" inputmode="tel" value="${safe(worker.phone)}" placeholder="+..." style="width:100%;margin:4px 0 10px">
        <label>البريد الإلكتروني</label><input id="wf-edit-email" type="email" value="${safe(worker.email)}" placeholder="example@email.com" style="width:100%;margin:4px 0 10px">
        <label>التخصص أو المهنة</label><input id="wf-edit-job" maxlength="100" value="${safe(worker.jobTitle)}" placeholder="مثلاً: كهربائي، نجار، محاسب" style="width:100%;margin:4px 0 10px">
        <div class="grid2">
          <div><label>نظام الأجر</label><select id="wf-edit-type" style="width:100%;margin:4px 0 10px">
            <option value="daily" ${worker.wageType==="daily"?"selected":""}>يومي</option>
            <option value="weekly" ${worker.wageType==="weekly"?"selected":""}>أسبوعي</option>
            <option value="monthly" ${worker.wageType==="monthly"?"selected":""}>شهري</option>
          </select></div>
          <div><label>قيمة الأجر</label><input id="wf-edit-rate" inputmode="decimal" value="${safe(worker.wageRate)}" required style="width:100%;margin:4px 0 10px"></div>
        </div>
        <label>أجر ساعة العمل الإضافي</label><input id="wf-edit-ot" inputmode="decimal" value="${worker.overtimeRate==null?"":safe(worker.overtimeRate)}" placeholder="اتركه فارغاً لاستخدام إعداد الشركة" style="width:100%;margin:4px 0 10px">
        <label>المشروع الافتراضي</label><select id="wf-edit-project" style="width:100%;margin:4px 0 10px">${selectProjects(worker.projectId||"")}</select>
        <label>ملاحظات العامل</label><textarea id="wf-edit-notes" rows="3" style="width:100%;margin:4px 0 12px">${safe(worker.notes)}</textarea>
        <div class="row" style="justify-content:flex-end;gap:8px">
          <button type="button" onclick="document.getElementById('rimbook-worker-edit-modal')?.remove()">إلغاء</button>
          <button type="submit" class="p">حفظ جميع التعديلات</button>
        </div>
      </form>`;
    document.body.appendChild(modal);
    modal.addEventListener("click",event=>{if(event.target===modal)modal.remove();});
    modal.querySelector("#wf-edit-name")?.focus();
  };

  window.rimbookSaveWorkerEdit = function (id) {
    const worker = workers().find(w => String(w.id) === String(id));
    if (!worker) return toast("ملف العامل غير موجود");
    const field = key => document.getElementById("wf-edit-"+key);
    const name = (field("name")?.value||"").trim();
    const phone = digits(field("phone")?.value||"").trim();
    const email = (field("email")?.value||"").trim();
    const jobTitle = (field("job")?.value||"").trim();
    const wageType = field("type")?.value||"";
    const wageRate = parseWorkerMoney(field("rate")?.value||"");
    const overtimeText = (field("ot")?.value||"").trim();
    const overtimeRate = overtimeText===""?null:parseWorkerMoney(overtimeText);
    const projectId = field("project")?.value||"";
    const notes = (field("notes")?.value||"").trim();
    if (!name) return toast("اسم العامل مطلوب");
    if (phone && phone.replace(/\D/g,"").length<7) return toast("تحقق من رقم الهاتف");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return toast("تحقق من البريد الإلكتروني");
    if (!["daily","weekly","monthly"].includes(wageType)) return toast("اختر نظام أجر صحيحاً");
    if (!Number.isFinite(wageRate)||wageRate<0) return toast("أدخل قيمة أجر صحيحة");
    if (overtimeRate!==null&&(!Number.isFinite(overtimeRate)||overtimeRate<0)) return toast("أدخل أجراً صحيحاً لساعة الإضافي");
    if (projectId&&!projects().some(p=>String(p.id)===String(projectId))) return toast("المشروع المحدد غير موجود");
    if (!RB.transact(data=>{
      const row=(data.workers||[]).find(w=>String(w.id)===String(id));
      if(row){
        row.name=name;row.phone=phone;row.email=email;row.jobTitle=jobTitle;
        row.wageType=wageType;row.wageRate=wageRate;row.overtimeRate=overtimeRate;
        row.projectId=projectId||null;row.notes=notes;
      }
    })) return;
    document.getElementById("rimbook-worker-edit-modal")?.remove();
    render();toast("تم تحديث جميع بيانات العامل وحفظها");
  };

  window.rimbookArchiveWorker = function (id) {
    const worker = workers().find(w => String(w.id) === String(id));
    if (!worker) return;
    const next = worker.active === false;
    if (!confirm(next ? "إعادة تفعيل هذا العامل؟" : "أرشفة العامل؟ ستبقى جميع سجلاته وحساباته محفوظة.")) return;
    if (!RB.transact(data => { const row=data.workers.find(w=>String(w.id)===String(id)); if(row)row.active=next; })) return;
    render();
  };

  window.rimbookSelectWorker = function (id) {
    selectedWorkerId = id || "";
    go("workday");
  };

  window.rimbookRegisterWorkday = function () {
    const worker = workers().find(w => String(w.id) === String(val("wd-worker")) && w.active !== false);
    if (!worker) return toast("اختر عاملاً نشطاً");
    const date = val("wd-date") || today(), status = val("wd-status");
    const planned = Number(RB.data.settings.normalHoursPerDay);
    if (status==="work" && (!Number.isFinite(planned) || planned <= 0 || planned > 24)) return toast("حدد ساعات الدوام العادية من الإعدادات أولاً");
    const normalHours = num("wd-hours"), lateHours = num("wd-late"), otHours = num("wd-ot");
    if (!validDate(date)) return toast("تحقق من التاريخ وصحته في التقويم");
    if (!["work","holiday","absence"].includes(status)) return toast("اختر حالة الدوام");
    const existingRows=workRows(worker.id),reversedIds=reversedWorkIds(existingRows);
    const duplicate=existingRows.some(x=>x.d===date&&["work","holiday","absence"].includes(x.k)&&!x.isReversal&&!x.reversedBy&&!reversedIds.has(String(x.id)));
    if (duplicate) return toast("يوجد سجل دوام لهذا العامل في هذا التاريخ. صحّح السجل السابق بقيد عكسي قبل إعادة التسجيل.");
    if (![normalHours,lateHours,otHours].every(Number.isFinite) || (status==="work"&&normalHours<=0) || normalHours < 0 || lateHours < 0 || otHours < 0 || normalHours > planned || lateHours > normalHours || otHours > 24) {
      return toast("تحقق من الساعات: الساعات العادية لا تتجاوز ساعات الدوام المعتمدة، والتأخير لا يتجاوز ساعات العمل");
    }
    const daily = workerDailyRate(worker);
    if (["work","holiday"].includes(status) && (!Number.isFinite(daily)||daily<=0)) return toast("حدد أجر العامل وأيام دورة الأجر قبل احتساب المستحقات");
    if (status==="holiday" && (RB.data.settings.holidayPayPercent==null || RB.data.settings.holidayPayPercent==="")) return toast("حدد سياسة أجر العطلة من الإعدادات أولاً");
    const holidayPercent = Math.min(100, Math.max(0, Number(RB.data.settings.holidayPayPercent) || 0));
    const otRate = worker.overtimeRate == null ? Number(RB.data.settings.otRate) || 0 : Number(worker.overtimeRate) || 0;
    const overtimeEnabled = !!RB.data.settings.overtimeEnabled;
    const pay = calculateWorkerPay(status,daily,normalHours,lateHours,planned,otHours,otRate,overtimeEnabled,holidayPercent);
    const overtimePay = pay.overtimePay;
    const workerDue = pay.workerDue;
    const labels = {work:"يوم عمل",holiday:"عطلة",absence:"غياب"};
    const row = {
      type:"work", k:status, d:date, ds:labels[status] + " — " + worker.name,
      workerId:worker.id, person:worker.name, project:val("wd-project") || worker.projectId || null,
      normalHours:status==="work"?normalHours:0, lateHours:status==="work"?lateHours:0,
      otHours:status==="work"?otHours:0, overtimePay, overtimeRate:otRate,
      workerDue, workerPaid:0, workerAdvance:0, created:Date.now()
    };
    if (!RB.add(row)) return;
    render();
    toast("تم تسجيل " + labels[status] + " للعامل " + worker.name + (otHours && !overtimeEnabled ? "؛ سُجلت ساعات الإضافي دون أجر لأن سياسة الإضافي متوقفة" : ""));
  };

  window.rimbookCopyWorkerContact = async function (value) {
    try { await navigator.clipboard.writeText(String(value || "")); toast("تم نسخ بيانات الاتصال"); }
    catch (e) { toast("تعذر النسخ؛ انسخ البيانات يدوياً"); }
  };

  window.rimbookWorkerMoney = function (id, kind) {
    const worker = workers().find(w => String(w.id) === String(id));
    if (!worker || !["paid","advance"].includes(kind)) return;
    document.getElementById("rimbook-worker-money-modal")?.remove();
    const modal = document.createElement("div");
    modal.id = "rimbook-worker-money-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", kind === "paid" ? "تسجيل دفعة للعامل" : "تسجيل سلفة للعامل");
    modal.style.cssText = "position:fixed;inset:0;z-index:130;background:#000a;display:flex;align-items:center;justify-content:center;padding:14px";
    modal.innerHTML = '<div class="card" style="width:min(100%,440px);max-height:85vh;overflow:auto;margin:0;background:var(--card)">' +
      '<div class="row" style="justify-content:space-between"><b>' + (kind === "paid" ? "تسديد أجور العامل" : "تسجيل سلفة للعامل") +
      '</b><button type="button" onclick="document.getElementById(\'rimbook-worker-money-modal\')?.remove()">إغلاق ✕</button></div>' +
      '<p class="muted">' + esc(worker.name) + '</p>' +
      '<label class="muted" for="wf-money-amount">المبلغ</label><input id="wf-money-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="مثال: 1500 أو 1.500,75" style="width:100%;margin:4px 0 10px">' +
      '<label class="muted" for="wf-money-note">بيان الحركة (اختياري)</label><input id="wf-money-note" maxlength="180" value="' +
      (kind === "paid" ? "تسديد أجور" : "سلفة للعامل") + '" style="width:100%;margin:4px 0 10px">' +
      '<div class="row"><button class="p" type="button" style="flex:1" onclick="rimbookSaveWorkerMoney(\'' +
      String(id).replace(/\\/g,"\\\\").replace(/'/g,"\\'") + '\',\'' + kind + '\')">حفظ الحركة</button>' +
      '<button type="button" onclick="document.getElementById(\'rimbook-worker-money-modal\')?.remove()">إلغاء</button></div></div>';
    document.body.append(modal);
  };

  window.rimbookSaveWorkerMoney = function (id, kind) {
    if (!["paid","advance"].includes(kind)) return;
    const worker = workers().find(w => String(w.id) === String(id));
    if (!worker) return toast("ملف العامل غير موجود");
    const raw = document.getElementById("wf-money-amount")?.value || "";
    const amount = parseWorkerMoney(raw);
    if (!Number.isFinite(amount) || amount <= 0) return toast("أدخل مبلغاً صحيحاً أكبر من صفر");
    const note = document.getElementById("wf-money-note")?.value.trim() || "";
    const row = {
      type:"work", k:kind === "paid" ? "worker_payment" : "worker_advance",
      d:today(), ds:note || (kind === "paid" ? "تسديد أجور" : "سلفة للعامل"),
      workerId:worker.id, person:worker.name, project:worker.projectId || null,
      workerDue:0, workerPaid:kind === "paid" ? amount : 0,
      workerAdvance:kind === "advance" ? amount : 0, created:Date.now()
    };
    if (!RB.add(row)) return;
    document.getElementById("rimbook-worker-money-modal")?.remove();
    render(); toast(kind === "paid" ? "تم تسجيل دفعة العامل" : "تم تسجيل السلفة");
  };

  window.rimbookSavePayrollSettings = function () {
    const week = num("pay-days-week"), month = num("pay-days-month");
    if (!Number.isInteger(week) || week < 1 || week > 7 || !Number.isInteger(month) || month < 1 || month > 31) {
      return toast("أيام العمل يجب أن تكون أرقاماً صحيحة ضمن الحدود");
    }
    if (!RB.transact(data => {
      data.settings.payrollDaysPerWeek = week;
      data.settings.payrollDaysPerMonth = month;
      data.settings.payrollPolicyConfigured = true;
    })) return;
    render(); toast("تم حفظ إعدادات دورة الأجور");
  };

  /* ---------- Personal mode: a worker account with no worker record keeps its own ledger ---------- */
  window.rimbookPersonalSummary = function (month) {
    const owner = window.rimbookOwner;
    const rows = RB.all("work").filter(x => owner && owner.owns(x) && (!month || String(x.d || "").startsWith(month)))
      .slice().sort((a,b) => String(b.d||"").localeCompare(String(a.d||"")) || (Number(b.created)||0)-(Number(a.created)||0));
    const reversed = new Set(rows.filter(x => x.isReversal && x.reversalOf != null).map(x => String(x.reversalOf)));
    const live = rows.filter(x => !x.isReversal && !reversed.has(String(x.id)));
    const sum = key => Math.round(rows.reduce((t,x) => t + (Number(x[key]) || 0), 0) * 100) / 100;
    const due = sum("due"), paid = sum("rec"), advances = sum("advance"), expenses = sum("expense");
    return {
      rows, reversed,
      days: live.filter(x => x.k === "work").length,
      holidays: live.filter(x => x.k === "holiday").length,
      hours: live.filter(x => x.k === "work").reduce((t,x) => t + (Number(x.normalHours)||0) + (Number(x.otHours)||0), 0),
      due, paid, advances, expenses, balance: Math.round((due - paid - advances - expenses) * 100) / 100,
      hasMoney: rows.some(x => ["due","rec","advance","expense"].some(k => Number(x[k]) !== 0 && Number.isFinite(Number(x[k]))))
    };
  };
  function personalActions() {
    const btn = (kind, icon, label) => '<button class="card" type="button" onclick="voiceLedgerQuick(\''+kind+'\')" style="min-height:84px;font-size:15px">'+icon+'<br><b>'+label+'</b></button>';
    return '<div class="grid2 worker-actions">' + btn("work","🧱","تسجيل يوم وساعات عمل") + btn("holiday","🌴","تسجيل عطلة") +
      btn("payment","💵","أجر أو دفعة استلمتها") + btn("advance","🤝","سلفة") +
      '<button class="card" type="button" onclick="voiceLedgerStart()" style="min-height:84px;font-size:15px">🎤<br><b>تسجيل بالصوت</b></button>' +
      '<button class="card" type="button" onclick="go(\'notebook\')" style="min-height:84px;font-size:15px">📒<br><b>مفكرتي وجدولي</b></button></div>' +
      '<button class="p" type="button" style="width:100%;min-height:46px;margin-top:8px" onclick="notebookShareSchedule()">📤 أرسل جدولي (واتساب / رسالة / بريد)</button>';
  }
  window.rimbookPersonalHome = function (profileCard) {
    const name = RB.data.profile.name || "";
    const s = window.rimbookPersonalSummary(today().slice(0,7));
    return '<div class="card">' + (profileCard || "") + '<h2>أهلاً بك ' + safe(name) + ' 👋</h2>' +
      '<p class="muted">هذا سجلك الشخصي: سجّل ساعاتك وأيامك وأجورك وملاحظاتك وتسجيلاتك الصوتية، وأنشئ جدولك وأرسله لمن تشاء. لا يلزم ربط أي مدير أو ملف عامل.</p>' +
      personalActions() + '</div>' +
      (s.rows.length ? '<div class="grid2"><div class="card"><small class="muted">أيام العمل هذا الشهر</small><h3>'+s.days+'</h3></div><div class="card"><small class="muted">ساعات العمل</small><h3>'+s.hours+'</h3></div>' +
        (s.hasMoney ? '<div class="card"><small class="muted">المستحق</small><h3>'+money(s.due)+'</h3></div><div class="card"><small class="muted">المستلم</small><h3>'+money(s.paid)+'</h3></div><div class="card"><small class="muted">السلف</small><h3>'+money(s.advances)+'</h3></div><div class="card"><small class="muted">المتبقي</small><h3>'+money(s.balance)+'</h3></div>' : '') + '</div>'
        : '<div class="card muted">لا توجد سجلات لهذا الشهر بعد. ابدأ بتسجيل أول يوم عمل.</div>') +
      '<div class="card"><b>🔗 ربط ملف عامل — اختياري</b><p class="muted">لا حاجة إليه لاستخدام أي شيء هنا. إن اخترت لاحقاً ربط نفسك بملف عامل أنشأه مديرك فسيتغير مصدر سجلاتك إلى ذلك الملف، وتبقى سجلاتك الشخصية الحالية محفوظة منفصلة.</p><button type="button" onclick="go(\'profile\')">فتح الملف الشخصي</button></div>';
  };
  function personalLedger() {
    const s = window.rimbookPersonalSummary();
    const label = {work:"عمل",holiday:"عطلة",absence:"غياب",payment:"دفعة مستلمة",advance:"سلفة",expense:"مصروف"};
    const list = s.rows.slice(0,60).map(x => {
      const amounts = [["مستحق",x.due],["مستلم",x.rec],["سلفة",x.advance],["مصروف",x.expense]].filter(([,v]) => Number(v) !== 0 && Number.isFinite(Number(v))).map(([l,v]) => l+" "+money(v)).join(" · ");
      const hours = (Number(x.normalHours)||0) + (Number(x.otHours)||0);
      const state = x.isReversal ? " · قيد تصحيح" : s.reversed.has(String(x.id)) ? " · تم تصحيحه" : "";
      const fix = (!x.isReversal && !s.reversed.has(String(x.id))) ? '<button type="button" onclick="reverseWorkEntry('+JSON.stringify(String(x.id))+')">تصحيح</button>' : "";
      return '<div class="item"><span><b>'+safe(x.ds || label[x.k] || x.k)+'</b><br><small class="muted">'+safe(x.d||"")+(hours?' · '+hours+' ساعة':'')+(amounts?' · '+amounts:'')+state+'</small></span>'+fix+'</div>';
    }).join("");
    return '<div class="card"><b style="font-size:17px">💼 سجلي الشخصي</b><p class="muted">ساعاتك وأيامك وأجورك محفوظة على جهازك في سجل شخصي مستقل، ولا تختلط بسجلات الإدارة.</p>' +
      '<div class="grid2"><div class="card">أيام العمل<h3>'+s.days+'</h3></div><div class="card">الساعات<h3>'+s.hours+'</h3></div>' +
      (s.hasMoney ? '<div class="card">المستحق<h3>'+money(s.due)+'</h3></div><div class="card">المستلم<h3>'+money(s.paid)+'</h3></div><div class="card">السلف<h3>'+money(s.advances)+'</h3></div><div class="card">المتبقي<h3>'+money(s.balance)+'</h3></div>' : '') + '</div>' +
      personalActions() + '</div><div class="card"><b>تفاصيل الحركات</b>' + (list || '<p class="muted">لا توجد حركات بعد.</p>') + '</div>';
  }
  window.rimbookSaveWorkerNotes = function (id) {
    const box = document.getElementById("wf-note-" + id);
    if (!box) return;
    const notes = box.value.trim().slice(0, 4000);
    if (!RB.transact(data => { const row = (data.workers || []).find(x => String(x.id) === String(id)); if (row) row.notes = notes; })) return;
    toast("تم حفظ ملاحظات العامل");
  };

  VIEWS.workers = function () {
    const active = workers().filter(w => w.active !== false), archived = workers().filter(w => w.active === false);
    const cards = workers().map(w => {
      const s = summary(w.id), phone = digits(w.phone).replace(/\D/g,"");
      const actions = '<button type="button" onclick="rimbookSelectWorker(\''+safe(w.id)+'\')">سجل العمل</button>' +
        '<button type="button" onclick="rimbookWorkerMoney(\''+safe(w.id)+'\',\'paid\')">تسديد أجور</button>' +
        '<button type="button" onclick="rimbookWorkerMoney(\''+safe(w.id)+'\',\'advance\')">سلفة</button>' +
        '<button type="button" onclick="rimbookEditWorker(\''+safe(w.id)+'\')">تعديل</button>' +
        '<button type="button" onclick="rimbookArchiveWorker(\''+safe(w.id)+'\')">'+(w.active===false?"إعادة تفعيل":"أرشفة")+'</button>';
      return '<div class="card"><div class="row" style="justify-content:space-between"><b>'+safe(w.name)+'</b><span class="tag '+(w.active===false?"bad":"ok")+'">'+(w.active===false?"مؤرشف":"نشط")+'</span></div>' +
        '<p class="muted">'+safe(w.jobTitle||"دون تخصص")+(Number(w.wageRate)>0?' · أجر '+wageLabel(w.wageType)+' '+money(w.wageRate):"")+'</p>' +
        (s.rows.some(x=>["workerDue","workerPaid","workerAdvance"].some(key=>Number(x[key])!==0&&Number.isFinite(Number(x[key]))))?'<p>المستحق '+money(s.due)+' · المدفوع '+money(s.paid)+' · السلف '+money(s.advances)+'</p><h3>الرصيد المتبقي: '+money(s.balance)+'</h3>':'<p class="muted">لا توجد حركات مالية مسجلة لهذا العامل بعد.</p>') +
        (w.projectId?'<p class="muted">المشروع: '+safe(projectName(w.projectId))+'</p>':"") +
        (w.phone?'<div class="row"><a href="tel:'+safe(w.phone)+'">📞 اتصال</a><a target="_blank" rel="noopener" href="https://wa.me/'+phone+'">واتساب</a><a href="sms:'+safe(w.phone)+'">SMS</a><button type="button" onclick="rimbookCopyWorkerContact('+JSON.stringify(w.phone)+')">نسخ الرقم</button></div>':"") +
        (w.email?'<div class="row"><a href="mailto:'+safe(w.email)+'">البريد الإلكتروني</a><button type="button" onclick="rimbookCopyWorkerContact('+JSON.stringify(w.email)+')">نسخ البريد</button></div>':"") +
        '<label class="muted" for="wf-note-'+safe(w.id)+'">📝 ملاحظات خاصة بهذا العامل</label><textarea id="wf-note-'+safe(w.id)+'" rows="2" maxlength="4000" style="width:100%;margin:4px 0 6px">'+safe(w.notes||"")+'</textarea><button type="button" onclick="rimbookSaveWorkerNotes(\''+safe(w.id)+'\')">حفظ الملاحظات</button>' +
        '<div class="row">'+actions+'</div></div>';
    }).join("");
    return '<div class="card"><b style="font-size:17px">👷 إدارة العمال والموظفين</b><p class="muted">ملف مستقل لكل عامل، مرتبط بيومية العمل والمشروع والأجور والدفعات والسلف. الأرشفة تحفظ السجلات ولا تحذفها.</p>' +
      '<div class="grid2"><div class="card">العمال النشطون<h3>'+active.length+'</h3></div><div class="card">المؤرشفون<h3>'+archived.length+'</h3></div></div></div>' +
      '<div class="card"><b>إضافة عامل أو موظف</b><label class="muted">الاسم الكامل</label><input id="wf-name" maxlength="120" placeholder="اسم العامل" style="width:100%;margin:4px 0 10px">' +
      '<label class="muted">رقم الهاتف</label><input id="wf-phone" type="tel" inputmode="tel" placeholder="+..." style="width:100%;margin:4px 0 10px">' +
      '<label class="muted">البريد الإلكتروني</label><input id="wf-email" type="email" placeholder="example@email.com" style="width:100%;margin:4px 0 10px">'+
      '<label class="muted">التخصص أو المهنة</label><input id="wf-job" maxlength="100" placeholder="مثلاً: كهربائي، نجار، محاسب" style="width:100%;margin:4px 0 10px">' +
      '<label class="muted">نظام الأجر</label><select id="wf-type" style="width:100%;margin:4px 0 10px"><option value="daily">يومي</option><option value="weekly">أسبوعي</option><option value="monthly">شهري</option></select>' +
      '<label class="muted">قيمة الأجر حسب النظام المختار</label><input id="wf-rate" type="number" min="0" step="0.01" inputmode="decimal" placeholder="أدخل قيمة الأجر" style="width:100%;margin:4px 0 10px">' +
      '<label class="muted">أجر ساعة الإضافي (اختياري)</label><input id="wf-ot" type="number" min="0" step="0.01" placeholder="يستخدم إعداد الشركة عند تركه فارغاً" style="width:100%;margin:4px 0 10px">' +
      '<label class="muted">المشروع الافتراضي</label><select id="wf-project" style="width:100%;margin:4px 0 10px">'+selectProjects("")+'</select>' +
      '<label class="muted">ملاحظات</label><textarea id="wf-notes" rows="2" style="width:100%;margin:4px 0 10px"></textarea>' +
      '<button class="p" style="width:100%;min-height:46px" onclick="rimbookAddWorker()">حفظ ملف العامل</button></div>' +
      '<div class="card"><b>قائمة العمال ('+workers().length+')</b>'+(cards||'<p class="muted">لا يوجد عمال بعد. أضف أول ملف أعلاه.</p>')+'</div>';
  };

  VIEWS.workday = function () {
    const worker = workers().find(w => String(w.id) === String(selectedWorkerId));
    const settings = RB.data.settings;
    const rows = RB.all("work").filter(x => x.workerId).slice().sort((a,b) => String(b.d||"").localeCompare(String(a.d||""))).slice(0,80);
    const history = rows.map(x => '<div class="item"><span><b>'+safe(x.person||workers().find(w=>w.id===x.workerId)?.name||"عامل")+'</b> · '+safe(x.ds||x.k)+'<br><small class="muted">'+safe(x.d)+(Number(x.normalHours)>0?' · '+x.normalHours+' ساعة عادية':"")+(Number(x.otHours)>0?' · '+x.otHours+' إضافي':"")+(Number(x.workerDue)!==0?' · المستحق '+money(x.workerDue):"")+'</small></span></div>').join("");
    return '<div class="card"><b style="font-size:17px">📅 جدول العمل واليومية</b><p class="muted">سجّل الحضور أو العطلة أو الغياب، والساعات العادية والإضافية والتأخير. تُحسب المستحقات وفق نظام أجر العامل وسياسة الشركة.</p>' +
      '<label class="muted">العامل</label><select id="wd-worker" style="width:100%;margin:4px 0 10px" onchange="rimbookSetSelectedWorker(this.value)">'+selectWorkers(selectedWorkerId)+'</select>' +
      '<label class="muted">التاريخ</label><input id="wd-date" type="date" value="'+today()+'" style="width:100%;margin:4px 0 10px">' +
      '<label class="muted">حالة الدوام</label><select id="wd-status" style="width:100%;margin:4px 0 10px"><option value="work">عمل وحضور</option><option value="holiday">عطلة</option><option value="absence">غياب</option></select>' +
      '<div class="grid2"><div><label class="muted">الساعات العادية</label><input id="wd-hours" type="number" min="0" max="24" step="0.25" value="'+(Number.isFinite(Number(settings.normalHoursPerDay))&&Number(settings.normalHoursPerDay)>0?Number(settings.normalHoursPerDay):"")+'" placeholder="حدد ساعات الدوام" style="width:100%;margin:4px 0 10px"></div>' +
      '<div><label class="muted">ساعات التأخير</label><input id="wd-late" type="number" min="0" max="24" step="0.25" placeholder="ساعات التأخير" style="width:100%;margin:4px 0 10px"></div>' +
      '<div><label class="muted">الساعات الإضافية</label><input id="wd-ot" type="number" min="0" max="24" step="0.25" placeholder="الساعات الإضافية" style="width:100%;margin:4px 0 10px"></div>' +
      '<div><label class="muted">المشروع</label><select id="wd-project" style="width:100%;margin:4px 0 10px">'+selectProjects(worker?.projectId||"")+'</select></div></div>' +
      '<p class="muted">الأجر الأسبوعي يُقسم على أيام العمل الأسبوعية المحددة، والشهري على أيام العمل الشهرية المحددة. الإضافي لا يُحتسب مالياً إلا عند تفعيله في الإعدادات.</p>' +
      '<button class="p" style="width:100%;min-height:46px" onclick="rimbookRegisterWorkday()">حفظ اليومية</button></div>' +
      '<div class="card"><b>آخر سجلات اليومية</b>'+(history||'<p class="muted">لا توجد سجلات عمل بعد.</p>')+'</div>';
  };

  VIEWS.payroll = function () {
    const month = val("payroll-month") || today().slice(0,7);
    const selected = selectedWorkerId ? workers().filter(w=>String(w.id)===String(selectedWorkerId)) : workers();
    const rows = selected.map(w => { const s=summary(w.id,month); if(!s.rows.length)return '<div class="card"><b>'+safe(w.name)+'</b><p class="muted">لا توجد حركات مسجلة لهذا العامل في الشهر المحدد.</p></div>'; const hasMoney=s.rows.some(x=>["workerDue","workerPaid","workerAdvance","due","rec","advance"].some(key=>Number(x[key])!==0&&Number.isFinite(Number(x[key])))); return '<div class="card"><b>'+safe(w.name)+'</b><p class="muted">'+s.days+' يوم عمل · '+s.holidays+' عطلة · '+s.absences+' غياب · '+s.overtime+' ساعة إضافية</p>'+(hasMoney?'<div class="grid2"><div>المستحق<h3>'+money(s.due)+'</h3></div><div>المدفوع<h3>'+money(s.paid)+'</h3></div><div>السلف<h3>'+money(s.advances)+'</h3></div><div>المتبقي<h3>'+money(s.balance)+'</h3></div></div>':'<p class="muted">لا توجد مبالغ أجور فعلية مسجلة لهذا العامل في الشهر المحدد.</p>')+'</div>'; }).join("");
    const totals = selected.reduce((a,w)=>{const s=summary(w.id,month);a.due+=s.due;a.paid+=s.paid;a.advances+=s.advances;a.balance+=s.balance;return a;},{due:0,paid:0,advances:0,balance:0});
    return '<div class="card"><b style="font-size:17px">💰 كشف الأجور الشهري</b><p class="muted">المستحق والمدفوع والسلف تخص الشهر المحدد، أما الرصيد المتبقي فيشمل الأرصدة المرحلة من الأشهر السابقة حتى نهاية الشهر المختار.</p><label class="muted">الشهر</label><input id="payroll-month" type="month" value="'+safe(month)+'" onchange="render()" style="width:100%;margin:4px 0 10px">' +
      '<button type="button" onclick="selectedWorkerId=\'\';go(\'workers\')">كل العمال</button> <button type="button" onclick="window.print()">طباعة الكشف</button></div>' +
      (selected.some(w=>summary(w.id,month).rows.length)?'<div class="grid2"><div class="card">إجمالي المستحق<h3>'+money(totals.due)+'</h3></div><div class="card">إجمالي المدفوع<h3>'+money(totals.paid)+'</h3></div><div class="card">السلف<h3>'+money(totals.advances)+'</h3></div><div class="card">الرصيد المتبقي<h3>'+money(totals.balance)+'</h3></div></div>':'<div class="card muted">لا توجد حركات أجور فعلية لهذا الشهر.</div>') +
      (rows||'<div class="card"><p class="muted">لا توجد بيانات أجور لهذا الشهر.</p></div>');
  };

  window.rimbookWorkforceSettings = function () {
    const s=RB.data.settings;
    return '<div class="card"><b>سياسة دورة الأجور</b><p class="muted">تُستخدم هذه القيم لتحويل الأجر الأسبوعي أو الشهري إلى قيمة يومية عند احتساب اليومية. غيّرها وفق أيام العمل الفعلية في شركتك.</p>' +
      '<label class="muted">أيام العمل في الأسبوع</label><input id="pay-days-week" type="number" min="1" max="7" step="1" value="'+(Number.isFinite(Number(s.payrollDaysPerWeek))&&Number(s.payrollDaysPerWeek)>0?Number(s.payrollDaysPerWeek):"")+'" placeholder="حدد أيام العمل" style="width:100%;margin:4px 0 10px">' +
      '<label class="muted">أيام العمل في الشهر</label><input id="pay-days-month" type="number" min="1" max="31" step="1" value="'+(Number.isFinite(Number(s.payrollDaysPerMonth))&&Number(s.payrollDaysPerMonth)>0?Number(s.payrollDaysPerMonth):"")+'" placeholder="حدد أيام العمل" style="width:100%;margin:4px 0 10px">' +
      '<button class="p" onclick="rimbookSavePayrollSettings()">حفظ سياسة دورة الأجور</button></div>';
  };
  const oldSettings = VIEWS.settings;
  VIEWS.settings = function () {
    let html = oldSettings();
    if (RB.data.profile.role === "worker") {
      const start = html.indexOf('<div class=card><b>💼 سياسة الأجور والحسابات</b>');
      if (start >= 0) {
        const end = html.indexOf("</div>", start);
        if (end >= 0) html = html.slice(0, start) + html.slice(end + 6);
      }
    }
    return html + (RB.data.profile.role === "worker" ? '<div class="card"><b>👤 حساب العامل</b><p class="muted">كل ما في التطبيق يعمل دون ربط. يمكنك اختيارياً ربط نفسك بملف عامل من ملفك الشخصي، أو الاكتفاء بسجلك الشخصي.</p><div class="row"><button type="button" class="p" onclick="go(\'profile\')">ملفي الشخصي وربط العامل</button><button type="button" onclick="go(\'ledger\')">سجل عملي وحساباتي</button></div></div>' : window.rimbookWorkforceSettings()) +
      (typeof langPicker === "function" ? langPicker() : "");
  };


  const managerLedgerView = VIEWS.ledger;
  VIEWS.ledger = function () {
    if (RB.data.profile.role !== "worker") return managerLedgerView();
    const workerId = RB.data.profile.workerId;
    if (!workerId || !workers().some(x => String(x.id) === String(workerId) && x.active !== false)) return personalLedger();
    const s = summary(workerId);
    const rows = workRows(workerId).slice().sort((a,b)=>String(b.d||"").localeCompare(String(a.d||"")));
    const hasMoney=rows.some(x=>["workerDue","workerPaid","workerAdvance"].some(key=>Number(x[key])!==0&&Number.isFinite(Number(x[key]))));
    const history = rows.map(x => {
      const amounts=[["مستحق",x.workerDue],["مدفوع",x.workerPaid],["سلفة",x.workerAdvance]].filter(([,value])=>Number(value)!==0&&Number.isFinite(Number(value))).map(([label,value])=>label+" "+money(value)).join(" · ");
      return '<div class="item"><span><b>'+safe(x.ds||x.k||"حركة")+'</b><br><small class="muted">'+safe(x.d||"")+(amounts?' · '+amounts:"")+(x.isReversal?' · قيد عكسي':x.reversedBy?' · تم تصحيحه':'')+'</small></span></div>';
    }).join("");
    return '<div class="card"><b style="font-size:17px">💼 سجل عملي وحساباتي</b><p class="muted">هذه البيانات تخص ملف العامل المرتبط بك فقط.</p>'+(rows.length?'<div class="grid2"><div class="card">أيام العمل<h3>'+s.days+'</h3></div><div class="card">العطل<h3>'+s.holidays+'</h3></div>'+(hasMoney?'<div class="card">إجمالي المستحق<h3>'+money(s.due)+'</h3></div><div class="card">المدفوع<h3>'+money(s.paid)+'</h3></div><div class="card">السلف<h3>'+money(s.advances)+'</h3></div><div class="card">الرصيد المتبقي<h3>'+money(s.balance)+'</h3></div>':'')+'</div>':'<p class="muted">لا توجد حركات مرتبطة بملفك بعد؛ سيبقى الحساب خالياً حتى تسجل حركة فعلية.</p>')+'<button class="p" onclick="go(\'voice\')">🎙️ تسجيل أو استماع</button></div><div class="card"><b>تفاصيل الحركات</b>'+(history||'<p class="muted">لا توجد حركات مرتبطة بملفك بعد.</p>')+'</div>';
  };

  const managerTasksView = VIEWS.tasks;
  VIEWS.tasks = function () {
    if (RB.data.profile.role !== "worker") return managerTasksView();
    const workerId = RB.data.profile.workerId;
    if (!workerId || !workers().some(x => String(x.id) === String(workerId) && x.active !== false)) return '<div class="card"><b>📋 مهامي</b><p class="muted">لا توجد مهام مسندة لأنك تستخدم التطبيق شخصياً دون ملف عامل. جدولك ومواعيدك وملاحظاتك متاحة كاملة في المفكرة، ولا يلزم أي ربط.</p><div class="row"><button class="p" onclick="go(\'notebook\')">📒 فتح المفكرة</button><button onclick="notebookShareSchedule()">📤 أرسل جدولي</button></div></div>';
    const rows = RB.all("task").filter(task => String(task.workerId || "") === String(workerId))
      .sort((a,b)=>(a.done-b.done)||String(a.due||"9999").localeCompare(String(b.due||"9999")));
    return '<div class="card"><b>📋 مهامي المسندة</b><p class="muted">تظهر هنا المهام المسندة إلى ملفك فقط. يمكنك تحديث حالة الإنجاز.</p>' +
      (rows.map(task => '<div class="item"><input type="checkbox" '+(task.done?"checked":"")+' onchange="proToggleTask('+JSON.stringify(task.id)+',this.checked)"><span><b>'+safe(task.title)+'</b><br><small class="muted">'+safe(task.due||"بلا موعد")+' · '+safe(projectName(task.project))+'</small></span><span class="tag">'+(task.done?"منجزة":"مفتوحة")+'</span></div>').join("") || '<p class="muted">لا توجد مهام مسندة إليك حالياً.</p>') +
      '</div>';
  };
  TABS.workers=["👷","العمال"];
  TABS.workday=["📅","اليومية"];
  TABS.payroll=["💰","الأجور"];
  TABS.more=["☰","المزيد"];
  ROLES.employee.tabs=["home","projects","workers","workday","ledger","notebook","more"];
  ROLES.worker.tabs=["home","projects","notebook","tasks","ledger","voice","more"];
  VIEWS.more=function(){
    const manager=RB.data.profile.role!=="worker";
    const items=manager
      ? [["tasks","المهام","check-square"],["payroll","كشف الأجور","wallet"],["contacts","العملاء والموردون","contact-round"],["purchases","المشتريات والمواد","package"],["invoices","الفواتير والإيصالات","receipt"],["stats","التقارير والإحصاء","chart-no-axes-combined"],["profile","الملف الشخصي","user-round"],["settings","الإعدادات","settings"],["sync","التخزين والنسخ الاحتياطي","database"],["integrations","الاتصالات والخدمات","plug"],["about","دليل الاستخدام","book-open"],["share","مشاركة التطبيق","share-2"]]
      : [["projects","المشاريع","folder"],["agenda","المواعيد والمفكرة","calendar-days"],["tasks","مهامي","check-square"],["ledger","سجل العمل والحسابات","wallet"],["notebook","الملاحظات","book-open"],["voice","التسجيل والاستماع","mic"],["profile","ملفي الشخصي وربط العامل","user-round"],["settings","الإعدادات والمظهر","settings"],["sync","النسخ الاحتياطي","database"],["stats","التقارير والإحصاء","chart-no-axes-combined"],["contacts","جهات الاتصال","contact-round"],["purchases","المشتريات","package"],["invoices","الفواتير والإيصالات","receipt"],["integrations","الإضافات","plug"],["about","حول التطبيق","info"],["share","مشاركة التطبيق","share-2"]];
    return '<div class="card"><b style="font-size:18px">مراكز Rimbook</b><p class="muted">جميع الوظائف الإضافية مرتبة هنا دون ازدحام شريط التنقل.</p><div class="grid2">'+items.map(item=>'<button class="card" type="button" style="min-height:76px;text-align:right" onclick="go(\''+item[0]+'\')"><b>'+item[1]+'</b></button>').join("")+'</div></div>';
  };
  render();
})();
