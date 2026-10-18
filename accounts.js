// User accounts: signup, login, logout, session cookie, password change.
// Plug into server.js:
//   const accounts = require('./accounts');
//   app.use('/api/account', accounts.router({ dbPath: process.env.DB_PATH || './data/skellyverse.db' }));
// Other routes can use accounts.requireUser to get req.user.

const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

// __Host- prefix: browser refuses the cookie unless Secure, Path=/ and no Domain, so subdomains can't plant one
const PROD = process.env.NODE_ENV === 'production';
const COOKIE = PROD ? '__Host-sv_session' : 'sv_session';
const MAX_SESSIONS = 10;
const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USER_RE = /^[a-z0-9_]{3,20}$/;

let db;

function open(dbPath) {
  if (db) return db;
  require('fs').mkdirSync(require('path').dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      pass TEXT NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
  `);
  return db;
}

// scrypt (N=2^15) with a per-user salt, stored as "salt:hash" in hex. Async so it never blocks the server.
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
async function hashPass(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw.normalize('NFKC'), salt, 64, SCRYPT);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

async function checkPass(pw, stored) {
  const [salt, hash] = stored.split(':');
  const got = await scrypt(pw.normalize('NFKC'), Buffer.from(salt, 'hex'), 64, SCRYPT);
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'));
}

// Checked against when the login doesn't exist, so a wrong username takes as long as a wrong password
let DUMMY;

const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyuiop',
  'qwerty123', 'iloveyou', 'abc12345', '11111111', '00000000', 'letmein1', 'welcome1', 'skellyverse', 'changeme123']);
function weakReason(pw, email, username) {
  if (pw.length < 10) return 'Password needs at least 10 characters';
  if (pw.length > 200) return 'Password too long';
  const low = pw.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(pw)) return 'That password is too common';
  const parts = [username, email.split('@')[0]].filter(x => x.length >= 4);
  if (parts.some(x => low.includes(x))) return 'Password can\'t contain your username or email';
  return null;
}

// Only a hash of the token is stored, so a leaked DB can't be used to log in
const tokenHash = t => crypto.createHash('sha256').update(t).digest('hex');

function readCookie(req) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(req, res, token, maxAgeSec) {
  const secure = PROD || req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}

function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)').run(tokenHash(token), userId, expires);
  // Keep only the newest sessions per user
  db.prepare(`DELETE FROM sessions WHERE user_id = ? AND token NOT IN
    (SELECT token FROM sessions WHERE user_id = ? ORDER BY expires DESC LIMIT ?)`).run(userId, userId, MAX_SESSIONS);
  setCookie(req, res, token, SESSION_DAYS * 86400);
}

function currentUser(req) {
  const token = readCookie(req);
  if (!token || !db) return null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.username, u.created FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires > ?`).get(tokenHash(token), Date.now());
  return row || null;
}

const publicUser = u => ({ id: u.id, username: u.username, email: u.email, created: u.created });

// Sliding-window limiter: 10 tries per 15 minutes per key. Login is keyed by IP and by account,
// so one attacker can't spray many accounts and many IPs can't hammer one account.
const tries = new Map();
function limited(key, max = 10) {
  const now = Date.now(), win = 15 * 60e3;
  const t = (tries.get(key) || []).filter(x => now - x < win);
  t.push(now);
  tries.set(key, t);
  if (tries.size > 5000) for (const [k, v] of tries) if (now - v[v.length - 1] > win) tries.delete(k);
  return t.length > max;
}
const TOO_MANY = { error: 'Too many tries. Wait 15 minutes.' };

// Blocks cross-site form posts: browsers can't send JSON cross-origin without a CORS preflight
function jsonOnly(req, res, next) {
  if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'Send JSON' });
  next();
}

function requireUser(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Log in first' });
  req.user = u;
  next();
}

function router({ dbPath }) {
  open(dbPath);
  hashPass('dummy-password').then(h => { DUMMY = h; });
  const sweep = () => db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  sweep();
  setInterval(sweep, 6 * 3600e3).unref();

  const r = express.Router();
  r.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  r.use(express.json({ limit: '10kb' }), jsonOnly);

  r.post('/signup', async (req, res) => {
    if (limited('signup:' + req.ip, 5)) return res.status(429).json(TOO_MANY);
    const email = String(req.body.email || '').trim().toLowerCase();
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (!USER_RE.test(username)) return res.status(400).json({ error: 'Username: 3 to 20 letters, numbers or _' });
    const weak = weakReason(password, email, username);
    if (weak) return res.status(400).json({ error: weak });
    const taken = db.prepare('SELECT email, username FROM users WHERE email = ? OR username = ?').get(email, username);
    if (taken) return res.status(409).json({ error: taken.email === email ? 'That email already has an account' : 'Username taken' });
    const pass = await hashPass(password);
    let lastInsertRowid;
    try {
      ({ lastInsertRowid } = db.prepare('INSERT INTO users (email, username, pass, created) VALUES (?, ?, ?, ?)')
        .run(email, username, pass, Date.now()));
    } catch (e) {
      // Two signups racing for the same name
      return res.status(409).json({ error: 'Email or username already taken' });
    }
    startSession(req, res, Number(lastInsertRowid));
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid)) });
  });

  r.post('/login', async (req, res) => {
    const login = String(req.body.login || '').trim().toLowerCase().slice(0, 254);
    const password = String(req.body.password || '').slice(0, 200);
    if (limited('ip:' + req.ip) || limited('acct:' + login)) return res.status(429).json(TOO_MANY);
    const u = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(login, login);
    const ok = await checkPass(password, u ? u.pass : DUMMY);
    if (!u || !ok) return res.status(401).json({ error: 'Wrong login or password' });
    startSession(req, res, u.id);
    res.json({ user: publicUser(u) });
  });

  r.post('/logout', (req, res) => {
    const token = readCookie(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash(token));
    setCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  r.get('/me', (req, res) => {
    const u = currentUser(req);
    res.json({ user: u ? publicUser(u) : null });
  });

  r.post('/password', requireUser, async (req, res) => {
    if (limited('pw:' + req.user.id, 5)) return res.status(429).json(TOO_MANY);
    const current = String(req.body.current || ''), next = String(req.body.next || '');
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!(await checkPass(current, u.pass))) return res.status(401).json({ error: 'Current password is wrong' });
    const weak = weakReason(next, u.email, u.username);
    if (weak) return res.status(400).json({ error: weak });
    db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(await hashPass(next), u.id);
    // Log out every other device
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    startSession(req, res, u.id);
    res.json({ ok: true });
  });

  return r;
}

module.exports = { router, requireUser, currentUser };
