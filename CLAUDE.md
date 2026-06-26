# Düğün Fotoğraf Yükleme Sistemi — Proje Brief'i

QR kod ile düğün misafirlerinin çektikleri fotoğraf/videoları doğrudan benim Google Drive'ıma yükleyebilecekleri basit bir web sistemi. Sunucu (VPS) yok, veritabanı yok, ücretli servis yok. Hepsi ücretsiz katmanlarda çalışacak.

---

## 1. Amaç

Açık hava düğününde her masaya bir QR kod konacak. Misafir QR'ı telefon kamerasıyla okutunca tarayıcıda bir yükleme sayfası açılacak. Misafir adını yazıp fotoğraf/video seçecek, "yükle" diyecek, bitti. Dosyalar benim Google Drive'ımdaki bir klasöre düşecek, dosya adında misafirin adı olacak.

**Misafirin yaptığı tek iş: QR okut → ad yaz → dosya seç → yükle.** Uygulama indirme yok, kayıt yok, şifre yok.

Bu sistem TEK BİR düğün için, kişisel kullanım. Ürünleştirme, çoklu kullanıcı, ödeme gibi şeyler KAPSAM DIŞI.

---

## 2. Kullanıcı akışı (misafir gözünden)

1. Masadaki QR'ı telefon kamerasıyla okutur.
2. Tarayıcıda yükleme sayfası açılır.
3. "Adınız" kutusuna adını yazar (örn. Ahmet).
4. Fotoğraf/video seçer (birden fazla seçebilmeli, telefon galerisi/kamerası açılmalı).
5. "Yükle" butonuna basar.
6. Yükleme ilerleme çubuğu görür, bitince "Yüklendi ✓" mesajı görür.
7. İsterse tekrar yükleyebilir.

---

## 3. Sistem mimarisi

Üç bileşen var:

### A. Yükleme sayfası (statik frontend)
Misafirin gördüğü tek sayfa. Saf HTML/CSS/JS yeter, framework şart değil ama Next.js içinde de olabilir.
İçinde: ad input'u, `<input type="file" accept="image/*,video/*" multiple>`, yükle butonu, ilerleme göstergesi.

### B. Aracı fonksiyon (serverless — "kapıcı")
Drive'a yazma yetkisini (gizli token) saklayan katman. Tarayıcıya asla token vermez.
**Önemli:** Bu fonksiyon dosya baytlarını İÇİNDEN GEÇİRMEZ. Sadece şunu yapar:
- Tarayıcıdan "şu isimde, şu tipte bir dosya yükleyeceğim, misafir adı: Ahmet" bilgisini alır.
- Adı temizler, son dosya adını üretir.
- Refresh token ile Drive'da bir **resumable upload session** başlatır.
- Session URL'ini tarayıcıya geri verir.

### C. Depolama: Google Drive
Önceden açılmış bir "Düğün" klasörü. Tüm dosyalar buraya düşer. Ayrı veritabanı YOK — dosya adındaki `isim + zaman` zaten kayıt görevi görüyor.

### Veri akışı
```
Misafir tarayıcısı
   │  1) "Ahmet, video.mp4 yükleyeceğim" (sadece bilgi, dosya değil)
   ▼
Aracı fonksiyon (kapıcı)
   │  2) Drive'da resumable session başlatır, session URL döner
   ▼
Misafir tarayıcısı
   │  3) Dosya baytlarını DOĞRUDAN session URL'ine yükler (fonksiyondan geçmez)
   ▼
Google Drive  ✓
```

Bu tasarımın sebebi: dosya baytları fonksiyondan geçmediği için serverless boyut limiti (Vercel'de ~4.5MB) ve timeout sorunu hiç oluşmaz. 200MB'lık videolar bile doğrudan Google'a gider.

---

## 4. Teknoloji seçimleri

- **Hosting + fonksiyon:** Vercel (Hobby / ücretsiz). Statik sayfa + serverless API route'u tek repo, tek deploy, tek domain'de yaşar — CORS derdini de azaltır. (Alternatif: Cloudflare Pages + Workers.)
- **Drive erişimi:** Google Drive API v3 + OAuth 2.0 **refresh token** (kendi Google hesabımla).
- **QR:** Herhangi bir online QR generator, sayfanın linkini bir kere QR'a çevirip masa kartına basacağım. Koda gerek yok.
- **Veritabanı:** YOK.
- **Domain (opsiyonel):** `dugun.infinitymade.de` subdomain'i bağlanabilir; olmazsa Vercel'in verdiği `*.vercel.app` adresi de çalışır.

---

## 5. Dosya isimlendirme kuralı

Format:
```
{temiz_ad}_{zaman_damgasi}_{rastgele}.{uzanti}
örnek: ahmet_2026-08-15_14-32-07_a8f3.jpg
```

- **temiz_ad:** misafirin yazdığı isim, sanitize edilmiş (aşağıya bak)
- **zaman_damgasi:** yükleme anı (sıralama için)
- **rastgele:** 4 karakterlik kısa rastgele ek (çakışmayı imkânsız kılar)
- İsimlendirme MUTLAKA fonksiyon tarafında yapılır, frontend'e güvenilmez.

İsteğe bağlı alternatif: her misafir için Drive'da ayrı alt klasör. Ama bu sürümde tek klasör + isimli dosya tercih ediliyor (daha basit, her şey toplu).

---

## 6. KRİTİK TEKNİK NOKTALAR (bunları atlama)

Bu beş madde işin kırıldığı yerler. Peşinen dikkate al:

1. **OAuth refresh token kullan, service account DEĞİL.** Service account ile kişisel Drive'a yazınca dosyaların sahibi ben olmuyorum ve depolama kotam kullanılmıyor (avantaj gidiyor). OAuth refresh token ile yazınca dosyalar bana ait olur, benim alanımı kullanır. Token koda gömülmez, environment variable olarak saklanır.

2. **Resumable upload + doğrudan tarayıcıdan yükleme.** Dosya baytları fonksiyondan geçmemeli. Fonksiyon sadece resumable session başlatıp URL döndürmeli, tarayıcı baytları o URL'e doğrudan PUT etmeli. Normal (multipart) upload kullanılırsa videolar timeout/limit yüzünden düşer.

3. **Session URL'inde CORS, en olası takılma noktası.** Tarayıcı Drive'ın resumable session URL'ine doğrudan yüklerken CORS preflight sorunu çıkabilir. Bunu önce küçük bir dosyayla test et. Eğer çözülemezse fallback: küçük fotoğrafları fonksiyon üzerinden geçir, sadece büyük videolar için doğrudan yükleme yap. Ama önce doğrudan yükleme yolu denenmeli.

4. **İsim sanitizasyonu.** Misafir "Ahmet Öztürk 😎" yazabilir. Fonksiyon: boşluk→alt çizgi, Türkçe karakter dönüşümü (ö→o, ç→c, ş→s, ı→i, ğ→g, ü→u), emoji ve özel karakterleri at. Boş ad gelirse "misafir" gibi varsayılan kullan.

5. **Dosya adı çakışması.** Aynı isim + sıra numarası YETMEZ (iki Ahmet üst üste yazar). Mutlaka zaman damgası + rastgele ek ekle.

---

## 7. Kurulum sırası

1. Google Cloud Console'da yeni proje aç, **Drive API'yi etkinleştir**.
2. **OAuth consent screen** kur (External, test kullanıcısı olarak kendi mailimi ekle).
3. **OAuth client** oluştur (Web application), Client ID + Client Secret al.
4. Bir kerelik OAuth akışıyla **refresh token** al (offline access + Drive scope).
5. Drive'da "Düğün" klasörü aç, **klasör ID'sini** al.
6. Vercel projesini kur: statik sayfa + API route (fonksiyon).
7. Environment variable olarak ekle: Client ID, Client Secret, Refresh Token, Klasör ID.
8. Deploy et, küçük bir fotoğrafla test et, sonra büyük bir videoyla test et.
9. Çalışan sayfanın URL'ini QR'a çevir, masa kartına bas.

---

## 8. Kapsam dışı (yapma)

- Veritabanı, kullanıcı hesabı, login sistemi
- Çoklu düğün / çoklu kullanıcı / ödeme
- Galeri görüntüleme sayfası (şimdilik gerekmez, Drive'dan bakacağım — istersem sonra eklenir)
- Offline çalışma (düğünde internet olacağı varsayılıyor)
- Aşırı tasarım; sade, hızlı, telefonda düzgün açılan bir sayfa yeter
