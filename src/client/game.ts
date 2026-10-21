import Phaser from 'phaser';
import {
  JOBS,
  ZOMBIE_TYPES,
  TILE,
  stageFor,
  objectiveFor,
  type Job,
  type ZombieKind,
} from '../shared/content';
import { SKINS } from '../shared/rules';
import type { GameState, Direction } from '../shared/protocol';
import { heroCanvas, zombieCanvas } from './art';
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
    for (const skin of Object.keys(SKINS) as (keyof typeof SKINS)[])
      for (const job of Object.keys(JOBS) as Job[])
        for (const armed of [false, true])
          for (const dir of ['up', 'down', 'left', 'right'] as Direction[])
            for (const frame of [0, 1])
              this.textures.addCanvas(
                `hero-${skin}-${job}-${armed}-${dir}-${frame}`,
                heroCanvas(skin, job, armed, dir, frame),
              );
    for (const kind of Object.keys(ZOMBIE_TYPES) as ZombieKind[])
      for (const frame of [0, 1])
        this.textures.addCanvas(
          `zombie-${kind}-${frame}`,
          zombieCanvas(kind, frame),
        );
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
        g.fillStyle(stage.outdoor ? 0x53684e : 0x40515b, 0.7);
        g.fillRect(
          px + ((x * 7 + y * 3) % 25) + 2,
          py + ((x * 3 + y * 7) % 24) + 3,
          2,
          1,
        );
        g.fillRect(
          px + ((x * 11 + y) % 24) + 2,
          py + ((x + y * 13) % 26) + 2,
          1,
          2,
        );
        if (t === '#') {
          g.fillStyle(stage.outdoor ? 0x5d7266 : 0x18313a);
          g.fillRect(px, py, 32, 32);
          g.fillStyle(0x54716f);
          g.fillRect(px, py, 32, 5);
          g.fillStyle(0x0e2333);
          g.fillRect(px, py + 25, 32, 7);
          g.fillStyle(0x425964);
          g.fillRect(px + 2, py + 7, 28, 1);
          g.fillRect(px + 16, py + 8, 1, 13);
          if (!stage.outdoor && y === 0 && x > 1 && x % 3 === 0) {
            g.fillStyle(0x182c43);
            g.fillRect(px + 3, py + 7, 26, 18);
            g.fillStyle(0x99afac);
            g.fillRect(px + 5, py + 9, 22, 12);
            g.fillStyle(0x3d6170);
            g.fillRect(px + 15, py + 9, 2, 12);
            g.fillRect(px + 5, py + 20, 22, 2);
          }
        }
        if (t === 'T') {
          g.fillStyle(stage.outdoor ? 0x74888a : 0xb78e5b);
          g.fillRect(px + 3, py + 4, 26, 23);
          g.fillStyle(0xd8c49d);
          g.fillRect(px + 3, py + 4, 26, 5);
          if (!stage.outdoor) {
            g.fillStyle(0x172638);
            g.fillRect(px + 5, py + 24, 3, 6);
            g.fillRect(px + 24, py + 24, 3, 6);
            g.fillStyle(0xe8d8a8);
            g.fillRect(px + 8, py + 9, 10, 8);
            g.fillStyle(0x57758a);
            g.fillRect(px + 9, py + 10, 8, 1);
            g.fillRect(px + 9, py + 13, 6, 1);
            g.fillStyle(0x714c43);
            g.fillRect(px + 2, py + 28, 27, 3);
          } else {
            g.fillStyle(0x193247);
            g.fillRect(px + 6, py + 10, 20, 9);
            g.fillStyle(0xa6c0b8);
            g.fillRect(px + 7, py + 11, 17, 2);
            g.fillStyle(0x17222d);
            g.fillRect(px, py + 8, 3, 9);
            g.fillRect(px + 29, py + 8, 3, 9);
            g.fillStyle(0xe8c885);
            g.fillRect(px + 3, py + 23, 4, 3);
            g.fillRect(px + 25, py + 23, 4, 3);
          }
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
      if (o.kind === 'npc')
        p.add(this.add.sprite(16, 16, 'hero-uniform-medic-false-down-0'));
      else {
        art.fillStyle(0x102332);
        art.fillRect(2, 3, 28, 27);
        if (o.kind === 'gear') {
          art.fillStyle(0x8f534f);
          art.fillRect(3, 3, 26, 25);
          art.fillStyle(0xd0a16d);
          art.fillRect(4, 4, 24, 3);
          art.fillStyle(0xe3cfac);
          art.fillRect(6, 9, 8, 12);
          art.fillStyle(0x426978);
          art.fillRect(17, 9, 8, 12);
          art.fillStyle(0xffdf92);
          art.fillRect(14, 14, 2, 3);
        } else if (o.id === 'rubble') {
          art.clear();
          art.fillStyle(0x172738);
          art.fillRect(4, 24, 25, 3);
          art.fillStyle(0x758d92);
          art.fillRect(4, 19, 7, 5);
          art.fillRect(12, 16, 8, 8);
          art.fillRect(22, 20, 6, 4);
          art.fillStyle(0xc9d4c8);
          art.fillRect(5, 19, 4, 2);
          art.fillRect(13, 16, 5, 2);
          art.fillStyle(0x80afa9);
          art.fillRect(7, 12, 2, 3);
          art.fillRect(24, 14, 3, 2);
        } else if (o.kind === 'hint') {
          art.fillStyle(0x967857);
          art.fillRect(1, 3, 30, 24);
          art.fillStyle(0x315b51);
          art.fillRect(3, 5, 26, 19);
          art.fillStyle(0xd9dfbf);
          art.fillRect(7, 9, 17, 1);
          art.fillRect(7, 12, 10, 1);
          art.fillRect(8, 16, 3, 3);
          art.fillRect(15, 16, 2, 3);
          art.fillRect(21, 16, 3, 3);
        } else if (o.kind === 'item') {
          art.fillStyle(0xccaa64);
          art.fillRect(9, 9, 15, 15);
          art.fillStyle(0xeee0ad);
          art.fillRect(11, 7, 10, 3);
          art.fillStyle(0x517979);
          art.fillRect(13, 12, 7, 7);
          art.fillStyle(0xffe4aa);
          art.fillRect(15, 13, 2, 4);
        } else if (o.kind === 'exit') {
          art.fillStyle(0x506c6c);
          art.fillRect(3, 3, 26, 27);
          art.fillStyle(0x163141);
          art.fillRect(6, 6, 20, 24);
          art.fillStyle(0x94bc96);
          art.fillRect(9, 7, 15, 5);
          art.fillStyle(0xe9d299);
          art.fillRect(22, 20, 2, 3);
        } else {
          art.fillStyle(0x6b8480);
          art.fillRect(4, 4, 24, 24);
          art.fillStyle(0x203545);
          art.fillRect(7, 7, 18, 12);
          art.fillStyle(0xbbcb8b);
          art.fillRect(9, 9, 13, 2);
          art.fillStyle(0xe6b16e);
          art.fillRect(9, 22, 3, 3);
          art.fillStyle(0xa65c54);
          art.fillRect(19, 22, 3, 3);
        }
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
          texture: `hero-${p.skin}-${p.job}-${p.weaponAcquired}-${p.dir}-${p.input.direction ? Math.floor(time / 140) % 2 : 0}`,
        })),
        ...s.zombies
          .filter((z) => z.hp > 0)
          .map((z) => ({
            ...z,
            max: z.maxHp,
            texture: `zombie-${z.kind}-${z.state === 'chase' ? Math.floor(time / 180) % 2 : 0}`,
            name: ZOMBIE_TYPES[z.kind].name,
            weaponAcquired: true,
            job: 'vanguard' as Job,
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
        .setFlipX(false)
        .setAlpha(!p.hp ? 0.35 : p.connected ? 1 : 0.5);
      this.marks.fillStyle(0x152830);
      this.marks.fillRect(sprite.x - 12, sprite.y - 22, 24, 3);
      this.marks.fillStyle(
        p.texture.startsWith('zombie') ? 0xcf8069 : 0x8bd1ab,
      );
      this.marks.fillRect(sprite.x - 12, sprite.y - 22, (24 * p.hp) / p.max, 3);
      if (p.id === this.localId) {
        this.marks.lineStyle(2, 0x9adbc6);
        this.marks.strokeEllipse(sprite.x, sprite.y + 13, 30, 9);
      }
      if (p.attackUntil > s.now) {
        const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[
          p.dir
        ]!;
        if (!p.weaponAcquired) {
          const t = Math.max(0, Math.min(1, 1 - (p.attackUntil - s.now) / 180)),
            dist = 12 + t * 84;
          this.marks.fillStyle(0x14202d, 0.6);
          this.marks.fillRect(
            sprite.x + d[0] * dist - 3,
            sprite.y + d[1] * dist + 4,
            6,
            2,
          );
          this.marks.fillStyle(0xc8d0ca);
          this.marks.fillRect(
            sprite.x + d[0] * dist - 2,
            sprite.y + d[1] * dist - Math.sin(t * Math.PI) * 12 - 2,
            5,
            4,
          );
        } else if (p.job === 'medic') {
          this.marks.lineStyle(2, 0xf0b56c, 0.8);
          this.marks.lineBetween(
            sprite.x + d[0] * 15,
            sprite.y + d[1] * 15,
            sprite.x + d[0] * 60,
            sprite.y + d[1] * 60,
          );
          this.marks.fillStyle(0xffe6a0);
          this.marks.fillRect(
            sprite.x + d[0] * 60 - 3,
            sprite.y + d[1] * 60 - 3,
            6,
            6,
          );
        } else {
          this.marks.lineStyle(3, 0xd6e9dd, 0.85);
          this.marks.lineBetween(
            sprite.x + d[0] * 22 - d[1] * 13,
            sprite.y + d[1] * 22 - d[0] * 13,
            sprite.x + d[0] * 27 + d[1] * 13,
            sprite.y + d[1] * 27 + d[0] * 13,
          );
        }
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
