# Düğün Fotoğraf Yükleme Sistemi

Misafirler QR kodu okutarak fotoğraf ve videolarını doğrudan Google Drive'ına yükleyebilir. Sunucu yok, veritabanı yok, ücretli servis yok.

---

## Kurulum Adımları

### 1. Google Cloud Console — Proje ve Drive API

1. [console.cloud.google.com](https://console.cloud.google.com) adresine git.
2. Sol üstten **Yeni Proje** oluştur (örn. `dugun-foto`).
3. Sol menüden **API ve Hizmetler → Kitaplık** → `Google Drive API` → **Etkinleştir**.

---

### 2. OAuth İzin Ekranı

1. **API ve Hizmetler → OAuth izin ekranı** → **Dış** seç → **Oluştur**.
2. Uygulama adı yaz (örn. `Düğün Foto`), kendi mail adresini gir.
3. **Kapsam ekle** → `https://www.googleapis.com/auth/drive.file` ekle.
4. **Test kullanıcıları** bölümüne kendi Gmail adresini ekle.
5. Kaydet.

---

### 3. OAuth Client ID Oluştur

1. **API ve Hizmetler → Kimlik Bilgileri → Kimlik Bilgisi Oluştur → OAuth istemci kimliği**.
2. Uygulama türü: **Web uygulaması**.
3. **Yetkili yönlendirme URI'leri** kısmına şunu ekle:
   ```
   http://localhost:3333/callback
   ```
4. **Oluştur** → `Client ID` ve `Client Secret`'ı kopyala.

---

### 4. Refresh Token Al (tek seferlik)

Terminalde proje klasöründeyken:

```bash
# Bağımlılıkları yükle
npm install

# Windows PowerShell
$env:GOOGLE_CLIENT_ID="BURAYA_CLIENT_ID"; $env:GOOGLE_CLIENT_SECRET="BURAYA_SECRET"; node scripts/get-refresh-token.js

# macOS / Linux
GOOGLE_CLIENT_ID="BURAYA_CLIENT_ID" GOOGLE_CLIENT_SECRET="BURAYA_SECRET" node scripts/get-refresh-token.js
```

Script bir URL yazdıracak. URL'yi tarayıcıda aç, kendi Google hesabınla giriş yap, izin ver.
Terminalde **REFRESH TOKEN** yazdırılacak — kopyala, güvende sakla.

---

### 5. Google Drive — Klasör Oluştur

1. [drive.google.com](https://drive.google.com) adresine git.
2. Yeni klasör oluştur: `Düğün` (veya istediğin isim).
3. Klasörü aç, adres çubuğundaki URL'den ID'yi kopyala:
   ```
   https://drive.google.com/drive/folders/  →  BURASI_KLASOR_ID
   ```

---

### 6. Vercel'e Deploy

1. Bu klasörü GitHub'a yükle (private repo önerilir).
2. [vercel.com](https://vercel.com) → **Add New Project** → repo'yu seç.
3. Ayarları değiştirme, direkt **Deploy**.

---

### 7. Environment Variables

Vercel'de proje sayfasından **Settings → Environment Variables** bölümüne gir.
Şu dört değişkeni ekle (Production + Preview + Development hepsi işaretli olsun):

| Değişken | Değer |
|---|---|
| `GOOGLE_CLIENT_ID` | Cloud Console'dan aldığın Client ID |
| `GOOGLE_CLIENT_SECRET` | Cloud Console'dan aldığın Secret |
| `GOOGLE_REFRESH_TOKEN` | 4. adımda aldığın refresh token |
| `GOOGLE_DRIVE_FOLDER_ID` | 5. adımda kopyaladığın klasör ID'si |

Değişkenleri ekledikten sonra **Redeploy** yap (Settings → Deployments → en son deploy → Redeploy).

---

### 8. Test Et

**Küçük fotoğrafla test (önce bunu yap):**

1. Vercel'in verdiği URL'yi aç (örn. `https://dugun-foto.vercel.app`).
2. Ad yaz, telefon galerisinden küçük bir fotoğraf seç, **Yükle**.
3. Drive'daki `Düğün` klasörünü aç — dosya düşmüş olmalı.
4. Dosya adı formatını kontrol et: `ahmet_2026-08-15_14-32-07_a8f3.jpg`

**Büyük videoyla test:**
1. Aynı sayfadan 50–100 MB'lık bir video yükle.
2. İlerleme çubuğunun çalıştığını doğrula.
3. Drive'da göründüğünü teyit et.

---

### 9. QR Kod Oluştur

Sayfanın URL'ini (örn. `https://dugun-foto.vercel.app`) herhangi bir QR generator'a yapıştır:
- [qr-code-generator.com](https://www.qr-code-generator.com)
- [qrcode-monkey.com](https://www.qrcode-monkey.com)

QR'ı yüksek çözünürlüklü PNG olarak indir, masa kartına bastır.

---

## Dosya İsimlendirme

```
{temiz_ad}_{tarih}_{saat}_{rastgele}.{uzantı}
örnek: ahmet_2026-08-15_14-32-07_a8f3.jpg
```

- İsim sanitizasyonu: Türkçe karakter → ASCII, boşluk → `_`, özel karakter/emoji → kaldırılır
- Ad girilmezse `misafir` kullanılır
- 4 karakterlik rastgele ek çakışmayı önler

---

## Mimari

```
Tarayıcı
  │ 1) POST /api/init-upload  {guestName, originalName, mimeType}
  ▼
Vercel Fonksiyon
  │ 2) Refresh token → access token → Drive resumable session başlat → sessionUrl dön
  ▼
Tarayıcı
  │ 3) PUT sessionUrl  (dosya baytları doğrudan, Authorization header YOK)
  ▼
Google Drive ✓
```

Dosya baytları Vercel fonksiyonundan geçmez — timeout ve boyut limiti sorunu yoktur.

---

## Sorun Giderme

**"Server misconfiguration" hatası** → Vercel'de environment variable eksik. Redeploy yap.

**Drive'da dosya görünmüyor** → Klasör ID'sini kontrol et. Klasörün sahibi senin hesabın olmalı.

**Refresh token çalışmıyor** → `get-refresh-token.js` scriptini tekrar çalıştır ve yeni token'ı Vercel'e gir.

**Büyük video yükleme takılıyor** → Tarayıcı konsolu (F12) hatayı gösterir. CORS değil network problemi ise internet bağlantısını kontrol et.
