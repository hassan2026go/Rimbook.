/* Rimbook activation layer */
(function(){
 const D=RB.data;
 D.profile=Object.assign({name:"",role:"employee",phone:"",email:"",city:"",skills:"",about:""},D.profile||{});
 D.settings=Object.assign({theme:"dark",fs:15,currency:"USD",managerPhone:"",enabled:{}},D.settings||{});
 ["items","projects","workers","purchases","habits","goals","contacts","invoices"].forEach(k=>{if(!Array.isArray(D[k]))D[k]=[];});
 if(!D.settings.rimbookNumericDefaultsCleanedV2){
  if(!D.settings.payrollPolicyConfigured){
   if(D.settings.dailyRate===0)delete D.settings.dailyRate;
   if(D.settings.otRate===0)delete D.settings.otRate;
   if(D.settings.normalHoursPerDay===8)delete D.settings.normalHoursPerDay;
   if(D.settings.holidayPayPercent===0)delete D.settings.holidayPayPercent;
   if(D.settings.payrollDaysPerWeek===6)delete D.settings.payrollDaysPerWeek;
   if(D.settings.payrollDaysPerMonth===26)delete D.settings.payrollDaysPerMonth;
  }
  D.settings.rimbookNumericDefaultsCleanedV2=true;
  RB.save();
 }
 if(!D.settings.enabled)D.settings.enabled={};
 if(!ROLES[D.profile.role])D.profile.role="employee";
 const tabs=["home","projects","agenda","tasks","notes","habits","goals","ledger","contacts","invoices","profile","stats","sync","integrations","settings","about"];
 const names={home:["🏠","الرئيسية"],projects:["📁","المشاريع"],agenda:["📅","المواعيد"],tasks:["✅","المهام"],notes:["📝","الملاحظات"],habits:["🔥","العادات"],goals:["🎯","الأهداف"],ledger:["💼","العمل"],contacts:["👥","جهات الاتصال"],invoices:["🧾","الفواتير"],profile:["👤","الملف"],stats:["📊","الإحصاءات"],sync:["🔄","النسخ والمزامنة"],integrations:["🧩","الإضافات"],settings:["⚙️","الإعدادات"],about:["ℹ️","حول"]};
 Object.assign(TABS,names);ROLES.employee.tabs=tabs;ROLES.worker.tabs=tabs.filter(x=>x!=="goals");
 const $v=id=>document.getElementById(id)?.value||"";
 const n=id=>Number($v(id))||0;
 const today=()=>iso(new Date());
 const escv=s=>esc(s);
 const list=t=>RB.all(t).slice().sort((a,b)=>(b.created||0)-(a.created||0));
 const proj=id=>D.projects.find(p=>p.id===id)?.name||"عام";
 const active=()=>D.projects.find(p=>p.id===D.activeProject)||null;
 const field=(id,label,type,placeholder,value)=>'<label class="muted">'+label+'</label><input id="'+id+'" type="'+(type||"text")+'" placeholder="'+(placeholder||"")+'" value="'+escv(value||"")+'" style="width:100%;margin:4px 0 10px">';
 const select=(id,label,opts,chosen)=>'<label class="muted">'+label+'</label><select id="'+id+'" style="width:100%;margin:4px 0 10px">'+opts.map(o=>'<option value="'+escv(o[0])+'" '+(o[0]===chosen?"selected":"")+'>'+escv(o[1])+'</option>').join("")+'</select>';
function projectOptions(projects, selected) {
    const rows = Array.isArray(projects) ? projects.filter(p => p && p.id != null && String(p.name || "").trim()) : [];
    const validSelected = rows.some(p => String(p.id) === String(selected)) ? String(selected) : "";
    return { options: [["", "عام — غير مرتبط بمشروع"], ...rows.map(p => [String(p.id), String(p.name)])], selected: validSelected, hasProjects: rows.length > 0 };
  }
  const selectedProject=()=>{const el=document.getElementById("projectId");return el?(el.value||null):(D.activeProject||null);};
  const projectField=()=>{
    const data = projectOptions(D.projects, D.activeProject);
    return select("projectId","المشروع (اختياري)",data.options,data.selected) +
      (data.hasProjects
        ? '<p class="muted">اختر مشروعاً لربط السجل به، أو اتركه «عام» إذا لم يكن تابعاً لمشروع.</p>'
        : '<p class="muted">«عام» يعني أن السجل غير مرتبط بمشروع. أنشئ مشروعاً من صفحة المشاريع ليظهر هنا تلقائياً.</p><button type="button" onclick="go(\'projects\')">إنشاء مشروع</button>');
  };
 const empty=m=>'<p class="muted" style="text-align:center;padding:12px">'+m+'</p>';
 const box=(title,body)=>'<div class="card"><b>'+title+'</b>'+body+'</div>';
 window.activeProj=active;
 window.dayEvents=date=>list("event").filter(e=>e.d===date);
 window.ledgerTotals=()=>list("work").reduce((a,w)=>{const due=+(w.workerDue??w.due)||0,rec=+(w.workerPaid??w.rec)||0,adv=+(w.workerAdvance??w.advance)||0,expense=+w.expense||0;a.due+=due;a.rec+=rec;a.adv+=adv;a.expenses+=expense;a.rem+=due-rec-adv;return a;},{due:0,rec:0,adv:0,expenses:0,rem:0});
 window.dl=(name,content,type)=>{const u=URL.createObjectURL(new Blob([content],{type:type||"text/plain"}));const a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);};
 window.backupLocal=()=>dl("rimbook-backup-"+today()+".json",JSON.stringify(D,null,2),"application/json");
  window.csvW=()=>{const all=list("work"),reversedIds=new Set(all.filter(x=>x.isReversal&&x.reversalOf!=null).map(x=>String(x.reversalOf))),rows=[["التاريخ","النوع","البيان","مستحق","واصل","سلفة","مصروف","إضافي","معكوس؟","مرجع القيد الأصلي","سبب التصحيح","المشروع"]];all.forEach(w=>rows.push([w.d,w.k,w.ds,w.workerDue??w.due,w.workerPaid??w.rec,w.workerAdvance??w.advance,w.expense,w.ot,w.isReversal?"نعم":reversedIds.has(String(w.id))?"تم عكس الأصل":"لا",w.reversalOf||"",w.correctionReason||"",proj(w.project)]));dl("rimbook-work.csv","\uFEFF"+rows.map(r=>r.map(x=>'"'+String(x??"").replace(/"/g,'""')+'"').join(",")).join("\r\n"),"text/csv;charset=utf-8");};
 window.exportICS=()=>{const out=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Rimbook//AR"];list("event").forEach(e=>out.push("BEGIN:VEVENT","UID:"+e.id+"@rimbook","DTSTART:"+(e.d||today()).replace(/-/g,"")+"T"+(e.t||"0900").replace(":","")+"00","SUMMARY:"+(e.title||"موعد").replace(/[\r\n,;]/g," "),"END:VEVENT"));out.push("END:VCALENDAR");dl("rimbook.ics",out.join("\r\n"),"text/calendar");};
 window.wText=()=> "Rimbook "+today();
 window.shareW=()=>window.open("https://wa.me/"+String(D.settings.managerPhone||"").replace(/\D/g,"")+"?text="+encodeURIComponent(wText()),"_blank");
 window.restoreLocal=input=>{const f=input.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const obj=JSON.parse(r.result);if(!obj||!Array.isArray(obj.items))throw 0;if(confirm("استبدال البيانات الحالية بالنسخة؟")){RB.replace(obj);render();toast("تمت الاستعادة");}}catch(e){toast("ملف غير صالح");}};r.readAsText(f);};
 function go(t){view=t;render();window.scrollTo(0,0);}
 window.go=go;
  window.shareRimbook=async()=>{
    try {
      if(typeof window.rimbookShareApp==="function") {
        await window.rimbookShareApp();
        return;
      }
      const url="https://github.com/hassan2026go/rimbook/releases/latest";
      const text="مفكرة Rimbook لإدارة الأعمال والمشاريع والعمال والحسابات.";
      if(typeof navigator.share==="function") {
        await navigator.share({title:"Rimbook",text,url});
        return;
      }
      toast("المشاركة المباشرة غير متاحة في هذه النسخة؛ لم يتم نسخ أي رابط.");
    } catch(error) {
      if(error&&error.name!=="AbortError")toast("تعذرت مشاركة Rimbook: "+(error.message||"خطأ غير معروف"));
    }
  };

  window.createProject=()=>{const name=$v("pname").trim();if(!name)return toast("اكتب اسم المشروع");const p={id:"p"+Date.now(),name,color:"#22d3ee",budget:n("pbudget")};if(!RB.transact(data=>{data.projects.push(p);data.activeProject=p.id;}))return;render();toast("تم إنشاء المشروع");};
  window.editProject=id=>{
    const p=D.projects.find(x=>String(x.id)===String(id));if(!p)return;
    const value=prompt("اسم المشروع",p.name);if(value===null)return;
    const name=value.trim();if(!name)return toast("اسم المشروع لا يمكن أن يكون فارغاً");
    const raw=prompt("ميزانية المشروع",String(p.budget??0));if(raw===null)return;
    const normalized=String(raw).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٬,\s]/g,"").replace(/٫/g,".");
    const budget=Number(normalized);if(!Number.isFinite(budget)||budget<0)return toast("أدخل ميزانية صحيحة لا تقل عن صفر");
    if(!RB.transact(data=>{const row=data.projects.find(x=>String(x.id)===String(id));if(row){row.name=name;row.budget=budget;}}))return;
    render();toast("تم تحديث اسم المشروع وميزانيته");
  };
  window.setActiveProject=id=>{if(!RB.transact(data=>{data.activeProject=id||null;}))return;render();};
  window.delProject=id=>{
    const project=D.projects.find(p=>String(p.id)===String(id));if(!project)return;
    if(project.status==="archived")return toast("هذا المشروع مؤرشف بالفعل");
    const linkedItems=D.items.filter(x=>String(x.project||"")===String(id)).length;
    const linkedInvoices=(D.invoices||[]).filter(x=>String(x.project||"")===String(id)).length;
    const linkedPurchases=(D.purchases||[]).filter(x=>String(x.projectId||"")===String(id)).length;
    const linkedWorkers=(D.workers||[]).filter(x=>String(x.projectId||"")===String(id)).length;
    const linked=linkedItems+linkedInvoices+linkedPurchases+linkedWorkers;
    const message="سيتم أرشفة المشروع مع الاحتفاظ بكل المهام واليوميات والحسابات والفواتير والمشتريات والارتباطات كما هي"+
      (linked?" (السجلات المرتبطة: "+linked+").":"." )+
      " ويمكن إعادة تنشيطه لاحقاً. هل تريد المتابعة؟";
    if(!confirm(message))return;
    if(!RB.transact(data=>{
      const row=data.projects.find(p=>String(p.id)===String(id));
      if(!row)return;
      row.status="archived";
      row.archivedAt=Date.now();
      if(String(data.activeProject||"")===String(id))data.activeProject=null;
    }))return;
    render();toast("تمت أرشفة المشروع مع الحفاظ على سجلاته وارتباطاته");
  };
  window.addTask=()=>{const title=$v("ttitle").trim();if(!title)return toast("اكتب المهمة");if(!RB.add({type:"task",title,due:$v("tdue"),priority:$v("tpriority"),project:selectedProject(),done:false}))return;render();};
 window.toggleTask=(id,v)=>{RB.patch(id,{done:v});render();};
 window.editTask=id=>{
    const task=D.items.find(x=>String(x.id)===String(id)&&x.type==="task");if(!task)return;
    const title=prompt("عنوان المهمة",task.title||"");if(title===null)return;
    if(!title.trim())return toast("عنوان المهمة مطلوب");
    const due=prompt("موعد الاستحقاق YYYY-MM-DD (اتركه فارغاً لإزالة الموعد)",task.due||"");if(due===null)return;
    const date=due.trim();
    if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return toast("صيغة التاريخ غير صحيحة");
    if(date){const d=new Date(date+"T00:00:00Z");if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)return toast("هذا التاريخ غير موجود في التقويم");}
    const p=prompt("الأولوية: منخفضة أو متوسطة أو عالية",({low:"منخفضة",normal:"متوسطة",high:"عالية"})[task.priority]||"متوسطة");if(p===null)return;
    const priority=({"منخفضة":"low","متوسطة":"normal","عالية":"high"})[p.trim()];
    if(!priority)return toast("اختر أولوية صحيحة");
    const projects=D.projects||[],current=projects.findIndex(x=>String(x.id)===String(task.project||""));
    const choices=["0 — دون مشروع",...projects.map((x,i)=>(i+1)+" — "+x.name)].join("\n");
    const raw=prompt("المشروع المرتبط:\n"+choices,current<0?"0":String(current+1));if(raw===null)return;
    const pick=raw.trim()===""?0:Number(raw);
    if(!Number.isInteger(pick)||pick<0||pick>projects.length)return toast("اختيار المشروع غير صحيح");
    const project=pick===0?null:projects[pick-1].id;
    if(!RB.transact(data=>{const row=data.items.find(x=>String(x.id)===String(id)&&x.type==="task");if(row)Object.assign(row,{title:title.trim(),due:date,priority,project});}))return;
    render();toast("تم تحديث المهمة وموعدها وأولويتها ومشروعها");
  };
  window.addEvent=()=>{const title=$v("etitle").trim();if(!title)return toast("اكتب الموعد");if(!RB.add({type:"event",title,d:$v("edate")||today(),t:$v("etime"),project:selectedProject()}))return;render();};
  window.addNote=()=>{const body=$v("nbody").trim();if(!body)return toast("اكتب الملاحظة");if(!RB.add({type:"note",title:$v("ntitle"),body,d:today(),project:selectedProject()}))return;render();toast("تم حفظ الملاحظة");};
 window.editNote=id=>{
    const note=D.items.find(x=>String(x.id)===String(id)&&x.type==="note");if(!note)return;
    const title=prompt("عنوان الملاحظة",note.title||"");if(title===null)return;
    const body=prompt("نص الملاحظة",note.body||"");if(body===null)return;
    if(!body.trim())return toast("لا يمكن حفظ ملاحظة فارغة");
    if(!RB.transact(data=>{const row=data.items.find(x=>String(x.id)===String(id)&&x.type==="note");if(row){row.title=title.trim();row.body=body.trim();}}))return;
    render();toast("تم تعديل عنوان الملاحظة ونصها");
  };
  window.delItem=id=>{
    const row=D.items.find(item=>String(item.id)===String(id));if(!row)return toast("لم نعثر على السجل");
    if(row.type==="work")return toast("حذف الحركات المالية متوقف حفاظاً على الحقوق. يجب تصحيحها بقيد عكسي موثق، لا بمحوها.");
    if(!confirm("هل تريد حذف هذا السجل؟"))return;
    if(!RB.remove(id))return;
    render();
  };
 window.addHabit=()=>{const name=$v("hname").trim();if(!name)return;D.habits.push({id:"h"+Date.now(),name,history:[]});RB.save();render();};
 window.markHabit=id=>{const h=D.habits.find(x=>x.id===id);if(!h)return;h.history=h.history||[];h.history.includes(today())?h.history=h.history.filter(x=>x!==today()):h.history.push(today());RB.save();render();};
 window.delHabit=id=>{D.habits=D.habits.filter(x=>x.id!==id);RB.save();render();};
function goalProgress(current, target) {
    const c = Number(current), t = Number(target);
    const done = Number.isFinite(c) && c >= 0 ? c : 0;
    const total = Number.isFinite(t) && t > 0 ? t : 0;
    const percent = total > 0 ? Math.min(100, Math.max(0, done / total * 100)) : 0;
    return { done, total, percent, remaining: Math.max(0, total - done), exceeded: total > 0 && done > total };
  }
  window.goalProgress = goalProgress;
  window.toggleGoalCustomUnit=value=>{
    const input=document.getElementById("gcustomunit"),label=document.getElementById("gcustomunit-label");
    const show=value==="other";
    if(input)input.hidden=!show;
    if(label)label.hidden=!show;
  };
  window.addGoal=()=>{
    const name=$v("gname").trim(), target=Number($v("gtarget")), currentRaw=$v("gcurrent").trim(), current=currentRaw===""?null:Number(currentRaw);
    const selectedUnit=$v("gunit"), customUnit=$v("gcustomunit").trim();
    const unit=selectedUnit==="other"?customUnit:selectedUnit;
    if(!name)return toast("اكتب ما تريد إنجازه");
    if(!Number.isFinite(target)||target<=0)return toast("أدخل رقماً مستهدفاً أكبر من صفر");
    if(current!==null&&(!Number.isFinite(current)||current<0))return toast("الإنجاز الحالي يجب أن يكون صفراً أو أكثر");
    if(!unit)return toast("اكتب وحدة القياس");
    const goal={id:"g"+Date.now().toString(36),name,target,unit,created:Date.now()};if(current!==null)goal.current=current;
    if(!RB.transact(data=>{data.goals.push(goal);}))return;
    render();toast("تم حفظ الهدف");
  };
  window.updateGoal=id=>{
    const g=D.goals.find(x=>String(x.id)===String(id));if(!g)return;
    const input=document.getElementById("goal-current-"+id);
    const raw=input?.value?.trim()||"",value=raw===""?null:Number(raw);
    if(value!==null&&(!Number.isFinite(value)||value<0))return toast("أدخل إنجازاً صحيحاً لا يقل عن صفر أو اتركه فارغاً لمسح التقدم");
    if(!RB.transact(data=>{const row=data.goals.find(x=>String(x.id)===String(id));if(row){if(value===null)delete row.current;else row.current=value;}}))return;
    render();toast("تم تحديث الإنجاز");
  };
  window.delGoal=id=>{
    if(!confirm("هل تريد حذف هذا الهدف؟"))return;
    if(!RB.transact(data=>{data.goals=data.goals.filter(x=>String(x.id)!==String(id));}))return;
    render();
  };
  window.addWork=()=>{
  const kind=$v("wtype"),date=$v("wdate")||today(),row={type:"work",k:kind,d:date,ds:$v("wdesc"),project:selectedProject()};
  const rawDue=$v("wdue"),rawPaid=$v("wrec"),rawExpense=$v("wexpense"),rawOt=$v("wot");
  if(!["work","payment","expense"].includes(kind))return toast("اختر نوع حركة صحيحاً");
  if(kind==="payment"){const amount=Number(rawPaid);if(!rawPaid||!Number.isFinite(amount)||amount<=0)return toast("أدخل مبلغ الدفعة الفعلي");row.rec=amount;}
  if(kind==="expense"){const amount=Number(rawExpense);if(!rawExpense||!Number.isFinite(amount)||amount<=0)return toast("أدخل مبلغ المصروف الفعلي");row.expense=amount;}
  if(kind==="work"){
    if(rawDue!==""){const amount=Number(rawDue);if(!Number.isFinite(amount)||amount<0)return toast("تحقق من مبلغ المستحق");if(amount>0)row.due=amount;}
    if(rawPaid!==""){const amount=Number(rawPaid);if(!Number.isFinite(amount)||amount<0)return toast("تحقق من مبلغ الواصل");if(amount>0)row.rec=amount;}
    if(rawOt!==""){const hours=Number(rawOt);if(!Number.isFinite(hours)||hours<0)return toast("تحقق من الساعات الإضافية");if(hours>0)row.ot=hours;}
  }
  if(!RB.add(row))return;
  render();
};
 window.saveProfile=()=>{Object.assign(D.profile,{name:$v("prname"),phone:$v("prphone"),email:$v("premail"),city:$v("prcity"),about:$v("prabout")});RB.save();render();toast("تم حفظ الملف");};
 window.saveSettings=()=>{D.settings.theme=$v("theme")||D.settings.theme;D.settings.fs=Math.max(12,Math.min(24,n("fs")||15));D.settings.currency=$v("currency")||D.settings.currency;const role=$v("role");if(["employee","worker"].includes(role))D.profile.role=role;const daily=document.getElementById("drate"),overtime=document.getElementById("orate");if(daily)D.settings.dailyRate=Number(daily.value)||0;if(overtime)D.settings.otRate=Number(overtime.value)||0;const manager=document.getElementById("manager");if(manager)D.settings.managerPhone=manager.value.trim();RB.save();render();};
 window.deleteItem=window.delItem;
 VIEWS.home=()=>{const open=list("task").filter(t=>!t.done).length,ev=dayEvents(today()),L=ledgerTotals();return box("أهلاً "+escv(D.profile.name||"بك")+" 👋",'<p class=muted>'+new Date().toLocaleDateString("ar")+'</p><div class=grid3><div class=card>مهام مفتوحة<h3>'+open+'</h3></div><div class=card>مشاريع<h3>'+D.projects.length+'</h3></div><div class=card>مواعيد اليوم<h3>'+ev.length+'</h3></div></div><div class=grid2><div class=card>مستحق<h3>'+L.due.toFixed(2)+'</h3></div><div class=card>واصل<h3>'+L.rec.toFixed(2)+'</h3></div></div><button class=p onclick="go(\'tasks\')">المهام</button> <button onclick="go(\'agenda\')">المواعيد</button>')+(typeof suggestionsCard==="function"?suggestionsCard():"");};
 VIEWS.projects=()=>box("مشروع جديد",field("pname","اسم المشروع","text","اسم المشروع")+field("pbudget","الميزانية","number","الميزانية (اختياري)","")+'<button class=p onclick="createProject()">إنشاء</button>')+box("المشاريع ("+D.projects.length+")",D.projects.map(p=>'<div class=item><span><b>'+escv(p.name)+'</b><br><small class=muted>'+p.id+'</small></span><button onclick="setActiveProject(\''+p.id+'\')">تفعيل</button><button onclick="editProject(\''+p.id+'\')">✏️</button><button class=danger onclick="delProject(\''+p.id+'\')">🗑</button></div>').join("")||empty("لا توجد مشاريع"));
 VIEWS.tasks=()=>box("إضافة مهمة",field("ttitle","المهمة","text","ماذا تريد إنجازه؟")+field("tdue","الاستحقاق","date","",today())+select("tpriority","الأولوية",[["low","منخفضة"],["normal","متوسطة"],["high","عالية"]],"normal")+projectField()+'<button class=p onclick="addTask()">إضافة المهمة</button>')+box("قائمة المهام",list("task").filter(t=>!D.activeProject||t.project===D.activeProject).map(t=>'<div class=item><input type=checkbox '+(t.done?"checked":"")+' onchange="toggleTask(\''+t.id+'\',this.checked)"><span><b>'+escv(t.title)+'</b><br><small class=muted>'+(t.due||"بلا موعد")+' · '+proj(t.project)+'</small></span><button onclick="editTask(\''+t.id+'\')">✏️</button><button class=danger onclick="delItem(\''+t.id+'\')">🗑</button></div>').join("")||empty("لا توجد مهام"));
 VIEWS.agenda=()=>box("إضافة موعد",field("etitle","العنوان","text","عنوان الموعد")+field("edate","التاريخ","date","",today())+field("etime","الوقت","time","")+projectField()+'<button class=p onclick="addEvent()">حفظ الموعد</button>')+box("المواعيد",list("event").map(e=>'<div class=item><span><b>'+escv(e.title)+'</b><br><small class=muted>'+e.d+' '+(e.t||"")+'</small></span><button class=danger onclick="delItem(\''+e.id+'\')">حذف</button></div>').join("")||empty("لا توجد مواعيد"));
VIEWS.notes=()=>{
    const notes=list("note");
    return box("إضافة ملاحظة",'<p class="muted">اكتب ما تريد حفظه. يمكنك ربط الملاحظة بمشروع، أو تركها «عام» لتبقى مستقلة.</p>'+
      field("ntitle","عنوان الملاحظة (اختياري)","text","مثلاً: ملاحظات اجتماع")+
      '<label class="muted" for="nbody">نص الملاحظة</label><textarea id="nbody" rows="5" style="width:100%" placeholder="اكتب ملاحظتك هنا..."></textarea>'+
      projectField()+'<button class="p" onclick="addNote()">حفظ الملاحظة</button>')+
      box("الملاحظات المحفوظة ("+notes.length+")",notes.map(x=>'<div class=item style="display:block"><b>'+escv(x.title||"ملاحظة")+'</b><p class="muted">'+escv(x.d||"")+' · '+escv(proj(x.project))+'</p><p style="white-space:pre-wrap">'+escv(x.body||"")+'</p>'+(typeof attachmentsSection==="function"?attachmentsSection(x):"")+'<button onclick="editNote(\''+escv(x.id)+'\')">تعديل</button> <button class="danger" onclick="delItem(\''+escv(x.id)+'\')">حذف</button> '+(typeof noteSpeakBtn==="function"?noteSpeakBtn(x):"")+'</div>').join("")||empty("لا توجد ملاحظات بعد. أضف ملاحظتك الأولى من الأعلى."));
  };
 VIEWS.habits=()=>box("عادة جديدة",field("hname","اسم العادة","text","مثلاً القراءة")+ '<button class=p onclick="addHabit()">إضافة</button>')+box("عاداتي",D.habits.map(h=>'<div class=item><span>'+escv(h.name)+' · '+((h.history||[]).length)+' يوم</span><button onclick="markHabit(\''+h.id+'\')">تم اليوم</button><button class=danger onclick="delHabit(\''+h.id+'\')">حذف</button></div>').join("")||empty("لا توجد عادات"));
VIEWS.goals=()=>{
    const goals=Array.isArray(D.goals)?D.goals:[];
    const unitOptions=[["مرة","مرة"],["صفحة","صفحة"],["ساعة","ساعة"],["يوم","يوم"],["قطعة","قطعة"],["مبلغ","مبلغ مالي"],["وحدة","وحدة"]];
    const unitSelect=select("gunit","بماذا ستقيس الإنجاز؟",unitOptions.concat([["other","وحدة أخرى"]]),"مرة")
      .replace('<select id="gunit"','<select id="gunit" onchange="toggleGoalCustomUnit(this.value)"')+
      '<label id="gcustomunit-label" class="muted" for="gcustomunit" hidden>اكتب اسم وحدة القياس</label><input id="gcustomunit" type="text" maxlength="24" placeholder="مثلاً: درس أو كيلومتر" style="width:100%;margin:0 0 10px" hidden>';
    const cards=goals.map(g=>{
      const m=goalProgress(g.current,g.target),unit=escv(g.unit||"وحدة");
      const id=escv(g.id),current=Number.isFinite(Number(g.current))?Number(g.current):0,target=Number.isFinite(Number(g.target))?Number(g.target):0;
      return '<div class="card"><b>'+escv(g.name)+'</b><p>أنجزت <strong>'+current+'</strong> من <strong>'+target+'</strong> '+unit+'</p>'+
        '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(m.percent)+'"><div style="width:'+m.percent+'%"></div></div>'+
        '<p class="muted">'+(g.current==null?'لم يبدأ بعد':Math.round(m.percent)+'٪ من الهدف'+(m.exceeded?' · تجاوزت الهدف 🎉':' · المتبقي '+m.remaining+' '+unit))+'</p>'+
        '<label class="muted" for="goal-current-'+id+'">تحديث ما أنجزته حتى الآن ('+unit+')</label>'+
        '<div class="row"><input id="goal-current-'+id+'" type="number" min="0" step="any" inputmode="decimal" value="'+(g.current==null?"":current)+'" placeholder="أدخل الإنجاز الحالي" style="flex:1;min-width:90px"><button class="p" onclick="updateGoal(\''+id+'\')">حفظ الإنجاز</button><button class="danger" onclick="delGoal(\''+id+'\')">حذف الهدف</button></div></div>';
    }).join("");
    return box("إنشاء هدف جديد",'<p class="muted">الهدف هو شيء تريد الوصول إليه. حدّد اسمه والعدد الذي تريد تحقيقه، ثم اختر وحدة القياس المناسبة.</p>'+
      field("gname","ماذا تريد أن تنجز؟","text","مثلاً: قراءة كتاب")+
      field("gtarget","كم تريد أن تنجز؟","number","العدد المستهدف","")+
      '<label class="muted" for="gcurrent">كم أنجزت حتى الآن؟</label><input id="gcurrent" type="number" min="0" step="any" inputmode="decimal" placeholder="الإنجاز الحالي" style="width:100%;margin:4px 0 10px">'+
      unitSelect+'<button class="p" onclick="addGoal()">حفظ الهدف</button>')+
      box("أهدافي ("+goals.length+")",cards||empty("لا توجد أهداف بعد. ابدأ بهدف صغير وواضح."));
  };
 VIEWS.ledger=()=>{
  const workRows=list("work");
  const L=ledgerTotals();
  const hasAmounts=workRows.some(w=>["workerDue","due","workerPaid","rec","workerAdvance","advance","expense"].some(key=>Number(w[key])!==0&&Number.isFinite(Number(w[key]))));
  const rows=workRows.slice().sort((a,b)=>(b.d||"").localeCompare(a.d||"")).map(w=>{
   const status=w.isReversal?'<small class="hi">قيد عكسي</small>':w.reversedBy?'<small class="hi">تم عكسه بقيد موثق</small>':'';
   const action=!w.isReversal&&!w.reversedBy?'<button type="button" onclick="reverseWorkEntry(\''+w.id+'\')">تصحيح بقيد عكسي</button>':'';
   const amount=(label,value)=>Number(value)!==0&&Number.isFinite(Number(value))?label+' '+escv(Number(value).toFixed(2))+' · ':'';
   const due=w.workerDue??w.due, paid=w.workerPaid??w.rec, advance=w.workerAdvance??w.advance;
   const details=amount("مستحق",due)+amount("واصل",paid)+amount("سلفة",advance)+amount("مصروف",w.expense)+amount("إضافي",w.ot);
   return '<div class=item><span>'+escv(w.ds||w.k)+' '+status+'<br><small>'+escv(w.d)+' · '+(details?details.replace(/ · $/,""):"قيد بلا مبلغ مالي")+(w.correctionReason?' · سبب التصحيح: '+escv(w.correctionReason):w.reversalReason?' · سبب التصحيح: '+escv(w.reversalReason):'')+'</small></span>'+action+'</div>';
  }).join("");
  const hasDue=workRows.some(w=>Number(w.workerDue??w.due)!==0&&Number.isFinite(Number(w.workerDue??w.due)));
  const hasReceived=workRows.some(w=>Number(w.workerPaid??w.rec)!==0&&Number.isFinite(Number(w.workerPaid??w.rec)));
  const hasAdvance=workRows.some(w=>Number(w.workerAdvance??w.advance)!==0&&Number.isFinite(Number(w.workerAdvance??w.advance)));
  const summary=hasAmounts?box("ملخص الحسابات",'<p>المستحق: <b>'+(hasDue?L.due.toFixed(2):"—")+'</b> · الواصل: <b>'+(hasReceived?L.rec.toFixed(2):"—")+'</b> · السلف: <b>'+(hasAdvance?L.adv.toFixed(2):"—")+'</b> · المتبقي: <b>'+(hasDue||hasReceived||hasAdvance?L.rem.toFixed(2):"—")+'</b> '+escv(D.settings.currency)+'</p>'):"";
  return box("تسجيل حركة",select("wtype","النوع",[["work","عمل"],["payment","دفعة"],["expense","مصروف"]],"work")+field("wdate","التاريخ","date","",today())+field("wdesc","البيان","text","وصف الحركة")+field("wdue","المستحق","number","مبلغ المستحق","")+field("wrec","الواصل","number","المبلغ الواصل","")+field("wexpense","المصروف","number","مبلغ المصروف","")+field("wot","ساعات إضافية","number","عدد الساعات","")+projectField()+'<button class=p onclick="addWork()">حفظ</button>')+summary+box("سجل الحركات",rows||empty("لا توجد حركات مسجلة بعد. سيبقى السجل فارغاً حتى تسجل أول حركة فعلية."));
 };
 VIEWS.contacts=()=>typeof contactsScreen==="function"?contactsScreen():empty("جهات الاتصال غير متاحة");
 VIEWS.invoices=()=>box("فواتير المشاريع",D.projects.map(p=>'<div class=item><span>'+escv(p.name)+'</span><button onclick="setActiveProject(\''+p.id+'\')">اختيار</button></div>'+ (typeof invoicesSection==="function"?invoicesSection(p.id):"")).join("")||empty("أنشئ مشروعاً أولاً"));
 VIEWS.stats=()=>box("المهام خلال الأسبوع",'<canvas id=chartTasks width=400 height=180></canvas>')+box("المشاريع",'<canvas id=chartProjects width=400 height=200></canvas>')+(typeof monthlyCompareTable==="function"?monthlyCompareTable():"");
 VIEWS.sync=()=>box("النسخ الاحتياطي والاستعادة",'<p class="muted">النسخة الكاملة تشمل بيانات التطبيق والمرفقات والصور والملفات المحفوظة محلياً. احتفظ بنسخة خارج الهاتف دورياً.</p>'+
 '<button class="p" onclick="backupLocal()">تنزيل نسخة كاملة JSON</button> <button onclick="document.getElementById(\'restoreFile\').click()">استعادة نسخة</button><input hidden id="restoreFile" type="file" accept="application/json" onchange="restoreLocal(this)">'+
 '<hr><button onclick="backupEncrypted()">إنشاء نسخة كاملة مشفّرة</button> <button onclick="document.getElementById(\'restoreEncryptedFile\').click()">استعادة نسخة مشفّرة</button><input hidden id="restoreEncryptedFile" type="file" accept=".rbe" onchange="restoreEncrypted(this)">'+
 '<hr><button onclick="shareFileWhatsApp()">مشاركة نسخة كاملة عبر واتساب</button> <button onclick="shareViaAny()">مشاركة النسخة عبر التطبيقات</button>'+
 '<hr><button onclick="backupZip()">تنزيل نسخة ZIP كاملة</button> <button onclick="document.getElementById(\'restoreZipFile\').click()">استعادة نسخة ZIP</button><input hidden id="restoreZipFile" type="file" accept=".zip,application/zip" onchange="restoreZip(this)">'+
 '<hr><button onclick="csvW()">تصدير CSV</button> <button onclick="exportICS()">تصدير المواعيد ICS</button>'+
 '<p class="muted">Google Drive اختياري ويحتاج إعداد OAuth من الإضافات. تُرفع النسخة الكاملة مع المرفقات.</p><button onclick="gdriveUpload()">رفع النسخة إلى Drive</button> <button onclick="gdriveDownload()">استعادة من Drive</button>'+
 '<hr><b>نقل مباشر بين جهازين</b><p class="muted">ينقل السجلات والمرفقات بين الجهازين عند نجاح الاتصال المباشر.</p><button onclick="rtcCreateOffer()">إنشاء رمز اتصال وإرسال</button> <button onclick="rtcAcceptOffer()">استقبال اتصال</button> <button onclick="rtcAcceptAnswer()">إدخال رمز الرد</button>');
 VIEWS.integrations=()=>{if(typeof INTEGRATIONS==="undefined")return empty("الإضافات غير متاحة");return box("الإضافات",'<p class=muted>الخدمات الخارجية اختيارية. أدخل مفاتيح الخدمة أولاً، ثم اختبرها وفعّلها.</p>'+Object.values(INTEGRATIONS).map(i=>{const enabled=isEnabled(i.id);const fields=(i.fields||[]).map(f=>'<label class=muted>'+escv(f.label)+'</label>'+(f.type==="select"?'<select style="width:100%;margin:4px 0 8px" onchange="saveIntegrationField(\''+f.key+'\',this.value)">'+(f.options||[]).map(o=>'<option '+(D.settings[f.key]===o?"selected":"")+'>'+escv(o)+'</option>').join("")+'</select>':'<input style="width:100%;margin:4px 0 8px" type="'+(f.type||"text")+'" value="'+escv(D.settings[f.key]||"")+'" placeholder="'+escv(f.placeholder||"")+'" onchange="saveIntegrationField(\''+f.key+'\',this.value)">')).join("");return '<div class=card><b>'+i.icon+' '+escv(i.name)+'</b><p class=muted>'+escv(i.desc)+'</p>'+fields+(i.help?'<details><summary>طريقة الإعداد</summary><pre style="white-space:pre-wrap">'+escv(i.help)+'</pre></details>':"")+'<div class=row><button onclick="toggleIntegration(\''+i.id+'\','+(!enabled)+')">'+(enabled?"تعطيل":"تفعيل")+'</button>'+(i.test?'<button onclick="testIntegration(\''+i.id+'\')">اختبار</button>':"")+(enabled?'<button class=p onclick="INTEGRATIONS[\''+i.id+'\'].run()">تشغيل</button>':"")+'</div></div>';}).join(""))};
 VIEWS.share=()=>box("مشاركة Rimbook",'<p class="muted">افتح قائمة المشاركة لاختيار واتساب أو البريد الإلكتروني أو أي تطبيق مشاركة مثبت على جهازك.</p><button class="p" onclick="shareRimbook()">📤 مشاركة التطبيق عبر التطبيقات</button>');
VIEWS.about=()=>box("حول Rimbook",'<div style="text-align:center;padding:12px"><h2 style="color:var(--ac)">Rimbook</h2><p>مفكرة شخصية لإدارة المشاريع والمهام والمواعيد والعمل والملفات.</p><hr><b>تطوير Yasser-ALhussen</b><br>📍 درعا - سوريا 🇸🇾<br>📧 <a href="mailto:kalimat2026go@gmail.com">kalimat2026go@gmail.com</a><p class="muted">تُحفظ بياناتك على هذا الجهاز. احتفظ بنسخة احتياطية عند تغيير الجهاز أو المتصفح.</p></div>');
VIEWS.profile=()=>{
    const p=D.profile||{};
    const photo=/^data:image\/(jpeg|png|webp);base64,/i.test(p.photo||"");
    const avatar=photo?'<img class="avatar" src="'+escv(p.photo)+'" alt="صورتك الشخصية" style="object-fit:cover">':'<div class="avatar" aria-label="الصورة الشخصية">👤</div>';
    const profileField=(label,key,type,placeholder)=>'<label class="muted" for="profile-'+key+'">'+label+'</label><input id="profile-'+key+'" type="'+(type||"text")+'" value="'+escv(p[key]||"")+'" placeholder="'+(placeholder||"")+'" onchange="saveProfileField(\''+key+'\',this.value)" style="width:100%;margin:4px 0 12px">';
    const workers=(D.workers||[]).filter(w=>w.active!==false);
    const linked=workers.find(w=>String(w.id)===String(p.workerId||""));
    return box("ملفي الشخصي",'<div style="text-align:center">'+avatar+'<h2>'+escv(p.name||"أهلاً بك")+'</h2><p class="muted">بياناتك الشخصية محفوظة محلياً على هذا الجهاز.</p>'+
      '<label class="p" for="profile-photo" style="display:inline-block;padding:8px 14px;border-radius:10px;cursor:pointer;color:#fff;background:var(--p)">اختيار صورة شخصية</label><input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" onchange="saveProfilePhoto(this)" style="display:none">'+(p.photo?'<button class="danger" onclick="removeProfilePhoto()">حذف الصورة</button>':'')+'</div>')+
      box("المعلومات الأساسية",profileField("الاسم الكامل","name","text","اكتب اسمك")+
      '<label class="muted" for="profile-role">صفة الحساب — قابلة للتغيير</label><select id="profile-role" onchange="saveProfileField(\'role\',this.value)" style="width:100%;margin:4px 0 12px"><option value="employee" '+(p.role==="employee"?"selected":"")+'>مدير / إدارة</option><option value="worker" '+(p.role==="worker"?"selected":"")+'>عامل</option></select>'+
      (p.role==="worker" ? '<label class="muted" for="profile-worker">ربط حساب العامل بملف العامل</label><select id="profile-worker" onchange="saveProfileField(\'workerId\',this.value)" style="width:100%;margin:4px 0 6px"><option value="">— لم يتم الربط بعد —</option>'+workers.map(w=>'<option value="'+escv(w.id)+'" '+(String(p.workerId||"")===String(w.id)?"selected":"")+'>'+escv(w.name)+(w.jobTitle?" — "+escv(w.jobTitle):"")+'</option>').join("")+'</select><p class="muted"><b>الربط اختياري تماماً</b>؛ مفكرتك وسجلك وجدولك الشخصي تعمل دون أي ربط. المدير ينشئ ملف العامل أولاً من صفحة «العمال». بعد ذلك يختار العامل اسمه المطابق هنا. هذا الربط محلي على هذا الجهاز فقط، ولا ينشئ حساب دخول أو يزامن هاتفين.</p>' : '<p class="muted">أنت في وضع الإدارة. أنشئ ملفات العاملين وأدرها من صفحة «العمال». لا تحتاج إلى ربط حساب المدير بملف عامل.</p>')+
      profileField("رقم الهاتف","phone","tel","مع رمز الدولة إن أمكن")+profileField("البريد الإلكتروني","email","email","example@email.com"))+
      box("العمل والعنوان",profileField("المدينة أو المنطقة","city","text","المدينة")+profileField("مكان العمل أو الشركة","workplace","text","اسم جهة العمل")+profileField("المسمى الوظيفي","jobTitle","text","مثلاً: فني أو عامل")+profileField("تاريخ الميلاد (اختياري)","birth","date","")+
      '<label class="muted" for="profile-skills">المهارات</label><textarea id="profile-skills" rows="2" onchange="saveProfileField(\'skills\',this.value)" style="width:100%">'+escv(p.skills||"")+'</textarea>')+
      box("نبذة عنك",'<textarea id="profile-about" rows="3" placeholder="اكتب نبذة مختصرة عنك" style="width:100%" onchange="saveProfileField(\'about\',this.value)">'+escv(p.about||"")+'</textarea>')+
      box("معلومات طوارئ (اختيارية وخاصة)",'<p class="muted">لا تشارك هذه المعلومات في التقارير العامة.</p><textarea id="profile-emergency" rows="2" placeholder="اسم شخص للتواصل ورقم هاتفه عند الضرورة" style="width:100%" onchange="saveProfileField(\'emergency\',this.value)">'+escv(p.emergency||"")+'</textarea>')+
      '<div class="card"><div class="row"><button class="p" type="button" style="flex:1;min-height:46px" onclick="saveProfileForm()">💾 حفظ بيانات الملف الشخصي</button><button class="danger" type="button" style="flex:1;min-height:46px" onclick="clearProfileData()">حذف بيانات الملف</button></div><p class="muted">الحذف يزيل بيانات الملف الشخصي والصورة والربط فقط، ولا يحذف سجلات العمل أو المشاريع أو الحسابات.</p></div>';
  };
  const rimbookCoreSettingsView = VIEWS.settings;
 VIEWS.settings=()=>rimbookCoreSettingsView()+box("الإعدادات العامة",select("theme","المظهر",[["dark","داكن"],["light","فاتح"]],D.settings.theme)+field("fs","حجم الخط","number","15",D.settings.fs)+select("currency","العملة",[["USD","USD"],["EUR","EUR"],["TRY","TRY"],["SYP","SYP"],["SAR","SAR"],["AED","AED"],["EGP","EGP"],["JOD","JOD"]],D.settings.currency)+(D.profile.role==="worker"?"":select("role","نوع الحساب",[["employee","إدارة"],["worker","عامل"]],D.profile.role)+field("manager","واتساب المدير","tel","مع رمز الدولة",D.settings.managerPhone))+'<button class="p" onclick="saveSettings()">حفظ الإعدادات العامة</button>')+
 (D.profile.role==="worker"?"":box("مراكز الإعدادات المتقدمة",'<p class="muted">كل مركز يتحكم بوظائفه الفعلية داخل التطبيق.</p><div class="row"><button onclick="go(\'sync\')">التخزين والنسخ الاحتياطي</button><button onclick="go(\'integrations\')">الاتصالات والخدمات</button><button onclick="go(\'contacts\')">جهات الاتصال</button><button onclick="go(\'stats\')">التقارير والإحصاء</button><button onclick="go(\'profile\')">ملف المستخدم</button></div>'));
 window.render=function(){const available=ROLES[D.profile.role]?.tabs||tabs;const secondary=Object.keys(VIEWS);if(!available.includes(view)&&!secondary.includes(view))view="home";if(typeof VIEWS[view]!=="function")view="home";document.body.dataset.theme=D.settings.theme||"dark";document.body.style.fontSize=(D.settings.fs||15)+"px";$("#tabs").innerHTML=available.map(t=>'<button class="'+(t===view?"on":"")+'" onclick="go(\''+t+'\')"><span>'+TABS[t][0]+'</span>'+TABS[t][1]+'</button>').join("");$("#view").innerHTML=VIEWS[view]?VIEWS[view]():"";if(view==="stats"){if(typeof drawCharts==="function")drawCharts();if(typeof drawMonthlyChart==="function")drawMonthlyChart();}};
 RB.save();render();
})();