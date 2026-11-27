# Third-party notices

## Sherpa-ONNX Android runtime

Rimbook uses the official Sherpa-ONNX Android AAR, version 2.0.3, downloaded from the upstream GitHub release and verified against its published SHA-256 digest.

- Project: https://github.com/k2-fsa/sherpa-onnx
- License: Apache License 2.0
- Release asset: https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.3/sherpa-onnx-2.0.3.aar
- SHA-256: 4c766e2e74c9d33d595338c21fe3b305c73ba45d47e96a235675c33142a2ec50
- License text: https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE

## Whisper Tiny multilingual speech model

The optional on-device Arabic speech model is the multilingual Whisper Tiny ONNX conversion maintained in the Sherpa-ONNX model collection.

- Model files: `tiny-encoder.int8.onnx`, `tiny-decoder.int8.onnx`, and `tiny-tokens.txt`
- Pinned upstream revision: `65176e2deb88badc814a94058666cadccc29b61c`
- Model source: https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny
- Original model: OpenAI Whisper Tiny multilingual
- License: MIT
- Original project and license: https://github.com/openai/whisper

The model files are downloaded by the app on the user's explicit request, stored in app-private storage, and SHA-256 verified before activation. Recognition runs locally on the device after download.

### MIT License

Copyright (c) 2022 OpenAI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
