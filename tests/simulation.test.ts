import { describe, it, expect } from 'vitest';
import {
  newState,
  normalizeState,
  newPlayer,
  start,
  command,
  tick,
  pathStep,
  loadStage,
  setActiveClock,
} from '../src/server/simulation';
import { STAGES, JOBS, ZOMBIE_TYPES, tileOpen } from '../src/shared/content';
import { DIFFICULTIES, type Difficulty } from '../src/shared/rules';
import { parseCommand } from '../src/shared/protocol';
import { vectorDirection } from '../src/client/input';
function acknowledge(s: ReturnType<typeof newState>) {
  for (const p of s.players.filter((p) => p.connected)) {
    if (s.cutscene)
      command(
        s,
        p.id,
        { v: 1, type: 'scene-done', sceneId: s.cutscene.id },
        s.now,
      );
  }
}
function enter(s: ReturnType<typeof newState>, index: number, now: number) {
  loadStage(s, index, now);
  acknowledge(s);
}
const setup = (difficulty: Difficulty = 'normal') => {
  const s = newState('r', '작전', '세종-1', false, 'a');
  s.difficulty = difficulty;
  s.players = [newPlayer('a', '선봉', 1000), newPlayer('b', '의무', 1000)];
  s.players.forEach((p) => (p.connected = true));
  start(s, 1000);
  acknowledge(s);
  return s;
};
describe('입력과 서버 권한', () => {
  it('한 칸·140ms 간격·벽·오래된 입력 종료', () => {
    const s = setup();
    s.zombies = [];
    const p = s.players[0];
    command(
      s,
      'a',
      { v: 1, type: 'input', direction: 'right', attack: false },
      1000,
    );
    tick(s, 1000);
    expect(p.x).toBe(3);
    tick(s, 1100);
    expect(p.x).toBe(3);
    tick(s, 1140);
    expect(p.x).toBe(4);
    p.x = 5;
    tick(s, 1300);
    expect(p.x).toBe(5);
    p.x = 2;
    tick(s, 2000);
    expect(p.x).toBe(2);
  });
  it('대각선·좌표 위조·잘못된 버전·번호 형식 거부', () => {
    for (const m of [
      { v: 2, type: 'start' },
      { v: 1, type: 'teleport', x: 99 },
      { v: 1, type: 'input', direction: 'diagonal', attack: false },
      { v: 1, type: 'input', direction: '__proto__', attack: true },
      { v: 1, type: 'puzzle', code: '3141' },
      { v: 1, type: 'configure', episodeId: 0, difficulty: 'admin' },
    ])
      expect(parseCommand(m)).toBeNull();
  });
  it('방장·준비·플레이 가능 에피소드·변경 시 준비 초기화', () => {
    const s = setup();
    s.phase = 'waiting';
    s.players.forEach((p) => (p.ready = true));
    expect(
      command(
        s,
        'b',
        { v: 1, type: 'configure', episodeId: 0, difficulty: 'easy' },
        0,
      ),
    ).toBeTruthy();
    expect(
      command(
        s,
        'a',
        { v: 1, type: 'configure', episodeId: 1, difficulty: 'easy' },
        0,
      ),
    ).toBeTruthy();
    command(
      s,
      'a',
      { v: 1, type: 'configure', episodeId: 0, difficulty: 'easy' },
      0,
    );
    expect(s.players.every((p) => !p.ready)).toBe(true);
    expect(command(s, 'a', { v: 1, type: 'start' }, 0)).toBeTruthy();
  });
  it('하드는 서버 입장 검증 없이는 시작 불가, 시작 후 설정 변경 불가', () => {
    const s = setup();
    s.phase = 'waiting';
    s.difficulty = 'hard';
    s.players.forEach((p) => (p.ready = true));
    expect(command(s, 'a', { v: 1, type: 'start' }, 0)).toContain('검증');
    s.admissionId = 'paid';
    command(s, 'a', { v: 1, type: 'start' }, 1000);
    expect(s.phase).toBe('playing');
    expect(
      command(
        s,
        'a',
        { v: 1, type: 'configure', episodeId: 0, difficulty: 'easy' },
        2000,
      ),
    ).toBeTruthy();
  });
  it('독립 터치의 주축·데드존·히스테리시스', () => {
    expect(vectorDirection(2, 2, null)).toBeNull();
    expect(vectorDirection(45, 10, null)).toBe('right');
    expect(vectorDirection(-30, 10, null)).toBe('left');
    expect(vectorDirection(10, -30, null)).toBe('up');
    expect(vectorDirection(30, 32, 'right')).toBe('right');
    expect(vectorDirection(20, 40, 'right')).toBe('down');
  });
});
describe('에피소드 0 진행과 체크포인트', () => {
  it('각 맵의 모든 객체와 스폰에 문 개방 후 도달 가능', () => {
    const s = setup();
    for (let i = 0; i < 3; i++) {
      enter(s, i, 1000);
      const stage = STAGES[i];
      expect(new Set(stage.map.map((r) => r.length)).size).toBe(1);
      s.mission = stage.objectives.length - 1;
      for (const goal of [
        ...stage.objects,
        ...stage.spawns,
        ...stage.zombies,
        ...stage.wave,
      ]) {
        expect(tileOpen(s, goal.x, goal.y)).toBe(true);
        let p = stage.spawns[0],
          n = 0;
        while (p.x !== goal.x || p.y !== goal.y) {
          const next = pathStep(p, goal, (x, y) => tileOpen(s, x, y));
          expect(next).not.toBeNull();
          p = next!;
          if (++n > 500) throw new Error('도달 실패');
        }
      }
    }
  });
  it('퍼즐의 순서·거리·오답 거부 및 문 충돌 해제', () => {
    const s = setup(),
      p = s.players[0];
    expect(
      command(s, 'a', { v: 1, type: 'puzzle', code: '314' }, 0),
    ).toBeTruthy();
    s.mission = 4;
    expect(
      command(s, 'a', { v: 1, type: 'puzzle', code: '314' }, 0),
    ).toBeTruthy();
    Object.assign(p, { x: 13, y: 8 });
    expect(
      command(s, 'a', { v: 1, type: 'puzzle', code: '000' }, 0),
    ).toBeTruthy();
    expect(
      pathStep(p, { x: 16, y: 8 }, (x, y) => tileOpen(s, x, y)),
    ).toBeNull();
    command(s, 'a', { v: 1, type: 'puzzle', code: '314' }, 0);
    expect(s.mission).toBe(5);
    expect(tileOpen(s, 14, 8)).toBe(true);
  });
  it('반복 수집 방지와 전원 집결 검사', () => {
    const s = setup(),
      p = s.players[0];
    s.mission = 2;
    Object.assign(p, { x: 9, y: 3 });
    command(s, 'a', { v: 1, type: 'interact' }, 0);
    command(s, 'a', { v: 1, type: 'interact' }, 0);
    expect(p.parts).toBe(3);
    s.mission = 5;
    Object.assign(p, { x: 16, y: 8 });
    expect(command(s, 'a', { v: 1, type: 'interact' }, 0)).toBeTruthy();
    Object.assign(s.players[1], { x: 16, y: 9 });
    const run = s.runId;
    command(s, 'a', { v: 1, type: 'interact' }, 2000);
    expect(s.stageIndex).toBe(1);
    expect(s.runId).toBe(run);
    expect(s.checkpoint.stageIndex).toBe(1);
    expect(s.players.every((q) => !q.input.direction)).toBe(true);
  });
  it('실패 후 진입 HP·부품·강화 복원, 하드 재도전/재시작 추가 입장 ID 없음', () => {
    const s = setup('hard');
    s.admissionId = 'paid';
    s.players[0].hp = 70;
    s.players[0].parts = 12;
    s.players[0].upgrade = 2;
    enter(s, 1, 1000);
    s.players.forEach((p) => {
      p.hp = 0;
      p.parts = 99;
      p.upgrade = 4;
    });
    tick(s, 2000);
    command(s, 'a', { v: 1, type: 'retry' }, 2100);
    expect(s.players[0].hp).toBe(105);
    expect(s.players[0].parts).toBe(12);
    expect(s.players[0].upgrade).toBe(2);
    expect(s.stageIndex).toBe(1);
    expect(s.admissionId).toBe('paid');
    s.phase = 'over';
    command(s, 'a', { v: 1, type: 'restart' }, 2200);
    expect(s.stageIndex).toBe(0);
    expect(s.admissionId).toBe('paid');
  });
  it('서버 방어 시간·전원 오프라인 보정·최종 전원 탈출', () => {
    const s = setup();
    enter(s, 2, 1000);
    Object.assign(s.players[0], { x: 4, y: 3 });
    command(s, 'a', { v: 1, type: 'interact' }, 1100);
    Object.assign(s.players[0], { x: 17, y: 4 });
    command(s, 'a', { v: 1, type: 'interact' }, 1200);
    expect(s.zombies).toHaveLength(6);
    s.zombies = [];
    setActiveClock(s, 2000, false);
    setActiveClock(s, 20000, true);
    expect(s.defendUntil).toBe(31200);
    tick(s, 31199);
    expect(s.mission).toBe(2);
    tick(s, 31200);
    expect(s.mission).toBe(3);
    s.players.forEach((p) => Object.assign(p, { x: 19, y: 13 }));
    command(s, 'a', { v: 1, type: 'interact' }, 32000);
    expect(s.cutscene?.key).toBe('ending');
    acknowledge(s);
    expect(s.phase).toBe('clear');
    expect(command(s, 'a', { v: 1, type: 'retry' }, 33000)).toBeTruthy();
  });
});
describe('난이도·전투·구조·강화', () => {
  it.each(['easy', 'normal', 'hard'] as Difficulty[])(
    '%s 좀비 체력·피해·행동 간격 적용',
    (difficulty) => {
      const s = setup(difficulty),
        p = s.players[0],
        r = DIFFICULTIES[difficulty];
      expect(s.zombies[0].hp).toBe(r.zombieHp);
      s.players[1].connected = false;
      s.zombies = [{ ...s.zombies[0], x: 3, y: 5, attackAt: 0 }];
      tick(s, 1000);
      expect(p.hp).toBe(140 - r.damage);
      expect(s.zombies[0].attackAt).toBe(1000 + r.attackMs);
      tick(s, 1100);
      expect(p.hp).toBe(140 - r.damage);
    },
  );
  it('공격 쿨타임과 밀쳐내기 1회 판정', () => {
    const s = setup(),
      p = s.players[0];
    s.players[1].x = 10;
    s.zombies = [{ ...s.zombies[0], x: 3, y: 5, attackAt: 0 }];
    p.weaponAcquired = true;
    command(s, 'a', { v: 1, type: 'skill', slot: 1 }, 1000);
    expect(s.zombies[0].hp).toBe(36);
    expect(s.zombies[0].x).toBe(4);
    Object.assign(s.zombies[0], { x: 3, y: 5 });
    command(
      s,
      'a',
      { v: 1, type: 'input', direction: null, attack: true },
      1100,
    );
    tick(s, 1100);
    expect(s.zombies[0].hp).toBe(10);
    tick(s, 1200);
    expect(s.zombies[0].hp).toBe(10);
  });
  it('의무대 회복·구조 및 에피소드 0 작업대 거부', () => {
    const s = setup(),
      p = s.players[0],
      q = s.players[1];
    p.job = 'medic';
    p.hp = 60;
    q.hp = 0;
    p.weaponAcquired = true;
    command(s, 'a', { v: 1, type: 'skill', slot: 1 }, 1000);
    expect(p.hp).toBe(95);
    command(s, 'a', { v: 1, type: 'skill', slot: 2 }, 1000);
    expect(q.hp).toBe(50);
    Object.assign(p, { x: 4, y: 5 });
    command(s, 'a', { v: 1, type: 'upgrade' }, 1100);
    expect(p.parts).toBe(0);
    expect(p.upgrade).toBe(0);
    expect(command(s, 'a', { v: 1, type: 'upgrade' }, 1200)).toBeTruthy();
  });
});

describe('주연의 무기 획득과 동기화 컷신', () => {
  it('시작은 돌 던지기, 직업 스킬은 획득 전 서버가 거부', () => {
    const s = setup(),
      p = s.players[0];
    expect(p.weaponAcquired).toBe(false);
    expect(p.parts).toBe(0);
    expect(command(s, 'a', { v: 1, type: 'skill', slot: 1 }, 1000)).toContain(
      '무기',
    );
    expect(
      STAGES.every((a) => a.objects.every((o) => o.kind !== 'bench')),
    ).toBe(true);
    expect(command(s, 'a', { v: 1, type: 'upgrade' }, 1000)).toContain(
      '작업대가 없습니다',
    );
  });
  it('돌은 3칸 직선에 실제 적중해야 훈련이 진행되고 세 번 후 다음 임무', () => {
    const s = setup(),
      p = s.players[0];
    s.mission = 1;
    Object.assign(p, { x: 8, y: 3, dir: 'right' });
    s.zombies = [{ ...s.zombies[0], x: 11, y: 3, moveAt: Infinity }];
    for (const now of [1000, 1520, 2040]) {
      command(
        s,
        'a',
        { v: 1, type: 'input', direction: null, attack: true },
        now,
      );
      tick(s, now);
    }
    expect(p.rockHits).toBe(3);
    expect(s.zombies[0].hp).toBe(36);
    expect(s.mission).toBe(2);
    expect(p.weaponAcquired).toBe(false);
  });
  it('선택한 직업은 유지되고 전원 개별 장비 수령 후 무기 컷신과 스킬 해금', () => {
    const s = setup();
    s.players[1].job = 'medic';
    s.mission = 3;
    s.players.forEach((p) => Object.assign(p, { x: 10, y: 6 }));
    command(s, 'a', { v: 1, type: 'interact' }, 1000);
    expect(s.players[0].weaponAcquired).toBe(true);
    expect(s.players[1].weaponAcquired).toBe(false);
    expect(s.mission).toBe(3);
    command(s, 'b', { v: 1, type: 'interact' }, 1100);
    expect(s.mission).toBe(4);
    expect(s.cutscene?.key).toBe('weapons');
    acknowledge(s);
    expect(s.players[1].job).toBe('medic');
    expect(
      command(s, 'b', { v: 1, type: 'skill', slot: 1 }, 2000),
    ).toBeUndefined();
  });
  it('장면 중 공격·이동·적 AI가 멈추며 전원이 확인하기 전 진행하지 않음', () => {
    const s = setup();
    start(s, 2000);
    const id = s.cutscene!.id,
      hp = s.players[0].hp,
      x = s.players[0].x;
    command(
      s,
      'a',
      { v: 1, type: 'input', direction: 'right', attack: true },
      2100,
    );
    expect(command(s, 'a', { v: 1, type: 'interact' }, 2100)).toContain(
      '이야기',
    );
    tick(s, 50000);
    expect(s.players[0].hp).toBe(hp);
    expect(s.players[0].x).toBe(x);
    command(s, 'a', { v: 1, type: 'scene-done', sceneId: id }, 50000);
    expect(s.cutscene).not.toBeNull();
    command(s, 'a', { v: 1, type: 'scene-done', sceneId: id }, 50000);
    expect(s.cutscene!.acknowledged).toEqual(['a']);
    command(s, 'b', { v: 1, type: 'scene-done', sceneId: id }, 50000);
    expect(s.cutscene).toBeNull();
    expect(
      command(s, 'a', { v: 1, type: 'scene-done', sceneId: id }, 50001),
    ).toBeTruthy();
  });
  it('장면 중 연결이 끊긴 동료는 대기를 막지 않고 재접속은 남은 장면을 공유', () => {
    const s = setup();
    start(s, 2000);
    command(
      s,
      'a',
      { v: 1, type: 'scene-done', sceneId: s.cutscene!.id },
      2100,
    );
    s.players[1].connected = false;
    tick(s, 2200);
    expect(s.cutscene).toBeNull();
  });
  it('구간 진입과 재도전에서 장비 상태를 보존하고 처음부터 시작하면 돌로 복귀', () => {
    const s = setup();
    s.players.forEach((p) => (p.weaponAcquired = true));
    enter(s, 1, 2000);
    s.players.forEach((p) => (p.hp = 0));
    tick(s, 2100);
    command(s, 'a', { v: 1, type: 'retry' }, 2200);
    expect(s.cutscene?.key).toBe('hall');
    expect(s.players.every((p) => p.weaponAcquired)).toBe(true);
    s.phase = 'over';
    command(s, 'a', { v: 1, type: 'restart' }, 2300);
    expect(s.players.every((p) => !p.weaponAcquired)).toBe(true);
    expect(s.cutscene?.key).toBe('outbreak');
  });
  it('세 종류 감염자는 서로 다른 체력·속도·피해 설정으로 생성', () => {
    const s = setup();
    enter(s, 1, 2000);
    expect(new Set(s.zombies.map((z) => z.kind)).size).toBe(3);
    for (const z of s.zombies)
      expect(z.maxHp).toBe(
        Math.round(DIFFICULTIES.normal.zombieHp * ZOMBIE_TYPES[z.kind].hp),
      );
    const runner = s.zombies.find((z) => z.kind === 'runner')!;
    s.players[1].connected = false;
    Object.assign(s.players[0], { x: 3, y: 5 });
    Object.assign(runner, { x: 4, y: 5 });
    s.zombies = [runner];
    tick(s, 3000);
    expect(s.players[0].hp).toBe(140 - Math.round(12 * 0.8));
    expect(runner.attackAt).toBe(3000 + Math.round(900 * 0.7));
  });
});

it('이전 v3 방은 무기·퍼즐 진행·체크포인트를 보존해 한 번만 변환', () => {
  const s = setup();
  s.contentVersion = 3;
  s.mission = 2;
  for (const p of s.players) {
    delete (p as Partial<typeof p>).weaponAcquired;
    delete (p as Partial<typeof p>).rockHits;
  }
  for (const saved of Object.values(s.checkpoint.players)) {
    delete (saved as Partial<typeof saved>).weaponAcquired;
    delete (saved as Partial<typeof saved>).rockHits;
  }
  normalizeState(s);
  expect(
    Object.values(s.checkpoint.players).every((saved) => saved.weaponAcquired),
  ).toBe(true);
  expect(s.mission).toBe(4);
  expect(s.contentVersion).toBe(4);
  expect(s.players.every((p) => p.weaponAcquired)).toBe(true);
  normalizeState(s);
  expect(s.mission).toBe(4);
});
it('플레이 중에는 직업/주연을 바꿀 수 없음', () => {
  const s = setup();
  expect(command(s, 'a', { v: 1, type: 'job', job: 'medic' }, 2000)).toContain(
    '대기실',
  );
  expect(s.players[0].job).toBe('vanguard');
});
