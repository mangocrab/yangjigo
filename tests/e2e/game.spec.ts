import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { pathStep, distance } from '../../src/server/simulation';
import { stageFor, objectiveFor, tileOpen } from '../../src/shared/content';
import { STORY } from '../../src/shared/story';
import type { GameState } from '../../src/shared/protocol';
async function observe(c: BrowserContext) {
  await c.addInitScript(() => {
    const Native = window.WebSocket;
    (window as any).__state = null;
    window.WebSocket = class extends Native {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        (window as any).__ws = this;
        this.addEventListener('message', (e) => {
          const d = JSON.parse(e.data);
          if (d.type === 'snapshot') (window as any).__state = d.state;
        });
      }
    } as typeof WebSocket;
  });
}
const snap = (p: Page): Promise<GameState> =>
  p.evaluate(() => (window as any).__state);
async function send(p: Page, data: unknown) {
  await p.evaluate((d) => (window as any).__ws.send(JSON.stringify(d)), data);
}
async function api(p: Page, path: string, data?: unknown) {
  return p.evaluate(
    async ({ path, data }) => {
      const r = await fetch('/api/' + path, {
        method: data === undefined ? 'GET' : 'POST',
        headers:
          data === undefined ? {} : { 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, data },
  );
}
async function register(p: Page, name: string) {
  const username = 'u_' + crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  await p.goto('/');
  await p.getByRole('button', { name: '처음 오셨나요? 생존자 등록' }).click();
  await p.getByLabel('아이디', { exact: true }).fill(username);
  await p.getByLabel('닉네임', { exact: true }).fill(name);
  await p
    .getByLabel('비밀번호', { exact: true })
    .fill('Valid-test-password-42');
  await p.getByRole('button', { name: '등록하고 합류하기' }).click();
  await p.getByRole('button', { name: /CHANNEL 01/ }).click();
  await expect(p.getByRole('heading', { name: /생존자 대기소/ })).toBeVisible();
  return { username, password: 'Valid-test-password-42' };
}
async function create(p: Page, title: string) {
  await p.getByLabel('새 작전 이름').fill(title);
  await p.getByRole('button', { name: '방 만들기' }).click();
  await expect.poll(async () => (await snap(p))?.phase).toBe('waiting');
  return (await snap(p)).roomId;
}
async function ready(p: Page) {
  await send(p, { v: 1, type: 'ready', ready: true });
  await expect
    .poll(
      async () =>
        (await snap(p)).players.find((q) => q.id === (p as any).uid)?.ready ??
        false,
    )
    .toBe(true);
}
async function rawSocket(p: Page, id: string) {
  await p.goto('/api/me');
  await p.evaluate(
    (id) => new WebSocket(`ws://${location.host}/api/rooms/${id}/ws`),
    id,
  );
  await expect.poll(async () => (await snap(p))?.roomId).toBe(id);
}
async function drive(pages: Page[], timeout = 130000) {
  const end = Date.now() + timeout,
    seen = new Set<number>();
  while (Date.now() < end) {
    const s = await snap(pages[0]);
    seen.add(s.stageIndex);
    if (s.phase === 'clear') return seen;
    expect(s.phase).not.toBe('over');
    if (s.cutscene) {
      for (const p of pages)
        await send(p, { v: 1, type: 'scene-done', sceneId: s.cutscene.id });
      await pages[0].waitForTimeout(70);
      continue;
    }
    const stage = stageFor(s),
      o = objectiveFor(s),
      target = stage.objects.find((p) => p.id === o.target)!;
    for (let i = 0; i < pages.length; i++) {
      const p = s.players[i];
      if (!p) throw new Error('참가자 누락');
      const enemy = s.zombies
          .filter((z) => z.hp > 0 && distance(p, z) <= 4)
          .sort((a, b) => distance(a, p) - distance(b, p))[0],
        down = s.players.find((q) => q.id !== p.id && !q.hp),
        follow = i && distance(p, s.players[0]) > 2 ? s.players[0] : null,
        goal = down ?? enemy ?? follow ?? target,
        step = pathStep(p, goal, (x, y) => tileOpen(s, x, y)),
        direction = step
          ? step.x > p.x
            ? 'right'
            : step.x < p.x
              ? 'left'
              : step.y > p.y
                ? 'down'
                : 'up'
          : null;
      await send(pages[i], { v: 1, type: 'input', direction, attack: true });
      if (p.hp) {
        if (
          p.weaponAcquired &&
          s.now >= p.skillAt[0] &&
          (enemy || s.players.some((q) => q.hp < 100))
        )
          await send(pages[i], { v: 1, type: 'skill', slot: 1 });
        if (
          p.weaponAcquired &&
          s.now >= p.skillAt[1] &&
          (p.job === 'medic' ? !!down : !!enemy)
        )
          await send(pages[i], { v: 1, type: 'skill', slot: 2 });
        if (!enemy && distance(p, target) <= 1 && o.kind !== 'survive')
          await send(
            pages[i],
            o.kind === 'puzzle'
              ? { v: 1, type: 'puzzle', code: o.code }
              : { v: 1, type: 'interact' },
          );
        if (down && distance(p, down) <= 1)
          await send(pages[i], { v: 1, type: 'interact' });
      }
    }
    await pages[0].waitForTimeout(65);
  }
  throw new Error('완주 시간 초과');
}

test('4인 노말 완주 → 에피소드별 티켓 → 전원 하드 입장·차감 → 구매·장착·프로필', async ({
  browser,
}) => {
  test.setTimeout(300000);
  const contexts: BrowserContext[] = [],
    pages: Page[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      const c = await browser.newContext(
        i === 3
          ? {
              viewport: { width: 900, height: 440 },
              hasTouch: true,
              isMobile: true,
              userAgent:
                'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
            }
          : {},
      );
      contexts.push(c);
      await observe(c);
      const p = await c.newPage();
      pages.push(p);
      await register(p, '생존대원' + i);
      (p as any).uid = (await api(p, 'me')).body.profile.id;
    }
    const id = await create(pages[0], '에피소드 0 협동 검증');
    for (let i = 1; i < 4; i++) {
      await api(pages[i], `rooms/${id}/join`, {});
      await rawSocket(pages[i], id);
    }
    await send(pages[0], {
      v: 1,
      type: 'configure',
      episodeId: 0,
      difficulty: 'hard',
    });
    await expect
      .poll(async () => (await snap(pages[0])).difficulty)
      .toBe('hard');
    for (const p of pages) await ready(p);
    await send(pages[0], { v: 1, type: 'start' });
    await expect(pages[0].locator('#toast')).toContainText('모든 참가자');
    expect((await snap(pages[0])).phase).toBe('waiting');
    for (const p of pages)
      expect((await api(p, 'account')).body.episodes[0].tickets).toBe(0);
    await send(pages[0], {
      v: 1,
      type: 'configure',
      episodeId: 1,
      difficulty: 'normal',
    });
    await expect(pages[0].locator('#toast')).toContainText('준비 중');
    expect((await snap(pages[0])).episodeId).toBe(0);
    await send(pages[0], {
      v: 1,
      type: 'configure',
      episodeId: 0,
      difficulty: 'normal',
    });
    await expect
      .poll(async () => (await snap(pages[0])).difficulty)
      .toBe('normal');
    expect(new Set((await snap(pages[0])).players.map((p) => p.job)).size).toBe(
      4,
    );
    for (const p of pages) await ready(p);
    await send(pages[0], { v: 1, type: 'start' });
    await expect.poll(async () => (await snap(pages[0])).phase).toBe('playing');
    await rawSocket(pages[0], id);
    expect([...(await drive(pages))]).toEqual([0, 1, 2]);
    for (const p of pages) {
      await expect.poll(async () => (await snap(p)).phase).toBe('clear');
      const a = (await api(p, 'account')).body;
      expect(a.profile.xp).toBe(300);
      expect(a.profile.coins).toBe(150);
      expect(a.profile.level).toBe(2);
      expect(a.episodes[0].tickets).toBe(1);
      expect(a.episodes[0].normal_clears).toBe(1);
      expect(a.episodes[1].tickets).toBe(0);
    }
    await send(pages[0], { v: 1, type: 'interact' });
    expect((await api(pages[0], 'account')).body.episodes[0].tickets).toBe(1);
    // 구매·장착의 소유권과 잔액을 실제 API에서 검사한다.
    const tx = crypto.randomUUID();
    const unowned = await api(pages[0], 'skins/equip', { skinId: 'rescue' });
    expect(unowned.status).toBe(403);
    const poor = await api(pages[0], 'shop/purchase', {
      skinId: 'rescue',
      requestId: crypto.randomUUID(),
    });
    expect(poor.status).toBe(409);
    const bought = await api(pages[0], 'shop/purchase', {
      skinId: 'survivor',
      requestId: tx,
    });
    expect(bought.status).toBe(200);
    expect(bought.body.account.profile.coins).toBe(75);
    const duplicate = await api(pages[0], 'shop/purchase', {
      skinId: 'survivor',
      requestId: tx,
    });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.account.profile.coins).toBe(75);
    expect(
      (
        await api(pages[0], 'shop/purchase', {
          skinId: 'explorer',
          requestId: tx,
        })
      ).status,
    ).toBe(409);
    expect(
      (await api(pages[0], 'skins/equip', { skinId: 'survivor' })).status,
    ).toBe(200);
    for (const p of pages) {
      await api(p, `rooms/${id}/leave`, {});
      await p.evaluate(() => sessionStorage.removeItem('sq-room'));
    }
    await pages[0].goto('/');
    await pages[0].getByRole('button', { name: /CHANNEL 01/ }).click();
    const hardId = await create(pages[0], '하드 입장 검증');
    for (let i = 1; i < 4; i++) {
      await api(pages[i], `rooms/${hardId}/join`, {});
      await rawSocket(pages[i], hardId);
    }
    expect((await snap(pages[0])).players[0].skin).toBe('survivor');
    await send(pages[0], {
      v: 1,
      type: 'configure',
      episodeId: 0,
      difficulty: 'hard',
    });
    await expect
      .poll(async () => (await snap(pages[0])).difficulty)
      .toBe('hard');
    expect(new Set((await snap(pages[0])).players.map((p) => p.job)).size).toBe(
      4,
    );
    for (const p of pages) await ready(p);
    await send(pages[0], { v: 1, type: 'start' });
    await expect.poll(async () => (await snap(pages[0])).phase).toBe('playing');
    const admission = (await snap(pages[0])).admissionId;
    expect(admission).toBeTruthy();
    expect((await snap(pages[0])).zombies[0].maxHp).toBe(117);
    for (const p of pages)
      expect((await api(p, 'account')).body.episodes[0].tickets).toBe(0);
    await send(pages[0], { v: 1, type: 'start' });
    for (const p of pages)
      expect((await api(p, 'account')).body.episodes[0].tickets).toBe(0);
    await rawSocket(pages[0], hardId);
    expect([...(await drive(pages))]).toEqual([0, 1, 2]);
    for (const p of pages) {
      const a = (await api(p, 'account')).body;
      expect(a.profile.xp).toBe(750);
      expect(a.episodes[0].hard_clears).toBe(1);
      expect(a.episodes[0].tickets).toBe(0);
      expect(a.achievements).toContain('episode_0_hard');
    }
    await pages[0].goto('/');
    await expect(
      pages[0].getByRole('heading', { name: '우리는 살아남았다.' }),
    ).toBeVisible();
    await pages[0].screenshot({ path: 'test-results/hard-clear.png' });
    await pages[0].getByRole('button', { name: '로비로 돌아가기' }).click();
    await pages[0].getByRole('button', { name: '프로필 · 티켓' }).click();
    await expect(
      pages[0].getByRole('heading', { name: '생존자 기록' }),
    ).toBeVisible();
    await expect(pages[0].getByText('하드 생존자')).toBeVisible();
    await pages[0].screenshot({ path: 'test-results/profile.png' });
    await pages[0].getByRole('button', { name: '로비로', exact: true }).click();
    await pages[0].getByRole('button', { name: '상점', exact: true }).click();
    await pages[0].locator('[data-buy="explorer"]').click();
    await pages[0].getByRole('button', { name: '구매 확정' }).click();
    await expect(pages[0].locator('[data-buy="explorer"]')).toBeDisabled();
    await expect(pages[0].locator('#toast')).toContainText('완료');
    await pages[0].screenshot({ path: 'test-results/shop.png' });
    await pages[0].getByRole('button', { name: '로비로', exact: true }).click();
    await pages[0].getByRole('button', { name: '스킨 보관함' }).click();
    await pages[0].locator('[data-equip="explorer"]').click();
    await expect(pages[0].locator('[data-equip="explorer"]')).toHaveText(
      '장착 중',
    );
    expect((await api(pages[0], 'account')).body.profile.equipped_skin).toBe(
      'explorer',
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('로그인 보안·실제 모바일 멀티터치·세로 차단·공유 임무·상점 화면', async ({
  browser,
  request,
}) => {
  expect((await request.get('/api/me')).status()).toBe(401);
  expect(
    (
      await request.post('/api/login', {
        headers: { Origin: 'https://invalid.example' },
        data: { username: 'abc', password: 'long-invalid-password' },
      })
    ).status(),
  ).toBe(403);
  const pc = await browser.newContext(),
    mobile = await browser.newContext({
      viewport: { width: 900, height: 440 },
      hasTouch: true,
      isMobile: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36',
    });
  await observe(pc);
  await observe(mobile);
  const a = await pc.newPage(),
    b = await mobile.newPage();
  const errors: string[] = [];
  a.on('pageerror', (e) => errors.push(e.message));
  b.on('pageerror', (e) => errors.push(e.message));
  try {
    const credentials = await register(a, '키보드 대원');
    const duplicate = await api(a, 'register', {
      ...credentials,
      nickname: '중복 검사',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toContain('이미 사용');
    await register(b, '터치 대원');
    await a.getByRole('button', { name: '상점', exact: true }).click();
    await a.getByRole('button', { name: '구매', exact: true }).first().click();
    await a.getByRole('button', { name: '구매 확정' }).click();
    await expect(a.locator('#toast')).toContainText('부족');
    await a.getByRole('button', { name: '취소', exact: true }).click();
    await a.getByRole('button', { name: '로비로', exact: true }).click();
    const id = await create(a, '모바일 조작');
    await b.getByRole('button', { name: '↻ 새로고침' }).click();
    await b.getByRole('button', { name: /모바일 조작/ }).click();
    await b.locator('#job').selectOption('medic');
    await b.getByRole('button', { name: '준비 완료', exact: true }).click();
    await a.getByRole('button', { name: '준비 완료', exact: true }).click();
    await a.getByRole('button', { name: '작전 시작' }).click();
    await expect(a.locator('#game-canvas canvas')).toBeVisible();
    await expect(b.locator('#game-canvas canvas')).toBeVisible();
    await b.screenshot({ path: 'test-results/mobile-cutscene.png' });
    const button = (await b.locator('#scene-next').boundingBox())!;
    expect(button.y + button.height).toBeLessThanOrEqual(440);
    await finishSceneUI(a);
    await expect(a.locator('#scene-next')).toBeDisabled();
    expect((await snap(a)).cutscene).not.toBeNull();
    await finishSceneUI(b);
    await expect.poll(async () => (await snap(a)).cutscene).toBeNull();
    const ax = (await snap(a)).players[0].x;
    await a.keyboard.down('d');
    await a.waitForTimeout(180);
    await a.keyboard.up('d');
    await expect
      .poll(async () => (await snap(b)).players[0].x)
      .toBeGreaterThan(ax);
    const joy = (await b.locator('#joystick').boundingBox())!,
      atk = (await b.locator('#attack').boundingBox())!,
      cx = joy.x + joy.width / 2,
      cy = joy.y + joy.height / 2,
      cdp = await mobile.newCDPSession(b),
      touch = (id: number, x: number, y: number) => ({
        id,
        x,
        y,
        radiusX: 3,
        radiusY: 3,
        force: 1,
      }),
      oldY = (await snap(a)).players[1].y;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        touch(1, cx, cy + 30),
        touch(2, atk.x + atk.width / 2, atk.y + atk.height / 2),
      ],
    });
    await expect
      .poll(async () => {
        const p = (await snap(a)).players[1];
        return p.y > oldY && p.attackUntil > 0;
      })
      .toBe(true);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [touch(2, atk.x + atk.width / 2, atk.y + atk.height / 2)],
    });
    const y = (await snap(a)).players[1].y;
    await expect
      .poll(async () => (await snap(a)).players[1].y)
      .toBeGreaterThan(y);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(async () => (await snap(a)).players[1].input.direction)
      .toBeNull();
    await b.screenshot({ path: 'test-results/mobile-landscape.png' });
    await b.setViewportSize({ width: 440, height: 900 });
    await expect(b.locator('#rotation')).toBeVisible();
    expect(
      await b.locator('#app').evaluate((el) => (el as HTMLElement).inert),
    ).toBe(true);
    await b.setViewportSize({ width: 900, height: 440 });
    await expect(b.locator('#rotation')).toBeHidden();
    await a.locator('#menu').click();
    await a.getByRole('button', { name: '로비로 나가기' }).click();
    await expect.poll(async () => (await snap(b)).players.length).toBe(1);
    await a.getByRole('button', { name: '채널 변경' }).click();
    await a.getByRole('button', { name: '로그아웃' }).click();
    await a.getByLabel('아이디', { exact: true }).fill(credentials.username);
    await a.getByLabel('비밀번호', { exact: true }).fill('wrong-password-123');
    await a.getByRole('button', { name: '봉쇄구역 접속' }).click();
    await expect(a.locator('#form-error')).toContainText('올바르지');
    await a.getByLabel('비밀번호', { exact: true }).fill(credentials.password);
    await a.getByRole('button', { name: '봉쇄구역 접속' }).click();
    await expect(
      a.getByRole('heading', { name: '어디서 합류할까요?' }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await pc.close();
    await mobile.close();
  }
});

async function finishSceneUI(p: Page) {
  const scene = (await snap(p)).cutscene;
  if (!scene) return;
  for (let i = 0; i < STORY[scene.key].lines.length; i++)
    await p.locator('#scene-next').click();
}
async function walk(p: Page, target: { x: number; y: number }, range = 1) {
  const end = Date.now() + 25000;
  while (Date.now() < end) {
    const s = await snap(p),
      me = s.players[0];
    if (distance(me, target) <= range) {
      await p.keyboard.up('j');
      return;
    }
    const next = pathStep(me, target, (x, y) => tileOpen(s, x, y));
    if (!next) throw new Error('이동 경로 없음');
    const key =
      next.x > me.x ? 'd' : next.x < me.x ? 'a' : next.y > me.y ? 's' : 'w';
    await p.keyboard.down('j');
    if (s.players[0].weaponAcquired) await p.keyboard.press('k');
    await p.keyboard.down(key);
    await p.waitForTimeout(155);
    await p.keyboard.up(key);
  }
  throw new Error('목표 도달 시간 초과');
}
test('도트 주연 선택·돌 던지기·무기 획득·구간 컷신·퍼즐·체크포인트', async ({
  browser,
}) => {
  const c = await browser.newContext();
  await observe(c);
  const p = await c.newPage();
  try {
    await register(p, '첫날의 생존자');
    await create(p, '에피소드 0 기원');
    await p.locator('#difficulty').selectOption('easy');
    await p.locator('[data-job-choice="medic"]').click();
    await expect(p.locator('[data-job-choice="medic"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(p.locator('.party-slot canvas')).toHaveAttribute(
      'data-job',
      'medic',
    );
    await p.screenshot({
      path: 'test-results/character-selection.png',
      fullPage: true,
    });
    await p.getByRole('button', { name: '준비 완료', exact: true }).click();
    await p.getByRole('button', { name: '작전 시작' }).click();
    await expect(p.locator('[data-scene="outbreak"]')).toBeVisible();
    const frozen = (await snap(p)).players[0].x;
    await p.keyboard.press('d');
    await p.keyboard.press('Escape');
    expect((await snap(p)).players[0].x).toBe(frozen);
    await expect(p.locator('[data-scene="outbreak"]')).toBeVisible();
    await p.screenshot({ path: 'test-results/outbreak-cutscene.png' });
    await finishSceneUI(p);
    await expect.poll(async () => (await snap(p)).cutscene).toBeNull();
    expect((await snap(p)).players[0].weaponAcquired).toBe(false);
    await expect(p.locator('#skill1')).toBeDisabled();
    await expect(p.locator('#attack')).toContainText('돌 던지기');
    await walk(p, { x: 3, y: 3 });
    await p.keyboard.press('e');
    await p.getByRole('button', { name: '알겠습니다' }).click();
    // 실제 키보드 돌 공격을 적에게 맞혀 훈련 완료.
    const end = Date.now() + 25000;
    while ((await snap(p)).mission === 1 && Date.now() < end) {
      const s = await snap(p),
        me = s.players[0],
        z = s.zombies.find((z) => z.hp > 0)!;
      await walk(p, z);
      const dx = z.x - me.x,
        dy = z.y - me.y,
        key =
          Math.abs(dx) >= Math.abs(dy)
            ? dx >= 0
              ? 'd'
              : 'a'
            : dy >= 0
              ? 's'
              : 'w';
      await p.keyboard.press(key);
      await p.keyboard.down('j');
      await p.waitForTimeout(600);
      await p.keyboard.up('j');
    }
    await expect.poll(async () => (await snap(p)).mission).toBe(2);
    expect((await snap(p)).players[0].rockHits).toBeGreaterThanOrEqual(3);
    await walk(p, { x: 9, y: 3 });
    await p.keyboard.press('e');
    await expect.poll(async () => (await snap(p)).mission).toBe(3);
    await walk(p, { x: 10, y: 6 });
    await p.keyboard.press('e');
    await expect(p.locator('[data-scene="weapons"]')).toBeVisible();
    expect((await snap(p)).players[0].weaponAcquired).toBe(true);
    await p.screenshot({ path: 'test-results/weapon-cutscene.png' });
    await finishSceneUI(p);
    await expect.poll(async () => (await snap(p)).cutscene).toBeNull();
    await expect(p.locator('#skill1')).toBeEnabled();
    await expect(p.locator('#self-hud')).toContainText('구조용 신호총');
    expect((await snap(p)).players[0].job).toBe('medic');
    await p.keyboard.press('u');
    await expect(p.locator('#toast')).toContainText('작업대가 없습니다');
    await expect(
      p.getByRole('heading', { name: '현장 장비 강화' }),
    ).toHaveCount(0);
    await walk(p, { x: 5, y: 2 });
    await p.keyboard.press('e');
    await expect(p.getByRole('dialog')).toContainText('3 · 1 · 4');
    await p.getByRole('button', { name: '기억했습니다' }).click();
    await walk(p, { x: 13, y: 8 }, 0);
    await p.keyboard.down('d');
    await p.waitForTimeout(300);
    await p.keyboard.up('d');
    expect((await snap(p)).players[0].x).toBe(13);
    await p.keyboard.press('e');
    await p.getByLabel('잠금장치 번호').fill('000');
    await p.getByRole('button', { name: '잠금 해제' }).click();
    await expect(p.locator('#toast')).toContainText('번호');
    expect((await snap(p)).mission).toBe(4);
    await p.getByLabel('잠금장치 번호').fill('314');
    await p.getByRole('button', { name: '잠금 해제' }).click();
    await expect(p.locator('#puzzle-form')).toHaveCount(0);
    await p.screenshot({ path: 'test-results/pixel-classroom.png' });
    await walk(p, { x: 16, y: 8 });
    await p.keyboard.press('e');
    await expect(p.locator('[data-scene="hall"]')).toBeVisible();
    await finishSceneUI(p);
    await expect.poll(async () => (await snap(p)).cutscene).toBeNull();
    const checkpoint = (await snap(p)).checkpoint;
    const enemy = (await snap(p)).zombies[0];
    await walk(p, enemy);
    await p.locator('#menu').click();
    await expect(
      p.getByRole('heading', { name: '잠시 숨을 고르세요.' }),
    ).toBeVisible();
    await expect(
      p.getByRole('heading', { name: '아직 끝이 아닙니다.' }),
    ).toBeVisible({ timeout: 90000 });
    await p.getByRole('button', { name: '체크포인트 재도전' }).click();
    await expect(p.locator('[data-scene="hall"]')).toBeVisible();
    const restored = await snap(p);
    expect(restored.stageIndex).toBe(1);
    expect(restored.mission).toBe(0);
    expect(restored.players[0].hp).toBe(
      checkpoint.players[restored.players[0].id].hp,
    );
    expect(restored.players[0].weaponAcquired).toBe(true);
    expect(restored.zombies).toHaveLength(6);
    expect(new Set(restored.zombies.map((z) => z.kind)).size).toBe(3);
    const account = (await api(p, 'account')).body;
    expect(account.profile.xp).toBe(0);
    expect(account.episodes[0].tickets).toBe(0);
  } finally {
    await c.close();
  }
});

test('직업 독점: 4종 카드·동시 선택·연결 종료 예약·퇴장 해제', async ({
  browser,
}) => {
  const contexts: BrowserContext[] = [],
    pages: Page[] = [];
  try {
    for (let i = 0; i < 3; i++) {
      const c = await browser.newContext();
      contexts.push(c);
      await observe(c);
      const p = await c.newPage();
      pages.push(p);
      await register(p, '직업 대원' + i);
      (p as any).uid = (await api(p, 'me')).body.profile.id;
    }
    const [a, b, c] = pages,
      id = await create(a, '직업 독점 검증');
    for (const p of [b, c]) {
      await p.getByRole('button', { name: '↻ 새로고침' }).click();
      await p.getByRole('button', { name: /직업 독점 검증/ }).click();
    }
    await expect.poll(async () => (await snap(a)).players.length).toBe(3);
    expect(new Set((await snap(a)).players.map((p) => p.job)).size).toBe(3);
    await expect(a.locator('[data-job-choice]')).toHaveCount(4);
    await expect(a.locator('[data-job-choice="medic"]')).toBeDisabled();
    await expect(b.locator('[data-job-choice="vanguard"]')).toBeDisabled();
    await send(a, { v: 1, type: 'job', job: 'medic' });
    await expect(a.locator('#toast')).toContainText('이미');
    expect((await snap(a)).players[0].job).toBe('vanguard');
    await ready(a);
    await a.locator('[data-job-choice="engineer"]').click();
    await expect
      .poll(async () => (await snap(a)).players[0].job)
      .toBe('engineer');
    expect((await snap(a)).players[0].ready).toBe(false);
    await Promise.all([
      send(b, { v: 1, type: 'job', job: 'vanguard' }),
      send(c, { v: 1, type: 'job', job: 'vanguard' }),
    ]);
    await expect
      .poll(
        async () =>
          (await snap(a)).players.filter((p) => p.job === 'vanguard').length,
      )
      .toBe(1);
    const party = (await snap(a)).players,
      winner = party.find((p) => p.job === 'vanguard')!,
      winnerPage = pages.find((p) => (p as any).uid === winner.id)!,
      loser = winnerPage === b ? c : b;
    await expect(loser.locator('#toast')).toContainText('이미');
    expect(new Set((await snap(a)).players.map((p) => p.job)).size).toBe(3);
    await winnerPage.evaluate(() => {
      (window as any).__ws.onclose = null;
      (window as any).__ws.close();
    });
    await expect
      .poll(
        async () =>
          (await snap(a)).players.find((p) => p.id === winner.id)?.connected,
      )
      .toBe(false);
    await expect(a.locator('[data-job-choice="vanguard"]')).toBeDisabled();
    await winnerPage.goto('/');
    await expect
      .poll(
        async () =>
          (await snap(winnerPage))?.players.find((p) => p.id === winner.id)
            ?.connected,
      )
      .toBe(true);
    expect(
      (await snap(winnerPage)).players.find((p) => p.id === winner.id)!.job,
    ).toBe('vanguard');
    await winnerPage.getByRole('button', { name: '방 나가기' }).click();
    await expect.poll(async () => (await snap(a)).players.length).toBe(2);
    await expect(a.locator('[data-job-choice="vanguard"]')).toBeEnabled();
    await a.locator('[data-job-choice="vanguard"]').click();
    await expect
      .poll(async () => (await snap(a)).players[0].job)
      .toBe('vanguard');
    await a
      .locator('.hero-grid')
      .screenshot({ path: 'test-results/four-jobs.png' });
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
