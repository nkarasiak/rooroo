import * as THREE from 'three';

const _colliders = [];

export function getColliders() { return _colliders; }

// Register a static AABB collider (no mesh needed — controller only uses aabb)
function addAABB(x0, y0, z0, x1, y1, z1) {
  _colliders.push({
    aabb: new THREE.Box3(
      new THREE.Vector3(x0, y0, z0),
      new THREE.Vector3(x1, y1, z1)
    )
  });
}

function makeMesh(geo, color, x, y, z, cast = true, receive = true) {
  const mat = new THREE.MeshLambertMaterial({ color });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function box(w, h, d, color, x, y, z, cast, receive) {
  return makeMesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, cast, receive);
}

function addWindows(scene, bx, by, bz, bw, bh, bd) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xf0e090, emissive: 0xc09020, emissiveIntensity: 0.35 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x223355, emissive: 0x112244, emissiveIntensity: 0.2 });
  const cols = 3, rows = Math.floor(bh / 3);
  const wW = 0.7, wH = 0.85;
  const spacingX = bw / (cols + 1);
  const spacingY = 2.5;
  const startX = bx - bw / 2 + spacingX;
  const startY = 1.5;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() > 0.25;
      const geo = new THREE.PlaneGeometry(wW, wH);
      const m = new THREE.Mesh(geo, lit ? mat : darkMat);
      m.position.set(startX + c * spacingX, startY + r * spacingY, bz + bd / 2 + 0.02);
      scene.add(m);
    }
  }
}

function addGarbageBin(scene, x, z) {
  const body = makeMesh(
    new THREE.CylinderGeometry(0.38, 0.30, 1.0, 10),
    0x3a5c3a, x, 0.5, z
  );
  scene.add(body);

  const lid = box(0.84, 0.1, 0.84, 0x2a4a2a, x, 1.05, z);
  scene.add(lid);

  // Collidable solid: block XZ approach + pigeon can land on lid (top = 1.1)
  addAABB(x - 0.42, 0, z - 0.42,  x + 0.42, 1.1, z + 0.42);
}

function addGarbageBag(scene, x, z) {
  const geo = new THREE.SphereGeometry(0.32, 8, 7);
  geo.scale(1.0, 0.75, 1.2);
  // Zero red → uvChan = 1.0 in shader → appears vivid cyan-blue in UV mode.
  // Bright enough to be identifiable in human vision too (dark teal plastic bag).
  const mat = new THREE.MeshLambertMaterial({
    color: 0x009966,
    emissive: 0x002211,
    emissiveIntensity: 0.3,
  });
  const bag = new THREE.Mesh(geo, mat);
  bag.position.set(x, 0.24, z);
  bag.castShadow = true;
  bag.userData.isFood = true;
  bag.userData.uvReflective = true;
  scene.add(bag);
  return bag;
}

function addBench(scene, x, z) {
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5914 });
  const metal = new THREE.MeshLambertMaterial({ color: 0x505050 });
  // Seat: pigeon lands on top (y=0.52), blocked from walking through
  addAABB(x - 1.05, 0, z - 0.42,  x + 1.05, 0.52, z + 0.42);
  // Backrest: wall blocker (pigeon can't fly through backrest)
  addAABB(x - 1.05, 0, z - 0.55,  x + 1.05, 1.1, z - 0.38);

  // Seat slats
  for (let i = -1; i <= 1; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.22), wood);
    slat.position.set(x, 0.48, z + i * 0.26);
    slat.castShadow = true;
    scene.add(slat);
  }
  // Backrest slats
  for (let i = 0; i < 2; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.22), wood);
    slat.position.set(x, 0.82 + i * 0.22, z - 0.46);
    slat.rotation.x = 0.15;
    slat.castShadow = true;
    scene.add(slat);
  }
  // Legs
  for (const lx of [-0.85, 0.85]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.8), metal);
    leg.position.set(x + lx, 0.24, z);
    scene.add(leg);
  }
}

export function buildWorld(scene) {
  _colliders.length = 0;

  // Asphalt ground
  const ground = box(70, 0.2, 70, 0x3c3c3c, 0, -0.1, 0, false, true);
  scene.add(ground);

  // Sidewalks
  const swMat = new THREE.MeshLambertMaterial({ color: 0xb0a898 });
  const sidewalks = [
    [70, 0.22, 7,  0, 0, -17.5],
    [70, 0.22, 7,  0, 0,  17.5],
    [7,  0.22, 70, -17.5, 0, 0],
    [7,  0.22, 70,  17.5, 0, 0],
  ];
  for (const [w, h, d, x, y, z] of sidewalks) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), swMat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
  }

  // Curb edges
  const curbMat = new THREE.MeshLambertMaterial({ color: 0x888080 });
  const curbs = [
    [70, 0.12, 0.3, 0, 0.05, -14],
    [70, 0.12, 0.3, 0, 0.05,  14],
    [0.3, 0.12, 70, -14, 0.05, 0],
    [0.3, 0.12, 70,  14, 0.05, 0],
  ];
  for (const [w, h, d, x, y, z] of curbs) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), curbMat);
    m.position.set(x, y, z);
    scene.add(m);
  }

  // Road markings (dashed center line)
  const markMat = new THREE.MeshLambertMaterial({ color: 0xeeeecc });
  for (let i = -5; i <= 5; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 2.5), markMat);
    m.position.set(0, 0.01, i * 4.5);
    scene.add(m);
  }

  // 4 Buildings
  const buildings = [
    { w: 14, h: 22, d: 14, color: 0x8b7a5c, x: -23, z: -23 },
    { w: 12, h: 18, d: 12, color: 0x7a8b9c, x:  23, z: -23 },
    { w: 14, h: 28, d: 14, color: 0x9c8870, x: -23, z:  23 },
    { w: 12, h: 20, d: 12, color: 0x6b7c60, x:  23, z:  23 },
  ];
  for (const { w, h, d, color, x, z } of buildings) {
    const b = box(w, h, d, color, x, h / 2, z);
    scene.add(b);
    _colliders.push({ mesh: b, aabb: new THREE.Box3().setFromObject(b) });
    addWindows(scene, x, h / 2, z, w, h, d);

    // Rooftop lip
    const lip = box(w + 0.4, 0.4, d + 0.4, 0x555555, x, h + 0.2, z);
    scene.add(lip);
  }

  // Street lamp posts
  for (const [x, z] of [[-11, -13], [11, -13], [-11, 13], [11, 13]]) {
    const pole = box(0.12, 4.5, 0.12, 0x444444, x, 2.25, z);
    scene.add(pole);
    const head = box(0.8, 0.2, 0.3, 0x666666, x, 4.7, z);
    scene.add(head);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0xffffd0, emissive: 0xffffaa, emissiveIntensity: 1 })
    );
    bulb.position.set(x, 4.55, z + 0.1);
    scene.add(bulb);
  }

  // Garbage bins
  addGarbageBin(scene, -8, -13);
  addGarbageBin(scene,  8,  13);

  // Garbage bags — food targets (glow in UV vision)
  addGarbageBag(scene, -6.5, -11.5);
  addGarbageBag(scene,  9.5,  13.8);
  addGarbageBag(scene, -5.0, -12.0);

  // Bench on south sidewalk
  addBench(scene, 0, -15.5);

  // Puddle — UV reflective
  const puddleGeo = new THREE.CircleGeometry(1.0, 16);
  const puddleMat = new THREE.MeshLambertMaterial({
    color: 0x3355aa,
    transparent: true,
    opacity: 0.55,
  });
  const puddle = new THREE.Mesh(puddleGeo, puddleMat);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(4, 0.02, 5);
  puddle.userData.uvReflective = true;
  scene.add(puddle);

  // Some loose gravel/pebbles
  const pebbleMat = new THREE.MeshLambertMaterial({ color: 0x888070 });
  for (let i = 0; i < 20; i++) {
    const r = 0.04 + Math.random() * 0.06;
    const peb = new THREE.Mesh(new THREE.SphereGeometry(r, 4, 3), pebbleMat);
    peb.position.set(
      (Math.random() - 0.5) * 24,
      r * 0.5,
      (Math.random() - 0.5) * 24
    );
    scene.add(peb);
  }
}
