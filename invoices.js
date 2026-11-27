/* rimbook invoices.js - فواتير PDF احترافية */

const INV_CURRENCIES = { "$":"USD","€":"EUR","TL":"TRY","SAR":"SAR","AED":"AED","ل.س":"SYP" };
const invoiceCents = value => Math.round((Number(value)||0)*100);
function parseInvoiceAmount(value){
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
}

  function invoicePaymentSummary(inv) {
  const rows=RB.all("work").filter(row=>String(row.invoiceId||"")===String(inv.id));
  const paidCents=rows.reduce((sum,row)=>sum+invoiceCents(row.rec),0);
  const totalCents=invoiceCents(invoiceTotals(inv).total);
  const recognizedPaid=Math.max(0,paidCents);
  return {
    total:totalCents/100,paid:recognizedPaid/100,
    remaining:Math.max(0,totalCents-recognizedPaid)/100,
    overpaid:Math.max(0,recognizedPaid-totalCents)/100,
    status:totalCents>0&&paidCents>=totalCents?"paid":paidCents>0?"partial":inv.paid?"legacy":"unpaid",
    paymentRows:rows.length
    };
  }
window.rimbookInvoiceSummary=invoicePaymentSummary;

function customerInvoiceSummary(contact,invoices,contacts) {
  if(!contact)return {invoices:0,total:0,paid:0,remaining:0,overpaid:0,unpaid:0,partial:0,paidInvoices:0};
  const allInvoices=Array.isArray(invoices)?invoices:[];
  const allContacts=Array.isArray(contacts)?contacts:[];
  const norm=value=>String(value||"").normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase();
  const sameName=allContacts.filter(row=>row.type==="client"&&norm(row.name)===norm(contact.name));
  const linked=allInvoices.filter(inv=>{
    const ids=[inv.clientContactId,inv.contactId,inv.customerId].filter(value=>value!==undefined&&value!==null&&String(value)!=="").map(String);
    if(ids.length)return ids.includes(String(contact.id));
    return sameName.length===1&&norm(inv.client)===norm(contact.name);
    });
  const summaries=linked.map(invoicePaymentSummary);
  const cents=value=>Math.round((Number(value)||0)*100);
  const sum=key=>summaries.reduce((total,row)=>total+cents(row[key]),0)/100;
  return {
    invoices:linked.length,total:sum("total"),paid:sum("paid"),remaining:sum("remaining"),overpaid:sum("overpaid"),
    unpaid:summaries.filter(row=>row.status==="unpaid"||row.status==="legacy").length,
    partial:summaries.filter(row=>row.status==="partial").length,
    paidInvoices:summaries.filter(row=>row.status==="paid").length
    };
  }
window.rimbookCustomerInvoiceSummary=customerInvoiceSummary;

function invoiceNumber(projId){
  const invs = RB.data.invoices || [];
  const projInvs = invs.filter(i => i.project === projId);
  return String(projInvs.length + 1).padStart(4, "0");
}

function createInvoice(projId){
  const proj = RB.data.projects.find(p => p.id === projId);
  if(!proj) return toast("اختر مشروعاً أولاً");
  const inv = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    project: projId,
    number: invoiceNumber(projId),
    date: iso(new Date()),
    dueDate: iso(new Date(Date.now() + 30*864e5)),
    client: "",
    items: [],
    notes: "",
    paid: false,
    createdAt: new Date().toISOString()
  };
  if(!RB.transact(data=>{if(!Array.isArray(data.invoices))data.invoices=[];data.invoices.push(inv);}))
    return toast("تعذر حفظ الفاتورة؛ لم تُنشأ فاتورة غير محفوظة");
  render();
  toast("✅ فاتورة جديدة #" + inv.number);
}

function openInvoiceItemForm(invId,index){
  const inv=RB.data.invoices.find(row=>String(row.id)===String(invId));
  if(!inv)return toast("لم نعثر على الفاتورة");
  const editing=Number.isInteger(index)&&index>=0;
  const item=editing?inv.items?.[index]:null;
  if(editing&&!item)return toast("بند الفاتورة غير موجود");
  document.getElementById("rimbook-invoice-item-modal")?.remove();
  const modal=document.createElement("div");
  modal.id="rimbook-invoice-item-modal";
  modal.setAttribute("role","dialog");
  modal.setAttribute("aria-modal","true");
  modal.setAttribute("aria-labelledby","inv-item-title");
  modal.style.cssText="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto";
  modal.innerHTML='<form id="inv-item-form" class="card" style="width:min(540px,100%);max-height:92vh;overflow:auto;margin:auto"><div class="row" style="justify-content:space-between;align-items:center"><b id="inv-item-title" style="font-size:18px">'+(editing?"تعديل بند الفاتورة":"إضافة بند للفاتورة")+'</b><button type="button" id="inv-item-close" aria-label="إغلاق">✕</button></div><p class="muted">أدخل وصف البند والكمية وسعر الوحدة. سيُعاد احتساب إجمالي الفاتورة تلقائياً.</p><label for="inv-item-desc">وصف البند</label><input id="inv-item-desc" maxlength="180" required style="width:100%;margin:4px 0 10px"><div class="grid2"><div><label for="inv-item-qty">الكمية</label><input id="inv-item-qty" inputmode="decimal" required style="width:100%;margin:4px 0 10px"></div><div><label for="inv-item-price">سعر الوحدة</label><input id="inv-item-price" inputmode="decimal" required style="width:100%;margin:4px 0 10px"></div></div><div class="row" style="justify-content:flex-end;gap:8px"><button type="button" id="inv-item-cancel">إلغاء</button><button type="submit" class="p">'+(editing?"حفظ التعديل":"إضافة البند")+'</button></div></form>';
  document.body.appendChild(modal);
  const form=modal.querySelector("#inv-item-form");
  const close=()=>modal.remove();
  modal.querySelector("#inv-item-close").addEventListener("click",close);
  modal.querySelector("#inv-item-cancel").addEventListener("click",close);
  modal.addEventListener("click",event=>{if(event.target===modal)close();});
  modal.querySelector("#inv-item-desc").value=item?.desc||"";
  modal.querySelector("#inv-item-qty").value=item?.qty==null?"":String(item.qty);
  modal.querySelector("#inv-item-price").value=item?.price==null?"":String(item.price);
  form.addEventListener("submit",event=>{
    event.preventDefault();
    const desc=modal.querySelector("#inv-item-desc").value.trim();
    const qty=parseInvoiceAmount(modal.querySelector("#inv-item-qty").value);
    const price=parseInvoiceAmount(modal.querySelector("#inv-item-price").value);
    if(!desc)return toast("وصف البند مطلوب");
    if(!Number.isFinite(qty)||qty<=0)return toast("الكمية يجب أن تكون أكبر من صفر");
    if(!Number.isFinite(price)||price<0)return toast("أدخل سعراً صحيحاً لا يقل عن صفر");
    if(editing&&invoicePaymentSummary(inv).paid>0&&!confirm("هذه الفاتورة لها دفعات مسجلة. تعديل البند سيغير الإجمالي والرصيد المتبقي، ولن يمسح سجل الدفعات. هل تريد المتابعة؟"))return;
    const ok=RB.transact(data=>{
      const row=data.invoices.find(entry=>String(entry.id)===String(invId));
      if(!row)return;
      if(!Array.isArray(row.items))row.items=[];
      const next={desc,qty,price:invoiceCents(price)/100};
      if(editing){
        if(!row.items[index])return;
        row.items[index]={...row.items[index],...next};
      }else row.items.push(next);
    });
    if(!ok)return toast("تعذر حفظ بند الفاتورة");
    close();render();toast(editing?"تم تعديل بند الفاتورة":"تمت إضافة بند الفاتورة");
  });
  modal.querySelector("#inv-item-desc").focus();
}
function addInvoiceItem(invId){openInvoiceItemForm(invId,null);}

  function invoiceTotals(inv) {
  const subCents=(inv.items||[]).reduce((sum,it)=>sum+invoiceCents((Number(it.qty)||0)*(Number(it.price)||0)),0);
  const taxRate=Math.min(100,Math.max(0,Number(inv.tax)||0));
  const discountRate=Math.min(100,Math.max(0,Number(inv.discount)||0));
  const taxCents=Math.round(subCents*taxRate/100);
  const discountCents=Math.round(subCents*discountRate/100);
  return {sub:subCents/100,tax:taxCents/100,disc:discountCents/100,total:(subCents+taxCents-discountCents)/100};
  }
function editInvoiceItem(invId,index){openInvoiceItemForm(invId,index);}
function removeInvoiceItem(invId,index){
  const inv=RB.data.invoices.find(i=>String(i.id)===String(invId));
  if(!inv?.items?.[index])return toast("بند الفاتورة غير موجود");
  const paid=invoicePaymentSummary(inv).paid;
  const warning=paid>0?" لهذه الفاتورة دفعات مسجلة؛ سيبقى سجل القبض محفوظاً وقد يظهر رصيد زائد بعد حذف البند.":"";
  if(!confirm("حذف هذا البند من الفاتورة؟"+warning))return;
  const ok=RB.transact(data=>{
    const row=data.invoices.find(i=>String(i.id)===String(invId));
    if(!row?.items?.[index])return;
    row.items.splice(index,1);
  });
  if(!ok)return toast("تعذر حذف البند");
  render();toast("تم حذف بند الفاتورة مع الاحتفاظ بسجل الدفعات");
}
function recordInvoicePayment(invId){
  const inv=RB.data.invoices.find(row=>String(row.id)===String(invId));
  if(!inv)return toast("لم نعثر على الفاتورة");
  const summary=invoicePaymentSummary(inv);
  if(summary.remaining<=0)return toast("الفاتورة مسددة بالكامل");
  document.getElementById("rimbook-invoice-payment-modal")?.remove();
  const modal=document.createElement("div");
  modal.id="rimbook-invoice-payment-modal";
  modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","inv-payment-title");
  modal.style.cssText="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:14px";
  modal.innerHTML='<form id="inv-payment-form" class="card" style="width:min(480px,100%);margin:auto"><div class="row" style="justify-content:space-between"><b id="inv-payment-title">تسجيل دفعة الفاتورة #'+esc(String(inv.number||inv.id))+'</b><button type="button" id="inv-payment-close" aria-label="إغلاق">✕</button></div><p class="muted">الرصيد المتبقي حالياً: <b>'+esc(summary.remaining.toFixed(2))+'</b></p>'+(summary.status==="legacy"?'<p class="muted">هذه الفاتورة معلّمة مدفوعة قديماً دون حركة قبض موثقة؛ سيتم تسجيل القبض الفعلي الآن.</p>':"")+'<label for="inv-payment-amount">مبلغ الدفعة</label><input id="inv-payment-amount" type="text" inputmode="decimal" required placeholder="أدخل مبلغ الدفعة" style="width:100%;margin:4px 0 12px"><div class="row" style="justify-content:flex-end"><button type="button" id="inv-payment-cancel">إلغاء</button><button type="submit" class="p">حفظ الدفعة</button></div></form>';
  document.body.appendChild(modal);
  const close=()=>modal.remove(),form=modal.querySelector("#inv-payment-form");
  modal.querySelector("#inv-payment-close").addEventListener("click",close);
  modal.querySelector("#inv-payment-cancel").addEventListener("click",close);
  modal.addEventListener("click",event=>{if(event.target===modal)close();});
  form.addEventListener("submit",event=>{
    event.preventDefault();
    const amount=parseInvoiceAmount(modal.querySelector("#inv-payment-amount").value);
    const amountCents=invoiceCents(amount);
    if(!Number.isFinite(amount)||amountCents<=0)return toast("أدخل مبلغاً صحيحاً أكبر من صفر");
    let applied=false,reason="";
    const ok=RB.transact(data=>{
      const live=data.invoices.find(row=>String(row.id)===String(invId));
      if(!live){reason="لم نعثر على الفاتورة";return;}
      const totalCents=invoiceCents(invoiceTotals(live).total);
      const paidCents=(data.items||[]).filter(row=>row.type==="work"&&String(row.invoiceId||"")===String(invId)).reduce((sum,row)=>sum+invoiceCents(row.rec),0);
      const remainingCents=Math.max(0,totalCents-Math.max(0,paidCents));
      if(amountCents>remainingCents){reason=remainingCents===0?"الفاتورة مسددة بالكامل":"تجاوز المبلغ المتبقي؛ حدّث السجل وأعد المحاولة";return;}
      if(!Array.isArray(data.items))data.items=[];
      data.items.push({type:"work",k:"payment",d:iso(new Date()),ds:"دفعة فاتورة #"+String(live.number||live.id),rec:amountCents/100,project:live.project||null,person:live.client||"",invoiceId:live.id,invoiceNumber:live.number||"",created:Date.now(),id:Date.now().toString(36)+Math.random().toString(36).slice(2,8)});
      applied=true;
    });
    if(!ok)return;
    if(!applied)return toast(reason||"تعذر تسجيل الدفعة");
    close();render();toast("تم تسجيل الدفعة في سجل المقبوضات وربطها بالفاتورة دون تكرار");
  });
  modal.querySelector("#inv-payment-amount").focus();
}

function printInvoice(invId){
  const inv = RB.data.invoices.find(i => i.id === invId);
  if(!inv) return;
  const proj = RB.data.projects.find(p => p.id === inv.project);
  const p = RB.data.profile;
  const s = RB.data.settings;
  const T = invoiceTotals(inv);
  const P = invoicePaymentSummary(inv);
  const cur = s.currency;

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>فاتورة #${inv.number}</title>
<style>
  @media print{ @page{ margin:1cm; size:A4; } }
  body{ font-family:system-ui,Tahoma; padding:30px; max-width:800px; margin:auto; color:#1e293b; }
  .header{ display:flex; justify-content:space-between; align-items:start; border-bottom:3px solid #2563eb; padding-bottom:16px; margin-bottom:20px; }
  .logo{ font-size:28px; font-weight:bold; color:#2563eb; font-family:Georgia,serif; }
  .info{ text-align:left; font-size:13px; line-height:1.7; }
  .info b{ color:#1e293b; }
  .meta{ display:flex; justify-content:space-between; margin-bottom:20px; font-size:13px; }
  .meta div{ background:#f1f5f9; padding:10px 14px; border-radius:8px; }
  table{ width:100%; border-collapse:collapse; margin:16px 0; }
  th{ background:#2563eb; color:white; padding:10px; text-align:right; font-size:12px; }
  td{ border:1px solid #e2e8f0; padding:10px; font-size:13px; }
  .totals{ text-align:left; margin-top:16px; }
  .totals table{ width:280px; margin-left:auto; }
  .totals td{ border:none; padding:6px 10px; }
  .totals tr:last-child td{ border-top:2px solid #2563eb; font-size:16px; font-weight:bold; color:#f43f5e; }
  .footer{ margin-top:40px; padding-top:16px; border-top:1px solid #e2e8f0; font-size:11px; color:#64748b; text-align:center; }
  .paid-stamp{ color:#10b981; font-size:24px; border:3px solid #10b981; padding:8px 20px; border-radius:8px; display:inline-block; transform:rotate(-15deg); font-weight:bold; }
</style></head><body>

<div class="header">
  <div>
    <div class="logo">📖 rimbook</div>
    <div style="font-size:12px;color:#64748b;margin-top:4px">${esc(p.name || "المزود")}</div>
  </div>
  <div class="info">
    ${p.phone ? `<div>📞 ${esc(p.phone)}</div>` : ""}
    ${p.email ? `<div>📧 ${esc(p.email)}</div>` : ""}
    ${p.city ? `<div>📍 ${esc(p.city)}</div>` : ""}
  </div>
</div>

<div class="meta">
  <div><b>فاتورة #:</b> ${inv.number}</div>
  <div><b>التاريخ:</b> ${inv.date}</div>
  <div><b>الاستحقاق:</b> ${inv.dueDate}</div>
  ${proj ? `<div><b>المشروع:</b> ${esc(proj.name)}</div>` : ""}
</div>

${inv.client ? `<p><b>العميل:</b> ${esc(inv.client)}</p>` : ""}

<table>
  <thead><tr><th>#</th><th>الوصف</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead>
  <tbody>
    ${inv.items.map((it, i) => `<tr>
      <td>${i+1}</td>
      <td>${esc(it.desc)}</td>
      <td>${it.qty}</td>
      <td>${it.price} ${cur}</td>
      <td>${(it.qty*it.price).toFixed(2)} ${cur}</td>
    </tr>`).join("") || "<tr><td colspan=5 style='text-align:center;color:#94a3b8'>لا بنود</td></tr>"}
  </tbody>
</table>

<div class="totals">
  <table>
    <tr><td>المجموع الفرعي:</td><td>${T.sub.toFixed(2)} ${cur}</td></tr>
    ${inv.tax ? `<tr><td>الضريبة (${inv.tax}%):</td><td>${T.tax.toFixed(2)} ${cur}</td></tr>` : ""}
    ${inv.discount ? `<tr><td>الخصم (${inv.discount}%):</td><td>-${T.disc.toFixed(2)} ${cur}</td></tr>` : ""}
    <tr><td>الإجمالي:</td><td>${T.total.toFixed(2)} ${cur}</td></tr>
  </table>
</div>

${P.status==="paid" ? '<div style="text-align:center;margin-top:20px"><span class="paid-stamp">مدفوعة بالكامل ✅</span></div>' : '<div style="margin-top:20px;padding:12px;background:#f8fafc;border-radius:8px"><b>حالة السداد:</b> '+(P.status==="partial"?"دفعة جزئية":P.status==="legacy"?"معلّمة مدفوعة سابقاً دون قبض موثق":"غير مسددة")+'<br><b>المقبوض الموثق:</b> '+P.paid.toFixed(2)+' '+cur+'<br><b>المتبقي:</b> '+P.remaining.toFixed(2)+' '+cur+(P.overpaid>0?'<br><b>زيادة قبض تحتاج تسوية:</b> '+P.overpaid.toFixed(2)+' '+cur:'')+'</div>'}

${inv.notes ? `<p style="margin-top:20px;padding:12px;background:#f8fafc;border-radius:8px"><b>ملاحظات:</b><br>${esc(inv.notes)}</p>` : ""}

<div class="footer">
  ${esc(p.about || "")}<br>
  صُنعت بواسطة <b>rimbook</b>
</div>

</body></html>`;

  const file = new File([new Blob([html], {type:"text/html"})],
    `invoice-${inv.number}-${inv.date}.html`, {type:"text/html"});

  if(window.RimbookShare){
    const money = n => Number(n||0).toFixed(2) + " " + cur;
    const summary = ["🧾 فاتورة #" + inv.number, "التاريخ: " + inv.date, proj ? "المشروع: " + proj.name : "",
      "الإجمالي: " + money(T.total), "المقبوض: " + money(P.paid), "المتبقي: " + money(P.remaining), "", "— من ريمبوك"].filter(Boolean).join("\n");
    window.RimbookShare.open({ title: "إرسال الفاتورة", text: summary, subject: "فاتورة #" + inv.number, filename: "invoice-" + inv.number + ".txt",
      file: { name: file.name, type: "text/html", blob: file.slice ? file : new Blob([html], {type:"text/html"}) } });
    return;
  }
  if(navigator.canShare && navigator.canShare({files:[file]})){
    navigator.share({files:[file], title:"فاتورة #"+inv.number})
      .catch(() => openPrintWindow(html));
  } else {
    openPrintWindow(html);
  }
}

function openPrintWindow(html){
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  setTimeout(() => { try { w.print(); } catch(e){} }, 500);
}

/* عرض الفواتير في شاشة المشروع */
function invoicesSection(projId){
  const invs = (RB.data.invoices || []).filter(i => !projId || i.project === projId);
  if(!projId) return "";
  return `<div class=card>
    <b>🧾 الفواتير (${invs.length})</b>
    <div class=row style="margin-top:8px"><button class=p onclick="createInvoice('${projId}')">+ فاتورة جديدة</button></div>
    ${invs.map(inv => {
      const T = invoiceTotals(inv);
      return `<div style="border:1px solid var(--bd);border-radius:8px;padding:10px;margin-top:8px">
        <div class=row style="justify-content:space-between">
          <b>#${inv.number}</b>
          <span class=tag>${invoicePaymentSummary(inv).status==="paid" ? "✅ مدفوعة" : invoicePaymentSummary(inv).status==="partial" ? "دفعة جزئية" : invoicePaymentSummary(inv).status==="legacy" ? "مدفوعة قديماً — قبض غير موثق" : "⏳ غير مسددة"}</span>
        </div>
        <small class=muted>${inv.date} · الإجمالي ${T.total.toFixed(2)} ${RB.data.settings.currency} · المقبوض ${invoicePaymentSummary(inv).paid.toFixed(2)} · المتبقي ${invoicePaymentSummary(inv).remaining.toFixed(2)}${invoicePaymentSummary(inv).overpaid>0?" · زيادة قبض "+invoicePaymentSummary(inv).overpaid.toFixed(2):""}</small>
        <div style="margin-top:8px">${(inv.items||[]).map((it,index)=>`<div class="row" style="justify-content:space-between;border-top:1px solid var(--bd);padding:6px 0"><span style="flex:1;min-width:0">${esc(it.desc)} · ${it.qty} × ${Number(it.price||0).toFixed(2)} = <b>${(Number(it.qty||0)*Number(it.price||0)).toFixed(2)}</b></span><button type="button" onclick="editInvoiceItem(${JSON.stringify(inv.id)},${index})">تعديل</button><button class="danger" type="button" onclick="removeInvoiceItem(${JSON.stringify(inv.id)},${index})">حذف البند</button></div>`).join("")||'<small class=muted>لا توجد بنود في هذه الفاتورة</small>'}</div>
        <div class=row style="margin-top:6px">
          <button onclick="addInvoiceItem('${inv.id}')">+ بند</button>
          <button class=p onclick="printInvoice('${inv.id}')">🖨️ طباعة/PDF</button>
          ${invoicePaymentSummary(inv).remaining>0 ? '<button class=p onclick="recordInvoicePayment(\''+inv.id+'\')">تسجيل دفعة</button>' : '<span class=tag>مكتملة السداد</span>'}
          <button class=danger onclick="delInvoice('${inv.id}')" title="الحذف النهائي متوقف حفاظاً على الحقوق" aria-label="الحذف النهائي متوقف">🔒</button>
        </div>
      </div>`;
    }).join("") || '<p class=muted>لا فواتير بعد</p>'}
  </div>`;
}
function delInvoice(id){
  const invoice=RB.data.invoices.find(i=>String(i.id)===String(id));
  if(!invoice)return toast("لم نعثر على الفاتورة");
  toast("الحذف النهائي للفواتير متوقف حفاظاً على الحقوق. سنوفر إلغاءً موثقاً يحتفظ بأثر الفاتورة بدلاً من محوها.");
}
