# KareMetin Terminal Usage

These commands run with `KareMetin.exe` inside the `release\\win-unpacked` directory. On the first CLI run, KareMetin downloads the local Whisper Turbo model once. Subsequent transcription runs use that local copy and do not need an internet connection.

## Basic command

Open PowerShell in the `win-unpacked` directory and run:

```powershell
& ".\KareMetin.exe" --caption-cli "--caption-input=C:\Videos\source.mp4"
```

KareMetin creates a `source-karemetin` output folder beside the source video. The original media is not copied. The generated files are:

- `source-captioned.mp4`: captioned video export
- `source.srt`: time-coded subtitles
- `source.txt`: plain transcript
- `source.ass`: styled subtitles with word animation data
- `source.karemetin`: editable KareMetin project

## Model and hardware

`Whisper Large v3 Turbo` is the default model. The editor uses WebGPU when available and falls back to CPU/WASM automatically. Terminal automation uses the local q4 CPU model for broad Windows compatibility, so a GPU is not required.

## Use a saved preset

Any complete settings preset saved in the editor, such as `question answer`, can be selected by name:

```powershell
& ".\KareMetin.exe" --caption-cli "--caption-input=C:\Videos\source.mp4" "--caption-preset-name=question answer"
```

## Choose an output directory

```powershell
& ".\KareMetin.exe" --caption-cli "--caption-input=C:\Videos\source.mp4" "--caption-output-dir=D:\Exports"
```

## Use a project as a preset

An existing project file (`.karemetin`; legacy `.captionstudio` files are also supported) can provide the caption style, canvas, transcription, and export settings for a new video:

```powershell
& ".\KareMetin.exe" --caption-cli "--caption-input=C:\Videos\source.mp4" "--caption-preset=C:\Projects\question-answer.karemetin"
```

## Generate files without rendering video

To create only SRT, TXT, ASS, and the project file:

```powershell
& ".\KareMetin.exe" --caption-cli "--caption-input=C:\Videos\source.mp4" --caption-no-video
```

## Notes

- Put the complete `--caption-input=...` and `--caption-output-dir=...` argument in double quotes when a path contains spaces.
- The local model is stored in `%APPDATA%\KareMetin\models`. Do not remove it unless you want KareMetin to download it again.
- When processing finishes, the terminal prints the full path of every generated file. Keep the terminal open if an error occurs; its message explains the cause.
