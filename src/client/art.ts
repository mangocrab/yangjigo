import { SKINS, type SkinId } from '../shared/rules';
export function drawSkin(ctx: CanvasRenderingContext2D, skin: SkinId) {
  ctx.clearRect(0, 0, 32, 32);
  const fill = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const color = '#' + SKINS[skin].color.toString(16).padStart(6, '0');
  fill('#0c1a22', 5, 28, 23, 3);
  fill('#182c38', 9, 23, 5, 7);
  fill('#182c38', 20, 23, 5, 7);
  fill(color, 7, 13, 20, 12);
  fill(color, 4, 16, 4, 8);
  fill(color, 27, 16, 4, 8);
  fill('#e3bfa1', 10, 3, 15, 12);
  fill('#243448', 9, 1, 17, 5);
  fill('#16282d', 14, 8, 2, 2);
  fill('#16282d', 22, 8, 2, 2);
  fill('#dfe5d7', 16, 15, 3, 7);
  if (skin === 'survivor') {
    fill('#745434', 6, 15, 5, 10);
    fill('#463c32', 7, 22, 20, 3);
  }
  if (skin === 'explorer') {
    fill('#4e6942', 7, 1, 20, 5);
    fill('#263d2e', 9, 5, 19, 2);
    fill('#c5b16d', 12, 19, 5, 4);
  }
  if (skin === 'rescue') {
    fill('#d48074', 9, 0, 17, 5);
    fill('#f0efcf', 17, 0, 3, 6);
    fill('#f0efcf', 12, 2, 13, 2);
    fill('#182d3e', 9, 15, 6, 10);
  }
}
export function skinCanvas(skin: SkinId) {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  drawSkin(c.getContext('2d')!, skin);
  return c;
}
