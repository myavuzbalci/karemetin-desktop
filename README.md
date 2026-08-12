# KareMetin

An offline AI subtitle editor and native video renderer for Windows. Transcription, media inspection, and FFmpeg exports run locally without an internet connection.

## Download

Download the Windows installer or portable build from the [latest release](https://github.com/myavuzbalci/karemetin-desktop/releases/latest).

- `KareMetin-Setup-1.0.0-x64.exe`: installer with Start Menu and desktop shortcuts.
- `KareMetin-Portable-1.0.0-x64.exe`: self-contained portable build. Keep it in a writable folder; it extracts its runtime beside the executable on first launch.

Windows may show a SmartScreen warning because the binaries are not code signed. Verify the SHA-256 checksums published with the release before running a downloaded file.

## Features

- Creates word-timed subtitles with `Whisper Large v3 Turbo`.
- Lets you drag captions directly over the video and adjust position, width, alignment, and per-segment placement.
- Supports per-word color, outline, background, emphasis, and animation styling.
- Includes a timeline, waveform, multi-word selection, segment split/merge, and selected-range playback.
- Provides built-in styles, custom styles, and named presets that store all caption, canvas, transcription, and export settings.
- Supports multiple audio tracks, volume, fade in/out, normalization, and mixed audio during rendering.
- Preserves source resolution, frame rate, and extension when requested, with configurable codec, quality, audio, aspect ratio, and output formats.
- Produces burned-in video, transparent MOV, green screen, mask pairs, SRT, TXT, ASS, and editable `.karemetin` projects.
- Supports batch media import, sequential transcription, and sequential export.

## Fully Offline Model

The portable build ships Turbo model files in `resources/models`. Remote model access is disabled, so the application does not download model files or use the internet for transcription.

- The editor uses WebGPU when it is available.
- It automatically falls back to the q4 WASM/CPU path when a GPU is unavailable or cannot initialize the model.
- Do not remove or separate the `resources/models` directory when moving the portable build.

## Development

```powershell
npm install
npm run desktop:dev
```

Validation and build:

```powershell
npm run check
npm run test:e2e
npm run test:desktop
npm run desktop:build
```

## Portable Use

For fully portable offline use, move the complete `release/win-unpacked` directory. The entry point is:

```text
release/win-unpacked/KareMetin.exe
```

`resources/models` contains the local model weights and `resources/app.asar.unpacked` contains native FFmpeg and ONNX dependencies. Both are required for transcription and rendering.

## Terminal Automation

Process a video without opening the editor:

```powershell
& ".\KareMetin.exe" --caption-cli "--caption-input=C:\Videos\source.mp4" "--caption-preset-name=question answer"
```

The command creates a `source-karemetin` output directory next to the source media. It does not copy the original video. The directory contains the captioned video, SRT, TXT, ASS, and editable `.karemetin` project file.

See [TERMINAL-KULLANIM.md](TERMINAL-KULLANIM.md) for the complete terminal reference and Turkish examples.

## Persistent Presets

Saved presets are stored in the Windows user profile:

```text
%APPDATA%\KareMetin\settings-presets.json
```

The terminal `--caption-preset-name` option reads this file as well.

## Technology

- Electron, React, and TypeScript
- Transformers.js and ONNX Runtime for local Whisper inference
- FFmpeg and FFprobe for media inspection and native rendering
- Vitest and Playwright for unit, UI, Electron, and portable tests

## Privacy

KareMetin does not send media, transcripts, presets, or usage analytics to a service. See [PRIVACY.md](PRIVACY.md) for the data-handling statement.

## License and Notices

KareMetin is distributed under [GPL-3.0-or-later](LICENSE). Third-party components and model sources are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
