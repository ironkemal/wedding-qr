const { google } = require("googleapis");

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function sanitizeName(raw) {
  if (!raw || !raw.trim()) return "misafir";
  const trMap = {
    ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I",
    ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U",
  };
  return raw.trim()
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => trMap[ch] || ch)
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 50) || "misafir";
}

function buildFileName(guestName, originalName) {
  const clean = sanitizeName(guestName);
  const ext = originalName.includes(".")
    ? "." + originalName.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
  const now = new Date();
  const ts =
    [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-") +
    "_" +
    [String(now.getHours()).padStart(2, "0"), String(now.getMinutes()).padStart(2, "0"), String(now.getSeconds()).padStart(2, "0")].join("-");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${clean}_${ts}_${rand}${ext}`;
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

async function createDriveSession(accessToken, fileName, mimeType, totalSize, folderId) {
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(totalSize),
      },
      body: JSON.stringify({ name: fileName, parents: [folderId] }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive session error ${res.status}: ${text}`);
  }
  const sessionUrl = res.headers.get("location");
  if (!sessionUrl) throw new Error("Drive did not return session URL");
  return sessionUrl;
}

async function sendChunkToDrive(sessionUrl, chunk, start, total, mimeType) {
  const end = start + chunk.length - 1;
  const res = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(chunk.length),
    },
    body: chunk,
    duplex: "half",
  });
  // 308 = Resume Incomplete (more chunks), 200/201 = done
  if (res.status !== 308 && res.status !== 200 && res.status !== 201) {
    const text = await res.text();
    throw new Error(`Drive chunk error ${res.status}: ${text}`);
  }
  return res.status;
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    req.on("data", (d) => parts.push(d));
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const guestName   = decodeURIComponent(req.headers["x-guest-name"]  || "");
    const originalName = decodeURIComponent(req.headers["x-file-name"]  || "upload");
    const mimeType    = req.headers["x-file-type"] || "application/octet-stream";
    const rangeHeader = req.headers["x-content-range"] || "";
    const driveSession = req.headers["x-drive-session"]
      ? Buffer.from(req.headers["x-drive-session"], "base64").toString("utf8")
      : "";
    const driveFileName = req.headers["x-drive-filename"]
      ? decodeURIComponent(req.headers["x-drive-filename"])
      : "";

    const match = rangeHeader.match(/bytes (\d+)-(\d+)\/(\d+)/);
    if (!match) return res.status(400).json({ error: "Missing X-Content-Range header" });

    const start = parseInt(match[1]);
    const total = parseInt(match[3]);

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) return res.status(500).json({ error: "Server misconfiguration" });

    const chunk = await getRawBody(req);

    let sessionUrl  = driveSession;
    let fileName    = driveFileName;

    if (!sessionUrl) {
      // First chunk: create Drive resumable session
      const accessToken = await getAccessToken();
      fileName   = buildFileName(guestName, originalName);
      sessionUrl = await createDriveSession(accessToken, fileName, mimeType, total, folderId);
    }

    const status = await sendChunkToDrive(sessionUrl, chunk, start, total, mimeType);

    if (status === 308) {
      return res.status(200).json({
        sessionUrl: Buffer.from(sessionUrl).toString("base64"),
        fileName: encodeURIComponent(fileName),
        uploaded: start + chunk.length,
      });
    }

    // 200 or 201: upload complete
    return res.status(200).json({ done: true, fileName });

  } catch (err) {
    console.error("upload error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
