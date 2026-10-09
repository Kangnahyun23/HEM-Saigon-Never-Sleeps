import type * as THREE from 'three/webgpu';
import type { Inbox } from '@/systems/inbox';
import { formatVnd, type Wallet } from '@/systems/wallet';
import type { Hud } from '@/ui/hud';
import type { CityLayout } from '@/world/city/layout';
import type { MissionDirector } from './director';
import { MissionMarker } from './marker';
import { buildStory, type Line, type StoryMission, type StoryProgress } from './story';

const START_RADIUS = 4.5;

/**
 * Chạy cốt truyện Hồi 1 trong game: cột sáng TÍM ở điểm hẹn của nhiệm vụ kế tiếp; tới nơi thì phát lời thoại
 * (phụ đề + tin nhắn) và giao nhiệm vụ cho MissionDirector; xong thì lời kết, trả nợ nếu có, mở nhiệm vụ sau.
 */
export class StoryRunner {
  readonly missions: StoryMission[];
  progress: StoryProgress = { next: 0 };
  private readonly marker = new MissionMarker('#c77dff');
  private running = false;
  private cooldown = 0;
  /** Chờ trước khi hiện điểm hẹn kế tiếp (s). */
  private delay = 2;

  constructor(
    scene: THREE.Scene,
    layout: CityLayout,
    private readonly director: MissionDirector,
    private readonly hud: Hud,
    private readonly inbox: Inbox,
    private readonly wallet: Wallet,
    private readonly hour: () => number,
    private readonly schedule: (seconds: number, run: () => void) => void,
  ) {
    this.missions = buildStory(layout);
    scene.add(this.marker.root);
  }

  get current(): StoryMission | null {
    return this.missions[this.progress.next] ?? null;
  }

  /** Phát một loạt lời thoại cách nhau ~2,4 s: phụ đề trên màn hình + lưu vào tin nhắn. */
  private say(lines: readonly Line[]): number {
    lines.forEach(([who, text], i) =>
      this.schedule(i * 2.4, () => {
        this.hud.showSubtitle(who, text);
        const thread = who === 'Tín' ? lines.find(([w]) => w !== 'Tín')?.[0] : who;
        if (who === 'Tín') {
          if (thread && thread !== 'Tín') this.inbox.reply(thread, text, this.hour());
        } else this.inbox.receive(who, text, this.hour());
      }),
    );
    return lines.length * 2.4;
  }

  update(dt: number, x: number, z: number): void {
    this.cooldown -= dt;
    const story = this.current;
    const busy = this.running || this.director.active !== null;
    if (!story || busy) {
      this.marker.hide();
      return;
    }
    if (this.delay > 0) {
      this.delay -= dt;
      this.marker.hide();
      return;
    }
    this.marker.show(story.start.x, story.start.z);
    this.hud.minimap?.setWaypoint({ x: story.start.x, z: story.start.z, label: story.def.title });
    if (Math.hypot(x - story.start.x, z - story.start.z) > START_RADIUS) return;

    if (story.requiresCash && this.wallet.cash < story.requiresCash) {
      if (this.cooldown <= 0) {
        this.cooldown = 6;
        this.hud.showToast(`Cần ${formatVnd(story.requiresCash)} — chạy thêm kèo đã!`, 2.6);
      }
      return;
    }
    this.begin(story);
  }

  private begin(story: StoryMission): void {
    this.running = true;
    this.marker.hide();
    this.hud.minimap?.setWaypoint(null);
    const talk = this.say(story.intro);
    this.hud.showToast(story.def.title, 2.6);
    this.schedule(Math.min(talk, 3), () =>
      this.director.start(story.def, {
        kind: 'story',
        from: story.giver,
        onComplete: () => this.complete(story),
        onFail: () => {
          this.running = false;
          this.delay = 3;
          this.hud.showSubtitle(story.giver, 'Không sao, làm lại nha. Tới điểm hẹn lần nữa.');
        },
      }),
    );
  }

  private complete(story: StoryMission): void {
    if (story.paysDebt) this.wallet.payDebt(story.paysDebt, this.hour());
    const talk = this.say(story.outro);
    this.progress.next++;
    this.schedule(talk, () => {
      this.running = false;
      this.delay = 3;
      if (!this.current) this.hud.showToast('Hết Hồi 1 — Cảm ơn đã chơi!', 4);
    });
  }
}
