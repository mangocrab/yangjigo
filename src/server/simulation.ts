import {
  JOBS,
  JOB_IDS,
  type Job,
  ZOMBIE_TYPES,
  type ZombieSpawn,
  MOVE_MS,
  STAGES,
  stageFor,
  objectiveFor,
  tileOpen,
  type Pos,
} from '../shared/content';
import { DIFFICULTIES, EPISODES, type SkinId } from '../shared/rules';
import {
  DIR,
  type GameState,
  type Player,
  type Command,
} from '../shared/protocol';
export const distance = (a: Pos, b: Pos) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function pathStep(
  from: Pos,
  to: Pos,
  open: (x: number, y: number) => boolean,
): Pos | null {
  const key = (p: Pos) => `${p.x},${p.y}`,
    queue = [{ ...from, g: 0, f: distance(from, to) }],
    costs = new Map([[key(from), 0]]),
    parents = new Map<string, Pos>();
  while (queue.length) {
    queue.sort((a, b) => a.f - b.f);
    const cur = queue.shift()!;
    if (distance(cur, to) === 0) {
      let p: Pos = cur,
        prev = parents.get(key(p));
      if (!prev) return null;
      while (prev && key(prev) !== key(from)) {
        p = prev;
        prev = parents.get(key(p));
      }
      return p;
    }
    for (const d of Object.values(DIR)) {
      const n = { x: cur.x + d.x, y: cur.y + d.y },
        g = cur.g + 1;
      if (!open(n.x, n.y) || g >= (costs.get(key(n)) ?? Infinity)) continue;
      costs.set(key(n), g);
      parents.set(key(n), cur);
      queue.push({ ...n, g, f: g + distance(n, to) });
    }
  }
  return null;
}
export function newPlayer(
  id: string,
  name: string,
  now: number,
  skin: SkinId = 'uniform',
  job: Job = 'vanguard',
): Player {
  return {
    id,
    name,
    skin,
    hardTickets: 0,
    weaponAcquired: false,
    rockHits: 0,
    x: 2,
    y: 5,
    dir: 'right',
    hp: JOBS[job].hp,
    job,
    ready: false,
    connected: false,
    lastSeen: now,
    moveAt: 0,
    attackAt: 0,
    skillAt: [0, 0],
    shieldUntil: 0,
    focusUntil: 0,
    attackEffect: 'weapon',
    hitAt: 0,
    attackUntil: 0,
    parts: 0,
    upgrade: 0,
    input: { direction: null, attack: false, at: 0 },
  };
}
export function newState(
  roomId: string,
  title: string,
  channel: string,
  priv: boolean,
  host: string,
): GameState {
  return {
    roomId,
    title,
    channel,
    private: priv,
    host,
    episodeId: 0,
    difficulty: 'normal',
    admissionId: null,
    contentVersion: 4,
    cutscene: null,
    runId: crypto.randomUUID(),
    phase: 'waiting',
    stageIndex: 0,
    stageEpoch: 0,
    mission: 0,
    notice: '동료를 기다립니다.',
    players: [],
    zombies: [],
    startedAt: 0,
    now: 0,
    revision: 0,
    defendUntil: 0,
    pausedAt: 0,
    checkpoint: { stageIndex: 0, players: {} },
  };
}
export function normalizeState(s: GameState) {
  if (s.stageIndex === undefined) {
    s.stageIndex = 1;
    s.stageEpoch = 0;
    s.contentVersion = 1;
    s.checkpoint = { stageIndex: 1, players: {} };
  }
  s.cutscene ??= null;
  s.episodeId ??= 0;
  s.difficulty ??= 'normal';
  s.admissionId ??= null;
  s.pausedAt ??= 0;
  s.defendUntil ??= 0;
  for (const p of s.players) {
    p.skin ??= 'uniform';
    p.hardTickets ??= 0;
    p.focusUntil ??= 0;
    p.attackEffect ??= 'weapon';
    p.weaponAcquired ??= s.contentVersion < 4;
    p.rockHits ??= s.contentVersion < 4 ? 3 : 0;
  }
  if (s.contentVersion === 2 || s.contentVersion === 3) {
    if (s.stageIndex === 0) s.mission = [0, 2, 4, 5][s.mission] ?? s.mission;
    for (const saved of Object.values(s.checkpoint.players)) {
      saved.weaponAcquired ??= true;
      saved.rockHits ??= 3;
    }
    s.contentVersion = 4;
  }
  for (const z of s.zombies) {
    z.maxHp ??= 78;
    z.kind ??= 'student';
    z.stunUntil ??= 0;
  }
  if (s.phase === 'waiting') {
    const occupied = new Set<Job>();
    for (const p of s.players) {
      if (occupied.has(p.job)) {
        const free = JOB_IDS.find(
          (job) =>
            !occupied.has(job) &&
            !s.players.some(
              (q) => q !== p && !occupied.has(q.job) && q.job === job,
            ),
        );
        const replacement = free ?? JOB_IDS.find((job) => !occupied.has(job));
        if (replacement) {
          p.job = replacement;
          p.hp = JOBS[replacement].hp;
          p.ready = false;
        }
      }
      occupied.add(p.job);
    }
  }
  return s;
}
export function vacantJob(s: Pick<GameState, 'players'>): Job | undefined {
  return JOB_IDS.find((job) => !s.players.some((p) => p.job === job));
}
export function setActiveClock(s: GameState, now: number, active: boolean) {
  if (s.phase !== 'playing') return;
  if (!active && !s.pausedAt) s.pausedAt = now;
  if (active && s.pausedAt) {
    if (s.defendUntil) s.defendUntil += Math.max(0, now - s.pausedAt);
    s.pausedAt = 0;
  }
}
function spawnZombies(
  s: GameState,
  points: ZombieSpawn[],
  now: number,
  offset = 0,
) {
  return points.map(({ x, y, kind }, i) => ({
    id: `${s.stageEpoch}:z${i + offset}`,
    x,
    y,
    kind,
    spawnX: x,
    spawnY: y,
    hp: Math.round(DIFFICULTIES[s.difficulty].zombieHp * ZOMBIE_TYPES[kind].hp),
    maxHp: Math.round(
      DIFFICULTIES[s.difficulty].zombieHp * ZOMBIE_TYPES[kind].hp,
    ),
    moveAt: now + 1500,
    attackAt: 0,
    state: 'idle',
    stunUntil: 0,
  }));
}
export function loadStage(
  s: GameState,
  index: number,
  now: number,
  restore = false,
) {
  s.stageIndex = index;
  s.stageEpoch++;
  s.mission = 0;
  s.defendUntil = 0;
  s.pausedAt = 0;
  s.phase = 'playing';
  s.now = now;
  const stage = stageFor(s);
  s.notice = `체크포인트: ${stage.name}`;
  s.zombies = spawnZombies(s, stage.zombies, now);
  for (const [i, p] of s.players.entries()) {
    const saved = restore ? s.checkpoint.players[p.id] : undefined;
    Object.assign(p, stage.spawns[i], {
      hp: saved?.hp ?? Math.min(JOBS[p.job].hp, p.hp + 35),
      parts: saved?.parts ?? p.parts,
      upgrade: saved?.upgrade ?? p.upgrade,
      weaponAcquired: saved?.weaponAcquired ?? p.weaponAcquired,
      rockHits: saved?.rockHits ?? p.rockHits,
      ready: false,
      moveAt: now,
      attackAt: 0,
      attackUntil: 0,
      hitAt: 0,
      shieldUntil: 0,
      focusUntil: 0,
      attackEffect: 'weapon',
      skillAt: [0, 0],
      input: { direction: null, attack: false, at: now },
    });
  }
  if (s.contentVersion >= 4)
    beginScene(s, (['outbreak', 'hall', 'yard'] as const)[index]);
  if (!restore)
    s.checkpoint = {
      stageIndex: index,
      players: Object.fromEntries(
        s.players.map((p) => [
          p.id,
          {
            hp: p.hp,
            parts: p.parts,
            upgrade: p.upgrade,
            weaponAcquired: p.weaponAcquired,
            rockHits: p.rockHits,
          },
        ]),
      ),
    };
}
function beginScene(
  s: GameState,
  key: NonNullable<GameState['cutscene']>['key'],
) {
  s.cutscene = { id: crypto.randomUUID(), key, acknowledged: [] };
  s.players.forEach(
    (p) => (p.input = { direction: null, attack: false, at: s.now }),
  );
}
function finishScene(s: GameState, now: number) {
  const scene = s.cutscene;
  if (
    !scene ||
    !s.players.some((p) => p.connected) ||
    s.players.some((p) => p.connected && !scene.acknowledged.includes(p.id))
  )
    return;
  s.cutscene = null;
  if (scene.key === 'ending') {
    s.phase = 'clear';
    return;
  }
  if (s.defendUntil) s.defendUntil += Math.max(0, now - s.now);
  s.players.forEach((p) => {
    p.input = { direction: null, attack: false, at: now };
    p.moveAt = now;
  });
  s.zombies.forEach((z) => {
    z.moveAt = now + 1500;
    z.attackAt = now + 1000;
  });
  s.now = now;
}
export function start(s: GameState, now: number) {
  s.startedAt = now;
  s.runId = crypto.randomUUID();
  s.contentVersion = 4;
  for (const p of s.players) {
    p.hp = JOBS[p.job].hp;
    p.parts = 0;
    p.weaponAcquired = false;
    p.rockHits = 0;
    p.upgrade = 0;
  }
  loadStage(s, 0, now);
}
function advance(s: GameState, now: number) {
  s.mission++;
  if (
    objectiveFor(s)?.kind === 'practice' &&
    s.players.reduce((n, p) => n + p.rockHits, 0) >= 3
  )
    s.mission++;
  const o = objectiveFor(s);
  s.notice = o?.text ?? '임무 완료';
  if (o?.kind === 'survive') {
    s.defendUntil = now + o.durationMs!;
    s.zombies.push(...spawnZombies(s, stageFor(s).wave, now, s.zombies.length));
  }
}
function attack(
  s: GameState,
  p: Player,
  now: number,
  range: number = JOBS[p.job].range,
  damage = JOBS[p.job].damage * (1 + p.upgrade * 0.2),
  push = false,
) {
  p.attackUntil = now + 180;
  p.attackEffect = 'weapon';
  const dir = DIR[p.dir],
    hit = new Set<string>();
  for (let i = 1; i <= range; i++) {
    const x = p.x + dir.x * i,
      y = p.y + dir.y * i;
    if (!tileOpen(s, x, y)) break;
    for (const z of s.zombies.filter(
      (z) => z.hp > 0 && z.x === x && z.y === y && !hit.has(z.id),
    )) {
      hit.add(z.id);
      if (!p.weaponAcquired) p.rockHits++;
      z.hp = Math.max(0, z.hp - damage);
      const nx = z.x + dir.x,
        ny = z.y + dir.y;
      if (
        push &&
        tileOpen(s, nx, ny) &&
        !s.players.some((q) => q.hp > 0 && q.x === nx && q.y === ny) &&
        !s.zombies.some((q) => q !== z && q.hp > 0 && q.x === nx && q.y === ny)
      ) {
        z.x = nx;
        z.y = ny;
      }
      if (!z.hp) p.parts += 2;
    }
  }
  if (
    objectiveFor(s)?.kind === 'practice' &&
    s.players.reduce((n, q) => n + q.rockHits, 0) >= 3
  )
    advance(s, now);
}
export function command(
  s: GameState,
  id: string,
  c: Command,
  now: number,
): string | undefined {
  const p = s.players.find((p) => p.id === id);
  if (!p) return '참가자가 아닙니다.';
  if (c.type === 'scene-done') {
    if (!s.cutscene || s.cutscene.id !== c.sceneId)
      return '이미 끝난 장면입니다.';
    if (!s.cutscene.acknowledged.includes(id)) s.cutscene.acknowledged.push(id);
    finishScene(s, now);
    return;
  }
  if (c.type === 'input') {
    if (s.cutscene) return;
    p.input = { direction: c.direction, attack: c.attack, at: now };
    return;
  }
  if (c.type === 'refresh') return;
  if (c.type === 'configure') {
    if (s.phase !== 'waiting' || id !== s.host)
      return '대기실 방장만 설정할 수 있습니다.';
    if (!EPISODES.some((e) => e.id === c.episodeId && e.available))
      return '아직 준비 중인 에피소드입니다.';
    if (c.episodeId !== s.episodeId || c.difficulty !== s.difficulty) {
      s.episodeId = c.episodeId;
      s.difficulty = c.difficulty;
      s.players.forEach((q) => (q.ready = false));
    }
    return;
  }
  if (c.type === 'job' || c.type === 'ready') {
    if (s.phase !== 'waiting') return '대기실에서만 변경할 수 있습니다.';
    if (c.type === 'job') {
      if (p.job === c.job) return;
      const occupant = s.players.find((q) => q.id !== id && q.job === c.job);
      if (occupant)
        return `이미 ${occupant.name}님이 선택한 직업입니다. 다른 직업을 선택하세요.`;
      p.job = c.job;
      p.hp = JOBS[p.job].hp;
      p.ready = false;
    } else {
      if (c.ready && s.players.some((q) => q.id !== id && q.job === p.job))
        return '직업이 중복됩니다. 다른 직업을 선택하세요.';
      p.ready = c.ready;
    }
    return;
  }
  if (c.type === 'start' || c.type === 'retry' || c.type === 'restart') {
    if (id !== s.host) return '방장만 시작할 수 있습니다.';
    if (
      c.type === 'start' &&
      new Set(s.players.map((q) => q.job)).size !== s.players.length
    )
      return '직업이 중복됩니다. 각자 다른 직업을 선택하세요.';
    if (s.players.some((q) => !q.connected))
      return '모든 동료가 연결되어야 합니다.';
    if (
      c.type === 'start' &&
      (s.phase !== 'waiting' || s.players.some((q) => !q.ready))
    )
      return '모두 준비해야 시작할 수 있습니다.';
    if (c.type !== 'start' && s.phase !== 'over')
      return '실패한 게임만 재도전할 수 있습니다.';
    if (s.difficulty === 'hard' && !s.admissionId)
      return '하드 티켓 입장 검증이 필요합니다.';
    if (c.type === 'retry') {
      s.runId = crypto.randomUUID();
      loadStage(s, s.checkpoint.stageIndex, now, true);
    } else start(s, now);
    return;
  }
  if (s.phase !== 'playing' || p.hp <= 0) return '현재 행동할 수 없습니다.';
  if (s.cutscene) return '이야기를 확인한 뒤 진행하세요.';
  if (c.type === 'skill') {
    if (!p.weaponAcquired)
      return '비상 장비함에서 무기를 얻어야 스킬을 사용할 수 있습니다.';
    const i = c.slot - 1;
    if (now < p.skillAt[i]) return '스킬 재사용 대기 중입니다.';
    if (p.job === 'vanguard') {
      if (c.slot === 1) attack(s, p, now, 2, 42, true);
      else p.shieldUntil = now + 5000;
    } else if (p.job === 'medic') {
      const targets = s.players.filter((q) => distance(p, q) <= 3);
      if (c.slot === 1)
        targets
          .filter((q) => q.hp > 0)
          .forEach((q) => (q.hp = Math.min(JOBS[q.job].hp, q.hp + 35)));
      else {
        const q = targets.find((q) => q.hp === 0);
        if (!q) return '가까운 곳에 쓰러진 동료가 없습니다.';
        q.hp = 50;
      }
    } else if (p.job === 'ranger') {
      if (c.slot === 1) attack(s, p, now, 6, 54);
      else p.focusUntil = now + 6000;
    } else if (p.job === 'engineer') {
      if (c.slot === 1) {
        p.attackUntil = now + 260;
        p.attackEffect = 'pulse';
        const area = new Set([`${p.x},${p.y}`]),
          queue = [{ x: p.x, y: p.y, steps: 0 }];
        for (let n = 0; n < queue.length; n++) {
          const current = queue[n];
          if (current.steps >= 2) continue;
          for (const d of Object.values(DIR)) {
            const x = current.x + d.x,
              y = current.y + d.y,
              key = `${x},${y}`;
            if (tileOpen(s, x, y) && !area.has(key)) {
              area.add(key);
              queue.push({ x, y, steps: current.steps + 1 });
            }
          }
        }
        for (const z of s.zombies.filter(
          (z) => z.hp > 0 && area.has(`${z.x},${z.y}`),
        )) {
          z.hp = Math.max(0, z.hp - 36);
          z.stunUntil = now + 1500;
          if (!z.hp) p.parts += 2;
        }
      } else
        for (const q of s.players.filter(
          (q) => q.hp > 0 && distance(p, q) <= 2,
        ))
          q.shieldUntil = Math.max(q.shieldUntil, now + 3000);
    }
    p.skillAt[i] = now + (c.slot === 1 ? 6000 : 10000);
    return;
  }
  if (c.type === 'upgrade') {
    if (s.episodeId === 0) return '에피소드 0에는 무기 작업대가 없습니다.';
    const b = stageFor(s).objects.find((o) => o.kind === 'bench');
    if (!b || distance(p, b) > 1) return '작업대에 가까이 가세요.';
    const cost = (p.upgrade + 1) * 3;
    if (p.upgrade >= 4 || p.parts < cost)
      return '최대 강화 단계이거나 부품이 부족합니다.';
    p.parts -= cost;
    p.upgrade++;
    return;
  }
  const objective = objectiveFor(s),
    stage = stageFor(s);
  if (c.type === 'puzzle') {
    const target = stage.objects.find((o) => o.id === objective?.target);
    if (objective?.kind !== 'puzzle' || !target || distance(p, target) > 1)
      return '잠금장치에 인접해야 합니다.';
    if (c.code !== objective.code)
      return '번호가 맞지 않습니다. 칠판을 확인하세요.';
    advance(s, now);
    return;
  }
  if (c.type === 'interact') {
    const down = s.players.find(
      (q) => q.id !== id && !q.hp && distance(p, q) <= 1,
    );
    if (down) {
      down.hp = 35;
      return;
    }
    const near = stage.objects.filter((o) => distance(p, o) <= 1),
      target = near.find((o) => o.id === objective?.target) ?? near[0];
    if (!target) return '가까운 상호작용 대상이 없습니다.';
    if (target.kind === 'hint') {
      s.notice = target.text!;
      return;
    }
    if (target.kind === 'gear' && objective?.kind === 'equip') {
      p.weaponAcquired = true;
      s.notice = `${p.name}: ${JOBS[p.job].weapon} 획득 · ${JOBS[p.job].skills.join(' / ')} 해금`;
      if (s.players.every((q) => q.weaponAcquired)) {
        advance(s, now);
        beginScene(s, 'weapons');
      }
      return;
    }
    if (target.kind === 'bench') return '작업대에서 강화 버튼을 사용하세요.';
    if (target.id !== objective?.target) return '현재 임무를 먼저 완료하세요.';
    if (objective.kind === 'practice')
      return '공격 버튼으로 돌을 세 번 맞히세요.';
    if (objective.kind === 'puzzle') return '세 자리 번호를 입력하세요.';
    if (objective.kind === 'survive') return '정문 개방 중입니다.';
    if (objective.kind === 'rally') {
      if (
        s.players.some((q) => !q.hp || !q.connected || distance(q, target) > 3)
      )
        return '동료를 구조하고 전원이 출입구로 모이세요.';
      if (s.stageIndex === STAGES.length - 1 || s.contentVersion === 1) {
        if (s.contentVersion >= 4) beginScene(s, 'ending');
        else s.phase = 'clear';
        s.notice =
          '학교 밖의 도시도 이미 멈춰 있었습니다. 금강 쪽 구조 신호를 따라, 다음 생존 기록이 시작됩니다.';
      } else loadStage(s, s.stageIndex + 1, now);
      return;
    }
    if (objective.kind === 'collect') p.parts += 3;
    advance(s, now);
    if (target.kind === 'npc') s.notice = target.text!;
  }
}
export function tick(s: GameState, now: number) {
  if (s.cutscene) {
    finishScene(s, now);
    if (s.cutscene) return;
  }
  s.now = now;
  if (s.phase !== 'playing') return;
  const rules = DIFFICULTIES[s.difficulty];
  for (const p of s.players) {
    if (!p.hp || !p.connected || now - p.input.at > 900) continue;
    const d = p.input.direction;
    if (d && now >= p.moveAt) {
      p.dir = d;
      p.moveAt = now + MOVE_MS;
      const x = p.x + DIR[d].x,
        y = p.y + DIR[d].y;
      if (
        tileOpen(s, x, y) &&
        !s.zombies.some((z) => z.hp > 0 && z.x === x && z.y === y)
      ) {
        p.x = x;
        p.y = y;
      }
    }
    if (p.input.attack && now >= p.attackAt) {
      p.attackAt =
        now +
        (p.weaponAcquired
          ? Math.round(JOBS[p.job].attackMs * (p.focusUntil > now ? 0.5 : 1))
          : 520);
      if (p.weaponAcquired) attack(s, p, now);
      else attack(s, p, now, 3, 14);
    }
  }
  for (const z of s.zombies.filter((z) => z.hp > 0)) {
    if (z.stunUntil > now) {
      z.state = 'stunned';
      continue;
    }
    const target = s.players
      .filter((p) => p.hp > 0 && p.connected)
      .sort((a, b) => distance(a, z) - distance(b, z))[0];
    if (!target) continue;
    const dist = distance(z, target),
      archetype = ZOMBIE_TYPES[z.kind];
    const damage = Math.round(rules.damage * archetype.damage);
    if (dist <= 1) {
      z.state = 'attack';
      if (now >= z.attackAt && now >= target.hitAt) {
        target.hp = Math.max(
          0,
          target.hp -
            (now < target.shieldUntil ? Math.ceil(damage / 3) : damage),
        );
        target.hitAt = now + 650;
        z.attackAt = now + Math.round(rules.attackMs * archetype.speed);
      }
    } else if (now >= z.moveAt) {
      z.moveAt = now + Math.round(rules.moveMs * archetype.speed);
      z.state = dist <= archetype.sight ? 'chase' : 'return';
      const next = pathStep(
        z,
        dist <= archetype.sight ? target : { x: z.spawnX, y: z.spawnY },
        (x, y) => tileOpen(s, x, y),
      );
      if (
        next &&
        !s.zombies.some(
          (q) => q !== z && q.hp > 0 && q.x === next.x && q.y === next.y,
        )
      ) {
        z.x = next.x;
        z.y = next.y;
      }
    }
  }
  if (s.players.length && s.players.every((p) => !p.hp)) {
    s.phase = 'over';
    s.notice = '모든 동료가 쓰러졌습니다. 체크포인트에서 다시 도전하세요.';
  } else if (
    objectiveFor(s)?.kind === 'survive' &&
    s.defendUntil &&
    now >= s.defendUntil
  )
    advance(s, now);
}
