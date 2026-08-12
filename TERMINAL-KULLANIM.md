# Caption Studio Terminal Kullanimi

Bu komutlar `release\\win-unpacked` klasorundeki `Caption Studio.exe` ile calisir. Uygulama, paketle gelen yerel Whisper modelini kullanir; transkripsiyon sirasinda internet baglantisi gerekmez.

## Temel komut

PowerShell'i `win-unpacked` klasorunde acip asagidaki komutu calistir:

```powershell
& ".\Caption Studio.exe" --caption-cli "--caption-input=C:\Videolar\kaynak.mp4"
```

Girdi videosunun yaninda otomatik olarak `kaynak-caption-studio` adinda bir cikti klasoru olusturulur. Orijinal video bu klasore kopyalanmaz. Uretilen dosyalar:

- `kaynak-captioned.mp4`: altyazisi videoya islenmis cikti
- `kaynak.srt`: zaman kodlu altyazi
- `kaynak.txt`: duz metin
- `kaynak.ass`: stil ve kelime animasyonlarini koruyan altyazi
- `kaynak.captionstudio`: editor icinde yeniden acilabilen proje

## Buyuk model

`Large v3 Turbo` varsayilan modeldir. Terminal islemi bu modelle calisir. GPU destekleniyorsa editor WebGPU kullanir; terminal islemi ise daha genis bilgisayar uyumlulugu icin paketli q4 CPU motorunu kullanir. Dolayisiyla GPU zorunlu degildir.

## Kayitli preset ile calisma

Uygulama icinde kaydettigin `soru cevap` gibi tum ayar presetleri terminalden isimle okunabilir:

```powershell
& ".\Caption Studio.exe" --caption-cli "--caption-input=C:\Videolar\kaynak.mp4" "--caption-preset-name=soru cevap"
```

## Cikti klasoru belirleme

```powershell
& ".\Caption Studio.exe" --caption-cli "--caption-input=C:\Videolar\kaynak.mp4" "--caption-output-dir=D:\Ciktilar"
```

## Kaydedilmis bir ayari kullanma

Editor icinden daha once kaydettigin bir proje dosyasini (`.captionstudio`) preset olarak verebilirsin. Bu dosyanin altyazi stili, kanvas, transkripsiyon ve export ayarlari yeni videoya uygulanir.

```powershell
& ".\Caption Studio.exe" --caption-cli "--caption-input=C:\Videolar\kaynak.mp4" "--caption-preset=C:\Projeler\soru-cevap.captionstudio"
```

## Sadece altyazi ve proje dosyalari

Video render etmeden SRT, TXT, ASS ve proje dosyasi almak icin:

```powershell
& ".\Caption Studio.exe" --caption-cli "--caption-input=C:\Videolar\kaynak.mp4" --caption-no-video
```

## Onemli notlar

- Bosluk iceren yollarda `--caption-input=...` ve `--caption-output-dir=...` argumaninin tamamini cift tirnak icine al.
- `win-unpacked` klasorunu, ozellikle `resources\\models` klasorunu eksiksiz tasimak gerekir.
- Islem bittiginde terminalde olusan dosyalarin tam yollarini gorursun. Hata olursa terminal penceresini kapatma; hata metni nedenini gosterir.
