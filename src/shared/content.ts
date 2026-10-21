export const TILE = 32,
  MOVE_MS = 140;
export const JOBS = {
  vanguard: {
    name: '선봉대',
    character: '한도윤',
    identity: '야구부 주장',
    weapon: '알루미늄 배트',
    bio: '망설이던 야구부 주장. 친구들 앞에 서는 순간, 배트는 모두를 지키는 무기가 된다.',
    hp: 140,
    damage: 26,
    range: 1,
    attackMs: 480,
    skills: ['밀쳐내기', '방어 태세'],
  },
  medic: {
    name: '의무대',
    character: '백해인',
    identity: '보건 동아리',
    weapon: '구조용 신호총',
    bio: '보건 동아리의 침착한 학생. 구조 장비와 응급 가방을 찾아 동료의 귀환을 책임진다.',
    hp: 100,
    damage: 18,
    range: 2,
    attackMs: 520,
    skills: ['광역 회복', '응급 구조'],
  },
  ranger: {
    name: '수색대',
    character: '강시우',
    identity: '양궁부 선수',
    weapon: '연습용 활',
    bio: '낯선 발소리를 먼저 알아채는 양궁부 선수. 멀리서 길을 열고 동료가 이동할 시간을 번다.',
    hp: 90,
    damage: 32,
    range: 5,
    attackMs: 760,
    skills: ['집중 사격', '신속 장전'],
  },
  engineer: {
    name: '공작대',
    character: '윤태오',
    identity: '과학 동아리',
    weapon: '휴대식 전기봉',
    bio: '고장 난 장비를 고치는 과학 동아리 학생. 전류로 추격을 끊고 동료에게 응급 방벽을 펼친다.',
    hp: 110,
    damage: 22,
    range: 1,
    attackMs: 540,
    skills: ['전류 방출', '응급 방벽'],
  },
} as const;
export type Job = keyof typeof JOBS;
export const JOB_IDS = Object.keys(JOBS) as Job[];
export const MAX_PLAYERS = 4;
export const isJob = (value: unknown): value is Job =>
  typeof value === 'string' && Object.hasOwn(JOBS, value);
export interface Pos {
  x: number;
  y: number;
}
export interface Prop extends Pos {
  id: string;
  kind:
    | 'npc'
    | 'bench'
    | 'gear'
    | 'item'
    | 'hint'
    | 'puzzle'
    | 'switch'
    | 'exit';
  name: string;
  text?: string;
}
export interface Objective {
  kind:
    | 'talk'
    | 'practice'
    | 'equip'
    | 'collect'
    | 'puzzle'
    | 'activate'
    | 'survive'
    | 'rally';
  target: string;
  text: string;
  code?: string;
  durationMs?: number;
}
export const ZOMBIE_TYPES = {
  student: {
    name: '교복 감염자',
    concept: '교실에서 변이한 학생. 가까운 생존자를 느리게 추격한다.',
    hp: 1,
    speed: 1,
    damage: 1,
    sight: 10,
  },
  runner: {
    name: '체육복 감염자',
    concept: '운동부 출신 감염자. 체력은 낮지만 먼 거리에서 빠르게 접근한다.',
    hp: 0.75,
    speed: 0.7,
    damage: 0.8,
    sight: 14,
  },
  caretaker: {
    name: '시설관리 감염자',
    concept: '안전모와 작업복을 입은 감염자. 느리지만 체력과 타격이 강하다.',
    hp: 1.7,
    speed: 1.45,
    damage: 1.5,
    sight: 8,
  },
} as const;
export type ZombieKind = keyof typeof ZOMBIE_TYPES;
export interface ZombieSpawn extends Pos {
  kind: ZombieKind;
}
export interface Stage {
  id: string;
  name: string;
  map: string[];
  spawns: Pos[];
  objects: Prop[];
  objectives: Objective[];
  doors: (Pos & { opensAtMission: number })[];
  zombies: ZombieSpawn[];
  wave: ZombieSpawn[];
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
        text: '방금 복도에서 학생들이 변했어요. 아직 무기가 없으니 바닥의 돌을 던져 거리를 벌려요. 예비 퓨즈를 챙긴 뒤 비상 장비함으로 가요.',
      },
      {
        id: 'rubble',
        kind: 'hint',
        name: '깨진 창가의 돌',
        x: 8,
        y: 3,
        text: 'J 또는 공격 버튼으로 바라보는 방향 3칸까지 돌을 던집니다. 감염자에게 세 번 맞혀 거리를 벌리세요.',
      },
      { id: 'gear', kind: 'gear', name: '비상 장비함', x: 10, y: 6 },
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
        kind: 'practice',
        target: 'rubble',
        text: '돌로 감염자를 세 번 맞히세요. 바라보는 방향으로 J / 공격',
      },
      {
        kind: 'collect',
        target: 'fuse',
        text: '감염자를 피하거나 공격하며 예비 퓨즈를 확보하세요. [E]',
      },
      {
        kind: 'equip',
        target: 'gear',
        text: '전원이 비상 장비함에서 선택한 직업의 무기를 챙기세요. [E]',
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
    doors: [{ x: 14, y: 8, opensAtMission: 5 }],
    zombies: [
      { x: 11, y: 3, kind: 'student' },
      { x: 11, y: 8, kind: 'runner' },
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
    ].map(([x, y], i) => ({
      x,
      y,
      kind: (['student', 'runner', 'caretaker'] as const)[i % 3],
    })),
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
      { x: 12, y: 3, kind: 'runner' },
      { x: 16, y: 8, kind: 'caretaker' },
    ],
    wave: [
      { x: 10, y: 2, kind: 'student' },
      { x: 12, y: 6, kind: 'runner' },
      { x: 19, y: 7, kind: 'caretaker' },
      { x: 15, y: 9, kind: 'student' },
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
