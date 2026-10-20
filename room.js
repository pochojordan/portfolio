import * as THREE from 'three';

const WORKSPACE_BG = 0x06080f;
const PALETTE = ['#6366f1', '#a855f7', '#06b6d4', '#3b82f6'];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function hexToRgba(hex, a = 1) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mixHex(hex, target, amount) {
  const a = new THREE.Color(hex);
  const b = new THREE.Color(target);
  return `#${a.lerp(b, amount).getHexString()}`;
}

export class CyberpunkWorkspace {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.projects = opts.projects || [];
    this.onHover = opts.onHover || (() => {});
    this.onSelect = opts.onSelect || (() => {});
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.quality = this._quality();
    this.lang = opts.lang || 'es';

    this.interactives = [];
    this.monitors = [];
    this.screenSurfaces = [];

    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.scrollProgress = 0;
    this.hovered = null;
    this.focus = null;
    this.lookCurrent = new THREE.Vector3(0, 1.85, 0);
    this.lookTarget = new THREE.Vector3(0, 1.85, 0);

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.raf = 0;
    this.disposed = false;
    this.ready = false;
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
    this._buildMonitors();
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setClearColor(WORKSPACE_BG, 1);
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

  _computeSlots() {
    const n = this.projects.length;

    if (this.portrait) {
      const stacked = [
        { x: 0.05, z: -0.35, rot: -0.06, scale: 0.9 },
        { x: -1.15, z: -1.95, rot: 0.16, scale: 0.78 },
        { x: 1.25, z: -3.15, rot: -0.18, scale: 0.68 },
      ];
      return this.projects.map((_, i) => stacked[i] || {
        x: (i % 2 === 0 ? 0.2 : -0.8),
        z: -0.35 - i * 1.4,
        rot: i % 2 === 0 ? -0.05 : 0.14,
        scale: Math.max(0.5, 0.86 - i * 0.08),
      });
    }

    const layouts = {
      1: [{ x: 0, z: -0.3, rot: 0, scale: 1.05 }],
      2: [
        { x: -1.85, z: -0.15, rot: 0.14, scale: 1 },
        { x: 1.85, z: -0.4, rot: -0.14, scale: 0.94 },
      ],
      3: [
        { x: -2.5, z: -0.55, rot: 0.2, scale: 0.9 },
        { x: 0, z: -0.2, rot: 0, scale: 1.05 },
        { x: 2.5, z: -0.55, rot: -0.2, scale: 0.9 },
      ],
    };

    return layouts[n] || this.projects.map((_, i) => {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      return { x: t * 5.4, z: -0.3 - Math.abs(t) * 1.2, rot: -t * 0.5, scale: 1 - Math.abs(t) * 0.15 };
    });
  }

  _applyLayout() {
    const slots = this._computeSlots();
    this.monitors.forEach((monitor, i) => {
      const slot = slots[i] || slots[slots.length - 1];
      monitor.slot = slot;
      monitor.baseScale = slot.scale;
      monitor.group.position.set(slot.x, monitor.baseY, slot.z);
      monitor.group.rotation.y = slot.rot;
    });
  }

  _buildMonitors() {
    this.projects.forEach((project, i) => {
      const monitor = this._createMonitor(project, i);
      this.scene.add(monitor);
    });
    this._applyLayout();
  }

  _createMonitor(project, index) {
    const group = new THREE.Group();
    group.position.set(0, 2.45, -0.3);

    const accent = new THREE.Color(project.color);
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

    const screen = this._screenMesh(project);
    screen.position.z = D / 2 + 0.004;
    group.add(screen);

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

    const glow = new THREE.PointLight(accent, 5.5, 4.2, 2);
    glow.position.set(0, 0, 0.75);
    group.add(glow);

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.66, 0.025, 0.05),
      new THREE.MeshBasicMaterial({ color: accent, toneMapped: false })
    );
    strip.position.set(0, -(H / 2 + 0.16), 0.02);
    group.add(strip);

    const standMat = new THREE.MeshStandardMaterial({ color: 0x10151f, roughness: 0.45, metalness: 0.8 });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.48, 12), standMat);
    neck.position.y = -(H / 2 + 0.26);
    group.add(neck);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.05, 24), standMat);
    base.position.y = -(H / 2 + 0.5);
    group.add(base);

    const hitbox = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 0.5, H + 0.9),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.z = 0.05;
    group.add(hitbox);
    hitbox.userData.project = project;
    this.interactives.push(hitbox);

    const monitor = {
      group,
      frame,
      screen,
      halo,
      glow,
      strip,
      project,
      slot: null,
      index,
      baseScale: 1,
      hover: 0,
      boot: 0,
      bootDelay: index * 0.12,
      baseY: 2.45,
    };
    monitor.userData = { slug: project.slug };
    group.userData = { slug: project.slug };
    this.monitors.push(monitor);
    return group;
  }

  _screenMesh(project) {
    const W = 3.2;
    const H = 1.9;
    const surface = this._createScreenSurface(project);
    const mat = new THREE.MeshBasicMaterial({ map: surface.texture, toneMapped: false, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    mesh.scale.y = 0.004;

    const scanMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(project.color) },
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
    mesh.add(scan);

    this.screenSurfaces.push({ project, surface, material: mat, scanMat, mesh });
    return mesh;
  }

  _createScreenSurface(project) {
    const w = 1024;
    const h = 608;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    this._drawScreen(ctx, w, h, project);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return { canvas, ctx, texture, w, h };
  }

  _drawScreen(ctx, w, h, project) {
    const accent = project.color;
    const title = (project.title && (project.title[this.lang] || project.title.en)) || project.slug;
    const subtitle = (project.subtitle && (project.subtitle[this.lang] || project.subtitle.en)) || '';
    const tags = project.tags || [];

    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0a0f1e');
    bg.addColorStop(0.55, '#080b14');
    bg.addColorStop(1, mixHex(accent, '#080b14', 0.82));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.028)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fillRect(0, 0, w, 58);
    ctx.fillStyle = hexToRgba(accent, 0.9);
    ctx.beginPath();
    ctx.arc(34, 29, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(58, 29, 7, 0, Math.PI * 2);
    ctx.arc(82, 29, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '500 17px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(226,232,240,0.45)';
    ctx.fillText(`jordan.dev/portfolio/${project.slug}`, 110, 35);

    ctx.fillStyle = accent;
    ctx.fillRect(0, 58, 4, h - 58);

    ctx.font = '600 17px "JetBrains Mono", monospace';
    ctx.fillStyle = hexToRgba(accent, 0.85);
    ctx.fillText('// case study', 60, 126);

    ctx.fillStyle = '#f1f5ff';
    ctx.font = '700 62px "Space Grotesk", sans-serif';
    ctx.fillText(title, 60, 200, w - 120);

    ctx.fillStyle = 'rgba(148,163,184,0.9)';
    ctx.font = '400 24px "Space Grotesk", sans-serif';
    ctx.fillText(subtitle, 60, 244, w - 120);

    let px = 60;
    const py = 292;
    ctx.font = '600 15px "JetBrains Mono", monospace';
    tags.slice(0, 4).forEach((tag) => {
      const tw = ctx.measureText(tag).width;
      const boxW = tw + 28;
      ctx.fillStyle = hexToRgba(accent, 0.12);
      ctx.strokeStyle = hexToRgba(accent, 0.35);
      ctx.lineWidth = 1;
      this._rr(ctx, px, py, boxW, 34, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hexToRgba(accent, 0.95);
      ctx.fillText(tag, px + 14, py + 22);
      px += boxW + 10;
    });

    const codeX = 60;
    const codeY = 372;
    const rows = 7;
    ctx.font = '500 16px "JetBrains Mono", monospace';
    for (let i = 0; i < rows; i++) {
      const y = codeY + i * 30;
      ctx.fillStyle = 'rgba(99,102,241,0.18)';
      ctx.fillText(String(i + 1).padStart(2, '0'), codeX, y);
      const indent = (i % 3) * 24 + 42;
      const len = 140 + ((i * 97) % 420);
      ctx.fillStyle = i % 4 === 1 ? hexToRgba(accent, 0.75) : 'rgba(148,163,184,0.22)';
      ctx.fillRect(codeX + indent, y - 12, len, 9);
      if (i % 3 === 0) {
        ctx.fillStyle = 'rgba(6,182,212,0.5)';
        ctx.fillRect(codeX + indent + len + 12, y - 12, 58, 9);
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, h - 52, w, 1);
    ctx.font = '500 14px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(226,232,240,0.35)';
    ctx.fillText('© 2026 jjordan', 60, h - 22);
    ctx.fillStyle = hexToRgba(accent, 0.9);
    ctx.fillText('OPEN PROJECT  ↗', w - 250, h - 22);
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
    if (this.quality !== 'high' || this.reduced) return;
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
      if (this.portrait !== wasPortrait) this._applyLayout();
      this.renderer.setSize(w, h);
      if (this.composer) this.composer.setSize(w, h);
    };
    window.addEventListener('resize', this.onResize);

    this.onPointerMove = (e) => {
      this.pointerTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointerTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
      this.clientX = e.clientX;
      this.clientY = e.clientY;
    };
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });

    this.raycaster = new THREE.Raycaster();
    this._pointerNdc = new THREE.Vector2();

    this.onCanvasClick = () => {
      if (this.hovered) this.onSelect(this.hovered.project);
    };
    this.canvas.addEventListener('click', this.onCanvasClick);

    this.onContextLost = (e) => {
      e.preventDefault();
      document.body.classList.add('ws-lost');
    };
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);

    this.onPointerLeave = () => this._clearHover();
    document.addEventListener('pointerleave', this.onPointerLeave);
  }

  setScroll(progress) {
    this.scrollProgress = clamp(progress, 0, 1);
    if (this.scrollProgress > 0.02) {
      this._clearHover();
    }
  }

  _clearHover() {
    if (!this.hovered && this.canvas.style.cursor !== 'pointer') return;
    this.hovered = null;
    this.canvas.style.cursor = 'default';
    this.onHover(null);
  }

  setLanguage(lang) {
    if (lang === this.lang) return;
    this.lang = lang;
    this.screenSurfaces.forEach((s) => {
      this._drawScreen(s.surface.ctx, s.surface.w, s.surface.h, s.project);
      s.surface.texture.needsUpdate = true;
    });
  }

  refreshFonts() {
    this.screenSurfaces.forEach((s) => {
      this._drawScreen(s.surface.ctx, s.surface.w, s.surface.h, s.project);
      s.surface.texture.needsUpdate = true;
    });
  }

  focusProject(slug) {
    const monitor = this.monitors.find((m) => m.project.slug === slug);
    if (!monitor) return;
    const world = new THREE.Vector3();
    monitor.group.getWorldPosition(world);
    const dir = new THREE.Vector3().subVectors(world, this.camera.position).normalize();
    this.focus = {
      position: world.clone().addScaledVector(dir, -2.35).add(new THREE.Vector3(0, 0.18, 0)),
      look: world.clone(),
      t: 0,
    };
  }

  _updateHover() {
    if (!this.raycaster || this.clientX == null) return;
    if (this.scrollProgress > 0.02) {
      this._clearHover();
      return;
    }
    this.raycaster.setFromCamera(this._pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactives, false);
    const next = hits.length ? hits[0].object.userData.project : null;
    const changed = (next && next.slug) !== (this.hovered && this.hovered.project.slug);

    if (next) {
      if (!this.hovered || this.hovered.project.slug !== next.slug) {
        this.hovered = this.monitors.find((m) => m.project.slug === next.slug) || null;
      }
    } else {
      this.hovered = null;
    }

    this.canvas.style.cursor = next ? 'pointer' : 'default';

    if (changed) {
      this.onHover(next, this.clientX, this.clientY);
    }
  }

  _animate() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(() => this._animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    const t = this.elapsed;

    this.pointer.x += (this.pointerTarget.x - this.pointer.x) * (1 - Math.exp(-dt * 5));
    this.pointer.y += (this.pointerTarget.y - this.pointer.y) * (1 - Math.exp(-dt * 5));
    this._pointerNdc.set(this.pointerTarget.x, -this.pointerTarget.y);
    this._updateHover();

    const p = this.scrollProgress;
    const idle = this.reduced ? 0 : 1;

    let targetX = this.pointer.x * 0.55 * idle;
    let targetY = this.baseCam.y + p * 2.6 + this.pointer.y * -0.22 * idle;
    let targetZ = this.baseCam.z + p * 2.2;

    if (this.focus) {
      this.focus.t += dt * 1.6;
      const k = easeOut(clamp(this.focus.t, 0, 1));
      targetX = THREE.MathUtils.lerp(targetX, this.focus.position.x, k);
      targetY = THREE.MathUtils.lerp(targetY, this.focus.position.y, k);
      targetZ = THREE.MathUtils.lerp(targetZ, this.focus.position.z, k);
      this.lookTarget.lerp(this.focus.look, k * 0.5);
    } else {
      this.lookTarget.set(targetX * 0.25, this.baseLook.y - p * 0.55, this.baseLook.z);
    }

    const damp = 1 - Math.exp(-dt * 4.5);
    this.camera.position.x += (targetX - this.camera.position.x) * damp;
    this.camera.position.y += (targetY - this.camera.position.y) * damp;
    this.camera.position.z += (targetZ - this.camera.position.z) * damp;

    this.lookCurrent.lerp(this.lookTarget, 1 - Math.exp(-dt * 4));
    this.camera.lookAt(this.lookCurrent);

    this.monitors.forEach((m) => {
      if (m.boot < 1) {
        if (t > m.bootDelay) m.boot = clamp(m.boot + dt * 1.7, 0, 1);
        const boot = easeOut(m.boot);
        m.screen.material.opacity = boot;
        m.screen.scale.y = 0.004 + boot * 0.996;
        const scanBoot = m.screen.children[0];
        if (scanBoot) scanBoot.material.uniforms.uOpacity.value = boot;
      }

      const boot = easeOut(m.boot);
      const isHover = this.hovered === m;

      m.hover += ((isHover ? 1 : 0) - m.hover) * (1 - Math.exp(-dt * 9));
      m.group.scale.setScalar(m.baseScale * (1 + m.hover * 0.035));
      m.frame.material.emissiveIntensity = 0.06 + m.hover * 0.4;
      m.halo.material.opacity = (0.32 + m.hover * 0.22) * boot;
      m.glow.intensity = (5.5 + m.hover * 6) * boot;
      m.screen.material.color.setScalar(1 + m.hover * 0.35);
      m.group.position.y = m.baseY + Math.sin(t * 0.9 + m.index * 1.7) * 0.015 * idle;

      const scan = m.screen.children[0];
      if (scan) scan.material.uniforms.uTime.value = t;
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
    document.removeEventListener('pointerleave', this.onPointerLeave);
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
