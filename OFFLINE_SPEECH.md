# Rimbook offline Arabic speech recognition

## Runtime

- Android records mono PCM audio at 16 kHz through AudioRecord.
- Transcription runs locally through Sherpa-ONNX 2.0.3 and the multilingual Whisper Tiny model.
- The Android implementation does not call SpeechRecognizer, RecognitionService, or a vendor speech-to-text application.
- Arabic is selected explicitly with Whisper language code ar and task transcribe.
- Audio is split at pauses and at a 20-second segment ceiling. Completed segments are decoded locally and combined into the final transcript.
- A 3.5-second quiet period after a completed segment ends the session. The user can also tap the microphone button again to stop.

## First-time setup

Open the voice settings and select **تنزيل حزمة العربية** while connected to the internet. The app downloads three pinned model files (about 99 MiB total), verifies their exact byte counts and SHA-256 digests, then stores them in the app-private files directory. Recognition is offline after successful installation.

Downloads are not resumed after interruption; an incomplete .part file is discarded and downloaded again on the next attempt. Existing files are reused only after their size and SHA-256 are checked.

## Privacy and accounting safety

- Audio samples are processed in memory and are not uploaded by this plugin.
- The microphone permission is requested through Android's normal permission flow.
- The transcript is passed to the existing voice-ledger parser and review screen. The native plugin does not write financial records.
- The user must review and confirm parsed financial movements before they are saved.

## Model and licensing

The model is the multilingual OpenAI Whisper Tiny checkpoint converted to Sherpa-ONNX format, pinned to revision 65176e2deb88badc814a94058666cadccc29b61c. The Whisper model is MIT-licensed. Sherpa-ONNX runtime is Apache-2.0. See THIRD_PARTY_NOTICES.md.

## Device verification still required

A successful CI build verifies compilation and packaging only. On-device checks must still confirm:
1. Model download completes over a normal connection and all three SHA-256 checks pass.
2. The app reports the local Arabic engine as installed.
3. Airplane mode can be enabled after download and Arabic dictation still works.
4. Long speech with pauses is segmented and combined without losing the opening or final words.
5. Tapping the microphone button again ends recording and produces a reviewable transcript.
6. A failed or empty transcription does not create a financial movement.
7. The flow works on a Samsung device and at least one other Android vendor.
