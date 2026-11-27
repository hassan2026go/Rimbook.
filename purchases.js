/* Rimbook purchases and materials ledger — append-only, project-linked purchasing. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const val = id => ($(id)?.value || "").trim();
  const number = id => Number(val(id));
  const today = () => iso(new Date());
  const validDate = value => { if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false; const date=new Date(value+"T00:00:00Z"); return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value; };
  const safe = value => esc(String(value ?? ""));
  const projects = () => RB.data.projects || [];
  const contacts = () => RB.data.contacts || [];
  const purchases = () => (RB.data.purchases || []).slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  const money = n => Number(n||0).toLocaleString("ar",{minimumFractionDigits:2,maximumFractionDigits:2})+" "+safe(RB.data.settings.currency||"");
  const cents = value => Math.round((Number(value)||0)*100);
  const moneyValue = value => cents(value)/100;
  const parseAmount = value => {
    let s=String(value??"").replace(/[٠-٩۰-۹]/g,d=>{
      const a="٠١٢٣٤٥٦٧٨٩",p="۰۱۲۳۴۵۶۷۸۹",i=a.indexOf(d);
      return String(i>=0?i:p.indexOf(d));
    }).replace(/[\s$€£]/g,"").replace(/[٬]/g,",").replace(/[٫]/g,".");
    if(!s)return NaN;
    const comma=s.lastIndexOf(","),dot=s.lastIndexOf(".");
    if(comma>=0&&dot>=0){
      const decimal=comma>dot?",":".";
      const group=decimal===","?/\./g:/,/g;
      s=s.replace(group,"").replace(decimal,".");
    }else{
      const separator=comma>=0?",":dot>=0?".":"";
      if(separator){
        const parts=s.split(separator);
        if(parts.length>2){
          const groups=parts.slice(1,-1).every(part=>part.length===3);
          if(parts[parts.length-1].length===2&&groups)s=parts.slice(0,-1).join("")+"."+parts[parts.length-1];
          else if(parts.slice(1).every(part=>part.length===3))s=parts.join("");
          else return NaN;
        }else if(parts[1].length===3&&parts[0].length>0)s=parts.join("");
        else s=parts[0]+"."+parts[1];
      }
    }
    if(!/^\d+(?:\.\d{1,2})?$/.test(s))return NaN;
    return Number(s);
  };

  function purchaseAccounting(p) {
    const paidCents=Math.max(0,(p.payments||[]).reduce((sum,x)=>sum+Math.max(0,cents(x.amount)),0));
    const rawRefundedCents=Math.max(0,(p.refunds||[]).reduce((sum,x)=>sum+Math.max(0,cents(x.amount)),0));
    const refundedCents=Math.min(paidCents,rawRefundedCents);
    const totalCents=Math.max(0,cents(p.total));
    const remainingCents=p.status==="cancelled"?0:Math.max(0,totalCents-paidCents);
    const netCostCents=p.status==="cancelled"?Math.max(0,paidCents-refundedCents):totalCents;
    return {
      paid:paidCents/100, refunded:refundedCents/100,
      remaining:remainingCents/100, netCost:netCostCents/100,
      supplierBalance:remainingCents/100
    };
  }
  function supplierSummary(contactId, rows) {
    const linked=(rows||[]).filter(p=>String(p.contactId||"")===String(contactId||""));
    const totals=linked.reduce((sum,p)=>{
      const a=purchaseAccounting(p);
      sum.totalCents+=Math.max(0,cents(p.total));
      sum.paidCents+=cents(a.paid);
      sum.refundedCents+=cents(a.refunded);
      sum.netCostCents+=cents(a.netCost);
      sum.outstandingCents+=cents(a.supplierBalance);
      if(p.status==="cancelled")sum.cancelled++;
      return sum;
    },{totalCents:0,paidCents:0,refundedCents:0,netCostCents:0,outstandingCents:0,cancelled:0});
    return {
      purchases:linked.length,
      total:totals.totalCents/100,
      paid:totals.paidCents/100,
      refunded:totals.refundedCents/100,
      netCost:totals.netCostCents/100,
      outstanding:totals.outstandingCents/100,
      cancelled:totals.cancelled
    };
  }
  window.rimbookSupplierSummary = contactId => supplierSummary(contactId,RB.data.purchases||[]);
  window.rimbookPurchaseAccounting = purchaseAccounting;
  const paid = p => purchaseAccounting(p).paid;
  const refunded = p => purchaseAccounting(p).refunded;
  const remaining = p => purchaseAccounting(p).remaining;

  function appendPurchaseRefund(p,amount,date,id) {
    const paidCents=Math.max(0,(p.payments||[]).reduce((sum,x)=>sum+Math.max(0,cents(x.amount)),0));
    const refundedCents=Math.min(paidCents,Math.max(0,(p.refunds||[]).reduce((sum,x)=>sum+Math.max(0,cents(x.amount)),0)));
    const refundCents=cents(amount);
    if(!Number.isFinite(Number(amount))||Number(amount)<0||refundCents>Math.max(0,paidCents-refundedCents))return false;
    if(!Array.isArray(p.refunds))p.refunds=[];
    if(refundCents>0)p.refunds.push({id,date,amount:refundCents/100,note:"استرداد عند الإلغاء"});
    return true;
  }
  const netCost = p => purchaseAccounting(p).netCost;

  window.rimbookProjectPurchasesTotal = id => purchases().filter(p=>String(p.projectId||"")===String(id)).reduce((sum,p)=>sum+netCost(p),0);

  window.previewPurchaseTotal = function () {
    const qtyRaw=val("buy-qty"),priceRaw=val("buy-price"),output=$("buy-total");
    if(!output)return;
    if(qtyRaw===""||priceRaw===""){output.textContent="—";return;}
    const qty=Number(qtyRaw),price=Number(priceRaw);
    output.textContent=Number.isFinite(qty)&&qty>0&&Number.isFinite(price)&&price>0?money(qty*price):"—";
  };

  window.addRimbookPurchase = function () {
    const item=val("buy-item"),date=val("buy-date")||today(),qty=number("buy-qty"),unitPrice=number("buy-price");
    const paidNow=parseAmount(val("buy-paid")),projectId=val("buy-project")||null,contactId=val("buy-supplier")||null;
    const supplierName=val("buy-supplier-name")||(contacts().find(c=>String(c.id)===String(contactId))?.name||"");
    const total=moneyValue(qty*unitPrice);
    if(!item)return toast("اكتب اسم المادة أو المشتريات");
    if(!validDate(date))return toast("تحقق من تاريخ الشراء وصحته في التقويم");
    if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(unitPrice)||unitPrice<=0)return toast("أدخل كمية وسعر وحدة فعليين أكبر من صفر");
    if(!Number.isFinite(paidNow)||paidNow<0||paidNow>total)return toast("الدفعة يجب أن تكون بين صفر وإجمالي الفاتورة");
    const row={
      id:"buy_"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      item, date, qty, unit:val("buy-unit"), unitPrice,total,
      projectId, contactId, supplierName,
      invoiceNumber:val("buy-invoice"), notes:val("buy-notes"),
      payments:paidNow>0?[{id:"pay_"+Date.now().toString(36),date,amount:paidNow,note:"دفعة عند الشراء"}]:[],
      refunds:[],status:"active",createdAt:Date.now()
    };
    if(!RB.transact(data=>{if(!Array.isArray(data.purchases))data.purchases=[];data.purchases.push(row);}))return;
    render();toast("تم تسجيل المشتريات وربطها بالمشروع");
  };

  window.addPurchasePayment = function (id) {
    const row=purchases().find(p=>String(p.id)===String(id));
    if(!row||row.status==="cancelled")return;
    document.getElementById("rimbook-purchase-payment-modal")?.remove();
    const modal=document.createElement("div");
    modal.id="rimbook-purchase-payment-modal";
    modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","buy-payment-title");
    modal.style.cssText="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:14px";
    modal.innerHTML='<form id="buy-payment-form" class="card" style="width:min(480px,100%);margin:auto"><div class="row" style="justify-content:space-between"><b id="buy-payment-title">تسجيل دفعة للمورد</b><button type="button" id="buy-payment-close" aria-label="إغلاق">✕</button></div><p class="muted">المتبقي عند فتح النموذج: <b>'+money(remaining(row))+'</b></p><label for="buy-payment-amount">مبلغ الدفعة</label><input id="buy-payment-amount" type="text" inputmode="decimal" required placeholder="أدخل مبلغ الدفعة" style="width:100%;margin:4px 0 10px"><label for="buy-payment-note">بيان الدفعة (اختياري)</label><input id="buy-payment-note" maxlength="240" value="دفعة للمورد" style="width:100%;margin:4px 0 12px"><div class="row" style="justify-content:flex-end"><button type="button" id="buy-payment-cancel">إلغاء</button><button type="submit" class="p">حفظ الدفعة</button></div></form>';
    document.body.appendChild(modal);
    const close=()=>modal.remove(),form=modal.querySelector("#buy-payment-form");
    modal.querySelector("#buy-payment-close").addEventListener("click",close);
    modal.querySelector("#buy-payment-cancel").addEventListener("click",close);
    modal.addEventListener("click",event=>{if(event.target===modal)close();});
    form.addEventListener("submit",event=>{
      event.preventDefault();
      const amount=parseAmount(modal.querySelector("#buy-payment-amount").value);
      const note=modal.querySelector("#buy-payment-note").value.trim();
      if(!Number.isFinite(amount)||amount<=0)return toast("أدخل مبلغاً صحيحاً أكبر من صفر");
      let applied=false,reason="";
      const ok=RB.transact(data=>{
        const p=(data.purchases||[]).find(x=>String(x.id)===String(id));
        if(!p||p.status==="cancelled"){reason="لم تعد عملية الشراء نشطة";return;}
        const left=purchaseAccounting(p).remaining;
        if(amount>left+0.000001){reason="تجاوز المبلغ المتبقي؛ حدّث السجل وأعد المحاولة";return;}
        if(!Array.isArray(p.payments))p.payments=[];
        p.payments.push({id:"pay_"+Date.now().toString(36),date:today(),amount:moneyValue(amount),note:note||"دفعة للمورد",createdAt:Date.now()});
        applied=true;
      });
      if(!ok)return;
      if(!applied)return toast(reason||"تعذر تسجيل الدفعة");
      close();render();toast("تم تسجيل دفعة المورد");
    });
    modal.querySelector("#buy-payment-amount").focus();
  };

  window.cancelRimbookPurchase = function (id) {
    const row=purchases().find(p=>String(p.id)===String(id));
    if(!row||row.status==="cancelled")return;
    const refundable=Math.max(0,paid(row)-refunded(row));
    document.getElementById("rimbook-purchase-cancel-modal")?.remove();
    const modal=document.createElement("div");
    modal.id="rimbook-purchase-cancel-modal";
    modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","buy-cancel-title");
    modal.style.cssText="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:14px";
    modal.innerHTML='<form id="buy-cancel-form" class="card" style="width:min(480px,100%);margin:auto"><div class="row" style="justify-content:space-between"><b id="buy-cancel-title">إلغاء عملية الشراء وتسويتها</b><button type="button" id="buy-cancel-close" aria-label="إغلاق">✕</button></div><p class="muted">المدفوع غير المسترد: <b>'+money(refundable)+'</b>. أدخل قيمة ما تم استرداده الآن، ويمكن أن تكون صفراً.</p><label for="buy-cancel-reason">سبب الإلغاء (إلزامي)</label><textarea id="buy-cancel-reason" maxlength="400" required rows="3" style="width:100%;margin:4px 0 10px"></textarea><label for="buy-cancel-refund">المبلغ المسترد الآن</label><input id="buy-cancel-refund" type="text" inputmode="decimal" required value="'+refundable.toFixed(2)+'" style="width:100%;margin:4px 0 12px"><div class="row" style="justify-content:flex-end"><button type="button" id="buy-cancel-cancel">رجوع</button><button type="submit" class="danger">تأكيد الإلغاء</button></div></form>';
    document.body.appendChild(modal);
    const close=()=>modal.remove(),form=modal.querySelector("#buy-cancel-form");
    modal.querySelector("#buy-cancel-close").addEventListener("click",close);
    modal.querySelector("#buy-cancel-cancel").addEventListener("click",close);
    modal.addEventListener("click",event=>{if(event.target===modal)close();});
    form.addEventListener("submit",event=>{
      event.preventDefault();
      const reason=modal.querySelector("#buy-cancel-reason").value.trim();
      const refund=parseAmount(modal.querySelector("#buy-cancel-refund").value);
      if(reason.length<3)return toast("اكتب سبب الإلغاء بوضوح");
      if(!Number.isFinite(refund)||refund<0)return toast("أدخل مبلغ استرداد صحيحاً");
      let applied=false,problem="";
      const ok=RB.transact(data=>{
        const p=(data.purchases||[]).find(x=>String(x.id)===String(id));
        if(!p||p.status==="cancelled"){problem="عملية الشراء أُلغيت أو تغيرت بالفعل";return;}
        const refundableNow=Math.max(0,purchaseAccounting(p).paid-purchaseAccounting(p).refunded);
        if(refund>refundableNow){problem="مبلغ الاسترداد يتجاوز المدفوع غير المسترد حالياً";return;}
        if(!appendPurchaseRefund(p,refund,today(),"ref_"+Date.now().toString(36))){problem="تعذر اعتماد مبلغ الاسترداد";return;}
        p.status="cancelled";p.cancelledAt=Date.now();p.cancellationReason=reason;
        applied=true;
      });
      if(!ok)return;
      if(!applied)return toast(problem||"تعذر إلغاء عملية الشراء");
      close();render();toast("تم إلغاء عملية الشراء مع الاحتفاظ بسجلها وتسويتها");
    });
    modal.querySelector("#buy-cancel-reason").focus();
  };

  VIEWS.purchases = function () {
    const rows=purchases();
    const active=rows.filter(p=>p.status!=="cancelled");
    const total=rows.reduce((sum,p)=>sum+netCost(p),0);
    const paidTotal=rows.reduce((sum,p)=>sum+Math.max(0,paid(p)-refunded(p)),0);
    const outstanding=active.reduce((sum,p)=>sum+remaining(p),0);
    const projectOptions='<option value="">عام — دون مشروع</option>'+projects().map(p=>'<option value="'+safe(p.id)+'">'+safe(p.name)+'</option>').join("");
    const supplierOptions='<option value="">مورد غير مسجل</option>'+contacts().filter(c=>c.type==="supplier"||c.kind==="supplier"||c.role==="supplier").map(c=>'<option value="'+safe(c.id)+'">'+safe(c.name)+'</option>').join("");
    const cards=rows.map(p=>{
      const cancelled=p.status==="cancelled";
      return '<div class="card"><div class="row" style="justify-content:space-between"><b>'+safe(p.item)+'</b><span class="tag '+(cancelled?"bad":"ok")+'">'+(cancelled?"ملغاة":"مسجلة")+'</span></div>'+
        '<small class="muted">'+safe(p.date)+' · '+safe(p.supplierName||"مورد غير مسجل")+' · '+safe(projects().find(x=>String(x.id)===String(p.projectId))?.name||"عام")+'</small>'+
        '<p>'+safe(p.qty)+' '+safe(p.unit)+' × '+money(p.unitPrice)+' = <b>'+money(p.total)+'</b></p>'+
        '<div class="grid3"><div>المدفوع<h3>'+(paid(p)-refunded(p)>0?money(Math.max(0,paid(p)-refunded(p))):"لم يُسدد بعد")+'</h3></div><div>المتبقي<h3>'+money(remaining(p))+'</h3></div><div>التكلفة الصافية<h3>'+money(netCost(p))+'</h3></div></div>'+
        (p.invoiceNumber?'<p class="muted">رقم الفاتورة: '+safe(p.invoiceNumber)+'</p>':"")+
        (p.notes?'<p class="muted">'+safe(p.notes)+'</p>':"")+
        (cancelled?'<p class="muted">سبب الإلغاء: '+safe(p.cancellationReason||"")+'</p>':'<div class="row"><button onclick="addPurchasePayment('+JSON.stringify(p.id)+')">تسجيل دفعة</button><button class="danger" onclick="cancelRimbookPurchase('+JSON.stringify(p.id)+')">إلغاء مع تسوية</button></div>')+
        '</div>';
    }).join("");
    return '<div class="card"><b style="font-size:18px">🧱 المشتريات والمواد</b><p class="muted">سجل مشتريات المواد والموردين واربط كل عملية بمشروع. الدفعات والإلغاءات محفوظة كسجل مالي ولا تُحذف العمليات.</p>'+
      (rows.length?'<div class="grid3"><div class="card">التكلفة الصافية<h3>'+money(total)+'</h3></div><div class="card">المدفوع<h3>'+(paidTotal?money(paidTotal):"لم يُسدد بعد")+'</h3></div><div class="card">المتبقي للموردين<h3>'+money(outstanding)+'</h3></div></div>':'<p class="muted">لا توجد مشتريات أو أرصدة موردين مسجلة بعد.</p>')+'</div>'+
      '<div class="card"><b>تسجيل شراء جديد</b><label class="muted">المادة أو الخدمة</label><input id="buy-item" maxlength="160" placeholder="مثلاً: إسمنت، كابلات، معدات" style="width:100%;margin:4px 0 10px">'+
      '<label class="muted">المورد</label><select id="buy-supplier" style="width:100%;margin:4px 0 8px">'+supplierOptions+'</select><input id="buy-supplier-name" placeholder="اسم المورد إذا لم يكن مسجلاً" style="width:100%;margin:4px 0 10px">'+
      '<label class="muted">المشروع</label><select id="buy-project" style="width:100%;margin:4px 0 10px">'+projectOptions+'</select>'+
      '<div class="grid2"><div><label class="muted">التاريخ</label><input id="buy-date" type="date" value="'+today()+'" style="width:100%;margin:4px 0 10px"></div><div><label class="muted">رقم فاتورة المورد</label><input id="buy-invoice" placeholder="اختياري" style="width:100%;margin:4px 0 10px"></div>'+
      '<div><label class="muted">الكمية</label><input id="buy-qty" type="number" min="0.001" step="0.001" placeholder="أدخل الكمية" oninput="previewPurchaseTotal()" style="width:100%;margin:4px 0 10px"></div><div><label class="muted">الوحدة</label><input id="buy-unit" placeholder="الوحدة: قطعة، متر، كغ..." style="width:100%;margin:4px 0 10px"></div>'+
      '<div><label class="muted">سعر الوحدة</label><input id="buy-price" type="number" min="0" step="0.01" placeholder="أدخل سعر الوحدة" oninput="previewPurchaseTotal()" style="width:100%;margin:4px 0 10px"></div><div><label class="muted">المدفوع الآن</label><input id="buy-paid" type="number" min="0" step="0.01" placeholder="المدفوع الآن (اختياري)" style="width:100%;margin:4px 0 10px"></div></div>'+
      '<p>الإجمالي المتوقع: <b id="buy-total">—</b></p><label class="muted">ملاحظات</label><textarea id="buy-notes" rows="2" style="width:100%;margin:4px 0 10px"></textarea>'+
      '<button class="p" style="width:100%;min-height:46px" onclick="addRimbookPurchase()">حفظ عملية الشراء</button></div>'+
      '<div class="card"><b>سجل المشتريات ('+rows.length+')</b>'+(cards||'<p class="muted">لا توجد مشتريات مسجلة بعد.</p>')+'</div>';
  };
  render();
})();
