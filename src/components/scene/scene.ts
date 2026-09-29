import * as THREE from "three";

/**
 * The page-wide 3D scene: four agent cores on a glowing pipeline with test packets flowing through it.
 * The camera follows `<html data-stage>`: "hero" frames the whole pipeline, an agent id flies to that
 * agent, anything else pulls back to an overview. Imperative three.js, started once per page.
 */

const AGENTS = [
  { id: "dev", color: 0x45d4ff, position: new THREE.Vector3(-4.8, 0.5, 0.4) },
  { id: "staging", color: 0xa07cff, position: new THREE.Vector3(-1.6, -0.7, -2.6) },
  { id: "uat", color: 0xff6fd1, position: new THREE.Vector3(1.6, 0.7, -0.8) },
  { id: "prod", color: 0xff9f43, position: new THREE.Vector3(4.8, -0.4, -3.2) },
] as const;

const PACKETS = 26;
const BACKGROUND = 0x05070d;

interface Shot {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

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

  // Camera shots per stage. Agents sit right of centre so section text can live on the left.
  const shot = (stage: string | undefined, aspect: number): Shot => {
    const narrow = aspect < 1;
    const agent = AGENTS.find((a) => a.id === stage);
    if (agent) {
      if (narrow) {
        return { position: agent.position.clone().add(new THREE.Vector3(0, 1.8, 11)), target: agent.position.clone() };
      }
      // Camera sits to the agent's right and looks past it to the left, so the agent lands right of centre
      // and the agents before it stay behind the text panel instead of between the camera and the focus.
      return {
        position: agent.position.clone().add(new THREE.Vector3(1.2, 2.2, 9)),
        target: agent.position.clone().add(new THREE.Vector3(-3.4, -0.2, 0)),
      };
    }
    if (stage === "hero") {
      return narrow
        ? { position: new THREE.Vector3(0, 8, 34), target: new THREE.Vector3(0, 7, 0) }
        : { position: new THREE.Vector3(-6.5, 2.6, 18.5), target: new THREE.Vector3(-6.5, 2.1, 0) };
    }
    return { position: new THREE.Vector3(0, 7.5, narrow ? 32 : 22), target: new THREE.Vector3(0, -1, -1) };
  };

  const current = shot("hero", 16 / 9);
  camera.position.copy(current.position);
  const lookAt = current.target.clone();
  const pointer = { x: 0, y: 0 };

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  const onPointer = (e: PointerEvent) => {
    pointer.x = e.clientX / window.innerWidth - 0.5;
    pointer.y = e.clientY / window.innerHeight - 0.5;
  };
  resize();
  window.addEventListener("resize", resize);
  if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });

  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const clock = new THREE.Clock();
  let lastStage: string | undefined = "__none";
  let firstFrame = true;

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    const stage = document.documentElement.dataset.stage;

    // With reduced motion, nothing moves: render only when the stage changes, and cut instead of flying.
    if (reduced && stage === lastStage && !firstFrame) return;
    lastStage = stage;

    const goal = shot(stage, camera.aspect);
    const ease = reduced ? 1 : 1 - Math.exp(-dt * 2.2);
    goal.position.x += pointer.x * 1.4;
    goal.position.y -= pointer.y * 0.8;
    camera.position.lerp(goal.position, ease);
    lookAt.lerp(goal.target, ease);
    camera.lookAt(lookAt);

    const focused = AGENTS.some((a) => a.id === stage);
    for (const [i, c] of cores.entries()) {
      const active = c.id === stage;
      const targetScale = active ? 1.35 : focused ? 0.85 : 1;
      c.scale += (targetScale - c.scale) * (reduced ? 1 : Math.min(1, dt * 4));
      c.group.scale.setScalar(c.scale);
      (c.halo.material as THREE.SpriteMaterial).opacity = active ? 0.85 : focused ? 0.25 : 0.45;
      if (!reduced) {
        c.core.rotation.y += dt * 0.45;
        c.core.rotation.x += dt * 0.18;
        c.shell.rotation.y -= dt * 0.25;
        c.ring.rotation.z += dt * (0.3 + i * 0.05);
        c.group.position.y = AGENTS[i].position.y + Math.sin(time * 0.9 + i * 1.7) * 0.18;
      }
    }

    for (let i = 0; i < PACKETS; i++) {
      if (!reduced) packetT[i] = (packetT[i] + packetSpeed[i] * dt) % 1;
      curve.getPoint(packetT[i], point);
      const pulse = 0.8 + Math.sin(time * 6 + i) * 0.35;
      matrix.makeScale(pulse, pulse, pulse).setPosition(point);
      packets.setMatrixAt(i, matrix);
      packets.setColorAt(i, colorAt(packetT[i], agentT).multiplyScalar(1.6));
    }
    packets.instanceMatrix.needsUpdate = true;
    if (packets.instanceColor) packets.instanceColor.needsUpdate = true;

    if (!reduced) particles.rotation.y = time * 0.01;

    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      canvas.dataset.ready = "true";
    }
  });

  return () => {
    renderer.setAnimationLoop(null);
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
