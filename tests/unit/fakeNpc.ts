import * as THREE from 'three/webgpu';
import type { CharacterId } from '@/assets/manifest';
import { NPC_ACTION, NPC_CLIPS, NPC_ONCE, type NpcBody, type NpcSource } from '@/ai/npcBody';

/** Hông của hình giả: 1 m trên gốc ở tư thế gốc; khi ngồi xe cao 0,6 và lùi 0,3 (trên 1 đơn vị co giãn) như mẫu thật. */
export const DRIVE_HIP = 0.6;
export const DRIVE_BACK = -0.3;

/** Hình NPC giả (không cần tải mẫu người): nhóm có xương hông + đủ action, clip "drive" hạ hông xuống. */
export function fakeBody(id: CharacterId): NpcBody {
  const body = new THREE.Group();
  const pelvis = new THREE.Object3D();
  pelvis.name = 'pelvis';
  pelvis.position.y = 1;
  body.add(pelvis);
  const mixer = new THREE.AnimationMixer(body);
  const actions = NPC_CLIPS.map((n) => {
    // Rãnh tĩnh một khoá (như clip đã nén): bộ trộn trả đúng cùng giá trị mỗi khung.
    const tracks = n === 'drive' ? [new THREE.VectorKeyframeTrack('pelvis.position', [0], [0, DRIVE_HIP, DRIVE_BACK])] : [];
    return mixer.clipAction(new THREE.AnimationClip(n, 1, tracks));
  });
  // Như buildNpc: động tác một lần (trúng đòn, ngã, gục…) giữ tư thế cuối.
  for (const name of NPC_ONCE) {
    const action = actions[NPC_ACTION[name]]!;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  }
  for (const a of actions) a.setEffectiveWeight(0).play();
  const helmet = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardNodeMaterial());
  helmet.visible = false;
  body.add(helmet);
  return {
    id,
    body,
    perMeter: 1,
    mixer,
    actions,
    weights: actions.map(() => 0),
    timeScales: actions.map((a) => a.timeScale),
    pelvis,
    handset: new THREE.Object3D(),
    baton: new THREE.Object3D(),
    helmet,
    arms: null,
  };
}

/** Kho giả: đếm số lần lấy / trả, hình trả lại được dùng lại; `last` = hình vừa lấy ra. */
export class FakePool implements NpcSource {
  readonly free: NpcBody[] = [];
  taken = 0;
  given = 0;
  last: NpcBody | null = null;
  take(id: CharacterId): NpcBody | null {
    this.taken++;
    const i = this.free.findIndex((b) => b.id === id);
    const npc = i >= 0 ? this.free.splice(i, 1)[0]! : fakeBody(id);
    npc.body.visible = true;
    this.last = npc;
    return npc;
  }
  give(npc: NpcBody): void {
    this.given++;
    npc.body.visible = false;
    npc.helmet.visible = false;
    this.free.push(npc);
  }
}
