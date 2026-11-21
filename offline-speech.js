(function () {
  "use strict";
  const capacitor = window.Capacitor;
  const native = !!(capacitor && typeof capacitor.isNativePlatform === "function" && capacitor.isNativePlatform());
  let plugin = null;
  try {
    if (native && typeof capacitor.registerPlugin === "function") {
      plugin = capacitor.registerPlugin("RimbookOfflineSpeech");
    }
  } catch (error) {
    console.warn("Rimbook offline speech bridge unavailable", error);
  }

  window.rimbookOfflineSpeechCheck = async function () {
    if (!native || !plugin) return { native: false, available: false, languageStatus: "web" };
    const result = await plugin.checkAvailability();
    return Object.assign({ native: true }, result);
  };

  window.rimbookOfflineSpeechRequestMic = async function () {
    if (!native || !plugin) return { granted: false, native: false };
    const status = await plugin.checkPermissions();
    if (status && status.microphone === "granted") return { granted: true, native: true };
    const requested = await plugin.requestPermissions();
    if (requested && requested.microphone === "granted") return { granted: true, native: true };
    throw new Error("لم يتم منح إذن الميكروفون");
  };

  window.rimbookOfflineSpeechDownloadArabic = async function () {
    if (!native || !plugin || typeof plugin.downloadArabicModel !== "function") {
      throw new Error("تنزيل حزمة العربية غير متاح في هذا الإصدار");
    }
    return plugin.downloadArabicModel();
  };

  window.rimbookOfflineSpeechStart = async function (language, preferOffline) {
    if (!native || !plugin) throw new Error("التعرف المحلي متاح داخل تطبيق Android فقط");
    let removeResult = null;
    let removeError = null;
    let removeState = null;
    let settled = false;
    let timer = null;
    let resolveResult;
    let rejectResult;
    const resultPromise = new Promise((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    const cleanup = async () => {
      clearTimeout(timer);
      try { if (removeResult) await removeResult.remove(); } catch (_) {}
      try { if (removeError) await removeError.remove(); } catch (_) {}
      try { if (removeState) await removeState.remove(); } catch (_) {}
    };
    removeResult = await plugin.addListener("result", event => {
      if (settled) return;
      settled = true;
      cleanup();
      if (event && event.transcript) resolveResult(event);
      else rejectResult(Object.assign(new Error("لم يتم التعرف على عبارة واضحة"), { code: 7 }));
    });
    removeError = await plugin.addListener("error", event => {
      if (settled) return;
      settled = true;
      cleanup();
      const code = Number(event && event.code);
      const messages = {
        1: "انتهت مهلة الشبكة أو خدمة التعرف؛ تأكد من أن حزمة العربية المحلية مثبتة",
        2: "تعذر الوصول إلى خدمة التعرف الصوتي المحلية",
        3: "تعذر التقاط الصوت من الميكروفون",
        4: "خطأ في خادم التعرف الصوتي؛ حاول مجدداً",
        5: "لم يتم التعرف على كلام واضح",
        6: "توقف الكلام",
        7: "لم يتم العثور على كلمات",
        8: "خدمة التعرف مشغولة؛ حاول بعد لحظة",
        9: "إذن الميكروفون غير ممنوح",
        12: "اللغة العربية غير مدعومة في محرك التعرف المحلي",
        13: "حزمة العربية المحلية غير متوفرة بعد"
      };
      rejectResult(Object.assign(new Error(messages[code] || "تعذر التعرف الصوتي المحلي (رمز " + code + ")"), { code }));
    });
    removeState = await plugin.addListener("state", event => {
      if (typeof window.rimbookOfflineSpeechState === "function") window.rimbookOfflineSpeechState(event);
    });
    timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      await cleanup();
      try { await plugin.cancel(); } catch (_) {}
      rejectResult(new Error("انتهت مهلة الاستماع. حاول التحدث بجملة أقصر وبصوت واضح."));
    }, 45 * 1000);
    try {
      await plugin.start({ language: language || "ar-SA", preferOffline: !!preferOffline });
    } catch (error) {
      if (!settled) {
        settled = true;
        await cleanup();
        rejectResult(error);
      }
    }
    return resultPromise;
  };

  window.rimbookNativeSpeak = async function (text, language) {
    if (!native || !plugin || typeof plugin.speakText !== "function") throw new Error("النطق الأصلي غير متاح");
    return plugin.speakText({ text: String(text || ""), language: language || "ar-SA" });
  };
  window.rimbookNativeStopSpeaking = async function () {
    if (native && plugin && typeof plugin.stopSpeaking === "function") return plugin.stopSpeaking();
  };

  window.rimbookOfflineSpeechStop = async function () {
    if (plugin) return plugin.stop();
  };
  window.rimbookOfflineSpeechCancel = async function () {
    if (plugin) return plugin.cancel();
  };
})();