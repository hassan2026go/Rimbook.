package com.rimbook.app;

import android.app.AlarmManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.json.JSONObject;

@CapacitorPlugin(
        name = "RimbookAlarm",
        permissions = { @Permission(strings = { "android.permission.POST_NOTIFICATIONS" }, alias = "notifications") }
)
public class RimbookAlarmPlugin extends Plugin {
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9_-]{1,100}$");
    private static final int MAX_ALARMS = 400;   // well below the per-app AlarmManager limit

    private JSObject statusObject() {
        Context context = getContext();
        JSObject out = new JSObject();
        out.put("native", true);
        out.put("sdk", Build.VERSION.SDK_INT);
        out.put("notificationsEnabled", NotificationManagerCompat.from(context).areNotificationsEnabled());
        out.put("exactAllowed", RimbookAlarmScheduler.canScheduleExact(context));
        out.put("pending", RimbookAlarmScheduler.load(context).size());
        return out;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationsResult");
        } else {
            call.resolve(statusObject());
        }
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException | SecurityException e) {
            call.reject("تعذر فتح إعدادات المنبهات الدقيقة على هذا الجهاز");
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException | SecurityException e) {
            call.reject("تعذر فتح إعدادات الإشعارات");
        }
    }

    /** Replaces the whole native alarm set with `alarms` = [{id, title, body, at(ms epoch)}]. */
    @PluginMethod
    public void sync(PluginCall call) {
        JSArray array = call.getArray("alarms");
        if (array == null) {
            call.reject("alarms مطلوبة");
            return;
        }
        try {
            List<RimbookAlarmScheduler.Alarm> next = new ArrayList<>();
            for (int i = 0; i < array.length() && next.size() < MAX_ALARMS; i++) {
                JSONObject o = array.getJSONObject(i);
                String id = o.optString("id", "");
                long at = o.optLong("at", 0L);
                if (!SAFE_ID.matcher(id).matches() || at <= 0L) continue;
                next.add(new RimbookAlarmScheduler.Alarm(id, clip(o.optString("title", ""), 120), clip(o.optString("body", ""), 300), at));
            }
            long now = System.currentTimeMillis();
            for (RimbookAlarmScheduler.Alarm a : RimbookAlarmScheduler.load(getContext())) {
                if ("rimbook-test".equals(a.id) && a.at > now) next.add(a);   // keep a pending diagnostic alarm
            }
            RimbookAlarmScheduler.replaceAll(getContext(), next);
            call.resolve(statusObject());
        } catch (Exception e) {
            call.reject("تعذرت مزامنة التنبيهات");
        }
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        RimbookAlarmScheduler.replaceAll(getContext(), new ArrayList<RimbookAlarmScheduler.Alarm>());
        call.resolve(statusObject());
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSArray out = new JSArray();
        try {
            for (RimbookAlarmScheduler.Alarm a : RimbookAlarmScheduler.load(getContext())) {
                JSObject o = new JSObject();
                o.put("id", a.id);
                o.put("title", a.title);
                o.put("at", a.at);
                out.put(o);
            }
        } catch (Exception ignored) {
        }
        JSObject result = new JSObject();
        result.put("alarms", out);
        call.resolve(result);
    }

    /** One real alarm a few seconds ahead, for the user to close the app (and even reboot) and verify. */
    @PluginMethod
    public void testIn(PluginCall call) {
        int seconds = Math.max(5, Math.min(3600, call.getInt("seconds", 15)));
        long at = System.currentTimeMillis() + seconds * 1000L;
        List<RimbookAlarmScheduler.Alarm> all = RimbookAlarmScheduler.load(getContext());
        List<RimbookAlarmScheduler.Alarm> next = new ArrayList<>();
        for (RimbookAlarmScheduler.Alarm a : all) if (!"rimbook-test".equals(a.id)) next.add(a);
        next.add(new RimbookAlarmScheduler.Alarm("rimbook-test", "اختبار تنبيه ريمبوك", "إن ظهر هذا التنبيه فالتذكيرات تعمل على جهازك.", at));
        RimbookAlarmScheduler.replaceAll(getContext(), next);
        JSObject out = statusObject();
        out.put("at", at);
        call.resolve(out);
    }

    private static String clip(String value, int max) {
        String v = value == null ? "" : value.trim();
        return v.length() > max ? v.substring(0, max) : v;
    }
}
