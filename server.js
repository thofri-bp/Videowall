const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const multer = require("multer");

const execFileAsync = promisify(execFile);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "videowall-admin";
const ADMIN_PASSWORD_FORCE_UPDATE = ["1", "true", "yes", "on"].includes(String(process.env.ADMIN_PASSWORD_FORCE_UPDATE || "").toLowerCase());

const DATA_DIR = path.join(__dirname, "data");
const STATE_DIR = path.join(DATA_DIR, "state");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const MEDIA_FILE = path.join(STATE_DIR, "media.json");
const SETTINGS_FILE = path.join(STATE_DIR, "settings.json");
const ADMIN_FILE = path.join(STATE_DIR, "admin.json");

const sessions = new Map();
const IMAGE_TYPES = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]);
const VIDEO_TYPES = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v"]);
const DOCUMENT_TYPES = new Set([".pdf"]);
const TRANSITIONS = new Set(["fade", "slide", "zoom", "none"]);
const BACKGROUND_TYPES = new Set(["color", "gradient"]);
const DOCUMENT_VIEWS = new Set(["fit-width", "fit-page", "actual-size"]);
const DISPLAY_FITS = new Set(["max", "cover", "stretch", "original", "contain"]);
const DISPLAY_POSITIONS = new Set(["center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"]);

const defaultSettings = {
  imageDuration: 8,
  transition: "fade",
  syncMode: "sync",
  videoFit: "contain",
  background: {
    type: "gradient",
    value: "linear-gradient(135deg, #0f172a 0%, #111827 50%, #1f2937 100%)"
  }
};

let adminState = null;

function ensureDirectories() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

async function ensureStateFiles() {
  await ensureJsonFile(MEDIA_FILE, []);
  await ensureJsonFile(SETTINGS_FILE, defaultSettings);
}

async function ensureJsonFile(filePath, fallback) {
  try {
    await fsp.access(filePath);
  } catch {
    await writeJson(filePath, fallback);
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, config) {
  if (!config?.salt || !config?.hash) return false;
  const candidateHash = crypto.scryptSync(password, config.salt, 64);
  const storedHash = Buffer.from(config.hash, "hex");
  if (candidateHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(candidateHash, storedHash);
}

async function ensureAdminState() {
  const existing = await readJson(ADMIN_FILE, null);

  if (existing?.salt && existing?.hash && !ADMIN_PASSWORD_FORCE_UPDATE) {
    adminState = existing;
    return adminState;
  }

  if (existing?.salt && existing?.hash && ADMIN_PASSWORD_FORCE_UPDATE) {
    console.log("Admin password override requested via ADMIN_PASSWORD_FORCE_UPDATE.");
  }

  const nextState = {
    ...hashPassword(ADMIN_PASSWORD),
    updatedAt: new Date().toISOString()
  };
  await writeJson(ADMIN_FILE, nextState);
  adminState = nextState;

  if (existing?.salt && existing?.hash) {
    console.log("Admin password was updated from environment configuration.");
  } else {
    console.log("Admin password was initialized and stored persistently.");
  }

  return adminState;
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const index = item.indexOf("=");
      if (index === -1) return acc;
      const key = item.slice(0, index);
      const value = decodeURIComponent(item.slice(index + 1));
      acc[key] = value;
      return acc;
    }, {});
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.videowall_admin;
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  session.expiresAt = Date.now() + 1000 * 60 * 60 * 24;
  return true;
}

function requireAuth(req, res, next) {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildStoredFilename(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  return `${Date.now()}-${crypto.randomUUID()}${ext}`;
}

function inferMediaType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_TYPES.has(ext)) return "image";
  if (VIDEO_TYPES.has(ext)) return "video";
  if (DOCUMENT_TYPES.has(ext)) return "document";
  return null;
}

function mediaPublicUrl(filename) {
  return `/uploads/${encodeURIComponent(filename)}`;
}

function comparePageFilenames(a, b) {
  const pageA = Number(path.basename(a, path.extname(a)).split("-").pop()) || 0;
  const pageB = Number(path.basename(b, path.extname(b)).split("-").pop()) || 0;
  return pageA - pageB;
}

async function convertPdfToImages(file) {
  const pdfPath = path.join(UPLOAD_DIR, file.filename);
  const outputPrefix = path.join(UPLOAD_DIR, `${path.basename(file.filename, path.extname(file.filename))}-page`);
  const outputPrefixBase = path.basename(outputPrefix);

  try {
    await execFileAsync("pdftoppm", [
      "-png",
      "-r", "150",
      pdfPath,
      outputPrefix
    ]);

    const generatedFiles = (await fsp.readdir(UPLOAD_DIR))
      .filter((entry) => entry.startsWith(`${outputPrefixBase}-`) && entry.endsWith(".png"))
      .sort(comparePageFilenames);

    if (!generatedFiles.length) {
      throw new Error("PDF konnte nicht in Bilder umgewandelt werden.");
    }

    await fsp.rm(pdfPath, { force: true });
    return generatedFiles;
  } catch (error) {
    const leftovers = (await fsp.readdir(UPLOAD_DIR))
      .filter((entry) => entry.startsWith(`${outputPrefixBase}-`) && entry.endsWith(".png"));

    await Promise.all(leftovers.map((entry) => fsp.rm(path.join(UPLOAD_DIR, entry), { force: true })));
    await fsp.rm(pdfPath, { force: true });
    throw error;
  }
}

function normalizePositiveInteger(value, fallback, max = 100000) {
  const normalized = Math.round(Number(value));
  if (!Number.isFinite(normalized) || normalized < 1) return fallback;
  return Math.min(normalized, max);
}

function normalizeNonNegativeInteger(value, fallback, max = 100000) {
  const normalized = Math.round(Number(value));
  if (!Number.isFinite(normalized) || normalized < 0) return fallback;
  return Math.min(normalized, max);
}

function normalizeDocumentConfig(item = {}, input = {}) {
  const view = DOCUMENT_VIEWS.has(input.documentView) ? input.documentView : (DOCUMENT_VIEWS.has(item.documentView) ? item.documentView : "fit-width");
  const startPage = normalizePositiveInteger(input.documentStartPage ?? item.documentStartPage, 1);
  const rawEndPage = normalizePositiveInteger(input.documentEndPage ?? item.documentEndPage, startPage);
  const endPage = Math.max(startPage, rawEndPage);
  const pageAdvanceSeconds = normalizeNonNegativeInteger(input.documentPageAdvanceSeconds ?? item.documentPageAdvanceSeconds, 0, 3600);
  const durationSeconds = normalizePositiveInteger(input.durationSeconds ?? item.durationSeconds, 8, 3600);

  return {
    documentView: view,
    documentStartPage: startPage,
    documentEndPage: endPage,
    documentPageAdvanceSeconds: pageAdvanceSeconds,
    durationSeconds
  };
}

function normalizeDisplayConfig(item = {}, input = {}) {
  const rawDisplayFit = DISPLAY_FITS.has(input.displayFit) ? input.displayFit : (DISPLAY_FITS.has(item.displayFit) ? item.displayFit : "max");
  const displayFit = rawDisplayFit === "contain" ? "max" : rawDisplayFit;
  const displayScalePercent = normalizePositiveInteger(input.displayScalePercent ?? item.displayScalePercent, 100, 400);
  const displayPosition = DISPLAY_POSITIONS.has(input.displayPosition) ? input.displayPosition : (DISPLAY_POSITIONS.has(item.displayPosition) ? item.displayPosition : "center");
  const videoShowComplete = typeof input.videoShowComplete === "boolean"
    ? input.videoShowComplete
    : Boolean(item.videoShowComplete);
  return {
    displayFit,
    displayScalePercent,
    displayPosition,
    videoShowComplete
  };
}

function getItemDurationSeconds(item, settings) {
  if (item.type === "video") {
    return Math.max(1, Number(item.durationSeconds || 15));
  }

  if (item.type === "document") {
    const config = normalizeDocumentConfig(item, {});
    if (config.documentPageAdvanceSeconds > 0) {
      return Math.max(1, (config.documentEndPage - config.documentStartPage + 1) * config.documentPageAdvanceSeconds);
    }
    return Math.max(1, config.durationSeconds || settings.imageDuration);
  }

  return Math.max(1, Number(settings.imageDuration || 8));
}

async function getMedia() {
  const media = await readJson(MEDIA_FILE, []);
  return media.sort((a, b) => a.order - b.order);
}

async function saveMedia(media) {
  const normalized = media
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));
  await writeJson(MEDIA_FILE, normalized);
  return normalized;
}

async function getSettings() {
  const settings = await readJson(SETTINGS_FILE, defaultSettings);
  return {
    ...defaultSettings,
    ...settings,
    background: {
      ...defaultSettings.background,
      ...(settings.background || {})
    }
  };
}

async function saveSettings(input) {
  const nextSettings = await getSettings();
  if (typeof input.imageDuration === "number" && Number.isFinite(input.imageDuration)) {
    nextSettings.imageDuration = Math.max(1, Math.min(3600, Math.round(input.imageDuration)));
  }
  if (typeof input.transition === "string" && TRANSITIONS.has(input.transition)) {
    nextSettings.transition = input.transition;
  }
  if (typeof input.syncMode === "string" && ["sync", "independent"].includes(input.syncMode)) {
    nextSettings.syncMode = input.syncMode;
  }
  if (typeof input.videoFit === "string" && ["contain", "cover"].includes(input.videoFit)) {
    nextSettings.videoFit = input.videoFit;
  }
  if (input.background && typeof input.background === "object") {
    const type = typeof input.background.type === "string" ? input.background.type : nextSettings.background.type;
    const value = typeof input.background.value === "string" ? input.background.value.trim() : nextSettings.background.value;
    if (BACKGROUND_TYPES.has(type) && value) {
      nextSettings.background = { type, value };
    }
  }
  await writeJson(SETTINGS_FILE, nextSettings);
  return nextSettings;
}

async function getPlaylist() {
  const media = await getMedia();
  return media.filter((item) => item.enabled);
}

async function buildPlaybackSnapshot() {
  const settings = await getSettings();
  const playlist = await getPlaylist();
  const now = Date.now();
  if (playlist.length === 0) {
    return {
      settings,
      playlist,
      currentIndex: -1,
      currentItem: null,
      startedAt: now
    };
  }

  if (settings.syncMode === "independent") {
    return {
      settings,
      playlist,
      currentIndex: 0,
      currentItem: playlist[0],
      startedAt: now
    };
  }

  const cycle = [];
  for (const item of playlist) {
    const durationSeconds = getItemDurationSeconds(item, settings);
    cycle.push(Math.max(1, durationSeconds) * 1000);
  }

  const totalDuration = cycle.reduce((sum, duration) => sum + duration, 0);
  let offset = totalDuration === 0 ? 0 : now % totalDuration;
  let currentIndex = 0;
  for (let i = 0; i < cycle.length; i += 1) {
    if (offset < cycle[i]) {
      currentIndex = i;
      break;
    }
    offset -= cycle[i];
  }

  return {
    settings,
    playlist,
    currentIndex,
    currentItem: playlist[currentIndex],
    startedAt: now - offset
  };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, buildStoredFilename(sanitizeFilename(file.originalname)))
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 250,
    files: 100
  },
  fileFilter: (_req, file, cb) => {
    const type = inferMediaType(file.originalname);
    if (!type) {
      cb(new Error("Unsupported file type"));
      return;
    }
    cb(null, true);
  }
});

app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(UPLOAD_DIR, {
  etag: true,
  lastModified: true,
  maxAge: "1d"
}));
app.use("/static", express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.redirect("/display");
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/index.html"));
});

app.get("/display", (_req, res) => {
  res.sendFile(path.join(__dirname, "public/display/index.html"));
});

app.get("/api/session", (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

app.post("/api/login", async (req, res) => {
  const { password } = req.body || {};
  if (!verifyPassword(password || "", adminState)) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  const token = crypto.randomUUID();
  sessions.set(token, { expiresAt: Date.now() + 1000 * 60 * 60 * 24 });
  res.setHeader("Set-Cookie", `videowall_admin=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400`);
  res.json({ ok: true });
});

app.post("/api/logout", requireAuth, (_req, res) => {
  const cookies = parseCookies(_req.headers.cookie);
  const token = cookies.videowall_admin;
  if (token) {
    sessions.delete(token);
  }
  res.setHeader("Set-Cookie", "videowall_admin=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0");
  res.json({ ok: true });
});

app.post("/api/admin/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!verifyPassword(currentPassword || "", adminState)) {
    res.status(400).json({ error: "Aktuelles Passwort ist falsch." });
    return;
  }

  if (typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ error: "Das neue Passwort muss mindestens 6 Zeichen lang sein." });
    return;
  }

  adminState = {
    ...hashPassword(newPassword),
    updatedAt: new Date().toISOString()
  };
  await writeJson(ADMIN_FILE, adminState);
  res.json({ ok: true });
});

app.get("/api/settings", async (_req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

app.post("/api/settings", requireAuth, async (req, res) => {
  const settings = await saveSettings(req.body || {});
  res.json(settings);
});

app.get("/api/media", async (_req, res) => {
  const media = await getMedia();
  res.json(media.map((item) => ({ ...item, url: mediaPublicUrl(item.filename) })));
});

app.post("/api/media", requireAuth, upload.array("files", 100), async (req, res) => {
  const files = req.files || [];
  const media = await getMedia();
  let metadata = {};
  try {
    metadata = req.body?.metadata ? JSON.parse(req.body.metadata) : {};
  } catch {
    metadata = {};
  }
  let order = media.length;

  for (const file of files) {
    const type = inferMediaType(file.originalname || file.filename);
    if (!type) continue;
    const perFileMetadata = metadata[file.originalname] || {};

    if (type === "document") {
      const generatedFiles = await convertPdfToImages(file);
      const baseName = path.basename(file.originalname, path.extname(file.originalname));

      for (let pageIndex = 0; pageIndex < generatedFiles.length; pageIndex += 1) {
        media.push({
          id: crypto.randomUUID(),
          type: "image",
          filename: generatedFiles[pageIndex],
          originalName: `${baseName} - Seite ${pageIndex + 1}`,
          order,
          enabled: true,
          rotation: 0,
          displayFit: "max",
          displayScalePercent: 100,
          displayPosition: "center",
          videoShowComplete: false,
          durationSeconds: null,
          documentView: null,
          documentStartPage: null,
          documentEndPage: null,
          documentPageAdvanceSeconds: null,
          createdAt: new Date().toISOString()
        });
        order += 1;
      }
      continue;
    }

    media.push({
      id: crypto.randomUUID(),
      type,
      filename: file.filename,
      originalName: file.originalname,
      order,
      enabled: true,
      rotation: 0,
      displayFit: type === "image" || type === "video" ? "max" : null,
      displayScalePercent: type === "image" || type === "video" ? 100 : null,
      displayPosition: type === "image" || type === "video" ? "center" : null,
      videoShowComplete: type === "video" ? false : null,
      durationSeconds: type === "video" ? Math.max(1, Number(perFileMetadata.durationSeconds || 15)) : (type === "document" ? 8 : null),
      documentView: type === "document" ? "fit-width" : null,
      documentStartPage: type === "document" ? 1 : null,
      documentEndPage: type === "document" ? 1 : null,
      documentPageAdvanceSeconds: type === "document" ? 0 : null,
      createdAt: new Date().toISOString()
    });
    order += 1;
  }

  const saved = await saveMedia(media);
  res.status(201).json(saved.map((item) => ({ ...item, url: mediaPublicUrl(item.filename) })));
});

app.patch("/api/media/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const media = await getMedia();
  const item = media.find((entry) => entry.id === id);
  if (!item) {
    res.status(404).json({ error: "Media item not found" });
    return;
  }

  const { enabled, rotation, order } = req.body || {};
  if (typeof enabled === "boolean") {
    item.enabled = enabled;
  }
  if (typeof rotation === "number" && Number.isFinite(rotation)) {
    const normalized = ((Math.round(rotation) % 360) + 360) % 360;
    item.rotation = normalized;
  }
  if (item.type === "image" || item.type === "video") {
    Object.assign(item, normalizeDisplayConfig(item, req.body || {}));
  }
  if (item.type === "video" && typeof req.body?.durationSeconds === "number" && Number.isFinite(req.body.durationSeconds)) {
    item.durationSeconds = Math.max(1, req.body.durationSeconds);
  }
  if (item.type === "document") {
    Object.assign(item, normalizeDocumentConfig(item, req.body || {}));
  }
  if (typeof order === "number" && Number.isFinite(order)) {
    const target = Math.max(0, Math.min(media.length - 1, Math.round(order)));
    const currentIndex = media.findIndex((entry) => entry.id === id);
    const [moved] = media.splice(currentIndex, 1);
    media.splice(target, 0, moved);
  }

  const saved = await saveMedia(media);
  const updated = saved.find((entry) => entry.id === id);
  res.json({ ...updated, url: mediaPublicUrl(updated.filename) });
});

app.post("/api/media/reorder", requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const media = await getMedia();
  if (ids.length !== media.length) {
    res.status(400).json({ error: "Reorder payload must include all media ids" });
    return;
  }

  const byId = new Map(media.map((item) => [item.id, item]));
  const reordered = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) {
      res.status(400).json({ error: `Unknown media id: ${id}` });
      return;
    }
    reordered.push(item);
  }

  const saved = await saveMedia(reordered);
  res.json(saved.map((item) => ({ ...item, url: mediaPublicUrl(item.filename) })));
});

app.delete("/api/media/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const media = await getMedia();
  const index = media.findIndex((entry) => entry.id === id);
  if (index === -1) {
    res.status(404).json({ error: "Media item not found" });
    return;
  }

  const [removed] = media.splice(index, 1);
  await saveMedia(media);
  await fsp.rm(path.join(UPLOAD_DIR, removed.filename), { force: true });
  res.json({ ok: true });
});

app.delete("/api/media", requireAuth, async (_req, res) => {
  const media = await getMedia();
  await saveMedia([]);

  await Promise.all(
    media.map((item) => fsp.rm(path.join(UPLOAD_DIR, item.filename), { force: true }))
  );

  res.json({ ok: true, deleted: media.length });
});

app.get("/api/playback", async (_req, res) => {
  const snapshot = await buildPlaybackSnapshot();
  res.json({
    ...snapshot,
    playlist: snapshot.playlist.map((item) => ({ ...item, url: mediaPublicUrl(item.filename) })),
    currentItem: snapshot.currentItem ? { ...snapshot.currentItem, url: mediaPublicUrl(snapshot.currentItem.filename) } : null
  });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "Eine Datei ist zu gross. Maximal 250 MB pro Datei sind erlaubt." });
      return;
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      res.status(400).json({ error: "Zu viele Dateien in einem Upload-Paket. Bitte kleinere Pakete verwenden." });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  if (err) {
    res.status(400).json({ error: err.message || "Request failed" });
    return;
  }
  res.status(500).json({ error: "Unexpected server error" });
});

async function start() {
  ensureDirectories();
  await ensureStateFiles();
  await ensureAdminState();
  app.listen(PORT, HOST, () => {
    console.log(`VideoWall server listening on http://${HOST}:${PORT}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
