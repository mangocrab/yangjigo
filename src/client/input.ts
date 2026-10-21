import type { Direction } from '../shared/protocol';
export type Action =
  | 'skill1'
  | 'skill2'
  | 'counter'
  | 'interact'
  | 'menu'
  | 'upgrade';
export function vectorDirection(
  x: number,
  y: number,
  last: Direction | null,
): Direction | null {
  if (Math.hypot(x, y) < 12) return null;
  if (
    last &&
    (last === 'left' || last === 'right') &&
    Math.abs(y) < Math.abs(x) * 1.2
  )
    return x < 0 ? 'left' : 'right';
  if (
    last &&
    (last === 'up' || last === 'down') &&
    Math.abs(x) < Math.abs(y) * 1.2
  )
    return y < 0 ? 'up' : 'down';
  return Math.abs(x) > Math.abs(y)
    ? x < 0
      ? 'left'
      : 'right'
    : y < 0
      ? 'up'
      : 'down';
}
export class Input {
  blocked = true;
  direction: Direction | null = null;
  attack = false;
  keys = new Map<string, Direction>();
  touch: Direction | null = null;
  keyAttack = false;
  touchAttack = false;
  onAction: (a: Action) => void = () => {};
  onReset: () => void = () => {};
  controller: AbortController | null = null;
  constructor() {
    const dirs: Record<string, Direction> = {
        w: 'up',
        arrowup: 'up',
        s: 'down',
        arrowdown: 'down',
        a: 'left',
        arrowleft: 'left',
        d: 'right',
        arrowright: 'right',
      },
      actions: Record<string, Action> = {
        k: 'skill1',
        ' ': 'counter',
        l: 'skill2',
        e: 'interact',
        u: 'upgrade',
      };
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.repeat) {
        this.onAction('menu');
        return;
      }
      if (
        this.blocked ||
        (e.target instanceof HTMLElement &&
          ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName))
      )
        return;
      const k = e.key.toLowerCase();
      if (dirs[k]) {
        e.preventDefault();
        this.keys.delete(k);
        this.keys.set(k, dirs[k]);
      }
      if (k === 'j') {
        e.preventDefault();
        this.keyAttack = true;
      }
      if (actions[k] && !e.repeat) {
        e.preventDefault();
        this.onAction(actions[k]);
      }
      this.refresh();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === 'j') this.keyAttack = false;
      this.refresh();
    });
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
  }
  refresh() {
    this.direction = this.blocked
      ? null
      : (this.touch ?? [...this.keys.values()].at(-1) ?? null);
    this.attack = !this.blocked && (this.keyAttack || this.touchAttack);
  }
  reset() {
    this.keys.clear();
    this.touch = null;
    this.keyAttack = false;
    this.touchAttack = false;
    this.refresh();
    this.onReset();
    window.dispatchEvent(new Event('controlsreset'));
  }
  bind() {
    this.controller?.abort();
    this.controller = new AbortController();
    const signal = this.controller.signal,
      stick = document.querySelector<HTMLElement>('#joystick')!;
    let pointer: number | null = null,
      last: Direction | null = null;
    const move = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect(),
        x = e.clientX - r.left - r.width / 2,
        y = e.clientY - r.top - r.height / 2;
      last = vectorDirection(x, y, last);
      this.touch = last;
      this.refresh();
      const scale = Math.min(1, 32 / Math.max(1, Math.hypot(x, y)));
      stick.style.setProperty('--x', `${x * scale}px`);
      stick.style.setProperty('--y', `${y * scale}px`);
    };
    const reset = () => {
      pointer = null;
      last = null;
      this.touch = null;
      this.refresh();
      stick.style.setProperty('--x', '0px');
      stick.style.setProperty('--y', '0px');
    };
    stick.addEventListener(
      'pointerdown',
      (e) => {
        if (this.blocked || pointer !== null) return;
        pointer = e.pointerId;
        stick.setPointerCapture(pointer);
        move(e);
      },
      { signal },
    );
    stick.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerId === pointer) move(e);
      },
      { signal },
    );
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      stick.addEventListener(
        type,
        (e) => {
          if ((e as PointerEvent).pointerId === pointer) reset();
        },
        { signal },
      );
    window.addEventListener('controlsreset', reset, { signal });
    const attack = document.querySelector<HTMLElement>('#attack')!;
    let ap: number | null = null;
    attack.addEventListener(
      'pointerdown',
      (e) => {
        if (this.blocked || ap !== null) return;
        ap = e.pointerId;
        attack.setPointerCapture(ap);
        this.touchAttack = true;
        this.refresh();
      },
      { signal },
    );
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      attack.addEventListener(
        type,
        (e) => {
          if ((e as PointerEvent).pointerId === ap) {
            ap = null;
            this.touchAttack = false;
            this.refresh();
          }
        },
        { signal },
      );
    window.addEventListener(
      'controlsreset',
      () => {
        ap = null;
      },
      { signal },
    );
    document.querySelectorAll<HTMLElement>('[data-action]').forEach((el) =>
      el.addEventListener(
        'pointerdown',
        (e) => {
          e.preventDefault();
          if (!this.blocked) this.onAction(el.dataset.action as Action);
        },
        { signal },
      ),
    );
  }
}
export const phone = () =>
  /Android|iPhone|iPod/i.test(navigator.userAgent) ||
  (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
