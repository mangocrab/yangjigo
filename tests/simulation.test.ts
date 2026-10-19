import { describe, it, expect } from 'vitest';
import {
  newState,
  newPlayer,
  start,
  command,
  tick,
  pathStep,
  loadStage,
  setActiveClock,
} from '../src/server/simulation';
import { STAGES, JOBS, tileOpen } from '../src/shared/content';
import { DIFFICULTIES, type Difficulty } from '../src/shared/rules';
import { parseCommand } from '../src/shared/protocol';
import { vectorDirection } from '../src/client/input';
const setup = (difficulty: Difficulty = 'normal') => {
  const s = newState('r', '작전', '세종-1', false, 'a');
  s.difficulty = difficulty;
  s.players = [newPlayer('a', '선봉', 1000), newPlayer('b', '의무', 1000)];
  s.players.forEach((p) => (p.connected = true));
  start(s, 1000);
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
      loadStage(s, i, 1000);
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
    s.mission = 2;
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
    expect(s.mission).toBe(3);
    expect(tileOpen(s, 14, 8)).toBe(true);
  });
  it('반복 수집 방지와 전원 집결 검사', () => {
    const s = setup(),
      p = s.players[0];
    s.mission = 1;
    Object.assign(p, { x: 9, y: 3 });
    command(s, 'a', { v: 1, type: 'interact' }, 0);
    command(s, 'a', { v: 1, type: 'interact' }, 0);
    expect(p.parts).toBe(6);
    s.mission = 3;
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
    loadStage(s, 1, 1000);
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
    loadStage(s, 2, 1000);
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
      s.zombies = [{ ...s.zombies[0], x: 3, y: 5 }];
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
    s.zombies = [{ ...s.zombies[0], x: 3, y: 5 }];
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
  it('의무대 회복·구조 및 작업대 자원 검사', () => {
    const s = setup(),
      p = s.players[0],
      q = s.players[1];
    p.job = 'medic';
    p.hp = 60;
    q.hp = 0;
    command(s, 'a', { v: 1, type: 'skill', slot: 1 }, 1000);
    expect(p.hp).toBe(95);
    command(s, 'a', { v: 1, type: 'skill', slot: 2 }, 1000);
    expect(q.hp).toBe(50);
    Object.assign(p, { x: 4, y: 5 });
    command(s, 'a', { v: 1, type: 'upgrade' }, 1100);
    expect(p.parts).toBe(0);
    expect(p.upgrade).toBe(1);
    expect(command(s, 'a', { v: 1, type: 'upgrade' }, 1200)).toBeTruthy();
  });
});
