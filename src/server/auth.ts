import type { Env } from './index';
import type { Profile } from '../shared/protocol';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
export async function body(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get('Content-Type')?.includes('application/json'))
    throw new HttpError(415, 'JSON 요청이 필요합니다.');
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, '본문이 없습니다.');
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > 4096) {
      await reader.cancel();
      throw new HttpError(413, '요청이 너무 큽니다.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(n);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    const d = JSON.parse(new TextDecoder().decode(bytes));
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw 0;
    return d;
  } catch {
    throw new HttpError(400, '잘못된 JSON입니다.');
  }
}
const hex = (v: ArrayBuffer) =>
  Array.from(new Uint8Array(v), (x) => x.toString(16).padStart(2, '0')).join(
    '',
  );
export const token = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export const digest = async (v: string) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
async function passwordHash(v: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(v),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode(salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      key,
      256,
    ),
  );
}
const cookieToken = (req: Request) =>
  req.headers
    .get('Cookie')
    ?.match(/(?:^|;\s*)sq_session=([a-f0-9]{64})(?:;|$)/)?.[1];
function cookie(req: Request, v: string, age: number) {
  const host = new URL(req.url).hostname;
  return `sq_session=${v}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${['localhost', '127.0.0.1'].includes(host) ? '' : '; Secure'}`;
}
export async function session(req: Request, env: Env) {
  const raw = cookieToken(req);
  if (!raw) throw new HttpError(401, '로그인이 필요합니다.');
  const u = await env.DB.prepare(
    'SELECT u.id,u.nickname,p.equipped_skin FROM sessions s JOIN users u ON s.user_id=u.id JOIN player_profiles p ON p.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',
  )
    .bind(await digest(raw), Date.now())
    .first<{ id: string; nickname: string; equipped_skin: string }>();
  if (!u) throw new HttpError(401, '로그인이 만료됐습니다.');
  return u;
}
export async function profile(id: string, env: Env) {
  const p = await env.DB.prepare(
    'SELECT u.id,u.nickname,p.xp,p.coins,p.equipped_skin,g.prologue_cleared,g.prologue_version FROM users u JOIN player_profiles p ON u.id=p.user_id JOIN player_progress g ON u.id=g.user_id WHERE u.id=?',
  )
    .bind(id)
    .first<Omit<Profile, 'level'>>();
  if (!p) throw new HttpError(404, '계정을 찾을 수 없습니다.');
  return { ...p, level: 1 + Math.floor(p.xp / 300) };
}
export async function limit(env: Env, key: string, max: number) {
  const now = Date.now();
  const r = await env.DB.prepare(
    'INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts',
  )
    .bind(key, now + 600000, now, now)
    .first<{ attempts: number }>();
  if (r && r.attempts > max)
    throw new HttpError(429, '요청이 많습니다. 잠시 후 다시 시도하세요.');
}
export async function auth(req: Request, env: Env, path: string) {
  if (path === 'logout') {
    const raw = cookieToken(req);
    if (raw)
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?')
        .bind(await digest(raw))
        .run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(req, '', 0) });
  }
  const d = await body(req),
    username = typeof d.username === 'string' ? d.username.toLowerCase() : '',
    password = typeof d.password === 'string' ? d.password : '';
  if (
    !/^[a-z0-9_]{3,24}$/.test(username) ||
    password.length < 10 ||
    password.length > 128
  )
    throw new HttpError(
      400,
      '아이디 3~24자(영문·숫자·밑줄), 비밀번호 10~128자가 필요합니다.',
    );
  for (const key of [
    req.headers.get('CF-Connecting-IP') ?? 'local',
    `user:${username}`,
  ])
    await limit(env, await digest(key), 30);
  let user: { id: string; password_hash: string; salt: string } | null;
  if (path === 'register') {
    const name = typeof d.nickname === 'string' ? d.nickname.trim() : '';
    if (name.length < 2 || name.length > 16 || /[\u0000-\u001f<>]/.test(name))
      throw new HttpError(400, '닉네임은 2~16자입니다.');
    const id = crypto.randomUUID(),
      salt = token(),
      hash = await passwordHash(password, salt);
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').bind(
          id,
          username,
          name,
          hash,
          salt,
          Date.now(),
        ),
        env.DB.prepare('INSERT INTO player_profiles(user_id) VALUES(?)').bind(
          id,
        ),
        env.DB.prepare('INSERT INTO player_progress(user_id) VALUES(?)').bind(
          id,
        ),
        env.DB.prepare("INSERT INTO player_inventory VALUES(?,'uniform')").bind(
          id,
        ),
      ]);
    } catch (e) {
      if (String(e).includes('UNIQUE'))
        throw new HttpError(409, '이미 사용 중인 아이디입니다.');
      throw e;
    }
    user = { id, password_hash: hash, salt };
  } else {
    user = await env.DB.prepare(
      'SELECT id,password_hash,salt FROM users WHERE username=?',
    )
      .bind(username)
      .first();
    const actual = await passwordHash(
        password,
        user?.salt ?? 'absent-user-salt',
      ),
      expected = user?.password_hash ?? '0'.repeat(64);
    let diff = 0;
    for (let i = 0; i < 64; i++)
      diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
    if (!user || diff)
      throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
  }
  const raw = token();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()),
    env.DB.prepare('DELETE FROM auth_limits WHERE expires_at<?').bind(
      Date.now(),
    ),
    env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(
      await digest(raw),
      user.id,
      Date.now() + 604800000,
    ),
  ]);
  return json({ profile: await profile(user.id, env) }, 200, {
    'Set-Cookie': cookie(req, raw, 604800),
  });
}
