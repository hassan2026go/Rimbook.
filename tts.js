/* Rimbook TTS — native Android voice with browser fallback. */
let rimbookSpeechUtterance = null;
async function speakText(text, lang){
  const value=String(text||"").trim();
  if(!value)return toast("لا يوجد نص للاستماع إليه");
  if(typeof window.rimbookNativeSpeak==="function"){
    try{
      if(typeof window.rimbookNativeStopSpeaking==="function")await window.rimbookNativeStopSpeaking();
      await window.rimbookNativeSpeak(value,lang||"ar-SA");
      toast("🔊 بدأ الاستماع");
      return;
    }catch(error){
      console.warn("Native TTS unavailable; trying browser speech",error);
    }
  }
  if(!("speechSynthesis" in window)||typeof SpeechSynthesisUtterance==="undefined")
    return toast("خدمة النطق غير متاحة على هذا الجهاز");
  try{
    speechSynthesis.cancel();
    rimbookSpeechUtterance = new SpeechSynthesisUtterance(value);
    rimbookSpeechUtterance.lang=lang||"ar-SA";
    rimbookSpeechUtterance.rate=1;
    rimbookSpeechUtterance.pitch=1;
    rimbookSpeechUtterance.onstart=()=>toast("🔊 يقرأ النص الآن");
    rimbookSpeechUtterance.onerror=event=>toast("تعذر تشغيل الصوت: "+(event.error||"خطأ في النطق"));
    speechSynthesis.speak(rimbookSpeechUtterance);
  }catch(error){toast("تعذر تشغيل القراءة الصوتية");}
}
async function stopSpeak(){
  try{if(typeof window.rimbookNativeStopSpeaking==="function")await window.rimbookNativeStopSpeaking();}catch(_){}
  if("speechSynthesis" in window)speechSynthesis.cancel();
  rimbookSpeechUtterance=null;
}
async function transcribeAudio(audioBlob, language){
  const cfg=RB.data.settings;
  if(!cfg.openaiKey){toast("تحويل الملف الصوتي إلى نص يحتاج خدمة خارجية ومفتاحاً اختيارياً؛ استخدم الميكروفون المباشر للتعرف دون إعداد مفتاح.");return null;}
  const fd=new FormData();fd.append("file",audioBlob,"audio.webm");fd.append("model","whisper-1");if(language)fd.append("language",language);
  try{const r=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:"Bearer "+cfg.openaiKey},body:fd});if(!r.ok)throw new Error("فشل");const data=await r.json();return data.text;}
  catch(e){toast("فشل تحويل الملف الصوتي");return null;}
}
function noteSpeakBtn(note){
  return `<button type="button" onclick='speakText(${JSON.stringify(note.body||"").replace(/</g,"\\u003c")})' title="استمع إلى الملاحظة">🔊 استماع</button>`;
}
