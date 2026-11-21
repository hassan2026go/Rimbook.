package com.rimbook.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognitionSupport;
import android.speech.RecognitionSupportCallback;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executor;

@CapacitorPlugin(
    name = "RimbookOfflineSpeech",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class OfflineSpeechPlugin extends Plugin {
    private SpeechRecognizer recognizer;
    private TextToSpeech textToSpeech;

    // SpeechRecognizer must be created and used on the main thread. Capacitor
    // invokes plugin methods on a background thread, so every recognizer call
    // is posted to the main looper first.
    private void runOnMain(Runnable task) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            task.run();
        } else {
            new Handler(Looper.getMainLooper()).post(task);
        }
    }

    private Intent recognitionIntent(String language, boolean preferOffline) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language == null ? "ar-SA" : language);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language == null ? "ar-SA" : language);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, preferOffline);
        return intent;
    }

    private boolean hasArabic(List<String> languages) {
        if (languages == null) return false;
        for (String language : languages) {
            if (language == null) continue;
            String normalized = language.replace('_', '-');
            String base = Locale.forLanguageTag(normalized).getLanguage();
            if ("ar".equalsIgnoreCase(base) || normalized.toLowerCase(Locale.ROOT).startsWith("ar-")) return true;
        }
        return false;
    }

    private JSONArray asJson(List<String> values) {
        return new JSONArray(values == null ? new ArrayList<>() : values);
    }

    @PluginMethod
    public void checkAvailability(PluginCall call) {
        runOnMain(() -> doCheckAvailability(call));
    }

    private void doCheckAvailability(PluginCall call) {
        boolean offlineAvailable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
        boolean systemAvailable = SpeechRecognizer.isRecognitionAvailable(getContext());
        JSObject basic = new JSObject();
        basic.put("available", offlineAvailable || systemAvailable);
        basic.put("offlineAvailable", offlineAvailable);
        basic.put("language", "ar-SA");
        if (!offlineAvailable) {
            basic.put("languageStatus", systemAvailable ? "system" : "unavailable");
            basic.put("message", systemAvailable
                ? "سيستخدم التطبيق خدمة التعرف المتاحة في Android تلقائياً؛ قد تحتاج اتصالاً بالإنترنت."
                : "لا توجد خدمة تعرف على الكلام مثبتة أو مفعّلة على هذا الجهاز.");
            call.resolve(basic);
            return;
        }
        if (Build.VERSION.SDK_INT < 33) {
            basic.put("languageStatus", "unknown");
            basic.put("message", "محرك محلي متاح، لكن النظام لا يتيح فحص حزمة العربية تفصيلياً");
            call.resolve(basic);
            return;
        }
        SpeechRecognizer checker = null;
        try {
            checker = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
            SpeechRecognizer finalChecker = checker;
            checker.checkRecognitionSupport(
                recognitionIntent("ar-SA", true),
                getContext().getMainExecutor(),
                new RecognitionSupportCallback() {
                    @Override
                    public void onSupportResult(RecognitionSupport support) {
                        JSObject result = new JSObject();
                        List<String> installed = support.getInstalledOnDeviceLanguages();
                        List<String> supported = support.getSupportedOnDeviceLanguages();
                        List<String> pending = support.getPendingOnDeviceLanguages();
                        result.put("available", true);
                        result.put("installedLanguages", asJson(installed));
                        result.put("supportedLanguages", asJson(supported));
                        result.put("pendingLanguages", asJson(pending));
                        result.put("arabicInstalled", hasArabic(installed));
                        result.put("arabicDownloadable", hasArabic(supported));
                        result.put("arabicPending", hasArabic(pending));
                        result.put("languageStatus", hasArabic(installed) ? "installed" :
                            hasArabic(pending) ? "pending" :
                            hasArabic(supported) ? "downloadable" : "unsupported");
                        call.resolve(result);
                        finalChecker.destroy();
                    }

                    @Override
                    public void onError(int error) {
                        JSObject result = new JSObject();
                        result.put("available", true);
                        result.put("languageStatus", "unknown");
                        result.put("supportCheckError", error);
                        call.resolve(result);
                        finalChecker.destroy();
                    }
                }
            );
        } catch (Exception error) {
            if (checker != null) checker.destroy();
            basic.put("languageStatus", "unknown");
            basic.put("message", "تعذر فحص حزمة اللغة العربية");
            call.resolve(basic);
        }
    }


    @PluginMethod
    public void downloadArabicModel(PluginCall call) {
        runOnMain(() -> doDownloadArabicModel(call));
    }

    private void doDownloadArabicModel(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            call.unavailable("يتطلب تنزيل حزمة اللغة Android 13 أو أحدث");
            return;
        }
        SpeechRecognizer downloader = null;
        try {
            if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
                call.reject("لا يتوفر محرك التعرف المحلي على هذا الجهاز");
                return;
            }
            downloader = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
            downloader.triggerModelDownload(recognitionIntent("ar-SA", true));
            JSObject result = new JSObject();
            result.put("requested", true);
            result.put("message", "تم إرسال طلب تجهيز حزمة العربية إلى خدمة Android؛ قد يتطلب اكتمالها اتصالاً بالإنترنت");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("تعذر طلب حزمة اللغة العربية: " + error.getMessage(), error);
        } finally {
            if (downloader != null) downloader.destroy();
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        runOnMain(() -> doStart(call));
    }

    private void doStart(PluginCall call) {
        boolean canUseOffline = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
        boolean systemAvailable = SpeechRecognizer.isRecognitionAvailable(getContext());
        boolean preferOffline = call.getBoolean("preferOffline", false);
        boolean offlineAvailable = canUseOffline && (preferOffline || !systemAvailable);
        if (!offlineAvailable && !systemAvailable) {
            call.reject("لا توجد خدمة تعرف على الكلام في Android. تأكد من توفر خدمة تحويل الكلام إلى نص في النظام.");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }
        beginRecognition(call, offlineAvailable);
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        runOnMain(() -> afterMicrophonePermission(call));
    }

    private void afterMicrophonePermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            boolean canUseOffline = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
            boolean systemAvailable = SpeechRecognizer.isRecognitionAvailable(getContext());
            boolean preferOffline = call.getBoolean("preferOffline", false);
            beginRecognition(call, canUseOffline && (preferOffline || !systemAvailable));
        } else {
            call.reject("يجب السماح بإذن الميكروفون لاستخدام التعرف الصوتي");
        }
    }

    private void beginRecognition(PluginCall call, boolean offlineAvailable) {
        try {
            if (recognizer != null) {
                recognizer.cancel();
                recognizer.destroy();
                recognizer = null;
            }
            recognizer = offlineAvailable ? SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext()) : SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(android.os.Bundle params) {
                    JSObject event = new JSObject();
                    event.put("state", "ready");
                    notifyListeners("state", event);
                }
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {
                    JSObject event = new JSObject();
                    event.put("state", "processing");
                    notifyListeners("state", event);
                }
                @Override public void onError(int error) {
                    JSObject event = new JSObject();
                    event.put("code", error);
                    notifyListeners("error", event);
                    releaseRecognizer();
                }
                @Override public void onResults(android.os.Bundle results) {
                    ArrayList<String> matches = results == null ? null :
                        results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    JSObject event = new JSObject();
                    event.put("transcript", matches != null && !matches.isEmpty() ? matches.get(0) : "");
                    event.put("alternatives", matches == null ? new JSONArray() : new JSONArray(matches));
                    event.put("offline", offlineAvailable);
                    notifyListeners("result", event);
                    releaseRecognizer();
                }
                @Override public void onPartialResults(android.os.Bundle partialResults) {}
                @Override public void onEvent(int eventType, android.os.Bundle params) {}
            });
            recognizer.startListening(recognitionIntent(call.getString("language", "ar-SA"), offlineAvailable));
            JSObject result = new JSObject();
            result.put("started", true);
            result.put("offlineOnly", offlineAvailable);
            result.put("mode", offlineAvailable ? "offline" : "system");
            call.resolve(result);
        } catch (Exception error) {
            releaseRecognizer();
            call.reject("تعذر بدء التعرف الصوتي المحلي: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        runOnMain(() -> {
            try { if (recognizer != null) recognizer.stopListening(); } catch (Exception ignored) {}
            call.resolve();
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        runOnMain(() -> {
            try { if (recognizer != null) recognizer.cancel(); } catch (Exception ignored) {}
            releaseRecognizer();
            call.resolve();
        });
    }


    @PluginMethod
    public void speakText(PluginCall call) {
        String text = call.getString("text", "");
        String language = call.getString("language", "ar-SA");
        if (text == null || text.trim().isEmpty()) {
            call.reject("لا يوجد نص للقراءة");
            return;
        }
        if (textToSpeech != null) {
            speakWithEngine(call, text, language);
            return;
        }
        textToSpeech = new TextToSpeech(getContext(), status -> {
            if (status != TextToSpeech.SUCCESS) {
                call.reject("تعذر تشغيل محرك النطق في Android");
                return;
            }
            speakWithEngine(call, text, language);
        });
    }

    private void speakWithEngine(PluginCall call, String text, String language) {
        try {
            Locale requested = Locale.forLanguageTag(language == null ? "ar-SA" : language);
            int languageStatus = textToSpeech.setLanguage(requested);
            if (languageStatus == TextToSpeech.LANG_MISSING_DATA ||
                languageStatus == TextToSpeech.LANG_NOT_SUPPORTED) {
                languageStatus = textToSpeech.setLanguage(new Locale("ar"));
            }
            if (languageStatus == TextToSpeech.LANG_MISSING_DATA ||
                languageStatus == TextToSpeech.LANG_NOT_SUPPORTED) {
                call.reject("محرك النطق لا يحتوي على صوت عربي مثبت على الجهاز");
                return;
            }
            textToSpeech.setSpeechRate(1.0f);
            int result = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, "rimbook-arabic-tts");
            if (result == TextToSpeech.ERROR) {
                call.reject("تعذر بدء القراءة الصوتية");
                return;
            }
            JSObject response = new JSObject();
            response.put("started", true);
            response.put("language", language);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("تعذر تشغيل القراءة الصوتية: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        if (textToSpeech != null) textToSpeech.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        releaseRecognizer();
        if (textToSpeech != null) {
            try { textToSpeech.stop(); textToSpeech.shutdown(); } catch (Exception ignored) {}
            textToSpeech = null;
        }
        super.handleOnDestroy();
    }

    private void releaseRecognizer() {
        if (recognizer != null) {
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
    }
}
