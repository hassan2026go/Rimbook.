/* Rimbook unified backup — ONE file holding every add-on's data (ledgers, calendar, employment, projects).
   Each module keeps its own integrity checksum, the bundle has one more, and a restore is all-or-nothing: if any module fails,
   the modules already restored are rolled back from snapshots. (The main app's older data keeps its own backup in Settings.) */
(function () {
  "use strict";
  const L = window.RimbookLedgerCore;
  if (!L) return;
  const $ = id => document.getElementById(id);
  const data = () => window.RimbookData || {};
  const names = () => Object.keys(data()).filter(k => data()[k] && typeof data()[k].export === "function");

  function build(now) {
    const modules = {};
    names().forEach(k => { modules[k] = data()[k].export(); });
    return { format: "rimbook-all", version: 1, exportedAt: now || Date.now(), modules, checksum: L.checksum(modules) };
  }
  function verify(bundle) {
    if (!bundle || bundle.format !== "rimbook-all") return { ok: false, error: "هذا ليس ملف نسخة ريمبوك الشاملة" };
    if (bundle.version !== 1) return { ok: false, error: "إصدار الملف غير مدعوم" };
    if (!bundle.modules || typeof bundle.modules !== "object" || L.checksum(bundle.modules) !== bundle.checksum) return { ok: false, error: "الملف تالف أو عُدّل يدوياً (فشل فحص السلامة)" };
    const present = Object.keys(bundle.modules);
    if (!present.length) return { ok: false, error: "الملف لا يحتوي بيانات" };
    for (const k of present) {
      const mod = data()[k];
      if (!mod) return { ok: false, error: "قسم غير معروف في الملف: " + k };
      const v = mod.verify(bundle.modules[k]);
      if (!v.ok) return { ok: false, error: (mod.label || k) + ": " + v.error };
    }
    return { ok: true, modules: present };
  }
  /* Replace-all restore with rollback. */
  function apply(bundle) {
    const v = verify(bundle); if (!v.ok) return v;
    const snapshots = {}; v.modules.forEach(k => { snapshots[k] = data()[k].snapshot(); });
    const done = [];
    for (const k of v.modules) {
      const r = data()[k].import(bundle.modules[k], "replace");
      if (!r.ok) {
        done.concat(k).forEach(name => { try { data()[name].restore(snapshots[name]); } catch (_) {} });
        return { ok: false, error: (data()[k].label || k) + ": " + (r.error || "فشلت الاستعادة") + " — لم يتغير شيء." };
      }
      done.push(k);
    }
    try { localStorage.setItem("rimbook_all_prev", JSON.stringify(snapshots)); } catch (_) {}
    return { ok: true, modules: v.modules };
  }
  function undo() {
    try {
      const snapshots = JSON.parse(localStorage.getItem("rimbook_all_prev") || "null");
      if (!snapshots) return { ok: false, error: "لا توجد نسخة للتراجع" };
      let failed = "";
      Object.keys(snapshots).forEach(k => { if (data()[k]) { const r = data()[k].restore(snapshots[k]); if (!r.ok) failed = k; } });
      if (failed) return { ok: false, error: "تعذر التراجع في قسم: " + failed };
      localStorage.removeItem("rimbook_all_prev"); return { ok: true };
    } catch (_) { return { ok: false, error: "تعذر التراجع" }; }
  }
  const stamp = () => iso(new Date());

  window.backupAllExport = function () {
    const bundle = build(), text = JSON.stringify(bundle);
    const blob = new Blob([text], { type: "application/json" }), name = "rimbook-all-" + stamp() + ".json";
    const counts = names().map(k => (data()[k].label || k) + ": " + (typeof data()[k].count === "function" ? data()[k].count() : "")).join(" · ");
    if (window.RimbookShare) window.RimbookShare.open({ title: "نسخة احتياطية شاملة", text: "نسخة ريمبوك الاحتياطية الشاملة — " + stamp() + "\n" + counts + "\n\nاحفظ الملف المرفق في مكان آمن (استخدم «مشاركة» لإرساله لنفسك أو لتخزينه، أو «ملف» لتنزيله).", subject: "نسخة ريمبوك الاحتياطية", filename: name,
      file: { name, type: "application/json", blob } });
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); }
  };
  window.backupAllPick = () => $("backup-all-file")?.click();
  window.backupAllImport = function (input) {
    const file = input.files && input.files[0]; input.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast("تعذر قراءة الملف");
    reader.onload = () => {
      let bundle; try { bundle = JSON.parse(String(reader.result)); } catch (_) { return toast("الملف ليس بصيغة صحيحة"); }
      const v = verify(bundle); if (!v.ok) return toast(v.error);
      if (!confirm("ملف سليم يحتوي: " + v.modules.map(k => data()[k].label || k).join("، ") + ".\n\nسيُستبدل ما في هذه الأقسام بمحتوى الملف (تُحفظ نسخة للتراجع). متابعة؟")) return;
      const r = apply(bundle);
      toast(r.ok ? "تمت الاستعادة الشاملة" : r.error); if (r.ok) render();
    };
    reader.readAsText(file);
  };
  window.backupAllUndo = function () { if (!confirm("التراجع عن آخر استعادة شاملة؟")) return; const r = undo(); toast(r.ok ? "تم التراجع" : r.error); if (r.ok) render(); };

  window.RimbookBackupAll = { build, verify, apply, undo };
  const baseMore = VIEWS.more;
  if (typeof baseMore === "function") VIEWS.more = function () {
    return baseMore() + '<div class="card"><b>🗄️ نسخة احتياطية شاملة</b><p class="muted">ملف واحد للدفاتر والتقويم وجهات العمل والمشاريع. الاستعادة تستبدل هذه الأقسام كاملة (مع إمكانية التراجع).</p>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px"><button class="p" type="button" onclick="backupAllExport()">⬇️ تصدير / إرسال</button><button type="button" onclick="backupAllPick()">⬆️ استعادة</button>' +
      (localStorage.getItem("rimbook_all_prev") ? '<button type="button" onclick="backupAllUndo()">↩️ تراجع</button>' : "") + '</div><input id="backup-all-file" type="file" accept="application/json,.json" hidden onchange="backupAllImport(this)"></div>';
  };
})();
