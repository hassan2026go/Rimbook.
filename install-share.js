/* Rimbook install & share helpers. Nothing is sent anywhere by the app: sharing opens the system share sheet (or copies text),
   and the user chooses the app and the recipient. */
(function () {
  "use strict";
  let deferred = null;
  const native = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());
  const standalone = () => {
    try { return !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true; } catch (_) { return false; }
  };
  if (typeof window.addEventListener === "function") {
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; if (typeof window.render === "function") try { window.render(); } catch (_) {} });
    window.addEventListener("appinstalled", () => { deferred = null; });
  }
  const api = {
    canInstall: () => !native() && !standalone() && !!deferred,
    isInstalled: () => native() || standalone(),
    async install() {
      if (!deferred) return { ok: false, reason: native() || standalone() ? "installed" : "unavailable" };
      const prompt = deferred; deferred = null;
      try { await prompt.prompt(); const choice = await prompt.userChoice; return { ok: choice && choice.outcome === "accepted", outcome: choice && choice.outcome }; }
      catch (_) { return { ok: false, reason: "failed" }; }
    },
    shareText() {
      const url = (/^https?:/.test(location.protocol) && location.origin && location.origin !== "null") ? location.origin + location.pathname : "";
      return "ريمبوك — تطبيق لتنظيم العمل والعمال والحسابات يعمل على هاتفك دون خادم أو اشتراك." + (url ? "\n" + url : "");
    },
    async share() {
      const text = api.shareText();
      try { if (navigator.share) { await navigator.share({ title: "ريمبوك", text }); return { ok: true, via: "share" }; } }
      catch (e) { if (e && e.name === "AbortError") return { ok: false, reason: "cancelled" }; }
      try { await navigator.clipboard.writeText(text); return { ok: true, via: "copy" }; } catch (_) { return { ok: false, reason: "unavailable" }; }
    }
  };
  window.RimbookInstallShare = api;
  window.rimbookInstallApp = async function () {
    const r = await api.install();
    toast(r.ok ? "تم التثبيت" : r.reason === "installed" ? "التطبيق مثبّت بالفعل" : r.outcome === "dismissed" ? "أُلغي التثبيت" : "التثبيت غير متاح الآن من هذا المتصفح؛ استخدم قائمة المتصفح ‹إضافة إلى الشاشة الرئيسية›");
  };
  window.rimbookShareApp = async function () {
    const r = await api.share();
    toast(r.ok ? (r.via === "copy" ? "نُسخ نص المشاركة" : "تمت المشاركة") : r.reason === "cancelled" ? "" : "المشاركة غير متاحة على هذا الجهاز");
  };
  const baseMore = typeof VIEWS !== "undefined" ? VIEWS.more : null;
  if (typeof baseMore === "function") {
    VIEWS.more = function () {
      const install = api.canInstall() ? '<button class="card" type="button" style="min-height:70px;text-align:right" onclick="rimbookInstallApp()"><b>📲 تثبيت التطبيق الآن</b></button>' : "";
      return baseMore() + '<div class="card"><b>التثبيت والمشاركة</b><p class="muted">المشاركة تفتح قائمة هاتفك لتختار التطبيق والمستلم بنفسك. لا تُرسل بياناتك لأي خدمة خارجية.</p><div class="grid2">' + install +
        '<button class="card" type="button" style="min-height:70px;text-align:right" onclick="rimbookShareApp()"><b>📤 مشاركة التطبيق</b></button></div></div>';
    };
  }
})();
