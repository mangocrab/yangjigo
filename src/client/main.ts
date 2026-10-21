import './style.css';
import { JOBS, STAGES, stageFor, objectiveFor } from '../shared/content';
import {
  DIFFICULTIES,
  EPISODES,
  SKINS,
  isSkin,
  type Difficulty,
  type SkinId,
} from '../shared/rules';
import type {
  Account,
  Command,
  GameState,
  Profile,
  RoomSummary,
} from '../shared/protocol';
import { Input, phone, type Action } from './input';
import { createGame } from './game';
import { skinCanvas, heroCanvas, drawStoryBackdrop } from './art';
import { STORY } from '../shared/story';
import { ZOMBIE_TYPES, type Job } from '../shared/content';
const app = document.querySelector<HTMLElement>('#app')!,
  input = new Input();
const esc = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
type Page =
  | 'auth'
  | 'channels'
  | 'lobby'
  | 'room'
  | 'game'
  | 'shop'
  | 'wardrobe'
  | 'profile';
let page: Page = 'auth',
  profile: Profile | null = null,
  channel = '세종-1',
  state: GameState | null = null,
  ws: WebSocket | null = null,
  roomId = sessionStorage.getItem('sq-room') ?? '',
  invite = '',
  modal = false,
  modalKind = '',
  portrait = false,
  lastEpoch = -1,
  lastMission = -1,
  retries = 0,
  toastTimer = 0,
  retryTimer = 0;
let sceneId = '',
  sceneLine = 0,
  sceneStamp = '';
let toastText = '',
  toastUntil = 0;
let renderer: ReturnType<typeof createGame> | null = null;
async function api<T = Record<string, unknown>>(
  path: string,
  data?: unknown,
): Promise<T> {
  const r = await fetch('/api/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(d.error ?? '서버 요청에 실패했습니다.');
  return d;
}
const click = (id: string, fn: () => void) =>
  document.querySelector(id)?.addEventListener('click', fn);
function clearToast() {
  clearTimeout(toastTimer);
  toastText = '';
  toastUntil = 0;
  const el = document.querySelector<HTMLElement>('#toast');
  if (el) el.hidden = true;
}
function flash(text: string) {
  clearTimeout(toastTimer);
  toastText = text;
  toastUntil = Date.now() + 4500;
  const el = document.querySelector<HTMLElement>('#toast');
  if (el) {
    el.textContent = text;
    el.hidden = false;
  }
  toastTimer = window.setTimeout(clearToast, 4500);
}
function send(c: Command) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(c));
}
const sendInput = () =>
  send({
    v: 1,
    type: 'input',
    direction: input.direction,
    attack: input.attack,
  });
input.onReset = sendInput;
function block() {
  input.blocked = page !== 'game' || modal || portrait || !!state?.cutscene;
  input.reset();
}
function orientation() {
  const p = phone() && innerHeight > innerWidth;
  if (p !== portrait) {
    portrait = p;
    block();
  }
  app.inert = p;
  app.setAttribute('aria-hidden', String(p));
  document.querySelector<HTMLElement>('#rotation')!.hidden = !p;
}
window.addEventListener('resize', orientation);
screen.orientation?.addEventListener('change', orientation);
async function fullscreen() {
  try {
    await document.documentElement.requestFullscreen();
  } catch {}
  try {
    await (
      screen.orientation as ScreenOrientation & {
        lock?: (s: string) => Promise<void>;
      }
    ).lock?.('landscape');
  } catch {}
}
function chrome(content: string) {
  app.innerHTML = `<header><a href="#" class="brand"><b>S<small>Q</small></b><span>세종 봉쇄구역<small>SEJONG : QUARANTINE ZONE</small></span></a><div class="header-meta"><i class="dot"></i>${profile ? esc(profile.nickname) : '생존자 접속'}${page === 'game' ? '<button id="header-menu" aria-label="게임 메뉴">≡</button>' : ''}<button id="fullscreen" aria-label="전체화면">⛶</button></div></header>${content}<div id="modal-root"></div><div id="toast" role="status" ${Date.now() < toastUntil ? '' : 'hidden'}>${Date.now() < toastUntil ? esc(toastText) : ''}</div>`;
  click('.brand', () => {});
  app
    .querySelector('.brand')!
    .addEventListener('click', (e) => e.preventDefault());
  click('#fullscreen', () => void fullscreen());
  click('#header-menu', menu);
  orientation();
}
function authScreen(register = false) {
  page = 'auth';
  block();
  chrome(
    `<main class="entry"><section class="story"><div class="eyebrow">RESTRICTED AREA · EPISODE 00</div><h1>도시는 멈췄다.<br>우리는 아직<br><em>살아 있다.</em></h1><div class="skyline"><i></i><i></i><i></i><i></i></div><p>네 명의 생존자, 하나의 탈출 기록.<br>교실에서 운동장까지, 동료와 함께.</p><span class="tag">온라인 협동 프로토타입 · 키보드 & 터치</span></section><section class="panel auth"><div class="eyebrow">SURVIVOR ACCESS</div><h2>${register ? '생존자 등록' : '다시 만날 시간입니다.'}</h2><p class="muted">${register ? '닉네임 중복은 허용합니다.' : '계정으로 접속하고 동료와 합류하세요.'}</p><form id="auth-form"><label>아이디<input name="username" autocomplete="username" minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]{3,24}" required placeholder="영문·숫자·밑줄 3~24자"></label>${register ? '<label>닉네임<input name="nickname" autocomplete="nickname" minlength="2" maxlength="16" required></label>' : ''}<label>비밀번호<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="10" maxlength="128" required placeholder="10자 이상"></label><p id="form-error" class="error" role="alert"></p><button class="primary" type="submit">${register ? '등록하고 합류하기' : '봉쇄구역 접속'} →</button></form><button id="auth-switch" class="text-button">${register ? '이미 계정이 있나요? 로그인' : '처음 오셨나요? 생존자 등록'}</button><p class="fine">실제 세종시를 모티브로 한 허구의 이야기입니다.<br>학교·연구시설·인물·사건은 가상입니다.</p></section></main>`,
  );
  click('#auth-switch', () => authScreen(!register));
  document.querySelector<HTMLFormElement>('#auth-form')!.onsubmit = async (
    e,
  ) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement,
      button = form.querySelector('button')!;
    button.disabled = true;
    try {
      const d = await api<{ profile: Profile }>(
        register ? 'register' : 'login',
        Object.fromEntries(new FormData(form)),
      );
      profile = d.profile;
      channels();
    } catch (e) {
      document.querySelector('#form-error')!.textContent = (e as Error).message;
      button.disabled = false;
    }
  };
}
function channels() {
  page = 'channels';
  block();
  chrome(
    `<main class="shell"><div class="heading"><div><div class="eyebrow">01 / CONNECT</div><h1>어디서 합류할까요?</h1><p class="muted">채널은 하나의 서버 안에서 구분되는 논리적 공간입니다.</p></div><button id="logout" class="secondary">로그아웃</button></div><div class="two-col">${['세종-1', '세종-2'].map((c, i) => `<button class="panel channel" data-channel="${c}"><span class="eyebrow">CHANNEL 0${i + 1}</span><h2>${c}</h2><p><i class="dot"></i> 접속 가능</p><span>합류하기 →</span></button>`).join('')}</div></main>`,
  );
  app.querySelectorAll<HTMLElement>('[data-channel]').forEach(
    (e) =>
      (e.onclick = () => {
        channel = e.dataset.channel!;
        void lobby();
      }),
  );
  click(
    '#logout',
    () =>
      void api('logout', {}).then(() => {
        profile = null;
        sessionStorage.removeItem('sq-room');
        authScreen();
      }),
  );
}
async function lobby() {
  page = 'lobby';
  modal = false;
  state = null;
  renderer?.game.destroy(true);
  renderer = null;
  input.controller?.abort();
  block();
  try {
    profile = (await api<{ profile: Profile }>('me')).profile;
  } catch {
    authScreen();
    return;
  }
  chrome(
    `<main class="shell"><div class="heading"><div><div class="eyebrow">02 / SAFE HOUSE</div><h1>생존자 대기소 <small class="tag">${esc(channel)}</small></h1><p class="muted">다음 이야기를, 함께.</p></div><button id="channels" class="secondary">채널 변경</button></div><div class="lobby"><aside class="panel profile-card"><canvas data-skin="${profile!.equipped_skin}"></canvas><h2>${esc(profile!.nickname)}</h2><p>Lv. ${profile!.level} · ${profile!.xp} XP</p><div class="progress"><i style="width:${(profile!.xp % 300) / 3}%"></i></div><p class="gold">${profile!.coins} C</p><nav><button id="shop" class="secondary">상점</button><button id="wardrobe" class="secondary">스킨 보관함</button><button id="profile" class="secondary">프로필 · 티켓</button></nav><p class="fine">스킨은 외형만 변경합니다.<br>하드는 전원의 해당 에피소드 티켓이 필요합니다.</p></aside><section class="panel rooms"><div class="heading compact"><h2>합류할 작전</h2><button id="refresh" class="text-button">↻ 새로고침</button></div><div id="rooms-list"></div><form id="create-room" class="inline"><label>새 작전 이름<input name="title" minlength="2" maxlength="32" required placeholder="함께 학교를 탈출해요"></label><label class="check"><input name="private" type="checkbox"> 비공개</label><button class="primary" type="submit">방 만들기 +</button></form><details><summary>초대받은 방에 합류</summary><form id="invite-form" class="inline"><label>방 ID<input name="id" required></label><label>초대 코드<input name="invite"></label><button class="secondary">참가</button></form></details></section></div></main>`,
  );
  previews();
  click('#channels', channels);
  for (const mode of ['shop', 'wardrobe', 'profile'] as const)
    click('#' + mode, () => void accountScreen(mode));
  click('#refresh', () => void rooms());
  document.querySelector<HTMLFormElement>('#create-room')!.onsubmit = async (
    e,
  ) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement,
      button = form.querySelector('button')!;
    button.disabled = true;
    try {
      const f = new FormData(form),
        r = await api<{ id: string; invite: string }>('rooms', {
          title: f.get('title'),
          private: f.get('private') === 'on',
          channel,
        });
      invite = r.invite;
      connect(r.id);
    } catch (e) {
      flash((e as Error).message);
      button.disabled = false;
    }
  };
  document.querySelector<HTMLFormElement>('#invite-form')!.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    void join(String(f.get('id')).trim(), String(f.get('invite')).trim());
  };
  await rooms();
}
async function rooms() {
  try {
    const d = await api<{ rooms: RoomSummary[] }>(
        `rooms?channel=${encodeURIComponent(channel)}`,
      ),
      list = document.querySelector('#rooms-list');
    if (page !== 'lobby' || !list) return;
    list.innerHTML = d.rooms.length
      ? d.rooms
          .map(
            (r) =>
              `<button class="room-row" data-room="${r.id}" ${r.phase !== 'waiting' || r.count >= 4 ? 'disabled' : ''}><span>▣</span><span><strong>${esc(r.title)}</strong><small>에피소드 ${r.episodeId ?? 0} · ${DIFFICULTIES[r.difficulty ?? 'normal'].name} · ${r.phase === 'waiting' ? '대기 중' : '진행 중'}</small></span><b>${r.count}/4 →</b></button>`,
          )
          .join('')
      : '<div class="empty"><h3>아직 시작된 작전이 없습니다.</h3><p>첫 번째 방을 만들고 동료를 초대하세요.</p></div>';
    list
      .querySelectorAll<HTMLElement>('[data-room]')
      .forEach((e) => (e.onclick = () => void join(e.dataset.room!)));
  } catch (e) {
    flash((e as Error).message);
  }
}
async function join(id: string, code = '') {
  try {
    const r = await api<{ id: string; invite: string }>(`rooms/${id}/join`, {
      invite: code,
    });
    invite = r.invite;
    connect(id);
  } catch (e) {
    flash((e as Error).message);
  }
}
function previews() {
  document
    .querySelectorAll<HTMLCanvasElement>('canvas[data-skin]')
    .forEach((c) => {
      const skin = c.dataset.skin;
      if (!isSkin(skin)) return;
      c.width = 32;
      c.height = 32;
      c.getContext('2d')!.drawImage(
        c.dataset.job
          ? heroCanvas(skin, c.dataset.job as Job, c.dataset.armed !== 'false')
          : skinCanvas(skin),
        0,
        0,
      );
    });
}
interface ShopItem {
  id: SkinId;
  name: string;
  price: number;
}
async function accountScreen(mode: 'shop' | 'wardrobe' | 'profile') {
  page = mode;
  block();
  try {
    const [a, shop] = await Promise.all([
      api<Account>('account'),
      api<{ items: ShopItem[] }>('shop'),
    ]);
    if (page !== mode) return;
    profile = a.profile;
    const title = {
      shop: '현장 보급 상점',
      wardrobe: '스킨 보관함',
      profile: '생존자 기록',
    }[mode];
    chrome(
      `<main class="shell"><div class="heading"><div><div class="eyebrow">SURVIVOR / ${mode.toUpperCase()}</div><h1>${title}</h1><p class="muted">${esc(profile.nickname)} · Lv.${profile.level} · <strong class="gold">${profile.coins} C</strong></p></div><button id="back-lobby" class="secondary">로비로</button></div>${mode === 'profile' ? `<section class="panel account-summary"><h2>${esc(profile.nickname)}</h2><p>누적 경험치 ${profile.xp} XP · 현재 ${profile.coins} C</p><p>업적: ${a.achievements.length ? a.achievements.map((x) => (x.endsWith('_hard') ? '하드 생존자' : '첫 탈출 기록')).join(' · ') : '아직 획득한 업적이 없습니다.'}</p></section><div class="episode-list">${a.episodes.map((e) => `<article class="panel"><div class="eyebrow">EPISODE ${String(e.id).padStart(2, '0')} · ${e.available ? '플레이 가능' : '준비 중'}</div><h2>${esc(e.name)}</h2><p>이지 ${e.easy_clears} · 노말 ${e.normal_clears} · 하드 ${e.hard_clears}회</p><strong class="gold">하드 티켓 ${e.tickets}장</strong><p class="fine">최단 기록 ${e.best_seconds === null ? '없음' : e.best_seconds + '초'}</p></article>`).join('')}</div><p class="fine">노말 완주마다 해당 에피소드 하드 티켓 1장 지급. 하드 입장 시 전원이 1장씩 소모하며, 입장 후 재도전은 무료입니다.</p>` : `<p class="fine">실제 게임 재화만 사용합니다. 능력치는 변하지 않습니다. 장착한 외형은 다음 방 참가부터 적용됩니다.</p><div class="skin-grid">${(mode === 'shop' ? shop.items : (Object.keys(SKINS) as SkinId[]).filter((id) => a.inventory.includes(id)).map((id) => ({ id, name: SKINS[id].name, price: 0 }))).map((item) => `<article class="panel skin-card"><canvas data-skin="${item.id}"></canvas><h2>${esc(item.name)}</h2><p>${mode === 'shop' ? item.price + ' C' : '보유 중'}</p>${mode === 'shop' ? `<button class="primary" data-buy="${item.id}" ${a.inventory.includes(item.id) ? 'disabled' : ''}>${a.inventory.includes(item.id) ? '보유 중' : '구매'}</button>` : `<button class="primary" data-equip="${item.id}" ${profile!.equipped_skin === item.id ? 'disabled' : ''}>${profile!.equipped_skin === item.id ? '장착 중' : '장착'}</button>`}</article>`).join('')}</div>`}</main>`,
    );
    previews();
    click('#back-lobby', () => void lobby());
    app.querySelectorAll<HTMLElement>('[data-equip]').forEach(
      (el) =>
        (el.onclick = async () => {
          try {
            await api('skins/equip', { skinId: el.dataset.equip });
            await accountScreen('wardrobe');
            flash('장착했습니다. 다음 방 참가부터 적용됩니다.');
          } catch (e) {
            flash((e as Error).message);
          }
        }),
    );
    app.querySelectorAll<HTMLElement>('[data-buy]').forEach(
      (el) =>
        (el.onclick = () => {
          const item = shop.items.find((i) => i.id === el.dataset.buy)!;
          const requestId = crypto.randomUUID();
          dialog(
            `<div class="eyebrow">PURCHASE CONFIRMATION</div><h2>${esc(item.name)}</h2><p>${item.price} C를 사용해 구매할까요?</p><button id="confirm-purchase" class="primary">구매 확정</button><button id="cancel-purchase" class="secondary">취소</button>`,
            'purchase',
          );
          click('#cancel-purchase', closeModal);
          click('#confirm-purchase', async () => {
            const button =
              document.querySelector<HTMLButtonElement>('#confirm-purchase')!;
            button.disabled = true;
            try {
              await api('shop/purchase', { skinId: item.id, requestId });
              closeModal();
              await accountScreen('shop');
              flash('구매가 완료됐습니다.');
            } catch (e) {
              flash((e as Error).message);
              button.disabled = false;
            }
          });
        }),
    );
  } catch (e) {
    await lobby();
    flash((e as Error).message);
  }
}
function connect(id: string) {
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  clearTimeout(retryTimer);
  roomId = id;
  sessionStorage.setItem('sq-room', id);
  page = 'room';
  chrome(
    '<main class="shell"><section class="panel">동료와 연결하고 있습니다…</section></main>',
  );
  openSocket();
}
function openSocket() {
  const socket = new WebSocket(
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${roomId}/ws`,
  );
  ws = socket;
  socket.onopen = () => {
    retries = 0;
  };
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data) as {
      type: string;
      state: GameState;
      message: string;
    };
    if (m.type === 'error') {
      flash(m.message);
      return;
    }
    state = m.state;
    channel = state.channel;
    if (state.phase === 'waiting') {
      page = 'room';
      waiting();
    } else {
      if (page !== 'game') {
        page = 'game';
        gameScreen();
      }
      updateGame();
    }
  };
  socket.onclose = (e) => {
    input.reset();
    const c = document.querySelector('#connection');
    if (c) c.textContent = '연결 끊김';
    if (e.code === 4001) {
      flash('다른 창에서 접속했습니다.');
      return;
    }
    if (roomId && retries++ < 6)
      retryTimer = window.setTimeout(
        async () => {
          try {
            await api(`rooms/${roomId}/join`, { invite });
            openSocket();
          } catch (e) {
            await leave();
            flash((e as Error).message);
          }
        },
        Math.min(5000, 500 * 2 ** retries),
      );
  };
  socket.onerror = () => flash('연결을 확인하고 있습니다.');
}
async function leave() {
  const id = roomId;
  roomId = '';
  sessionStorage.removeItem('sq-room');
  clearTimeout(retryTimer);
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  input.reset();
  try {
    await api(`rooms/${id}/leave`, {});
  } catch {}
  await lobby();
}
function waiting() {
  if (!state || !profile) return;
  const s = state,
    p = s.players.find((p) => p.id === profile!.id);
  if (!p) return;
  block();
  chrome(
    `<main class="shell"><div class="heading"><div><div class="eyebrow">03 / ASSEMBLE</div><h1>${esc(s.title)}</h1><p>에피소드 ${s.episodeId} · ${EPISODES[s.episodeId]?.name ?? '이야기'} · ${DIFFICULTIES[s.difficulty].name}</p></div><button id="leave" class="secondary">방 나가기</button></div><section class="panel briefing"><div><h2>사태가 시작된 그날, 우리는 학생이었다.</h2><p>돌을 던져 버티고 비상 장비함에서 각자의 무기를 찾으세요.<br>교실 → 동관 → 운동장, 구간마다 이어지는 생존 이야기.</p></div><div class="invite"><small>방 ID</small><code>${s.roomId}</code>${s.private ? `<small>비공개 초대 코드</small><code>${invite}</code>` : ''}<button id="copy" class="text-button">초대 정보 복사</button></div></section><div class="settings-row"><label>에피소드<select id="episode" ${s.host !== p.id ? 'disabled' : ''}>${EPISODES.map((e) => `<option value="${e.id}" ${e.id === s.episodeId ? 'selected' : ''} ${!e.available ? 'disabled' : ''}>에피소드 ${e.id} · ${e.name}${e.available ? '' : ' (준비 중)'}</option>`).join('')}</select></label><label>난이도<select id="difficulty" ${s.host !== p.id ? 'disabled' : ''}>${Object.entries(
      DIFFICULTIES,
    )
      .map(
        ([k, v]) =>
          `<option value="${k}" ${s.difficulty === k ? 'selected' : ''}>${v.name}</option>`,
      )
      .join(
        '',
      )}</select></label><button id="refresh-tickets" class="secondary">티켓 새로고침</button></div><p class="fine">노말 클리어 시 이 에피소드 하드 티켓 1장을 받습니다. 하드 입장은 전원 1장씩 소모 · 재도전은 추가 소모 없음. 설정 변경 시 모두 준비가 해제됩니다.</p><div class="party-grid">${Array.from(
      { length: 4 },
      (_, i) => {
        const q = s.players[i];
        return q
          ? `<article class="panel party-slot"><small>0${i + 1} ${q.id === s.host ? '방장' : ''}</small><canvas data-skin="${q.skin}" data-job="${q.job}"></canvas><h3>${esc(q.name)}</h3><p>${JOBS[q.job].character} · ${JOBS[q.job].name}</p><p class="${s.difficulty === 'hard' && !q.hardTickets ? 'error' : 'gold'}">에피소드 ${s.episodeId} 티켓 ${q.hardTickets}장</p><strong>${!q.connected ? '재접속 대기' : q.ready ? '준비 완료' : '준비 중'}</strong></article>`
          : '<article class="panel party-slot empty"><span>＋</span><p>동료를 기다리는 중</p></article>';
      },
    ).join(
      '',
    )}</div><section class="character-select"><h2>주연 캐릭터 · 직업 선택</h2><p class="fine">방에서 선택하고 시작 후 무기를 얻습니다. 직업은 한 명씩만 선택할 수 있습니다. 다른 동료가 선택한 직업은 잠깁니다. 스킨은 의상만 바꿉니다.</p><div class="hero-grid">${(
      Object.entries(JOBS) as [Job, (typeof JOBS)[Job]][]
    )
      .map(([id, job]) => {
        const owner = s.players.find((q) => q.job === id),
          taken = owner && owner.id !== p.id;
        return `<button class="panel hero-card ${p.job === id ? 'selected' : ''}" data-job-choice="${id}" aria-pressed="${p.job === id}" ${taken ? 'disabled' : ''}><canvas data-skin="${p.skin}" data-job="${id}"></canvas><span><small>${job.identity} / ${job.name}</small><strong>${job.character}</strong><span>${job.bio}</span><b>${job.weapon} · ${job.skills.join(' / ')}</b><em>${taken ? `${esc(owner.name)}님 선택 중` : p.job === id ? '내가 선택한 직업' : '선택 가능'}</em></span></button>`;
      })
      .join(
        '',
      )}</div></section><details class="enemy-guide"><summary>학교 감염자 도감 · 3종</summary>${Object.values(
      ZOMBIE_TYPES,
    )
      .map((z) => `<p><strong>${z.name}</strong> — ${z.concept}</p>`)
      .join(
        '',
      )}</details><div class="settings-row"><label>직업<select id="job">${(
      Object.entries(JOBS) as [Job, (typeof JOBS)[Job]][]
    )
      .map(([id, job]) => {
        const owner = s.players.find((q) => q.job === id && q.id !== p.id);
        return `<option value="${id}" ${p.job === id ? 'selected' : ''} ${owner ? 'disabled' : ''}>${job.name} · ${job.character}${owner ? ' (선택 중)' : ''}</option>`;
      })
      .join(
        '',
      )}</select></label><button id="ready" class="primary">${p.ready ? '준비 취소' : '준비 완료'}</button>${s.host === p.id ? `<button id="start" class="primary" ${s.players.some((q) => !q.ready || !q.connected) ? 'disabled' : ''}>작전 시작 →</button>` : ''}</div></main>`,
  );
  previews();
  click('#leave', () => void leave());
  document
    .querySelectorAll<HTMLElement>('[data-job-choice]')
    .forEach(
      (el) =>
        (el.onclick = () =>
          send({ v: 1, type: 'job', job: el.dataset.jobChoice as Job })),
    );
  click('#ready', () => send({ v: 1, type: 'ready', ready: !p.ready }));
  click('#start', () => send({ v: 1, type: 'start' }));
  click('#refresh-tickets', () => send({ v: 1, type: 'refresh' }));
  document.querySelector<HTMLSelectElement>('#job')!.onchange = (e) =>
    send({
      v: 1,
      type: 'job',
      job: (e.target as HTMLSelectElement).value as Job,
    });
  for (const id of ['episode', 'difficulty'])
    document.querySelector<HTMLSelectElement>('#' + id)!.onchange = () =>
      send({
        v: 1,
        type: 'configure',
        episodeId: Number(
          document.querySelector<HTMLSelectElement>('#episode')!.value,
        ),
        difficulty: document.querySelector<HTMLSelectElement>('#difficulty')!
          .value as Difficulty,
      });
  click('#copy', () => {
    void navigator.clipboard
      .writeText(
        `방 ID: ${s.roomId}${s.private ? '\n초대 코드: ' + invite : ''}`,
      )
      .then(() => flash('복사했습니다.'))
      .catch(() => flash(`방 ID: ${s.roomId}`));
  });
}
function gameScreen() {
  modal = false;
  lastEpoch = -1;
  lastMission = -1;
  sceneStamp = '';
  chrome(
    `<main class="game-shell"><aside class="mission-panel"><div id="stage-progress" class="eyebrow"></div><h2>탈출 불가능한<br>학교</h2><p id="difficulty-label" class="tag"></p><p id="checkpoint" class="fine"></p><div class="mission-box"><small>현재 목표</small><h3 id="mission"></h3></div><div class="eyebrow">SURVIVORS</div><div id="team"></div><div class="sidebar-bottom"><span id="connection">연결됨</span><button id="menu" class="secondary">메뉴 / 설정 ESC</button></div></aside><section class="play-area"><div class="map-heading"><span id="map-location"></span><span id="elapsed"></span></div><div id="game-canvas"></div><div class="overlay"><div id="self-hud"></div><div id="notice" role="status"></div></div><div class="touch-controls"><div id="joystick" aria-label="이동 조이스틱"><span></span><b>이동</b></div><div class="combat"><button id="skill1" data-action="skill1"></button><button id="skill2" data-action="skill2"></button><button id="interact" data-action="interact">상호작용 E</button><button id="attack">공격 J</button></div></div><div class="keyboard-help">WASD / ↑↓←→ 이동　 J 공격　 K · L 스킬　 E 상호작용　 무기 획득 후 K · L 스킬</div></section></main>`,
  );
  renderer = createGame(document.querySelector('#game-canvas')!);
  renderer.scene.localId = profile!.id;
  input.bind();
  click('#menu', menu);
  block();
}
function updateGame() {
  if (!state || !renderer) return;
  const s = state,
    p = s.players.find((p) => p.id === profile?.id);
  if (!p) return;
  renderer.scene.state = s;
  if (lastEpoch !== s.stageEpoch) {
    if (modal) closeModal();
    input.reset();
    lastEpoch = s.stageEpoch;
    lastMission = -1;
  }
  const stage = stageFor(s),
    objective = objectiveFor(s);
  document.querySelector('#stage-progress')!.textContent =
    `EPISODE ${String(s.episodeId).padStart(2, '0')} / ${s.stageIndex + 1} OF 3`;
  document.querySelector('#difficulty-label')!.textContent =
    DIFFICULTIES[s.difficulty].name;
  document.querySelector('#checkpoint')!.textContent =
    '체크포인트 · ' + stage.name;
  document.querySelector('#map-location')!.textContent = stage.name;
  document.querySelector('#mission')!.textContent =
    s.phase === 'clear'
      ? '학교 탈출 완료'
      : (objective?.text ?? '임무 완료') +
        (objective?.kind === 'survive'
          ? ` (${Math.max(0, Math.ceil((s.defendUntil - s.now) / 1000))}초)`
          : '');
  document.querySelector('#team')!.innerHTML = s.players
    .map(
      (q) =>
        `<div class="teammate"><strong>${esc(q.name)} ${q.id === p.id ? '· 나' : ''}</strong><div class="progress"><i style="width:${(q.hp / JOBS[q.job].hp) * 100}%"></i></div><small>${!q.hp ? '쓰러짐 · 구조 필요' : !q.connected ? '재접속 대기' : JOBS[q.job].name + ' · ' + q.hp + ' HP'}</small></div>`,
    )
    .join('');
  document.querySelector('#self-hud')!.innerHTML =
    `${JOBS[p.job].character} · ${JOBS[p.job].name} <strong>${p.hp} / ${JOBS[p.job].hp} HP</strong> <span class="gold">${p.weaponAcquired ? JOBS[p.job].weapon : '돌 던지기 · 무기 미획득'}</span>`;
  document.querySelector('#notice')!.textContent = s.notice;
  const seconds = Math.max(0, Math.floor((s.now - s.startedAt) / 1000));
  document.querySelector('#elapsed')!.textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  for (const slot of [1, 2] as const) {
    const el = document.querySelector<HTMLButtonElement>('#skill' + slot)!,
      remain = Math.max(0, Math.ceil((p.skillAt[slot - 1] - s.now) / 1000));
    el.textContent = !p.weaponAcquired
      ? '무기 획득 후'
      : remain
        ? remain + '초'
        : JOBS[p.job].skills[slot - 1];
    el.disabled = !p.weaponAcquired || !!s.cutscene || remain > 0 || !p.hp;
  }
  document.querySelector<HTMLButtonElement>('#interact')!.disabled =
    !stage.objects.some(
      (o) => Math.abs(p.x - o.x) + Math.abs(p.y - o.y) <= 1,
    ) &&
    !s.players.some(
      (q) => !q.hp && Math.abs(p.x - q.x) + Math.abs(p.y - q.y) <= 1,
    );
  document.querySelector('#attack')!.textContent = p.weaponAcquired
    ? '공격 J'
    : '돌 던지기 J';
  if (s.cutscene) {
    showCutscene();
    lastMission = s.mission;
    return;
  }
  if (modalKind === 'cutscene') {
    closeModal();
    sceneStamp = '';
  }
  if (s.phase === 'clear' || s.phase === 'over') {
    if (modalKind !== 'result') result();
  } else if (lastMission !== s.mission) {
    if (modalKind === 'puzzle') closeModal();
    if (lastMission === 0 && stage.objects.some((o) => o.kind === 'npc')) {
      const npc = stage.objects.find((o) => o.kind === 'npc')!;
      dialog(
        `<div class="eyebrow">보건교사 / 윤서</div><h2>함께 움직여요.</h2><p>${esc(npc.text)}</p><button id="dialog-next" class="primary">알겠습니다</button>`,
        'story',
      );
      click('#dialog-next', closeModal);
    }
  }
  lastMission = s.mission;
}
function showCutscene(force = false) {
  const s = state!,
    scene = s.cutscene;
  if (!scene) return;
  if (sceneId !== scene.id) {
    sceneId = scene.id;
    sceneLine = 0;
    sceneStamp = '';
    clearToast();
  }
  const stamp = scene.id + scene.acknowledged.join(',');
  if (!force && sceneStamp === stamp && modalKind === 'cutscene') return;
  sceneStamp = stamp;
  const story = STORY[scene.key],
    line = story.lines[sceneLine],
    done = scene.acknowledged.includes(profile!.id),
    connected = s.players.filter((p) => p.connected),
    count = connected.filter((p) => scene.acknowledged.includes(p.id)).length;
  dialog(
    `<div class="cutscene" data-scene="${scene.key}"><div class="scene-top"><span>${story.location}</span><span>STORY ${sceneLine + 1} / ${story.lines.length}</span></div><h2>${story.title}</h2><canvas id="story-backdrop" aria-label="${story.title} 도트 배경"></canvas><div class="scene-dialogue">${line.job ? `<canvas class="scene-portrait" data-skin="${s.players.find((p) => p.job === line.job)?.skin ?? 'uniform'}" data-job="${line.job}" data-armed="${scene.key !== 'outbreak'}"></canvas>` : '<span class="broadcast-icon">▥</span>'}<div><strong>${line.speaker}</strong><p>${esc(line.text)}</p></div></div><div class="scene-actions"><span>${done ? `동료를 기다립니다 · ${count}/${connected.length}명 확인` : '이야기 중에는 모두의 전투와 이동이 멈춥니다.'}</span><button id="scene-next" class="primary" ${done ? 'disabled' : ''}>${done ? '전원 확인 대기' : sceneLine === story.lines.length - 1 ? '장면 확인' : '다음 대사 →'}</button></div></div>`,
    'cutscene',
  );
  drawStoryBackdrop(
    document.querySelector<HTMLCanvasElement>('#story-backdrop')!,
    story.setting,
    scene.key !== 'outbreak',
  );
  previews();
  click('#scene-next', () => {
    if (sceneLine < story.lines.length - 1) {
      sceneLine++;
      showCutscene(true);
    } else send({ v: 1, type: 'scene-done', sceneId: scene.id });
  });
}
function dialog(html: string, kind = 'other') {
  modal = true;
  modalKind = kind;
  block();
  document.querySelector('#modal-root')!.innerHTML =
    `<div class="modal-shade"><section class="panel modal" role="dialog" aria-modal="true">${html}</section></div>`;
  document.querySelector<HTMLButtonElement>('#modal-root button')?.focus();
}
function closeModal() {
  modal = false;
  modalKind = '';
  document.querySelector('#modal-root')!.innerHTML = '';
  clearToast();
  block();
}
function puzzle() {
  dialog(
    '<div class="eyebrow">EMERGENCY LOCK</div><h2>교실 비상 잠금장치</h2><p>칠판의 세 자리 번호를 입력하세요.</p><form id="puzzle-form"><label>잠금장치 번호<input id="puzzle-code" name="code" inputmode="numeric" pattern="[0-9]{3}" maxlength="3" required></label><button class="primary">잠금 해제</button><button id="close-puzzle" type="button" class="secondary">돌아가기</button></form>',
    'puzzle',
  );
  document.querySelector<HTMLFormElement>('#puzzle-form')!.onsubmit = (e) => {
    e.preventDefault();
    send({
      v: 1,
      type: 'puzzle',
      code: document.querySelector<HTMLInputElement>('#puzzle-code')!.value,
    });
  };
  document.querySelector<HTMLInputElement>('#puzzle-code')!.focus();
  click('#close-puzzle', closeModal);
}
function bench() {
  if (state?.episodeId === 0) {
    flash('에피소드 0에는 작업대가 없습니다. 비상 장비함에서 무기를 얻으세요.');
    return;
  }
  const p = state?.players.find((p) => p.id === profile?.id);
  if (!p) return;
  dialog(
    `<div class="eyebrow">FIELD WORKBENCH</div><h2>현장 장비 강화</h2><p>공격력 +20% / 단계 · 최대 4단계</p><p>현재 +${p.upgrade} · 부품 ${p.parts}개<br>다음 비용 ${(p.upgrade + 1) * 3}개</p><button id="upgrade" class="primary" ${p.upgrade >= 4 || p.parts < (p.upgrade + 1) * 3 ? 'disabled' : ''}>공격력 강화</button><button id="close-bench" class="secondary">돌아가기</button>`,
  );
  click('#upgrade', () => {
    send({ v: 1, type: 'upgrade' });
    closeModal();
  });
  click('#close-bench', closeModal);
}
function menu() {
  if (page !== 'game' || portrait || modal) return;
  dialog(
    `<h2>잠시 숨을 고르세요.</h2><p>메뉴 중에도 방의 게임은 계속됩니다.</p><label>조작 버튼 크기<input id="control-size" type="range" min="0.75" max="1.25" step="0.05" value="${localStorage.getItem('sq-size') ?? 1}"></label><label>조작 UI 투명도<input id="control-opacity" type="range" min="0.25" max="1" step="0.05" value="${localStorage.getItem('sq-opacity') ?? 0.8}"></label><button id="reset-controls" class="text-button">기본 배치 초기화</button><button id="resume" class="primary">작전 복귀</button><button id="leave" class="secondary">로비로 나가기</button>`,
  );
  for (const [id, key, css] of [
    ['control-size', 'sq-size', '--control-scale'],
    ['control-opacity', 'sq-opacity', '--control-opacity'],
  ])
    document.querySelector<HTMLInputElement>('#' + id)!.oninput = (e) => {
      const v = (e.target as HTMLInputElement).value;
      localStorage.setItem(key, v);
      document.documentElement.style.setProperty(css, v);
    };
  click('#reset-controls', () => {
    localStorage.removeItem('sq-size');
    localStorage.removeItem('sq-opacity');
    document.documentElement.style.setProperty('--control-scale', '1');
    document.documentElement.style.setProperty('--control-opacity', '.8');
    closeModal();
    menu();
  });
  click('#resume', closeModal);
  click('#leave', () => void leave());
}
function result() {
  const s = state!,
    clear = s.phase === 'clear',
    r =
      s.contentVersion < 2
        ? { xp: 100, coins: 50 }
        : DIFFICULTIES[s.difficulty];
  dialog(
    `<div class="eyebrow">EPISODE ${s.episodeId} / ${clear ? 'COMPLETE' : 'RETRY'}</div><h2>${clear ? '우리는 살아남았다.' : '아직 끝이 아닙니다.'}</h2><p>${esc(s.notice)}</p>${clear ? `<p>에피소드 ${s.episodeId} · ${DIFFICULTIES[s.difficulty].name} 클리어<br>보상 ${r.xp} XP · ${r.coins} C</p>${s.difficulty === 'normal' && s.contentVersion >= 2 ? `<p class="gold">에피소드 ${s.episodeId} 하드 티켓 +1장</p>` : ''}<p class="fine">다음 이야기: 에피소드 ${s.episodeId + 1} (준비 중)</p>` : `<p>체크포인트: ${STAGES[s.checkpoint.stageIndex].name}<br>HP·무기 획득 상태는 구간 진입 당시로 복원됩니다.<br>하드 입장 후 재도전은 티켓을 추가 소모하지 않습니다.</p>${s.host === profile!.id ? '<button id="retry" class="primary">체크포인트 재도전</button><button id="restart" class="secondary">처음부터 다시</button>' : ''}`}<button id="leave" class="secondary">로비로 돌아가기</button>`,
    'result',
  );
  for (const type of ['retry', 'restart'] as const)
    click('#' + type, () => {
      closeModal();
      send({ v: 1, type });
    });
  click('#leave', () => void leave());
}
input.onAction = (a: Action) => {
  if (portrait) return;
  if (a === 'menu') {
    if (state?.cutscene) return;
    if (modal) closeModal();
    else menu();
    return;
  }
  if (input.blocked) return;
  if (a === 'skill1' || a === 'skill2')
    send({ v: 1, type: 'skill', slot: a === 'skill1' ? 1 : 2 });
  if (a === 'upgrade') bench();
  if (a === 'interact') {
    const s = state,
      p = s?.players.find((p) => p.id === profile?.id);
    if (!s || !p) return;
    const near = stageFor(s).objects.filter(
        (o) => Math.abs(p.x - o.x) + Math.abs(p.y - o.y) <= 1,
      ),
      o = near.find((o) => o.id === objectiveFor(s)?.target) ?? near[0];
    if (o?.kind === 'bench') bench();
    else if (o?.kind === 'puzzle' && objectiveFor(s)?.kind === 'puzzle')
      puzzle();
    else if (o?.kind === 'hint') {
      send({ v: 1, type: 'interact' });
      dialog(
        `<h2>${esc(o.name)}</h2><p>${esc(o.text)}</p><button id="close-hint" class="primary">기억했습니다</button>`,
      );
      click('#close-hint', closeModal);
    } else send({ v: 1, type: 'interact' });
  }
};
let lastInput = '',
  lastSent = 0;
setInterval(() => {
  if (page !== 'game' || ws?.readyState !== 1) return;
  const packet = JSON.stringify([input.direction, input.attack]);
  if (
    packet !== lastInput ||
    ((input.direction || input.attack) && Date.now() - lastSent > 250)
  ) {
    lastInput = packet;
    lastSent = Date.now();
    sendInput();
  }
}, 35);
setInterval(() => {
  if (page === 'lobby') void rooms();
}, 5000);
for (const [key, css] of [
  ['sq-size', '--control-scale'],
  ['sq-opacity', '--control-opacity'],
]) {
  const v = localStorage.getItem(key);
  if (v) document.documentElement.style.setProperty(css, v);
}
orientation();
async function boot() {
  try {
    profile = (await api<{ profile: Profile }>('me')).profile;
  } catch {
    sessionStorage.removeItem('sq-room');
    roomId = '';
    authScreen();
    return;
  }
  if (roomId) {
    try {
      const r = await api<{ invite: string }>(`rooms/${roomId}/join`, {
        invite: '',
      });
      invite = r.invite;
      connect(roomId);
      return;
    } catch {
      sessionStorage.removeItem('sq-room');
      roomId = '';
      channels();
      flash('이전 방이 만료되었습니다. 새 작전에 합류하세요.');
      return;
    }
  }
  channels();
}
void boot();
