# Rimbook — Release readiness

## Product scope for this release

Rimbook is a free, local-first Android application. It does not require a permanent server.

The following capabilities are explicitly deferred and must not be advertised as available:
- Separate authenticated manager and worker accounts with server-enforced authorization.
- Automatic multi-device cloud synchronization and conflict resolution.
- Guaranteed Arabic speech recognition while offline on every phone; availability depends on Android's installed on-device speech service and Arabic language model.

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
6. Microphone permission and original audio recording/playback.
7. Offline Arabic recognition only if the phone reports an installed Arabic on-device model.

A successful CI build is not a substitute for this device acceptance. Do not announce the public download link until the signed APK has passed these checks.
