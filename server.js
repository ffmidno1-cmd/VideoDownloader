/**
 * VideoDownloader - Express Backend Server
 *
 * Requirements:
 *   1. Node.js 16+
 *   2. yt-dlp   →  pip3 install yt-dlp
 *   3. ffmpeg   →  sudo apt install ffmpeg  |  brew install ffmpeg  |  winget install ffmpeg
 *
 * Run:  node server.js
 */

const express = require("express");
const cors    = require("cors");
const { execFile, execFileSync, spawn } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const os   = require("os");
const fs   = require("fs");

const execFileAsync = promisify(execFile);
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Auto-detect yt-dlp binary ─────────────────────────────────────────────────
function findBinary(name) {
  // 1. User override via env var
  if (name === "ytdlp" && process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  if (name === "ffmpeg" && process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  const candidates = name === "ytdlp"
    ? ["yt-dlp", "/usr/local/bin/yt-dlp", "/usr/bin/yt-dlp",
       `${os.homedir()}/.local/bin/yt-dlp`,
       "C:\\Python311\\Scripts\\yt-dlp.exe",
       "C:\\Users\\%USERNAME%\\AppData\\Roaming\\Python\\Python311\\Scripts\\yt-dlp.exe"]
    : ["ffmpeg", "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg",
       "/nix/store/hm5p1jkyrqp2jinklggxv8q7qg1glf03-replit-runtime-path/bin/ffmpeg"];

  for (const c of candidates) {
    try { execFileSync(c, ["--version"], { stdio: "ignore", timeout: 3000 }); return c; } catch {}
  }
  return null;
}

const YTDLP  = findBinary("ytdlp");
const FFMPEG = findBinary("ffmpeg");

// ── Startup check ─────────────────────────────────────────────────────────────
console.log("\n=== VideoDownloader Startup Check ===");
if (YTDLP)  { console.log("✓ yt-dlp  found:", YTDLP); }
else        { console.error("✗ yt-dlp NOT FOUND  →  Install: pip3 install yt-dlp"); }
if (FFMPEG) { console.log("✓ ffmpeg  found:", FFMPEG); }
else        { console.warn("⚠ ffmpeg NOT FOUND  →  Install: sudo apt install ffmpeg | brew install ffmpeg"); }
console.log("=====================================\n");

// ── Quality definitions ───────────────────────────────────────────────────────
const QUALITY_MAP = {
  "1080p":   { formatStr: "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]", ext: "mp4", type: "video", label: "1080p HD" },
  "720p":    { formatStr: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]",   ext: "mp4", type: "video", label: "720p HD" },
  "480p":    { formatStr: "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]",   ext: "mp4", type: "video", label: "480p SD" },
  "360p":    { formatStr: "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360]",   ext: "mp4", type: "video", label: "360p SD" },
  "144p":    { formatStr: "bestvideo[height<=144][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=144]+bestaudio/best[height<=144]",   ext: "mp4", type: "video", label: "144p Low" },
  "mp3-320": { formatStr: "bestaudio[ext=m4a]/bestaudio",  ext: "mp3", type: "audio", label: "MP3 320kbps" },
  "mp3-128": { formatStr: "worstaudio[ext=m4a]/worstaudio", ext: "mp3", type: "audio", label: "MP3 128kbps" },
};

function sanitizeUrl(url) {
  try {
    const h = new URL(url).hostname;
    return ["youtube.com","youtu.be","facebook.com","fb.watch","instagram.com","twitter.com","x.com","tiktok.com"].some(d => h.endsWith(d));
  } catch { return false; }
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── GET /api/status  (health + dependency check) ──────────────────────────────
app.get("/api/status", (_, res) => {
  res.json({ ytdlp: !!YTDLP, ffmpeg: !!FFMPEG, ytdlpPath: YTDLP, ffmpegPath: FFMPEG });
});

// ── GET /api/download/info ────────────────────────────────────────────────────
app.get("/api/download/info", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL is required" });
  if (!sanitizeUrl(url)) return res.status(400).json({ error: "Unsupported URL. Use YouTube, Facebook, Instagram, Twitter, or TikTok links." });
  if (!YTDLP) return res.status(500).json({ error: "yt-dlp is not installed on this server. Run: pip3 install yt-dlp" });

  try {
    const args = ["--no-playlist", "--no-warnings", "--no-cache-dir", "-J", url];
    const { stdout } = await execFileAsync(YTDLP, args, { timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
    const data = JSON.parse(stdout);
    const formats = data.formats || [];

    const heights = new Set(formats.filter(f => f.vcodec && f.vcodec !== "none" && f.height).map(f => f.height));
    const hasAudio = formats.some(f => f.acodec && f.acodec !== "none");

    const videoOptions = ["1080p","720p","480p","360p","144p"].filter(q => {
      const h = parseInt(q);
      return Array.from(heights).some(v => v <= h && v >= h * 0.4);
    }).map(q => ({ quality: q, label: QUALITY_MAP[q].label, format: "MP4", hasAudio }));

    const audioOptions = hasAudio
      ? [{ quality: "mp3-320", label: "MP3 320kbps", format: "MP3" }, { quality: "mp3-128", label: "MP3 128kbps", format: "MP3" }]
      : [];

    return res.json({ title: data.title || "Video", thumbnail: data.thumbnail || "", duration: data.duration, extractor: (data.extractor_key||"").toLowerCase(), videoOptions, audioOptions });
  } catch (err) {
    console.error("[info] yt-dlp error:", err.message, err.stderr || "");
    const stderr = String(err.stderr || err.message || "");
    const msg = stderr.includes("Unsupported URL") ? "This URL is not supported."
              : stderr.includes("Private")         ? "This video is private."
              : stderr.includes("unavailable")     ? "This video is unavailable."
              : "Could not fetch video info. Check the URL and try again.";
    return res.status(422).json({ error: msg });
  }
});

// ── GET /api/download/file ────────────────────────────────────────────────────
app.get("/api/download/file", (req, res) => {
  const { url, quality } = req.query;
  if (!url || !quality)  return res.status(400).json({ error: "url and quality are required" });
  if (!sanitizeUrl(url)) return res.status(400).json({ error: "Unsupported URL" });
  if (!YTDLP)            return res.status(500).json({ error: "yt-dlp is not installed" });

  const qmap = QUALITY_MAP[quality];
  if (!qmap) return res.status(400).json({ error: "Invalid quality: " + quality });

  const isAudio = qmap.type === "audio";
  const tmpBase = path.join(os.tmpdir(), `vdl_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tmpFile = `${tmpBase}.${qmap.ext}`;

  const args = [
    "--no-playlist", "--no-warnings", "--no-cache-dir",
    "-f", qmap.formatStr,
  ];

  if (FFMPEG) args.push("--ffmpeg-location", FFMPEG);

  if (isAudio) {
    args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", quality === "mp3-320" ? "0" : "5");
  } else {
    args.push("--merge-output-format", "mp4");
  }

  args.push("-o", tmpFile, url);

  console.log(`[download] Starting: ${quality}  url=${url.slice(0,60)}`);
  console.log(`[download] yt-dlp args: ${args.join(" ")}`);

  const proc = spawn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });

  let errBuf = "";
  proc.stderr?.on("data", d => {
    const line = d.toString().trim();
    if (line) { process.stdout.write(`  ${line}\n`); errBuf += line + "\n"; }
  });

  proc.on("close", code => {
    // yt-dlp sometimes outputs with a different extension — find the actual file
    const actualFile = fs.existsSync(tmpFile) ? tmpFile
      : [`${tmpBase}.mp4`, `${tmpBase}.mp3`, `${tmpBase}.webm`, `${tmpBase}.mkv`].find(f => fs.existsSync(f));

    if (code !== 0 || !actualFile) {
      console.error(`[download] FAILED (code=${code})\n${errBuf}`);
      if (!res.headersSent) {
        res.status(500).json({ error: "Download failed. " + (errBuf.includes("unavailable") ? "Video is unavailable." : "Check server logs.") });
      }
      return;
    }

    const stat = fs.statSync(actualFile);
    const ext  = path.extname(actualFile).slice(1) || qmap.ext;
    console.log(`[download] Done! Serving ${actualFile} (${Math.round(stat.size / 1024)}KB)`);

    res.setHeader("Content-Type",        isAudio ? "audio/mpeg" : "video/mp4");
    res.setHeader("Content-Length",      stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="video.${ext}"`);
    res.setHeader("Cache-Control",       "no-store");

    const stream = fs.createReadStream(actualFile);
    stream.pipe(res);
    stream.on("close", () => fs.unlink(actualFile, () => {}));
    stream.on("error", err => {
      console.error("[download] Stream error:", err.message);
      if (!res.headersSent) res.status(500).json({ error: "Stream error" });
      fs.unlink(actualFile, () => {});
    });
  });

  proc.on("error", err => {
    console.error("[download] Spawn error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: "Could not start yt-dlp: " + err.message });
    fs.unlink(tmpFile, () => {});
  });

  req.on("close", () => { proc.kill("SIGTERM"); setTimeout(() => fs.unlink(tmpFile, () => {}), 1000); });
});

// ── Fallback → serve frontend ─────────────────────────────────────────────────
app.get("*", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`VideoDownloader running at http://localhost:${PORT}\n`);
  if (!YTDLP)  console.error("ERROR: yt-dlp not found. Install it: pip3 install yt-dlp\n");
  if (!FFMPEG) console.warn("WARNING: ffmpeg not found. High-quality merging may fail.\n");
});
