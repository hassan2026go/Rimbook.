/* Rimbook "wipe everything" — an explicit, typed-confirmation reset for a truly clean start.
   It erases the main app data AND every add-on's data (ledgers, calendar, employment, projects, diary, saved recipients,
   undo/corrupt snapshots) and cancels the phone's reminder alarms. It never runs by itself, and it keeps the installed
   offline speech model and the app files (those are not account data). */
(function () {
  "use strict";
  const WORD = "امسح";
  const $ = id => document.getElementById(id);
  const safe = v => esc(String(v ?? ""));
  const data = () => window.RimbookData || {};

  function inventory() {
    const rows = [];
    try {
      const d = RB.data || {};
      [["items", "سجلات المفكرة والأعمال القديمة"], ["workers", "العمال (النظام القديم)"], ["projects", "المشاريع (النظام القديم)"], ["invoices", "الفواتير"], ["purchases", "المشتريات"], ["contacts", "جهات الاتصال"]]
        .forEach(([k, label]) => { const n = Array.isArray(d[k]) ? d[k].length : 0; if (n) rows.push({ label, count: n }); });
    } catch (_) {}
    Object.keys(data()).forEach(k => { const m = data()[k]; const n = m && typeof m.count === "function" ? m.count() : 0; if (n) rows.push({ label: m.label || k, count: n }); });
    try { const r = window.RimbookShare && window.RimbookShare.recipients().length; if (r) rows.push({ label: "مستلمون محفوظون", count: r }); } catch (_) {}
    return rows;
  }
  const ownKeys = storage => { const out = []; try { for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && /^rimbook/i.test(k)) out.push(k); } } catch (_) {} return out; };

  /* Cancels native alarms first (they live outside localStorage), then removes every rimbook* key. Returns what was removed. */
  async function run(opts) {
    opts = opts || {};
    try { if (window.RimbookAlarms) await window.RimbookAlarms.sync([]); } catch (_) {}
    const keys = ownKeys(localStorage); keys.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
    const skeys = typeof sessionStorage !== "undefined" ? ownKeys(sessionStorage) : []; skeys.forEach(k => { try { sessionStorage.removeItem(k); } catch (_) {} });
    const left = ownKeys(localStorage);
    if (!left.length && opts.reload !== false) (opts.reloadFn || (() => location.reload()))();
    return { removed: keys.length + skeys.length, left };
  }
  const confirmed = typed => String(typed || "").trim() === WORD;

  const close = () => document.getElementById("rimbook-wipe-modal")?.remove();
  window.wipeAllOpen = function () {
    close();
    const inv = inventory();
    const m = document.createElement("div"); m.id = "rimbook-wipe-modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
    m.style.cssText = "position:fixed;inset:0;z-index:10090;background:#000b;display:flex;align-items:center;justify-content:center;padding:12px";
    m.innerHTML = '<div class="card" style="width:min(100%,520px);max-height:92vh;overflow:auto;margin:0;background:var(--card)">' +
      '<div class="row" style="justify-content:space-between"><b>🗑️ مسح كل البيانات</b><button type="button" onclick="document.getElementById(\'rimbook-wipe-modal\')?.remove()">✕</button></div>' +
      '<p><b>سيُحذف نهائياً من هذا الجهاز ولا يمكن التراجع:</b></p>' +
      (inv.length ? inv.map(r => '<div class="item"><span>' + safe(r.label) + '</span><b>' + r.count + '</b></div>').join("") : '<p class="muted">لا توجد بيانات مسجّلة حالياً (سيُمسح الإعداد والتفضيلات فقط).</p>') +
      '<p class="muted">يشمل ذلك كل الحسابات والدفاتر والتنبيهات المجدولة. لا يُحذف محرك الصوت العربي المثبّت ولا ملفات التطبيق.</p>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px"><button type="button" onclick="backupAllExport && backupAllExport()">📦 نسخة احتياطية أولاً</button></div>' +
      '<label class="muted" for="wipe-word" style="display:block;margin-top:10px">للتأكيد اكتب كلمة: <b>' + WORD + '</b></label><input id="wipe-word" autocomplete="off" oninput="wipeAllCheck()" style="width:100%;margin:4px 0 10px">' +
      '<div class="row"><button id="wipe-go" type="button" disabled onclick="wipeAllGo()" style="background:#d32f2f;color:#fff">🗑️ امسح كل شيء الآن</button><button type="button" onclick="document.getElementById(\'rimbook-wipe-modal\')?.remove()">إلغاء</button></div></div>';
    document.body.append(m);
    m.addEventListener("click", e => { if (e.target === m) close(); });
  };
  window.wipeAllCheck = function () { const b = $("wipe-go"); if (b) b.disabled = !confirmed(($("wipe-word") || {}).value); };
  window.wipeAllGo = async function () {
    if (!confirmed(($("wipe-word") || {}).value)) return toast("اكتب كلمة التأكيد أولاً");
    const r = await run();
    if (r.left.length) toast("تعذر مسح بعض البيانات: " + r.left.join("، "));
  };

  window.RimbookWipe = { inventory, run, confirmed, WORD, ownKeys };
  const baseMore = VIEWS.more;
  if (typeof baseMore === "function") VIEWS.more = function () {
    return baseMore() + '<div class="card"><b>🗑️ بداية نظيفة</b><p class="muted">مسح كل البيانات والحسابات من هذا الجهاز (بتأكيد صريح).</p><button type="button" style="width:100%;min-height:50px" onclick="wipeAllOpen()">🗑️ مسح كل البيانات…</button></div>';
  };
})();
