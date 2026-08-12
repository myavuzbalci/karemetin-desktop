# Caption Studio

Windows icin yerel calisan AI altyazi editoru ve video render uygulamasi. Transkripsiyon, medya analizi ve FFmpeg export islemleri internet gerektirmeden yapilir.

## Neler Yapar?

- `Whisper Large v3 Turbo` ile otomatik, kelime zaman kodlu altyazi olusturur.
- Altyaziyi video uzerinde surukleyip konumlandirabilir; genislik, hizalama ve segment bazli konum ayarlayabilirsin.
- Kelime bazinda renk, kontur, arka plan, vurgu ve animasyon uygular.
- Zaman cizelgesi, ses dalga formu, coklu kelime secimi, segment bolme/birlestirme ve secili bolumu oynatma sunar.
- Hazir stiller, kullanici stilleri ve tum ayarlari kapsayan kaydedilebilir presetler icerir.
- Birden fazla ses kanali, ses seviyesi, fade in/out, normalize ve render sirasinda ses miksleme destekler.
- Kaynak cozunurluk, FPS ve uzantiyi koruyabilir; codec, kalite, ses, en-boy orani ve cikti formatlarini ayarlayabilirsin.
- Gomulu altyazili video, seffaf MOV, yesil ekran, maske cifti, SRT, TXT, ASS ve duzenlenebilir `.captionstudio` proje dosyasi uretebilir.
- Toplu video ekleme, sirali transkripsiyon ve sirali export destekler.

## Tamamen Yerel Model

Portable klasorun `resources/models` bolumunde Turbo model agirliklari bulunur. Uygulama uzak model erisimini kapatir; model indirmez ve transkripsiyon icin internet kullanmaz.

- WebGPU uyumlu cihazlarda editor GPU kullanir.
- GPU yoksa veya GPU modeli baslatamazsa q4 WASM/CPU yoluna otomatik duser.
- Portable klasoru tasirken `resources/models` klasorunu silme veya ayirma.

## Calistirma

Gelistirme icin:

```powershell
npm install
npm run desktop:dev
```

Kontrol ve derleme icin:

```powershell
npm run check
npm run test:e2e
npm run test:desktop
npm run desktop:build
```

## Portable Kullanim

Tamamen tasinabilir ve internetsiz kullanim icin `release/win-unpacked` klasorunun tamamini tasiyin. Giris dosyasi:

```text
release/win-unpacked/Caption Studio.exe
```

`resources/models` model dosyalarini, `resources/app.asar.unpacked` ise native FFmpeg ve ONNX bagimliliklarini icerir. Bu klasorler olmadan model veya render motoru calismaz.

## Terminal Otomasyonu

Arayuzu acmadan video islemek icin:

```powershell
& ".\Caption Studio.exe" --caption-cli "--caption-input=C:\Videolar\kaynak.mp4" "--caption-preset-name=soru cevap"
```

Komut, kaynak videonun yaninda `kaynak-caption-studio` adinda bir klasor olusturur. Orijinal videoyu kopyalamaz; altyazili video, SRT, TXT, ASS ve `.captionstudio` proje dosyasini bu klasore yazar.

Tum terminal secenekleri ve ornekler icin [TERMINAL-KULLANIM.md](TERMINAL-KULLANIM.md) dosyasina bak.

## Kalici Ayarlar

Kaydedilen tum ayar presetleri Windows kullanici verisinde tutulur:

```text
%APPDATA%\Caption Studio\settings-presets.json
```

Bu dosya terminalin `--caption-preset-name` secenegi tarafindan da okunur.

## Teknik Yapi

- Electron + React + TypeScript
- Transformers.js / ONNX Runtime ile yerel Whisper
- FFmpeg / FFprobe ile medya analizi ve native render
- Playwright ve Vitest ile birim, UI, Electron ve portable testleri
