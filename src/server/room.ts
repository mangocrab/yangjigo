import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import { HttpError, json, token } from './auth';
import { admitHard, refreshTickets } from './economy';
import {
  newPlayer,
  newState,
  normalizeState,
  command,
  tick,
  setActiveClock,
} from './simulation';
import {
  parseCommand,
  type GameState,
  type RoomSummary,
} from '../shared/protocol';
import { isSkin } from '../shared/rules';
interface Saved {
  state: GameState;
  invite: string;
  rewardSaved: boolean;
  pending: GameState | null;
}
export class GameRoom extends DurableObject<Env> {
  state!: GameState;
  invite = '';
  rewardSaved = false;
  pending: GameState | null = null;
  timer: number | null = null;
  busy = false;
  lastSave = 0;
  signature = '';
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const d = await ctx.storage.get<Saved>('data');
      if (!d) return;
      this.state = normalizeState(d.state);
      this.invite = d.invite;
      this.rewardSaved = d.rewardSaved;
      this.pending = d.pending ?? null;
      if (this.pending) await this.finishAdmission();
      for (const p of this.state.players) {
        p.connected = ctx.getWebSockets(p.id).length > 0;
        if (!p.connected) p.lastSeen = Date.now();
        p.input = { direction: null, attack: false, at: 0 };
      }
      setActiveClock(
        this.state,
        Date.now(),
        this.state.players.some((p) => p.connected),
      );
      if (
        this.state.phase === 'playing' &&
        this.state.players.some((p) => p.connected)
      )
        this.run();
    });
  }
  async persist() {
    if (this.state)
      await this.ctx.storage.put('data', {
        state: this.state,
        invite: this.invite,
        rewardSaved: this.rewardSaved,
        pending: this.pending,
      } satisfies Saved);
  }
  async finishAdmission() {
    if (!this.pending) return;
    try {
      await admitHard(this.pending, this.env);
    } catch (e) {
      if (e instanceof HttpError) {
        this.pending = null;
        await this.persist();
        return e.message;
      }
      throw e;
    }
    this.state = this.pending;
    this.pending = null;
    this.rewardSaved = false;
    await refreshTickets(this.state, this.env);
    await this.persist();
  }
  async publish() {
    const s = this.state;
    if (!s) return;
    const room: RoomSummary = {
      id: s.roomId,
      title: s.title,
      channel: s.channel,
      episodeId: s.episodeId,
      difficulty: s.difficulty,
      count: s.players.length,
      phase: s.phase,
      private: s.private,
      updatedAt: Date.now(),
    };
    await this.env.LOBBY.getByName('directory').fetch(
      'https://internal/register',
      { method: 'POST', body: JSON.stringify({ room }) },
    );
  }
  broadcast() {
    if (!this.state) return;
    this.state.revision++;
    const data = JSON.stringify({ v: 1, type: 'snapshot', state: this.state });
    for (const ws of this.ctx.getWebSockets())
      try {
        ws.send(data);
      } catch {}
  }
  transfer() {
    if (
      !this.state.players.some((p) => p.id === this.state.host && p.connected)
    )
      this.state.host =
        this.state.players.find((p) => p.connected)?.id ??
        this.state.players[0]?.id ??
        '';
  }
  async fetch(req: Request): Promise<Response> {
    try {
      const path = new URL(req.url).pathname;
      if (path === '/init') {
        if (this.state) throw new HttpError(409, '이미 생성된 방입니다.');
        const d = (await req.json()) as {
          roomId: string;
          id: string;
          name: string;
          title: string;
          channel: string;
          private: boolean;
          skin: unknown;
        };
        this.state = newState(d.roomId, d.title, d.channel, d.private, d.id);
        this.invite = token().slice(0, 12);
        this.state.players.push(
          newPlayer(
            d.id,
            d.name,
            Date.now(),
            isSkin(d.skin) ? d.skin : 'uniform',
          ),
        );
        await refreshTickets(this.state, this.env);
        await this.persist();
        await this.publish();
        await this.ctx.storage.setAlarm(Date.now() + 30000);
        return json({ id: d.roomId, invite: this.invite });
      }
      if (!this.state) throw new HttpError(404, '존재하지 않는 방입니다.');
      const id = req.headers.get('X-User-Id')!;
      if (path === '/join') {
        const d = (await req.json()) as {
          name: string;
          invite: string;
          skin: unknown;
        };
        let p = this.state.players.find((p) => p.id === id);
        if (!p) {
          if (this.state.private && d.invite !== this.invite)
            throw new HttpError(403, '초대 코드가 올바르지 않습니다.');
          if (this.state.phase !== 'waiting')
            throw new HttpError(409, '진행 중인 방에 새로 참가할 수 없습니다.');
          if (this.state.players.length >= 4)
            throw new HttpError(409, '방이 가득 찼습니다.');
          p = newPlayer(
            id,
            d.name,
            Date.now(),
            isSkin(d.skin) ? d.skin : 'uniform',
          );
          this.state.players.push(p);
        }
        p.lastSeen = Date.now();
        await refreshTickets(this.state, this.env);
        await this.persist();
        await this.publish();
        this.broadcast();
        return json({ id: this.state.roomId, invite: this.invite });
      }
      const p = this.state.players.find((p) => p.id === id);
      if (!p) throw new HttpError(403, '참가 권한이 없습니다.');
      if (path === '/leave') {
        for (const ws of this.ctx.getWebSockets(id)) ws.close(1000, '퇴장');
        this.state.players = this.state.players.filter((p) => p.id !== id);
        this.transfer();
        await this.persist();
        await this.publish();
        this.broadcast();
        return json({ ok: true });
      }
      if (path === '/ws') {
        if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
          throw new HttpError(426, 'WebSocket 연결이 필요합니다.');
        for (const ws of this.ctx.getWebSockets(id))
          ws.close(4001, '다른 창에서 접속');
        const pair = new WebSocketPair();
        this.ctx.acceptWebSocket(pair[1], [id]);
        pair[1].serializeAttachment({ id, at: Date.now(), count: 0 });
        setActiveClock(this.state, Date.now(), true);
        p.connected = true;
        p.lastSeen = Date.now();
        p.input = { direction: null, attack: false, at: 0 };
        this.broadcast();
        if (this.state.phase === 'playing') this.run();
        await this.publish();
        await this.ctx.storage.setAlarm(Date.now() + 30000);
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      throw new HttpError(404, '잘못된 경로입니다.');
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      throw e;
    }
  }
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as {
      id: string;
      at: number;
      count: number;
    };
    if (Date.now() - a.at > 1000) {
      a.at = Date.now();
      a.count = 0;
    }
    a.count++;
    ws.serializeAttachment(a);
    if (a.count > 40 || typeof raw !== 'string' || raw.length > 512) {
      ws.close(1008, '메시지 제한');
      return;
    }
    let c;
    try {
      c = parseCommand(JSON.parse(raw));
    } catch {
      c = null;
    }
    if (!c) {
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'error',
          message: '유효하지 않은 명령입니다.',
        }),
      );
      return;
    }
    let error: string | undefined;
    if (
      c.type === 'start' &&
      this.state.difficulty === 'hard' &&
      this.state.phase === 'waiting'
    ) {
      await this.ctx.blockConcurrencyWhile(async () => {
        const next = structuredClone(this.state);
        next.admissionId = crypto.randomUUID();
        error = command(next, a.id, c!, Date.now());
        if (error) return;
        this.pending = next;
        await this.persist();
        error = await this.finishAdmission();
      });
    } else error = command(this.state, a.id, c, Date.now());
    if (error) ws.send(JSON.stringify({ v: 1, type: 'error', message: error }));
    if (!error && ['start', 'retry', 'restart'].includes(c.type)) {
      this.rewardSaved = false;
      this.run();
    }
    if (this.state.phase === 'clear' && !this.rewardSaved) await this.reward();
    if (c.type !== 'input') {
      if (this.state.phase === 'waiting')
        await refreshTickets(this.state, this.env);
      await this.persist();
      await this.publish();
      this.broadcast();
    }
  }
  run() {
    if (!this.timer) this.timer = setInterval(() => void this.step(), 35);
  }
  async step() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (!this.state.players.some((p) => p.connected)) {
        setActiveClock(this.state, Date.now(), false);
        clearInterval(this.timer);
        this.timer = null;
        await this.persist();
        return;
      }
      tick(this.state, Date.now());
      if (this.state.phase === 'clear' && !this.rewardSaved)
        await this.reward();
      const sig = JSON.stringify({ ...this.state, now: 0, revision: 0 });
      if (sig !== this.signature) {
        this.signature = sig;
        this.broadcast();
      }
      if (Date.now() - this.lastSave > 2000) {
        this.lastSave = Date.now();
        await this.persist();
      }
      if (this.state.phase !== 'playing') {
        clearInterval(this.timer);
        this.timer = null;
        await this.persist();
        await this.publish();
      }
    } catch (e) {
      console.error('방 갱신 실패', e instanceof Error ? e.message : 'unknown');
    } finally {
      this.busy = false;
    }
  }
  async reward() {
    await this.env.DB.batch(
      this.state.players.map((p) =>
        this.env.DB.prepare(
          'INSERT OR IGNORE INTO stage_records(run_id,user_id,duration,content_version,episode_id,difficulty) VALUES(?,?,?,?,?,?)',
        ).bind(
          this.state.runId,
          p.id,
          Math.max(0, Math.floor((Date.now() - this.state.startedAt) / 1000)),
          this.state.contentVersion,
          this.state.episodeId,
          this.state.difficulty,
        ),
      ),
    );
    this.rewardSaved = true;
    await refreshTickets(this.state, this.env);
    await this.persist();
  }
  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code);
    } catch {}
    await this.disconnect(ws);
  }
  async webSocketError(ws: WebSocket) {
    await this.disconnect(ws);
  }
  async disconnect(ws: WebSocket) {
    const a = ws.deserializeAttachment() as { id: string } | null;
    if (!a || !this.state) return;
    if (
      this.ctx
        .getWebSockets(a.id)
        .some((other) => other !== ws && other.readyState === 1)
    )
      return;
    const p = this.state.players.find((p) => p.id === a.id);
    if (p) {
      p.connected = false;
      p.lastSeen = Date.now();
      p.input = { direction: null, attack: false, at: 0 };
    }
    setActiveClock(
      this.state,
      Date.now(),
      this.state.players.some((p) => p.connected),
    );
    this.transfer();
    await this.persist();
    await this.publish();
    this.broadcast();
    await this.ctx.storage.setAlarm(Date.now() + 30000);
  }
  async alarm() {
    if (!this.state) return;
    this.state.players = this.state.players.filter(
      (p) => p.connected || Date.now() - p.lastSeen < 60000,
    );
    this.transfer();
    if (!this.state.players.length) {
      clearInterval(this.timer);
      this.timer = null;
      await this.env.LOBBY.getByName('directory').fetch(
        'https://internal/remove',
        { method: 'POST', body: JSON.stringify({ id: this.state.roomId }) },
      );
      await this.ctx.storage.deleteAll();
      return;
    }
    if (this.state.phase === 'clear' && !this.rewardSaved) await this.reward();
    if (this.state.phase === 'waiting')
      await refreshTickets(this.state, this.env);
    await this.persist();
    await this.publish();
    this.broadcast();
    await this.ctx.storage.setAlarm(Date.now() + 30000);
  }
}
