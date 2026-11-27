(function () {
  "use strict";
  // Capacitor 7 exposes legacy native plugins through Capacitor.Plugins.
  // Resolve lazily because the Android bridge can appear after page scripts load.
  let plugin = null;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function getNativePlugin() {
    for (let attempt = 0; attempt < 50; attempt++) {
      const capacitor = window.Capacitor;
      const native = !!(capacitor && typeof capacitor.isNativePlatform === "function" && capacitor.isNativePlatform());
      if (native) {
        try {
          const legacy = capacitor.Plugins && capacitor.Plugins.RimbookOfflineSpeech;
          if (legacy && typeof legacy.start === "function" && typeof legacy.checkAvailability === "function") {
            plugin = legacy;
            return plugin;
          }
          // Some Capacitor builds expose registerPlugin globally; use it only as fallback.
          if (!plugin && typeof capacitor.registerPlugin === "function") {
            const candidate = capacitor.registerPlugin("RimbookOfflineSpeech");
            if (candidate && typeof candidate.start === "function" && typeof candidate.checkAvailability === "function") {
              plugin = candidate;
              return plugin;
            }
          }
        } catch (error) {
          console.warn("Rimbook native plugin lookup failed", error);
        }
      }
      await wait(100);
    }
    const capacitor = window.Capacitor;
    const available = !!(capacitor && typeof capacitor.isPluginAvailable === "function" && capacitor.isPluginAvailable("RimbookOfflineSpeech"));
    console.error("Rimbook native speech plugin unavailable", {
      platform: capacitor && typeof capacitor.getPlatform === "function" ? capacitor.getPlatform() : "missing",
      native: !!(capacitor && typeof capacitor.isNativePlatform === "function" && capacitor.isNativePlatform()),
      pluginAvailable: available,
      legacyPlugin: !!(capacitor && capacitor.Plugins && capacitor.Plugins.RimbookOfflineSpeech)
    });
    return null;
  }

  window.rimbookOfflineSpeechCheck = async function () {
    const nativePlugin = await getNativePlugin();
    if (!nativePlugin) return { native: false, available: false, languageStatus: "web" };
    const result = await nativePlugin.checkAvailability();
    return Object.assign({ native: true }, result);
  };

  window.rimbookOfflineSpeechRequestMic = async function () {
    const nativePlugin = await getNativePlugin();
    if (!nativePlugin) return { granted: false, native: false };
    const status = await nativePlugin.checkPermissions();
    if (status && status.microphone === "granted") return { granted: true, native: true };
    const requested = await nativePlugin.requestPermissions();
    if (requested && requested.microphone === "granted") return { granted: true, native: true };
    throw new Error("لم يتم منح إذن الميكروفون");
  };

  window.rimbookOfflineSpeechDownloadArabic = async function () {
    const nativePlugin = await getNativePlugin();
    if (!nativePlugin || typeof nativePlugin.downloadArabicModel !== "function") {
      throw new Error("تنزيل حزمة العربية غير متاح في هذا الإصدار");
    }
    const progress = await nativePlugin.addListener("downloadProgress", event => {
      if (typeof window.rimbookOfflineSpeechDownloadProgress === "function") window.rimbookOfflineSpeechDownloadProgress(event);
    });
    try { return await nativePlugin.downloadArabicModel(); }
    finally { try { await progress.remove(); } catch (_) {} }
  };

  async function startOnce(language, mode) {
    const nativePlugin = await getNativePlugin();
    if (!nativePlugin) throw new Error("تعذر الاتصال بجسر Android الصوتي. أغلق التطبيق وافتحه مجدداً، ثم تحقق من تثبيت نسخة Android الصحيحة.");
    let removeResult = null;
    let removeError = null;
    let removeState = null;
    let removePartial = null;
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
      try { if (removePartial) await removePartial.remove(); } catch (_) {}
    };
    removeResult = await nativePlugin.addListener("result", event => {
      if (settled) return;
      settled = true;
      cleanup();
      if (event && event.transcript) resolveResult(event);
      else rejectResult(new Error("لم يتم التعرف على عبارة واضحة"));
    });
    removeError = await nativePlugin.addListener("error", event => {
      if (settled) return;
      settled = true;
      cleanup();
      const code = Number(event && event.code);
      const messages = {
        8: "محرك التعرف مشغول؛ انتظر لحظات ثم حاول مجدداً",
        10: "طلبات كثيرة إلى خدمة التعرف؛ انتظر قليلاً",
        11: "انقطعت خدمة التعرف عن التطبيق؛ حاول مجدداً",
        12: "اللغة العربية غير مدعومة في خدمة التعرف على هذا الجهاز",
        13: "اللغة العربية غير متاحة حالياً في خدمة التعرف",
        1: "انتهت مهلة الاتصال بالإنترنت أثناء تحويل الكلام إلى نص",
        2: "تعذر الاتصال بخدمة التعرف عبر الإنترنت؛ تحقق من الشبكة",
        4: "خدمة التعرف عبر الإنترنت غير متاحة حالياً؛ تحقق من اتصال الإنترنت",
        3: "تعذر التقاط الصوت من الميكروفون",
        5: "لم يتم التعرف على كلام واضح",
        6: "توقف الكلام",
        7: "لم يتم العثور على كلمات",
        9: "إذن الميكروفون غير ممنوح"
      };
      const failure = new Error(messages[code] || "تعذر التعرف الصوتي (رمز " + code + ")");
      failure.code = code; failure.mode = mode;
      rejectResult(failure);
    });
    removeState = await nativePlugin.addListener("state", event => {
      if (typeof window.rimbookOfflineSpeechState === "function") window.rimbookOfflineSpeechState(event);
    });
    removePartial = await nativePlugin.addListener("partial", event => {
      if (typeof window.rimbookOfflineSpeechPartial === "function") window.rimbookOfflineSpeechPartial(event);
    });
    timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      await cleanup();
      try { await nativePlugin.cancel(); } catch (_) {}
      rejectResult(new Error("انتهت مهلة الاستماع. حاول التحدث بجملة أقصر وبصوت واضح."));
    }, 180 * 1000);
    try {
      await nativePlugin.start({ language: language || "ar", mode, preferOffline: mode === "local" });
    } catch (error) {
      if (!settled) {
        settled = true;
        await cleanup();
        if (error && typeof error === "object") { error.mode = mode; error.startFailure = true; }
        rejectResult(error);
      }
    }
    return resultPromise;
  }

  // Errors where the online recognizer could not work (network, server, service missing) so the local model may take over.
  const ONLINE_RECOVERABLE = new Set([1, 2, 4, 10, 11, 12, 13]);
  const canFallBack = error => !!error && error.mode === "online" && (ONLINE_RECOVERABLE.has(Number(error.code)) || error.startFailure === true);

  /* preference: "auto" (default; also accepts the old boolean) | "online" | "local".
     auto = online recognizer when a connection exists (more accurate for Arabic), the installed local model when offline,
     and the local model as a fallback if the online service fails. */
  window.rimbookOfflineSpeechStart = async function (language, preference) {
    const pref = preference === "online" || preference === "local" ? preference : "auto";
    if (pref !== "auto") return startOnce(language, pref);
    let installed = false;
    try { const info = await window.rimbookOfflineSpeechCheck(); installed = !!(info && info.languageStatus === "installed"); } catch (_) {}
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    if (online) {
      try { return await startOnce(language, "online"); }
      catch (error) {
        if (installed && canFallBack(error)) return startOnce(language, "local");
        throw error;
      }
    }
    if (installed) return startOnce(language, "local");
    throw new Error("لا يوجد اتصال بالإنترنت ومحرك العربية المحلي غير مثبت. اتصل بالإنترنت، أو نزّل «حزمة العربية» من صفحة الصوت لتعمل دون إنترنت.");
  };

  window.rimbookShareApp = async function () {
    const title = "Rimbook — مفكرة إدارة الأعمال";
    const text = "جرّب تطبيق Rimbook لإدارة الأعمال والمشاريع والعمال والحسابات.";
    const url = "https://github.com/hassan2026go/rimbook/releases/latest";
    const nativePlugin = await getNativePlugin();
    if (nativePlugin && typeof nativePlugin.shareApp === "function") {
      await nativePlugin.shareApp({ title, text, url });
      return true;
    }
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, text, url });
      return true;
    }
    throw new Error("المشاركة المباشرة غير متاحة في هذا الإصدار؛ لم يتم نسخ أي رابط.");
  };

  window.rimbookNativeAudioStart = async function () {
    const p=await getNativePlugin();if(!p||typeof p.startSavedAudio!=="function")throw new Error("التسجيل الأصلي غير متاح في هذا الإصدار");
    return p.startSavedAudio();
  };
  window.rimbookNativeAudioStop = async function () {
    const p=await getNativePlugin();if(!p||typeof p.stopSavedAudio!=="function")throw new Error("إيقاف التسجيل الأصلي غير متاح");
    return p.stopSavedAudio();
  };

  window.rimbookNativeSpeak = async function (text, language) {
    const nativePlugin = await getNativePlugin();
    if (!nativePlugin || typeof nativePlugin.speakText !== "function") throw new Error("النطق الأصلي غير متاح");
    return nativePlugin.speakText({ text: String(text || ""), language: language || "ar-SA" });
  };
  window.rimbookNativeStopSpeaking = async function () {
    const nativePlugin = await getNativePlugin();
    if (nativePlugin && typeof nativePlugin.stopSpeaking === "function") return nativePlugin.stopSpeaking();
  };

  window.rimbookOfflineSpeechStop = async function () {
    const nativePlugin = await getNativePlugin();
    if (nativePlugin) return nativePlugin.stop();
  };
  window.rimbookOfflineSpeechCancel = async function () {
    const nativePlugin = await getNativePlugin();
    if (nativePlugin) return nativePlugin.cancel();
  };
})();