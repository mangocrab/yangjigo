import Phaser from 'phaser';
import { JOBS, TILE, stageFor, objectiveFor } from '../shared/content';
import { SKINS } from '../shared/rules';
import type { GameState } from '../shared/protocol';
import { skinCanvas } from './art';
export class SchoolScene extends Phaser.Scene {
  state: GameState | null = null;
  localId = '';
  world!: Phaser.GameObjects.Container;
  marks!: Phaser.GameObjects.Graphics;
  epoch = -1;
  units = new Map<string, Phaser.GameObjects.Sprite>();
  labels = new Map<string, Phaser.GameObjects.Text>();
  props = new Map<string, Phaser.GameObjects.Container>();
  constructor() {
    super('school');
  }
  create() {
    for (const key of Object.keys(SKINS) as (keyof typeof SKINS)[])
      this.textures.addCanvas(`skin-${key}`, skinCanvas(key));
    const zombie = skinCanvas('explorer'),
      c = zombie.getContext('2d')!;
    c.fillStyle = '#9ab57f';
    c.fillRect(10, 3, 15, 12);
    c.fillStyle = '#d2715c';
    c.fillRect(14, 8, 2, 2);
    c.fillRect(22, 8, 2, 2);
    this.textures.addCanvas('zombie', zombie);
    this.world = this.add.container(0, 0);
    this.marks = this.add.graphics().setDepth(1);
    this.scale.on('resize', () => this.fit());
  }
  fit() {
    if (!this.state) return;
    const a = stageFor(this.state),
      w = a.map[0].length * TILE,
      h = a.map.length * TILE;
    this.cameras.main.setZoom(
      Math.min(this.scale.width / w, this.scale.height / h),
    );
    this.cameras.main.centerOn(w / 2, h / 2);
  }
  draw() {
    const s = this.state!,
      stage = stageFor(s);
    this.epoch = s.stageEpoch;
    this.world.removeAll(true);
    this.props.clear();
    for (const a of this.units.values()) a.destroy();
    this.units.clear();
    for (const a of this.labels.values()) a.destroy();
    this.labels.clear();
    const g = this.add.graphics();
    this.world.add(g);
    for (let y = 0; y < stage.map.length; y++)
      for (let x = 0; x < stage.map[y].length; x++) {
        const px = x * TILE,
          py = y * TILE,
          t = stage.map[y][x];
        g.fillStyle(
          stage.outdoor
            ? (x + y) % 2
              ? 0x34483d
              : 0x394c40
            : (x + y) % 2
              ? 0x30434a
              : 0x33474f,
        );
        g.fillRect(px, py, 32, 32);
        g.lineStyle(1, 0x21383d, 0.5);
        g.strokeRect(px, py, 32, 32);
        if (t === '#') {
          g.fillStyle(stage.outdoor ? 0x5d7266 : 0x18313a);
          g.fillRect(px, py, 32, 32);
          g.fillStyle(0x54716f);
          g.fillRect(px, py, 32, 5);
        }
        if (t === 'T') {
          g.fillStyle(stage.outdoor ? 0x74888a : 0xb78e5b);
          g.fillRect(px + 3, py + 4, 26, 23);
          g.fillStyle(0xd8c49d);
          g.fillRect(px + 3, py + 4, 26, 5);
        }
      }
    if (stage.outdoor) {
      g.lineStyle(2, 0xbfc3a4, 0.4);
      g.strokeRect(64, 64, 17 * 32, 8 * 32);
      g.strokeCircle(11 * 32, 6 * 32, 64);
    }
    for (const o of stage.objects) {
      const p = this.add.container(o.x * 32, o.y * 32),
        art = this.add.graphics();
      this.props.set(o.id, p);
      this.world.add(p);
      p.add(art);
      if (o.kind === 'npc') p.add(this.add.sprite(16, 16, 'skin-uniform'));
      else {
        art.fillStyle(
          o.kind === 'bench'
            ? 0xbd9760
            : o.kind === 'item'
              ? 0xe5c981
              : o.kind === 'hint'
                ? 0x466e57
                : 0x789b8a,
        );
        art.fillRect(3, 4, 26, 24);
        art.fillStyle(0x19353a);
        art.fillRect(8, 9, 16, 12);
      }
      p.add(
        this.add
          .text(16, -8, `${o.name} · E`, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#dde4ca',
            backgroundColor: '#10242a',
            padding: { x: 3, y: 2 },
          })
          .setOrigin(0.5, 1),
      );
    }
    this.fit();
  }
  update(time: number, delta: number) {
    const s = this.state;
    if (!s || !this.marks) return;
    if (this.epoch !== s.stageEpoch) this.draw();
    const stage = stageFor(s),
      objective = objectiveFor(s);
    this.marks.clear();
    for (const o of stage.objects) {
      const i = stage.objectives.findIndex(
        (q) => q.kind === 'collect' && q.target === o.id,
      );
      this.props.get(o.id)?.setVisible(!(o.kind === 'item' && i < s.mission));
      if (o.id === objective?.target) {
        this.marks.lineStyle(2, 0xe5c584, 0.65 + Math.sin(time / 300) * 0.15);
        this.marks.strokeRect(o.x * 32 - 2, o.y * 32 - 2, 36, 36);
      }
    }
    for (const d of stage.doors) {
      this.marks.fillStyle(
        s.mission < d.opensAtMission ? 0xc0886d : 0x80c6aa,
        0.7,
      );
      this.marks.fillRect(d.x * 32, d.y * 32, 32, 32);
    }
    const values = [
        ...s.players.map((p) => ({
          ...p,
          max: JOBS[p.job].hp,
          texture: `skin-${p.skin ?? 'uniform'}`,
        })),
        ...s.zombies
          .filter((z) => z.hp > 0)
          .map((z) => ({
            ...z,
            max: z.maxHp,
            texture: 'zombie',
            name: '',
            dir: 'down',
            connected: true,
            attackUntil: 0,
          })),
      ],
      wanted = new Set<string>();
    for (const p of values) {
      wanted.add(p.id);
      let sprite = this.units.get(p.id);
      if (!sprite) {
        sprite = this.add
          .sprite(p.x * 32 + 16, p.y * 32 + 16, p.texture)
          .setDepth(3);
        this.units.set(p.id, sprite);
      }
      const a = Math.min(1, delta / 65);
      sprite.x += (p.x * 32 + 16 - sprite.x) * a;
      sprite.y += (p.y * 32 + 16 - sprite.y) * a;
      sprite
        .setTexture(p.texture)
        .setFlipX(p.dir === 'left')
        .setAlpha(!p.hp ? 0.35 : p.connected ? 1 : 0.5);
      this.marks.fillStyle(0x152830);
      this.marks.fillRect(sprite.x - 12, sprite.y - 22, 24, 3);
      this.marks.fillStyle(p.texture === 'zombie' ? 0xcf8069 : 0x8bd1ab);
      this.marks.fillRect(sprite.x - 12, sprite.y - 22, (24 * p.hp) / p.max, 3);
      if (p.id === this.localId) {
        this.marks.lineStyle(2, 0x9adbc6);
        this.marks.strokeEllipse(sprite.x, sprite.y + 13, 30, 9);
      }
      if (p.attackUntil > s.now) {
        const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[
          p.dir
        ]!;
        this.marks.fillStyle(0xe7cf8d, 0.5);
        this.marks.fillRect(
          sprite.x + d[0] * 32 - 12,
          sprite.y + d[1] * 32 - 12,
          24,
          24,
        );
      }
      if (p.name) {
        let label = this.labels.get(p.id);
        if (!label) {
          label = this.add
            .text(0, 0, p.name, {
              fontSize: '10px',
              color: '#e1e6d8',
              backgroundColor: '#14282d',
            })
            .setOrigin(0.5, 1)
            .setDepth(5);
          this.labels.set(p.id, label);
        }
        label.setPosition(sprite.x, sprite.y - 25);
      }
    }
    for (const [id, sprite] of this.units)
      if (!wanted.has(id)) {
        sprite.destroy();
        this.units.delete(id);
        this.labels.get(id)?.destroy();
        this.labels.delete(id);
      }
  }
}
export function createGame(el: HTMLElement) {
  const scene = new SchoolScene(),
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      backgroundColor: '#101c22',
      pixelArt: true,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: el.clientWidth,
        height: el.clientHeight,
      },
      scene: [scene],
      audio: { noAudio: true },
      fps: { target: 60 },
    });
  return { scene, game };
}
