import { EPISODES, isSkin } from '../shared/rules';
import type { GameState, Account } from '../shared/protocol';
import { profile, HttpError } from './auth';
import type { Env } from './index';
export async function account(id: string, env: Env): Promise<Account> {
  const [p, progress, tickets, inventory, achievements] = await Promise.all([
    profile(id, env),
    env.DB.prepare('SELECT * FROM episode_progress WHERE user_id=?')
      .bind(id)
      .all<{
        episode_id: number;
        easy_clears: number;
        normal_clears: number;
        hard_clears: number;
        best_seconds: number;
      }>(),
    env.DB.prepare(
      'SELECT episode_id,quantity FROM episode_tickets WHERE user_id=?',
    )
      .bind(id)
      .all<{ episode_id: number; quantity: number }>(),
    env.DB.prepare('SELECT skin_id FROM player_inventory WHERE user_id=?')
      .bind(id)
      .all<{ skin_id: string }>(),
    env.DB.prepare('SELECT achievement_id FROM achievements WHERE user_id=?')
      .bind(id)
      .all<{ achievement_id: string }>(),
  ]);
  return {
    profile: p,
    episodes: EPISODES.map((e) => {
      const g = progress.results.find((r) => r.episode_id === e.id);
      return {
        ...e,
        tickets:
          tickets.results.find((t) => t.episode_id === e.id)?.quantity ?? 0,
        easy_clears: g?.easy_clears ?? 0,
        normal_clears: g?.normal_clears ?? 0,
        hard_clears: g?.hard_clears ?? 0,
        best_seconds: g?.best_seconds ?? null,
      };
    }),
    inventory: inventory.results.map((r) => r.skin_id),
    achievements: achievements.results.map((r) => r.achievement_id),
  };
}
export async function catalog(env: Env) {
  return (
    await env.DB.prepare(
      'SELECT s.id,s.name,s.color,i.price FROM skins s JOIN shop_items i ON s.id=i.skin_id ORDER BY i.price',
    ).all()
  ).results;
}
export async function purchase(
  id: string,
  d: Record<string, unknown>,
  env: Env,
) {
  if (
    !isSkin(d.skinId) ||
    typeof d.requestId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(d.requestId)
  )
    throw new HttpError(400, '상품과 구매 요청 ID를 확인하세요.');
  const item = await env.DB.prepare(
    'SELECT price FROM shop_items WHERE skin_id=?',
  )
    .bind(d.skinId)
    .first<{ price: number }>();
  if (!item) throw new HttpError(404, '판매 중인 상품이 아닙니다.');
  try {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO purchase_receipts(user_id,request_id,skin_id,price,created_at) VALUES(?,?,?,?,?)',
    )
      .bind(id, d.requestId, d.skinId, item.price, Date.now())
      .run();
  } catch (e) {
    const message = String(e);
    if (message.includes('INSUFFICIENT_COINS'))
      throw new HttpError(409, '재화가 부족합니다.');
    if (message.includes('ALREADY_OWNED'))
      throw new HttpError(409, '이미 보유한 스킨입니다.');
    throw e;
  }
  const receipt = await env.DB.prepare(
    'SELECT request_id,skin_id,price FROM purchase_receipts WHERE user_id=? AND request_id=?',
  )
    .bind(id, d.requestId)
    .first<{ request_id: string; skin_id: string; price: number }>();
  if (!receipt || receipt.skin_id !== d.skinId)
    throw new HttpError(409, '다른 상품에 사용한 요청 ID입니다.');
  return { receipt, account: await account(id, env) };
}
export async function equip(id: string, skin: unknown, env: Env) {
  if (!isSkin(skin)) throw new HttpError(400, '알 수 없는 스킨입니다.');
  const r = await env.DB.prepare(
    'UPDATE player_profiles SET equipped_skin=? WHERE user_id=? AND EXISTS(SELECT 1 FROM player_inventory WHERE user_id=? AND skin_id=?)',
  )
    .bind(skin, id, id, skin)
    .run();
  if (!r.meta.changes)
    throw new HttpError(403, '보유한 스킨만 장착할 수 있습니다.');
  return account(id, env);
}
export async function refreshTickets(s: GameState, env: Env) {
  if (!s.players.length) return;
  const rows = await env.DB.prepare(
    `SELECT user_id,quantity FROM episode_tickets WHERE episode_id=? AND user_id IN(${s.players.map(() => '?').join(',')})`,
  )
    .bind(s.episodeId, ...s.players.map((p) => p.id))
    .all<{ user_id: string; quantity: number }>();
  for (const p of s.players)
    p.hardTickets = rows.results.find((r) => r.user_id === p.id)?.quantity ?? 0;
}
export async function admitHard(s: GameState, env: Env) {
  if (!s.admissionId) throw new Error('입장 ID 누락');
  const ids = JSON.stringify(s.players.map((p) => p.id).sort());
  try {
    await env.DB.prepare('INSERT OR IGNORE INTO hard_entries VALUES(?,?,?,?)')
      .bind(s.admissionId, s.episodeId, ids, Date.now())
      .run();
  } catch (e) {
    if (String(e).includes('HARD_TICKET_REQUIRED'))
      throw new HttpError(
        409,
        `모든 참가자의 에피소드 ${s.episodeId} 하드 티켓이 1장 이상 필요합니다.`,
      );
    throw e;
  }
  const entry = await env.DB.prepare(
    'SELECT episode_id,participants FROM hard_entries WHERE entry_id=?',
  )
    .bind(s.admissionId)
    .first<{ episode_id: number; participants: string }>();
  if (!entry || entry.episode_id !== s.episodeId || entry.participants !== ids)
    throw new Error('입장 기록 불일치');
}
