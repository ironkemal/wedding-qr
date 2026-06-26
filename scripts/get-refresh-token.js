/**
 * Tek seferlik çalıştır: node scripts/get-refresh-token.js
 * GOOGLE_CLIENT_ID ve GOOGLE_CLIENT_SECRET ortam değişkeni olarak verilmeli.
 *
 * Örnek:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-refresh-token.js
 *
 * Windows PowerShell:
 *   $env:GOOGLE_CLIENT_ID="xxx"; $env:GOOGLE_CLIENT_SECRET="yyy"; node scripts/get-refresh-token.js
 */

const { google } = require("googleapis");
const http = require("http");
const { URL } = require("url");

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = "http://localhost:3333/callback";
const SCOPES        = ["https://www.googleapis.com/auth/drive.file"];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "\nHata: GOOGLE_CLIENT_ID ve GOOGLE_CLIENT_SECRET ortam değişkenleri gerekli.\n" +
    "Örnek kullanım:\n" +
    "  GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-refresh-token.js\n"
  );
  process.exit(1);
}

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = auth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",        // her seferinde refresh token vermesini zorunlu kıl
  scope: SCOPES,
});

console.log("\n=== Google Drive Refresh Token Alma ===\n");
console.log("1. Aşağıdaki URL'yi tarayıcında aç:\n");
console.log("   " + authUrl + "\n");
console.log("2. Google hesabınla giriş yap ve izin ver.");
console.log("3. Yönlendirme sonrası bu script token'ı yazdıracak.\n");
console.log("Bekleniyor (localhost:3333)...\n");

// Google Cloud Console'da redirect URI olarak http://localhost:3333/callback eklenmiş olmalı
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/callback")) return;

  const url  = new URL(req.url, "http://localhost:3333");
  const code = url.searchParams.get("code");
  const err  = url.searchParams.get("error");

  if (err) {
    res.end("Hata: " + err);
    console.error("\nGoogle izin vermedi:", err);
    server.close();
    return;
  }

  if (!code) {
    res.end("Kod bulunamadı.");
    server.close();
    return;
  }

  try {
    const { tokens } = await auth.getToken(code);
    res.end("<h2>Token alındı! Bu sekmeyi kapatabilirsin.</h2>");

    console.log("=== REFRESH TOKEN ===\n");
    console.log(tokens.refresh_token);
    console.log("\n====================");
    console.log("\nBu token'ı Vercel'de GOOGLE_REFRESH_TOKEN ortam değişkeni olarak ekle.");
    console.log("Token'ı güvende tut, paylaşma.\n");
  } catch (e) {
    res.end("Token alınamadı: " + e.message);
    console.error("\nToken alınamadı:", e.message);
  }

  server.close();
});

server.listen(3333);
