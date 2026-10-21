import { SKINS, type SkinId } from '../shared/rules';
import type { Job, ZombieKind } from '../shared/content';
import type { Direction } from '../shared/protocol';
// 32×32 원본 픽셀. 외부 게임의 스프라이트를 사용하지 않는다.
export function heroCanvas(
  skin: SkinId,
  job: Job = 'vanguard',
  armed = true,
  dir: Direction = 'down',
  frame = 0,
) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const r = (color: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  const coat = '#' + SKINS[skin].color.toString(16).padStart(6, '0'),
    hair = job === 'medic' ? '#503850' : '#263249',
    bob = frame ? 1 : 0,
    back = dir === 'up',
    side = dir === 'left' || dir === 'right';
  if (dir === 'left') {
    g.translate(32, 0);
    g.scale(-1, 1);
  }
  r('#17222c', 8, 29, 17, 2);
  r('#111a2b', 10, 22, 5, 7);
  r('#111a2b', 18, 22, 5, 7);
  r('#42526a', 11, 23, 3, 4 + (frame ? 1 : 0));
  r('#42526a', 19, 23, 3, 5 - (frame ? 1 : 0));
  r('#0e1725', 9, 28 + (frame ? 0 : 1), 7, 2);
  r('#0e1725', 18, 28 + (frame ? 1 : 0), 7, 2);
  r('#151e30', 7, 13 + bob, 19, 11);
  r(coat, 8, 14 + bob, 17, 9);
  r('#d9e2db', 14, 14 + bob, 4, 8);
  r('#263648', 9, 20 + bob, 4, 3);
  r('#263648', 21, 20 + bob, 3, 3);
  r('#172235', 5, 15 + bob, 4, 8);
  r(coat, 6, 15 + bob, 3, 6);
  r('#dba783', 6, 21 + bob, 3, 3);
  r('#172235', 25, 15 + bob, 3, 8);
  r(coat, 25, 15 + bob, 2, 6);
  r('#dba783', 25, 21 + bob, 3, 3);
  r('#131b2a', 9, 3 + bob, 15, 13);
  r('#e7b48d', 10, 6 + bob, 13, 9);
  r('#f7cfaa', 11, 7 + bob, 10, 5);
  r('#c48e76', 11, 13 + bob, 11, 2);
  r(hair, 9, 2 + bob, 15, 6);
  r(hair, 8, 5 + bob, 3, 7);
  r(hair, 22, 4 + bob, 3, 7);
  r(job === 'medic' ? '#796075' : '#435268', 10, 3 + bob, 10, 2);
  if (back) {
    r(hair, 10, 5 + bob, 13, 9);
    r('#627487', 12, 15 + bob, 9, 6);
  } else {
    r('#1a2539', side ? 20 : 13, 10 + bob, 2, 2);
    if (!side) r('#1a2539', 20, 10 + bob, 2, 2);
    r('#f4ded1', side ? 21 : 14, 10 + bob, 1, 1);
    r('#a26365', 17, 14 + bob, 3, 1);
  }
  if (job === 'vanguard') {
    r('#a5494c', 8, 6 + bob, 17, 2);
    r('#e4b570', 9, 6 + bob, 4, 1);
    r('#d7ad74', 19, 15 + bob, 4, 3);
  } else {
    r(hair, 6, 5 + bob, 3, 12);
    r('#e4b9c9', 6, 9 + bob, 3, 2);
    r('#f1e4c7', 8, 18 + bob, 8, 6);
    r('#ba6265', 11, 18 + bob, 2, 6);
    r('#ba6265', 9, 20 + bob, 6, 2);
  }
  if (skin === 'survivor') {
    r('#735141', 9, 16 + bob, 3, 8);
    r('#5d463b', 9, 22 + bob, 15, 2);
  }
  if (skin === 'explorer') {
    r('#425b44', 9, 1 + bob, 15, 3);
    r('#9caf71', 9, 2 + bob, 12, 1);
    r('#2e423a', 7, 4 + bob, 19, 2);
  }
  if (skin === 'rescue') {
    r('#c06f65', 9, 1 + bob, 15, 4);
    r('#f4dfbd', 15, 1 + bob, 3, 5);
    r('#24384e', 18, 16 + bob, 6, 7);
  }
  if (!armed) {
    r('#39414d', 26, 19 + bob, 5, 4);
    r('#a6b1b4', 26, 19 + bob, 4, 2);
    r('#d9dacc', 27, 19 + bob, 2, 1);
  } else if (job === 'vanguard') {
    r('#172235', 28, 6 + bob, 3, 19);
    r('#a4c3cd', 27, 6 + bob, 3, 13);
    r('#e4ecdd', 27, 6 + bob, 1, 11);
    r('#805447', 28, 19 + bob, 2, 6);
  } else {
    r('#162237', 24, 16 + bob, 8, 5);
    r('#d59b57', 25, 16 + bob, 7, 3);
    r('#f6cf8c', 29, 16 + bob, 3, 1);
    r('#68474b', 25, 20 + bob, 3, 3);
  }
  return c;
}
export function drawSkin(ctx: CanvasRenderingContext2D, skin: SkinId) {
  ctx.clearRect(0, 0, 32, 32);
  ctx.drawImage(heroCanvas(skin), 0, 0);
}
export const skinCanvas = (skin: SkinId) => heroCanvas(skin);
export function zombieCanvas(kind: ZombieKind, frame = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const r = (color: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  const heavy = kind === 'caretaker',
    runner = kind === 'runner',
    b = frame ? 1 : 0;
  r('#17222c', 7, 29, 20, 2);
  r('#20273b', 9, 22, 6, 7);
  r('#20273b', 19, 22, 6, 7);
  r('#4d5760', 10, 24, 3, 4 - b);
  r('#4d5760', 20, 24, 3, 3 + b);
  r('#182238', 6, 13 + b, 21, 11);
  r(heavy ? '#9d6743' : runner ? '#685b91' : '#b3b8a0', 7, 14 + b, 19, 9);
  r(heavy ? '#d6aa63' : runner ? '#d7b975' : '#536768', 14, 14 + b, 3, 9);
  r('#24392e', 8, 3 + b, 17, 13);
  r('#92aa79', 9, 5 + b, 15, 9);
  r('#c3c68b', 11, 6 + b, 10, 5);
  r('#4f684f', 20, 9 + b, 4, 6);
  r('#26352e', 8, 2 + b, 17, 5);
  r('#131c2c', 11, 9 + b, 4, 3);
  r('#131c2c', 19, 9 + b, 4, 3);
  r('#e4bd6e', 12, 10 + b, 2, 1);
  r('#e4bd6e', 20, 10 + b, 2, 1);
  r('#694e4b', 13, 14 + b, 8, 2);
  r('#1e2933', 3, 14 + b, 5, 10);
  r('#8da376', 3, 15 + b, 4, 8);
  r('#1e2933', 26, 14 + b, 5, 10);
  r('#8da376', 27, 15 + b, 3, 8);
  if (heavy) {
    r('#3a3535', 6, 2 + b, 21, 5);
    r('#d5a74c', 7, 1 + b, 19, 4);
    r('#ffe3a0', 11, 1 + b, 11, 1);
    r('#545d63', 28, 20 + b, 3, 9);
    r('#a6ada0', 26, 19 + b, 6, 3);
    r('#dbc78d', 8, 19 + b, 6, 2);
  } else if (runner) {
    r('#d9c699', 8, 6 + b, 17, 2);
    r('#e1ce91', 7, 16 + b, 3, 7);
    r('#e1ce91', 22, 16 + b, 3, 7);
  } else {
    r('#6b4e40', 8, 15 + b, 3, 10);
    r('#6b4e40', 9, 21 + b, 8, 4);
    r('#8a9b7a', 10, 21 + b, 5, 2);
  }
  return c;
}
// 컷신 배경도 작은 해상도에 직접 찍은 도트 아트로 그린다.
export function drawStoryBackdrop(
  c: HTMLCanvasElement,
  setting: 'classroom' | 'hall' | 'yard' | 'city',
  armed = true,
) {
  c.width = 320;
  c.height = 112;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const r = (col: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  r('#162239', 0, 0, 320, 112);
  r('#534666', 0, 2, 320, 36);
  r('#c17670', 0, 28, 320, 18);
  r('#e6a672', 0, 40, 320, 8);
  if (setting === 'classroom' || setting === 'hall') {
    r('#344655', 0, 0, 320, 75);
    for (let i = 0; i < 6; i++) {
      r('#182c42', 12 + i * 54, 8, 40, 46);
      r('#b58c8c', 15 + i * 54, 11, 34, 39);
      r('#385568', 31 + i * 54, 11, 2, 39);
      r('#385568', 15 + i * 54, 29, 34, 2);
    }
    r('#60706b', 0, 61, 320, 3);
    r('#263548', 0, 74, 320, 38);
    for (let y = 76; y < 112; y += 9) r('#354656', 0, y, 320, 1);
    if (setting === 'classroom')
      for (let i = 0; i < 5; i++) {
        r('#1b293b', 20 + i * 63, 78, 30, 14);
        r('#b89665', 20 + i * 63, 76, 30, 6);
        r('#d4ba89', 21 + i * 63, 76, 28, 1);
      }
    else {
      r('#253349', 140, 5, 39, 69);
      r('#73998c', 144, 10, 31, 57);
      r('#e9ba7a', 169, 36, 2, 3);
    }
  } else {
    for (let i = 0; i < 17; i++) {
      const h = 16 + ((i * 13) % 27);
      r(i % 2 ? '#25334a' : '#2e3d55', i * 21, 65 - h, 18, h);
      for (let j = 0; j < 3; j++)
        if (i % 3) r('#b49574', i * 21 + 4, 43 + j * 8, 2, 3);
    }
    r('#263c40', 0, 65, 320, 47);
    if (setting === 'yard') {
      r('#748479', 0, 72, 320, 2);
      r('#748479', 4, 55, 2, 30);
      for (let x = 8; x < 320; x += 12) r('#5d7068', x, 64, 1, 20);
      r('#a5ad8e', 10, 96, 300, 1);
      r('#d7bb7d', 265, 68, 40, 20);
      r('#25374a', 268, 70, 17, 10);
      r('#13243a', 270, 86, 7, 5);
      r('#13243a', 294, 86, 7, 5);
    } else {
      r('#162536', 0, 87, 320, 25);
      r('#d2b88b', 16, 97, 24, 2);
      r('#d2b88b', 80, 97, 24, 2);
      r('#d2b88b', 144, 97, 24, 2);
      r('#a55052', 246, 60, 4, 27);
    }
  }
  g.drawImage(heroCanvas('uniform', 'vanguard', armed), 96, 76);
  g.drawImage(heroCanvas('uniform', 'medic', armed), 141, 76);
  if (setting === 'hall') g.drawImage(zombieCanvas('caretaker'), 242, 72);
}
