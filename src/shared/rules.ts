export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES = {
  easy: {
    name: '이지',
    zombieHp: 52,
    damage: 8,
    moveMs: 700,
    attackMs: 1050,
    xp: 180,
    coins: 90,
  },
  normal: {
    name: '노말',
    zombieHp: 78,
    damage: 12,
    moveMs: 560,
    attackMs: 900,
    xp: 300,
    coins: 150,
  },
  hard: {
    name: '하드',
    zombieHp: 117,
    damage: 18,
    moveMs: 420,
    attackMs: 750,
    xp: 450,
    coins: 225,
  },
} as const;
export const EPISODES = [
  { id: 0, name: '탈출 불가능한 학교', available: true },
  { id: 1, name: '버려진 도시', available: false },
  { id: 2, name: '침묵하는 행정도시', available: false },
  { id: 3, name: '금강의 마지막 길', available: false },
  { id: 4, name: '봉쇄선 너머', available: false },
] as const;
export const SKINS = {
  uniform: { name: '기본 교복', color: 0x69c6bd },
  survivor: { name: '생존자 복장', color: 0xd9a75b },
  explorer: { name: '탐험가 복장', color: 0x8fab6b },
  rescue: { name: '특수 구조대 복장', color: 0xd48074 },
} as const;
export type SkinId = keyof typeof SKINS;
export const isSkin = (value: unknown): value is SkinId =>
  typeof value === 'string' && Object.hasOwn(SKINS, value);
export const isDifficulty = (value: unknown): value is Difficulty =>
  typeof value === 'string' && Object.hasOwn(DIFFICULTIES, value);
