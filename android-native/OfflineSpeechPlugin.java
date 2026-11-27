package com.rimbook.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.speech.tts.TextToSpeech;
import android.speech.SpeechRecognizer;
import android.speech.RecognizerIntent;
import android.speech.RecognitionListener;
import android.os.Bundle;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.k2fsa.sherpa.onnx.FeatureConfig;
import com.k2fsa.sherpa.onnx.OfflineModelConfig;
import com.k2fsa.sherpa.onnx.OfflineRecognizer;
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OfflineStream;
import com.k2fsa.sherpa.onnx.OfflineWhisperModelConfig;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name="RimbookOfflineSpeech", permissions={
    @Permission(alias="microphone", strings={Manifest.permission.RECORD_AUDIO})
})
public class OfflineSpeechPlugin extends Plugin {
    private static final int RATE=16000, CHUNK=1600;
    private static final String DIR="rimbook-whisper-tiny-ar";
    private static final String BASE="https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/65176e2deb88badc814a94058666cadccc29b61c/";
    private static final String[][] FILES={
        {"tiny-encoder.int8.onnx","d24fb083ae3b1041fc24e97971d60e280c9342201fbb67b0ab428a8b4a51a434","12937772"},
        {"tiny-decoder.int8.onnx","d2fece8dd42771f1df975c6c0445770d0c292bf7547c2cae04a6c0cc57540925","89855401"},
        {"tiny-tokens.txt","b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126","816730"}
    };
    private final ExecutorService downloads=Executors.newSingleThreadExecutor();
    // Validate the complete model once per app process, not merely its file lengths.
    // A successful download already verifies every SHA-256 and marks the model trusted.
    private volatile Boolean modelIntegrity = null;
    private volatile AudioRecord recorder;
    private volatile boolean recording=false, cancel=false;
    private volatile OfflineRecognizer recognizer;
    private volatile SpeechRecognizer onlineRecognizer;
    private volatile MediaRecorder savedRecorder;
    private volatile File savedAudioFile;
    private TextToSpeech tts;

    private File dir(){return new File(getContext().getFilesDir(),DIR);}
    private File file(int i){return new File(dir(),FILES[i][0]);}
    private synchronized boolean installed(){
        if(modelIntegrity!=null)return modelIntegrity;
        try{
            for(int i=0;i<FILES.length;i++){
                File modelFile=file(i);
                if(!modelFile.isFile()||modelFile.length()!=Long.parseLong(FILES[i][2])||!hash(modelFile).equals(FILES[i][1])){
                    modelIntegrity=false;
                    return false;
                }
            }
            modelIntegrity=true;
            return true;
        }catch(Exception e){
            modelIntegrity=false;
            return false;
        }
    }
    private String hash(File f)throws Exception{
        MessageDigest d=MessageDigest.getInstance("SHA-256");
        try(InputStream in=new FileInputStream(f)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)d.update(b,0,n);}
        StringBuilder s=new StringBuilder();for(byte b:d.digest())s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString();
    }
    @PluginMethod public void checkAvailability(PluginCall c){
        boolean ok=installed();JSObject r=new JSObject();r.put("native",true);r.put("available",ok);r.put("offlineAvailable",ok);
        r.put("language","ar");r.put("languageStatus",ok?"installed":"downloadable");r.put("engine","Sherpa-ONNX / Whisper Tiny");
        r.put("modelBytes",103609903L);r.put("message",ok?"محرك العربية المحلي جاهز دون إنترنت.":"يلزم تنزيل محرك العربية مرة واحدة (نحو 99 ميغابايت).");c.resolve(r);
    }
    @PluginMethod public void downloadArabicModel(PluginCall c){
        downloads.execute(()->{try{
            if(!dir().exists()&&!dir().mkdirs())throw new IOException("تعذر إنشاء مجلد النموذج");
            for(int i=0;i<FILES.length;i++){
                File target=file(i);
                if(target.isFile()&&target.length()==Long.parseLong(FILES[i][2])&&hash(target).equals(FILES[i][1]))continue;
                File part=new File(dir(),FILES[i][0]+".part");part.delete();
                HttpURLConnection h=(HttpURLConnection)new URL(BASE+FILES[i][0]).openConnection();
                h.setConnectTimeout(20000);h.setReadTimeout(60000);h.setInstanceFollowRedirects(true);h.setRequestProperty("User-Agent","Rimbook Android");
                if(h.getResponseCode()!=200)throw new IOException("HTTP "+h.getResponseCode());
                MessageDigest digest=MessageDigest.getInstance("SHA-256");long count=0;
                try(InputStream in=new BufferedInputStream(h.getInputStream());FileOutputStream out=new FileOutputStream(part)){
                    byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){out.write(b,0,n);digest.update(b,0,n);count+=n;
                        JSObject p=new JSObject();p.put("file",FILES[i][0]);p.put("downloaded",count);p.put("total",h.getContentLength());p.put("percent",h.getContentLengthLong()>0?count*100/h.getContentLengthLong():0);notifyListeners("downloadProgress",p);}
                    out.getFD().sync();
                }finally{h.disconnect();}
                StringBuilder actual=new StringBuilder();for(byte b:digest.digest())actual.append(String.format(Locale.ROOT,"%02x",b&255));
                if(count!=Long.parseLong(FILES[i][2])||!actual.toString().equals(FILES[i][1])){part.delete();throw new IOException("فشل التحقق من سلامة "+FILES[i][0]);}
                if(!part.renameTo(target))throw new IOException("تعذر تثبيت "+FILES[i][0]);
            }
            // Every downloaded file has passed its expected size and SHA-256 check.
            modelIntegrity=true;
            if(!installed())throw new IOException("ملفات النموذج غير مكتملة أو فشل التحقق من سلامتها");
            releaseRecognizer();JSObject result=new JSObject();result.put("installed",true);result.put("offline",true);result.put("engine","Whisper Tiny Arabic");c.resolve(result);
        }catch(Exception e){c.reject("تعذر تنزيل محرك العربية: "+e.getMessage(),e);}});
    }
    private synchronized OfflineRecognizer engine(){
        if(recognizer!=null)return recognizer;if(!installed())throw new IllegalStateException("نزّل محرك العربية أولاً");
        String p=dir().getAbsolutePath()+File.separator;
        OfflineWhisperModelConfig w=new OfflineWhisperModelConfig();
        w.setEncoder(p+FILES[0][0]);w.setDecoder(p+FILES[1][0]);w.setLanguage("ar");w.setTask("transcribe");w.setTailPaddings(1000);
        OfflineModelConfig m=new OfflineModelConfig();
        m.setWhisper(w);m.setTokens(p+FILES[2][0]);m.setNumThreads(Math.max(2,Math.min(4,Runtime.getRuntime().availableProcessors())));m.setDebug(false);m.setProvider("cpu");
        FeatureConfig feature=new FeatureConfig();feature.setSampleRate(RATE);feature.setFeatureDim(80);
        OfflineRecognizerConfig config=new OfflineRecognizerConfig();config.setFeatConfig(feature);config.setModelConfig(m);
        recognizer=new OfflineRecognizer(null,config);
        return recognizer;
    }
    @PluginMethod public void start(PluginCall c){
        if(recording){c.reject("التسجيل يعمل بالفعل");return;}
        if(getPermissionState("microphone")!=PermissionState.GRANTED){requestPermissionForAlias("microphone",c,"microphonePermissionCallback");return;}
        route(c);
    }
    @PermissionCallback private void microphonePermissionCallback(PluginCall c){
        if(getPermissionState("microphone")!=PermissionState.GRANTED){c.reject("يجب السماح بإذن الميكروفون");return;}
        route(c);
    }
    // mode: "online" = Android network recognizer, "local" = bundled Whisper model, "auto" = local only if installed.
    private void route(PluginCall c){
        String mode=c.getString("mode","auto");
        if("local".equals(mode)){
            if(!installed()){c.reject("محرك العربية المحلي غير مثبت. نزّل حزمة العربية أولاً.");return;}
            begin(c);return;
        }
        if("online".equals(mode)){beginOnline(c);return;}
        if(installed())begin(c);else beginOnline(c);
    }
    private void beginOnline(PluginCall c){
        // Capacitor runs plugin methods on a worker thread, but SpeechRecognizer throws unless used on the main thread.
        getActivity().runOnUiThread(()->beginOnlineOnMain(c));
    }
    private void beginOnlineOnMain(PluginCall c){
        try{
            if(!SpeechRecognizer.isRecognitionAvailable(getContext())){c.reject("خدمة التعرف الصوتي عبر الإنترنت غير متاحة على هذا الجهاز. تحقق من تثبيت أو تحديث خدمة التعرف على الكلام.");return;}
            releaseOnlineRecognizer();
            onlineRecognizer=SpeechRecognizer.createSpeechRecognizer(getContext());
            onlineRecognizer.setRecognitionListener(new RecognitionListener(){
                @Override public void onReadyForSpeech(Bundle params){JSObject e=new JSObject();e.put("state","listening");e.put("online",true);notifyListeners("state",e);}
                @Override public void onBeginningOfSpeech(){}
                @Override public void onRmsChanged(float rmsdB){}
                @Override public void onBufferReceived(byte[] buffer){}
                @Override public void onEndOfSpeech(){}
                @Override public void onError(int error){recording=false;JSObject e=new JSObject();e.put("code",error);e.put("online",true);e.put("message","تعذر التعرف الصوتي عبر الإنترنت (رمز "+error+")");notifyListeners("error",e);JSObject s=new JSObject();s.put("state","stopped");notifyListeners("state",s);releaseOnlineRecognizer();}
                @Override public void onResults(Bundle results){emitOnlineResult(results,false);}
                @Override public void onPartialResults(Bundle results){emitOnlineResult(results,true);}
                @Override public void onEvent(int eventType,Bundle params){}
            });
            Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"ar-SA");
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE,"ar");
            intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,false);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,3);
            intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE,getContext().getPackageName());
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS,2500);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS,2000);
            recording=true;onlineRecognizer.startListening(intent);
            JSObject state=new JSObject();state.put("state","listening");state.put("online",true);notifyListeners("state",state);
            JSObject started=new JSObject();started.put("started",true);started.put("online",true);started.put("mode","android-network-speech");c.resolve(started);
        }catch(Exception e){recording=false;releaseOnlineRecognizer();c.reject("تعذر بدء التعرف الصوتي عبر الإنترنت: "+e.getMessage(),e);}
    }
    private void emitOnlineResult(Bundle bundle,boolean partial){
        if(bundle==null)return;ArrayList<String> matches=bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if(matches==null||matches.isEmpty())return;String transcript=matches.get(0)==null?"":matches.get(0).trim();if(transcript.isEmpty())return;
        JSObject event=new JSObject();event.put("transcript",transcript);event.put("online",true);
        if(partial)notifyListeners("partial",event);else{recording=false;notifyListeners("result",event);JSObject s=new JSObject();s.put("state","stopped");notifyListeners("state",s);releaseOnlineRecognizer();}
    }
    private void releaseOnlineRecognizer(){final SpeechRecognizer sr=onlineRecognizer;onlineRecognizer=null;if(sr!=null)getActivity().runOnUiThread(()->{try{sr.destroy();}catch(Exception ignored){}});}
    private void begin(PluginCall c){
        try{
            engine();int min=AudioRecord.getMinBufferSize(RATE,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
            if(min<=0)throw new IllegalStateException("إعداد معدل الصوت 16 كيلوهرتز غير مدعوم على هذا الجهاز");
            AudioRecord a=new AudioRecord(MediaRecorder.AudioSource.MIC,RATE,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(min*2,CHUNK*4));
            if(a.getState()!=AudioRecord.STATE_INITIALIZED){a.release();throw new IllegalStateException("تعذر تهيئة الميكروفون");}
            recorder=a;cancel=false;recording=true;a.startRecording();JSObject st=new JSObject();st.put("state","listening");st.put("offline",true);notifyListeners("state",st);
            JSObject r=new JSObject();r.put("started",true);r.put("offlineOnly",true);r.put("mode","sherpa-onnx");c.resolve(r);
            new Thread(()->capture(a),"RimbookLocalASR").start();
        }catch(Exception e){recording=false;releaseAudio();c.reject("تعذر بدء التسجيل المحلي: "+e.getMessage(),e);}
    }
    private void capture(AudioRecord a){
        ArrayList<Short> segment=new ArrayList<>(RATE*10);StringBuilder all=new StringBuilder();short[] buf=new short[CHUNK];ArrayList<Short> pre=new ArrayList<>();
        long started=System.currentTimeMillis(),speechAt=0,silenceAt=0,segmentEndedAt=0;boolean heard=false;
        try{
            while(recording&&!cancel&&System.currentTimeMillis()-started<180000){
                int n=a.read(buf,0,buf.length);if(n<=0)continue;double energy=0;
                for(int i=0;i<n;i++){double x=buf[i]/32768.0;energy+=x*x;}double rms=Math.sqrt(energy/n);long now=System.currentTimeMillis();boolean voice=rms>=0.012;
                if(voice){if(!heard){heard=true;speechAt=now;segment.addAll(pre);pre.clear();}silenceAt=0;segmentEndedAt=0;}else if(heard&&silenceAt==0)silenceAt=now;
                if(heard)for(int i=0;i<n;i++)segment.add(buf[i]);
                else{for(int i=0;i<n;i++)pre.add(buf[i]);if(pre.size()>6400)pre.subList(0,pre.size()-6400).clear();}
                if(heard&&((silenceAt>0&&now-silenceAt>=1400)||now-speechAt>=20000)){
                    boolean endedBySilence=silenceAt>0&&now-silenceAt>=1400;
                    appendSegment(segment,all);segment.clear();heard=false;speechAt=0;silenceAt=0;
                    if(endedBySilence)segmentEndedAt=now;
                }
                if(!heard&&all.length()>0&&segmentEndedAt>0&&now-segmentEndedAt>=3500)break;
            }
            if(!cancel&&!segment.isEmpty())appendSegment(segment,all);
            if(!cancel){
                if(all.length()==0)emitError(7,"لم ألتقط كلاماً واضحاً. تحدث بالقرب من الميكروفون.");
                else{JSObject r=new JSObject();r.put("transcript",all.toString().trim());r.put("offline",true);r.put("engine","sherpa-onnx-whisper");notifyListeners("result",r);}
            }
        }catch(Exception e){if(!cancel)emitError(3,"فشل التعرف المحلي: "+e.getMessage());}
        finally{recording=false;releaseAudio();JSObject st=new JSObject();st.put("state","stopped");notifyListeners("state",st);}
    }
    private void appendSegment(ArrayList<Short> src,StringBuilder all){
        if(src.size()<RATE/3)return;float[] samples=new float[src.size()];for(int i=0;i<src.size();i++)samples[i]=src.get(i)/32768f;
        OfflineRecognizer r=engine();OfflineStream s=r.createStream();try{s.acceptWaveform(samples,RATE);r.decode(s);String text=r.getResult(s).getText().trim();if(!text.isEmpty()){if(all.length()>0)all.append(' ');all.append(text);JSObject p=new JSObject();p.put("transcript",all.toString());p.put("segment",text);p.put("offline",true);notifyListeners("partial",p);}}finally{s.release();}
    }
    private void emitError(int code,String message){JSObject e=new JSObject();e.put("code",code);e.put("message",message);notifyListeners("error",e);}
    @PluginMethod public void stop(PluginCall c){if(onlineRecognizer!=null){final SpeechRecognizer sr0=onlineRecognizer;getActivity().runOnUiThread(()->{try{sr0.stopListening();}catch(Exception ignored){}});c.resolve();return;}recording=false;AudioRecord a=recorder;if(a!=null)try{a.stop();}catch(Exception ignored){}c.resolve();}
    @PluginMethod public void cancel(PluginCall c){cancel=true;recording=false;if(onlineRecognizer!=null){releaseOnlineRecognizer();c.resolve();return;}AudioRecord a=recorder;if(a!=null)try{a.stop();}catch(Exception ignored){}c.resolve();}
    private synchronized void releaseRecognizer(){if(recognizer!=null){try{recognizer.release();}catch(Exception ignored){}recognizer=null;}}
    private void releaseAudio(){AudioRecord a=recorder;recorder=null;if(a!=null){try{if(a.getRecordingState()==AudioRecord.RECORDSTATE_RECORDING)a.stop();}catch(Exception ignored){}try{a.release();}catch(Exception ignored){}}}
    @PluginMethod public void startSavedAudio(PluginCall call){
        if(savedRecorder!=null){call.reject("التسجيل الصوتي يعمل بالفعل");return;}
        if(getPermissionState("microphone")!=PermissionState.GRANTED){requestPermissionForAlias("microphone",call,"savedAudioPermissionCallback");return;}
        beginSavedAudio(call);
    }
    @PermissionCallback private void savedAudioPermissionCallback(PluginCall call){
        if(getPermissionState("microphone")!=PermissionState.GRANTED){call.reject("يجب السماح بإذن الميكروفون");return;}
        beginSavedAudio(call);
    }
    private void beginSavedAudio(PluginCall call){
        MediaRecorder mr=null;
        try{
            File file=File.createTempFile("rimbook-audio-",".m4a",getContext().getCacheDir());
            mr=android.os.Build.VERSION.SDK_INT>=31?new MediaRecorder(getContext()):new MediaRecorder();
            mr.setAudioSource(MediaRecorder.AudioSource.MIC);
            mr.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            mr.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            mr.setAudioSamplingRate(44100);mr.setAudioEncodingBitRate(96000);
            mr.setOutputFile(file.getAbsolutePath());mr.prepare();mr.start();
            savedAudioFile=file;savedRecorder=mr;
            JSObject out=new JSObject();out.put("started",true);out.put("format","audio/mp4");call.resolve(out);
        }catch(Exception e){if(mr!=null)try{mr.release();}catch(Exception ignored){}call.reject("تعذر بدء التسجيل الصوتي: "+e.getMessage(),e);}
    }
    @PluginMethod public void stopSavedAudio(PluginCall call){
        MediaRecorder mr=savedRecorder;File file=savedAudioFile;savedRecorder=null;savedAudioFile=null;
        if(mr==null||file==null){call.reject("لا يوجد تسجيل صوتي جارٍ");return;}
        try{
            mr.stop();mr.reset();mr.release();
            byte[] bytes=java.nio.file.Files.readAllBytes(file.toPath());
            JSObject out=new JSObject();out.put("base64",Base64.encodeToString(bytes,Base64.NO_WRAP));out.put("type","audio/mp4");out.put("size",bytes.length);call.resolve(out);
        }catch(Exception e){try{mr.release();}catch(Exception ignored){}call.reject("تعذر إنهاء التسجيل الصوتي: "+e.getMessage(),e);}
        finally{try{file.delete();}catch(Exception ignored){}}
    }
    @PluginMethod public void speakText(PluginCall call){
        String text=call.getString("text",""),language=call.getString("language","ar-SA");if(text==null||text.trim().isEmpty()){call.reject("لا يوجد نص للقراءة");return;}
        if(tts!=null){speak(call,text,language);return;}tts=new TextToSpeech(getContext(),status->{if(status!=TextToSpeech.SUCCESS)call.reject("تعذر تشغيل محرك النطق");else speak(call,text,language);});
    }
    private void speak(PluginCall c,String text,String language){
        try{int status=tts.setLanguage(Locale.forLanguageTag(language==null?"ar-SA":language));if(status==TextToSpeech.LANG_MISSING_DATA||status==TextToSpeech.LANG_NOT_SUPPORTED)status=tts.setLanguage(new Locale("ar"));
            if(status==TextToSpeech.LANG_MISSING_DATA||status==TextToSpeech.LANG_NOT_SUPPORTED){c.reject("لا يوجد صوت عربي مثبت للقراءة");return;}
            int result=tts.speak(text,TextToSpeech.QUEUE_FLUSH,null,"rimbook-tts");if(result==TextToSpeech.ERROR)c.reject("تعذر بدء القراءة");else{JSObject r=new JSObject();r.put("started",true);c.resolve(r);}
        }catch(Exception e){c.reject("تعذر تشغيل القراءة: "+e.getMessage(),e);}
    }
    @PluginMethod public void shareApp(PluginCall call){
        String url=call.getString("url","");
        String message=call.getString("text","مفكرة Rimbook لإدارة الأعمال والمشاريع والعمال والحسابات.");
        Intent send=new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_SUBJECT,"Rimbook");
        send.putExtra(Intent.EXTRA_TEXT,message+(url==null||url.trim().isEmpty()?"":"\n"+url));
        getActivity().runOnUiThread(()->{
            try{
                getActivity().startActivity(Intent.createChooser(send,"مشاركة Rimbook"));
                call.resolve();
            }catch(Exception e){call.reject("تعذر فتح قائمة مشاركة التطبيقات",e);}
        });
    }
    @PluginMethod public void stopSpeaking(PluginCall call){if(tts!=null)tts.stop();call.resolve();}
    @Override protected void handleOnDestroy(){cancel=true;recording=false;releaseAudio();if(savedRecorder!=null){try{savedRecorder.stop();}catch(Exception ignored){}try{savedRecorder.release();}catch(Exception ignored){}savedRecorder=null;}releaseRecognizer();downloads.shutdownNow();if(tts!=null){try{tts.stop();tts.shutdown();}catch(Exception ignored){}tts=null;}super.handleOnDestroy();}
}