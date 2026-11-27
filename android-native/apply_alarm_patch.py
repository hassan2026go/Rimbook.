#!/usr/bin/env python3
"""Adds the Rimbook reminder alarms (AlarmManager + boot receiver + Capacitor plugin) to a generated Capacitor Android project.
Usage: python3 android-native/apply_alarm_patch.py <android-project-dir>   (default: android)
Idempotent: running it twice changes nothing the second time."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FILES = ["RimbookAlarmScheduler.java", "RimbookAlarmReceiver.java", "RimbookBootReceiver.java", "RimbookAlarmPlugin.java"]
PERMISSIONS = [
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.SCHEDULE_EXACT_ALARM",
    "android.permission.RECEIVE_BOOT_COMPLETED",
]
RECEIVERS = """        <receiver android:name=".RimbookAlarmReceiver" android:exported="false" />
        <receiver android:name=".RimbookBootReceiver" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
                <action android:name="android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED" />
            </intent-filter>
        </receiver>
"""


def main(root: Path) -> None:
    java_dir = root / "app/src/main/java/com/rimbook/app"
    manifest_path = root / "app/src/main/AndroidManifest.xml"
    activity_path = java_dir / "MainActivity.java"
    for path in (manifest_path, activity_path):
        if not path.exists():
            raise SystemExit("Missing generated file: %s" % path)

    java_dir.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        (java_dir / name).write_text((HERE / name).read_text(encoding="utf-8"), encoding="utf-8")

    manifest = manifest_path.read_text(encoding="utf-8")
    if "<application" not in manifest or "</application>" not in manifest:
        raise SystemExit("AndroidManifest.xml has no <application> element")
    for name in PERMISSIONS:
        if name not in manifest:
            manifest = manifest.replace("<application", '    <uses-permission android:name="%s" />\n    <application' % name, 1)
    if ".RimbookAlarmReceiver" not in manifest:
        manifest = manifest.replace("</application>", RECEIVERS + "    </application>", 1)
    manifest_path.write_text(manifest, encoding="utf-8")

    code = activity_path.read_text(encoding="utf-8")
    if "registerPlugin(RimbookAlarmPlugin.class)" not in code:
        if "registerPlugin(OfflineSpeechPlugin.class);" in code:
            code = code.replace(
                "registerPlugin(OfflineSpeechPlugin.class);",
                "registerPlugin(OfflineSpeechPlugin.class);\n        registerPlugin(RimbookAlarmPlugin.class);", 1)
        else:
            if "import android.os.Bundle;" not in code:
                code = code.replace("import com.getcapacitor.BridgeActivity;", "import android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;", 1)
            anchor = "public class MainActivity extends BridgeActivity {"
            if anchor not in code:
                raise SystemExit("MainActivity has an unexpected shape")
            code = code.replace(anchor, anchor + "\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(RimbookAlarmPlugin.class);\n        super.onCreate(savedInstanceState);\n    }", 1)
    activity_path.write_text(code, encoding="utf-8")
    print("Rimbook alarms patch applied to", root)


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "android"))
