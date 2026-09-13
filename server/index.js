// Flow Pomodoro — serveur HTTP unique : API JSON + fichiers statiques.
// Zéro dépendance npm : node:http, node:fs, node:crypto et SQLite natif (node:sqlite, Node >= 24).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const SESSION_COOKIE = 'flow_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const MAX_BODY_BYTES = 64 * 1024;
const MAX_SESSION_SECONDS = 24 * 60 * 60; // 24 h
const MAX_INTENTION_LENGTH = 200;
const DEFAULT_DAILY_GOAL_MIN = 120;
const MAX_DAILY_GOAL_MIN = 1440;
const LOGIN_MAX_FAILURES = 10; // par couple (IP, email)
const IP_MAX_FAILURES = 50; // par IP, jamais réarmé par un succès
const MAX_SIGNUPS_PER_IP = 10; // par heure et par IP (comptes créés)
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAP_CAP = 2000; // plafond dur des compteurs en mémoire
const MIN_SECRET_LENGTH = 32;
const VALID_MODES = new Set(['pomodoro', 'shortBreak', 'longBreak']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};

// ---------------------------------------------------------------------------
// Base de données
// ---------------------------------------------------------------------------

function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('pomodoro','shortBreak','longBreak')),
      intention TEXT,
      was_interrupted INTEGER NOT NULL DEFAULT 0,
      productivity_rating INTEGER CHECK(productivity_rating BETWEEN 1 AND 5),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_started
      ON focus_sessions(user_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      daily_focus_goal_min INTEGER NOT NULL DEFAULT 120
    );
  `);

  return db;
}

function prepareStatements(db) {
  const dailyAggregate = `
    SELECT date(started_at / 1000, 'unixepoch') AS day,
           SUM(CASE WHEN mode = 'pomodoro' THEN duration_seconds ELSE 0 END) AS focus_seconds,
           SUM(CASE WHEN mode = 'pomodoro' THEN 1 ELSE 0 END) AS pomodoro_count
    FROM focus_sessions
    WHERE user_id = ? AND (? IS NULL OR started_at >= ?)
    GROUP BY day
    ORDER BY day ASC`;
  return {
    userByEmail: db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?'),
    userById: db.prepare('SELECT id, email FROM users WHERE id = ?'),
    insertUser: db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)'),
    insertSession: db.prepare(`
      INSERT INTO focus_sessions
        (user_id, started_at, ended_at, duration_seconds, mode, intention, was_interrupted)
      VALUES (?, ?, ?, ?, ?, ?, ?)`),
    sessionById: db.prepare('SELECT * FROM focus_sessions WHERE id = ?'),
    updateRating: db.prepare(
      'UPDATE focus_sessions SET productivity_rating = ? WHERE id = ? AND user_id = ?',
    ),
    sessionsByWindow: db.prepare(`
      SELECT * FROM focus_sessions
      WHERE user_id = ? AND (? IS NULL OR started_at >= ?)
      ORDER BY started_at DESC, id DESC
      LIMIT ?`),
    dailyByWindow: db.prepare(dailyAggregate),
    dailyAll: db.prepare(`
      SELECT date(started_at / 1000, 'unixepoch') AS day,
             SUM(CASE WHEN mode = 'pomodoro' THEN duration_seconds ELSE 0 END) AS focus_seconds,
             SUM(CASE WHEN mode = 'pomodoro' THEN 1 ELSE 0 END) AS pomodoro_count
      FROM focus_sessions
      WHERE user_id = ?
      GROUP BY day
      ORDER BY day ASC`),
    prefsByUser: db.prepare('SELECT daily_focus_goal_min FROM user_preferences WHERE user_id = ?'),
    upsertPrefs: db.prepare(`
      INSERT INTO user_preferences (user_id, daily_focus_goal_min) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET daily_focus_goal_min = excluded.daily_focus_goal_min`),
  };
}

// ---------------------------------------------------------------------------
// Mots de passe, cookies, sessions
// ---------------------------------------------------------------------------

const scryptAsync = (password, salt, keylen) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)));
  });

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'base64');
  const expected = Buffer.from(parts[2], 'base64');
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = await scryptAsync(password, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Hash factice : garde un temps de réponse constant quand l'email est inconnu
// (évite l'énumération de comptes par mesure de latence).
let dummyHashPromise = null;
function getDummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHashPromise;
}

function signSession(uid, secret) {
  const payload = Buffer.from(
    JSON.stringify({ uid, exp: Date.now() + SESSION_TTL_MS }),
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readSession(token, secret) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isInteger(data.uid) || !Number.isFinite(data.exp) || Date.now() > data.exp) return null;
    return data.uid;
  } catch {
    return null;
  }
}

function sessionCookie(value, maxAgeSeconds, secure) {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name) cookies[name] = part.slice(eq + 1).trim();
  }
  return cookies;
}

function resolveSecret(secret, dbPath) {
  if (typeof secret === 'string' && secret.length > 0) {
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `SESSION_SECRET trop court : ${MIN_SECRET_LENGTH} caractères minimum (fourni : ${secret.length}).`,
      );
    }
    return secret;
  }
  const file = path.join(path.dirname(dbPath), '.session-secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // pas encore de fichier : on en crée un plus bas
  }
  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(file, `${generated}\n`, { mode: 0o600, flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      const existing = fs.readFileSync(file, 'utf8').trim();
      if (existing.length >= 32) return existing;
      fs.writeFileSync(file, `${generated}\n`, { mode: 0o600 });
    } else {
      throw err;
    }
  }
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // systèmes de fichiers sans permissions POSIX : tant pis
  }
  console.warn(
    `[flow] SESSION_SECRET absent : secret généré et conservé dans ${file} (chmod 0600)`,
  );
  return generated;
}

// ---------------------------------------------------------------------------
// Rate limiting (en mémoire, par IP réelle)
// ---------------------------------------------------------------------------

const loginAttempts = new Map(); // `${ip}\n${email}` -> { count, resetAt }
const ipFailures = new Map(); // ip -> { count, resetAt } (un succès ne le réarme pas)
const signupAttempts = new Map(); // ip -> { count, resetAt } (comptes créés)

function clientIp(req) {
  if (String(process.env.TRUST_PROXY || '') === '1') {
    // Derrière un reverse proxy : la dernière entrée est celle ajoutée par le proxy.
    const chain = String(req.headers['x-forwarded-for'] || '').split(',');
    const last = chain[chain.length - 1]?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress || 'inconnu';
}

function getCounter(map, key, windowMs) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.resetAt) {
    map.delete(key);
    return null;
  }
  return entry;
}

function bumpCounter(map, key, windowMs) {
  let entry = getCounter(map, key, windowMs);
  if (!entry) {
    entry = { count: 0, resetAt: Date.now() + windowMs };
    map.set(key, entry);
  }
  entry.count += 1;
  if (map.size > RATE_MAP_CAP) {
    const target = Math.floor(RATE_MAP_CAP * 0.8);
    for (const k of map.keys()) {
      if (map.size <= target) break;
      map.delete(k);
    }
  }
  return entry;
}

function accountKey(req, email) {
  return `${clientIp(req)}\n${email}`;
}

function loginBlocked(req, email) {
  const account = getCounter(loginAttempts, accountKey(req, email), LOGIN_WINDOW_MS);
  if (account && account.count >= LOGIN_MAX_FAILURES) return true;
  const ip = getCounter(ipFailures, clientIp(req), LOGIN_WINDOW_MS);
  return !!(ip && ip.count >= IP_MAX_FAILURES);
}

function recordLoginFailure(req, email) {
  bumpCounter(loginAttempts, accountKey(req, email), LOGIN_WINDOW_MS);
  bumpCounter(ipFailures, clientIp(req), LOGIN_WINDOW_MS);
}

function clearLoginFailures(req, email) {
  // Seul le couple (IP, email) est remis à zéro : réussir sur un autre compte
  // ne doit pas rouvrir le compteur de la victime.
  loginAttempts.delete(accountKey(req, email));
}

function signupBlocked(req) {
  const entry = getCounter(signupAttempts, clientIp(req), SIGNUP_WINDOW_MS);
  return !!(entry && entry.count >= MAX_SIGNUPS_PER_IP);
}

function recordSignup(req) {
  bumpCounter(signupAttempts, clientIp(req), SIGNUP_WINDOW_MS);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value.trim())) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function optionalInt(raw, min, max) {
  if (raw === null || raw === '') return null; // absent
  if (!/^\d+$/.test(raw)) return undefined; // invalide
  const value = Number(raw);
  return value >= min && value <= max ? value : undefined;
}

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Réponses
// ---------------------------------------------------------------------------

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, status, code) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  sendJson(res, status, { error: code });
}

function methodNotAllowed(res, allow) {
  res.setHeader('Allow', allow);
  sendError(res, 405, 'method_not_allowed');
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large');
    chunks.push(chunk);
  }
  if (total === 0) return {};
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'unsupported_media_type');
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_input');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, 'invalid_input');
  }
  return data;
}

function mapSession(row) {
  return {
    id: row.id,
    started_at: new Date(row.started_at).toISOString(),
    ended_at: new Date(row.ended_at).toISOString(),
    duration_seconds: row.duration_seconds,
    mode: row.mode,
    intention: row.intention ?? null,
    was_interrupted: row.was_interrupted ? 1 : 0,
    productivity_rating: row.productivity_rating ?? null,
  };
}

function mapDaily(row) {
  return {
    day: row.day,
    focus_seconds: Number(row.focus_seconds),
    pomodoro_count: Number(row.pomodoro_count),
  };
}

// ---------------------------------------------------------------------------
// Authentification des requêtes
// ---------------------------------------------------------------------------

function getUserId(req, ctx) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  return readSession(token, ctx.secret);
}

function requireUser(req, res, ctx) {
  const uid = getUserId(req, ctx);
  if (!uid) {
    sendError(res, 401, 'unauthorized');
    return null;
  }
  return uid;
}

// ---------------------------------------------------------------------------
// Handlers API
// ---------------------------------------------------------------------------

async function handleSignup(req, res, ctx) {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (loginBlocked(req, email || '') || signupBlocked(req)) {
    return sendError(res, 429, 'too_many_attempts');
  }
  if (
    !isValidEmail(email) ||
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 200
  ) {
    return sendError(res, 400, 'invalid_input');
  }
  if (ctx.stmts.userByEmail.get(email)) {
    recordLoginFailure(req, email);
    return sendError(res, 409, 'email_taken');
  }
  const info = ctx.stmts.insertUser.run(email, await hashPassword(password));
  const user = { id: Number(info.lastInsertRowid), email };
  recordSignup(req);
  res.setHeader(
    'Set-Cookie',
    sessionCookie(signSession(user.id, ctx.secret), SESSION_TTL_MS / 1000, ctx.cookieSecure),
  );
  return sendJson(res, 201, { user });
}

async function handleLogin(req, res, ctx) {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (loginBlocked(req, email || '')) return sendError(res, 429, 'too_many_attempts');
  if (
    !isValidEmail(email) ||
    typeof password !== 'string' ||
    password.length === 0 ||
    password.length > 200
  ) {
    return sendError(res, 400, 'invalid_input');
  }
  const user = ctx.stmts.userByEmail.get(email);
  if (!user) {
    // Temps de réponse constant : même coût scrypt que pour un compte existant.
    await verifyPassword(password, await getDummyHash());
    recordLoginFailure(req, email);
    return sendError(res, 401, 'invalid_credentials');
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    recordLoginFailure(req, email);
    return sendError(res, 401, 'invalid_credentials');
  }
  clearLoginFailures(req, email);
  res.setHeader(
    'Set-Cookie',
    sessionCookie(signSession(user.id, ctx.secret), SESSION_TTL_MS / 1000, ctx.cookieSecure),
  );
  return sendJson(res, 200, { user: { id: user.id, email: user.email } });
}

function handleLogout(req, res, ctx) {
  res.setHeader('Set-Cookie', sessionCookie('', 0, ctx.cookieSecure));
  res.writeHead(204);
  res.end();
}

function handleMe(req, res, ctx) {
  const uid = requireUser(req, res, ctx);
  if (!uid) return;
  const user = ctx.stmts.userById.get(uid);
  if (!user) return sendError(res, 401, 'unauthorized');
  return sendJson(res, 200, { user: { id: user.id, email: user.email } });
}

async function handleCreateSession(req, res, ctx) {
  const uid = requireUser(req, res, ctx);
  if (!uid) return;
  const body = await readJson(req);
  const startedAt = parseTimestamp(body.startedAt);
  const endedAt = parseTimestamp(body.endedAt);
  if (startedAt === null || endedAt === null || endedAt < startedAt) {
    return sendError(res, 400, 'invalid_input');
  }
  const durationSeconds = Math.round((endedAt - startedAt) / 1000);
  if (durationSeconds > MAX_SESSION_SECONDS || !VALID_MODES.has(body.mode)) {
    return sendError(res, 400, 'invalid_input');
  }
  let intention = null;
  if (body.intention !== undefined && body.intention !== null) {
    if (typeof body.intention !== 'string') return sendError(res, 400, 'invalid_input');
    intention = body.intention.trim();
    if (intention.length > MAX_INTENTION_LENGTH) return sendError(res, 400, 'invalid_input');
    if (intention === '') intention = null;
  }
  let interrupted = 0;
  if (body.interrupted !== undefined && body.interrupted !== null) {
    if (typeof body.interrupted !== 'boolean') return sendError(res, 400, 'invalid_input');
    interrupted = body.interrupted ? 1 : 0;
  }
  const info = ctx.stmts.insertSession.run(
    uid,
    startedAt,
    endedAt,
    durationSeconds,
    body.mode,
    intention,
    interrupted,
  );
  const row = ctx.stmts.sessionById.get(Number(info.lastInsertRowid));
  return sendJson(res, 201, { session: mapSession(row) });
}

async function handlePatchSession(req, res, id, ctx) {
  const uid = requireUser(req, res, ctx);
  if (!uid) return;
  const body = await readJson(req);
  if (!Object.prototype.hasOwnProperty.call(body, 'rating')) {
    return sendError(res, 400, 'invalid_input');
  }
  const rating = body.rating;
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return sendError(res, 400, 'invalid_input');
  }
  const info = ctx.stmts.updateRating.run(rating, id, uid);
  if (info.changes === 0) return sendError(res, 404, 'not_found');
  const row = ctx.stmts.sessionById.get(id);
  return sendJson(res, 200, { session: mapSession(row) });
}

function handleStats(req, res, url, ctx) {
  const uid = requireUser(req, res, ctx);
  if (!uid) return;
  const days = optionalInt(url.searchParams.get('days'), 1, 3650);
  if (days === undefined) return sendError(res, 400, 'invalid_input');
  const limit = optionalInt(url.searchParams.get('limitSessions'), 1, 2000);
  if (limit === undefined) return sendError(res, 400, 'invalid_input');
  const limitSessions = limit === null ? 200 : limit;
  const cutoff = days === null ? null : Date.now() - days * 86400000;

  const sessions = ctx.stmts.sessionsByWindow
    .all(uid, cutoff, cutoff, limitSessions)
    .map(mapSession);
  const daily = ctx.stmts.dailyByWindow.all(uid, cutoff, cutoff).map(mapDaily);
  const allDaily =
    url.searchParams.get('allDaily') === '1' ? ctx.stmts.dailyAll.all(uid).map(mapDaily) : [];

  return sendJson(res, 200, { sessions, daily, allDaily });
}

function handleGetPrefs(req, res, ctx) {
  const uid = requireUser(req, res, ctx);
  if (!uid) return;
  const row = ctx.stmts.prefsByUser.get(uid);
  return sendJson(res, 200, {
    daily_focus_goal_min: row ? row.daily_focus_goal_min : DEFAULT_DAILY_GOAL_MIN,
  });
}

async function handlePutPrefs(req, res, ctx) {
  const uid = requireUser(req, res, ctx);
  if (!uid) return;
  const body = await readJson(req);
  const goal = body.daily_focus_goal_min;
  if (!Number.isInteger(goal) || goal < 1 || goal > MAX_DAILY_GOAL_MIN) {
    return sendError(res, 400, 'invalid_input');
  }
  ctx.stmts.upsertPrefs.run(uid, goal);
  return sendJson(res, 200, { daily_focus_goal_min: goal });
}

function handleHealthz(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return methodNotAllowed(res, 'GET');
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  return res.end('ok');
}

async function handleApi(req, res, url, ctx) {
  const { pathname } = url;
  switch (pathname) {
    case '/api/auth/signup':
      return req.method === 'POST' ? handleSignup(req, res, ctx) : methodNotAllowed(res, 'POST');
    case '/api/auth/login':
      return req.method === 'POST' ? handleLogin(req, res, ctx) : methodNotAllowed(res, 'POST');
    case '/api/auth/logout':
      return req.method === 'POST' ? handleLogout(req, res, ctx) : methodNotAllowed(res, 'POST');
    case '/api/auth/me':
      return req.method === 'GET' ? handleMe(req, res, ctx) : methodNotAllowed(res, 'GET');
    case '/api/sessions':
      return req.method === 'POST'
        ? handleCreateSession(req, res, ctx)
        : methodNotAllowed(res, 'POST');
    case '/api/stats':
      return req.method === 'GET'
        ? handleStats(req, res, url, ctx)
        : methodNotAllowed(res, 'GET');
    case '/api/prefs':
      if (req.method === 'GET') return handleGetPrefs(req, res, ctx);
      if (req.method === 'PUT') return handlePutPrefs(req, res, ctx);
      return methodNotAllowed(res, 'GET, PUT');
    default:
      break;
  }
  const match = /^\/api\/sessions\/(\d+)$/.exec(pathname);
  if (match) {
    return req.method === 'PATCH'
      ? handlePatchSession(req, res, Number(match[1]), ctx)
      : methodNotAllowed(res, 'PATCH');
  }
  return sendError(res, 404, 'not_found');
}

// ---------------------------------------------------------------------------
// Fichiers statiques (build Vite + fallback SPA)
// ---------------------------------------------------------------------------

function resolveStaticPath(publicDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const filePath = path.resolve(publicDir, decoded.replace(/^\/+/, ''));
  if (filePath !== publicDir && !filePath.startsWith(publicDir + path.sep)) return null;
  return filePath;
}

function statFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

function serveFile(req, res, filePath, stat, cacheControl, status = 200) {
  const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const compressible = /^(text\/|application\/(json|javascript)|image\/svg)/.test(mime);
  const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  const useGzip = compressible && acceptsGzip && stat.size > 1024;
  const headers = {
    'Content-Type': mime,
    'Cache-Control': cacheControl,
  };
  if (useGzip) {
    headers['Content-Encoding'] = 'gzip';
  } else {
    headers['Content-Length'] = stat.size;
  }
  if (compressible) headers.Vary = 'Accept-Encoding';
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => res.destroy());
  if (useGzip) {
    const gzip = zlib.createGzip();
    gzip.on('error', () => res.destroy());
    return stream.pipe(gzip).pipe(res);
  }
  return stream.pipe(res);
}

function handleStatic(req, res, pathname, publicDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(res, 'GET');
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = resolveStaticPath(publicDir, requestPath);
  if (filePath) {
    const stat = statFile(filePath);
    if (stat) {
      const isAsset = requestPath.startsWith('/assets/');
      return serveFile(
        req,
        res,
        filePath,
        stat,
        isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    }
  }
  // Fallback SPA : toute route sans extension renvoie index.html.
  if (!requestPath.startsWith('/assets/') && path.extname(requestPath) === '') {
    const indexPath = path.join(publicDir, 'index.html');
    const stat = statFile(indexPath);
    if (stat) return serveFile(req, res, indexPath, stat, 'no-cache');
  }
  return sendError(res, 404, 'not_found');
}

// ---------------------------------------------------------------------------
// Requête HTTP
// ---------------------------------------------------------------------------

async function handleRequest(req, res, ctx) {
  setSecurityHeaders(res);
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return sendError(res, 400, 'bad_request');
  }
  if (url.pathname === '/healthz') return handleHealthz(req, res);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url, ctx);
  return handleStatic(req, res, url.pathname, ctx.publicDir);
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

export async function startServer({ port = 0, dbPath, publicDir, secret } = {}) {
  const resolvedDbPath = path.resolve(dbPath || process.env.DB_PATH || 'data/flow.db');
  const resolvedPublicDir = path.resolve(publicDir || process.env.PUBLIC_DIR || 'react-app/dist');
  const resolvedSecret = resolveSecret(secret || process.env.SESSION_SECRET, resolvedDbPath);
  const cookieSecure = String(process.env.COOKIE_SECURE || '') === '1';

  const db = openDatabase(resolvedDbPath);
  const ctx = {
    stmts: prepareStatements(db),
    publicDir: resolvedPublicDir,
    secret: resolvedSecret,
    cookieSecure,
  };

  const server = http.createServer((req, res) => {
    handleRequest(req, res, ctx).catch((err) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('[flow] erreur inattendue :', err);
      sendError(res, status, err instanceof HttpError ? err.code : 'internal_error');
    });
  });

  await new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = address && typeof address === 'object' ? address.port : port;
  console.log(`[flow] à l'écoute sur http://localhost:${actualPort} — base SQLite : ${resolvedDbPath}`);

  let closed = false;
  const close = () =>
    new Promise((resolve) => {
      if (closed) return resolve();
      closed = true;
      server.close(() => {
        try {
          db.close();
        } catch {
          // déjà fermée
        }
        resolve();
      });
      server.closeAllConnections?.();
      return undefined;
    });

  return { server, port: actualPort, close };
}

const launchedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (launchedDirectly) {
  startServer({ port: Number(process.env.PORT) || 3000 })
    .then(({ close }) => {
      const shutdown = () => {
        close()
          .then(() => process.exit(0))
          .catch(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((err) => {
      console.error('[flow] impossible de démarrer le serveur :', err);
      process.exit(1);
    });
}
