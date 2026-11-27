/* Rimbook reminder alarms bridge.
   Android app: talks to the native RimbookAlarm plugin (AlarmManager + boot receiver), so reminders survive closing the app and rebooting.
   Browser/PWA: best-effort timers + Notification API, which only work while the page is open — status() says so plainly. */
(function () {
  "use strict";
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let plugin = null, webTimers = [], debounce = null;
  const state = { lastSync: null, lastError: "" };

  async function nativePlugin() {
    if (plugin) return plugin;
    for (let attempt = 0; attempt < 30; attempt++) {
      const cap = window.Capacitor;
      if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
        try {
          const legacy = cap.Plugins && cap.Plugins.RimbookAlarm;
          if (legacy && typeof legacy.sync === "function") return (plugin = legacy);
          if (typeof cap.registerPlugin === "function") {
            const candidate = cap.registerPlugin("RimbookAlarm");
            if (candidate && typeof candidate.sync === "function") return (plugin = candidate);
          }
        } catch (_) { /* retry */ }
        await wait(100);
      } else return null;                                   // plain browser: no native layer will ever appear
    }
    return null;
  }

  function webSchedule(alarms) {
    webTimers.forEach(clearTimeout); webTimers = [];
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return 0;
    const now = Date.now();
    const soon = alarms.filter(a => a.at - now > 0 && a.at - now < 2147483000).slice(0, 50);
    soon.forEach(a => webTimers.push(setTimeout(() => {
      try { new Notification("⏰ " + a.title, { body: a.body, icon: "./rimbook-icon-192x192.png", tag: a.id }); } catch (_) {}
    }, a.at - now)));
    return soon.length;
  }

  const api = {
    async status() {
      const native = await nativePlugin();
      if (native) {
        try { return Object.assign({ native: true }, await native.status()); }
        catch (e) { return { native: true, error: String((e && e.message) || e) }; }
      }
      const supported = typeof Notification !== "undefined";
      return { native: false, notificationsEnabled: supported && Notification.permission === "granted", exactAllowed: false, pending: webTimers.length, webOnly: true, supported };
    },
    async requestNotifications() {
      const native = await nativePlugin();
      if (native) return native.requestNotifications();
      if (typeof Notification === "undefined") return { native: false, notificationsEnabled: false };
      const result = await Notification.requestPermission();
      return { native: false, notificationsEnabled: result === "granted" };
    },
    async openExactAlarmSettings() { const n = await nativePlugin(); if (n) return n.openExactAlarmSettings(); },
    async openNotificationSettings() { const n = await nativePlugin(); if (n) return n.openNotificationSettings(); },
    async testIn(seconds) {
      const native = await nativePlugin();
      if (native) return native.testIn({ seconds });
      const at = Date.now() + (seconds || 15) * 1000;
      webSchedule([{ id: "rimbook-test", title: "اختبار تنبيه ريمبوك", body: "إن ظهر هذا فالتنبيهات تعمل (والصفحة مفتوحة).", at }]);
      return { native: false, at };
    },
    async sync(alarms) {
      const list = (alarms || []).filter(a => a && /^[A-Za-z0-9_-]{1,100}$/.test(a.id) && Number.isFinite(a.at));
      const native = await nativePlugin();
      try {
        if (native) { const res = await native.sync({ alarms: list }); state.lastSync = { at: Date.now(), count: list.length, native: true, res }; }
        else { state.lastSync = { at: Date.now(), count: webSchedule(list), native: false }; }
        state.lastError = "";
      } catch (e) { state.lastError = String((e && e.message) || e); }
      return state.lastSync;
    },
    /* Debounced: many edits in a row produce one sync. The plan is recomputed from scratch, so it is idempotent. */
    syncFromCalendar(calStore) {
      const Cal = window.RimbookCalendarCore;
      if (!Cal || !calStore) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => { api.sync(Cal.planAlarms(calStore, Date.now())); }, 400);
    },
    get lastSync() { return state.lastSync; },
    get lastError() { return state.lastError; }
  };
  window.RimbookAlarms = api;
})();
