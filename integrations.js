/* rimbook integrations.js - الإضافات الاختيارية */

const INTEGRATIONS = {
  localBackup: { id:"localBackup", cat:"free", icon:"💾", name:"نسخ احتياطي محلي",
    desc:"تنزيل كل بياناتك كملف JSON على جهازك. مجاني تماماً وبدون إنترنت.",
    fields:[], run:()=>backupLocal() },
  csvExport: { id:"csvExport", cat:"free", icon:"📊", name:"تصدير CSV",
    desc:"تصدير سجلات العمل إلى Excel/Sheets.",
    fields:[], run:()=>csvW() },
  icsExport: { id:"icsExport", cat:"free", icon:"📅", name:"تصدير التقويم (ICS)",
    desc:"استورد مواعيدك في Google Calendar / Apple Calendar.",
    fields:[], run:()=>exportICS() },
  whatsapp: { id:"whatsapp", cat:"free", icon:"💚", name:"مشاركة عبر واتساب",
    desc:"إرسال تقرير العمل إلى رقم المدير.",
    fields:[{ key:"managerPhone", label:"رقم واتساب (مع رمز الدولة)", type:"tel" }],
    run:()=>shareW() },
  webShare: { id:"webShare", cat:"free", icon:"📤", name:"مشاركة النظام",
    desc:"مشاركة الملف عبر البلوتوث / البريد / AirDrop / أي تطبيق.",
    fields:[], run:()=>shareViaAny() },
  webrtc: { id:"webrtc", cat:"free", icon:"🔗", name:"نقل مباشر بين جهازين (WebRTC)",
    desc:"نقل البيانات بين جهازين بلا وسيط.",
    fields:[], run:()=>{ go("sync"); } },
  voice: { id:"voice", cat:"free", icon:"🎤", name:"الإدخال الصوتي",
    desc:"الكتابة بالصوت (متوفر أصلاً).",
    fields:[], run:()=>toast("🎤 استخدم زر الميكروفون") },
  printReport: { id:"printReport", cat:"free", icon:"📄", name:"تقرير للطباعة / PDF",
    desc:"إنشاء تقرير HTML جاهز للطباعة أو حفظه PDF.",
    fields:[], run:()=>sharePdfReport() },

  gdrive: { id:"gdrive", cat:"keyed", icon:"☁️", name:"Google Drive",
    desc:"نسخ احتياطي يدوي كامل إلى Google Drive يشمل البيانات والمرفقات. ليس مزامنة تلقائية — يحتاج Client ID.",
    help:"1) console.cloud.google.com\n2) أنشئ مشروع\n3) فعّل Drive API\n4) OAuth Client ID (Web)\n5) انسخ Client ID\n6) أضف رابط موقعك في Authorized origins",
    fields:[{ key:"gdriveClientId", label:"Google Client ID", type:"text", placeholder:"xxxxx.apps.googleusercontent.com" }],
    test: async (cfg) => {
      if(!cfg.gdriveClientId) throw new Error("أدخل Client ID");
      return "تم حفظ Client ID فقط؛ لم يُختبر تسجيل الدخول إلى Google Drive بعد.";
    },
    run:()=>{ if(!RB.data.settings.gdriveClientId) return toast("⚠️ فعّل Google Drive أولاً"); gdriveUpload(); } },
  telegram: { id:"telegram", cat:"keyed", icon:"✈️", name:"Telegram Bot",
    desc:"إرسال تقارير إلى تيليغرام. مجاني عبر @BotFather.",
    help:"1) افتح @BotFather\n2) /newbot\n3) انسخ التوكن\n4) أرسل رسالة للبوت\n5) احصل على chat_id من @userinfobot",
    fields:[
      { key:"tgToken", label:"Bot Token", type:"password", placeholder:"123:ABC..." },
      { key:"tgChatId", label:"Chat ID", type:"text", placeholder:"123456789" }
    ],
    test: async (cfg) => {
      if(!cfg.tgToken || !cfg.tgChatId) throw new Error("أدخل التوكن و chat_id");
      const r = await fetch(`https://api.telegram.org/bot${cfg.tgToken}/sendMessage`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ chat_id: cfg.tgChatId, text: "✅ rimbook متصل!" })
      }).then(r=>r.json());
      if(!r.ok) throw new Error(r.description || "فشل");
      return "✅ وصلت رسالة اختبار";
    },
    run: async () => {
      const cfg = RB.data.settings;
      if(!cfg.tgToken || !cfg.tgChatId) return toast("⚠️ فعّل Telegram أولاً");
      try {
        if(typeof window.collectRimbookBackup !== "function") throw new Error("خدمة النسخ الكامل غير متاحة");
        const backup = await window.collectRimbookBackup();
        const fd = new FormData();
        fd.append("chat_id", cfg.tgChatId);
        fd.append("caption", "📋 نسخة Rimbook كاملة — " + new Date().toLocaleDateString("ar"));
        fd.append("document", new Blob([JSON.stringify(backup)], {type:"application/json"}), "rimbook-full-backup.json");
        const response = await fetch(`https://api.telegram.org/bot${cfg.tgToken}/sendDocument`, { method:"POST", body: fd });
        const result = await response.json();
        if(!response.ok || !result.ok) throw new Error(result.description || "فشل إرسال النسخة");
        toast("تم إرسال النسخة الكاملة إلى Telegram مع " + backup.attachments.length + " مرفقاً");
      } catch(e){ toast("تعذر الإرسال إلى Telegram: " + (e.message || "خطأ غير معروف")); }
    } },
  notion: { id:"notion", cat:"keyed", icon:"📓", name:"Notion",
    desc:"حفظ الملاحظات في Notion. مجاني.",
    help:"1) notion.so/my-integrations\n2) Integration جديدة\n3) انسخ Token\n4) شارك صفحة مع الـ Integration\n5) Page ID من رابط الصفحة",
    fields:[
      { key:"notionToken", label:"Integration Token", type:"password", placeholder:"secret_..." },
      { key:"notionPageId", label:"Page ID", type:"text", placeholder:"xxxxxxxx" }
    ],
    test: async (cfg) => {
      if(!cfg.notionToken) throw new Error("أدخل التوكن");
      const r = await fetch("https://api.notion.com/v1/users/me", {
        headers: { Authorization: `Bearer ${cfg.notionToken}`, "Notion-Version": "2022-06-28" }
      });
      if(!r.ok) throw new Error("توكن غير صالح");
      return "✅ التوكن صحيح";
    },
    run: async () => {
      const cfg = RB.data.settings;
      if(!cfg.notionToken || !cfg.notionPageId) return toast("⚠️ فعّل Notion أولاً");
      const notes = RB.all("note").slice(-5);
      try {
        for(const n of notes){
          const response = await fetch("https://api.notion.com/v1/pages", {
            method:"POST",
            headers:{ Authorization:`Bearer ${cfg.notionToken}`, "Content-Type":"application/json", "Notion-Version":"2022-06-28" },
            body: JSON.stringify({
              parent: { page_id: cfg.notionPageId },
              properties: { title: [{ text: { content: String(n.title || "rimbook note").slice(0, 2000) } }] },
              children: [{ object:"block", type:"paragraph", paragraph:{ rich_text:[{ text:{ content: String(n.body || "").slice(0, 2000) } }] } }]
            })
          });
          if(!response.ok){
            const details = await response.json().catch(() => ({}));
            throw new Error(details.message || "Notion رفض إنشاء الملاحظة: " + response.status);
          }
        }
        toast(`تم إرسال ${notes.length} ملاحظات إلى Notion`);
      } catch(e){ toast("تعذر إرسال الملاحظات إلى Notion: " + (e.message || "خطأ غير معروف")); }
    } },
  dropbox: { id:"dropbox", cat:"keyed", icon:"📦", name:"Dropbox",
    desc:"نسخ احتياطي على Dropbox. مجاني.",
    help:"1) dropbox.com/developers/apps\n2) Create app → Scoped → Full Dropbox\n3) Permissions → files.content.write\n4) Generated Access Token",
    fields:[{ key:"dropboxToken", label:"Access Token", type:"password", placeholder:"sl...." }],
    test: async (cfg) => {
      if(!cfg.dropboxToken) throw new Error("أدخل التوكن");
      const r = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method:"POST", headers:{ Authorization:`Bearer ${cfg.dropboxToken}` }
      });
      if(!r.ok) throw new Error("توكن غير صالح");
      return "✅ التوكن صحيح";
    },
    run: async () => {
      const cfg = RB.data.settings;
      if(!cfg.dropboxToken) return toast("⚠️ فعّل Dropbox أولاً");
      try {
        if(typeof window.collectRimbookBackup !== "function") throw new Error("خدمة النسخ الكامل غير متاحة");
        const payload = await window.collectRimbookBackup();
        const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
          method:"POST",
          headers:{
            Authorization:`Bearer ${cfg.dropboxToken}`,
            "Content-Type":"application/octet-stream",
            "Dropbox-API-Arg": JSON.stringify({ path:`/rimbook-full-backup-${new Date().toISOString().slice(0,10)}.json`, mode:"overwrite" })
          },
          body: JSON.stringify(payload)
        });
        if(!response.ok) throw new Error("فشل رفع النسخة إلى Dropbox: " + response.status);
        toast("تم رفع النسخة الكاملة إلى Dropbox مع " + payload.attachments.length + " مرفقاً");
      } catch(e){ toast("تعذر النسخ إلى Dropbox: " + (e.message || "خطأ غير معروف")); }
    } },

  openai: { id:"openai", cat:"paid", icon:"🤖", name:"ذكاء اصطناعي (OpenAI / Gemini)",
    desc:"تحليل ذكي للنصوص الصوتية. مدفوع حسب الاستخدام (على نفقتك).",
    help:"1) platform.openai.com/api-keys\n2) أنشئ مفتاحاً\n3) ضعه هنا\n(يُحاسب من رصيدك فقط)",
    fields:[
      { key:"openaiKey", label:"API Key", type:"password", placeholder:"sk-..." },
      { key:"aiProvider", label:"المزود", type:"select", options:["OpenAI","Gemini"] }
    ],
    test: async (cfg) => {
      if(!cfg.openaiKey) throw new Error("أدخل المفتاح");
      const r = await fetch("https://api.openai.com/v1/models", { headers:{ Authorization:`Bearer ${cfg.openaiKey}` } });
      if(!r.ok) throw new Error("مفتاح غير صالح");
      return "✅ مفتاح OpenAI صحيح";
    },
    run: async () => {
      const cfg = RB.data.settings;
      if(!cfg.openaiKey) return toast("⚠️ فعّل OpenAI أولاً");
      const text = prompt("النص للتحليل:");
      if(!text) return;
      try {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method:"POST",
          headers:{ Authorization:`Bearer ${cfg.openaiKey}`, "Content-Type":"application/json" },
          body: JSON.stringify({
            model:"gpt-4o-mini",
            messages:[{ role:"user", content:`حلل هذا النص وأخرج JSON: type, amount, person, date, time, project. النص: "${text}"` }]
          })
        }).then(r=>r.json());
        const out = r.choices?.[0]?.message?.content || "";
        toast("🤖 " + out.slice(0, 200));
      } catch(e){ toast("❌ خطأ"); }
    } },

};

function isEnabled(id){
  const s = RB.data.settings;
  if(!s.enabled) s.enabled = {};
  return !!s.enabled[id];
}
function toggleIntegration(id, enable){
  const integration = INTEGRATIONS[id];
  if(!integration) return toast("الإضافة غير معروفة");
  const saved = RB.transact(data => {
    if(!data.settings.enabled || typeof data.settings.enabled !== "object") data.settings.enabled = {};
    data.settings.enabled[id] = !!enable;
  });
  if(!saved) return;
  render();
  toast(enable ? "تم تفعيل " + integration.name : "تم تعطيل " + integration.name);
}
function saveIntegrationField(key, value){
  const allowed = new Set(Object.values(INTEGRATIONS).flatMap(integration => (integration.fields || []).map(field => field.key)));
  if(!allowed.has(key)) return toast("حقل إعداد غير معروف");
  const saved = RB.transact(data => { data.settings[key] = String(value ?? ""); });
  if(!saved) return;
}
async function testIntegration(id){
  const integ = INTEGRATIONS[id];
  if(!integ.test) return toast("لا اختبار");
  try {
    const msg = await integ.test(RB.data.settings);
    toast(msg);
  } catch (e) { alert("❌ " + (e.message || e)); }
}

VIEWS.integrations = () => {
  const settings = RB.data.settings;
  const legacyKeys = ["fbApiKey","fbProjectId","myDomain"];
  const hasLegacy = legacyKeys.some(key => Object.prototype.hasOwnProperty.call(settings,key)) ||
    !!(settings.enabled && (Object.prototype.hasOwnProperty.call(settings.enabled,"firebase") || Object.prototype.hasOwnProperty.call(settings.enabled,"customDomain")));
  if(hasLegacy){
    const cleaned = RB.transact(data => {
      legacyKeys.forEach(key => { delete data.settings[key]; });
      if(data.settings.enabled){
        delete data.settings.enabled.firebase;
        delete data.settings.enabled.customDomain;
      }
    });
    if(!cleaned) toast("تعذر تنظيف إعدادات Firebase والدومين القديمة؛ أعد فتح الإضافات لاحقاً");
  }
  const s = RB.data.settings;
  const renderCard = (integ) => {
    const enabled = isEnabled(integ.id);
    const catBadge = { free:"🟢 مجاني", keyed:"🟡 بمفتاحك", paid:"🔴 على نفقتك" }[integ.cat];
    return `<div class="card" style="border-right:4px solid ${enabled?'var(--ok)':'var(--bd)'}">
      <div class=row style="justify-content:space-between">
        <b>${integ.icon} ${esc(integ.name)}</b>
        <span class=tag>${catBadge}</span>
      </div>
      <p class=muted style="margin:6px 0">${esc(integ.desc)}</p>
      ${integ.help ? `<details><summary class=muted>📖 كيف أفعّلها؟</summary><pre style="white-space:pre-wrap;font-size:11px;background:var(--in);padding:8px;border-radius:8px;margin-top:6px">${esc(integ.help)}</pre></details>` : ""}
      ${integ.fields.map(f => `
        <p style="margin:6px 0"><label class=muted>${f.label}</label><br>
        ${f.type === "select"
          ? `<select onchange="saveIntegrationField('${f.key}', this.value)">${f.options.map(o => `<option ${s[f.key]===o?"selected":""}>${o}</option>`).join("")}</select>`
          : `<input type="${f.type}" value="${esc(s[f.key] || "")}" placeholder="${f.placeholder || ""}" onchange="saveIntegrationField('${f.key}', this.value)" style="width:100%">`}
        </p>`).join("")}
      <div class=row style="margin-top:8px">
        <button class="${enabled?"":"p"}" onclick="toggleIntegration('${integ.id}', ${!enabled})">${enabled?"⏸️ تعطيل":"▶️ تفعيل"}</button>
        ${integ.test ? `<button onclick="testIntegration('${integ.id}')">🧪 اختبار</button>` : ""}
        ${enabled ? `<button class=p onclick="INTEGRATIONS['${integ.id}'].run()">🚀 تشغيل</button>` : ""}
      </div>
    </div>`;
  };
  const free = Object.values(INTEGRATIONS).filter(i => i.cat === "free");
  const keyed = Object.values(INTEGRATIONS).filter(i => i.cat === "keyed");
  const paid = Object.values(INTEGRATIONS).filter(i => i.cat === "paid");
  return `<div class=card><b>🧩 الإضافات</b>
    <p class=muted>كل ميزة تختار أنت تفعيلها. <b>لا شيء يعمل تلقائياً</b>.</p>
  </div>
  <h2 style="color:var(--ok);font-size:14px;margin:10px 0">🟢 مجاني بالكامل (${free.length})</h2>
  ${free.map(renderCard).join("")}
  <h2 style="color:var(--warn);font-size:14px;margin:10px 0">🟡 بمفتاحك الشخصي (${keyed.length})</h2>
  ${keyed.map(renderCard).join("")}
  <h2 style="color:var(--bad);font-size:14px;margin:10px 0">🔴 على نفقتك (${paid.length})</h2>
  ${paid.map(renderCard).join("")}`;
};
