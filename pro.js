/* Rimbook Pro layer — لوحة الإدارة والبحث الذكي */
(function(){
"use strict";
const $ = id => document.getElementById(id);
const D = RB.data;
const today = () => iso(new Date());
const safe = v => esc(v == null ? "" : String(v));
const money = n => (Number(n)||0).toLocaleString("ar",{minimumFractionDigits:2,maximumFractionDigits:2})+" "+(D.settings.currency||"");
const projectName = id => (D.projects||[]).find(p=>p.id===id)?.name || "عام";
const tasks = () => RB.all("task");
const events = () => RB.all("event");
const isLate = t => !t.done && t.due && t.due < today();
const taskProgress = id => {
 const a=tasks().filter(t=>t.project===id), done=a.filter(t=>t.done).length;
 return {total:a.length,done,percent:a.length?Math.round(done*100/a.length):0};
};
const pill=(txt,kind="")=>'<span class="tag '+kind+'">'+txt+'</span>';
window.proTaskFilter="open";
window.proAddTask=function(){
 const title=$("ptitle")?.value.trim(); if(!title)return toast("اكتب عنوان المهمة");
 const projectSelect=$("pproject");
 const project=projectSelect?(projectSelect.value||null):(D.activeProject||null);
 const row=RB.add({type:"task",title,due:$("pdue")?.value||"",priority:$("ppriority")?.value||"normal",project,workerId:$("ptworker")?.value||null,done:false,created:Date.now()});
 if(!row)return;
 render();toast("أضيفت المهمة");
};
window.proSetTaskFilter=function(f){window.proTaskFilter=f;render();};
window.proToggleTask=function(id,done){RB.patch(id,{done});render();};
window.proAddProject=function(){
 const name=$("ppname")?.value.trim();if(!name)return toast("اكتب اسم المشروع");
 const client=$("ppclient")?.value.trim()||"";const location=$("pplocation")?.value.trim()||"";const description=$("ppdescription")?.value.trim()||"";const startDate=$("ppstart")?.value||today();
 const budgetRaw=$("ppbudget")?.value.trim()||"",budget=budgetRaw===""?null:Number(budgetRaw);
 if(budget!==null&&(!Number.isFinite(budget)||budget<0))return toast("أدخل ميزانية صحيحة أو اتركها فارغة");
 const p={id:"p"+Date.now().toString(36),name,color:"#22d3ee",client,location,description,startDate,due:$("ppdue")?.value||"",status:"active",createdAt:Date.now()};
 if(budget!==null)p.budget=budget;
 if(!RB.transact(data=>{data.projects.push(p);data.activeProject=p.id;}))return;
 render();toast("تم إنشاء المشروع");
};
window.proFilterTaskRows=function(){
 const q=($("proTaskSearch")?.value||"").trim().toLocaleLowerCase();
 document.querySelectorAll("[data-pro-task]").forEach(el=>{
  const match=!q||(el.dataset.search||"").includes(q);
  const f=window.proTaskFilter;
  const status=f==="all"|| (f==="open"&&!el.dataset.done)||(f==="done"&&el.dataset.done==="1")||(f==="late"&&el.dataset.late==="1")||(f==="today"&&el.dataset.due===today());
  el.hidden=!(match&&status);
 });
};
function taskRow(t){
 const late=isLate(t),priority={high:["عالية","bad"],normal:["متوسطة",""],low:["منخفضة",""]}[t.priority]||["عادية",""];
 const search=(t.title+" "+projectName(t.project)).toLocaleLowerCase();
 return '<div class="item" data-pro-task data-search="'+safe(search).toLocaleLowerCase()+'" data-done="'+(t.done?"1":"0")+'" data-late="'+(late?"1":"0")+'" data-due="'+safe(t.due||"")+'"><input type="checkbox" '+(t.done?"checked":"")+' onchange="proToggleTask(\''+t.id+'\',this.checked)"><span style="min-width:0"><b>'+safe(t.title)+'</b><br><small class="muted">'+(t.due?safe(t.due):"بلا موعد")+' · '+safe(projectName(t.project))+(t.workerId?" · "+safe((D.workers||[]).find(w=>String(w.id)===String(t.workerId))?.name||"عامل"):"")+' · '+pill(priority[0],priority[1])+(late?" "+pill("متأخرة","bad"):"")+'</small></span><button onclick="editTask(\''+t.id+'\')" aria-label="تعديل">✏️</button><button class="danger" onclick="delItem(\''+t.id+'\')" aria-label="حذف">🗑</button></div>';
}
VIEWS.home=function(){
 const profile=D.profile||{};
 const hasPhoto=/^data:image\/(jpeg|png|webp);base64,/i.test(profile.photo||"");
 const avatar=hasPhoto
  ? '<img src="'+safe(profile.photo)+'" alt="الصورة الشخصية">'
  : '<span aria-hidden="true">👤</span>';
 const profileCard='<button type="button" class="home-profile" onclick="go(\'profile\')" aria-label="فتح الملف الشخصي">'+avatar+
  '<span><b>'+safe(profile.name||"ملفي الشخصي")+'</b><small>'+(profile.name?"عرض وتعديل بياناتك الشخصية":"أضف اسمك وصورتك وبياناتك")+'</small></span><strong>›</strong></button>';
 const all=tasks(),open=all.filter(t=>!t.done),late=open.filter(isLate),due=open.filter(t=>t.due===today()),ev=events().filter(e=>e.d>=today()).sort((a,b)=>(a.d+(a.t||"")).localeCompare(b.d+(b.t||""))).slice(0,4);
 const work=RB.all("work");
 const finance=rimbookFinancialSummary(work,D.invoices||[],D.purchases||[],window.rimbookInvoiceSummary,window.rimbookPurchaseAccounting);
 const dueMoney=finance.unlinkedDue+finance.invoiceRemaining,received=finance.cashReceived;
 const hasFinancialEntries=work.some(x=>["due","rec","workerDue","workerPaid","workerAdvance","advance","expense"].some(k=>Number(x[k])!==0&&Number.isFinite(Number(x[k]))))||(D.invoices||[]).length>0||(D.purchases||[]).length>0;
 const hasPayrollEntries=work.some(x=>x.workerId&&["workerDue","workerPaid","workerAdvance"].some(k=>Number(x[k])!==0&&Number.isFinite(Number(x[k]))));
 const unpaid=(D.invoices||[]).filter(i=>window.rimbookInvoiceSummary?window.rimbookInvoiceSummary(i).remaining>0:!i.paid).length;
 const activeProjects=(D.projects||[]).filter(p=>p.status!=="done"&&p.status!=="archived").length;
 const activeWorkers=(D.workers||[]).filter(w=>w.active!==false);
 const payrollDue=finance.payrollDue,payrollPaid=finance.payrollPaid,payrollAdvances=finance.payrollAdvances,payrollBalance=finance.payrollBalance;
 const purchaseTotal=finance.purchaseCost,purchaseOutstanding=finance.supplierBalance;
 const projectCards=(D.projects||[]).slice(0,4).map(p=>{const pr=taskProgress(p.id);return '<div class="item"><span><b>'+safe(p.name)+'</b><div class="progress"><div style="width:'+pr.percent+'%"></div></div><small class="muted">'+(pr.total?pr.done+'/'+pr.total+' مهام مكتملة':"لا توجد مهام مرتبطة بعد")+'</small></span>'+pill(pr.total?pr.percent+"%":"بلا مهام")+'</div>';}).join("");
 if(profile.role==="worker"){
  const worker= (D.workers||[]).find(w=>String(w.id)===String(profile.workerId||""));
  if(!worker)return window.rimbookPersonalHome?window.rimbookPersonalHome(profileCard):'<div class="card">'+profileCard+'<h2>أهلاً بك</h2></div>';
  const workerMonth=today().slice(0,7),rows=work.filter(x=>String(x.workerId||"")===String(worker.id)&&(x.d||"").startsWith(workerMonth)),reversedIds=new Set(rows.filter(x=>x.isReversal&&x.reversalOf!=null).map(x=>String(x.reversalOf)));
  const workerSummary=window.rimbookWorkerSummary?window.rimbookWorkerSummary(worker.id,workerMonth):null;
  const worked=workerSummary?workerSummary.days:rows.filter(x=>x.k==="work"&&!x.isReversal&&!x.reversedBy&&!reversedIds.has(String(x.id))).length;
  const receivedNow=workerSummary?workerSummary.paid:rows.reduce((sum,x)=>sum+(Number(x.workerPaid)||0),0);
  const dueNow=workerSummary?workerSummary.due:rows.reduce((sum,x)=>sum+(Number(x.workerDue)||0),0);
  const advancesNow=workerSummary?workerSummary.advances:rows.reduce((sum,x)=>sum+(Number(x.workerAdvance)||0),0);
  const balance=workerSummary?workerSummary.balance:dueNow-receivedNow-advancesNow;
  const recent=rows.slice().sort((a,b)=>String(b.d||"").localeCompare(String(a.d||""))||(Number(b.created)||0)-(Number(a.created)||0)).slice(0,5);
  const hasWorkerMoney=rows.some(x=>["workerDue","workerPaid","workerAdvance"].some(key=>Number(x[key])!==0&&Number.isFinite(Number(x[key]))));
  const recentHtml=recent.map(x=>{
   const label=x.isReversal?"قيد تصحيح عكسي":(x.ds||({work:"يوم عمل",holiday:"عطلة",absence:"غياب",worker_payment:"دفعة أجر",worker_advance:"سلفة",expense:"مصروف عمل",voice_log:"تسجيل صوتي"}[x.k]||x.k||"حركة"));
   const amount=x.workerDue?(" · المستحق "+money(x.workerDue)):x.workerPaid?(" · دفعة "+money(x.workerPaid)):x.workerAdvance?(" · سلفة "+money(x.workerAdvance)):"";
   return '<div class="item"><span><b>'+safe(label)+'</b><br><small class="muted">'+safe(x.d||"دون تاريخ")+amount+(reversedIds.has(String(x.id))?" · صُححت بقيد مستقل":"")+'</small></span></div>';
  }).join("")||'<p class="muted">لا توجد حركات مسجلة لهذا الشهر حتى الآن.</p>';
  return '<div class="card">'+profileCard+'<h2>أهلاً بك '+safe(profile.name||worker.name)+' 👋</h2><p class="muted">'+safe(worker.jobTitle||"العامل")+' · ملف العمل: '+safe(worker.name)+'</p><p class="muted">اختر الإجراء المناسب. ستظهر سجلاتك وحسابك المرتبطان بملفك فقط.</p><div class="grid2 worker-actions"><button class="card" type="button" onclick="voiceLedgerQuick(\'work\')" style="min-height:92px;font-size:16px">🧱<br><b>تسجيل يوم عمل</b></button><button class="card" type="button" onclick="voiceLedgerQuick(\'holiday\')" style="min-height:92px;font-size:16px">🌴<br><b>تسجيل عطلة</b></button><button class="card" type="button" onclick="voiceLedgerQuick(\'payment\')" style="min-height:92px;font-size:16px">💵<br><b>تسجيل دفعة مستلمة</b></button><button class="card" type="button" onclick="voiceLedgerQuick(\'advance\')" style="min-height:92px;font-size:16px">🤝<br><b>تسجيل سلفة</b></button><button class="card" type="button" onclick="voiceLedgerQuick(\'expense\')" style="min-height:92px;font-size:16px">🧾<br><b>تسجيل مصروف عمل</b></button><button class="card" type="button" onclick="voiceLedgerStart()" style="min-height:92px;font-size:16px">🎤<br><b>التسجيل بالصوت</b></button></div><div class="grid2" style="margin-top:10px"><button type="button" onclick="go(\'tasks\')" style="min-height:48px">📋 مهامي</button></div><p class="muted">بقية أقسام المفكرة متاحة لك من شريط التنقل ومركز «المزيد»، بينما تبقى سجلات العمال الآخرين خاصة بملفاتهم.</p><button class="p" type="button" style="width:100%;min-height:48px;margin-top:10px" onclick="go(\'voice\')">📅 مراجعة حسابي وسجل الحركات</button></div>'+
  (rows.length?'<div class="grid2"><div class="card"><small class="muted">أيام العمل هذا الشهر</small><h3>'+worked+'</h3></div>'+(hasWorkerMoney?'<div class="card"><small class="muted">المستحق</small><h3>'+money(dueNow)+'</h3></div><div class="card"><small class="muted">الدفعات المستلمة</small><h3>'+money(receivedNow)+'</h3></div><div class="card"><small class="muted">السلف</small><h3>'+money(advancesNow)+'</h3></div><div class="card"><small class="muted">المتبقي لك حتى نهاية الشهر</small><h3>'+money(balance)+'</h3></div>':'<p class="muted">لا توجد مبالغ أجور فعلية مسجلة لهذا الشهر.</p>')+'</div>':'<div class="card muted">لا توجد حسابات أو سجلات عمل فعلية لهذا الشهر بعد.</div>')+
  '<div class="card"><b>آخر حركاتك هذا الشهر</b><p class="muted">سجل شخصي للمراجعة؛ لا تُحذف القيود المالية المصححة بل تبقى ظاهرة في سجل الحساب.</p>'+recentHtml+'<div class="row"><button type="button" onclick="go(\'voice\')">فتح سجل الحساب</button><button type="button" onclick="go(\'profile\')">👤 ملفي الشخصي</button></div></div>';
 }
 const metricCards=[
  open.length?'<div class="card"><small class="muted">مهام مفتوحة</small><h3>'+open.length+'</h3></div>':"",
  late.length?'<div class="card"><small class="muted">مهام متأخرة</small><h3 class="hi">'+late.length+'</h3></div>':"",
  due.length?'<div class="card"><small class="muted">مستحقة اليوم</small><h3>'+due.length+'</h3></div>':"",
  activeProjects?'<div class="card"><small class="muted">المشاريع النشطة</small><h3>'+activeProjects+'</h3></div>':"",
  unpaid?'<div class="card"><small class="muted">فواتير غير مدفوعة</small><h3>'+unpaid+'</h3></div>':"",
  activeWorkers.length?'<div class="card"><small class="muted">العمال النشطون</small><h3>'+activeWorkers.length+'</h3></div>':""
 ].filter(Boolean).join("");
 const dashboardFinance=hasFinancialEntries?'<div class="grid2"><div class="card"><small class="muted">المستحق المالي</small><h3>'+money(dueMoney)+'</h3></div><div class="card"><small class="muted">المقبوض</small><h3 class="ok">'+money(received)+'</h3></div></div>':"";
 const purchaseCards=(D.purchases||[]).length?'<div class="grid2"><div class="card"><small class="muted">تكلفة المشتريات والمواد</small><h3>'+money(purchaseTotal)+'</h3></div><div class="card"><small class="muted">المتبقي للموردين</small><h3>'+money(purchaseOutstanding)+'</h3></div></div>':"";
 const payrollPanel='<div class="card"><b>إدارة العمال واليومية</b><div class="row"><button class="p" onclick="go(\'workers\')">👷 ملفات العمال</button><button onclick="go(\'workday\')">📅 تسجيل يومية</button><button onclick="go(\'payroll\')">💰 كشف الأجور</button></div>'+(hasPayrollEntries?'<small class="muted">إجمالي المستحق '+money(payrollDue)+' · المدفوع '+money(payrollPaid)+' · السلف '+money(payrollAdvances)+'</small>':'<p class="muted">لا توجد حركات أجور فعلية مسجلة بعد.</p>')+'</div>';
 return '<div class="card">'+profileCard+'<div class="row" style="justify-content:space-between"><span><b style="font-size:18px">لوحة الإدارة</b><br><small class="muted">'+new Date().toLocaleDateString("ar",{weekday:"long",year:"numeric",month:"long",day:"numeric"})+'</small></span>'+pill("مباشر","ok")+'</div><h2 style="margin:10px 0 0">مرحباً '+safe(profile.name||"بك")+' 👋</h2><p class="muted">هذه صورة سريعة لما يحتاج انتباهك اليوم.</p><div class="row"><button class="p" onclick="go(\'tasks\')">＋ مهمة</button><button onclick="go(\'agenda\')">＋ موعد</button><button onclick="go(\'projects\')">＋ مشروع</button><button onclick="go(\'notes\')">＋ ملاحظة</button></div></div>'+
 (metricCards?'<div class="grid3">'+metricCards+'</div>':'<div class="card muted">لا توجد مهام أو مشاريع أو حسابات مسجلة بعد. ابدأ بإضافة أول عنصر، وستظهر المؤشرات عند توفر بيانات فعلية.</div>')+
 dashboardFinance+purchaseCards+payrollPanel+
 '<div class="card"><b>⚠️ ما يحتاج انتباهك</b>'+(late.length?'<p class="hi">لديك '+late.length+' مهمة متأخرة.</p><button onclick="proSetTaskFilter(\'late\');go(\'tasks\')">عرض المتأخرات</button>':'<p class="ok">لا توجد مهام متأخرة 🎉</p>')+(due.length?'<p>لديك '+due.length+' مهام مستحقة اليوم.</p>':"")+(unpaid?'<p>تابع '+unpaid+' فاتورة لم تُسدّد بعد.</p><button onclick="go(\'invoices\')">متابعة الفواتير</button>':"")+'</div>'+
 '<div class="card"><b>📁 تقدم المشاريع</b>'+(projectCards||'<p class="muted">أنشئ مشروعك الأول لبدء المتابعة.</p>')+'<button onclick="go(\'projects\')">كل المشاريع</button></div>'+
 '<div class="card"><b>📅 المواعيد القادمة</b>'+(ev.map(e=>'<div class="item"><span><b>'+safe(e.title)+'</b><br><small class="muted">'+safe(e.d)+' '+safe(e.t||"")+'</small></span></div>').join("")||'<p class="muted">لا توجد مواعيد قادمة مسجلة.</p>')+'<button onclick="go(\'agenda\')">فتح المفكرة</button></div>'+
 (typeof suggestionsCard==="function"?suggestionsCard():"");
};
VIEWS.tasks=function(){
 const list=tasks().slice().sort((a,b)=>(a.done-b.done)||(String(a.due||"9999").localeCompare(String(b.due||"9999"))));
 const filters=[["open","مفتوحة"],["today","اليوم"],["late","متأخرة"],["done","منجزة"],["all","الكل"]];
 return '<div class="card"><b>إدارة المهام</b><div style="display:grid;gap:8px;margin-top:8px"><input id="ptitle" placeholder="عنوان المهمة..." maxlength="180"><div class="grid2"><input id="pdue" type="date" value="'+today()+'"><select id="ppriority"><option value="normal">أولوية متوسطة</option><option value="high">أولوية عالية</option><option value="low">أولوية منخفضة</option></select></div><select id="pproject"><option value="">دون مشروع</option>'+(D.projects||[]).map(p=>'<option value="'+safe(p.id)+'" '+(D.activeProject===p.id?"selected":"")+'>'+safe(p.name)+'</option>').join("")+'</select><select id="ptworker"><option value="">غير مسند لعامل</option>'+(D.workers||[]).filter(w=>w.active!==false).map(w=>'<option value="'+safe(w.id)+'">'+safe(w.name)+'</option>').join("")+'</select><button class="p" onclick="proAddTask()">حفظ المهمة</button></div></div>'+
 '<div class="card"><div class="row" style="justify-content:space-between"><b>قائمة المهام ('+list.length+')</b><input id="proTaskSearch" oninput="proFilterTaskRows()" placeholder="ابحث في المهام..." style="width:48%"></div><div class="strip" style="margin:10px 0">'+filters.map(f=>'<button class="'+(window.proTaskFilter===f[0]?"on":"")+'" onclick="proSetTaskFilter(\''+f[0]+'\')">'+f[1]+'</button>').join("")+'</div>'+(list.map(taskRow).join("")||'<p class="muted">لا توجد مهام بعد.</p>')+'</div>';
};
VIEWS.projects=function(){
 const cards=(D.projects||[]).map(p=>{
  const pr=taskProgress(p.id),w=RB.all("work").filter(x=>String(x.project||"")===String(p.id));
  const due=w.reduce((s,x)=>s+(Number(x.due)||0),0),paid=w.reduce((s,x)=>s+(Number(x.rec)||0),0);
  const workersCount=new Set(w.filter(x=>x.workerId).map(x=>String(x.workerId))).size;
  const payroll=w.reduce((s,x)=>s+(Number(x.workerDue)||0),0),expenses=w.reduce((s,x)=>s+(Number(x.expense)||0),0);
  const projectInvoices=(D.invoices||[]).filter(i=>String(i.project||"")===String(p.id));
  const invoiceAccounts=projectInvoices.map(i=>window.rimbookInvoiceSummary?window.rimbookInvoiceSummary(i):{total:0,paid:0,remaining:0});
  const invoiceTotal=invoiceAccounts.reduce((sum,row)=>sum+Math.round((Number(row.total)||0)*100),0)/100;
  const invoicePaid=invoiceAccounts.reduce((sum,row)=>sum+Math.round((Number(row.paid)||0)*100),0)/100;
  const invoiceOutstanding=invoiceAccounts.reduce((sum,row)=>sum+Math.round((Number(row.remaining)||0)*100),0)/100;
  const unlinkedReceipts=w.filter(x=>!x.invoiceId).reduce((sum,x)=>sum+(Number(x.rec)||0),0);
  const purchasesCost=window.rimbookProjectPurchasesTotal?window.rimbookProjectPurchasesTotal(p.id):0;
  const recordedCosts=Math.round((payroll+expenses+purchasesCost)*100)/100;
  const invoiceCostGap=Math.round((invoiceTotal-recordedCosts)*100)/100;
  const hasProjectFinancialData=w.some(x=>["due","rec","workerDue","workerPaid","workerAdvance","rec","expense"].some(key=>Number(x[key])!==0&&Number.isFinite(Number(x[key]))))||projectInvoices.length>0||(D.purchases||[]).some(x=>String(x.project||"")===String(p.id));
  return '<div class="card"><div class="row" style="justify-content:space-between"><b>'+safe(p.name)+'</b>'+pill(p.status==="archived"?"مؤرشف":p.status==="done"?"مكتمل":"نشط",p.status==="archived"?"bad":p.status==="done"?"ok":"")+'</div><small class="muted">'+safe(p.client||"دون عميل")+' · '+safe(p.location||"دون موقع")+'</small><div class="progress"><div style="width:'+pr.percent+'%"></div></div><small class="muted">'+pr.done+' من '+pr.total+' مهام مكتملة'+(p.startDate?" · البدء "+safe(p.startDate):"")+(p.due?" · التسليم "+safe(p.due):"")+'</small>'+(hasProjectFinancialData?'<div class="grid2" style="margin-top:8px">'+(Number(p.budget)>0?'<div><small class="muted">الميزانية</small><b>'+money(p.budget)+'</b></div>':"")+'<div><small class="muted">العمال المرتبطون</small><b>'+workersCount+'</b></div><div><small class="muted">أجور مستحقة</small><b>'+money(payroll)+'</b></div><div><small class="muted">مصروفات العمل</small><b>'+money(expenses)+'</b></div><div><small class="muted">المشتريات والمواد</small><b>'+money(purchasesCost)+'</b></div><div><small class="muted">إجمالي التكاليف المسجلة</small><b>'+money(recordedCosts)+'</b></div><div><small class="muted">فرق الفواتير عن التكاليف (مؤشر غير نهائي)</small><b>'+money(invoiceCostGap)+'</b></div><div><small class="muted">إجمالي الفواتير</small><b>'+money(invoiceTotal)+'</b></div><div><small class="muted">المقبوض على الفواتير</small><b>'+money(invoicePaid)+'</b></div><div><small class="muted">رصيد الفواتير</small><b>'+money(invoiceOutstanding)+'</b></div><div><small class="muted">مقبوضات غير مرتبطة بفواتير</small><b>'+money(unlinkedReceipts)+'</b></div><div><small class="muted">ذمم سجل العمل غير المفوترة</small><b>'+money(due)+'</b></div><div><small class="muted">إجمالي المقبوض النقدي</small><b>'+money(paid)+'</b></div></div>':"")+'<div class="row" style="margin-top:8px"><button class="p" onclick="setActiveProject(\''+p.id+'\')">فتح المشروع</button><button onclick="editProject(\''+p.id+'\')">تعديل الاسم</button><button onclick="proProjectStatus(\''+p.id+'\')">'+(p.status==="archived"?"إعادة تنشيط":p.status==="done"?"إعادة فتح":"إنهاء")+'</button><button onclick="delProject(\''+p.id+'\')">أرشفة</button></div></div>';
 }).join("");
 return '<div class="card"><b>＋ إنشاء مشروع</b><input id="ppname" maxlength="160" placeholder="اسم المشروع" style="width:100%;margin:6px 0"><div class="grid2"><input id="ppclient" placeholder="العميل أو صاحب المشروع"><input id="pplocation" placeholder="موقع المشروع"></div><textarea id="ppdescription" rows="2" placeholder="وصف المشروع ونطاق العمل" style="width:100%;margin:6px 0"></textarea><div class="grid2"><input id="ppbudget" type="number" min="0" step="0.01" placeholder="الميزانية"><input id="ppstart" type="date" value="'+today()+'" aria-label="تاريخ البدء"><input id="ppdue" type="date" aria-label="تاريخ التسليم"></div><button class="p" style="margin-top:8px" onclick="proAddProject()">إنشاء المشروع</button></div>'+ (cards||'<div class="card muted">لا توجد مشاريع. أنشئ أول مشروع لتنظيم عملك.</div>');
};
window.editProject=function(id){
 const p=D.projects.find(x=>String(x.id)===String(id));if(!p)return;
 document.getElementById("rimbook-project-edit-modal")?.remove();
 const modal=document.createElement("div");
 modal.id="rimbook-project-edit-modal";
 modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-label","تعديل بيانات المشروع");
 modal.style.cssText="position:fixed;inset:0;z-index:130;background:#000a;display:flex;align-items:center;justify-content:center;padding:14px";
 const field=(key,label,value,type="text")=>'<label class="muted" for="pr-edit-'+key+'">'+label+'</label><input id="pr-edit-'+key+'" type="'+type+'" value="'+safe(value??"")+'" style="width:100%;margin:4px 0 10px">';
 modal.innerHTML='<div class="card" style="width:min(100%,520px);max-height:88vh;overflow:auto;margin:0;background:var(--card)">'+
  '<div class="row" style="justify-content:space-between"><b>تعديل بيانات المشروع</b><button type="button" onclick="document.getElementById(\'rimbook-project-edit-modal\')?.remove()">إغلاق ✕</button></div>'+
  field("name","اسم المشروع",p.name)+field("client","العميل أو صاحب المشروع",p.client)+field("location","موقع المشروع",p.location)+
  '<label class="muted" for="pr-edit-description">وصف المشروع ونطاق العمل</label><textarea id="pr-edit-description" rows="3" style="width:100%;margin:4px 0 10px">'+safe(p.description||"")+'</textarea>'+
  field("budget","الميزانية",p.budget??"","number")+
  '<div class="grid2">'+field("start","تاريخ البدء",p.startDate||"","date")+field("due","تاريخ التسليم",p.due||"","date")+'</div>'+
  '<div class="row"><button class="p" type="button" style="flex:1" onclick="saveProjectEdit(\''+safe(id)+'\')">حفظ التعديلات</button><button type="button" onclick="document.getElementById(\'rimbook-project-edit-modal\')?.remove()">إلغاء</button></div></div>';
 document.body.append(modal);
};
window.saveProjectEdit=function(id){
 const value=key=>document.getElementById("pr-edit-"+key)?.value.trim()||"";
 const name=value("name"),budgetRaw=value("budget"),budget=budgetRaw===""?null:Number(budgetRaw),startDate=value("start"),due=value("due");
 const validDate=date=>{if(!date)return true;if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date))return false;const d=new Date(date+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date;};
 if(!name)return toast("اسم المشروع مطلوب");
 if(budget!==null&&(!Number.isFinite(budget)||budget<0))return toast("أدخل ميزانية صحيحة أو اتركها فارغة");
 if(!validDate(startDate)||!validDate(due))return toast("تحقق من تاريخ بدء المشروع والتسليم");
 if(startDate&&due&&due<startDate)return toast("تاريخ التسليم لا يمكن أن يسبق تاريخ البدء");
 const ok=RB.transact(data=>{
  const row=data.projects.find(x=>String(x.id)===String(id));
  if(!row)throw new Error("project not found");
  Object.assign(row,{name,client:value("client"),location:value("location"),description:document.getElementById("pr-edit-description")?.value.trim()||"",startDate,due});
  if(budget===null)delete row.budget;else row.budget=budget;
 });
 if(!ok)return toast("تعذر حفظ بيانات المشروع؛ لم تتغير البيانات");
 document.getElementById("rimbook-project-edit-modal")?.remove();
 render();toast("تم تحديث بيانات المشروع وحفظها");
};

window.proProjectStatus=function(id){const p=D.projects.find(x=>x.id===id);if(!p)return;const next=p.status==="archived"||p.status==="done"?"active":"done";if(!RB.transact(data=>{const row=data.projects.find(x=>x.id===id);if(row)row.status=next;}))return;render();};
VIEWS.agenda=function(){
 const upcoming=events().slice().sort((a,b)=>(String(a.d||"").localeCompare(String(b.d||""))||String(a.t||"").localeCompare(String(b.t||""))));
 return '<div class="card"><b>＋ تسجيل موعد</b><input id="etitle" placeholder="عنوان الموعد" style="width:100%;margin:6px 0"><div class="grid2"><input id="edate" type="date" value="'+today()+'"><input id="etime" type="time"></div><select id="projectId" style="width:100%;margin:8px 0"><option value="">موعد عام</option>'+(D.projects||[]).map(p=>'<option value="'+safe(p.id)+'">'+safe(p.name)+'</option>').join("")+'</select><button class="p" onclick="addEvent()">حفظ الموعد</button></div><div class="card"><b>المواعيد المسجلة ('+upcoming.length+')</b>'+(upcoming.map(e=>'<div class="item"><span><b>'+safe(e.title)+'</b><br><small class="muted">'+safe(e.d)+' '+safe(e.t||"")+' · '+safe(projectName(e.project))+'</small></span><button class="danger" onclick="delItem(\''+e.id+'\')">حذف</button></div>').join("")||'<p class="muted">لا توجد مواعيد بعد.</p>')+'</div>';
};
function rimbookFinancialSummary(workRows,invoices,purchases,invoiceSummary,purchaseAccounting){
 const cents=value=>{const n=Number(value);return Number.isFinite(n)?Math.round(n*100):0;};
 const sum=(rows,key)=>rows.reduce((total,row)=>total+cents(row&&row[key]),0);
 const invoiceAccounts=(invoices||[]).map(invoice=>invoiceSummary?invoiceSummary(invoice):{total:0,paid:0,remaining:0});
 const purchaseAccounts=(purchases||[]).map(purchase=>purchaseAccounting?purchaseAccounting(purchase):{netCost:Number(purchase.total)||0,supplierBalance:purchase.status==="cancelled"?0:Math.max(0,(Number(purchase.total)||0)-(purchase.payments||[]).reduce((total,row)=>total+(Number(row.amount)||0),0)),paid:(purchase.payments||[]).reduce((total,row)=>total+(Number(row.amount)||0),0),refunded:(purchase.refunds||[]).reduce((total,row)=>total+(Number(row.amount)||0),0)});
 const unlinked=(workRows||[]).filter(row=>!row.invoiceId);
 const invoiceSum=key=>invoiceAccounts.reduce((total,row)=>total+cents(row[key]),0);
 const purchaseSum=key=>purchaseAccounts.reduce((total,row)=>total+cents(row[key]),0);
 const invoiceTotal=invoiceSum("total"),invoicePaid=invoiceSum("paid"),invoiceRemaining=invoiceSum("remaining");
 const cashReceived=sum(workRows||[],"rec");
 const supplierCashPaid=purchaseSum("paid")-purchaseSum("refunded");
 const payrollDue=sum(workRows||[],"workerDue"),payrollPaid=sum(workRows||[],"workerPaid"),payrollAdvances=sum(workRows||[],"workerAdvance");
 const operatingExpenses=sum(workRows||[],"expense"),purchaseCost=purchaseSum("netCost"),supplierBalance=purchaseSum("supplierBalance");
 const unlinkedReceipts=sum(unlinked,"rec"),unlinkedDue=sum(unlinked,"due");
 const cashOutflow=payrollPaid+payrollAdvances+operatingExpenses+supplierCashPaid;
 return {
  invoiceTotal:invoiceTotal/100,invoicePaid:invoicePaid/100,invoiceRemaining:invoiceRemaining/100,
  cashReceived:cashReceived/100,unlinkedReceipts:unlinkedReceipts/100,unlinkedDue:unlinkedDue/100,
  payrollDue:payrollDue/100,payrollPaid:payrollPaid/100,payrollAdvances:payrollAdvances/100,
  payrollBalance:(payrollDue-payrollPaid-payrollAdvances)/100,
  operatingExpenses:operatingExpenses/100,purchaseCost:purchaseCost/100,supplierBalance:supplierBalance/100,
  supplierCashPaid:supplierCashPaid/100,cashOutflow:cashOutflow/100,netCashFlow:(cashReceived-cashOutflow)/100
 };
}
window.rimbookFinancialSummary=rimbookFinancialSummary;
VIEWS.stats=function(){
 const all=tasks(),done=all.filter(t=>t.done).length,late=all.filter(isLate).length;
 const workRows=RB.all("work");
 const finance=rimbookFinancialSummary(workRows,D.invoices||[],D.purchases||[],window.rimbookInvoiceSummary,window.rimbookPurchaseAccounting);
 const hasFinance=workRows.some(x=>["due","rec","workerDue","workerPaid","workerAdvance","advance","expense"].some(k=>Number(x[k])!==0&&Number.isFinite(Number(x[k]))))||(D.invoices||[]).length>0||(D.purchases||[]).length>0;
 const overviewCards=[
  all.length?'<div class="card">إجمالي المهام<h2>'+all.length+'</h2></div>':"",
  all.length?'<div class="card">نسبة الإنجاز<h2>'+Math.round(done*100/all.length)+'%</h2></div>':"",
  late?'<div class="card">المهام المتأخرة<h2 class="hi">'+late+'</h2></div>':"",
  (D.projects||[]).length?'<div class="card">المشاريع<h2>'+(D.projects||[]).length+'</h2></div>':""
 ].filter(Boolean).join("");
 return (overviewCards?'<div class="grid2">'+overviewCards+'</div>':'<div class="card muted">لا توجد بيانات كافية لعرض الإحصاءات بعد. ستظهر المؤشرات بعد إضافة مهام أو مشاريع فعلية.</div>')+
 (hasFinance? '<div class="card"><b>فواتير العملاء</b><p>إجمالي الفواتير: <b>'+money(finance.invoiceTotal)+'</b></p><p>المقبوض على الفواتير: <b class="ok">'+money(finance.invoicePaid)+'</b></p><p>المتبقي على الفواتير: <b class="hi">'+money(finance.invoiceRemaining)+'</b></p><p class="muted">تُحسب هذه القيم من الفواتير ودفعاتها المرتبطة فقط، ولا تُخلط مع أجور العمال أو المقبوضات العامة.</p></div>'+
 '<div class="grid2"><div class="card"><b>إجمالي النقد المقبوض</b><h3>'+money(finance.cashReceived)+'</h3></div><div class="card"><b>مقبوضات غير مرتبطة بفواتير</b><h3>'+money(finance.unlinkedReceipts)+'</h3></div><div class="card"><b>ذمم سجل العمل غير المفوترة</b><h3>'+money(finance.unlinkedDue)+'</h3></div><div class="card"><b>أجور العمال المستحقة</b><h3>'+money(finance.payrollDue)+'</h3></div><div class="card"><b>أجور مدفوعة</b><h3>'+money(finance.payrollPaid)+'</h3></div><div class="card"><b>سلف العمال</b><h3>'+money(finance.payrollAdvances)+'</h3></div><div class="card"><b>رصيد الأجور</b><h3>'+money(finance.payrollBalance)+'</h3></div><div class="card"><b>مصروفات التشغيل</b><h3>'+money(finance.operatingExpenses)+'</h3></div><div class="card"><b>تكلفة المشتريات</b><h3>'+money(finance.purchaseCost)+'</h3></div><div class="card"><b>مستحقات الموردين</b><h3>'+money(finance.supplierBalance)+'</h3></div><div class="card"><b>صافي حركة النقد المسجلة</b><h3>'+money(finance.netCashFlow)+'</h3></div></div>'
: '<div class="card muted">لا توجد بيانات مالية فعلية مسجلة بعد؛ لن تُعرض أرصدة صفرية.</div>')+ '<div class="card"><b>إنجاز المهام خلال الأسبوع</b><canvas id="chartTasks" width="400" height="180"></canvas></div><div class="card"><b>المشاريع</b><canvas id="chartProjects" width="400" height="200"></canvas></div><div class="card"><b>المقارنة الشهرية</b><canvas id="chartMonthly" width="400" height="180"></canvas>'+(typeof monthlyCompareTable==="function"?monthlyCompareTable():"")+'</div>';
};
const style=document.createElement("style");style.textContent="[data-pro-task][hidden]{display:none!important}";document.head.appendChild(style);
render();
})();
