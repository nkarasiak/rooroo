import * as THREE from 'three';

const WALK_SPEED = 4.5;
const FLY_SPEED = 9;
const FLAP_FORCE = 6.5;
const GRAVITY = 14;
const EYE_HEIGHT = 0.28;
const BODY_RADIUS = 0.22;
const WORLD_BOUND = 30;
const WING_FLAP_HZ = 7;

const State = { WALKING: 'WALKING', FLYING: 'FLYING', PECKING: 'PECKING' };

export class PigeonController {
  constructor(camera, scene, colliders, audio) {
    this.camera = camera;
    this.scene = scene;
    this.colliders = colliders;  // [{ mesh, aabb }]
    this.audio = audio;

    this.state = State.WALKING;
    this.vel = new THREE.Vector3();
    this.pos = new THREE.Vector3(0, EYE_HEIGHT, 2);
    this.yaw = 0;
    this.pitch = 0;

    this.pigeonVisionOn = false;
    this.thirdPerson = false;
    this.peckTimer = 0;
    this.bobTime = 0;
    this.wingTime = 0;
    this.isMoving = false;
    this._surfaceY = 0;   // Y of surface currently standing on

    this.keys = new Set();

    this.pigeonMesh = buildPigeonMesh();
    scene.add(this.pigeonMesh);
    this.pigeonMesh.visible = false;

    this._setupInput();
    this._updateHUD();
  }

  _setupInput() {
    const overlay = document.getElementById('overlay');

    overlay.addEventListener('click', () => {
      this.audio.init();
      document.body.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      overlay.classList.toggle('hidden', !!document.pointerLockElement);
    });

    document.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch - e.movementY * 0.0022));
    });

    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') { e.preventDefault(); this._jump(); }
      if (e.code === 'KeyE') this._peck();
      if (e.code === 'KeyV') this._toggleVision();
      if (e.code === 'KeyC') this._toggleCamera();
    });

    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  _jump() {
    if (this.state !== State.FLYING) {
      this.state = State.FLYING;
      this.vel.y = FLAP_FORCE;
      this.audio.flap();
      // Random coo on takeoff
      if (Math.random() < 0.4) setTimeout(() => this.audio.coo(), 200);
    } else {
      this.vel.y = Math.max(this.vel.y + 2, FLAP_FORCE * 0.6);
      this.audio.flap();
    }
    this._updateHUD();
  }

  _peck() {
    if (this.state !== State.WALKING) return;
    this.state = State.PECKING;
    this.peckTimer = 0.5;
    this.audio.peck();
    this._updateHUD();
  }

  _toggleVision() {
    this.pigeonVisionOn = !this.pigeonVisionOn;
    document.dispatchEvent(new CustomEvent('pigeonVision', { detail: this.pigeonVisionOn }));
    this._updateHUD();
  }

  _toggleCamera() {
    this.thirdPerson = !this.thirdPerson;
    this.pigeonMesh.visible = this.thirdPerson;
    this._updateHUD();
  }

  _updateHUD() {
    document.getElementById('hud-state').textContent = this.state;
    document.getElementById('hud-vision').textContent =
      this.pigeonVisionOn ? 'PIGEON VISION (UV)' : 'HUMAN VISION';
    document.getElementById('hud-camera').textContent =
      this.thirdPerson ? '3RD PERSON' : 'FPV';
  }

  // Returns the Y coordinate of the highest surface directly below current XZ position.
  // Ground = 0, building rooftops = aabb.max.y.
  _getSurfaceY() {
    let surfY = 0;
    const px = this.pos.x;
    const pz = this.pos.z;

    for (const { aabb } of this.colliders) {
      if (px > aabb.min.x - BODY_RADIUS && px < aabb.max.x + BODY_RADIUS &&
          pz > aabb.min.z - BODY_RADIUS && pz < aabb.max.z + BODY_RADIUS) {
        // Pigeon is over this building's XZ footprint — its roof is a valid surface
        if (surfY < aabb.max.y) surfY = aabb.max.y;
      }
    }

    return surfY;
  }

  update(dt) {
    if (this.peckTimer > 0) {
      this.peckTimer -= dt;
      if (this.peckTimer <= 0) {
        this.state = State.WALKING;
        this._updateHUD();
      }
    }

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right   = new THREE.Vector3( Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    if (this.state !== State.FLYING) {
      // --- WALK / PECK ---
      const move = new THREE.Vector3();
      if (this.keys.has('KeyW')) move.addScaledVector(forward, WALK_SPEED);
      if (this.keys.has('KeyS')) move.addScaledVector(forward, -WALK_SPEED);
      if (this.keys.has('KeyA')) move.addScaledVector(right, -WALK_SPEED);
      if (this.keys.has('KeyD')) move.addScaledVector(right, WALK_SPEED);

      this.isMoving = move.lengthSq() > 0;
      if (this.isMoving) this.bobTime += dt * 9;

      this.pos.x += move.x * dt;
      this.pos.z += move.z * dt;
      this._resolveXZ();

      const newSurfY = this._getSurfaceY();

      // Walked off an elevated edge — start falling
      if (newSurfY < this._surfaceY - 0.4) {
        this.state = State.FLYING;
        this.vel.set(0, -0.5, 0);
        this._surfaceY = newSurfY;
        this._updateHUD();
      } else {
        this._surfaceY = newSurfY;
        const bob = this.isMoving ? Math.sin(this.bobTime) * 0.035 : 0;
        const peckDip = this.state === State.PECKING
          ? Math.sin(Math.max(0, (0.5 - this.peckTimer) / 0.5) * Math.PI) * 0.18
          : 0;
        this.pos.y = this._surfaceY + EYE_HEIGHT + bob - peckDip;
      }

    } else {
      // --- FLY ---
      this.vel.y -= GRAVITY * dt;
      this.wingTime += dt;

      const flyDir = new THREE.Vector3(
        -Math.sin(this.yaw) * Math.cos(this.pitch),
         Math.sin(this.pitch),
        -Math.cos(this.yaw) * Math.cos(this.pitch)
      );

      if (this.keys.has('KeyW')) {
        this.vel.x += (flyDir.x * FLY_SPEED - this.vel.x) * dt * 4;
        this.vel.z += (flyDir.z * FLY_SPEED - this.vel.z) * dt * 4;
      } else if (this.keys.has('KeyS')) {
        this.vel.x *= 1 - dt * 3;
        this.vel.z *= 1 - dt * 3;
      } else {
        this.vel.x *= 1 - dt * 1.5;
        this.vel.z *= 1 - dt * 1.5;
      }

      this.pos.addScaledVector(this.vel, dt);
      this._resolveXZ();

      const surfY = this._getSurfaceY();

      if (this.pos.y <= surfY + EYE_HEIGHT && this.vel.y <= 0) {
        // Land on whatever surface is below
        this.pos.y = surfY + EYE_HEIGHT;
        this._surfaceY = surfY;
        this.vel.set(0, 0, 0);
        this.state = State.WALKING;
        this.audio.land();
        this._updateHUD();
      }

      // Animate wings (third person)
      if (this.thirdPerson) {
        const wings = this.pigeonMesh.userData.wings;
        const flapAngle = Math.sin(this.wingTime * WING_FLAP_HZ * Math.PI * 2) * 0.55;
        wings[0].rotation.z =  0.2 + flapAngle;
        wings[1].rotation.z = -0.2 - flapAngle;
        // Slight body pitch during flight
        this.pigeonMesh.rotation.x = Math.max(-0.35, Math.min(0.35, this.pitch * 0.6));
      }
    }

    // Reset wing rest position when not flying in 3rd person
    if (this.state !== State.FLYING && this.thirdPerson) {
      const wings = this.pigeonMesh.userData.wings;
      wings[0].rotation.z += (0.2 - wings[0].rotation.z) * 0.15;
      wings[1].rotation.z += (-0.2 - wings[1].rotation.z) * 0.15;
      this.pigeonMesh.rotation.x *= 0.9;
    }

    this.pos.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, this.pos.x));
    this.pos.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, this.pos.z));

    this._applyCamera();
  }

  _resolveXZ() {
    const p = this.pos;
    for (const { aabb } of this.colliders) {
      // Skip if pigeon is above this surface (on top of it or flying over)
      if (p.y >= aabb.max.y + EYE_HEIGHT - 0.05) continue;

      // Pure XZ range check — avoids the Y-trick bug with short objects
      const cx = (aabb.min.x + aabb.max.x) / 2;
      const cz = (aabb.min.z + aabb.max.z) / 2;
      const halfW = (aabb.max.x - aabb.min.x) / 2 + BODY_RADIUS;
      const halfD = (aabb.max.z - aabb.min.z) / 2 + BODY_RADIUS;
      const dx = Math.abs(p.x - cx);
      const dz = Math.abs(p.z - cz);
      if (dx >= halfW || dz >= halfD) continue;

      const overlapX = halfW - dx;
      const overlapZ = halfD - dz;

      if (overlapX < overlapZ) {
        p.x += overlapX * Math.sign(p.x - cx);
        if (this.state === State.FLYING) this.vel.x = 0;
      } else {
        p.z += overlapZ * Math.sign(p.z - cz);
        if (this.state === State.FLYING) this.vel.z = 0;
      }
    }
  }

  _applyCamera() {
    if (this.thirdPerson) {
      const dist = 3.5;
      const camOffset = new THREE.Vector3(
        Math.sin(this.yaw) * dist,
        1.4,
        Math.cos(this.yaw) * dist
      );
      this.camera.position.copy(this.pos).add(camOffset);
      this.camera.lookAt(this.pos.clone().setY(this.pos.y + 0.1));

      const meshY = this.pos.y - EYE_HEIGHT * 0.5;
      this.pigeonMesh.position.set(this.pos.x, meshY, this.pos.z);
      this.pigeonMesh.rotation.y = this.yaw + Math.PI;
    } else {
      this.camera.position.copy(this.pos);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      const peckPitch = this.state === State.PECKING && this.peckTimer > 0
        ? Math.sin((0.5 - this.peckTimer) / 0.5 * Math.PI) * 0.55
        : 0;
      this.camera.rotation.x = this.pitch + peckPitch;
      this.camera.rotation.z = 0;
    }
  }
}

function buildPigeonMesh() {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x8899aa });
  const headMat = new THREE.MeshLambertMaterial({ color: 0x5588aa });
  const beakMat = new THREE.MeshLambertMaterial({ color: 0xccaa44 });
  const wingMat = new THREE.MeshLambertMaterial({ color: 0x667788 });
  const legMat  = new THREE.MeshLambertMaterial({ color: 0xdd9955 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), bodyMat);
  body.scale.set(1, 0.75, 1.3);
  group.add(body);

  const neck = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), bodyMat);
  neck.position.set(0, 0.12, 0.22);
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 7), headMat);
  head.position.set(0, 0.22, 0.3);
  group.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 6), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.22, 0.42);
  group.add(beak);

  // Wings — stored for animation
  const wings = [];
  for (const [side, i] of [[-1, 0], [1, 1]]) {
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.04, 0.22),
      wingMat
    );
    wing.position.set(side * 0.25, 0, 0);
    wing.rotation.z = side * 0.2;
    group.add(wing);
    wings.push(wing);
  }
  group.userData.wings = wings;

  // Tail
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.03, 0.15),
    new THREE.MeshLambertMaterial({ color: 0x778899 })
  );
  tail.position.set(0, -0.02, -0.22);
  tail.rotation.x = 0.3;
  group.add(tail);

  // Legs
  for (const lx of [-0.06, 0.06]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.14, 5),
      legMat
    );
    leg.position.set(lx, -0.21, 0.05);
    group.add(leg);
  }

  return group;
}
