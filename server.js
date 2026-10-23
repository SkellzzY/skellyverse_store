require('dotenv').config();
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const accounts = require('./accounts');

const app = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';

// Everything that must survive a redeploy lives under DATA_DIR (a Railway Volume in production)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DATA_FILE = path.join(DATA_DIR, 'tracks.json');
const RELEASE_TEMPLATE = fs.readFileSync(path.join(__dirname, 'views', 'release.html'), 'utf8');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (ADMIN_PASSWORD.length < 12) console.warn('ADMIN_PASSWORD missing or under 12 characters: admin is locked until it is set');

// ─── Middleware ───────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use('/api/account', accounts.router({ dbPath: path.join(DATA_DIR, 'skellyverse.db') }));
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ─── Data ─────────────────────────────────────────────────────────────────────
// Oct 27 2026, 11pm Central (CDT, UTC-5)
const DEFAULT_RELEASE = {
  title: 'BACK OF DA BACK',
  releaseAt: '2026-10-28T04:00:00.000Z',
  coverUrl: '',
  spotifyUrl: '',
  appleUrl: 'https://music.apple.com/us/album/back-of-da-back-single/6824066153?app=music',
  presaveUrl: 'https://distrokid.com/hyperfollow/skelly11/back-of-da-back'
};

function readData() {
  const data = readRawData();
  data.config.release = { ...DEFAULT_RELEASE, ...data.config.release };
  return data;
}

function readRawData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {
      tracks: [null, null, null, null, null],
      config: {
        spotifyUrl: 'https://open.spotify.com/artist/6rM2wOxPgwVrewqQIvV1dL',
        appleMusicUrl: 'https://music.apple.com/us/artist/skelly/1619899476',
        soundcloudUrl: 'https://soundcloud.com/skelly-508642134',
        sendBeatsUrl: 'mailto:EmiratesSoundMafia@proton.me',
        bookingUrl: 'mailto:skellybookings@proton.me',
        shopUrl: '#',
        socials: {
          twitter: 'https://x.com/SKELLYVERSE_',
          instagram: 'https://www.instagram.com/skellyverse',
          tiktok: 'https://www.tiktok.com/@skellyverse713',
          discord: 'https://discord.gg/WAUHMESn',
          youtube: 'https://www.youtube.com/@SKELLYVERSE'
        }
      }
    };
  }
}

// Write to a temp file then rename, so a crash mid-write can't corrupt the data
function writeData(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ─── Validation ───────────────────────────────────────────────────────────────
const SPOTIFY_ID = /^[a-zA-Z0-9]{10,30}$/;
const DURATION = /^\d{1,3}:\d{2}$/;
const UPLOAD_URL = /^\/uploads\/[a-zA-Z0-9._-]+$/;

const cleanText = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

// Only real links: https, http or mailto. Blocks javascript: and data: links.
function cleanUrl(s) {
  const v = String(s ?? '').trim();
  if (v === '' || v === '#') return v;
  try {
    const u = new URL(v);
    return ['https:', 'http:', 'mailto:'].includes(u.protocol) && v.length <= 500 ? v : null;
  } catch { return null; }
}

function cleanTrack(b) {
  const type = ['spotify', 'wav', 'manual'].includes(b.type) ? b.type : null;
  const title = cleanText(b.title, 120).toUpperCase();
  const duration = cleanText(b.duration, 8);
  if (!type || !title || !DURATION.test(duration)) return null;
  const spotifyId = b.spotifyId && SPOTIFY_ID.test(b.spotifyId) ? b.spotifyId : null;
  const url = b.url && UPLOAD_URL.test(b.url) ? b.url : null;
  if (type === 'spotify' && !spotifyId) return null;
  if (type === 'wav' && !url) return null;
  return { type, title, duration, spotifyId, url };
}

// Old iTunes links (and app=itunes) open the iTunes Store. Point them at Apple Music and its app instead.
function toAppleMusic(v) {
  if (!v) return v;
  const u = new URL(v);
  if (!/(^|\.)(itunes|music)\.apple\.com$/.test(u.hostname)) return v;
  u.hostname = 'music.apple.com';
  u.searchParams.set('app', 'music');
  return u.toString();
}

function cleanRelease(b) {
  const title = cleanText(b.title, 80).toUpperCase();
  const at = new Date(b.releaseAt);
  if (!title || isNaN(at)) return null;
  const coverUrl = b.coverUrl && UPLOAD_URL.test(b.coverUrl) ? b.coverUrl : '';
  const links = {};
  for (const k of ['spotifyUrl', 'appleUrl', 'presaveUrl']) {
    const v = cleanUrl(b[k]);
    if (v === null) return null;
    links[k] = v === '#' ? '' : v;
  }
  links.appleUrl = toAppleMusic(links.appleUrl);
  return { title, releaseAt: at.toISOString(), coverUrl, ...links };
}

const CONFIG_LINKS = ['spotifyUrl', 'appleMusicUrl', 'soundcloudUrl', 'sendBeatsUrl', 'bookingUrl', 'shopUrl'];
const SOCIALS = ['twitter', 'instagram', 'tiktok', 'discord', 'youtube'];

// ─── Auth Middleware ──────────────────────────────────────────────────────────
const adminTries = new Map();
function requireAdmin(req, res, next) {
  const now = Date.now();
  const t = (adminTries.get(req.ip) || []).filter(x => now - x < 15 * 60e3);
  if (t.length >= 10) return res.status(429).json({ error: 'Too many wrong passwords. Wait 15 minutes.' });

  const pw = Buffer.from(String(req.headers['x-admin-password'] || ''));
  const real = Buffer.from(ADMIN_PASSWORD);
  // Compare hashes so the check takes the same time no matter how much of the password matches
  const h = b => crypto.createHash('sha256').update(b).digest();
  const ok = real.length >= 12 && crypto.timingSafeEqual(h(pw), h(real));
  if (!ok) {
    t.push(now);
    adminTries.set(req.ip, t);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── File Upload ──────────────────────────────────────────────────────────────
const AUDIO_EXT = ['.wav', '.mp3', '.flac'];
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 }, // 200MB
  fileFilter: (req, file, cb) => {
    cb(null, AUDIO_EXT.includes(path.extname(file.originalname).toLowerCase()));
  }
});

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const uploadImage = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `cover_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }, // 15MB
  fileFilter: (req, file, cb) => {
    cb(null, IMAGE_EXT.includes(path.extname(file.originalname).toLowerCase()));
  }
});

// ─── Public Routes ────────────────────────────────────────────────────────────
app.get('/api/tracks', (req, res) => {
  res.json(readData().tracks);
});

app.get('/api/config', (req, res) => {
  res.json(readData().config);
});

// Release page. Rendered on the server so link previews (iMessage, IG, X) show the title and cover.
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
app.get(['/backofdaback', '/release'], (req, res) => {
  const r = readData().config.release;
  const origin = `${req.protocol}://${req.get('host')}`;
  const vars = {
    TITLE: escHtml(r.title),
    DESCRIPTION: escHtml(`SKELLY - ${r.title}. Stream it on Spotify and Apple Music.`),
    URL: escHtml(origin + req.path),
    IMAGE: r.coverUrl ? escHtml(origin + r.coverUrl) : ''
  };
  let html = RELEASE_TEMPLATE.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? '');
  if (!vars.IMAGE) html = html.replace(/^.*og:image.*$|^.*twitter:image.*$/gm, '');
  res.type('html').send(html);
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Lets the admin page check a password before showing the panel
app.get('/api/admin/check', requireAdmin, (req, res) => res.json({ ok: true }));

// Spotify track lookup
app.post('/api/spotify/lookup', requireAdmin, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const match = String(url).match(/track\/([a-zA-Z0-9]+)/);
  if (!match) return res.status(400).json({ error: 'Invalid Spotify track URL' });
  const trackId = match[1];

  try {
    // Get access token
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('Failed to get Spotify token');

    // Get track info
    const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    const track = await trackRes.json();
    if (!track.name) throw new Error(track.error?.message || 'Track not found');

    const ms = track.duration_ms;
    const mins = Math.floor(ms / 60000);
    const secs = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');

    res.json({
      title: track.name.toUpperCase(),
      duration: `${mins}:${secs}`,
      type: 'spotify',
      spotifyId: trackId
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload WAV/audio
app.post('/api/upload/wav', requireAdmin, upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (WAV, MP3 or FLAC only)' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Upload release cover art
app.post('/api/upload/cover', requireAdmin, uploadImage.single('cover'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded (JPG, PNG or WEBP only)' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Save release
app.post('/api/release', requireAdmin, (req, res) => {
  const release = cleanRelease(req.body || {});
  if (!release) return res.status(400).json({ error: 'Need a title, a release date, and valid links' });
  const data = readRawData();
  data.config.release = release;
  writeData(data);
  res.json({ ok: true, release });
});

// Save track to slot
app.post('/api/tracks/:slot', requireAdmin, (req, res) => {
  const slot = parseInt(req.params.slot);
  if (isNaN(slot) || slot < 0 || slot > 4) return res.status(400).json({ error: 'Invalid slot' });
  const track = cleanTrack(req.body || {});
  if (!track) return res.status(400).json({ error: 'Need a title, a duration like 3:45, and a Spotify link or audio file' });
  const data = readData();
  data.tracks[slot] = track;
  writeData(data);
  res.json({ ok: true });
});

// Clear track slot
app.delete('/api/tracks/:slot', requireAdmin, (req, res) => {
  const slot = parseInt(req.params.slot);
  if (isNaN(slot) || slot < 0 || slot > 4) return res.status(400).json({ error: 'Invalid slot' });
  const data = readData();
  data.tracks[slot] = null;
  writeData(data);
  res.json({ ok: true });
});

// Save config
app.post('/api/config', requireAdmin, (req, res) => {
  const data = readData();
  const body = req.body || {};
  const bad = [];
  for (const k of CONFIG_LINKS) {
    if (!(k in body)) continue;
    const v = cleanUrl(body[k]);
    v === null ? bad.push(k) : (data.config[k] = v);
  }
  data.config.socials = data.config.socials || {};
  for (const k of SOCIALS) {
    if (!body.socials || !(k in body.socials)) continue;
    const v = cleanUrl(body.socials[k]);
    v === null ? bad.push(k) : (data.config.socials[k] = v);
  }
  if (bad.length) return res.status(400).json({ error: 'Not a valid link: ' + bad.join(', ') });
  writeData(data);
  res.json({ ok: true });
});

// ─── Errors ───────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too big' : err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad JSON' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`SKELLYVERSE server running on port ${PORT}`);
});
