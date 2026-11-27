package com.rimbook.app;

import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Persists reminder alarms natively and (re)schedules them with AlarmManager, so they survive closing the app and rebooting. */
final class RimbookAlarmScheduler {
    static final String PREFS = "rimbook_alarms";
    static final String KEY = "alarms";
    static final String CHANNEL = "rimbook_reminders";
    static final String ACTION_FIRE = "com.rimbook.app.ALARM_FIRE";
    private static final long MISSED_WINDOW_MS = 24L * 60L * 60L * 1000L;

    static final class Alarm {
        final String id;
        final String title;
        final String body;
        final long at;
        Alarm(String id, String title, String body, long at) { this.id = id; this.title = title; this.body = body; this.at = at; }
    }

    private RimbookAlarmScheduler() {}

    static synchronized List<Alarm> load(Context context) {
        List<Alarm> out = new ArrayList<>();
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray array = new JSONArray(prefs.getString(KEY, "[]"));
            for (int i = 0; i < array.length(); i++) {
                JSONObject o = array.getJSONObject(i);
                out.add(new Alarm(o.getString("id"), o.optString("title", ""), o.optString("body", ""), o.getLong("at")));
            }
        } catch (Exception ignored) {
            // A damaged store must never crash a broadcast receiver; start empty and let the app re-sync.
        }
        return out;
    }

    static synchronized void save(Context context, List<Alarm> alarms) {
        try {
            JSONArray array = new JSONArray();
            for (Alarm a : alarms) {
                JSONObject o = new JSONObject();
                o.put("id", a.id);
                o.put("title", a.title);
                o.put("body", a.body);
                o.put("at", a.at);
                array.put(o);
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, array.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    static boolean canScheduleExact(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    private static PendingIntent pending(Context context, String id, int extraFlags) {
        Intent intent = new Intent(context, RimbookAlarmReceiver.class);
        intent.setAction(ACTION_FIRE);
        intent.setData(Uri.parse("rimbook://alarm/" + Uri.encode(id)));   // unique identity per alarm
        return PendingIntent.getBroadcast(context, 0, intent, extraFlags | PendingIntent.FLAG_IMMUTABLE);
    }

    @SuppressLint("ScheduleExactAlarm")
    static void schedule(Context context, Alarm alarm) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = pending(context, alarm.id, PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            if (canScheduleExact(context)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.at, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.at, pi);   // may be delayed by the system
        } catch (SecurityException denied) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.at, pi);
        }
    }

    static void cancel(Context context, String id) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = pending(context, id, PendingIntent.FLAG_NO_CREATE);
        if (am != null && pi != null) {
            am.cancel(pi);
            pi.cancel();
        }
    }

    /** Makes the native set exactly equal to `next`: cancels removed alarms, (re)schedules the rest. Idempotent. */
    static synchronized void replaceAll(Context context, List<Alarm> next) {
        Set<String> keep = new HashSet<>();
        for (Alarm a : next) keep.add(a.id);
        for (Alarm old : load(context)) if (!keep.contains(old.id)) cancel(context, old.id);
        long now = System.currentTimeMillis();
        List<Alarm> stored = new ArrayList<>();
        for (Alarm a : next) {
            if (a.at <= now) continue;
            schedule(context, a);
            stored.add(a);
        }
        save(context, stored);
    }

    /** Called after reboot / app update / exact-alarm permission change. Past alarms of the last 24h are shown once as missed. */
    static synchronized void rescheduleAll(Context context, boolean showMissed) {
        long now = System.currentTimeMillis();
        List<Alarm> remaining = new ArrayList<>();
        for (Alarm a : load(context)) {
            if (a.at > now) {
                schedule(context, a);
                remaining.add(a);
            } else if (showMissed && now - a.at <= MISSED_WINDOW_MS) {
                show(context, a, true);
            }
        }
        save(context, remaining);
    }

    static synchronized void remove(Context context, String id) {
        List<Alarm> list = load(context);
        List<Alarm> kept = new ArrayList<>();
        for (Alarm a : list) if (!a.id.equals(id)) kept.add(a);
        save(context, kept);
    }

    @SuppressLint("MissingPermission")
    static void show(Context context, Alarm alarm, boolean missed) {
        NotificationManagerCompat compat = NotificationManagerCompat.from(context);
        if (!compat.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel channel = new NotificationChannel(CHANNEL, "تذكيرات ريمبوك", NotificationManager.IMPORTANCE_HIGH);
                channel.setDescription("تنبيهات المواعيد والمهام والاستحقاقات");
                nm.createNotificationChannel(channel);   // safe to repeat
            }
        }
        PendingIntent content = null;
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) content = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = (missed ? "فاتك: " : "") + (alarm.title.isEmpty() ? "تذكير ريمبوك" : alarm.title);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(title)
                .setContentText(alarm.body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(alarm.body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true);
        if (content != null) builder.setContentIntent(content);
        try {
            compat.notify(alarm.id.hashCode(), builder.build());
        } catch (SecurityException ignored) {
            // Notification permission revoked between the check and the call.
        }
    }
}
