export const TILE = 32,
  MOVE_MS = 140;
export const JOBS = {
  vanguard: {
    name: '선봉대',
    hp: 140,
    damage: 26,
    range: 1,
    attackMs: 480,
    skills: ['밀쳐내기', '방어 태세'],
  },
  medic: {
    name: '의무대',
    hp: 100,
    damage: 18,
    range: 2,
    attackMs: 520,
    skills: ['광역 회복', '응급 구조'],
  },
} as const;
export type Job = keyof typeof JOBS;
export interface Pos {
  x: number;
  y: number;
}
export interface Prop extends Pos {
  id: string;
  kind: 'npc' | 'bench' | 'item' | 'hint' | 'puzzle' | 'switch' | 'exit';
  name: string;
  text?: string;
}
export interface Objective {
  kind: 'talk' | 'collect' | 'puzzle' | 'activate' | 'survive' | 'rally';
  target: string;
  text: string;
  code?: string;
  durationMs?: number;
}
export interface Stage {
  id: string;
  name: string;
  map: string[];
  spawns: Pos[];
  objects: Prop[];
  objectives: Objective[];
  doors: (Pos & { opensAtMission: number })[];
  zombies: Pos[];
  wave: Pos[];
  outdoor: boolean;
}
function map(w: number, h: number, blocks: Pos[], desks: Pos[] = []) {
  const g: string[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) =>
      !x || !y || x === w - 1 || y === h - 1 ? '#' : '.',
    ),
  );
  for (const p of blocks) g[p.y][p.x] = '#';
  for (const p of desks) g[p.y][p.x] = 'T';
  return g.map((r) => r.join(''));
}
const spawns = [2, 3, 4, 5].map((x) => ({ x, y: 5 }));
export const STAGES: Stage[] = [
  {
    id: 'classroom',
    name: '끝나지 않은 종례 · 교실',
    outdoor: false,
    map: map(
      18,
      12,
      Array.from({ length: 10 }, (_, i) => ({ x: 14, y: i + 1 })).filter(
        (p) => p.y !== 8,
      ),
      [6, 9].flatMap((x) => [5, 7, 9].map((y) => ({ x, y }))),
    ),
    spawns,
    objects: [
      {
        id: 'npc',
        kind: 'npc',
        name: '보건교사 윤서',
        x: 3,
        y: 3,
        text: '평소 방송이 아니에요. 예비 퓨즈를 챙기고 함께 탈출해요. J 공격, K·L 스킬, E 상호작용을 기억하세요. 잠금 번호는 칠판에 있어요.',
      },
      { id: 'bench', kind: 'bench', name: '교실 작업대', x: 5, y: 5 },
      { id: 'fuse', kind: 'item', name: '예비 퓨즈', x: 9, y: 3 },
      {
        id: 'board',
        kind: 'hint',
        name: '칠판의 메모',
        x: 5,
        y: 2,
        text: '비상 잠금장치의 번호는 우리 반 번호입니다. 3 · 1 · 4',
      },
      { id: 'keypad', kind: 'puzzle', name: '교실 잠금장치', x: 13, y: 8 },
      { id: 'exit', kind: 'exit', name: '동관 복도로', x: 16, y: 8 },
    ],
    objectives: [
      {
        kind: 'talk',
        target: 'npc',
        text: '윤서에게 이동해 상황을 확인하세요. WASD / 조이스틱, E 대화',
      },
      {
        kind: 'collect',
        target: 'fuse',
        text: '감염자를 피하거나 공격하며 예비 퓨즈를 확보하세요. [E]',
      },
      {
        kind: 'puzzle',
        target: 'keypad',
        text: '칠판의 번호를 확인하고 잠금장치를 해제하세요. [E]',
        code: '314',
      },
      {
        kind: 'rally',
        target: 'exit',
        text: '문 너머 복도 입구에 모두 집결하세요. [E]',
      },
    ],
    doors: [{ x: 14, y: 8, opensAtMission: 3 }],
    zombies: [
      { x: 11, y: 3 },
      { x: 11, y: 8 },
    ],
    wave: [],
  },
  {
    id: 'hall',
    name: '어둠 속의 방송 · 동관',
    outdoor: false,
    map: [
      '##########################',
      '#........................#',
      '#.....#.....#............#',
      '#.....#.....#............#',
      '#.....#.....#............#',
      '#.....#.....#............#',
      '#........................#',
      '###.######.######.########',
      '#........................#',
      '#........................#',
      '#.....#.....#............#',
      '#.....#.....#............#',
      '#.....#.....#............#',
      '#.....#.....#............#',
      '#........................#',
      '#........................#',
      '#........................#',
      '##########################',
    ],
    spawns,
    objects: [
      {
        id: 'npc',
        kind: 'npc',
        name: '보건교사 윤서',
        x: 3,
        y: 3,
        text: '방송실의 비상 전원을 복구해 주세요. 전원이 들어오면 운동장 출입구가 열릴 거예요. 혼자 움직이지 마세요.',
      },
      { id: 'bench', kind: 'bench', name: '동관 작업대', x: 5, y: 5 },
      {
        id: 'generator',
        kind: 'switch',
        name: '방송실 비상 전원',
        x: 21,
        y: 4,
      },
      { id: 'exit', kind: 'exit', name: '운동장 출입구', x: 23, y: 15 },
    ],
    objectives: [
      {
        kind: 'talk',
        target: 'npc',
        text: '윤서에게 다음 경로를 확인하세요. [E]',
      },
      {
        kind: 'activate',
        target: 'generator',
        text: '동쪽 방송실의 비상 전원을 복구하세요. [E]',
      },
      {
        kind: 'rally',
        target: 'exit',
        text: '운동장 출입구에 모두 집결하세요. [E]',
      },
    ],
    doors: [],
    zombies: [
      [14, 10],
      [17, 12],
      [20, 9],
      [22, 13],
      [10, 12],
      [23, 6],
    ].map(([x, y]) => ({ x, y })),
    wave: [],
  },
  {
    id: 'yard',
    name: '담장 너머의 신호 · 운동장',
    outdoor: true,
    map: map(
      22,
      16,
      Array.from({ length: 20 }, (_, i) => ({ x: i + 1, y: 11 })).filter(
        (p) => p.x !== 18,
      ),
      [
        { x: 8, y: 4 },
        { x: 9, y: 4 },
        { x: 8, y: 5 },
        { x: 9, y: 5 },
        { x: 12, y: 8 },
        { x: 13, y: 8 },
      ],
    ),
    spawns,
    objects: [
      { id: 'bench', kind: 'bench', name: '임시 작업대', x: 5, y: 5 },
      { id: 'west', kind: 'switch', name: '서쪽 전원', x: 4, y: 3 },
      { id: 'east', kind: 'switch', name: '동쪽 제어반', x: 17, y: 4 },
      { id: 'exit', kind: 'exit', name: '구조 차량', x: 19, y: 13 },
    ],
    objectives: [
      { kind: 'activate', target: 'west', text: '서쪽 전원을 연결하세요. [E]' },
      {
        kind: 'activate',
        target: 'east',
        text: '동쪽 제어반을 작동하세요. [E]',
      },
      {
        kind: 'survive',
        target: 'east',
        text: '정문 개방까지 동료를 지키며 버티세요.',
        durationMs: 12000,
      },
      {
        kind: 'rally',
        target: 'exit',
        text: '열린 정문을 지나 구조 차량에 모두 집결하세요. [E]',
      },
    ],
    doors: [{ x: 18, y: 11, opensAtMission: 3 }],
    zombies: [
      { x: 12, y: 3 },
      { x: 16, y: 8 },
    ],
    wave: [
      { x: 10, y: 2 },
      { x: 12, y: 6 },
      { x: 19, y: 7 },
      { x: 15, y: 9 },
    ],
  },
];
export const stageFor = (s: { stageIndex: number }) =>
  STAGES[s.stageIndex] ?? STAGES[0];
export const objectiveFor = (s: { stageIndex: number; mission: number }) =>
  stageFor(s).objectives[s.mission];
export function tileOpen(
  s: { stageIndex: number; mission: number },
  x: number,
  y: number,
) {
  const a = stageFor(s);
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    a.map[y]?.[x] === '.' &&
    !a.doors.some((d) => d.x === x && d.y === y && s.mission < d.opensAtMission)
  );
}
