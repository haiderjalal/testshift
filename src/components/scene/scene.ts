import gsap from "gsap";
import * as THREE from "three";

import { clamp, damp, lerp } from "@/lib/motion/math";
import { AGENT_POSITIONS, stagePose } from "@/lib/story/poses";
import { live, story, target } from "@/lib/story/sceneState";

/**
 * The page-wide 3D scene: four agent cores on a glowing pipeline with test packets flowing through it.
 * It does not decide where to look. The scroll story (`StoryDriver`) writes a target pose and the scene eases
 * toward it: camera, brightness, which agent is lit. Pages without a story name a stage on `<html data-stage>`
 * instead. Imperative three.js, started once per page, ticking on GSAP's clock with scroll and smooth scrolling.
 */

const AGENT_STYLE = [
  { id: "dev", color: 0x45d4ff },
  { id: "staging", color: 0xa07cff },
  { id: "uat", color: 0xff6fd1 },
  { id: "prod", color: 0xff9f43 },
] as const;
const AGENTS = AGENT_STYLE.map((agent, i) => ({ ...agent, position: new THREE.Vector3(...AGENT_POSITIONS[i]) }));

const PACKETS = 26;
const BACKGROUND = 0x090d18; // brand navy, same as --color-paper

/** How fast (per second) the scene closes the gap to the story's pose. */
const CAMERA_EASE = 2.2;
const DIM_EASE = 2.4;
const FOCUS_EASE = 5;
const PULSE_DECAY = 3;
/** How far back the camera starts on load, in scene units, before it flies in. */
const INTRO_DISTANCE = 8;
const INTRO_SESSION_KEY = "testshift:intro-seen";

function glowTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.22, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

/** Each agent gets its own solid: Dev icosahedron, Staging octahedron, UAT torus knot, Prod dodecahedron. */
function coreGeometry(id: (typeof AGENTS)[number]["id"]): { core: THREE.BufferGeometry; shell: THREE.BufferGeometry } {
  switch (id) {
    case "dev":
      return { core: new THREE.IcosahedronGeometry(0.85, 0), shell: new THREE.IcosahedronGeometry(1.3, 0) };
    case "staging":
      return { core: new THREE.OctahedronGeometry(0.95, 0), shell: new THREE.OctahedronGeometry(1.45, 0) };
    case "uat":
      return { core: new THREE.TorusKnotGeometry(0.52, 0.17, 110, 14), shell: new THREE.IcosahedronGeometry(1.3, 1) };
    case "prod":
      return { core: new THREE.DodecahedronGeometry(0.9, 0), shell: new THREE.DodecahedronGeometry(1.35, 0) };
  }
}

/** Colour along the pipeline, blending between neighbouring agents. `t` uses the curve's point parameter. */
function colorAt(t: number, agentT: number[]): THREE.Color {
  const colors = AGENTS.map((a) => new THREE.Color(a.color));
  if (t <= agentT[0]) return colors[0];
  for (let i = 0; i < agentT.length - 1; i++) {
    if (t <= agentT[i + 1]) return colors[i].clone().lerp(colors[i + 1], (t - agentT[i]) / (agentT[i + 1] - agentT[i]));
  }
  return colors[colors.length - 1];
}

export function startScene(canvas: HTMLCanvasElement): () => void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = window.innerWidth < 768;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.25 : 1.75));
  renderer.setClearColor(BACKGROUND, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BACKGROUND, 0.022);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);

  scene.add(new THREE.AmbientLight(0x8090c0, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(4, 8, 6);
  scene.add(key);

  // Pipeline: a curve through the four agents, drawn as a colour-blended tube plus a soft glow tube.
  const curvePoints = [new THREE.Vector3(-11, 1.4, 3.5), ...AGENTS.map((a) => a.position), new THREE.Vector3(11, 0.2, -6)];
  const curve = new THREE.CatmullRomCurve3(curvePoints);
  const agentT = AGENTS.map((_, i) => (i + 1) / (curvePoints.length - 1));

  const tubular = 360;
  const radial = 8;
  const tubeColors = (geometry: THREE.TubeGeometry) => {
    const colors: number[] = [];
    for (let j = 0; j <= tubular; j++) {
      const c = colorAt(j / tubular, agentT);
      for (let k = 0; k <= radial; k++) colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  };
  const tube = new THREE.Mesh(
    tubeColors(new THREE.TubeGeometry(curve, tubular, 0.035, radial)),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }),
  );
  const glowTube = new THREE.Mesh(
    tubeColors(new THREE.TubeGeometry(curve, tubular, 0.16, radial)),
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  scene.add(tube, glowTube);

  // Agent cores: faceted solid, counter-rotating wire shell, orbit ring, additive halo and a coloured light.
  const glow = glowTexture();
  const cores = AGENTS.map((agent) => {
    const { core: coreGeo, shell: shellGeo } = coreGeometry(agent.id);
    const group = new THREE.Group();
    group.position.copy(agent.position);
    const core = new THREE.Mesh(
      coreGeo,
      new THREE.MeshStandardMaterial({
        color: agent.color,
        emissive: agent.color,
        emissiveIntensity: 0.42,
        metalness: 0.65,
        roughness: 0.28,
        flatShading: true,
      }),
    );
    const shell = new THREE.LineSegments(
      new THREE.EdgesGeometry(shellGeo),
      new THREE.LineBasicMaterial({ color: agent.color, transparent: true, opacity: 0.55 }),
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.85, 0.012, 6, 120),
      new THREE.MeshBasicMaterial({ color: agent.color, transparent: true, opacity: 0.45 }),
    );
    ring.rotation.x = Math.PI * 0.42;
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        color: agent.color,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.scale.setScalar(5);
    const light = new THREE.PointLight(agent.color, 14, 10, 2);
    light.position.set(0, 0.5, 1.8);
    group.add(halo, core, shell, ring, light);
    scene.add(group);
    return { id: agent.id, group, core, shell, ring, halo, scale: 1 };
  });

  // Test packets travelling the pipeline, coloured by the stretch they are on.
  const packets = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.07, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    PACKETS,
  );
  const packetT = Array.from({ length: PACKETS }, (_, i) => i / PACKETS);
  const packetSpeed = Array.from({ length: PACKETS }, () => 0.018 + Math.random() * 0.02);
  scene.add(packets);

  // Dust field and a lab floor grid that fades into the fog.
  const dustCount = small ? 500 : 1400;
  const dust = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dust[i * 3] = (Math.random() - 0.5) * 70;
    dust[i * 3 + 1] = Math.random() * 22 - 9;
    dust[i * 3 + 2] = Math.random() * -34 + 9;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3));
  const particles = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0x9fb3d9, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  scene.add(particles);

  const grid = new THREE.GridHelper(140, 140, 0x22314f, 0x111a2c);
  grid.position.y = -4.2;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.55;
  scene.add(grid);

  const lookAt = new THREE.Vector3();
  const pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
  let needsRender = true;

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    needsRender = true;
  };
  const onPointer = (e: PointerEvent) => {
    pointer.x = e.clientX / window.innerWidth - 0.5;
    pointer.y = e.clientY / window.innerHeight - 0.5;
  };
  resize();
  window.addEventListener("resize", resize);
  if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });

  // The scene opens on its first pose, pulled back, and flies in. A returning visitor in the same session gets it faster.
  let returning = false;
  try {
    returning = window.sessionStorage.getItem(INTRO_SESSION_KEY) === "1";
    window.sessionStorage.setItem(INTRO_SESSION_KEY, "1");
  } catch {
    // Storage can be blocked; the intro just plays at full length.
  }
  const initial = story.active ? target : stagePose(document.documentElement.dataset.stage, camera.aspect < 1);
  live.pos = [initial.pos[0], initial.pos[1], initial.pos[2]];
  live.look = [initial.look[0], initial.look[1], initial.look[2]];
  live.focus = initial.focus;
  live.dim = 0;
  live.intro = reduced ? 0 : 1;
  if (!reduced) gsap.to(live, { intro: 0, duration: returning ? 1.4 : 2.8, delay: 0.15, ease: "power3.out" });

  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const packetColor = new THREE.Color();
  const lastGoal = new Float32Array(9).fill(Number.NaN);
  let writtenDim = -1;
  let firstFrame = true;

  /** True when the story's pose differs from the one last drawn. Only used with reduced motion, which draws on change. */
  const goalChanged = (pos: readonly number[], look: readonly number[], dim: number, focus: number): boolean => {
    const next = [pos[0], pos[1], pos[2], look[0], look[1], look[2], dim, focus, story.agentOverride ?? -2];
    let changed = false;
    next.forEach((value, i) => {
      if (lastGoal[i] !== value) changed = true;
      lastGoal[i] = value;
    });
    return changed;
  };

  const tick = (time: number, deltaMs: number) => {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const goal = story.active ? target : stagePose(document.documentElement.dataset.stage, camera.aspect < 1);
    // Outside the landing page the scene is always a backdrop, never the show.
    const goalDim = story.active ? goal.dim : Math.min(goal.dim, story.pageDim);

    // With reduced motion nothing moves: draw only when the pose or the window changes, and cut instead of flying.
    if (reduced && !needsRender && !firstFrame && !goalChanged(goal.pos, goal.look, goalDim, goal.focus)) return;
    needsRender = false;

    const ease = (rate: number) => (reduced ? 1 : 1 - Math.exp(-rate * dt));
    const k = ease(CAMERA_EASE);
    for (let axis = 0; axis < 3; axis++) {
      live.pos[axis] += (goal.pos[axis] - live.pos[axis]) * k;
      live.look[axis] += (goal.look[axis] - live.look[axis]) * k;
    }
    live.dim += (goalDim - live.dim) * ease(DIM_EASE);
    live.focus += (goal.focus - live.focus) * ease(FOCUS_EASE);
    live.pulse = live.pulse < 0.01 ? 0 : damp(live.pulse, 0, PULSE_DECAY, dt);

    pointer.smoothX = damp(pointer.smoothX, pointer.x, 3, dt);
    pointer.smoothY = damp(pointer.smoothY, pointer.y, 3, dt);
    camera.position.set(
      live.pos[0] + pointer.smoothX * 1.4,
      live.pos[1] - pointer.smoothY * 0.8 + live.intro * 2,
      live.pos[2] + live.intro * INTRO_DISTANCE,
    );
    lookAt.set(live.look[0], live.look[1], live.look[2]);
    camera.lookAt(lookAt);

    // The story's dim dial reaches CSS as a variable (see canvas[data-scene] in globals.css).
    if (firstFrame || Math.abs(live.dim - writtenDim) > 0.003) {
      canvas.style.setProperty("--scene-dim", live.dim.toFixed(3));
      writtenDim = live.dim;
    }

    // Agent cores: the lit agent grows and glows, the others step back. `focus` is a float, so a tour glides between them.
    const anyFocus = clamp(live.focus + 1, 0, 1);
    for (const [i, c] of cores.entries()) {
      const weight = clamp(1 - Math.abs(live.focus - i), 0, 1);
      const targetScale = lerp(1, lerp(0.85, 1.35, weight), anyFocus);
      c.scale += (targetScale - c.scale) * (reduced ? 1 : Math.min(1, dt * 4));
      c.group.scale.setScalar(c.scale);
      (c.halo.material as THREE.SpriteMaterial).opacity = lerp(0.45, lerp(0.25, 0.85, weight), anyFocus) + live.pulse * 0.4;
      if (!reduced) {
        c.core.rotation.y += dt * 0.45;
        c.core.rotation.x += dt * 0.18;
        c.shell.rotation.y -= dt * 0.25;
        c.ring.rotation.z += dt * (0.3 + i * 0.05);
        c.group.position.y = AGENTS[i].position.y + Math.sin(time * 0.9 + i * 1.7) * 0.18;
      }
    }

    const packetBoost = 1 + live.pulse * 3;
    for (let i = 0; i < PACKETS; i++) {
      if (!reduced) packetT[i] = (packetT[i] + packetSpeed[i] * packetBoost * dt) % 1;
      curve.getPoint(packetT[i], point);
      const pulse = 0.8 + Math.sin(time * 6 + i) * 0.35;
      matrix.makeScale(pulse, pulse, pulse).setPosition(point);
      packets.setMatrixAt(i, matrix);
      packets.setColorAt(i, packetColor.copy(colorAt(packetT[i], agentT)).multiplyScalar(1.6 + live.pulse * 1.2));
    }
    packets.instanceMatrix.needsUpdate = true;
    if (packets.instanceColor) packets.instanceColor.needsUpdate = true;

    if (!reduced) particles.rotation.y = time * 0.01;

    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      canvas.dataset.ready = "true";
    }
  };
  gsap.ticker.add(tick);

  return () => {
    gsap.ticker.remove(tick);
    gsap.killTweensOf(live);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointer);
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
    glow.dispose();
    renderer.dispose();
  };
}
