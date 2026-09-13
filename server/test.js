// Tests d'intégration du serveur Flow (node:test, base SQLite temporaire, fetch natif).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './index.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-test-'));
const publicDir = path.join(tmpDir, 'public');
let handle;
let base;
let cookie = null;

before(async () => {
  handle = await startServer({
    port: 0,
    dbPath: path.join(tmpDir, 'test.db'),
    publicDir,
    secret: 'secret-de-test-0123456789abcdef-long',
  });
  base = `http://127.0.0.1:${handle.port}`;
});

after(async () => {
  if (handle) await handle.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function api(method, urlPath, body, { cookie: cookieOverride } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const value = cookieOverride !== undefined ? cookieOverride : cookie;
  if (value) headers.cookie = value;
  const res = await fetch(base + urlPath, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // réponse non JSON (fichier statique)
  }
  return { status: res.status, json, text, res };
}

function captureCookie(res) {
  const line = res.headers.getSetCookie().find((value) => value.startsWith('flow_session='));
  cookie = line ? line.split(';')[0] : null;
  return line;
}

test('GET /healthz répond ok', async () => {
  const r = await api('GET', '/healthz');
  assert.equal(r.status, 200);
  assert.equal(r.text, 'ok');
});

test("signup : crée un compte, ouvre une session et /me répond", async () => {
  const r = await api('POST', '/api/auth/signup', {
    email: 'Alice@Example.com',
    password: 'motdepasse',
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.user.email, 'alice@example.com');
  assert.equal(typeof r.json.user.id, 'number');

  const setCookie = captureCookie(r.res);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Max-Age=2592000/);

  const me = await api('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.deepEqual(me.json.user, r.json.user);
});

test('login : mauvais mot de passe 401, puis succès 200', async () => {
  const bad = await api('POST', '/api/auth/login', {
    email: 'alice@example.com',
    password: 'mauvais-mot-de-passe',
  });
  assert.equal(bad.status, 401);
  assert.equal(bad.json.error, 'invalid_credentials');

  const good = await api('POST', '/api/auth/login', {
    email: 'alice@example.com',
    password: 'motdepasse',
  });
  assert.equal(good.status, 200);
  captureCookie(good.res);
  assert.equal(good.json.user.email, 'alice@example.com');
});

test('signup : email déjà pris → 409', async () => {
  const r = await api('POST', '/api/auth/signup', {
    email: 'ALICE@example.com',
    password: 'motdepasse',
  });
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'email_taken');
});

test('signup : email invalide ou mot de passe trop court → 400', async () => {
  const badEmail = await api('POST', '/api/auth/signup', {
    email: 'pas-un-email',
    password: 'motdepasse',
  });
  assert.equal(badEmail.status, 400);
  assert.equal(badEmail.json.error, 'invalid_input');

  const short = await api('POST', '/api/auth/signup', {
    email: 'bob@example.com',
    password: 'court',
  });
  assert.equal(short.status, 400);
});

test('sessions : création, validation puis rating via PATCH', async () => {
  const created = await api('POST', '/api/sessions', {
    startedAt: '2026-09-13T08:00:00.000Z',
    endedAt: '2026-09-13T08:25:00.000Z',
    mode: 'pomodoro',
    intention: 'Écrire les tests',
    interrupted: false,
  });
  assert.equal(created.status, 201);
  const session = created.json.session;
  assert.equal(session.duration_seconds, 1500);
  assert.equal(session.mode, 'pomodoro');
  assert.equal(session.intention, 'Écrire les tests');
  assert.equal(session.was_interrupted, 0);
  assert.equal(session.productivity_rating, null);
  assert.equal(session.started_at, '2026-09-13T08:00:00.000Z');

  const rated = await api('PATCH', `/api/sessions/${session.id}`, { rating: 4 });
  assert.equal(rated.status, 200);
  assert.equal(rated.json.session.id, session.id);
  assert.equal(rated.json.session.productivity_rating, 4);

  const invalidRating = await api('PATCH', `/api/sessions/${session.id}`, { rating: 9 });
  assert.equal(invalidRating.status, 400);

  const unknown = await api('PATCH', '/api/sessions/999999', { rating: 3 });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.json.error, 'not_found');

  const badMode = await api('POST', '/api/sessions', {
    startedAt: '2026-09-13T09:00:00.000Z',
    endedAt: '2026-09-13T09:25:00.000Z',
    mode: 'sieste',
  });
  assert.equal(badMode.status, 400);

  const reversed = await api('POST', '/api/sessions', {
    startedAt: '2026-09-13T09:25:00.000Z',
    endedAt: '2026-09-13T09:00:00.000Z',
    mode: 'pomodoro',
  });
  assert.equal(reversed.status, 400);

  const tooLong = await api('POST', '/api/sessions', {
    startedAt: '2026-09-13T00:00:00.000Z',
    endedAt: '2026-09-14T02:00:00.000Z',
    mode: 'pomodoro',
  });
  assert.equal(tooLong.status, 400);
});

test('stats : sessions triées, agrégat daily et allDaily', async () => {
  const second = await api('POST', '/api/sessions', {
    startedAt: '2026-09-13T10:00:00.000Z',
    endedAt: '2026-09-13T10:50:00.000Z',
    mode: 'pomodoro',
    intention: null,
  });
  assert.equal(second.status, 201);

  const breakSession = await api('POST', '/api/sessions', {
    startedAt: '2026-09-13T11:00:00.000Z',
    endedAt: '2026-09-13T11:10:00.000Z',
    mode: 'shortBreak',
    interrupted: true,
  });
  assert.equal(breakSession.status, 201);
  assert.equal(breakSession.json.session.was_interrupted, 1);

  const stats = await api('GET', '/api/stats?days=3650&allDaily=1');
  assert.equal(stats.status, 200);
  assert.equal(stats.json.sessions.length, 3);
  assert.deepEqual(
    stats.json.sessions.map((s) => s.mode),
    ['shortBreak', 'pomodoro', 'pomodoro'],
  );
  assert.equal(stats.json.daily.length, 1);
  assert.deepEqual(stats.json.daily[0], {
    day: '2026-09-13',
    focus_seconds: 4500,
    pomodoro_count: 2,
  });
  assert.deepEqual(stats.json.allDaily, stats.json.daily);

  const limited = await api('GET', '/api/stats?limitSessions=1');
  assert.equal(limited.status, 200);
  assert.equal(limited.json.sessions.length, 1);
  assert.deepEqual(limited.json.allDaily, []);

  const invalid = await api('GET', '/api/stats?days=abc');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error, 'invalid_input');
});

test('prefs : valeur par défaut puis mise à jour', async () => {
  const initial = await api('GET', '/api/prefs');
  assert.equal(initial.status, 200);
  assert.equal(initial.json.daily_focus_goal_min, 120);

  const updated = await api('PUT', '/api/prefs', { daily_focus_goal_min: 90 });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.daily_focus_goal_min, 90);

  const readBack = await api('GET', '/api/prefs');
  assert.equal(readBack.json.daily_focus_goal_min, 90);

  const invalid = await api('PUT', '/api/prefs', { daily_focus_goal_min: 0 });
  assert.equal(invalid.status, 400);
});

test('accès non autorisé : 401 sans cookie', async () => {
  const me = await api('GET', '/api/auth/me', undefined, { cookie: null });
  assert.equal(me.status, 401);
  assert.equal(me.json.error, 'unauthorized');

  const create = await api(
    'POST',
    '/api/sessions',
    { startedAt: '2026-09-13T12:00:00.000Z', endedAt: '2026-09-13T12:25:00.000Z', mode: 'pomodoro' },
    { cookie: null },
  );
  assert.equal(create.status, 401);

  const stats = await api('GET', '/api/stats', undefined, { cookie: null });
  assert.equal(stats.status, 401);

  const prefs = await api('GET', '/api/prefs', undefined, { cookie: null });
  assert.equal(prefs.status, 401);
});

test('logout : cookie effacé puis /me → 401', async () => {
  const logout = await api('POST', '/api/auth/logout', {});
  assert.equal(logout.status, 204);
  const cleared = logout.res.headers.getSetCookie().find((v) => v.startsWith('flow_session='));
  assert.match(cleared, /Max-Age=0/);

  cookie = null; // le navigateur ne renvoie plus le cookie
  const me = await api('GET', '/api/auth/me');
  assert.equal(me.status, 401);
  assert.equal(me.json.error, 'unauthorized');
});

test('statique : index, assets immuables, fallback SPA et anti-traversal', async () => {
  fs.mkdirSync(path.join(publicDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<!doctype html><title>Flow</title>');
  fs.writeFileSync(path.join(publicDir, 'assets', 'app-abc123.js'), 'console.log("flow");');

  const index = await api('GET', '/');
  assert.equal(index.status, 200);
  assert.match(index.text, /Flow/);
  assert.match(index.res.headers.get('cache-control'), /no-cache/);
  assert.equal(index.res.headers.get('x-content-type-options'), 'nosniff');

  const asset = await api('GET', '/assets/app-abc123.js');
  assert.equal(asset.status, 200);
  assert.match(asset.res.headers.get('cache-control'), /immutable/);
  assert.match(asset.res.headers.get('content-type'), /javascript/);

  const route = await api('GET', '/dashboard');
  assert.equal(route.status, 200);
  assert.match(route.text, /Flow/);

  const missingAsset = await api('GET', '/assets/absent.js');
  assert.equal(missingAsset.status, 404);

  const traversal = await api('GET', '/..%2f..%2f..%2fetc%2fpasswd');
  assert.equal(traversal.status, 404);
});

test('login : 429 après 10 échecs depuis la même IP', async () => {
  let tooMany = false;
  for (let i = 0; i < 15; i += 1) {
    const r = await api(
      'POST',
      '/api/auth/login',
      { email: 'rate-limit@example.com', password: 'mauvais-mot-de-passe' },
      { cookie: null },
    );
    if (r.status === 429) {
      assert.equal(r.json.error, 'too_many_attempts');
      tooMany = true;
      break;
    }
    assert.equal(r.status, 401);
  }
  assert.equal(tooMany, true);
});

test('rate limit : un succès sur un autre compte ne réarme pas la victime', async () => {
  const signup = await api(
    'POST',
    '/api/auth/signup',
    { email: 'attaquant@example.com', password: 'motdepasse123' },
    { cookie: null },
  );
  assert.equal(signup.status, 201);

  for (let i = 0; i < 10; i += 1) {
    const r = await api(
      'POST',
      '/api/auth/login',
      { email: 'victime@example.com', password: 'mauvais-mot-de-passe' },
      { cookie: null },
    );
    assert.equal(r.status, 401);
  }

  const success = await api(
    'POST',
    '/api/auth/login',
    { email: 'attaquant@example.com', password: 'motdepasse123' },
    { cookie: null },
  );
  assert.equal(success.status, 200);

  const blocked = await api(
    'POST',
    '/api/auth/login',
    { email: 'victime@example.com', password: 'mauvais-mot-de-passe' },
    { cookie: null },
  );
  assert.equal(blocked.status, 429);
});

test('signup : plafonné par IP après 10 comptes créés', async () => {
  let tooMany = false;
  for (let i = 0; i < 15; i += 1) {
    const r = await api(
      'POST',
      '/api/auth/signup',
      { email: `limite-${i}@example.com`, password: 'motdepasse123' },
      { cookie: null },
    );
    if (r.status === 429) {
      assert.equal(r.json.error, 'too_many_attempts');
      tooMany = true;
      break;
    }
    assert.equal(r.status, 201);
  }
  assert.equal(tooMany, true);
});

test('SESSION_SECRET trop court : refus de démarrer', async () => {
  await assert.rejects(
    () =>
      startServer({
        port: 0,
        dbPath: path.join(tmpDir, 'secret-court.db'),
        publicDir,
        secret: 'trop-court',
      }),
    /trop court/,
  );
});
