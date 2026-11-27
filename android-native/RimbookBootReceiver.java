package com.rimbook.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Re-arms stored reminders after a reboot, an app update, or when the exact-alarm permission changes. */
public class RimbookBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        boolean restart = Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);
        boolean permission = "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED".equals(action);
        if (!restart && !permission) return;
        try {
            RimbookAlarmScheduler.rescheduleAll(context, restart);
        } catch (Exception ignored) {
            // The app re-syncs everything the next time it opens.
        }
    }
}
