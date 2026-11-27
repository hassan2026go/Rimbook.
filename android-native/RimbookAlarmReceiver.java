package com.rimbook.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import java.util.List;

/** Fires a stored reminder. Reads everything from native storage, so it works with the app closed. */
public class RimbookAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !RimbookAlarmScheduler.ACTION_FIRE.equals(intent.getAction())) return;
        Uri data = intent.getData();
        if (data == null) return;
        String id = data.getLastPathSegment();
        if (id == null) return;
        try {
            List<RimbookAlarmScheduler.Alarm> alarms = RimbookAlarmScheduler.load(context);
            for (RimbookAlarmScheduler.Alarm alarm : alarms) {
                if (alarm.id.equals(id)) {
                    RimbookAlarmScheduler.show(context, alarm, false);
                    break;
                }
            }
            RimbookAlarmScheduler.remove(context, id);
        } catch (Exception ignored) {
            // Never crash a broadcast receiver.
        }
    }
}
