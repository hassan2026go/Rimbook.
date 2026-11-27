/* Rimbook contacts — easy contact form and one-tap communication */
"use strict";
function addContact(){
  const value=id=>document.getElementById(id)?.value.trim()||"";
  const name=value("ct-name"),phone=value("ct-phone"),email=value("ct-email");
  const type=value("ct-type")||"other";
  if(!name)return toast("اكتب اسم الشخص أولاً");
  if(!phone&&!email)return toast("أضف رقم هاتف أو بريداً إلكترونياً واحداً على الأقل");
  if(phone&&contactDigits(phone).length<7)return toast("تحقق من رقم الهاتف؛ أدخل 7 أرقام على الأقل");
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return toast("تحقق من البريد الإلكتروني");
  if(!["worker","client","supplier","other"].includes(type))return toast("نوع جهة الاتصال غير صحيح");
  const row={
    id:"ct"+Date.now().toString(36)+Math.random().toString(36).slice(2,8),
    type,name,phone,email,company:value("ct-company"),
    address:value("ct-address"),notes:value("ct-notes"),createdAt:Date.now()
  };
  if(!RB.transact(data=>{if(!Array.isArray(data.contacts))data.contacts=[];data.contacts.push(row);}))
    return toast("تعذر حفظ جهة الاتصال؛ لم تتغير البيانات");
  render();toast("تم حفظ جهة الاتصال");
}
function delContact(id){
  const row=(RB.data.contacts||[]).find(c=>String(c.id)===String(id));
  if(!row)return toast("جهة الاتصال غير موجودة");
  const linked=(RB.data.projects||[]).some(p=>String(p.contactId||"")===String(id))||
    (RB.data.invoices||[]).some(x=>String(x.clientContactId||x.contactId||x.customerId||"")===String(id))||
    (RB.data.purchases||[]).some(x=>String(x.supplierId||x.contactId||"")===String(id))||
    RB.all("work").some(x=>String(x.contactId||"")===String(id));
  if(linked)return toast("لا يمكن حذف جهة مرتبطة بمشروع أو فاتورة أو مشتريات أو حركة مالية؛ احتفظ بها لحماية السجلات");
  if(!confirm("هل تريد حذف جهة الاتصال؟"))return;
  if(!RB.transact(data=>{data.contacts=(data.contacts||[]).filter(c=>String(c.id)!==String(id));}))
    return toast("تعذر الحذف؛ لم تتغير البيانات");
  render();toast("تم حذف جهة الاتصال");
}
function editContact(id){
  const row=(RB.data.contacts||[]).find(c=>String(c.id)===String(id));
  if(!row)return toast("جهة الاتصال غير موجودة");
  document.getElementById("rimbook-contact-edit-modal")?.remove();
  const modal=document.createElement("div");
  modal.id="rimbook-contact-edit-modal";
  modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");
  modal.setAttribute("aria-label","تعديل جهة الاتصال");
  modal.style.cssText="position:fixed;inset:0;z-index:130;background:#000a;display:flex;align-items:center;justify-content:center;padding:14px";
  const field=(id,label,value,type="text")=>'<label class="muted" for="'+id+'">'+label+'</label><input id="'+id+'" type="'+type+'" value="'+esc(String(value??""))+'" style="width:100%;margin:4px 0 10px">';
  modal.innerHTML='<div class="card" style="width:min(100%,520px);max-height:88vh;overflow:auto;margin:0;background:var(--card)">'+
    '<div class="row" style="justify-content:space-between"><b>تعديل جهة الاتصال</b><button type="button" onclick="document.getElementById(\'rimbook-contact-edit-modal\')?.remove()">إغلاق ✕</button></div>'+
    field("ct-edit-name","الاسم",row.name)+
    '<label class="muted" for="ct-edit-type">النوع</label><select id="ct-edit-type" style="width:100%;margin:4px 0 10px">'+
    '<option value="worker" '+(row.type==="worker"?"selected":"")+'>عامل</option><option value="client" '+(row.type==="client"?"selected":"")+'>عميل</option><option value="supplier" '+(row.type==="supplier"?"selected":"")+'>مورد</option><option value="other" '+(row.type==="other"?"selected":"")+'>أخرى</option></select>'+
    field("ct-edit-phone","رقم الهاتف مع رمز الدولة",row.phone,"tel")+
    field("ct-edit-email","البريد الإلكتروني",row.email,"email")+
    field("ct-edit-company","الشركة",row.company)+field("ct-edit-address","العنوان",row.address)+
    '<label class="muted" for="ct-edit-notes">ملاحظات</label><textarea id="ct-edit-notes" rows="3" style="width:100%;margin:4px 0 10px">'+esc(String(row.notes??""))+'</textarea>'+
    '<div class="row"><button class="p" type="button" style="flex:1" onclick="saveContactEdit('+JSON.stringify(String(id))+')">حفظ التعديلات</button>'+
    '<button type="button" onclick="document.getElementById(\'rimbook-contact-edit-modal\')?.remove()">إلغاء</button></div></div>';
  document.body.append(modal);
}
function saveContactEdit(id){
  const value=key=>document.getElementById("ct-edit-"+key)?.value.trim()||"";
  const name=value("name"),type=value("type"),phone=value("phone"),email=value("email");
  if(!name)return toast("اسم جهة الاتصال مطلوب");
  if(!["worker","client","supplier","other"].includes(type))return toast("نوع جهة الاتصال غير صحيح");
  if(!phone&&!email)return toast("أضف رقم هاتف أو بريداً إلكترونياً واحداً على الأقل");
  if(phone&&contactDigits(phone).length<7)return toast("تحقق من رقم الهاتف");
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return toast("تحقق من البريد الإلكتروني");
  const ok=RB.transact(data=>{
    const target=(data.contacts||[]).find(c=>String(c.id)===String(id));
    if(!target)throw new Error("contact not found");
    Object.assign(target,{name,type,phone,email,company:value("company"),address:value("address"),notes:document.getElementById("ct-edit-notes")?.value.trim()||""});
  });
  if(!ok)return toast("تعذر حفظ التعديل؛ لم تتغير البيانات");
  document.getElementById("rimbook-contact-edit-modal")?.remove();
  render();toast("تم تعديل جهة الاتصال وحفظها");
}
function contactCounts(){
  const c=RB.data.contacts||[];
  return {total:c.length,workers:c.filter(x=>x.type==="worker").length,clients:c.filter(x=>x.type==="client").length,suppliers:c.filter(x=>x.type==="supplier").length};
}
function contactDigits(phone){return String(phone||"").replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[^0-9]/g,"");}
function contactCopy(value){
  if(!value)return;
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(String(value)).then(()=>toast("تم النسخ")).catch(()=>toast("تعذر النسخ؛ اضغط مطولاً على النص"));
  else toast("اضغط مطولاً على النص لنسخه");
}
function contactWhatsApp(phone){
  const digits=contactDigits(phone);
  if(!digits)return toast("لا يوجد رقم هاتف");
  window.open("https://wa.me/"+digits,"_blank");
}
function contactRows(query){
  const escv=s=>esc(String(s??""));
  const q=String(query||"").trim().toLocaleLowerCase();
  const rows=(RB.data.contacts||[]).filter(c=>[c.name,c.phone,c.email,c.company,c.notes].join(" ").toLocaleLowerCase().includes(q));
  return rows.map(c=>{
    const phone=String(c.phone||"").trim(),email=String(c.email||"").trim(),digits=contactDigits(phone);
    const type=({worker:"عامل",client:"عميل",supplier:"مورد",other:"أخرى"})[c.type]||"جهة اتصال";
    const supplier=c.type==="supplier"&&window.rimbookSupplierSummary?window.rimbookSupplierSummary(c.id):null;
    const customer=c.type==="client"&&window.rimbookCustomerInvoiceSummary?window.rimbookCustomerInvoiceSummary(c):null;
    const currency=String(RB.data.settings?.currency||"");
    const fmt=n=>Number(n||0).toLocaleString("ar",{minimumFractionDigits:2,maximumFractionDigits:2})+" "+esc(currency);
    return '<article class=card style="margin-top:8px"><div class=row style="justify-content:space-between"><b style="font-size:16px">'+escv(c.name)+'</b><span class=tag>'+type+'</span></div>'+
      (c.company?'<p class=muted>'+escv(c.company)+'</p>':"")+
      (supplier?'<div class="grid2" style="margin:8px 0"><div><small class=muted>إجمالي مشترياته</small><b>'+fmt(supplier.total)+'</b></div><div><small class=muted>المدفوع</small><b>'+fmt(supplier.paid)+'</b></div><div><small class=muted>المتبقي له</small><b>'+fmt(supplier.outstanding)+'</b></div><div><small class=muted>صافي تكلفة المشتريات</small><b>'+fmt(supplier.netCost)+'</b></div></div><small class=muted>عدد فواتير الشراء المرتبطة: '+supplier.purchases+' · الملغاة: '+supplier.cancelled+'</small>':"")+
      (customer?'<div class="grid2" style="margin:8px 0"><div><small class=muted>إجمالي الفواتير</small><b>'+fmt(customer.total)+'</b></div><div><small class=muted>المقبوض</small><b>'+fmt(customer.paid)+'</b></div><div><small class=muted>المتبقي على العميل</small><b>'+fmt(customer.remaining)+'</b></div><div><small class=muted>زيادة قبض تحتاج تسوية</small><b>'+fmt(customer.overpaid)+'</b></div></div><small class=muted>الفواتير: '+customer.invoices+' · غير المسددة: '+customer.unpaid+' · الجزئية: '+customer.partial+' · المسددة: '+customer.paidInvoices+'</small>':"")+
      (phone?'<p style="direction:ltr;text-align:right"><a href="tel:'+escv(phone)+'" style="color:var(--ac);font-size:16px;font-weight:700">'+escv(phone)+'</a></p>':"")+
      (email?'<p style="direction:ltr;text-align:right"><a href="mailto:'+escv(email)+'" style="color:var(--ac)">'+escv(email)+'</a></p>':"")+
      (c.address?'<p class=muted>📍 '+escv(c.address)+'</p>':"")+(c.notes?'<p>'+escv(c.notes)+'</p>':"")+
      '<div class=row style="margin-top:10px">'+
      (phone?'<a href="tel:'+escv(phone)+'"><button class=p type=button>📞 اتصال</button></a><button type=button onclick="contactWhatsApp(\''+digits+'\')">💚 واتساب</button><a href="sms:'+escv(phone)+'"><button type=button>✉️ SMS</button></a><button type=button data-copy="'+escv(phone)+'" onclick="contactCopy(this.dataset.copy)">نسخ الرقم</button>':"")+
      (email?'<a href="mailto:'+escv(email)+'"><button type=button>📧 بريد</button></a><button type=button data-copy="'+escv(email)+'" onclick="contactCopy(this.dataset.copy)">نسخ البريد</button>':"")+
      '<button type=button onclick="editContact('+JSON.stringify(c.id)+')">تعديل</button><button class=danger type=button onclick="delContact(\''+escv(c.id)+'\')">حذف</button></div></article>';
  }).join("")||'<p class=muted>لا توجد نتائج مطابقة.</p>';
}
function contactsScreen(){
  const counts=contactCounts();
  return '<div class=card><b style="font-size:17px">👥 دليل التواصل</b><p class=muted>اتصال وواتساب ورسائل وبريد بلمسة واحدة. البيانات محفوظة على هذا الجهاز.</p><div class=grid3><div><small class=muted>الكل</small><h3>'+counts.total+'</h3></div><div><small class=muted>عمال</small><h3>'+counts.workers+'</h3></div><div><small class=muted>عملاء وموردون</small><h3>'+(counts.clients+counts.suppliers)+'</h3></div></div></div>'+
  '<div class=card><b>➕ إضافة جهة اتصال</b><label class=muted>الاسم</label><input id=ct-name maxlength=100 placeholder="اسم الشخص" style="width:100%;margin:4px 0 10px">'+
  '<label class=muted>النوع</label><select id=ct-type style="width:100%;margin:4px 0 10px"><option value=worker>عامل</option><option value=client>عميل</option><option value=supplier>مورد</option><option value=other>أخرى</option></select>'+
  '<label class=muted>رقم الهاتف مع رمز الدولة</label><input id=ct-phone type=tel inputmode=tel autocomplete=tel placeholder="+961..." style="width:100%;margin:4px 0 10px">'+
  '<label class=muted>البريد الإلكتروني</label><input id=ct-email type=email inputmode=email autocomplete=email placeholder="name@example.com" style="width:100%;margin:4px 0 10px">'+
  '<label class=muted>الشركة (اختياري)</label><input id=ct-company placeholder="اسم الشركة" style="width:100%;margin:4px 0 10px">'+
  '<label class=muted>العنوان (اختياري)</label><input id=ct-address placeholder="المدينة أو العنوان" style="width:100%;margin:4px 0 10px">'+
  '<label class=muted>ملاحظات (اختياري)</label><textarea id=ct-notes rows=2 style="width:100%;margin:4px 0 10px" placeholder="معلومات إضافية"></textarea>'+
  '<button class=p style="width:100%;min-height:46px;font-size:15px" onclick="addContact()">حفظ جهة الاتصال</button></div>'+
  '<div class=card><b>🔎 البحث في الدليل</b><input type=search placeholder="الاسم أو الرقم أو الشركة..." oninput="document.getElementById(\'ct-list\').innerHTML=contactRows(this.value)" style="width:100%;margin-top:8px"><div id=ct-list>'+contactRows("")+'</div></div>';
}
window.contactsScreen=contactsScreen;
