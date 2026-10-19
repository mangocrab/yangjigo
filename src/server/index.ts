import { auth, body, HttpError, json, profile, session, limit } from './auth';
import { account, catalog, purchase, equip } from './economy';
import type { GameRoom } from './room';
import type { Lobby } from './lobby';
export { GameRoom } from './room';
export { Lobby } from './lobby';
export interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace<GameRoom>;
  LOBBY: DurableObjectNamespace<Lobby>;
  ASSETS: Fetcher;
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url),
      path = u.pathname;
    try {
      if (!path.startsWith('/api/')) return env.ASSETS.fetch(req);
      if (
        (req.method !== 'GET' || req.headers.get('Upgrade')) &&
        req.headers.get('Origin') !== u.origin
      )
        throw new HttpError(403, '요청 출처가 올바르지 않습니다.');
      if (
        req.method === 'POST' &&
        ['/api/register', '/api/login', '/api/logout'].includes(path)
      )
        return await auth(req, env, path.slice(5));
      const user = await session(req, env);
      if (path === '/api/me' && req.method === 'GET')
        return json({ profile: await profile(user.id, env) });
      if (path === '/api/account' && req.method === 'GET')
        return json(await account(user.id, env));
      if (path === '/api/shop' && req.method === 'GET')
        return json({ items: await catalog(env) });
      if (path === '/api/shop/purchase' && req.method === 'POST')
        return json(await purchase(user.id, await body(req), env));
      if (path === '/api/skins/equip' && req.method === 'POST')
        return json(await equip(user.id, (await body(req)).skinId, env));
      if (path === '/api/rooms' && req.method === 'GET')
        return env.LOBBY.getByName('directory').fetch(
          `https://internal/?channel=${encodeURIComponent(u.searchParams.get('channel') ?? '세종-1')}`,
        );
      if (path === '/api/rooms' && req.method === 'POST') {
        const d = await body(req);
        if (
          typeof d.title !== 'string' ||
          d.title.trim().length < 2 ||
          d.title.length > 32 ||
          !['세종-1', '세종-2'].includes(String(d.channel)) ||
          typeof d.private !== 'boolean'
        )
          throw new HttpError(400, '방 설정을 확인하세요.');
        await limit(env, `room:${user.id}`, 8);
        const id = crypto.randomUUID();
        return env.ROOMS.getByName(id).fetch('https://internal/init', {
          method: 'POST',
          body: JSON.stringify({
            roomId: id,
            id: user.id,
            name: user.nickname,
            skin: user.equipped_skin,
            title: d.title.trim(),
            channel: d.channel,
            private: d.private,
          }),
        });
      }
      const match = path.match(
        /^\/api\/rooms\/([a-f0-9-]{36})\/(join|ws|leave)$/,
      );
      if (match) {
        const [, id, action] = match;
        if (req.method !== (action === 'ws' ? 'GET' : 'POST'))
          throw new HttpError(405, '허용되지 않는 메서드입니다.');
        const d = action === 'join' ? await body(req) : {};
        const headers = new Headers({ 'X-User-Id': user.id });
        if (action === 'ws') headers.set('Upgrade', 'websocket');
        return env.ROOMS.getByName(id).fetch(`https://internal/${action}`, {
          method: action === 'ws' ? 'GET' : 'POST',
          headers,
          body:
            action === 'ws'
              ? undefined
              : JSON.stringify({
                  name: user.nickname,
                  skin: user.equipped_skin,
                  invite: d.invite,
                }),
        });
      }
      throw new HttpError(404, 'API를 찾을 수 없습니다.');
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error('API 오류', e instanceof Error ? e.message : 'unknown');
      return json({ error: '서버 처리 중 오류가 발생했습니다.' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
