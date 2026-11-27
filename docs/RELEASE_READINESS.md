## Android compatibility policy

- The current Capacitor 7 Android baseline is Android 6.0 (API 23) or newer; older Android releases are not supported by this native wrapper.
- Build the universal APK with every CPU ABI actually packaged in the pinned Sherpa-ONNX AAR; do not force arm64-only. Gradle will select the compatible native libraries on each device.
- Verify installation and core workflows on representative Android API levels and vendors before claiming device compatibility.
- Voice recognition is capability-based: bundled offline Arabic recognition works after its model is installed; online recognition requires a working network speech service on the device. A future provider-backed cloud transcription path is needed for devices without such a service.
- Responsive web UI must support phones and tablets, portrait and landscape layouts, variable screen sizes, and accessibility font scaling.

# Rimbook — Release readiness

## Product scope for this release

Rimbook is a free, local-first Android application. It does not require a permanent server.

The following capabilities are explicitly deferred and must not be advertised as available:
- Separate authenticated manager and worker accounts with server-enforced authorization.
- Automatic multi-device cloud synchronization and conflict resolution.
- Production acceptance of offline Arabic recognition on every supported phone. Rimbook bundles the Sherpa-ONNX runtime and downloads its verified Arabic Whisper model once; the first model download requires internet, while subsequent recognition is designed to run locally without OEM speech-recognition services.

The current manager/worker screens are local UI roles over the same device data store. They are workflow conveniences, not secure account isolation.

## Android release requirements

A distributable Android APK must:
- Be built with the signed release build variant, not assembleDebug.
- Use a persistent upload/release keystore so future updates retain the same signing identity.
- Pass APK signature verification before publication.
- Include the Rimbook application label, icon and native microphone permission only.
- Be published with a SHA-256 checksum and certificate fingerprint information.

The workflow `.github/workflows/android-release.yml` implements this release path. It intentionally stops if any of these GitHub Actions secrets are missing:
- `RIMBOOK_KEYSTORE_BASE64`
- `RIMBOOK_KEYSTORE_PASSWORD`
- `RIMBOOK_KEY_ALIAS`
- `RIMBOOK_KEY_PASSWORD`

Never commit the keystore or passwords to the repository. Keep a secure offline copy of the keystore and its passwords; losing them prevents signing compatible future updates.

## Required real-device acceptance

Before calling the release production-ready, install the signed APK on a physical Android phone and verify:
1. First launch, relaunch and offline launch.
2. Header, all screens, bottom navigation and Android system navigation do not overlap or clip.
3. Profile, About, More, project creation/edit/archive, worker records, attendance and task assignment.
4. Wage calculations, payments, advances and reversal entries against hand-calculated examples.
5. Attachments, full backup, restore and data preservation.
6. Microphone permission, original audio recording/playback, and native plugin bridge startup.
7. Download the verified Arabic Whisper model once, then disconnect the internet and test Arabic recognition, stop/cancel behavior, and transcript accuracy.

A successful CI build is not a substitute for this device acceptance. Do not announce the public download link until the signed APK has passed these checks.
