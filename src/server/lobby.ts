import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import type { RoomSummary } from '../shared/protocol';
import { json } from './auth';
export class Lobby extends DurableObject<Env> {
  async fetch(req: Request) {
    const u = new URL(req.url);
    if (req.method === 'GET') {
      const entries = await this.ctx.storage.list<RoomSummary>({
          prefix: 'room:',
        }),
        rooms = [...entries.values()].filter(
          (r) => Date.now() - r.updatedAt < 120000,
        );
      return json({
        rooms: rooms.filter(
          (r) => !r.private && r.channel === u.searchParams.get('channel'),
        ),
        channels: ['세종-1', '세종-2'].map((name) => ({
          name,
          count: rooms
            .filter((r) => r.channel === name)
            .reduce((n, r) => n + r.count, 0),
        })),
      });
    }
    const d = (await req.json()) as { room?: RoomSummary; id?: string };
    if (d.room) {
      await this.ctx.storage.put(`room:${d.room.id}`, d.room);
      await this.ctx.storage.setAlarm(Date.now() + 120000);
    } else if (d.id) await this.ctx.storage.delete(`room:${d.id}`);
    return json({ ok: true });
  }
  async alarm() {
    const all = await this.ctx.storage.list<RoomSummary>({ prefix: 'room:' });
    for (const [key, r] of all)
      if (Date.now() - r.updatedAt >= 120000)
        await this.ctx.storage.delete(key);
    if (all.size) await this.ctx.storage.setAlarm(Date.now() + 120000);
  }
}
