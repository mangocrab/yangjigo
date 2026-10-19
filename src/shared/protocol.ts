import type { Job } from './content';
import { isDifficulty, type Difficulty, type SkinId } from './rules';
export type Direction = 'up' | 'down' | 'left' | 'right';
export const DIR: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
export type Command =
  | { v: 1; type: 'input'; direction: Direction | null; attack: boolean }
  | { v: 1; type: 'skill'; slot: 1 | 2 }
  | { v: 1; type: 'job'; job: Job }
  | { v: 1; type: 'ready'; ready: boolean }
  | { v: 1; type: 'puzzle'; code: string }
  | { v: 1; type: 'configure'; episodeId: number; difficulty: Difficulty }
  | {
      v: 1;
      type: 'start' | 'interact' | 'upgrade' | 'retry' | 'restart' | 'refresh';
    };
export function parseCommand(raw: unknown): Command | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.v !== 1) return null;
  switch (m.type) {
    case 'input':
      return (m.direction === null ||
        (typeof m.direction === 'string' && Object.hasOwn(DIR, m.direction))) &&
        typeof m.attack === 'boolean'
        ? {
            v: 1,
            type: 'input',
            direction: m.direction as Direction | null,
            attack: m.attack,
          }
        : null;
    case 'skill':
      return m.slot === 1 || m.slot === 2
        ? { v: 1, type: 'skill', slot: m.slot }
        : null;
    case 'job':
      return m.job === 'medic' || m.job === 'vanguard'
        ? { v: 1, type: 'job', job: m.job }
        : null;
    case 'ready':
      return typeof m.ready === 'boolean'
        ? { v: 1, type: 'ready', ready: m.ready }
        : null;
    case 'puzzle':
      return typeof m.code === 'string' && /^\d{3}$/.test(m.code)
        ? { v: 1, type: 'puzzle', code: m.code }
        : null;
    case 'configure':
      return Number.isInteger(m.episodeId) && isDifficulty(m.difficulty)
        ? {
            v: 1,
            type: 'configure',
            episodeId: m.episodeId as number,
            difficulty: m.difficulty,
          }
        : null;
    case 'start':
    case 'interact':
    case 'upgrade':
    case 'retry':
    case 'restart':
    case 'refresh':
      return { v: 1, type: m.type };
    default:
      return null;
  }
}
export interface Player {
  id: string;
  name: string;
  skin: SkinId;
  hardTickets: number;
  x: number;
  y: number;
  dir: Direction;
  hp: number;
  job: Job;
  ready: boolean;
  connected: boolean;
  lastSeen: number;
  moveAt: number;
  attackAt: number;
  skillAt: [number, number];
  shieldUntil: number;
  hitAt: number;
  attackUntil: number;
  parts: number;
  upgrade: number;
  input: { direction: Direction | null; attack: boolean; at: number };
}
export interface Zombie {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  spawnX: number;
  spawnY: number;
  moveAt: number;
  attackAt: number;
  state: string;
}
export interface GameState {
  roomId: string;
  title: string;
  channel: string;
  private: boolean;
  host: string;
  episodeId: number;
  difficulty: Difficulty;
  admissionId: string | null;
  contentVersion: number;
  runId: string;
  phase: 'waiting' | 'playing' | 'over' | 'clear';
  stageIndex: number;
  stageEpoch: number;
  mission: number;
  notice: string;
  players: Player[];
  zombies: Zombie[];
  startedAt: number;
  now: number;
  revision: number;
  defendUntil: number;
  pausedAt: number;
  checkpoint: {
    stageIndex: number;
    players: Record<string, { hp: number; parts: number; upgrade: number }>;
  };
}
export interface Profile {
  id: string;
  nickname: string;
  xp: number;
  coins: number;
  level: number;
  equipped_skin: SkinId;
  prologue_cleared: number;
  prologue_version: number;
}
export interface RoomSummary {
  id: string;
  title: string;
  channel: string;
  episodeId: number;
  difficulty: Difficulty;
  count: number;
  phase: GameState['phase'];
  private: boolean;
  updatedAt: number;
}
export interface Account {
  profile: Profile;
  episodes: {
    id: number;
    name: string;
    available: boolean;
    tickets: number;
    easy_clears: number;
    normal_clears: number;
    hard_clears: number;
    best_seconds: number | null;
  }[];
  inventory: string[];
  achievements: string[];
}
