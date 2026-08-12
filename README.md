# Caption Studio

Windows için yerel çalışan AI altyazı editörü. Video önizleme ve proje kaydı Electron ile, medya analizi ve çıktı üretimi paket içindeki FFmpeg/FFprobe ile yapılır.

## Özellikler

- Video üzerinde sürüklenebilir, genişliği ve hizası ayarlanabilir altyazılar
- Her parça için ayrı konum; kelime bazında renk, kontur, vurgu ve zamanlama
- Sağ altyazı listesi, ses dalga formu, yakınlaştırılabilir kelime zaman çizelgesi
- Hazır stiller, özel preset kaydı, sistem fontları ve güvenli alan katmanları
- Stil, video, transkripsiyon ve export ayarlarının tamamını tek isimli presette kaydetme
- SRT içe/dışa aktarma, metin çıktısı, parça bölme/birleştirme ve seçili kısmı oynatma
- Yeni video eklendiğinde Large v3 Turbo ile otomatik altyazı başlatma ve işlemi iptal etme
- Toplu video ekleme, toplu transkripsiyon ve toplu export
- Kaynak çözünürlük/FPS/uzantı koruma; kalite, codec, ses ve en-boy oranı seçenekleri
- Videoya gömülü, şeffaf MOV, yeşil ekran ve altyazı+maske çifti çıktıları
- Projeleri otomatik olarak yerel diske kaydetme

Varsayılan transkripsiyon modeli `onnx-community/whisper-large-v3-turbo_timestamped` modelidir. Daha hafif `onnx-community/whisper-base_timestamped` seçeneği de bulunur. Seçilen model ilk kullanımda indirilir; sonrasında tarayıcı önbelleğinden çalışır.

## Çalıştırma

```powershell
npm install
npm run desktop:dev
```

Üretim paketleri:

```powershell
npm run desktop:build
```

Oluşan Windows dosyaları `release/` altındadır:

- `Caption-Studio-Setup-1.0.0-x64.exe`: kurulum paketi
- `Caption-Studio-Portable-1.0.0-x64.exe`: kurulumsuz sürüm
- `win-unpacked/Caption Studio.exe`: açılmış uygulama klasörü

## Doğrulama

```powershell
npm run check
npm run test:e2e
npm run test:desktop
```

Testler; ASS üretimini, gerçek FFmpeg exportlarını, proje ve SRT akışlarını, video üstü konumlandırmayı, zaman çizelgesi düzenlemeyi, toplu proje oluşturmayı ve gerçek Electron penceresini kapsar.
