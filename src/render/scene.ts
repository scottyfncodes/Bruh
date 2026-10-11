import * as THREE from 'three';
import type { Hold, LimbId, Pose, Route, Vec2 } from '../game/types';
import { WALL, DECOR } from '../content/wall';
import { GRADE_COLOR, GYM } from './palette';
import { contactRadius } from '../game/holds';
import { HOLD_Z } from './depths';
import { holdGeometry } from './holdGeometry';
import { Climber, type Mood } from './climber';
import { WallWarp, placeOn, surfaceStrip } from './fold';
import { type WallProfile, FLAT } from '../game/profile';
import { PANEL, PANEL_HALF_WIDTH } from '../game/tread';
import { CAVE_LOOK, SIDE_LOOK, SLAT_LOOK, TOWER_LOOK, type WallLook, contactShadowTexture, wallTexture } from './wallTexture';

/**
 * The gym, rendered.
 *
 * Readability is the whole brief, and the art direction serves it: the
 * climbing wall is warm, used plywood with its T-nut grid showing — the
 * brightest surface in the room — set into darker painted walls either side,
 * so the eye goes to the part you can climb. The holds are the stars: taped
 * colours, a little gloss, a soft contact shadow under each so you can see
 * how far they stand out. Off-route holds are there but quiet. Bernie is the
 * only other saturated thing on screen. Nothing here is trying to look like a
 * photograph; it is trying to look like a gym you want to climb in.
 *
 * The tread wall is its own machine: a narrow leaning frame with a belt of
 * slats that rolls down, a hood over the top roller and a skirt at the
 * bottom one, standing in the same room.
 */

export type CameraState = {
  /** Height the camera is looking at, metres. */
  focusY: number;
  /**
   * Distance along the wall the camera is looking at, metres. Zero is the
   * middle; routes that wander across the wall pull it sideways after them.
   */
  focusX: number;
  /** Vertical extent of wall visible, metres. Smaller is more zoomed in. */
  frame: number;
  /** Orbit around the wall's vertical axis, radians. Clamped small. */
  orbit: number;
};

export const DEFAULT_CAMERA: CameraState = { focusY: 1.9, focusX: 0, frame: 3.9, orbit: 0 };
export const FRAME_MIN = 2.3;
/** Widest the camera goes: wide enough to show the whole of a long limb's reach on a phone. */
export const FRAME_MAX = 7.5;
export const ORBIT_LIMIT = 0.5;

const FOV = 42;
/** How far under a leaning wall the camera drops, as a share of the lean. */
const CAMERA_UNDER = 0.45;

export class WallScene {
  readonly scene = new THREE.Scene();
  /**
   * Everything that belongs to the wall — panels, holds and the climber — is
   * placed through the warp, which rolls the sim's flat wall coordinates up
   * into the wall's real shape: leaning, bending into a roof, coming back
   * out over a lip. The sim stays flat; only the view knows the wall bends.
   */
  private plane = new THREE.Group();
  private warp = new WallWarp(FLAT);
  private route: Route | null = null;
  /** The panels, seams and dressing: rebuilt whenever the wall changes shape. */
  private wallGroup = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private climber = new Climber();
  private holdGroup = new THREE.Group();
  private holdMeshes = new Map<number, THREE.Mesh>();
  /** Where each streamed (tread) hold is up the belt, for clipping to it. */
  private holdY = new Map<number, number>();
  private canvas: HTMLCanvasElement;
  private cam: CameraState = { ...DEFAULT_CAMERA };
  private disposed = false;
  private key: THREE.DirectionalLight | null = null;
  /** The tread wall's belt: how far the wall has rolled down, metres. */
  private scroll = 0;
  /** Highball pads, rebuilt when the landing changes. */
  private padGroup = new THREE.Group();
  /** True for the tread wall: a belt in a frame instead of the cave. */
  private tread = false;
  /** True on the highball tower: its own paint. */
  private tower = false;
  /** The treadwall's frame: it does not move with the belt. */
  private treadFrame = new THREE.Group();
  /** Contact shadows under holds: one shared material and quad. */
  private blobMat: THREE.MeshBasicMaterial | null = null;
  private blobGeo = new THREE.PlaneGeometry(1, 1);
  /** The canvas's CSS size as of the last resize, for projecting without a layout read. */
  private size = { w: 1, h: 1 };
  private scratch = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(GYM.back);
    // A neutral tone map keeps the taped hold colours true while letting the
    // lit wall roll off gently instead of clipping flat.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap is deprecated in r185 (it falls back to PCF with a
    // console warning); PCF with a radius gives the same soft edge.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
    const r0 = canvas.getBoundingClientRect();
    this.size = { w: r0.width || 1, h: r0.height || 1 };
    this.plane.add(this.wallGroup, this.holdGroup, this.climber.group);
    this.scene.add(this.plane, this.treadFrame);
    const blob = contactShadowTexture();
    if (blob) this.blobMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, toneMapped: false });
    this.buildEnvironment();
    this.buildWall();
    this.applyCamera();
  }

  // --- environment -------------------------------------------------------

  private buildEnvironment(): void {
    const w = (WALL.maxX - WALL.minX) * 4;
    const cx = (WALL.minX + WALL.maxX) / 2;
    // The room falls away into the dark at the far sides of a wide screen.
    this.scene.fog = new THREE.Fog(GYM.back, 12, 26);

    const mat = new THREE.Mesh(
      new THREE.BoxGeometry(w + 2, 0.34, 2.6),
      new THREE.MeshStandardMaterial({ color: GYM.mat, roughness: 0.92 }),
    );
    mat.position.set(cx, -0.17, 1.2);
    mat.receiveShadow = true;
    this.scene.add(mat);
    // The mat's front edge, a band of the darker vinyl, so it reads as a pad and not a floor.
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(w + 2, 0.06, 0.08),
      new THREE.MeshStandardMaterial({ color: GYM.matEdge, roughness: 0.9 }),
    );
    lip.position.set(cx, 0.0, 2.48);
    this.scene.add(lip);

    this.scene.add(new THREE.HemisphereLight('#f6efe2', '#2c3246', 1.35));
    const key = new THREE.DirectionalLight('#fff3df', 2.3);
    key.position.set(2.6, 5.2, 4.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 3;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 16;
    // Tall enough for the long routes up the cave.
    const s = Math.max(4.2, WALL.maxY / 2 + 1.5);
    key.shadow.camera.left = -s;
    key.shadow.camera.right = s;
    key.shadow.camera.top = s;
    key.shadow.camera.bottom = -s;
    key.shadow.bias = -0.0012;
    this.scene.add(key, key.target);
    key.target.position.set(0, 2, 0);
    this.key = key;
    this.scene.add(this.padGroup);

    // A cool rim from the other side: edges on the holds and on Bernie.
    const fill = new THREE.DirectionalLight('#c9dcff', 0.65);
    fill.position.set(-3.4, 1.4, 3);
    this.scene.add(fill);

    // From the mat, up: a roof faces the floor, and without this its holds
    // are shapes in the dark. Gyms light their caves too.
    const under = new THREE.DirectionalLight('#f4ead8', 0.75);
    under.position.set(0.8, -3, 4);
    this.scene.add(under);
  }

  /**
   * The wall itself, the shape the route says. Generously oversized: at a wide
   * desktop aspect the camera sees far more wall than the climbable area, and
   * running out of gym looks like a bug.
   */
  private buildWall(): void {
    for (const g of [this.wallGroup, this.treadFrame]) {
      for (const o of [...g.children]) {
        g.remove(o);
        o.traverse((m) => {
          if (m instanceof THREE.Mesh) {
            if (m.geometry !== this.blobGeo && !m.userData.sharedGeometry) m.geometry.dispose();
            if (m.material !== this.blobMat) (m.material as THREE.Material).dispose();
          }
        });
      }
    }
    if (this.tread) this.buildTread();
    else this.buildCave();
  }

  /** A strip of wall in a look. */
  private panel(look: WallLook, x0: number, x1: number, y0: number, y1: number, z = 0, roughness = 0.95): THREE.Mesh {
    const map = wallTexture(look);
    const m = new THREE.Mesh(
      surfaceStrip(this.warp, x0, x1, y0, y1, z),
      new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : look.base, map, roughness, metalness: 0, side: THREE.DoubleSide }),
    );
    m.receiveShadow = true;
    return m;
  }

  /**
   * The cave, the shape the route says. Generously oversized: at a wide
   * desktop aspect the camera sees far more wall than the climbable area, and
   * running out of gym looks like a bug — so past the climbing wall there is
   * more gym, painted dark and set with other people's problems, quiet.
   */
  private buildCave(): void {
    const warp = this.warp;
    const w = (WALL.maxX - WALL.minX) * 4;
    const h = WALL.maxY * 2.6;
    const cx = (WALL.minX + WALL.maxX) / 2;
    const y0 = -0.6;
    const y1 = h - 0.6;
    const edge = 0.08;
    const left = WALL.minX - edge;
    const right = WALL.maxX + edge;

    this.wallGroup.add(this.panel(this.tower ? TOWER_LOOK : CAVE_LOOK, left, right, y0, y1));
    this.wallGroup.add(this.panel(SIDE_LOOK, cx - w / 2, left, y0, y1, -0.002));
    this.wallGroup.add(this.panel(SIDE_LOOK, right, cx + w / 2, y0, y1, -0.002));

    // The climbing wall's edges: a raised trim, so it reads as a built
    // feature with an arête on each side rather than paint on a flat board.
    const trimMat = new THREE.MeshStandardMaterial({ color: GYM.trim, roughness: 0.6, metalness: 0.15 });
    for (const x of [left, right]) {
      for (let y = y0; y < y1; y += 0.5) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.52, 0.05), trimMat);
        placeOn(warp, seg, x, y + 0.25, 0.022);
        seg.castShadow = true;
        this.wallGroup.add(seg);
      }
    }

    // Off-route holds: dressing, and the reason reading a line is a skill.
    // Quiet: lighter and greyer than any route colour, so the line pops.
    const decorMat = new THREE.MeshStandardMaterial({ color: GYM.decor, roughness: 0.95, metalness: 0 });
    for (const d of DECOR) {
      const m = new THREE.Mesh(holdGeometry(d.type), decorMat);
      m.userData.sharedGeometry = true;
      placeOn(warp, m, d.x, d.y, HOLD_Z, d.roll);
      m.scale.setScalar(contactRadius(d.size, d.type));
      m.castShadow = true;
      this.wallGroup.add(m);
    }
    // The neighbouring walls' problems, in their own colours but sunk into
    // the dark paint: the gym is busy, it is just not your route.
    let seed = 0x2545f491;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const types: Hold['type'][] = ['jug', 'crimp', 'sloper', 'pinch', 'pocket', 'foothold', 'volume'];
    const tones = ['#5b6b5e', '#5d5a72', '#6e5a4f', '#4f6273', '#6b6450'];
    const sideMats = tones.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
    for (let i = 0; i < 70; i++) {
      const sgn = rnd() < 0.5 ? -1 : 1;
      const x = sgn * (WALL.maxX + 0.45 + rnd() * 4.5);
      const y = 0.3 + rnd() * (WALL.maxY + 2);
      const type = types[Math.floor(rnd() * types.length)];
      const m = new THREE.Mesh(holdGeometry(type), sideMats[Math.floor(rnd() * sideMats.length)]);
      m.userData.sharedGeometry = true;
      placeOn(warp, m, x, y, HOLD_Z, rnd() * Math.PI * 2);
      m.scale.setScalar(contactRadius(type === 'volume' ? 0.12 : 0.06 + rnd() * 0.05, type));
      this.wallGroup.add(m);
    }
  }

  /**
   * The treadwall. In the sim the belt is the holds staying put while the
   * floor rises; here it is what it looks like: slats rolling down through a
   * frame, under a hood at the top and into a skirt at the bottom. The belt
   * (in wallGroup) scrolls; the frame (treadFrame) stays where it is. Both
   * are drawn to PANEL and PANEL_HALF_WIDTH, the same numbers the stream
   * sets its holds inside.
   */
  private buildTread(): void {
    const warp = this.warp;
    const hw = PANEL_HALF_WIDTH;
    const room = (WALL.maxX - WALL.minX) * 4;

    // The room behind it: the gym wall, dark, a little behind the machine.
    const back = this.panel(SIDE_LOOK, -room / 2, room / 2, -0.6, WALL.maxY * 2, -0.35);
    this.treadFrame.add(back);

    // The belt: slats from below the skirt to above the hood, so the wrap is
    // never seen. It scrolls with the holds and wraps one slat at a time.
    this.wallGroup.add(this.panel(SLAT_LOOK, -hw, hw, -0.6, PANEL + 0.36, 0, 0.85));

    const steel = new THREE.MeshStandardMaterial({ color: GYM.steel, roughness: 0.45, metalness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: GYM.machine, roughness: 0.7, metalness: 0.2 });
    const accent = new THREE.MeshStandardMaterial({ color: GYM.treadAccent, roughness: 0.5, metalness: 0.1, emissive: GYM.treadAccent, emissiveIntensity: 0.25 });
    const rail = (x: number) => {
      // Side rails: a box section running the length of the belt, standing proud of it.
      for (let y = -0.1; y < PANEL + 0.2; y += 0.4) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.16), steel);
        placeOn(warp, seg, x, y + 0.2, 0.05);
        seg.castShadow = true;
        seg.receiveShadow = true;
        this.treadFrame.add(seg);
      }
      // The accent stripe down the rail's face: the machine's colour.
      const stripe = new THREE.Mesh(surfaceStrip(warp, x - 0.018, x + 0.018, 0, PANEL + 0.15, 0.135), accent);
      this.treadFrame.add(stripe);
    };
    rail(-hw - 0.06);
    rail(hw + 0.06);

    // The hood over the top roller, where the slats come round: it covers the
    // top of the belt, so holds arrive from under it.
    const hood = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.36, 0.44, 0.42), dark);
    placeOn(warp, hood, 0, PANEL + 0.2, 0.16);
    hood.castShadow = true;
    this.treadFrame.add(hood);
    const hoodLip = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.36, 0.04, 0.43), accent);
    placeOn(warp, hoodLip, 0, PANEL - 0.01, 0.16);
    this.treadFrame.add(hoodLip);

    // The skirt at the floor: where the slats, and the holds on them, go under.
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.36, 0.28, 0.3), dark);
    placeOn(warp, skirt, 0, 0.0, 0.1);
    skirt.castShadow = true;
    skirt.receiveShadow = true;
    this.treadFrame.add(skirt);
    const lipMesh = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.36, 0.035, 0.31), accent);
    placeOn(warp, lipMesh, 0, 0.14, 0.1);
    this.treadFrame.add(lipMesh);
  }

  // --- route -------------------------------------------------------------

  /** Rebuilds the on-route holds. Called once per route, not per frame. */
  setRoute(route: Route): void {
    this.route = route;
    const tower = route.wall === 'tower';
    if (tower !== this.tower) {
      this.tower = tower;
      this.buildWall();
    }
    for (const m of this.holdMeshes.values()) {
      this.holdGroup.remove(m);
      (m.material as THREE.Material).dispose();
    }
    this.holdMeshes.clear();
    this.holdY.clear();

    const color = GRADE_COLOR[route.grade];
    for (const hold of route.holds) {
      // The finish is not the route colour. A player who reaches the top of
      // a route should never have to wonder whether they are done.
      const isFinish = route.finish.includes(hold.id);
      const mesh = this.holdMesh(hold, isFinish ? '#ffffff' : color, isFinish);
      this.holdGroup.add(mesh);
      this.holdMeshes.set(hold.id, mesh);
    }
  }

  /**
   * Brings the hold meshes in line with a hold list that changes while you
   * climb — the tread wall's stream. New holds are added, gone ones removed,
   * the rest left alone. `colorOf` paints each new hold.
   */
  syncHolds(holds: Hold[], colorOf: (h: Hold) => string): void {
    const want = new Set(holds.map((h) => h.id));
    for (const [id, m] of this.holdMeshes) {
      if (want.has(id)) continue;
      this.holdGroup.remove(m);
      (m.material as THREE.Material).dispose();
      this.holdMeshes.delete(id);
      this.holdY.delete(id);
    }
    for (const hold of holds) {
      if (this.holdMeshes.has(hold.id) || hold.type === 'smear') continue;
      const mesh = this.holdMesh(hold, colorOf(hold));
      this.holdY.set(hold.id, hold.pos.y);
      this.holdGroup.add(mesh);
      this.holdMeshes.set(hold.id, mesh);
    }
    if (this.tread) this.clipToBelt();
  }

  /**
   * The tread wall. Holds only exist on the belt: one set above the hood is
   * still coming round the top roller, one under the skirt has gone.
   */
  setTread(on: boolean): void {
    if (this.tread === on) return;
    this.tread = on;
    this.buildWall();
    this.applyCamera();
  }

  private clipToBelt(): void {
    const lo = this.scroll - 0.02;
    const hi = this.scroll + PANEL + 0.02;
    for (const [id, m] of this.holdMeshes) {
      const h = this.route?.holds.find((x) => x.id === id);
      const y = h ? h.pos.y : this.holdY.get(id);
      m.visible = y === undefined || (y >= lo && y <= hi);
    }
  }

  /**
   * The belt. Everything on the wall rolls down by `metres`; the floor and the
   * mat stay where they are. Callers keep using wall coordinates — the
   * projection and the camera take the roll out.
   */
  setScroll(metres: number): void {
    this.scroll = metres;
    const a = this.warp.point(0, 0, 0);
    const b = this.warp.point(0, -metres, 0);
    this.plane.position.set(b.x - a.x, b.y - a.y, b.z - a.z);
    // The belt wraps one slat at a time — every slat is the same, so the jump
    // is invisible and a belt that runs for an hour never runs out of wall.
    const seam = this.tread ? SLAT_LOOK.metres : CAVE_LOOK.metres;
    const wrap = Math.floor(metres / seam) * seam;
    const c = this.warp.point(0, wrap, 0);
    this.wallGroup.position.set(c.x - a.x, c.y - a.y, c.z - a.z);
    if (this.tread) this.clipToBelt();
    this.applyCamera();
  }

  /**
   * Highball landing: stacked pads under the line, as many as the problem
   * has, so the screen shows how much is (and is not) under you.
   */
  setLanding(landing: { pads: number; halfWidth: number; centre: number } | null): void {
    for (const o of [...this.padGroup.children]) {
      this.padGroup.remove(o);
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    }
    if (!landing) return;
    const colors = ['#2f4f7a', '#3b6aa0', '#2b5c8c'];
    const width = landing.halfWidth * 2;
    for (let i = 0; i < landing.pads; i++) {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(width - i * 0.06, 0.2, 1.35 - i * 0.04),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.95 }),
      );
      pad.position.set(landing.centre, 0.1 + i * 0.205, 0.78);
      pad.receiveShadow = true;
      pad.castShadow = true;
      this.padGroup.add(pad);
    }
  }

  /** A hold's mesh: its taped colour, a little gloss, and a soft contact shadow behind it. */
  private holdMesh(hold: Hold, color: string, finish = false): THREE.Mesh {
    const mesh = new THREE.Mesh(
      holdGeometry(hold.type),
      new THREE.MeshStandardMaterial({
        color,
        roughness: finish ? 0.38 : 0.55,
        metalness: 0.04,
        emissive: color,
        emissiveIntensity: 0,
      }),
    );
    mesh.userData.sharedGeometry = true;
    this.placeHold(mesh, hold);
    mesh.castShadow = true;
    if (this.blobMat) {
      // In the hold's own frame, which is scaled to its contact radius, so
      // the shadow is always the hold's size. A hair off the wall, under it.
      const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
      blob.position.set(0.06, -0.12, 0.004);
      blob.scale.setScalar(hold.type === 'volume' ? 2.3 : 2.6);
      blob.renderOrder = -1;
      mesh.add(blob);
    }
    return mesh;
  }

  private placeHold(mesh: THREE.Mesh, hold: Hold): void {
    // Every hold geometry is authored around a unit radius, so scaling by the
    // contact radius makes what you see the same size as what the sim tests
    // against. Rails and undercuts are rotated to face the way they are meant
    // to be used, so the shape on screen tells you what the sim already knows.
    placeOn(this.warp, mesh, hold.pos.x, hold.pos.y, HOLD_Z, hold.roll ?? hold.dir + Math.PI / 2);
    mesh.scale.setScalar(contactRadius(hold.size, hold.type));
  }

  /** Lights the finish holds and dims anything the route does not use. */
  highlight(finish: number[], reachable: Set<number>, selected: number | null): void {
    for (const [id, mesh] of this.holdMeshes) {
      const m = mesh.material as THREE.MeshStandardMaterial;
      const isFinish = finish.includes(id);
      m.emissiveIntensity =
        id === selected ? 0.55
        : isFinish ? 0.42 + Math.sin(performance.now() / 420) * 0.18
        : reachable.has(id) ? 0.14
        : 0;
    }
  }

  // --- climber -----------------------------------------------------------

  setClimber(pose: Pose, limbs: Record<LimbId, Vec2>, mood: Mood): void {
    this.climber.setPose(pose, limbs, mood);
  }


  setClimberVisible(visible: boolean): void {
    this.climber.group.visible = visible;
  }

  // --- camera ------------------------------------------------------------

  /** Gives the wall its shape: one lean, or a profile with bends in it. */
  setWall(wall: number | WallProfile): void {
    const profile = typeof wall === 'number' ? { base: wall, bends: [] } : wall;
    this.warp = new WallWarp(profile);
    this.climber.setWarp(this.warp);
    this.buildWall();
    if (this.route) this.setRoute(this.route);
    this.applyCamera();
  }

  /** Leans the whole wall back by `radians`, pivoting about its foot. */
  setOverhang(radians: number): void {
    this.setWall(radians);
  }

  /** The wall-to-world mapping, for anything else that wants to sit on the wall. */
  getWarp(): WallWarp {
    return this.warp;
  }

  setCamera(next: Partial<CameraState>): void {
    this.cam = { ...this.cam, ...next };
    this.cam.frame = clamp(this.cam.frame, FRAME_MIN, FRAME_MAX);
    this.cam.orbit = clamp(this.cam.orbit, -ORBIT_LIMIT, ORBIT_LIMIT);
    this.applyCamera();
  }

  getCamera(): CameraState {
    return { ...this.cam };
  }

  private applyCamera(): void {
    const dist = (this.cam.frame / 2) / Math.tan((FOV * Math.PI) / 360);
    const { focusY, focusX, orbit } = this.cam;

    // focusY is a distance up the wall's surface, and on a leaning or bent
    // wall that is not a height in the world, so the focus point goes through
    // the same warp as everything on the wall.
    const f = this.warp.point(focusX, focusY - this.scroll, 0);

    // The camera pulls back from the climber mostly level, so an overhang
    // reads the way it does from the mat — wall leaning away overhead — but
    // it drops under a steep wall part of the way, so a roof is something you
    // look up into rather than a sliver seen edge on.
    const under = this.warp.angle(focusY - this.scroll) * CAMERA_UNDER;
    this.camera.position.set(
      f.x + Math.sin(orbit) * dist,
      f.y - Math.sin(under) * dist * Math.cos(orbit) + Math.sin(orbit) * 0.1,
      f.z + Math.cos(under) * dist * Math.cos(orbit),
    );
    this.camera.lookAt(f.x, f.y, f.z);
    this.camera.updateMatrixWorld();
    // The key light goes up the wall with the camera, so a highball's top
    // casts shadows the way its bottom does.
    if (this.key) {
      this.key.position.set(2.6, f.y + 3.2, 4.2);
      this.key.target.position.set(0, f.y, 0);
      this.key.target.updateMatrixWorld();
    }
  }

  /** The mesh for a hold, so a test can check the overlay agrees with it. */
  holdMeshFor(id: number): THREE.Mesh | undefined {
    return this.holdMeshes.get(id);
  }

  /**
   * Wall point to canvas pixels, for drawing the aiming overlay on top.
   *
   * `z` is how far out of the wall the thing being drawn actually sits, and it
   * matters: holds are anchored at z = 0, so anything marking a hold must be
   * projected at z = 0 too. Guessing a forward offset here puts the reticle
   * slightly off the hold even on a flat wall, and once the wall is pitched
   * that offset rotates into a vertical error that grows with the angle.
   */
  project(p: Vec2, z: number = HOLD_Z): { x: number; y: number; visible: boolean } {
    // Wall-space to world: the same warp everything on the wall goes through.
    // The overlay calls this dozens of times a frame, so it reuses one vector
    // and the canvas size from the last resize rather than allocating and
    // asking the layout engine every time.
    const v = this.warp.point(p.x, p.y - this.scroll, z, this.scratch);
    v.project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.size.w,
      y: (-v.y * 0.5 + 0.5) * this.size.h,
      visible: v.z < 1,
    };
  }

  /**
   * How far sideways the camera may look before it shows more gym than wall.
   * On a wide screen that is nowhere; on a phone held upright it is most of
   * the way to the edge.
   */
  focusXLimit(frame: number = this.cam.frame): number {
    const halfWidth = (frame / 2) * this.camera.aspect;
    const edge = this.tread ? PANEL_HALF_WIDTH + 0.2 : WALL.maxX + 0.05;
    return Math.max(0, edge - halfWidth);
  }

  /** Metres per pixel at the wall plane. Keeps drag feel consistent at any zoom. */
  metresPerPixel(): number {
    return this.size.h > 0 ? this.cam.frame / this.size.h : 0.01;
  }

  // --- loop --------------------------------------------------------------

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.size = { w: rect.width, h: rect.height };
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyCamera();
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Frees everything this scene owns on the GPU and gives the WebGL context
   * back. Each climb mounts a fresh canvas, so without the context loss a
   * session of climbs piled contexts up until the browser started dropping
   * them. Shared resources are left alone: the hold geometry cache and the
   * wall textures are drawn once for the whole app.
   */
  dispose(): void {
    this.disposed = true;
    this.climber.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (!o.userData.sharedGeometry && o.geometry !== this.blobGeo) geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    this.blobGeo.dispose();
    this.key?.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
