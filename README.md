# VideoDownloader - Self-Hosting Guide

Download videos from YouTube, Facebook, Instagram, Twitter/X, and TikTok.

---

## Files

```
videodownloader-host/
  server.js        ← Backend server (Node.js + Express)
  package.json     ← Node.js dependencies
  public/
    index.html     ← Frontend (HTML + CSS + JS, no build needed)
  README.md        ← This file
```

---

## Requirements

Install these before running:

| Tool    | How to Install                                                      |
|---------|---------------------------------------------------------------------|
| Node.js | https://nodejs.org  (version 16 or higher)                          |
| yt-dlp  | `pip3 install yt-dlp`  or  `pip install yt-dlp`                    |
| ffmpeg  | Ubuntu/Debian: `sudo apt install ffmpeg`                            |
|         | macOS: `brew install ffmpeg`                                        |
|         | Windows: https://ffmpeg.org/download.html  (add to PATH)            |

---

## Setup & Run (Local)

```bash
# 1. Go to the project folder
cd videodownloader-host

# 2. Install Node.js packages
npm install

# 3. Start the server
node server.js
```

Open browser: **http://localhost:3000**

---

## Deploy on VPS (Ubuntu/Debian)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install yt-dlp
sudo pip3 install yt-dlp

# Install ffmpeg
sudo apt install -y ffmpeg

# Copy your project files to server, then:
cd videodownloader-host
npm install
node server.js
```

To keep it running 24/7, use PM2:

```bash
npm install -g pm2
pm2 start server.js --name videodownloader
pm2 startup
pm2 save
```

---

## Deploy on Render / Railway / Fly.io

1. Upload this folder to GitHub
2. Create a new Web Service on Render/Railway
3. Set **Build Command**: `npm install && pip3 install yt-dlp`
4. Set **Start Command**: `node server.js`
5. Set environment variable: `PORT=3000`

> Note: These platforms may not have ffmpeg by default.
> On Render, add a buildpack or use a Docker deployment.

---

## Docker Deployment

Create a `Dockerfile` in the same folder:

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip3 install yt-dlp

WORKDIR /app
COPY package.json .
RUN npm install
COPY . .

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```

Then:

```bash
docker build -t videodownloader .
docker run -p 3000:3000 videodownloader
```

---

## Configuration

Edit `server.js` at the top to change paths:

```js
const YTDLP_PATH  = process.env.YTDLP_PATH  || "yt-dlp";    // path to yt-dlp binary
const PYTHON_PATH = process.env.PYTHON_PATH || "python3";   // path to python
```

Or set as environment variables:

```bash
YTDLP_PATH=/usr/local/bin/yt-dlp node server.js
```

---

## Changing API URL (Frontend)

If you host the API on a different domain than the frontend, edit `public/index.html`:

```js
const API_BASE = 'https://your-api-domain.com/api';
```

---

## Supported Platforms

- YouTube (videos, Shorts)
- Facebook (videos, Reels)
- Instagram (posts, Reels)
- Twitter / X (tweet videos)
- TikTok (no watermark)

---

## Legal Notice

This tool is for personal use only. Respect copyright laws and each platform's Terms of Service.
