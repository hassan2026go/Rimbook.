/* Rimbook Voice Ledger — spoken worker records */
(function(){
"use strict";
const D=RB.data;
const today=()=>iso(new Date());
const escv=s=>esc(String(s??""));
const owner=()=>window.rimbookOwner;
const owns=row=>owner()?owner().owns(row):true;
const ownerFields=()=>owner()?owner().fields():{workerId:null};
const personal=()=>!!owner()&&owner().kind()==="personal";
const money=n=>(Number(n)||0).toFixed(2)+" "+(D.settings.currency||"USD");
function ledgerRowBalance(row) {
  return (Number(row.workerDue??row.due)||0)-(Number(row.workerPaid??row.rec)||0)-(Number(row.workerAdvance??row.advance)||0)-(Number(row.expense)||0);
  }
let pending=null, listening=false, audioRecorder=null, audioChunks=[], audioStream=null, nativeAudioRecording=false;
const normalize=s=>String(s||"").toLowerCase()
 .replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d))
 .replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d))
 .replace(/[\u064B-\u065F\u0670]/g,"").replace(/[أإآ]/g,"ا").replace(/ى/g,"ي")
 .replace(/٫/g,".").replace(/٬/g,"").replace(/[،,]/g," ").replace(/\s+/g," ").trim();
function applyWorkReversal(data,id,reason,now,newId){
 const items=Array.isArray(data?.items)?data.items:null;
 if(!items)return {ok:false,error:"تعذر الوصول إلى سجل الحركات"};
 const original=items.find(x=>x.type==="work"&&String(x.id)===String(id));
 if(!original)return {ok:false,error:"لم نعثر على الحركة الأصلية"};
 if(original.isReversal)return {ok:false,error:"لا يمكن عكس قيد عكسي"};
 if(original.reversedBy||items.some(x=>x.type==="work"&&String(x.reversalOf||"")===String(id)))return {ok:false,error:"سبق تصحيح هذه الحركة؛ لا يمكن عكسها مرة ثانية"};
 const why=String(reason||"").trim();
 if(why.length<3)return {ok:false,error:"اكتب سبب التصحيح بوضوح"};
 const signed={};
 for(const key of ["due","rec","advance","expense","ot","otHours","normalHours","overtimePay","workerDue","workerPaid","workerAdvance","lateHours"]){
  const value=Number(original[key]||0);
  if(!Number.isFinite(value))return {ok:false,error:"يوجد رقم غير صالح في الحركة؛ لم يتغير أي سجل"};
  signed[key]=-value;
 }
 const reversal={type:"work",k:original.k,d:original.d,ds:"قيد عكسي للحركة "+String(original.ds||original.k||"المالية"),project:original.project||null,workerId:original.workerId||null,person:original.person||"",invoiceId:original.invoiceId||null,invoiceNumber:original.invoiceNumber||"",...signed,isReversal:true,reversalOf:original.id,correctionReason:why,created:now,id:newId};
 items.push(reversal);
 return {ok:true,originalId:original.id,reversalId:newId};
}
function parseSpoken(raw){
 const isPersonal=!!(window.rimbookOwner&&window.rimbookOwner.kind()==="personal");
 const s=normalize(raw);
 const date=s.includes("امس")||s.includes("أمس")?iso(new Date(Date.now()-86400000)):today();
 const amountMatch=String(raw||"").match(/[٠-٩۰-۹\d]+(?:[.,٫٬،][٠-٩۰-۹\d]+)*/);
 const amountToken=amountMatch?amountMatch[0].replace(/،/g,","):"";
 const amount=amountToken?(typeof window.rimbookParseWorkerMoney==="function"?window.rimbookParseWorkerMoney(amountToken):Number(amountToken.replace(/[٫٬]/g,"").replace(",","."))):0;
 const hasPayment=/(واصل|استلمت|استلم|قبضت|دفعة|دفعه|تسلمت|استلام)/.test(s);
 const hasAdvance=/(سلفة|سلفه|سلف|سلفت)/.test(s);
 const hasExpense=/(مصروف|صرف|اشتريت|نفقة)/.test(s) && !hasPayment && !hasAdvance;
 const hasHoliday=/(عطلة|اجازة|إجازة|راحة|ما اشتغلت|لم اعمل)/.test(s);
 const hasWork=/(عمل|اشتغلت|دوام|شغل|يوميه|يومية)/.test(s);
 const projectMatch=(D.projects||[]).find(p=>s.includes(normalize(p.name)));
 const project=projectMatch?.id||D.activeProject||null;
 const matches=isPersonal?[]:(D.workers||[]).filter(w=>w.active!==false&&normalize(w.name).length>1&&s.includes(normalize(w.name)));
 if(matches.length>1)return {error:"ورد أكثر من اسم عامل في العبارة. سجّل حركة كل عامل على حدة."};
 const profileWorker=D.profile?.role==="worker"?(D.workers||[]).find(w=>String(w.id)===String(D.profile.workerId||"")&&w.active!==false):null;
  if(D.profile?.role==="worker"&&profileWorker&&matches.some(w=>String(w.id)!==String(profileWorker.id))){
  return {error:"لا يمكنك تسجيل حركة باسم عامل آخر. استخدم ملفك المرتبط فقط."};
 }
 const workerMatch=D.profile?.role==="worker"?profileWorker:(matches[0]||null);
 const workerId=workerMatch?.id||null,person=workerMatch?.name||"";
 const spokenDailyRate=workerMatch&&window.rimbookWorkerDailyRate?window.rimbookWorkerDailyRate(workerMatch.id):Number(D.settings.dailyRate);
 const out=[];
 const rateOk=Number.isFinite(spokenDailyRate)&&spokenDailyRate>0;
 const pct=Math.min(100,Math.max(0,Number(D.settings.holidayPayPercent)||0))/100;
 if(hasHoliday){
  if(!rateOk&&!isPersonal)return {error:"حدد الأجر الفعلي للعامل أو الأجر اليومي من الإعدادات قبل تسجيل العطلة."};
  if(rateOk&&!isPersonal&&(D.settings.holidayPayPercent==null||D.settings.holidayPayPercent===""))return {error:"حدد سياسة أجر العطلة من الإعدادات أولاً."};
  out.push({k:"holiday",d:date,ds:"عطلة",due:rateOk?spokenDailyRate*pct:0,project,workerId,person});}
 else if(hasWork){
  if(!rateOk&&!isPersonal)return {error:"حدد الأجر الفعلي للعامل أو الأجر اليومي من الإعدادات قبل تسجيل يوم العمل."};
  out.push({k:"work",d:date,ds:"يوم عمل",due:rateOk?spokenDailyRate:0,project,workerId,person});}
 if(hasPayment) out.push({k:"payment",d:date,ds:"دفعة مستلمة",rec:amount,project,workerId,person});
 if(hasAdvance) out.push({k:"advance",d:date,ds:"سلفة للعامل",advance:amount,project,workerId,person});
 if(hasExpense) out.push({k:"expense",d:date,ds:"مصروف",expense:amount,project,workerId,person});
 if(!out.length) return {error:"لم أفهم نوع الحركة. اذكر نوع الحركة بوضوح، مثل: عمل أو عطلة أو دفعة مستلمة."};
  if((hasPayment||hasExpense||hasAdvance)&&!amount) return {error:"سمعت نوع الحركة لكن لم أتعرف على المبلغ. أعد ذكر الرقم بوضوح."};
 if(isPersonal)out.forEach(x=>{x.scope="personal";x.workerId=null;x.person="";});
 return {date,items:out,project,raw};
}
window.voiceLedgerParse=parseSpoken;
window.voiceLedgerConfirm=function(){
 const batch=pending;
 if(!batch||batch.error||!Array.isArray(batch.items)||!batch.items.length)return;
 const now=Date.now();
 const planned=Number(D.settings.normalHoursPerDay);
 if(batch.items.some(entry=>entry.workerId&&entry.k==="work")&&(!Number.isFinite(planned)||planned<=0||planned>24)){toast("حدد ساعات الدوام العادية من الإعدادات قبل اعتماد تسجيل العامل.");return;}
 const makeId=()=>now.toString(36)+Math.random().toString(36).slice(2,8);
 const entries=batch.items.map(entry=>{
  const workerId=D.profile?.role==="worker"?D.profile.workerId:(entry.workerId||null);
  if(!workerId)return entry;
  const worker=(D.workers||[]).find(w=>String(w.id)===String(workerId));
  if(!worker)return entry;
  const daily=window.rimbookWorkerDailyRate?window.rimbookWorkerDailyRate(workerId):(Number(D.settings.dailyRate)||0);
  const holidayPercent=Math.min(100,Math.max(0,Number(D.settings.holidayPayPercent)||0));
  const planned=Number(D.settings.normalHoursPerDay);
  const normalHours=entry.k==="work"?planned:0;
  const pay=window.rimbookCalculateWorkerPay
   ? window.rimbookCalculateWorkerPay(entry.k,daily,normalHours,0,planned,Number(entry.otHours)||0,worker.overtimeRate==null?(Number(D.settings.otRate)||0):Number(worker.overtimeRate),!!D.settings.overtimeEnabled,holidayPercent)
   : {workerDue:entry.k==="work"?daily:entry.k==="holiday"?daily*holidayPercent/100:0,overtimePay:0};
  const mapped={...entry,workerId,person:worker.name};
  if(["work","holiday"].includes(entry.k)){mapped.normalHours=normalHours;mapped.workerDue=pay.workerDue;mapped.overtimePay=pay.overtimePay;}
  if(entry.k==="payment")mapped.workerPaid=Number(entry.rec)||0;
  if(entry.k==="advance")mapped.workerAdvance=Number(entry.advance)||0;
  delete mapped.due;delete mapped.rec;delete mapped.advance;
  return mapped;
 });
 const duplicateAttendance=entries.find(entry=>entry.workerId&&["work","holiday","absence"].includes(entry.k)&&
  D.items.some(row=>row.type==="work"&&String(row.workerId||"")===String(entry.workerId)&&row.d===entry.d&&["work","holiday","absence"].includes(row.k)&&!row.isReversal&&!row.reversedBy&&!D.items.some(rev=>rev.type==="work"&&rev.isReversal&&String(rev.reversalOf)===String(row.id))));
 if(duplicateAttendance){toast("يوجد سجل دوام لهذا العامل في هذا التاريخ. صحّح السجل السابق بقيد عكسي قبل اعتماد التسجيل الصوتي.");return;}
 const workerId=entries.find(x=>x.workerId)?.workerId||null;
 const person=entries.find(x=>x.workerId)?.person||"";
 const own=window.rimbookOwner?window.rimbookOwner.fields():{workerId:null};
 const ok=RB.transact(d=>{
  entries.forEach(x=>d.items.push({type:"work",...x,voice:true,voiceText:batch.raw,created:now,id:makeId()}));
  d.items.push({type:"voice_log",d:batch.date,body:batch.raw,...own,workerId:own.workerId||workerId,person,created:now,entries:entries.length,id:makeId()});
 });
 if(!ok)return;
 pending=null;render();toast("تم اعتماد التسجيل وحفظه في سجل العمل");
};
window.voiceLedgerCancel=function(){pending=null;render();};
function personalSaveQuick(kind,amount,d){
 const labels={work:"يوم عمل",holiday:"عطلة",payment:"دفعة مستلمة",advance:"سلفة",expense:"مصروف"};
 const rate=Math.max(0,Number(D.settings.dailyRate)||0);
 const planned=Number(D.settings.normalHoursPerDay),base=Number.isFinite(planned)&&planned>0&&planned<=24?planned:8;
 const row={type:"work",k:kind,d:today(),ds:labels[kind],project:D.activeProject||null,scope:"personal",workerId:null,person:"",voice:false,created:Date.now()};
 if(["work","holiday"].includes(kind)&&D.items.some(x=>x.type==="work"&&x.scope==="personal"&&x.d===row.d&&["work","holiday","absence"].includes(x.k)&&!x.isReversal&&!x.reversedBy&&!D.items.some(r=>r.type==="work"&&r.isReversal&&String(r.reversalOf)===String(x.id))))
  return toast("يوجد سجل دوام لك اليوم. صحّحه بقيد عكسي قبل التسجيل مرة أخرى."),false;
 if(kind==="work"){
  const n=Number(d&&d.normalHours!=null?d.normalHours:base),o=Number(d&&d.otHours!=null?d.otHours:0);
  if(!Number.isFinite(n)||n<=0||n>24||!Number.isFinite(o)||o<0||o>24)return toast("تحقق من الساعات: العادية بين 0 و24، والإضافية بين 0 و24"),false;
  row.normalHours=n;row.otHours=o;
  const otPay=D.settings.overtimeEnabled?o*Math.max(0,Number(D.settings.otRate)||0):0;
  row.overtimePay=otPay;row.due=rate>0?Math.round((rate*Math.min(n,base)/base+otPay)*100)/100:0;
 }
 if(kind==="holiday")row.due=rate>0?Math.round(rate*Math.min(100,Math.max(0,Number(D.settings.holidayPayPercent)||0))/100*100)/100:0;
 if(kind==="payment")row.rec=amount;
 if(kind==="advance")row.advance=amount;
 if(kind==="expense")row.expense=amount;
 if(!RB.add(row))return false;
 render();toast("تم تسجيل "+labels[kind]+" في سجلك الشخصي");return true;
}
function voiceLedgerSaveQuick(kind,amount,workDetails){
 const labels={work:"يوم عمل",holiday:"عطلة",payment:"دفعة مستلمة",advance:"سلفة للعامل",expense:"مصروف"};
 if(!labels[kind])return;
 if(personal())return personalSaveQuick(kind,amount,workDetails);
 const worker=D.profile?.role==="worker"?(D.workers||[]).find(w=>String(w.id)===String(D.profile.workerId||"")&&w.active!==false):null;
 const planned=Number(D.settings.normalHoursPerDay);
 const configuredDaily=worker&&window.rimbookWorkerDailyRate?window.rimbookWorkerDailyRate(worker.id):Number(D.settings.dailyRate);
 if(["work","holiday"].includes(kind)&&(!Number.isFinite(configuredDaily)||configuredDaily<=0))return toast("حدد الأجر الفعلي من الإعدادات أو ملف العامل أولاً"),false;
 if(kind==="work"&&(!Number.isFinite(planned)||planned<=0||planned>24))return toast("حدد ساعات الدوام العادية من الإعدادات أولاً"),false;
 if(kind==="holiday"&&(D.settings.holidayPayPercent==null||D.settings.holidayPayPercent===""))return toast("حدد سياسة أجر العطلة من الإعدادات أولاً"),false;
 if(worker&&["work","holiday"].includes(kind)&&D.items.some(row=>row.type==="work"&&String(row.workerId||"")===String(worker.id)&&row.d===today()&&["work","holiday","absence"].includes(row.k)&&!row.isReversal&&!row.reversedBy&&!D.items.some(rev=>rev.type==="work"&&rev.isReversal&&String(rev.reversalOf)===String(row.id))))
  return toast("يوجد سجل دوام لهذا العامل اليوم. صحّح السجل السابق بقيد عكسي قبل التسجيل مرة أخرى."),false;
 const rawOt=kind==="work"?Number(workDetails?.otHours??0):0;
 const rawNormal=kind==="work"?Number(workDetails?.normalHours??planned):0;
 if(kind==="work"&&(!Number.isFinite(rawNormal)||rawNormal<=0||rawNormal>planned||!Number.isFinite(rawOt)||rawOt<0||rawOt>24))
  return toast("تحقق من الساعات: الساعات العادية لا تتجاوز ساعات الدوام المعتمدة، والإضافي بين صفر و24 ساعة"),false;
 const otHours=kind==="work"?rawOt:0;
 const normalHours=kind==="work"?rawNormal:0;
 const overtimeEnabled=!!D.settings.overtimeEnabled;
 const otRate=worker&&worker.overtimeRate!=null?Math.max(0,Number(worker.overtimeRate)||0):Math.max(0,Number(D.settings.otRate)||0);
 const overtimePay=kind==="work"&&overtimeEnabled?otHours*otRate:0;
 const item={k:kind,d:today(),ds:labels[kind],project:D.activeProject||null};
 if(kind==="work")item.due=configuredDaily+overtimePay;
 if(kind==="holiday")item.due=configuredDaily*(Math.min(100,Math.max(0,Number(D.settings.holidayPayPercent)||0))/100);
 if(kind==="payment")item.rec=amount;
 if(kind==="advance")item.advance=amount;
 if(kind==="expense")item.expense=amount;
 if(kind==="work"){item.normalHours=normalHours;item.otHours=otHours;item.overtimePay=overtimePay;item.overtimeRate=otRate;}
 if(worker){
  const daily=configuredDaily;
  const planned=Number(D.settings.normalHoursPerDay);
  item.workerId=worker.id;item.person=worker.name;
  const holidayPercent=Math.min(100,Math.max(0,Number(D.settings.holidayPayPercent)||0));
   const pay=window.rimbookCalculateWorkerPay
    ? window.rimbookCalculateWorkerPay(kind,daily,normalHours,0,planned,otHours,otRate,overtimeEnabled,holidayPercent)
    : {workerDue:kind==="work"?daily*Math.max(0,normalHours)/planned+overtimePay:kind==="holiday"?daily*holidayPercent/100:0,overtimePay};
   if(["work","holiday"].includes(kind)){item.workerDue=pay.workerDue;item.overtimePay=pay.overtimePay;}
  if(kind==="payment")item.workerPaid=Number(amount)||0;
  if(kind==="advance")item.workerAdvance=Number(amount)||0;
  delete item.due;delete item.rec;delete item.advance;
 }
 const saved=RB.add({type:"work",...item,voice:false,created:Date.now()});
 if(!saved)return false;
 render();toast("تم تسجيل "+labels[kind]+(otHours?" مع "+otHours+" ساعة إضافية":""));
 return true;
}
window.voiceLedgerWorkSubmit=function(){
 const planned=personal()?24:Number(D.settings.normalHoursPerDay);
 if(!Number.isFinite(planned)||planned<=0||planned>24){toast("حدد ساعات الدوام العادية من الإعدادات أولاً");return;}
 const normal=Number(document.getElementById("workNormalHours")?.value||(personal()?8:planned));
 const overtime=Number(document.getElementById("workOvertimeHours")?.value||0);
 if(!Number.isFinite(normal)||normal<=0||normal>planned||!Number.isFinite(overtime)||overtime<0||overtime>24){toast("تحقق من الساعات: الساعات العادية لا تتجاوز ساعات الدوام المعتمدة، والإضافي بين صفر و24 ساعة");return;}
 if(overtime>0&&!D.settings.overtimeEnabled&&!personal()){toast("فعّل سياسة العمل الإضافي من الإعدادات أولاً");return;}
 if(voiceLedgerSaveQuick("work",0,{normalHours:normal,otHours:overtime})) document.getElementById("voiceWorkDialog")?.remove();
};
window.voiceLedgerAmountDigit=function(value){
 const input=document.getElementById("voiceAmountInput");if(!input)return;
 if(value==="clear")input.value="";
 else if(value==="back")input.value=input.value.slice(0,-1);
 else if(value==="dot"){if(!input.value.includes("."))input.value+=(input.value?".":"0.") ;}
 else input.value+=value;
};
window.voiceLedgerAmountSubmit=function(kind){
 const input=document.getElementById("voiceAmountInput");
 const amount=Number(String(input?.value||"").replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace("٫",".").replace(",","."));
 if(!Number.isFinite(amount)||amount<=0){toast("أدخل مبلغاً صحيحاً");return;}
 if(voiceLedgerSaveQuick(kind,amount)) document.getElementById("voiceAmountDialog")?.remove();
};
window.voiceLedgerQuick=function(kind){
 const labels={work:"يوم عمل",holiday:"عطلة",payment:"دفعة مستلمة",advance:"سلفة للعامل",expense:"مصروف"};
 if(!labels[kind])return;
 if(kind==="work"){
  document.getElementById("voiceWorkDialog")?.remove();
  const enabled=!!D.settings.overtimeEnabled;
  document.body.insertAdjacentHTML("beforeend",'<div id="voiceWorkDialog" role="dialog" aria-modal="true" aria-label="تسجيل يوم العمل" style="position:fixed;inset:0;z-index:100;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px"><div class="card" style="width:min(100%,360px);margin:0;background:var(--card);box-shadow:0 12px 40px #0008"><b style="font-size:18px">🧱 تسجيل يوم العمل</b><label class="muted" style="display:block;margin-top:14px">ساعات العمل العادية</label><input id="workNormalHours" type="number" min="0.5" max="24" step="0.5" value="'+(Number.isFinite(Number(D.settings.normalHoursPerDay))&&Number(D.settings.normalHoursPerDay)>0?Number(D.settings.normalHoursPerDay):(personal()?8:""))+'" placeholder="حدد ساعات الدوام" style="width:100%;font-size:22px;padding:12px;margin:5px 0 12px"><label class="muted" style="display:block">الساعات الإضافية</label><input id="workOvertimeHours" type="number" min="0" max="24" step="0.5" placeholder="الساعات الإضافية" '+(enabled||personal()?"":"disabled")+' style="width:100%;font-size:22px;padding:12px;margin:5px 0 8px"><p class="muted">'+(enabled?"سيضاف أجر الساعات الإضافية حسب السعر المحدد في الإعدادات.":"العمل الإضافي غير مفعّل. يمكن لصاحب العمل تفعيله من الإعدادات.")+'</p><div class="row" style="margin-top:12px"><button class="p" style="flex:1;min-height:48px" onclick="voiceLedgerWorkSubmit()">تأكيد وحفظ</button><button type="button" style="min-height:48px" onclick="document.getElementById(\'voiceWorkDialog\').remove()">إلغاء</button></div></div></div>');
  return;
 }
 if(!["payment","advance","expense"].includes(kind)){voiceLedgerSaveQuick(kind,0);return;}
 document.getElementById("voiceAmountDialog")?.remove();
 const keys=["1","2","3","4","5","6","7","8","9","clear","0","dot"];
 document.body.insertAdjacentHTML("beforeend",'<div id="voiceAmountDialog" role="dialog" aria-modal="true" aria-label="إدخال المبلغ" style="position:fixed;inset:0;z-index:100;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px"><div class="card" style="width:min(100%,360px);margin:0;background:var(--card);box-shadow:0 12px 40px #0008"><b style="font-size:18px">أدخل مبلغ: '+labels[kind]+'</b><input id="voiceAmountInput" type="text" inputmode="decimal" autocomplete="off" placeholder="أدخل المبلغ" style="width:100%;font-size:28px;text-align:center;margin:14px 0;padding:14px" readonly><div class="grid3">'+keys.map(k=>'<button type="button" style="min-height:54px;font-size:20px" onclick="voiceLedgerAmountDigit(\''+k+'\')">'+(k==="clear"?"مسح":k==="dot"?".":k)+'</button>').join("")+'<button type="button" style="min-height:54px" onclick="voiceLedgerAmountDigit(\'back\')">⌫</button></div><div class=row style="margin-top:12px"><button class=p style="flex:1;min-height:48px;font-size:16px" onclick="voiceLedgerAmountSubmit(\''+kind+'\')">تأكيد وحفظ</button><button type="button" style="min-height:48px" onclick="document.getElementById(\'voiceAmountDialog\').remove()">إلغاء</button></div></div></div>');
};
window.voiceLedgerListen=async function(text){
 const value=String(text||"").trim();if(!value)return toast("لا يوجد نص لقراءته");
 if(typeof speakText==="function"){try{await speakText(value,"ar-SA");}catch(error){toast("تعذر تشغيل القراءة الصوتية: "+(error.message||"خطأ"));}return;}
 if("speechSynthesis" in window&&typeof SpeechSynthesisUtterance!=="undefined"){
  try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(value);u.lang="ar-SA";u.onstart=()=>toast("بدأت قراءة النص");u.onerror=()=>toast("تعذر تشغيل القراءة الصوتية");speechSynthesis.speak(u);}catch(error){toast("خدمة القراءة غير جاهزة على الجهاز");}return;
 }
 toast("خدمة النطق غير متاحة. تحقق من محرك تحويل النص إلى كلام في Android.");
};
function voiceLedgerModal(title,body){
 document.getElementById("rimbook-voice-modal")?.remove();
 const modal=document.createElement("div");modal.id="rimbook-voice-modal";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");
 modal.style.cssText="position:fixed;inset:0;z-index:10020;background:#0009;display:flex;align-items:center;justify-content:center;padding:14px";
 modal.innerHTML='<div class="card" style="width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--card)"><div class="row" style="justify-content:space-between"><b>'+escv(title)+'</b><button type="button" onclick="document.getElementById(\'rimbook-voice-modal\')?.remove()">✕</button></div>'+body+'</div>';
 document.body.appendChild(modal);modal.addEventListener("click",e=>{if(e.target===modal)modal.remove();});return modal;
}
window.voiceLedgerEditLog=function(){return toast("السجل الصوتي ثابت ولا يقبل التعديل. أضف ملاحظة توضيحية مستقلة.");};
window.voiceLedgerSaveLogEdit=window.voiceLedgerEditLog;
window.voiceLedgerDelete=function(id){
 const row=RB.all("voice_log").find(x=>String(x.id)===String(id));if(!row)return toast("لم نعثر على التسجيل");
 const archived=RB.all("voice_archive").some(a=>String(a.sourceId)===String(id));
 if(!archived)return toast("رحّل التسجيل إلى الأرشيف أولاً، ثم يمكنك حذفه مع بقاء النسخة الصوتية.");
 voiceLedgerModal("حذف التسجيل بعد الترحيل",'<p>سيُحذف سجل العرض الأصلي فقط. ستبقى النسخة المؤرشفة ومرفقها الصوتي وملاحظاته محفوظة.</p><label style="display:flex;gap:8px;align-items:center;margin:12px 0"><input id="voice-delete-retained" type="checkbox"> أؤكد أنني احتفظت بالنسخة المؤرشفة</label><div class="row" style="justify-content:flex-end"><button type="button" onclick="document.getElementById(\'rimbook-voice-modal\')?.remove()">إلغاء</button><button class="danger" type="button" onclick="voiceLedgerConfirmDelete('+JSON.stringify(String(id))+')">حذف السجل الأصلي</button></div>');
};
window.voiceLedgerConfirmDelete=async function(id){
 const row=RB.all("voice_log").find(x=>String(x.id)===String(id));if(!row)return toast("التسجيل غير موجود");
 if(!document.getElementById("voice-delete-retained")?.checked)return toast("أكد أولاً أنك احتفظت بالنسخة المؤرشفة.");
 if(!RB.removeVoiceLog(id,true))return toast("تعذر الحذف؛ تأكد من وجود نسخة مؤرشفة.");
 document.getElementById("rimbook-voice-modal")?.remove();
 render();toast("حُذف سجل العرض الأصلي وبقي الأرشيف الصوتي ومرفقاته محفوظة");
};
window.applyWorkReversal=applyWorkReversal;
window.reverseWorkEntry=function(id){
 const row=RB.data.items.find(x=>x.type==="work"&&String(x.id)===String(id));if(!row)return toast("لم نعثر على الحركة");
 if(row.isReversal||RB.all("work").some(x=>String(x.reversalOf||"")===String(id)))return toast("هذه الحركة مصححة مسبقاً");
 voiceLedgerModal("تصحيح الحركة المحاسبية",'<p>سيُحفظ قيد عكسي مقابل للحركة الأصلية مع إبقاء الأصل وسجل التدقيق. أدخل الحركة الصحيحة بعد التصحيح.</p><label>سبب التصحيح (إلزامي)</label><textarea id="voice-reversal-reason" rows="3" style="width:100%;margin:6px 0 12px" placeholder="مثلاً: سُجل يوم عمل بالخطأ"></textarea><div class="row" style="justify-content:flex-end"><button type="button" onclick="document.getElementById(\'rimbook-voice-modal\')?.remove()">إلغاء</button><button class="danger" type="button" onclick="voiceLedgerConfirmReversal('+JSON.stringify(String(id))+')">حفظ القيد العكسي</button></div>');
};
window.voiceLedgerConfirmReversal=function(id){
 const reason=(document.getElementById("voice-reversal-reason")?.value||"").trim();if(reason.length<3)return toast("اكتب سبب التصحيح بوضوح");
 const newId=Date.now().toString(36)+Math.random().toString(36).slice(2,8),now=Date.now();
 const preview=applyWorkReversal(JSON.parse(JSON.stringify(RB.data)),id,reason,now,newId);if(!preview.ok)return toast(preview.error);
 let result;const saved=RB.transact(data=>{result=applyWorkReversal(data,id,reason,now,newId);if(!result.ok)throw new Error(result.error);});
 if(!saved)return;document.getElementById("rimbook-voice-modal")?.remove();render();toast("تم حفظ القيد العكسي. أضف الحركة الصحيحة كسجل جديد.");
};
window.voiceLedgerCheckOfflineSpeech=async function(){
 const status=document.getElementById("offlineSpeechStatus");
 const download=document.getElementById("offlineSpeechDownload");
 if(status)status.textContent="جارٍ فحص محرك العربية المحلي...";
 if(download)download.hidden=true;
 try{
  const info=await window.rimbookOfflineSpeechCheck();
  if(!info.native){
   if(status)status.textContent="التعرف المحلي الكامل متاح في تطبيق Android بعد تثبيت محرك الصوت. نسخة المتصفح تستخدم إمكانات المتصفح فقط.";
   return info;
  }
  if(info.languageStatus==="installed"){
   if(status)status.textContent="✓ محرك Whisper العربي مثبت داخل ريمبوك. التسجيل والتعرف يعملان محلياً دون خدمات سامسونج أو شاومي ودون إنترنت.";
  }else{
   if(status)status.textContent="محرك العربية المحلي غير مثبت. سيعمل التسجيل عبر الإنترنت تلقائياً الآن؛ ويمكنك تنزيل المحرك اختيارياً لتفعيل التسجيل دون إنترنت لاحقاً.";
   if(download)download.hidden=false;
  }
  return info;
 }catch(error){
  if(status)status.textContent="تعذر فحص محرك العربية: "+(error.message||"خطأ");
  return {native:true,available:false,error:error.message};
 }
};
window.voiceLedgerDownloadArabic=async function(){
 const status=document.getElementById("offlineSpeechStatus");
 try{
  if(status)status.textContent="جارٍ تنزيل ملفات محرك العربية والتحقق من سلامتها. اترك التطبيق مفتوحاً حتى يكتمل التنزيل.";
  await window.rimbookOfflineSpeechDownloadArabic();
  const download=document.getElementById("offlineSpeechDownload");if(download)download.hidden=true;
  if(status)status.textContent="✓ اكتمل تنزيل محرك العربية والتحقق من الملفات. يمكنك الآن استخدام الصوت دون إنترنت.";
  toast("اكتمل تجهيز محرك العربية المحلي");
 }catch(error){
  if(status)status.textContent="تعذر تنزيل محرك العربية: "+(error.message||"خطأ");
  toast("تعذر تجهيز محرك العربية");
 }
};
window.rimbookOfflineSpeechPartial=function(event){
 const status=document.getElementById("offlineSpeechStatus");
 if(status&&event&&event.transcript)status.textContent="التعرّف المحلي الجاري: "+event.transcript;
};
window.rimbookOfflineSpeechDownloadProgress=function(event){
 const status=document.getElementById("offlineSpeechStatus");
 if(status&&event){
  const percent=Math.max(0,Math.min(100,Math.round(Number(event.percent)||0)));
  status.textContent="جارٍ تنزيل "+String(event.file||"ملف المحرك")+" — "+percent+"٪. لا تغلق التطبيق.";
 }
};

let lastVoice=null;
function handleVoiceTranscript(transcript){
 const text=String(transcript||"").trim();
 if(!text){toast("لم يصل نص واضح، حاول مجدداً");return;}
 const saved=RB.add({type:"note",d:today(),title:"ملاحظة صوتية",body:text,project:D.activeProject||null,voice:true,created:Date.now()});
 if(!saved){toast("تعذر حفظ النص الصوتي");return;}
 pending=null;lastVoice={text,at:Date.now()};
 toast("تم حفظ الكلام كملاحظة صوتية في المفكرة");
 render();go("voice");
}
window.voiceLedgerConvertLast=function(){
 if(!lastVoice)return toast("لا يوجد نص صوتي لتحويله");
 const parsed=parseSpoken(lastVoice.text);
 if(parsed.error)return toast(parsed.error);
 pending=parsed;render();toast("راجع الحركة المقترحة ثم اعتمدها أو ألغِها");
};
window.voiceLedgerDismissLast=function(){lastVoice=null;render();};
window.voiceLedgerStart=function(){
 if(listening){
  if(typeof window.rimbookOfflineSpeechStop==="function")window.rimbookOfflineSpeechStop().catch(()=>{});
  return;
 }
 const setMicState=active=>{
  listening=active;
  const b=document.getElementById("micBtn");
  if(b)b.classList.toggle("rec",active);
 };
 const capacitor=window.Capacitor;
 const isNative=!!(capacitor&&typeof capacitor.isNativePlatform==="function"&&capacitor.isNativePlatform());
 if(isNative&&typeof window.rimbookOfflineSpeechStart==="function"){
  setMicState(true);
  (async()=>{
   try{
    // Prefer local Sherpa-ONNX when installed; otherwise Android uses its online Arabic recognizer.
    const result=await window.rimbookOfflineSpeechStart("ar","auto");
    const transcript=result&&result.transcript;
    if(!transcript)throw new Error("لم أسمع عبارة واضحة. حاول مجدداً.");
    handleVoiceTranscript(transcript);
   }catch(error){
    const message=String(error&&error.message||"");
    if(/network|شبكة|الإنترنت|انترنت|مهلة الشبكة|لا توجد خدمة تعرف/i.test(message)){
     const prompt="يرجى الاتصال بالإنترنت لتحويل الكلام إلى نص.";
     toast(prompt);

    }else{
     toast(message||"تعذر تحويل الكلام إلى نص. تحقق من الميكروفون وحاول مجدداً.");
    }
   }finally{setMicState(false);}
  })();
  return;
 }
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){const prompt="يرجى الاتصال بالإنترنت لتحويل الكلام إلى نص.";toast(prompt);if(typeof speakText==="function")speakText(prompt,"ar-SA");return;}
 let r;
 try{r=new SR();}catch(e){toast("تعذر تشغيل خدمة التعرف على الكلام");return;}
 r.lang="ar-SA";r.interimResults=false;r.maxAlternatives=3;
 r.onstart=()=>{setMicState(true);toast("تحدث الآن بوضوح... قد يتطلب التعرف في المتصفح اتصالاً بالإنترنت.");};
 r.onresult=e=>{
  const result=e.results&&e.results[0],transcript=result&&result[0]&&result[0].transcript;
  if(!transcript){toast("لم أسمع عبارة واضحة، حاول مجدداً");return;}
  handleVoiceTranscript(transcript);
 };
 r.onnomatch=()=>toast("لم أتعرف على الكلمات. جرّب التحدث ببطء ووضوح");
 r.onerror=e=>{
  const messages={
   "not-allowed":"اسمح للتطبيق باستخدام الميكروفون من أذونات Android أو المتصفح.",
   "service-not-allowed":"خدمة التعرف على الكلام غير متاحة لهذا المتصفح",
   "no-speech":"لم أسمع صوتاً. تأكد من الميكروفون وحاول مجدداً",
   "audio-capture":"تعذر الوصول إلى الميكروفون. تحقق من أذونات الجهاز",
   "network":"يرجى الاتصال بالإنترنت لتحويل الكلام إلى نص"
  };
  const message=messages[e.error]||"تعذر التعرف على الكلام، حاول مجدداً";
  toast(message);
  if(e.error==="network"&&typeof speakText==="function")speakText("يرجى الاتصال بالإنترنت لتحويل الكلام إلى نص.","ar-SA");
 };
 r.onend=()=>setMicState(false);
 try{r.start();}catch(e){setMicState(false);toast("الميكروفون مشغول أو لم يستجب، حاول بعد لحظة");}
};

window.voiceAudioStart=async function(){
 if(audioRecorder&&audioRecorder.state==="recording")return toast("التسجيل الصوتي يعمل بالفعل");
 try{
  const capacitor=window.Capacitor;
  if(capacitor&&typeof capacitor.isNativePlatform==="function"&&capacitor.isNativePlatform()&&typeof window.rimbookNativeAudioStart==="function"){
   await window.rimbookNativeAudioStart();nativeAudioRecording=true;
   const status=document.getElementById("voiceAudioStatus");if(status)status.textContent="🔴 جارٍ التسجيل الصوتي الأصلي — اضغط إيقاف عند الانتهاء";
   const start=document.getElementById("voiceAudioStart"),stop=document.getElementById("voiceAudioStop");
   if(start)start.disabled=true;if(stop)stop.disabled=false;toast("بدأ التسجيل الصوتي");return;
  }
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder)throw new Error("تسجيل الصوت غير مدعوم في هذا المتصفح");
  audioStream=await navigator.mediaDevices.getUserMedia({audio:true});
  audioChunks=[];
  audioRecorder=new MediaRecorder(audioStream);
  audioRecorder.ondataavailable=event=>{if(event.data&&event.data.size)audioChunks.push(event.data);};
  audioRecorder.onerror=()=>toast("حدث خطأ أثناء تسجيل الصوت");
  audioRecorder.onstop=async()=>{
   try{
    const type=audioRecorder.mimeType||"audio/webm";
    const blob=new Blob(audioChunks,{type});
    audioStream?.getTracks().forEach(track=>track.stop());audioStream=null;
    if(!blob.size)return toast("التسجيل فارغ؛ حاول مجدداً");
    if(typeof ATT_DB==="undefined")return toast("تخزين المرفقات غير متاح");
    const aid="voice-audio-"+Date.now().toString(36);
    const name="rimbook-voice-"+today()+"."+(/mp4/i.test(type)?"m4a":"webm");
    await ATT_DB.put(aid,{name,type,size:blob.size,blob});
    let saved=false;
    try {
     saved=RB.add({type:"voice_log",d:today(),body:"تسجيل صوتي محفوظ",...ownerFields(),person:D.profile?.name||"",attachments:[{aid,name,type,size:blob.size}],created:Date.now()});
    } catch(error) {
     try { await ATT_DB.del(aid); } catch(cleanupError) { console.error("Voice attachment cleanup failed",cleanupError); }
     throw error;
    }
    if(!saved){
     try { await ATT_DB.del(aid); } catch(cleanupError) { console.error("Voice attachment cleanup failed",cleanupError); }
     return toast("تعذر ربط التسجيل بسجل المفكرة؛ لم يُعتمد التسجيل");
    }
    toast("تم حفظ التسجيل الصوتي ويمكنك تشغيله من السجل");
    render();
   }catch(error){toast("تعذر حفظ التسجيل الصوتي: "+(error.message||"خطأ"));}
   finally{
    audioChunks=[];audioRecorder=null;audioStream=null;
    const start=document.getElementById("voiceAudioStart"),stop=document.getElementById("voiceAudioStop");
    if(start)start.disabled=false;if(stop)stop.disabled=true;
    const status=document.getElementById("voiceAudioStatus");if(status&&status.textContent.includes("جارٍ حفظ"))status.textContent="يمكنك بدء تسجيل جديد أو الاستماع إلى التسجيل المحفوظ من السجل.";
   }
  };
  audioRecorder.start();
  const status=document.getElementById("voiceAudioStatus");if(status)status.textContent="🔴 جارٍ التسجيل — اضغط إيقاف عند الانتهاء";
  const start=document.getElementById("voiceAudioStart"),stop=document.getElementById("voiceAudioStop");
  if(start)start.disabled=true;if(stop)stop.disabled=false;
  toast("بدأ تسجيل الصوت");
 }catch(error){audioStream?.getTracks().forEach(track=>track.stop());audioStream=null;toast("تعذر الوصول إلى الميكروفون؛ تحقق من الإذن");}
};
window.voiceAudioStop=async function(){
 const status=document.getElementById("voiceAudioStatus");
 if(nativeAudioRecording){
  nativeAudioRecording=false;if(status)status.textContent="⏳ جارٍ إنهاء التسجيل وحفظه...";
  try{
   const result=await window.rimbookNativeAudioStop();const binary=atob(result.base64||"");const bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const blob=new Blob([bytes],{type:result.type||"audio/mp4"});
   await saveVoiceAudioBlob(blob,result.type||"audio/mp4","m4a");
   if(status)status.textContent="✓ تم حفظ التسجيل الصوتي. يمكنك تشغيله من السجل.";
  }catch(error){if(status)status.textContent="تعذر حفظ التسجيل: "+(error.message||"خطأ");toast("تعذر حفظ التسجيل الصوتي: "+(error.message||"خطأ"));}
  finally{const start=document.getElementById("voiceAudioStart"),stop=document.getElementById("voiceAudioStop");if(start)start.disabled=false;if(stop)stop.disabled=true;}
  return;
 }
 if(!audioRecorder||audioRecorder.state!=="recording")return toast("لا يوجد تسجيل جارٍ");
 audioRecorder.stop();if(status)status.textContent="⏳ جارٍ حفظ التسجيل...";
};
async function saveVoiceAudioBlob(blob,type,extension){
 if(!blob||!blob.size)throw new Error("التسجيل فارغ؛ حاول مجدداً");
 if(typeof ATT_DB==="undefined")throw new Error("تخزين المرفقات غير متاح");
 const aid="voice-audio-"+Date.now().toString(36),name="rimbook-voice-"+today()+"."+extension;
 await ATT_DB.put(aid,{name,type,size:blob.size,blob});
 let saved=false;
 try{saved=RB.add({type:"voice_log",d:today(),body:"تسجيل صوتي محفوظ",...ownerFields(),person:D.profile?.name||"",attachments:[{aid,name,type,size:blob.size}],created:Date.now()});}
 catch(error){try{await ATT_DB.del(aid);}catch(_){}throw error;}
 if(!saved){try{await ATT_DB.del(aid);}catch(_){}throw new Error("تعذر ربط التسجيل بسجل المفكرة");}
 toast("تم حفظ التسجيل الصوتي ويمكنك تشغيله من السجل");render();
}
window.voiceAudioPlay=async function(aid){
 try{
  const stored=await ATT_DB.get(aid);if(!stored||!stored.blob)return toast("ملف التسجيل غير موجود");
  const player=document.getElementById("voice-audio-"+aid);if(!player)return;
  if(player.dataset.loaded!=="1"){player.src=URL.createObjectURL(stored.blob);player.dataset.loaded="1";}
  player.hidden=false;await player.play();
 }catch(error){toast("تعذر تشغيل التسجيل الصوتي");}
};
window.voiceCapture=window.voiceLedgerStart;
TABS.voice=["🎙️","السجل الصوتي"];
["employee","worker"].forEach(role=>{if(ROLES[role]&&!ROLES[role].tabs.includes("voice"))ROLES[role].tabs.splice(ROLES[role].tabs.indexOf("ledger")+1,0,"voice");});
window.voiceLedgerAddNote=function(targetType,targetId,month){
 const fieldId="voice-note-"+String(targetType)+"-"+String(targetId||month||"general").replace(/[^a-zA-Z0-9_-]/g,"_");
 const field=document.getElementById(fieldId),body=String(field?.value||"").trim();
 if(!body)return toast("اكتب الملاحظة أولاً");
 const linked=targetId==null?null:D.items.find(x=>String(x.id)===String(targetId)&&(x.type==="work"||x.type==="voice_log"));
 const note={type:"ledger_note",id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),created:Date.now(),author:String(D.profile?.name||"مستخدم المفكرة"),workerId:linked?.workerId?String(linked.workerId):(ownerFields().workerId?String(ownerFields().workerId):null),scope:ownerFields().scope,targetType:String(targetType||"month"),targetId:targetId==null?null:String(targetId),month:month||null,body};
 if(!RB.add(note))return;
 render();toast("تم حفظ الملاحظة كسجل مستقل لا يغيّر الأصل");
};
function voiceLedgerNotes(targetType,targetId,month){
 const notes=RB.all("ledger_note").filter(n=>n.targetType===targetType&&(targetId==null?n.targetId==null:String(n.targetId)===String(targetId))&&(!month||n.month===month)&&owns({workerId:n.workerId||null,scope:n.scope})).slice().sort((a,b)=>(Number(a.created)||0)-(Number(b.created)||0));
 return notes.length?'<div class="ledger-notes"><b>الملاحظات المحفوظة</b>'+notes.map(n=>'<p class="ledger-note"><small>'+escv(n.author||"مستخدم المفكرة")+' · '+escv(new Date(Number(n.created)||0).toLocaleString("ar"))+'</small><br>'+escv(n.body)+'</p>').join("")+'</div>':'';
}
function voiceLedgerNoteBox(targetType,targetId,month){
 const key=String(targetId||month||"general").replace(/[^a-zA-Z0-9_-]/g,"_");
 const fieldId="voice-note-"+targetType+"-"+key;
 return '<div class="ledger-note-box"><textarea id="'+fieldId+'" rows="2" placeholder="أضف ملاحظة توضيحية مستقلة..."></textarea><button type="button" onclick="voiceLedgerAddNote('+JSON.stringify(targetType)+','+JSON.stringify(targetId==null?null:String(targetId))+','+JSON.stringify(month||null)+')">حفظ الملاحظة</button></div>';
}
window.voiceLedgerMonthReport=function(month){
 const isWorker=D.profile?.role==="worker",workerId=String(D.profile?.workerId||"");
 const rows=RB.all("work").filter(w=>(w.d||"").startsWith(month)&&owns(w)).slice().sort((a,b)=>String(a.d||"").localeCompare(String(b.d||""))||(Number(a.created)||0)-(Number(b.created)||0));
 const notes=RB.all("ledger_note").filter(n=>(n.month===month&&owns({workerId:n.workerId||null,scope:n.scope}))||n.targetType==="work"&&rows.some(w=>String(w.id)===String(n.targetId)));
 const lines=["ريمبوك — سجل الشهر "+month,"التاريخ | النوع | البيان | الساعات | المستحق | المدفوع | السلفة | المصروف | الرصيد"];
 let due=0,paid=0,advance=0,expense=0;
 for(const w of rows){
  const label=({work:"عمل",holiday:"عطلة",payment:"دفعة مستلمة",worker_payment:"دفعة أجور",advance:"سلفة",worker_advance:"سلفة",expense:"مصروف"}[w.k]||w.k);
  due+=Number(w.workerDue??w.due)||0;paid+=Number(w.workerPaid??w.rec)||0;advance+=Number(w.workerAdvance??w.advance)||0;expense+=Number(w.expense)||0;
  lines.push([w.d,label,w.ds||"",Number(w.normalHours||0)+Number(w.otHours||0),Number(w.workerDue??w.due)||0,Number(w.workerPaid??w.rec)||0,Number(w.workerAdvance??w.advance)||0,Number(w.expense)||0,due-paid-advance-expense].join(" | "));
 }
 lines.push("الإجماليات | مستحق: "+due.toFixed(2)+" | مدفوع: "+paid.toFixed(2)+" | سلف: "+advance.toFixed(2)+" | مصروف: "+expense.toFixed(2)+" | صافي: "+(due-paid-advance-expense).toFixed(2));
 if(notes.length){lines.push("الملاحظات:");notes.sort((a,b)=>(Number(a.created)||0)-(Number(b.created)||0)).forEach(n=>lines.push("["+new Date(Number(n.created)||0).toLocaleString("ar")+" — "+(n.author||"")+"] "+n.body));}
 return {rows,notes,text:lines.join("\n")};
};
window.voiceLedgerMonthAction=async function(action,month){
 const report=window.voiceLedgerMonthReport(month);
 if(action==="copy"){
  try{await navigator.clipboard.writeText(report.text);toast("تم نسخ تقرير الشهر مع الملاحظات");}
  catch(error){toast("تعذر النسخ التلقائي. استخدم المشاركة أو انسخ التقرير من النسخة الاحتياطية.");}
  return;
 }
 if(action==="share"){
  try{if(navigator.share){await navigator.share({title:"سجل ريمبوك — "+month,text:report.text});return;} }
  catch(error){if(error.name==="AbortError")return;}
  try{await navigator.clipboard.writeText(report.text);toast("لا تتوفر المشاركة المباشرة؛ نُسخ التقرير لتتمكن من مشاركته.");}
  catch(error){toast("المشاركة غير متاحة على هذا الجهاز.");}
  return;
 }
 if(action==="rollover"){
  const archiveOwner=String(ownerFields().workerId||"");
  if(RB.all("ledger_archive").some(a=>a.month===month&&String(a.workerId||"")===archiveOwner&&(a.scope||"")===(ownerFields().scope||"")))return toast("سبق ترحيل هذا الشهر؛ لن ننشئ نسخة مكررة.");
  const archive={type:"ledger_archive",id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),month,workerId:archiveOwner||null,scope:ownerFields().scope,created:Date.now(),rows:report.rows.map(x=>({...x})),notes:report.notes.map(x=>({...x})),report:report.text};
  if(!RB.add(archive))return;
  render();toast("تم ترحيل نسخة أرشيفية للشهر. الحركات الأصلية لم تتغير ولم تُحتسب مرة ثانية.");
 }
};
window.voiceLedgerDeleteArchive=function(id){
 const archive=RB.all("ledger_archive").find(a=>String(a.id)===String(id));if(!archive)return toast("النسخة الأرشيفية غير موجودة");
 if(!confirm("حذف النسخة الأرشيفية فقط؟ ستبقى الحركات الأصلية والملاحظات محفوظة في سجلها الأساسي."))return;
 if(!RB.remove(id))return;
 render();toast("حُذفت النسخة الأرشيفية فقط؛ لم تُحذف أي حركة أصلية.");
};
window.voiceLedgerAudioAction=async function(action,id){
 const row=RB.all("voice_log").find(x=>String(x.id)===String(id));if(!row)return toast("التسجيل غير موجود");
 const notes=RB.all("ledger_note").filter(n=>n.targetType==="voice_log"&&String(n.targetId)===String(id)).slice().sort((a,b)=>(Number(a.created)||0)-(Number(b.created)||0));
 const text=["ريمبوك — سجل صوتي",row.d||"",row.body||"تسجيل صوتي",...notes.map(n=>"ملاحظة — "+(n.author||"")+" — "+new Date(Number(n.created)||0).toLocaleString("ar")+": "+n.body)].join("\n");
 if(action==="copy"){try{await navigator.clipboard.writeText(text);toast("تم نسخ التسجيل وملاحظاته");}catch(error){toast("تعذر النسخ على هذا الجهاز");}return;}
 if(action==="share"){
  try{
   const audio=(row.attachments||[]).find(x=>String(x.type||"").startsWith("audio/"));
   if(audio&&typeof ATT_DB!=="undefined"&&navigator.share){
    const stored=await ATT_DB.get(audio.aid);
    if(stored?.blob){
     const file=new File([stored.blob],audio.name||"rimbook-audio", {type:audio.type||stored.type||"audio/webm"});
     if(!navigator.canShare||navigator.canShare({files:[file]})){await navigator.share({title:"سجل ريمبوك الصوتي",text,files:[file]});return;}
    }
   }
   if(navigator.share){await navigator.share({title:"سجل ريمبوك الصوتي",text});return;}
  }catch(error){if(error.name==="AbortError")return;}
  try{await navigator.clipboard.writeText(text);toast("تعذرت مشاركة الملف الصوتي مباشرة؛ نُسخ النص لتتمكن من مشاركته.");}
  catch(error){toast("المشاركة غير متاحة على هذا الجهاز.");}
  return;
 }
 if(action==="rollover"){
  if(RB.all("voice_archive").some(a=>String(a.sourceId)===String(id)))return toast("سبق ترحيل هذا التسجيل");
  const archive={type:"voice_archive",id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),sourceId:String(id),created:Date.now(),record:JSON.parse(JSON.stringify(row)),notes:JSON.parse(JSON.stringify(notes)),report:text};
  if(!RB.add(archive))return;
  render();toast("تم ترحيل التسجيل وملاحظاته إلى الأرشيف دون حذف الأصل");
 }
};
function voiceArchiveRow(a){
 const l=a.record||{},audio=(l.attachments||[]).find(x=>String(x.type||"").startsWith("audio/"));
 const play=audio?'<button type="button" onclick="voiceAudioPlay('+JSON.stringify(audio.aid)+')">▶ تشغيل الصوت المؤرشف</button><audio id="voice-audio-'+escv(audio.aid)+'" controls hidden></audio>':'';
 return '<div class="card"><b>'+escv(l.d||"بلا تاريخ")+' · نسخة مؤرشفة</b><p>'+escv(l.body||"تسجيل صوتي")+'</p>'+play+(a.notes||[]).map(n=>'<p class="ledger-note"><small>'+escv(n.author||"")+' · '+escv(new Date(Number(n.created)||0).toLocaleString("ar"))+'</small><br>'+escv(n.body)+'</p>').join("")+'</div>';
}
function voiceLogRow(l){
 const audio=(l.attachments||[]).find(a=>String(a.type||"").startsWith("audio/"));
 const bodyArg=JSON.stringify(l.body||"").replace(/</g,"\\u003c");
 const play=audio?'<button type="button" onclick="voiceAudioPlay('+JSON.stringify(audio.aid)+')">▶ تشغيل التسجيل الأصلي</button><audio id="voice-audio-'+escv(audio.aid)+'" controls hidden></audio>':'';
 return '<div class="card" style="padding:12px;margin:8px 0"><div class="row" style="align-items:flex-start;justify-content:space-between"><div style="min-width:0;flex:1"><b>'+escv(l.d||"بلا تاريخ")+'</b><p style="white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0">'+escv(l.body||"تسجيل صوتي")+'</p></div><span class="tag">تسجيل محفوظ</span></div><div class="row" style="flex-wrap:wrap;gap:8px"><button type="button" onclick="voiceLedgerListen('+bodyArg+')">🔊 قراءة النص</button>'+play+'<button type="button" onclick="voiceLedgerAudioAction(\'copy\','+JSON.stringify(String(l.id))+')">نسخ</button><button type="button" onclick="voiceLedgerAudioAction(\'share\','+JSON.stringify(String(l.id))+')">مشاركة</button><button type="button" onclick="voiceLedgerAudioAction(\'rollover\','+JSON.stringify(String(l.id))+')">ترحيل</button><button type="button" onclick="voiceLedgerDelete('+JSON.stringify(String(l.id))+')">حذف بعد الاحتفاظ بنسخة</button></div>'+voiceLedgerNotes("voice_log",l.id,null)+voiceLedgerNoteBox("voice_log",l.id,null)+'</div>';
}
VIEWS.voice=function(){
 const isWorker=D.profile?.role==="worker",workerId=D.profile?.workerId||"";
 const works=RB.all("work").filter(owns).slice().sort((a,b)=>(b.d||"").localeCompare(a.d||""));
 const month=document.getElementById("voiceMonth")?.value||today().slice(0,7);
 const monthRows=works.filter(w=>(w.d||"").startsWith(month));
 const reversedIds=new Set(monthRows.filter(w=>w.isReversal&&w.reversalOf!=null).map(w=>String(w.reversalOf)));
 const countedRows=monthRows.filter(w=>!w.isReversal&&!reversedIds.has(String(w.id)));
 const worked=countedRows.filter(w=>w.k==="work").length,holidays=countedRows.filter(w=>w.k==="holiday").length;
 const absences=countedRows.filter(w=>w.k==="absence").length,paymentCount=countedRows.filter(w=>(w.k==="payment"||w.k==="worker_payment")&&((Number(w.workerPaid)||0)+(Number(w.rec)||0)>0)).length;
 const monthCountCards=[worked?'<div class="card">أيام العمل<h3>'+worked+'</h3></div>':"",holidays?'<div class="card">العطل<h3>'+holidays+'</h3></div>':"",absences?'<div class="card">الغياب<h3>'+absences+'</h3></div>':"",paymentCount?'<div class="card">الدفعات<h3>'+paymentCount+'</h3></div>':""].filter(Boolean).join("");
 const due=monthRows.reduce((sum,w)=>sum+(Number(w.workerDue??w.due)||0),0);
 const received=monthRows.reduce((sum,w)=>sum+(Number(w.workerPaid??w.rec)||0),0);
 const expenses=monthRows.reduce((sum,w)=>sum+(Number(w.expense)||0),0);
 const advances=monthRows.reduce((sum,w)=>sum+(Number(w.workerAdvance??w.advance)||0),0);
 const logs=RB.all("voice_log").filter(owns).slice().sort((a,b)=>(b.created||0)-(a.created||0));
 const hasMonthAmounts=monthRows.some(w=>["workerDue","due","workerPaid","rec","workerAdvance","advance","expense"].some(key=>Number(w[key])!==0&&Number.isFinite(Number(w[key]))));
 const preview=pending&&!pending.error?'<div class="card" style="border:2px solid var(--ac)"><b>🔎 راجع ما فهمه التطبيق قبل الحفظ</b><p>'+escv(pending.raw)+'</p>'+pending.items.map(x=>{const amount=x.due??x.rec??x.expense??x.advance;return '<div class="item"><span>'+({work:"يوم عمل",holiday:"عطلة",payment:"دفعة مستلمة",advance:"سلفة للعامل",expense:"مصروف"}[x.k])+'</span><b>'+(Number(amount)!==0&&Number.isFinite(Number(amount))?money(amount):"—")+'</b></div>';}).join("")+'<p class="muted">الأجر اليومي مأخوذ من إعدادات الحساب. يمكنك إلغاء التسجيل إذا كان الفهم غير صحيح.</p><button class="p" onclick="voiceLedgerConfirm()">✓ اعتماد وحفظ</button> <button onclick="voiceLedgerCancel()">إلغاء</button><button onclick="voiceLedgerListen('+JSON.stringify(pending.raw).replace(/</g,"\\\\u003c")+')">🔊 استماع</button></div>':"";
 const lastCard=lastVoice?'<div class="card" style="border:2px solid var(--ac)"><b>📝 النص الذي سمعه التطبيق</b><p style="white-space:pre-wrap">'+escv(lastVoice.text)+'</p><p class="muted">حُفظ كملاحظة في المفكرة. لا يتحول إلى حركة عمل أو مبلغ إلا إذا طلبت ذلك بنفسك.</p><div class="row" style="flex-wrap:wrap"><button type="button" onclick="voiceLedgerConvertLast()">تحويل إلى حركة عمل أو مبلغ (مع مراجعة)</button><button type="button" onclick="go(\'notebook\')">📒 فتح المفكرة</button><button type="button" onclick="voiceLedgerDismissLast()">إخفاء</button></div></div>':"";
 const monthlySummary=monthRows.length
  ? '<div class="card"><b>📅 الحساب الشهري والتقويم</b><label class="muted">اختر الشهر</label><input id="voiceMonth" type="month" value="'+month+'" onchange="render()" style="width:100%">'+(monthCountCards?'<div class="grid3" style="margin-top:8px">'+monthCountCards+'</div>':'<p class="muted">لا توجد مؤشرات عمل أو دفعات لهذا الشهر.</p>')+''+(hasMonthAmounts?'<div class="grid2"><div class="card">المستحق<h3>'+money(due)+'</h3></div><div class="card">واصل<h3 class="ok">'+money(received)+'</h3></div><div class="card">المصروف<h3>'+money(expenses)+'</h3></div><div class="card">السلفات<h3>'+money(advances)+'</h3></div><div class="card">المتبقي بعد السلفات والمصروفات<h3>'+money(due-received-advances-expenses)+'</h3></div></div>':'<p class="muted">لا توجد مبالغ مالية مسجلة لهذا الشهر؛ لن نعرض أرصدة افتراضية.</p>')+'</div>'
  : '<div class="card"><b>📅 الحساب الشهري والتقويم</b><label class="muted">اختر الشهر</label><input id="voiceMonth" type="month" value="'+month+'" onchange="render()" style="width:100%"><p class="muted">لا توجد عمليات مسجلة لهذا الشهر بعد. سيظهر الحساب تلقائياً عند تسجيل أول حركة فعلية.</p></div>';
 const kind={work:"عمل",holiday:"عطلة",payment:"دفعة مستلمة",worker_payment:"دفعة أجور",advance:"سلفة",worker_advance:"سلفة",expense:"مصروف"};
 const monthTable=monthRows.length?'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:760px;text-align:right"><thead><tr><th>التاريخ</th><th>نوع العملية</th><th>البيان</th><th>الساعات</th><th>المستحق</th><th>المدفوع</th><th>السلفة</th><th>المصروف</th><th>الرصيد</th><th>ملاحظة / توضيح</th></tr></thead><tbody>'+monthRows.slice().sort((a,b)=>String(a.d||"").localeCompare(String(b.d||""))||(Number(a.created)||0)-(Number(b.created)||0)).map((w,index,sorted)=>{
  const amountDue=Number(w.workerDue??w.due)||0,amountPaid=Number(w.workerPaid??w.rec)||0,amountAdvance=Number(w.workerAdvance??w.advance)||0,amountExpense=Number(w.expense)||0;
  const runningBalance=sorted.slice(0,index+1).reduce((total,row)=>total+ledgerRowBalance(row),0);
  const hasMoney=sorted.slice(0,index+1).some(row=>ledgerRowBalance(row)!==0);
  const status=w.isReversal?"قيد عكسي":reversedIds.has(String(w.id))?"عُكس بقيد مستقل":"";
  const hours=(Number(w.normalHours)||0)+(Number(w.otHours)||0);
  return '<tr><td>'+escv(w.d)+'</td><td>'+escv(kind[w.k]||w.k)+' '+status+'</td><td>'+escv(w.ds||w.voiceText||"—")+'</td><td>'+(hours||"—")+'</td><td>'+(amountDue!==0?money(amountDue):"—")+'</td><td>'+(amountPaid!==0?money(amountPaid):"—")+'</td><td>'+(amountAdvance!==0?money(amountAdvance):"—")+'</td><td>'+(amountExpense!==0?money(amountExpense):"—")+'</td><td>'+(hasMoney?money(runningBalance):"—")+'</td><td>'+voiceLedgerNotes("work",w.id,month)+voiceLedgerNoteBox("work",w.id,month)+'</td></tr>';
 }).join("")+'</tbody></table></div>':'<p class="muted">لا توجد عمليات مسجلة لهذا الشهر.</p>';
 return '<div class="card"><b style="font-size:17px">🎙️ السجل الصوتي للعمال</b><p class="muted">قل نوع الحركة بوضوح، مثل: «اليوم عمل» أو «اليوم عطلة» أو «دفعة مستلمة».</p><div class="grid3" style="margin:12px 0"><button class="card" style="min-height:88px;font-size:15px" onclick="voiceLedgerQuick(\'work\')">🧱<br><b>يوم عمل</b></button><button class="card" style="min-height:88px;font-size:15px" onclick="voiceLedgerQuick(\'holiday\')">🌴<br><b>عطلة</b></button><button class="card" style="min-height:88px;font-size:15px" onclick="voiceLedgerQuick(\'payment\')">💵<br><b>دفعة مستلمة</b></button><button class="card" style="min-height:88px;font-size:15px" onclick="voiceLedgerQuick(\'advance\')">🤝<br><b>سلفة</b></button><button class="card" style="min-height:88px;font-size:15px" onclick="voiceLedgerQuick(\'expense\')">🧾<br><b>مصروف</b></button></div><button class="p" style="font-size:16px;padding:12px 18px" onclick="voiceLedgerStart()">🎤 ابدأ التحدث</button><p class="muted">الكلام يُحفظ دائماً كملاحظة نصية. لا يُسجَّل أي دوام أو مبلغ إلا بزر التسجيل السريع أو بتحويلٍ تطلبه أنت وتراجعه قبل الاعتماد.</p><p class="muted">مع وجود إنترنت يُستخدم التعرف الأدق عبر خدمة الهاتف، ودون إنترنت يُستخدم محرك العربية المثبت داخل التطبيق إن كنت قد نزّلته. تسجيل الصوت الأصلي وحفظه وتشغيله يعمل دون إنترنت دائماً.</p><hr><b>تسجيل صوتي محفوظ</b><div class="row"><button id="voiceAudioStart" type="button" onclick="voiceAudioStart()">🔴 بدء التسجيل</button><button id="voiceAudioStop" type="button" disabled onclick="voiceAudioStop()">إيقاف وحفظ</button></div><p id="voiceAudioStatus" class="muted">احفظ صوتك الأصلي ثم شغّله لاحقاً من السجل.</p></div>'+lastCard+preview+monthlySummary+
 '<div class="card"><b>🗓️ سجل الشهر — دفتر العمليات الثابت</b><p class="muted">سجل زمني للقراءة فقط. لا تُعدّل الحركة الأصلية؛ استخدم الملاحظات المستقلة لأي توضيح. الترتيب من الأقدم إلى الأحدث.</p><div class="row" style="flex-wrap:wrap;gap:8px"><button type="button" onclick="voiceLedgerMonthAction(\'copy\','+JSON.stringify(month)+')">نسخ التقرير</button><button type="button" onclick="voiceLedgerMonthAction(\'share\','+JSON.stringify(month)+')">مشاركة التقرير</button><button type="button" onclick="voiceLedgerMonthAction(\'rollover\','+JSON.stringify(month)+')">ترحيل إلى الأرشيف</button></div>'+monthTable+voiceLedgerNotes("month",null,month)+voiceLedgerNoteBox("month",null,month)+'</div>'+
 '<div class="card"><b>📦 النسخ المرحلة</b>'+(RB.all("ledger_archive").filter(a=>a.month===month&&owns({workerId:a.workerId||null,scope:a.scope})).map(a=>'<div class="row" style="justify-content:space-between"><span>أرشيف '+escv(a.month)+' · '+escv(new Date(Number(a.created)||0).toLocaleString("ar"))+'</span><button type="button" onclick="voiceLedgerDeleteArchive('+JSON.stringify(String(a.id))+')">حذف النسخة الأرشيفية</button></div>').join("")||'<p class="muted">لم يتم ترحيل هذا الشهر بعد.</p>')+'</div>'+
 '<div class="card"><b>🎧 سجل العبارات الصوتية</b>'+(logs.length?logs.map(voiceLogRow).join(""):'<p class="muted">لا توجد تسجيلات محفوظة بعد.</p>')+'</div>'+
 '<div class="card"><b>📦 الأرشيف الصوتي المرحّل</b>'+(RB.all("voice_archive").filter(a=>owns(a.record||{})).map(voiceArchiveRow).join("")||'<p class="muted">لا توجد تسجيلات مرحلة.</p>')+'</div>';
};
const oldRender=window.render;
window.render=function(){oldRender();};
const oldGo=window.go;
window.go=function(t){oldGo(t);};
})();
