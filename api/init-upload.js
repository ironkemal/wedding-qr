const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

function sanitizeName(raw) {
  if (!raw || !raw.trim()) return "misafir";

  const trMap = {
    ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I",
    ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U",
  };

  return raw
    .trim()
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => trMap[ch] || ch)
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 50)
    || "misafir";
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

function buildFileName(guestName, originalName) {
  const clean = sanitizeName(guestName);
  const ext = originalName.includes(".")
    ? "." + originalName.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-") + "_" + [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("-");
  return `${clean}_${ts}_${randomSuffix()}${ext}`;
}

async function getAccessToken() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const { token } = await auth.getAccessToken();
  return token;
}

async function initResumableSession(accessToken, fileName, mimeType, folderId) {
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
  });

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
      },
      body: metadata,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive session error ${res.status}: ${text}`);
  }

  const sessionUrl = res.headers.get("location");
  if (!sessionUrl) throw new Error("Drive did not return a session URL");
  return sessionUrl;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { guestName, originalName, mimeType } = req.body || {};

  if (!originalName || !mimeType) {
    return res.status(400).json({ error: "originalName and mimeType are required" });
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    return res.status(500).json({ error: "Server misconfiguration: missing folder ID" });
  }

  try {
    const accessToken = await getAccessToken();
    const fileName = buildFileName(guestName || "", originalName);
    const sessionUrl = await initResumableSession(accessToken, fileName, mimeType, folderId);
    return res.status(200).json({ sessionUrl, fileName });
  } catch (err) {
    console.error("init-upload error:", err.message);
    return res.status(500).json({ error: "Failed to initiate upload session" });
  }
};
