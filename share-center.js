/* Rimbook share center — one place to send schedules, statements, reports and invoices.
   Rimbook only PREPARES the message/file; the user picks the app and the recipient. Nothing is sent to any server by Rimbook.
   Recipients are saved only when the user ticks the box, and live only on this device. */
(function () {
  "use strict";
  const KEY = "rimbook_recipients_v1";
  const MAX_URL = 1800;                                           // longer links are truncated by many apps
  const $ = id => document.getElementById(id);
  const val = id => ($(id)?.value || "").trim();
  const safe = v => esc(String(v ?? ""));
  const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;
  let pendingFile = null;

  const digits = v => String(v || "").replace(/[٠-٩]/g, ch => "٠١٢٣٤٥٦٧٨٩".indexOf(ch)).replace(/\D/g, "").replace(/^00/, "");
  const phoneForSms = v => String(v || "").replace(/[٠-٩]/g, ch => "٠١٢٣٤٥٦٧٨٩".indexOf(ch)).replace(/[^\d+]/g, "");
  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || ""));

  /* Pure link builder (tested): returns the URL for a channel and whether it may be truncated. */
  function link(channel, o) {
    const text = String(o.text || ""), subject = String(o.subject || "ريمبوك");
    let url = "";
    if (channel === "whatsapp") url = "https://wa.me/" + digits(o.phone) + "?text=" + encodeURIComponent(text);
    else if (channel === "sms") url = "sms:" + phoneForSms(o.phone) + "?body=" + encodeURIComponent(text);
    else if (channel === "email") url = "mailto:" + encodeURIComponent(String(o.email || "").trim()) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text);
    return { url, tooLong: url.length > MAX_URL };
  }

  function load() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(list) ? list.filter(r => r && SAFE_ID.test(String(r.id)) && typeof r.name === "string").slice(0, 30) : [];
    } catch (_) { return []; }
  }
  function save(list) {
    try { const json = JSON.stringify(list.slice(0, 30)); localStorage.setItem(KEY, json); return localStorage.getItem(KEY) === json; } catch (_) { return false; }
  }

  const close = () => document.getElementById("rimbook-share-modal")?.remove();
  function open(opts) {
    close();
    opts = opts || {};
    pendingFile = opts.file || null;
    const saved = load();
    const modal = document.createElement("div");
    modal.id = "rimbook-share-modal";
    modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    modal.dataset.subject = opts.subject || opts.title || "ريمبوك";
    modal.dataset.filename = opts.filename || "rimbook.txt";
    modal.style.cssText = "position:fixed;inset:0;z-index:10070;background:#000a;display:flex;align-items:center;justify-content:center;padding:12px";
    modal.innerHTML = '<div class="card" style="width:min(100%,540px);max-height:92vh;overflow:auto;margin:0;background:var(--card)">' +
      '<div class="row" style="justify-content:space-between"><b>📤 ' + safe(opts.title || "إرسال") + '</b><button type="button" onclick="document.getElementById(\'rimbook-share-modal\')?.remove()">✕</button></div>' +
      '<p class="muted">يُجهَّز الإرسال على جهازك فقط، وتختار أنت التطبيق والمستلم. لا يُرسل شيء لأي خدمة قبل اختيارك.</p>' +
      (pendingFile ? '<p class="muted">📎 مرفق: ' + safe(pendingFile.name) + ' — يُرسل عبر زر «مشاركة» (قائمة هاتفك).</p>' : "") +
      '<label class="muted" for="sc-text">النص — يمكنك تعديله قبل الإرسال</label><textarea id="sc-text" rows="9" style="width:100%;margin:4px 0 8px">' + safe(opts.text || "") + '</textarea>' +
      (saved.length ? '<label class="muted" for="sc-saved">مستلم محفوظ</label><select id="sc-saved" onchange="rimbookShareFill()" style="width:100%;margin:4px 0 8px"><option value="">— اختر —</option>' +
        saved.map(r => '<option value="' + r.id + '">' + safe(r.name) + '</option>').join("") + '</select>' : "") +
      '<div class="grid2"><div><label class="muted" for="sc-phone">الهاتف (بصيغة دولية، اختياري)</label><input id="sc-phone" type="tel" inputmode="tel" dir="ltr" value="' + safe(opts.phone || "") + '" placeholder="9665XXXXXXXX" style="width:100%"></div>' +
      '<div><label class="muted" for="sc-email">البريد (اختياري)</label><input id="sc-email" type="email" dir="ltr" value="' + safe(opts.email || "") + '" placeholder="name@example.com" style="width:100%"></div></div>' +
      '<label style="display:block;margin:8px 0"><input id="sc-remember" type="checkbox"> حفظ هذا المستلم على جهازي باسم: <input id="sc-rname" maxlength="40" placeholder="الاسم" style="width:40%"></label>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px"><button class="p" type="button" onclick="rimbookShareSend(\'share\')">📤 مشاركة</button><button type="button" onclick="rimbookShareSend(\'whatsapp\')">واتساب</button>' +
      '<button type="button" onclick="rimbookShareSend(\'sms\')">رسالة SMS</button><button type="button" onclick="rimbookShareSend(\'email\')">بريد</button>' +
      '<button type="button" onclick="rimbookShareSend(\'copy\')">نسخ</button><button type="button" onclick="rimbookShareSend(\'file\')">ملف</button></div>' +
      (saved.length ? '<p class="muted"><button type="button" onclick="rimbookShareForget()">حذف المستلم المحدد</button></p>' : "") + '</div>';
    document.body.append(modal);
    modal.addEventListener("click", e => { if (e.target === modal) close(); });
    return modal;
  }

  window.rimbookShareFill = function () {
    const r = load().find(x => x.id === val("sc-saved")); if (!r) return;
    if ($("sc-phone")) $("sc-phone").value = r.phone || ""; if ($("sc-email")) $("sc-email").value = r.email || "";
  };
  window.rimbookShareForget = function () {
    const id = val("sc-saved"); if (!id) return toast("اختر مستلماً أولاً");
    if (!confirm("حذف المستلم المحفوظ؟")) return;
    save(load().filter(r => r.id !== id)); toast("تم الحذف");
    const modal = $("rimbook-share-modal"), text = val("sc-text");
    open({ title: "إرسال", text, subject: modal && modal.dataset.subject, filename: modal && modal.dataset.filename, file: pendingFile });
  };
  function rememberRecipient() {
    if (!$("sc-remember")?.checked) return;
    const phone = val("sc-phone"), email = val("sc-email"), name = val("sc-rname");
    if (!name || (!phone && !email)) return toast("اكتب اسماً ورقماً أو بريداً لحفظ المستلم");
    if (email && !emailOk(email)) return;
    const list = load();
    if (list.some(r => r.name === name && r.phone === phone && r.email === email)) return;
    list.unshift({ id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name.slice(0, 40), phone: phone.slice(0, 30), email: email.slice(0, 80) });
    if (save(list)) toast("حُفظ المستلم على جهازك");
  }
  window.rimbookShareSend = async function (channel) {
    const modal = $("rimbook-share-modal"); if (!modal) return;
    const text = val("sc-text"); if (!text) return toast("لا يوجد نص لإرساله");
    const o = { text, phone: val("sc-phone"), email: val("sc-email"), subject: modal.dataset.subject };
    const openUrl = url => { const w = window.open(url, "_blank", "noopener"); if (!w) location.href = url; };
    if (channel === "email" && o.email && !emailOk(o.email)) return toast("تحقق من البريد الإلكتروني");
    if (channel === "whatsapp" || channel === "sms" || channel === "email") {
      const l = link(channel, o);
      if (l.tooLong && !confirm("النص طويل وقد يُقتطع في هذا التطبيق. للإرسال الكامل استخدم «مشاركة» أو «ملف». المتابعة؟")) return;
      rememberRecipient(); return openUrl(l.url);
    }
    if (channel === "copy") { try { await navigator.clipboard.writeText(text); toast("تم النسخ"); } catch (_) { toast("تعذر النسخ؛ حدد النص وانسخه يدوياً"); } return; }
    if (channel === "file") {
      const blob = pendingFile && pendingFile.blob ? pendingFile.blob : new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = pendingFile ? pendingFile.name : modal.dataset.filename; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); return toast("تم تجهيز الملف");
    }
    try {                                                           // system share sheet: the only channel that can carry a file
      const data = { title: modal.dataset.subject, text };
      if (pendingFile && pendingFile.blob && typeof File === "function") {
        const f = new File([pendingFile.blob], pendingFile.name, { type: pendingFile.type || pendingFile.blob.type });
        if (navigator.canShare && navigator.canShare({ files: [f] })) data.files = [f];
      }
      if (navigator.share) { await navigator.share(data); rememberRecipient(); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); toast("المشاركة المباشرة غير متاحة؛ نُسخ النص لتلصقه حيث تريد"); }
    catch (_) { toast("المشاركة غير متاحة؛ استخدم واتساب أو البريد أو الملف"); }
  };

  window.RimbookShare = { open, close, link, digits, emailOk, recipients: load };
})();
