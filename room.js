import * as THREE from 'three';

const WORKSPACE_BG = 0x06080f;
const PALETTE = ['#6366f1', '#a855f7', '#06b6d4', '#3b82f6'];
const MONITOR_Y = 2.45;

const AGENT_COLORS = {
  orchestrator: '#818cf8',
  planner: '#c084fc',
  coder: '#a78bfa',
  reviewer: '#22d3ee',
  ops: '#60a5fa',
};

const AGENT_LOG = [
  ['orchestrator', 'planning task #1842', '#cbd5e1'],
  ['planner', 'decompose → 5 subtasks', '#cbd5e1'],
  ['coder', 'edit src/api/route.ts  +42 −7', '#cbd5e1'],
  ['coder', 'running typecheck…', '#94a3b8'],
  ['reviewer', '12 tests passed · 0 failed', '#34d399'],
  ['coder', 'repair 2 type errors', '#fbbf24'],
  ['reviewer', 're-run suite ✓', '#34d399'],
  ['ops', 'merge request !317 opened', '#cbd5e1'],
  ['orchestrator', '✓ task complete in 3m 12s', '#34d399'],
];

const AGENTS = [
  { name: 'orchestrator', task: 'coordinating 3 workers', speed: 0.7, phase: 0.0 },
  { name: 'planner', task: 'subtasks 4/5 done', speed: 0.9, phase: 1.7 },
  { name: 'coder', task: 'editing route.ts', speed: 1.2, phase: 3.1 },
  { name: 'reviewer', task: 'running test suite', speed: 0.8, phase: 4.6 },
];

const EDITOR_CODE = `// factory-harness · src/api/route.ts
import { pipeline } from '@factory/core';

export async function run(task: Task) {
  const plan = await planner.decompose(task);

  for (const step of plan.steps) {
    const patch = await coder.implement(step);
    const ok = await reviewer.verify(patch);

    if (!ok) await coder.repair(patch, reviewer.notes);
    await ops.queueMerge(patch);
  }

  return { status: 'merged', task: task.id };
}`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function hexToRgba(hex, a = 1) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function clockString(seconds) {
  const base = 12 * 3600 + 4 * 60 + 11 + Math.floor(seconds);
  const h = String(Math.floor(base / 3600) % 24).padStart(2, '0');
  const m = String(Math.floor(base / 60) % 60).padStart(2, '0');
  const s = String(base % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export class CyberpunkWorkspace {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.onWorkspaceClick = opts.onWorkspaceClick || (() => {});
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.quality = this._quality();
    this.lang = opts.lang || 'es';

    this.liveScreens = [];
    this.screenAcc = 0;
    this.simTime = 0;
    this.logTimer = 0;
    this.logIndex = 0;
    this.logLines = [];
    this.codeReveal = 150;
    this.codeHold = 0;

    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.scrollProgress = 0;
    this.lookCurrent = new THREE.Vector3(0, 1.85, 0);
    this.lookTarget = new THREE.Vector3(0, 1.85, 0);

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.raf = 0;
    this.disposed = false;
    this.ready = false;
    this.paused = false;
    this.startedAt = performance.now();
    this.frameAvg = 1 / 60;
    this.slowFrames = 0;
  }

  _quality() {
    const small = window.innerWidth < 820;
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    if (small || cores <= 4 || mem <= 2) return 'low';
    if (cores <= 6) return 'medium';
    return 'high';
  }

  async init() {
    this._setupRenderer();
    this._setupScene();
    await this._setupEnvironment();
    this._setupLights();
    this._buildFloor();
    this._buildBackdrop();
    this._buildDesk();
    this._buildDecor();
    this._buildScreens();
    this._buildParticles();
    await this._setupPost();
    this._setupEvents();
    this._animate();
    this.ready = true;
    return this;
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setClearColor(WORKSPACE_BG, 1);
  }

  _pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    if (this.quality === 'high') return Math.min(dpr, 1.5);
    if (this.quality === 'medium') return Math.min(dpr, 1.25);
    return 1;
  }

  _isPortrait() {
    return window.innerWidth <= 820 || window.innerWidth / window.innerHeight < 0.95;
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(WORKSPACE_BG);
    this.scene.fog = new THREE.FogExp2(WORKSPACE_BG, 0.032);

    this.baseCam = new THREE.Vector3();
    this.baseLook = new THREE.Vector3();
    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 120);
    this._updateFraming();
    this.camera.position.copy(this.baseCam);
    this.lookTarget.copy(this.baseLook);
    this.lookCurrent.copy(this.baseLook);
    this.camera.lookAt(this.lookTarget);
  }

  _updateFraming() {
    const portrait = this._isPortrait();
    this.portrait = portrait;
    this.baseCam.set(0, portrait ? 3.35 : 3.15, portrait ? 7.6 : 8.8);
    this.baseLook.set(0, portrait ? 2.15 : 1.9, portrait ? -0.5 : 0);
    if (this.camera) {
      this.camera.fov = portrait ? 50 : 46;
      this.camera.updateProjectionMatrix();
    }
  }

  async _setupEnvironment() {
    if (this.quality === 'low') return;
    try {
      const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
      this.scene.environment = env.texture;
      pmrem.dispose();
    } catch {
      /* environment is optional */
    }
  }

  _setupLights() {
    this.scene.add(new THREE.AmbientLight(0x1b2440, 0.9));
    this.scene.add(new THREE.HemisphereLight(0x33406b, 0x04060b, 0.85));

    const key = new THREE.SpotLight(0xa9bcff, 140, 34, 0.62, 0.9, 1.6);
    key.position.set(0, 8.2, 4.2);
    key.target.position.set(0, 1, -0.4);
    this.scene.add(key, key.target);

    const purple = new THREE.PointLight(0x8b5cf6, 60, 16, 2);
    purple.position.set(-4.6, 3.4, 1.6);
    this.scene.add(purple);

    const cyan = new THREE.PointLight(0x22d3ee, 55, 16, 2);
    cyan.position.set(4.8, 3.1, 1.2);
    this.scene.add(cyan);

    const rim = new THREE.PointLight(0x6366f1, 40, 20, 2);
    rim.position.set(0, 3.2, -5);
    this.scene.add(rim);
  }

  _buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70),
      new THREE.MeshStandardMaterial({ color: 0x070a12, roughness: 0.55, metalness: 0.55, envMapIntensity: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(64, 40, 0x26304d, 0x121a2c);
    grid.position.y = 0.004;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    this.scene.add(grid);

    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(38, 38),
      new THREE.MeshBasicMaterial({
        map: this._radialTexture(),
        color: 0x3b4b8f,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.02;
    this.scene.add(halo);
  }

  _buildBackdrop() {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 24),
      new THREE.MeshBasicMaterial({
        map: this._radialTexture(),
        color: 0x2a2f6b,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.position.set(0, 5.5, -12);
    this.scene.add(glow);

    const bars = [
      { x: -6.2, color: 0x6366f1, h: 8.5 },
      { x: -3.1, color: 0x8b5cf6, h: 6.2 },
      { x: 3.1, color: 0x06b6d4, h: 6.2 },
      { x: 6.2, color: 0x3b82f6, h: 8.5 },
    ];
    bars.forEach((b) => {
      const mat = new THREE.MeshBasicMaterial({ color: b.color, toneMapped: false });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, b.h, 0.05), mat);
      bar.position.set(b.x, b.h / 2, -6.4);
      this.scene.add(bar);

      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this._radialTexture(),
          color: b.color,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sprite.scale.set(2.6, b.h * 1.5, 1);
      sprite.position.set(b.x, b.h / 2, -6.5);
      this.scene.add(sprite);
    });

    const lineMat = new THREE.LineBasicMaterial({ color: 0x1e2740, transparent: true, opacity: 0.35 });
    for (let i = -6; i <= 6; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(i * 2.4, 0, -6.45),
        new THREE.Vector3(i * 2.4, 9, -6.45),
      ]);
      this.scene.add(new THREE.Line(g, lineMat));
    }
  }

  _buildDesk() {
    const desk = new THREE.Group();
    desk.position.y = 0;

    const surfaceMat = new THREE.MeshStandardMaterial({
      color: 0x0d1220,
      roughness: 0.32,
      metalness: 0.65,
      envMapIntensity: 0.85,
    });
    const surface = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.2, 4.4), surfaceMat);
    surface.position.y = 0.9;
    desk.add(surface);

    const legMat = new THREE.MeshStandardMaterial({ color: 0x0a0e18, roughness: 0.4, metalness: 0.7 });
    [-4.2, 4.2].forEach((x) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 3.9), legMat);
      leg.position.set(x, 0.45, 0);
      desk.add(leg);
    });

    const edgeLeft = new THREE.Mesh(
      new THREE.BoxGeometry(4.7, 0.028, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x4a4dc4, toneMapped: false })
    );
    edgeLeft.position.set(-2.35, 1.005, 2.22);
    desk.add(edgeLeft);

    const edgeRight = new THREE.Mesh(
      new THREE.BoxGeometry(4.7, 0.028, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x0e8ea8, toneMapped: false })
    );
    edgeRight.position.set(2.35, 1.005, 2.22);
    desk.add(edgeRight);

    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x080c14, roughness: 0.85, metalness: 0.2 })
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(0, 1.006, 0.9);
    desk.add(mat);

    const matEdge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-2.8, 1.008, -0.2),
        new THREE.Vector3(2.8, 1.008, -0.2),
        new THREE.Vector3(2.8, 1.008, 2.0),
        new THREE.Vector3(-2.8, 1.008, 2.0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x2a3560, transparent: true, opacity: 0.8 })
    );
    desk.add(matEdge);

    this.scene.add(desk);
    this.desk = desk;
  }

  _buildDecor() {
    const group = new THREE.Group();

    const keyboard = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 0.07, 0.72),
      new THREE.MeshStandardMaterial({ color: 0x0b0f1a, roughness: 0.55, metalness: 0.45 })
    );
    keyboard.position.set(0, 1.045, 1.32);
    group.add(keyboard);

    const keyTex = this._keyboardTexture();
    const keyPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.14, 0.58),
      new THREE.MeshBasicMaterial({ map: keyTex, transparent: true, opacity: 0.9 })
    );
    keyPlane.rotation.x = -Math.PI / 2;
    keyPlane.position.set(0, 1.081, 1.32);
    group.add(keyPlane);

    const keyGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.14, 0.58),
      new THREE.MeshBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    keyGlow.rotation.x = -Math.PI / 2;
    keyGlow.position.set(0, 1.082, 1.32);
    group.add(keyGlow);

    const mouse = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.13, 0.22, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x10151f, roughness: 0.4, metalness: 0.6 })
    );
    mouse.rotation.x = Math.PI / 2;
    mouse.scale.set(1, 1, 0.55);
    mouse.position.set(1.75, 1.06, 1.34);
    group.add(mouse);

    const mouseGlow = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.008, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4, toneMapped: false })
    );
    mouseGlow.rotation.x = Math.PI / 2;
    mouseGlow.position.set(1.75, 1.09, 1.34);
    group.add(mouseGlow);

    const mug = new THREE.Group();
    const mugBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.14, 0.34, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x121a2b, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide })
    );
    mugBody.position.y = 0.17;
    mug.add(mugBody);
    const mugHandle = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.025, 8, 18, Math.PI * 1.35),
      new THREE.MeshStandardMaterial({ color: 0x121a2b, roughness: 0.6, metalness: 0.3 })
    );
    mugHandle.position.set(0.17, 0.19, 0);
    mugHandle.rotation.y = Math.PI / 2;
    mug.add(mugHandle);
    const coffee = new THREE.Mesh(
      new THREE.CircleGeometry(0.14, 24),
      new THREE.MeshBasicMaterial({ color: 0x2b1a10 })
    );
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = 0.3;
    mug.add(coffee);
    mug.position.set(-2.35, 1.0, 1.45);
    group.add(mug);

    const plant = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: 0x141b2c, roughness: 0.7, metalness: 0.2 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.32, 18), potMat);
    pot.position.y = 0.16;
    plant.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x1b5c4a,
      roughness: 0.75,
      emissive: 0x083026,
      emissiveIntensity: 0.25,
    });
    const leafGeo = new THREE.SphereGeometry(0.2, 10, 8);
    const leaves = [
      [0, 0.62, 0, 1],
      [0.18, 0.5, 0.08, 0.7],
      [-0.18, 0.54, -0.05, 0.75],
      [0.08, 0.42, -0.18, 0.6],
      [-0.1, 0.44, 0.18, 0.62],
    ];
    leaves.forEach(([x, y, z, s]) => {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(x, y, z);
      leaf.scale.set(s, s * 1.5, s);
      plant.add(leaf);
    });
    plant.position.set(-4.05, 1.0, -0.9);
    group.add(plant);
    this.plant = plant;

    const lampArmMat = new THREE.MeshStandardMaterial({ color: 0x151c2e, roughness: 0.4, metalness: 0.75 });
    const lamp = new THREE.Group();
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.06, 20), lampArmMat);
    lamp.add(lampBase);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 10), lampArmMat);
    arm.position.set(-0.34, 0.95, 0);
    arm.rotation.z = 0.36;
    lamp.add(arm);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.4, 18, 1, true), lampArmMat);
    head.position.set(-0.72, 1.84, 0);
    head.rotation.z = -0.95;
    lamp.add(head);
    const lampBulb = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe6bd, toneMapped: false })
    );
    lampBulb.position.set(-0.83, 1.72, 0);
    lampBulb.rotation.set(Math.PI / 2, 0, -0.95);
    lamp.add(lampBulb);
    lamp.position.set(4.0, 1.0, -1.0);
    group.add(lamp);

    const lampLight = new THREE.PointLight(0xffd9a0, 22, 6, 2);
    lampLight.position.set(3.2, 2.6, -0.8);
    group.add(lampLight);

    this.scene.add(group);
  }

  _screenLayout() {
    if (this.portrait) {
      return [
        { key: 'terminal', x: 0.05, y: MONITOR_Y, z: -0.35, rot: -0.06, scale: 0.9 },
        { key: 'editor', x: -0.4, y: MONITOR_Y + 0.9, z: -2.6, rot: 0.05, scale: 0.7, mounted: true, hidden: true },
        { key: 'dash', x: 0.05, y: MONITOR_Y + 1.5, z: -1.35, rot: -0.03, scale: 0.6, mounted: true },
      ];
    }
    return [
      { key: 'terminal', x: -1.78, y: MONITOR_Y, z: -0.32, rot: 0.1, scale: 0.98 },
      { key: 'editor', x: 1.78, y: MONITOR_Y, z: -0.45, rot: -0.1, scale: 0.94 },
      { key: 'dash', x: 0, y: MONITOR_Y + 1.9, z: -2, rot: 0, scale: 0.9, mounted: true },
    ];
  }

  _layoutScreens() {
    const layout = this._screenLayout();
    this.liveScreens.forEach((screen, i) => {
      const slot = layout[i] || layout[layout.length - 1];
      screen.slot = slot;
      screen.group.position.set(slot.x, slot.y, slot.z);
      screen.group.rotation.y = slot.rot;
      screen.group.scale.setScalar(slot.scale);
      screen.group.visible = !slot.hidden;
      screen.stand.visible = !slot.mounted;
      screen.pool.visible = !slot.mounted;
      screen.pool.position.set(slot.x, 1.012, slot.z + 0.5);
      screen.pool.scale.setScalar(slot.scale);
    });
  }

  _buildScreens() {
    const accents = { terminal: '#6366f1', editor: '#a855f7', dash: '#06b6d4' };
    this._seedLog();
    this._screenLayout().forEach((slot, i) => {
      this.liveScreens.push(this._createScreen(slot.key, accents[slot.key], i));
    });
    this._layoutScreens();
    if (this.reduced) {
      this.codeReveal = EDITOR_CODE.length + 26;
      this._redrawScreens();
    }
  }

  _createScreen(key, accentHex, index) {
    const group = new THREE.Group();

    const accent = new THREE.Color(accentHex);
    const W = 3.2;
    const H = 1.9;
    const D = 0.12;

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e18,
      roughness: 0.35,
      metalness: 0.8,
      emissive: accent,
      emissiveIntensity: 0.06,
      envMapIntensity: 0.9,
    });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.16, H + 0.16, D), frameMat);
    group.add(frame);

    const surface = this._createScreenSurface(key, accentHex);
    const mat = new THREE.MeshBasicMaterial({
      map: surface.texture,
      toneMapped: false,
      transparent: true,
      opacity: 0,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    screen.position.z = D / 2 + 0.004;
    screen.scale.y = 0.004;
    group.add(screen);

    const scanMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: accent },
        uOpacity: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColor;
        void main(){
          float band = smoothstep(0.05, 0.0, abs(vUv.y - fract(uTime * 0.11)));
          float sweep = smoothstep(0.9, 1.0, vUv.x - fract(uTime * 0.06)) * 0.15;
          float alpha = (band * 0.16 + sweep) * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(W, H), scanMat);
    scan.position.z = 0.006;
    screen.add(scan);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this._radialTexture(),
        color: accent,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.scale.set(W * 1.9, H * 1.9, 1);
    halo.position.z = -0.35;
    group.add(halo);

    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 1.25, H * 1.35),
      new THREE.MeshBasicMaterial({
        map: this._radialTexture(),
        color: accent,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    pool.rotation.x = -Math.PI / 2;
    this.scene.add(pool);

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.66, 0.025, 0.05),
      new THREE.MeshBasicMaterial({ color: accent, toneMapped: false })
    );
    strip.position.set(0, -(H / 2 + 0.16), 0.02);
    group.add(strip);

    const standMat = new THREE.MeshStandardMaterial({ color: 0x10151f, roughness: 0.45, metalness: 0.8 });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.48, 12), standMat);
    neck.position.y = -(H / 2 + 0.26);
    const stand = new THREE.Group();
    stand.add(neck);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.05, 24), standMat);
    base.position.y = -(H / 2 + 0.5);
    stand.add(base);
    group.add(stand);

    this.scene.add(group);

    return {
      key,
      accent,
      accentHex,
      group,
      frame,
      screen,
      scanMat,
      halo,
      pool,
      strip,
      stand,
      surface,
      slot: null,
      boot: 0,
      bootDelay: index * 0.18,
    };
  }

  _createScreenSurface(key, accentHex) {
    const w = 1024;
    const h = 608;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const surface = { key, accentHex, canvas, ctx, texture, w, h };
    this._drawSurface(surface);
    return surface;
  }

  _drawSurface(surface) {
    const { ctx, w, h } = surface;
    if (surface.key === 'terminal') this._drawTerminal(ctx, w, h, surface.accentHex);
    else if (surface.key === 'editor') this._drawEditor(ctx, w, h, surface.accentHex);
    else this._drawDash(ctx, w, h, surface.accentHex);
    surface.texture.needsUpdate = true;
  }

  _screenChrome(ctx, w, h, accentHex, url) {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0b1122');
    bg.addColorStop(0.55, '#070a12');
    bg.addColorStop(1, '#0a0d18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(99,102,241,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }

    const top = ctx.createLinearGradient(0, 0, 0, 58);
    top.addColorStop(0, 'rgba(15,20,36,0.98)');
    top.addColorStop(1, 'rgba(10,13,24,0.9)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, 58);
    ctx.fillStyle = 'rgba(148,163,184,0.14)';
    ctx.fillRect(0, 57, w, 1);

    const dots = ['#f87171', '#fbbf24', '#34d399'];
    dots.forEach((color, i) => {
      ctx.beginPath();
      ctx.arc(30 + i * 20, 29, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    ctx.font = '500 17px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(148,163,184,0.6)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(url, 104, 30);

    ctx.fillStyle = accentHex;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(w - 118, 23, 8, 12);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(148,163,184,0.45)';
    ctx.font = '500 15px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText('LIVE', w - 30, 30);
    ctx.textAlign = 'left';
  }

  _seedLog() {
    this.logLines.length = 0;
    AGENT_LOG.slice(0, 6).forEach(([agent, msg, color], i) => {
      this.logLines.push({ agent, msg, color, t: clockString(i * 3) });
    });
    this.logIndex = 6;
    this.logTimer = 1.1;
  }

  _drawTerminal(ctx, w, h, accent) {
    this._screenChrome(ctx, w, h, accent, 'jordan.dev — agent-runner');

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 21px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#eef2ff';
    ctx.fillText('AUTONOMOUS FACTORY', 60, 108);

    ctx.font = '500 15px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(148,163,184,0.55)';
    ctx.fillText('multi-agent orchestration · run #1842', 60, 134);

    const pulse = 0.55 + 0.45 * Math.sin(this.simTime * 2.4);
    ctx.fillStyle = hexToRgba(accent, 0.14);
    this._rr(ctx, w - 208, 92, 148, 34, 17);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w - 184, 109, 5, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba('#34d399', pulse);
    ctx.fill();
    ctx.font = '600 14px "JetBrains Mono", monospace';
    ctx.fillStyle = hexToRgba('#34d399', 0.9);
    ctx.fillText('LIVE', w - 170, 114);

    ctx.fillStyle = 'rgba(148,163,184,0.12)';
    ctx.fillRect(60, 156, w - 120, 1);

    const lineH = 44;
    const startY = 194;
    const maxLines = 8;
    const lines = this.logLines.slice(-maxLines);

    ctx.font = '500 18px "JetBrains Mono", monospace';
    lines.forEach((line, i) => {
      const y = startY + i * lineH;
      const fresh = i === lines.length - 1;

      ctx.fillStyle = 'rgba(148,163,184,0.32)';
      ctx.fillText(line.t, 60, y, 86);

      ctx.fillStyle = fresh ? hexToRgba(AGENT_COLORS[line.agent] || accent, 1) : hexToRgba(AGENT_COLORS[line.agent] || accent, 0.7);
      ctx.fillText(line.agent.padEnd(12, ' '), 152, y, 140);

      ctx.fillStyle = line.color;
      ctx.globalAlpha = fresh ? 1 : 0.62;
      ctx.fillText(line.msg, 302, y, w - 372);
      ctx.globalAlpha = 1;
    });

    const last = lines[lines.length - 1];
    if (last && this.simTime % 1 < 0.55) {
      ctx.font = '500 18px "JetBrains Mono", monospace';
      const cursorX = 302 + Math.min(ctx.measureText(last.msg).width, w - 372);
      ctx.fillStyle = hexToRgba(accent, 0.9);
      ctx.fillRect(cursorX + 4, startY + (lines.length - 1) * lineH - 15, 11, 19);
    }

    ctx.fillStyle = 'rgba(148,163,184,0.12)';
    ctx.fillRect(60, h - 58, w - 120, 1);
    ctx.font = '500 14px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(148,163,184,0.5)';
    ctx.fillText('4 agents · 128k tokens · 0 errors', 60, h - 26);
    ctx.textAlign = 'right';
    ctx.fillStyle = hexToRgba(accent, 0.75);
    ctx.fillText('factory run --watch', w - 60, h - 26);
    ctx.textAlign = 'left';
  }

  _codeTokens(line) {
    const out = [];
    if (!line) return [{ text: ' ', color: '#cbd5e1' }];
    const re = /(\/\/.*$)|('[^']*')|\b(import|from|export|async|function|const|await|for|of|if|return|new)\b|([A-Za-z_$][\w$]*)(?=\()|(\d+)|(\s+)|([^\w\s])/g;
    let match;
    let last = 0;
    while ((match = re.exec(line))) {
      if (match.index > last) out.push({ text: line.slice(last, match.index), color: '#cbd5e1' });
      let color = '#cbd5e1';
      if (match[1]) color = '#4b5876';
      else if (match[2]) color = '#67e8f9';
      else if (match[3]) color = '#a5b4fc';
      else if (match[4]) color = '#d8b4fe';
      else if (match[5]) color = '#fbcfe8';
      else if (match[6]) color = '#cbd5e1';
      else if (match[7]) color = '#94a3b8';
      out.push({ text: match[0], color });
      last = re.lastIndex;
    }
    if (last < line.length) out.push({ text: line.slice(last), color: '#cbd5e1' });
    return out;
  }

  _drawCodeLine(ctx, line, x, y, budget) {
    const tokens = this._codeTokens(line);
    let used = 0;
    let cx = x;
    for (const tok of tokens) {
      if (used >= budget) break;
      const room = budget - used;
      const shown = tok.text.length <= room ? tok.text : tok.text.slice(0, room);
      ctx.fillStyle = tok.color;
      ctx.fillText(shown, cx, y);
      cx += ctx.measureText(shown).width;
      used += shown.length;
      if (shown.length < tok.text.length) break;
    }
    return cx;
  }

  _drawEditor(ctx, w, h, accent) {
    this._screenChrome(ctx, w, h, accent, 'factory-harness · src/api/route.ts');

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.font = '600 15px "JetBrains Mono", monospace';
    const badgeW = ctx.measureText('TS').width + 26;
    ctx.fillStyle = hexToRgba(accent, 0.16);
    this._rr(ctx, 60, 78, badgeW, 28, 6);
    ctx.fill();
    ctx.fillStyle = hexToRgba(accent, 0.95);
    ctx.fillText('TS', 73, 98);

    ctx.font = '500 16px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(203,213,225,0.6)';
    ctx.fillText('src / api / route.ts', 60 + badgeW + 16, 98);

    ctx.fillStyle = 'rgba(148,163,184,0.12)';
    ctx.fillRect(60, 128, w - 120, 1);

    const cursorOn = this.simTime % 1 < 0.55;
    ctx.textAlign = 'right';
    ctx.font = '500 14px "JetBrains Mono", monospace';
    ctx.fillStyle = hexToRgba(accent, 0.6);
    ctx.fillText('coder · generating', w - 60, 98);
    ctx.textAlign = 'left';

    const lines = EDITOR_CODE.split('\n');
    const lineH = 30;
    const startY = 170;
    const codeX = 108;
    let remaining = Math.floor(this.codeReveal);

    ctx.font = '500 18px "JetBrains Mono", monospace';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const y = startY + i * lineH;

      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(99,102,241,0.3)';
      ctx.fillText(String(i + 1).padStart(2, '0'), 74, y);
      ctx.textAlign = 'left';

      if (remaining <= 0) break;

      const budget = Math.min(remaining, line.length);
      const active = remaining <= line.length + 1;
      if (active) {
        ctx.fillStyle = 'rgba(168,85,247,0.06)';
        ctx.fillRect(88, y - 20, w - 148, 27);
      }

      const endX = this._drawCodeLine(ctx, line, codeX, y, budget);

      if (active && cursorOn) {
        ctx.fillStyle = hexToRgba(accent, 0.85);
        ctx.fillRect(endX + 2, y - 15, 10, 19);
      }

      remaining -= line.length + 1;
    }

    let cursorLine = 1;
    let cursorCol = 1;
    let left = Math.floor(this.codeReveal);
    for (const ch of EDITOR_CODE) {
      if (left <= 0) break;
      if (ch === '\n') {
        cursorLine += 1;
        cursorCol = 1;
      } else {
        cursorCol += 1;
      }
      left -= 1;
    }

    ctx.fillStyle = 'rgba(148,163,184,0.12)';
    ctx.fillRect(60, h - 58, w - 120, 1);
    ctx.font = '500 14px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(148,163,184,0.5)';
    ctx.fillText(`Ln ${cursorLine}, Col ${cursorCol} · UTF-8 · TypeScript`, 60, h - 26);
    ctx.textAlign = 'right';
    ctx.fillStyle = hexToRgba(accent, 0.75);
    ctx.fillText('agent · coder', w - 60, h - 26);
    ctx.textAlign = 'left';
  }

  _drawDash(ctx, w, h, accent) {
    this._screenChrome(ctx, w, h, accent, 'orchestration — agent mesh');

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 23px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#eef2ff';
    ctx.fillText('AGENT MESH', 60, 110);

    const pulse = 0.5 + 0.5 * Math.sin(this.simTime * 3);
    ctx.beginPath();
    ctx.arc(w - 186, 103, 5, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba('#34d399', pulse);
    ctx.fill();
    ctx.font = '600 14px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(52,211,153,0.85)';
    ctx.fillText('RUNNING', w - 172, 108);

    ctx.fillStyle = 'rgba(148,163,184,0.12)';
    ctx.fillRect(60, 138, w - 120, 1);

    const rowStart = 184;
    const rowH = 74;

    AGENTS.forEach((agent, i) => {
      const y = rowStart + i * rowH;
      const progress = 0.25 + 0.7 * (0.5 + 0.5 * Math.sin(this.simTime * agent.speed + agent.phase));
      const color = AGENT_COLORS[agent.name] || accent;

      ctx.beginPath();
      ctx.arc(66, y - 5, 6, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, 0.9);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.font = '600 20px "JetBrains Mono", monospace';
      ctx.fillStyle = hexToRgba(color, 0.95);
      ctx.fillText(agent.name, 88, y);

      ctx.font = '400 16px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.55)';
      ctx.fillText(agent.task, 88, y + 27);

      const trackX = 560;
      const trackW = 330;
      ctx.fillStyle = 'rgba(148,163,184,0.12)';
      this._rr(ctx, trackX, y - 12, trackW, 9, 4);
      ctx.fill();
      ctx.fillStyle = hexToRgba(color, 0.85);
      this._rr(ctx, trackX, y - 12, Math.max(10, trackW * progress), 9, 4);
      ctx.fill();

      ctx.textAlign = 'right';
      ctx.font = '500 15px "JetBrains Mono", monospace';
      ctx.fillStyle = hexToRgba(color, 0.7);
      ctx.fillText(`${Math.round(progress * 100)}%`, w - 62, y - 2);
      ctx.textAlign = 'left';
    });

    ctx.fillStyle = 'rgba(148,163,184,0.12)';
    ctx.fillRect(60, h - 96, w - 120, 1);

    const stats = [
      ['TASKS', String(128 + Math.floor(this.simTime / 14))],
      ['SUCCESS', '98.7%'],
      ['AVG TIME', '2m 41s'],
    ];
    stats.forEach(([label, value], i) => {
      const x = 60 + i * 214;
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.42)';
      ctx.fillText(label, x, h - 62);
      ctx.font = '700 26px "Space Grotesk", sans-serif';
      ctx.fillStyle = i === 2 ? hexToRgba(accent, 0.95) : '#e2e8f0';
      ctx.fillText(value, x, h - 28);
    });

    ctx.textAlign = 'right';
    ctx.font = '500 13px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(148,163,184,0.4)';
    ctx.fillText('synced just now', w - 60, h - 28);
    ctx.textAlign = 'left';
  }

  _keyboardTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 144;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 144);
    const cols = 16;
    const rows = 5;
    const gap = 4;
    const kw = (512 - gap * (cols + 1)) / cols;
    const kh = (144 - gap * (rows + 1)) / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = gap + col * (kw + gap);
        const y = gap + r * (kh + gap);
        const hot = (r * cols + col) % 11 === 0;
        ctx.fillStyle = hot ? 'rgba(99,102,241,0.55)' : 'rgba(148,163,184,0.16)';
        this._rr(ctx, x, y, kw, kh, 3);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  _radialTexture() {
    if (this._radialTex) return this._radialTex;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    this._radialTex = new THREE.CanvasTexture(c);
    return this._radialTex;
  }

  _buildParticles() {
    const count = this.quality === 'high' ? 130 : this.quality === 'medium' ? 70 : 0;
    if (!count) return;

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const palette = PALETTE.map((p) => new THREE.Color(p));

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 1] = Math.random() * 9 + 0.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 16 - 2;
      const c = palette[Math.floor(Math.random() * palette.length)];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      sizes[i] = Math.random() * 2.2 + 0.7;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.particleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float uTime;
        void main(){
          vColor = color;
          vec3 p = position;
          p.y += sin(uTime * 0.45 + position.x * 0.4) * 0.5;
          p.x += cos(uTime * 0.35 + position.z * 0.3) * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = size * (24.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float glow = exp(-d * 3.2);
          float core = 1.0 - smoothstep(0.0, 0.32, d);
          gl_FragColor = vec4(vColor, glow * 0.35 + core * 0.65);
        }
      `,
    });

    this.particles = new THREE.Points(geo, this.particleMat);
    this.scene.add(this.particles);
  }

  async _setupPost() {
    if (this.quality === 'low' || this.reduced) return;
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'),
      ]);
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.52,
        0.72,
        0.62
      );
      this.composer.addPass(this.bloom);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    } catch {
      this.composer = null;
    }
  }

  _setupEvents() {
    this.onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const wasPortrait = this.portrait;
      this.camera.aspect = w / h;
      this._updateFraming();
      if (this.portrait !== wasPortrait) this._layoutScreens();
      this.renderer.setPixelRatio(this._pixelRatio());
      this.renderer.setSize(w, h);
      if (this.composer) this.composer.setSize(w, h);
    };
    window.addEventListener('resize', this.onResize);

    this.onPointerMove = (e) => {
      this.pointerTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointerTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });

    this.onCanvasClick = () => {
      if (this.scrollProgress < 0.02) this.onWorkspaceClick();
    };
    this.canvas.addEventListener('click', this.onCanvasClick);

    this.onContextLost = (e) => {
      e.preventDefault();
      document.body.classList.add('ws-lost');
    };
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  setScroll(progress) {
    this.scrollProgress = clamp(progress, 0, 1);
  }

  setPaused(paused) {
    if (this.paused === paused || this.disposed) return;
    this.paused = paused;
    if (paused) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else {
      this.clock.getDelta();
      this._animate();
    }
  }

  _sampleQuality(rawDt) {
    if (this.reduced || rawDt <= 0 || rawDt > 0.25) return;
    if (performance.now() - this.startedAt < 4000) return;
    this.frameAvg += (rawDt - this.frameAvg) * 0.05;
    if (this.frameAvg > 0.028) this.slowFrames += 1;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);

    if (this.slowFrames > 60 && this.quality !== 'low') this._downgrade();
  }

  _downgrade() {
    this.slowFrames = 0;
    this.frameAvg = 1 / 60;
    if (this.quality === 'high') {
      this.quality = 'medium';
    } else {
      this.quality = 'low';
      if (this.composer) {
        const composer = this.composer;
        this.composer = null;
        this.bloom = null;
        if (composer.renderTarget1) composer.renderTarget1.dispose();
        if (composer.renderTarget2) composer.renderTarget2.dispose();
      }
      if (this.particles) this.particles.visible = false;
      this.scene.environment = null;
      this.renderer.autoClear = true;
    }
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  setLanguage(lang) {
    if (lang === this.lang) return;
    this.lang = lang;
    this.refreshFonts();
  }

  refreshFonts() {
    this._redrawScreens();
  }

  _redrawScreens() {
    this.liveScreens.forEach((screen) => {
      if (screen.group.visible) this._drawSurface(screen.surface);
    });
  }

  _updateSim(dt) {
    this.simTime += dt;

    this.logTimer -= dt;
    if (this.logTimer <= 0) {
      if (this.logIndex >= AGENT_LOG.length) {
        this.logLines.length = 0;
        this.logIndex = 0;
        this.logTimer = 1.5;
      } else {
        const [agent, msg, color] = AGENT_LOG[this.logIndex++];
        this.logLines.push({ agent, msg, color, t: clockString(this.simTime) });
        if (this.logLines.length > 8) this.logLines.shift();
        this.logTimer = 0.85 + (this.logIndex % 3) * 0.22;
      }
    }

    const total = EDITOR_CODE.length;
    if (this.codeHold > 0) {
      this.codeHold -= dt;
      if (this.codeHold <= 0) this.codeReveal = 150;
    } else {
      this.codeReveal = Math.min(this.codeReveal + dt * 55, total + 26);
      if (this.codeReveal >= total + 26) this.codeHold = 2.8;
    }
  }

  _animate() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(() => this._animate());

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.elapsed += dt;
    const t = this.elapsed;
    this._sampleQuality(rawDt);

    this.pointer.x += (this.pointerTarget.x - this.pointer.x) * (1 - Math.exp(-dt * 5));
    this.pointer.y += (this.pointerTarget.y - this.pointer.y) * (1 - Math.exp(-dt * 5));

    const p = this.scrollProgress;
    const idle = this.reduced ? 0 : 1;

    const targetX = this.pointer.x * 0.55 * idle;
    const targetY = this.baseCam.y + p * 2.6 + this.pointer.y * -0.22 * idle;
    const targetZ = this.baseCam.z + p * 2.2;

    this.lookTarget.set(targetX * 0.25, this.baseLook.y - p * 0.55, this.baseLook.z);

    const damp = 1 - Math.exp(-dt * 4.5);
    this.camera.position.x += (targetX - this.camera.position.x) * damp;
    this.camera.position.y += (targetY - this.camera.position.y) * damp;
    this.camera.position.z += (targetZ - this.camera.position.z) * damp;

    this.lookCurrent.lerp(this.lookTarget, 1 - Math.exp(-dt * 4));
    this.camera.lookAt(this.lookCurrent);

    if (!this.reduced) {
      this._updateSim(dt);
      this.screenAcc += dt;
      if (this.screenAcc >= (this.quality === 'low' ? 0.16 : 0.1)) {
        this.screenAcc = 0;
        this._redrawScreens();
      }
    }

    this.liveScreens.forEach((screen, i) => {
      if (screen.boot < 1) {
        if (t > screen.bootDelay) screen.boot = clamp(screen.boot + dt * 1.7, 0, 1);
        const boot = easeOut(screen.boot);
        screen.screen.material.opacity = boot;
        screen.screen.scale.y = 0.004 + boot * 0.996;
        screen.scanMat.uniforms.uOpacity.value = boot;
      }

      const boot = easeOut(screen.boot);
      screen.frame.material.emissiveIntensity = 0.06 + 0.08 * Math.sin(t * 0.7 + i);
      screen.halo.material.opacity = 0.32 * boot;
      screen.pool.material.opacity = 0.24 * boot;
      screen.group.position.y = screen.slot.y + Math.sin(t * 0.9 + i * 1.7) * 0.012 * idle;
      screen.scanMat.uniforms.uTime.value = t;
    });

    if (this.particles) {
      this.particleMat.uniforms.uTime.value = t;
      this.particles.rotation.y = t * 0.012;
    }

    if (this.plant) {
      this.plant.rotation.z = Math.sin(t * 0.6) * 0.02 * idle;
    }

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          Object.values(m).forEach((v) => {
            if (v && v.isTexture) v.dispose();
          });
          m.dispose();
        });
      }
    });
    this.renderer.dispose();
  }
}
