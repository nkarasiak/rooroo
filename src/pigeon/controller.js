import * as THREE from 'three';
import { enableShadows, fitHeight, seatedGroup } from '../scene/models.js';

// Quaternius pigeon authoring faces +Z; rotate so it looks the way the player walks.
const PIGEON_YAW_OFFSET = -Math.PI;
const PIGEON_HEIGHT = 0.5;   // world-units, beak-to-foot

const WALK_SPEED = 4.5;
const FLY_SPEED = 9;
const FLAP_FORCE = 6.5;
const GRAVITY = 14;
const EYE_HEIGHT = 0.28;
const BODY_RADIUS = 0.22;
const WORLD_BOUND = 30;

const State = { WALKING: 'WALKING', FLYING: 'FLYING', PECKING: 'PECKING' };

export class PigeonController {
  constructor(camera, scene, colliders, audio, pigeonModel) {
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
    this.isMoving = false;
    this._surfaceY = 0;   // Y of surface currently standing on
    this._faceYaw = 0;    // smoothed body heading (radians)
    this._faceTarget = new THREE.Vector3(0, 0, -1);  // direction body should point

    this.keys = new Set();

    this._buildPigeon(pigeonModel);

    this._setupInput();
    this._updateHUD();
  }

  // Loaded Quaternius GLB → seated group + animation mixer.
  _buildPigeon(model) {
    const inner = model.scene;
    fitHeight(inner, PIGEON_HEIGHT);
    enableShadows(inner);

    this.pigeonMesh = seatedGroup(inner);   // origin at feet centre
    this.pigeonMesh.visible = false;
    this.scene.add(this.pigeonMesh);

    this.mixer = new THREE.AnimationMixer(inner);
    this.actions = {};
    for (const clip of model.animations) {
      const key = clip.name.replace(/^PigeonALL_/, '');   // 'PigeonALL_Walk' → 'Walk'
      this.actions[key] = this.mixer.clipAction(clip);
    }
    this._currentAction = null;
    this._setAnim('IdleLoop');
  }

  // Crossfade to a named clip (no-op if already active or missing).
  _setAnim(name) {
    const next = this.actions[name];
    if (!next || next === this._currentAction) return;
    next.reset().fadeIn(0.18).play();
    if (this._currentAction) this._currentAction.fadeOut(0.18);
    this._currentAction = next;
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

      // Body faces walk direction when moving, else the look direction.
      if (this.isMoving) this._faceTarget.set(move.x, 0, move.z);
      else               this._faceTarget.copy(forward);

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
      // --- FLY --- horizontal steering via WASD (relative to look), Space flaps up
      this.vel.y -= GRAVITY * dt;

      const wish = new THREE.Vector3();
      if (this.keys.has('KeyW')) wish.add(forward);
      if (this.keys.has('KeyS')) wish.addScaledVector(forward, -1);
      if (this.keys.has('KeyA')) wish.addScaledVector(right, -1);
      if (this.keys.has('KeyD')) wish.add(right);

      if (wish.lengthSq() > 0) {
        wish.normalize().multiplyScalar(FLY_SPEED);
        this.vel.x += (wish.x - this.vel.x) * dt * 4;
        this.vel.z += (wish.z - this.vel.z) * dt * 4;
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

      // Body faces flight direction (horizontal velocity, else look dir)
      if (Math.abs(this.vel.x) + Math.abs(this.vel.z) > 0.5) this._faceTarget.set(this.vel.x, 0, this.vel.z);
      else this._faceTarget.copy(forward);

      // Subtle body pitch following dive/climb
      this.pigeonMesh.rotation.x = Math.max(-0.35, Math.min(0.35, this.pitch * 0.6));
    }

    // Ease body level when not flying
    if (this.state !== State.FLYING) this.pigeonMesh.rotation.x *= 0.9;

    // Smoothly turn the body toward its target heading
    const targetYaw = Math.atan2(this._faceTarget.x, this._faceTarget.z);
    let d = targetYaw - this._faceYaw;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;  // wrap to [-π,π]
    this._faceYaw += d * Math.min(1, dt * 12);

    this.pos.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, this.pos.x));
    this.pos.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, this.pos.z));

    this._updateAnimation(dt);
    this._applyCamera();
  }

  // Pick the clip that matches the current state, then advance the mixer.
  _updateAnimation(dt) {
    if (this.state === State.PECKING)      this._setAnim('Peck');
    else if (this.state === State.FLYING)  this._setAnim('FlyLoop');
    else if (this.isMoving)                this._setAnim('Walk');
    else                                   this._setAnim('IdleLoop');
    this.mixer.update(dt);
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

      this.pigeonMesh.position.set(this.pos.x, this.pos.y - EYE_HEIGHT, this.pos.z);
      this.pigeonMesh.rotation.y = this._faceYaw + PIGEON_YAW_OFFSET;
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
