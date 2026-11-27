/* Rimbook dictation — type with your voice into ANY text field (notes, titles, details, search…).
   A small floating 🎤 bar appears when a text field is focused. Works without internet when the Arabic engine is installed
   (Android app); with internet it uses the phone's recognizer. Text is only inserted into the field — never turned into
   accounts, wages or any record by itself. */
(function () {
  "use strict";
  const state = { target: null, listening: false, bar: null, usingWeb: null, prevPartial: undefined };
  const native = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());
  const online = () => typeof navigator === "undefined" || navigator.onLine !== false;

  function isDictatable(el) {
    if (!el || !el.tagName) return false;
    const tag = String(el.tagName).toLowerCase();
    if (el.readOnly || el.disabled || (el.dataset && el.dataset.noDictation)) return false;
    if (tag === "textarea") return true;
    if (tag !== "input") return false;
    const type = String((el.getAttribute && el.getAttribute("type")) || el.type || "text").toLowerCase();
    if (!["text", "search"].includes(type)) return false;
    const mode = String((el.getAttribute && el.getAttribute("inputmode")) || "").toLowerCase();
    return !["decimal", "numeric", "tel", "email", "url"].includes(mode);
  }

  /* Inserts at the caret (or replaces the selection), respects maxlength, and notifies listeners like real typing. */
  function insertText(el, text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean || !el) return { ok: false, reason: "empty" };
    const value = String(el.value || "");
    const start = typeof el.selectionStart === "number" ? el.selectionStart : value.length;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
    const before = value.slice(0, start), after = value.slice(end);
    const sep = before && !/\s$/.test(before) ? " " : "";
    let piece = sep + clean, truncated = false;
    const max = Number(el.maxLength);
    if (max > 0 && before.length + piece.length + after.length > max) {
      piece = piece.slice(0, Math.max(0, max - before.length - after.length)); truncated = true;
    }
    if (!piece.trim()) return { ok: false, reason: "full" };
    el.value = before + piece + after;
    const caret = (before + piece).length;
    try { el.selectionStart = el.selectionEnd = caret; } catch (_) {}
    ["input", "change"].forEach(type => { try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (_) {} });
    return { ok: true, truncated };
  }

  function setStatus(message) { if (state.bar) { const s = state.bar.querySelector ? state.bar.querySelector("[data-status]") : null; if (s) s.textContent = message; else state.bar.dataset.status = message; } }

  function ensureBar() {
    if (state.bar) return state.bar;
    const bar = document.createElement("div");
    bar.id = "rimbook-dictation-bar";
    bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "الكتابة بالصوت");
    bar.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:12px;z-index:10080;display:none;align-items:center;gap:8px;max-width:94vw;padding:8px 12px;border-radius:999px;background:var(--card,#fff);color:var(--tx,#111);box-shadow:0 4px 18px #0006;border:1px solid var(--bd,#ccc)";
    bar.innerHTML = '<button type="button" id="rimbook-dictation-btn" aria-label="ابدأ الكتابة بالصوت" style="font-size:20px;min-width:44px;min-height:44px;border-radius:50%">🎤</button><span data-status style="font-size:13px;max-width:60vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">اضغط للإملاء</span>';
    bar.addEventListener("mousedown", e => e.preventDefault());           // keep the text field focused
    bar.addEventListener("touchstart", e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    const btn = bar.querySelector("#rimbook-dictation-btn");
    btn.addEventListener("click", () => { state.listening ? stop() : start(); });
    document.body.append(bar);
    state.bar = bar;
    if (window.visualViewport) {
      const place = () => { const vv = window.visualViewport; bar.style.bottom = Math.max(12, window.innerHeight - vv.height - vv.offsetTop + 12) + "px"; };
      window.visualViewport.addEventListener("resize", place); window.visualViewport.addEventListener("scroll", place);
    }
    return bar;
  }
  const show = () => { ensureBar().style.display = "flex"; setStatus(state.listening ? "أتحدث… اضغط للإيقاف" : "اضغط 🎤 وتحدث"); };
  const hide = () => { if (state.bar && !state.listening) state.bar.style.display = "none"; };
  const setButton = on => { const b = state.bar && state.bar.querySelector ? state.bar.querySelector("#rimbook-dictation-btn") : null; if (b) b.textContent = on ? "⏹️" : "🎤"; };

  function finish(text) {
    state.listening = false; setButton(false);
    const el = state.target;
    if (!text || !String(text).trim()) { setStatus("لم يُسمع كلام واضح، حاول مجدداً"); return { ok: false, reason: "empty" }; }
    const r = insertText(el, text);
    setStatus(r.ok ? (r.truncated ? "أُضيف جزء من النص (بلغ الحد الأقصى)" : "تمت الإضافة ✅") : "الحقل ممتلئ");
    return r;
  }
  function fail(error) {
    state.listening = false; setButton(false);
    const message = String((error && error.message) || error || "تعذر الإملاء");
    setStatus(message.slice(0, 80)); if (typeof toast === "function") toast(message);
    return { ok: false, reason: "error", message };
  }

  /* One recognition pass -> the transcript text. Native app: the speech bridge decides (phone recognizer with internet, installed
     Arabic model without). Browser: Web Speech, which needs internet. Used by the dictation bar and by the diary. */
  async function capture(onPartial) {
    if (native() && typeof window.rimbookOfflineSpeechStart === "function") {
      const prev = window.rimbookOfflineSpeechPartial;
      window.rimbookOfflineSpeechPartial = e => { if (e && e.transcript && onPartial) onPartial(String(e.transcript)); };
      try {
        const result = await window.rimbookOfflineSpeechStart("ar", "auto");
        return String((result && result.transcript) || "");
      } finally { window.rimbookOfflineSpeechPartial = prev; }
    }
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) throw new Error("الإملاء الصوتي غير متاح في هذا المتصفح. استخدم تطبيق أندرويد.");
    if (!online()) throw new Error("المتصفح يحتاج إنترنت للإملاء. تطبيق أندرويد يعمل دون إنترنت بعد تنزيل حزمة العربية.");
    return await new Promise((resolve, reject) => {
      const rec = new Rec(); state.usingWeb = rec;
      rec.lang = "ar"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      let finalText = "";
      rec.onresult = ev => { let interim = ""; for (let i = ev.resultIndex; i < ev.results.length; i++) { const x = ev.results[i][0].transcript; if (ev.results[i].isFinal) finalText += x; else interim += x; } if (onPartial) onPartial(finalText + interim); };
      rec.onerror = ev => { state.usingWeb = null; reject(new Error(ev && ev.error === "not-allowed" ? "اسمح بإذن الميكروفون" : "تعذر الإملاء (" + ((ev && ev.error) || "خطأ") + ")")); };
      rec.onend = () => { if (state.usingWeb === rec) { state.usingWeb = null; resolve(finalText); } };
      try { rec.start(); } catch (e) { state.usingWeb = null; reject(e); }
    });
  }

  async function start() {
    const el = state.target;
    if (!el) return { ok: false, reason: "no-field" };
    if (state.listening) return { ok: false, reason: "busy" };
    state.listening = true; setButton(true); setStatus("أتحدث… اضغط للإيقاف");
    try { return finish(await capture(t => setStatus(String(t).slice(-60)))); }
    catch (error) { return fail(error); }
  }
  async function stop() {
    try {
      if (state.usingWeb) { state.usingWeb.stop(); return; }
      if (native() && typeof window.rimbookOfflineSpeechStop === "function") await window.rimbookOfflineSpeechStop();
    } catch (_) {}
  }

  document.addEventListener("focusin", e => { if (isDictatable(e.target)) { state.target = e.target; show(); } });
  document.addEventListener("focusout", () => { setTimeout(() => { const a = document.activeElement; if (!isDictatable(a) && !state.listening) hide(); }, 250); });

  window.RimbookDictation = { isDictatable, insertText, start, stop, capture, state, _setTarget: el => { state.target = el; } };
})();
