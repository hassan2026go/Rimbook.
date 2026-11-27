const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const Cal = require("../calendar-core.js");

// ---------------- planner ----------------
const now = new Date(2026, 10, 25, 8, 0, 0).getTime();               // 25 Nov 2026 08:00 local
let n = 0, store = Cal.emptyStore();
const add = raw => { const r = Cal.createItem(store, raw, { id: "i" + (++n), now: 1700000000000 + n }); assert.ok(r.ok, r.error); store = r.store; return r.item; };
const appt = add({ type: "appointment", date: "2026-11-25", time: "10:00", title: "موعد المهندس", remind: 30 });
const allDay = add({ type: "task", date: "2026-11-26", title: "مراجعة العقد", remind: 0 });
add({ type: "appointment", date: "2026-11-25", time: "08:10", title: "فات تذكيره", remind: 15 });       // reminder moment (07:55) already passed
add({ type: "appointment", date: "2026-11-24", time: "10:00", title: "أمس", remind: 5 });
add({ type: "appointment", date: "2028-06-01", time: "10:00", title: "بعيد جداً", remind: 5 });
add({ type: "appointment", date: "2026-11-27", time: "10:00", title: "بلا تذكير" });
const doneTask = add({ type: "task", date: "2026-11-28", title: "منجزة", remind: 0 });
store = Cal.toggleDone(store, doneTask.id).store;
const fin = add({ type: "note", date: "2026-11-29", time: "09:00", title: "دفعة المورد", remind: 60, finance: { mode: "party", kind: "payable", amount: 250000, party: "مورد" } });
const gone = add({ type: "appointment", date: "2026-11-30", time: "10:00", title: "محذوف", remind: 0 });
store = Cal.deleteItem(store, gone.id).store;

const plan = Cal.planAlarms(store, now);
assert.deepEqual(plan.map(p => p.id), ["cal-" + appt.id, "cal-" + allDay.id, "cal-" + fin.id], "only future, not done, not deleted, within horizon, sorted");
assert.equal(plan[0].at, new Date(2026, 10, 25, 9, 30).getTime(), "30 minutes before 10:00");
assert.equal(plan[1].at, new Date(2026, 10, 26, 9, 0).getTime(), "items without a time use the default hour");
assert.equal(plan[2].at, new Date(2026, 10, 29, 8, 0).getTime());
assert.match(plan[2].body, /استحقاق مالي/);
assert.ok(!/2,?500|250000/.test(JSON.stringify(plan)), "notification text never exposes amounts");
assert.equal(Cal.planAlarms(store, now).length, Cal.planAlarms(store, now).length, "deterministic");
assert.equal(Cal.planAlarms(store, new Date(2026, 10, 25, 9, 30, 0).getTime()).some(p => p.id === "cal-" + appt.id), false, "a reminder whose moment has arrived is not re-planned (no repeat ringing)");
assert.equal(Cal.planAlarms(store, now, { max: 2 }).length, 2);
store = Cal.setAllDayHour(store, 7).store;
assert.equal(Cal.planAlarms(store, now).find(p => p.id === "cal-" + allDay.id).at, new Date(2026, 10, 26, 7, 0).getTime());
assert.equal(Cal.createItem(store, { type: "note", date: "2026-11-25", title: "x", remind: 7 }, {}).ok, false, "unknown lead time rejected");
assert.equal(Cal.setAllDayHour(store, 24).ok, false);
const legacy = Cal.emptyStore(); delete legacy.settings.allDayHour; assert.ok(Cal.validateStore(legacy).ok, "phase-2 stores without the new setting stay valid");

// ---------------- JS bridge ----------------
function bridge(native) {
  const calls = [];
  const plugin = native ? {
    sync: async a => { calls.push(["sync", a]); return { pending: a.alarms.length }; },
    status: async () => ({ native: true, notificationsEnabled: true, exactAllowed: false, pending: 0 }),
    requestNotifications: async () => ({ notificationsEnabled: true }), openExactAlarmSettings: async () => { calls.push(["exact"]); },
    openNotificationSettings: async () => {}, testIn: async a => { calls.push(["test", a]); return { at: 1 }; }
  } : null;
  const ctx = { console, Date, Math, Number, Promise, Object, String, Array, setTimeout, clearTimeout,
    window: { RimbookCalendarCore: Cal, Capacitor: native ? { isNativePlatform: () => true, Plugins: { RimbookAlarm: plugin } } : undefined } };
  ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(read("alarms.js"), ctx);
  return { A: ctx.window.RimbookAlarms, calls };
}
(async () => {
  const { A, calls } = bridge(true);
  const st = await A.status(); assert.equal(st.native, true); assert.equal(st.exactAllowed, false);
  await A.sync([{ id: "cal-ok", title: "a", body: "b", at: 5 }, { id: "bad id!", title: "x", body: "y", at: 5 }, { id: "nan", at: NaN }]);
  assert.equal(calls[0][1].alarms.length, 1, "invalid ids/times never reach the native layer");
  A.syncFromCalendar(store); A.syncFromCalendar(store); A.syncFromCalendar(store);
  await new Promise(r => setTimeout(r, 700));
  const syncs = calls.filter(c => c[0] === "sync");
  assert.equal(syncs.length, 2, "three quick edits produce a single debounced sync");
  assert.equal(JSON.stringify(syncs[1][1].alarms.map(a => a.id)), JSON.stringify(Cal.planAlarms(store, Date.now()).map(p => p.id)), "the synced set is exactly the planner output");
  await A.testIn(15); assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify(["test", { seconds: 15 }]));
  const web = bridge(false);
  const ws = await web.A.status(); assert.equal(ws.native, false); assert.equal(ws.webOnly, true, "browser mode is honest that it only works while open");
  const wsync = await web.A.sync([{ id: "cal-1", title: "t", body: "b", at: Date.now() + 1000 }]); assert.equal(wsync.native, false);

  // ---------------- project patch script ----------------
  function fixture(withSpeech) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rimbook-android-"));
    const java = path.join(dir, "app/src/main/java/com/rimbook/app"); fs.mkdirSync(java, { recursive: true });
    fs.writeFileSync(path.join(dir, "app/src/main/AndroidManifest.xml"),
      '<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <uses-permission android:name="android.permission.INTERNET" />\n    <application android:label="Rimbook">\n        <activity android:name=".MainActivity" android:exported="true" />\n    </application>\n</manifest>\n');
    fs.writeFileSync(path.join(java, "MainActivity.java"), withSpeech
      ? "package com.rimbook.app;\n\nimport android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(OfflineSpeechPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}\n"
      : "package com.rimbook.app;\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}\n");
    return dir;
  }
  for (const withSpeech of [true, false]) {
    const dir = fixture(withSpeech);
    const run = () => spawnSync("python3", [path.join(root, "android-native/apply_alarm_patch.py"), dir], { encoding: "utf8" });
    let r = run(); assert.equal(r.status, 0, r.stderr);
    const manifest = () => fs.readFileSync(path.join(dir, "app/src/main/AndroidManifest.xml"), "utf8");
    const activity = () => fs.readFileSync(path.join(dir, "app/src/main/java/com/rimbook/app/MainActivity.java"), "utf8");
    const m1 = manifest(), a1 = activity();
    for (const p of ["POST_NOTIFICATIONS", "SCHEDULE_EXACT_ALARM", "RECEIVE_BOOT_COMPLETED"]) assert.ok(m1.includes("android.permission." + p), p);
    assert.ok(m1.includes(".RimbookAlarmReceiver") && m1.includes(".RimbookBootReceiver") && m1.includes("BOOT_COMPLETED"));
    assert.ok(m1.indexOf("RimbookBootReceiver") < m1.indexOf("</application>"), "receivers are declared inside <application>");
    assert.equal((a1.match(/registerPlugin\(RimbookAlarmPlugin\.class\)/g) || []).length, 1);
    if (withSpeech) assert.ok(a1.includes("registerPlugin(OfflineSpeechPlugin.class)"), "the speech plugin registration is untouched");
    for (const f of ["RimbookAlarmScheduler", "RimbookAlarmReceiver", "RimbookBootReceiver", "RimbookAlarmPlugin"])
      assert.ok(fs.existsSync(path.join(dir, "app/src/main/java/com/rimbook/app", f + ".java")), f);
    r = run(); assert.equal(r.status, 0, r.stderr);
    assert.equal(manifest(), m1, "second run changes nothing (manifest)"); assert.equal(activity(), a1, "second run changes nothing (activity)");
  }
  const broken = fs.mkdtempSync(path.join(os.tmpdir(), "rimbook-empty-"));
  assert.notEqual(spawnSync("python3", [path.join(root, "android-native/apply_alarm_patch.py"), broken], { encoding: "utf8" }).status, 0, "fails loudly on an unexpected project layout");

  // ---------------- static checks on the native sources (no Java compiler is available in CI-less environments) ----------------
  // One pass, so "//" inside a string literal is not mistaken for a comment (and quotes inside comments are ignored).
  const strip = s => s.replace(/("(?:\\.|[^"\\\n])*")|(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)/g, (m, str) => str ? '""' : "");
  for (const f of ["RimbookAlarmScheduler", "RimbookAlarmReceiver", "RimbookBootReceiver", "RimbookAlarmPlugin"]) {
    const src = read("android-native/" + f + ".java"), code = strip(src);
    assert.ok(src.startsWith("package com.rimbook.app;"), f + " package");
    assert.ok(new RegExp("(public )?(final )?class " + f + "\\b").test(src), f + " class name matches file");
    for (const [open, close] of [["{", "}"], ["(", ")"], ["[", "]"]])
      assert.equal(code.split(open).length, code.split(close).length, f + " has balanced " + open + close);
  }
  const sched = read("android-native/RimbookAlarmScheduler.java");
  for (const token of ["FLAG_IMMUTABLE", "canScheduleExactAlarms", "setExactAndAllowWhileIdle", "setAndAllowWhileIdle", "areNotificationsEnabled", "FLAG_NO_CREATE", "SecurityException"])
    assert.ok(sched.includes(token), token);
  assert.ok(/SDK_INT\s*<\s*Build\.VERSION_CODES\.S/.test(sched), "exact-alarm API is guarded by SDK level");
  assert.ok(read("android-native/RimbookBootReceiver.java").includes("ACTION_BOOT_COMPLETED") && read("android-native/RimbookBootReceiver.java").includes("ACTION_MY_PACKAGE_REPLACED"));
  const plugin = read("android-native/RimbookAlarmPlugin.java");
  assert.ok(plugin.includes('name = "RimbookAlarm"') && plugin.includes("@PermissionCallback") && plugin.includes("SAFE_ID"));
  assert.ok(!/api\.anthropic|http:\/\/|https:\/\//.test(sched + plugin), "alarms are fully local: no network calls");

  // ---------------- wiring ----------------
  const preview = read(".github/workflows/android-preview.yml");
  assert.ok(preview.includes("apply_alarm_patch.py"), "the preview build applies the alarms patch");
  assert.ok(preview.indexOf("apply_alarm_patch.py") < preview.indexOf("npx cap sync android"), "patch runs before cap sync");
  assert.ok(read(".github/workflows/android-release.yml").includes("apply_alarm_patch.py"), "the signed release build includes the alarms too");
  assert.ok(read("index.html").indexOf("alarms.js") < read("index.html").indexOf("calendar.js"), "alarms.js loads before calendar.js");
  assert.ok(read("sw.js").includes('"./alarms.js"'), "alarms.js is cached for offline use");
  console.log("Reminder alarms tests passed.");
})().catch(e => { console.error(e); process.exit(1); });
