import * as THREE from 'three';

// ─── Pigeon optics ────────────────────────────────────────────────────────────
//
// Each eye sits ~90° to the side of the forward axis.
// Monocular coverage per eye: ±60° around that axis  → 120° per eye.
// Binocular overlap (front): ±30°  → 60° center zone.
// Total visible field: -150° … +150° = 300°. Blind spot: 60° behind head.
//
// Screen layout (linear in angle):
//   u=0 → -150°   (far left, almost behind)
//   u=0.4 → -30°  (left binocular seam)
//   u=0.5 →   0°  (directly forward)
//   u=0.6 → +30°  (right binocular seam)
//   u=1.0 → +150° (far right, almost behind)
//
// UV mapping uses the perspective tangent formula:
//   u_cam = 0.5 + 0.5 · tan(angleFromCamAxis) / tan(halfFOV)
// so the angular distribution across each camera texture is geometrically correct.
// ─────────────────────────────────────────────────────────────────────────────

const SIDE_OFFSET_DEG = 90;
const SIDE_HALF_DEG   = 60;   // half of 120° hFOV
const CTR_HALF_DEG    = 30;   // half of  60° hFOV

// Vertical FOV for each camera at 1:1 aspect
// Side: 120° vFOV  →  hFOV = 120° at 1:1
// Ctr :  60° vFOV  →  hFOV =  60° at 1:1
const SIDE_VFOV = 120;
const CTR_VFOV  = 60;

// Render target: square → aspect 1:1 makes hFOV = vFOV
const RT_SIZE = 512;

// ─── Shaders ─────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // PlaneGeometry(2,2) vertices are already in clip-space (-1…+1)
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */`
  #define PI 3.14159265359

  uniform sampler2D tLeft;
  uniform sampler2D tCenter;
  uniform sampler2D tRight;

  // Angular constants in radians
  const float SIDE_OFF  = ${(SIDE_OFFSET_DEG * Math.PI / 180).toFixed(6)};  // 90°
  const float SIDE_HALF = ${(SIDE_HALF_DEG   * Math.PI / 180).toFixed(6)};  // 60°
  const float CTR_HALF  = ${(CTR_HALF_DEG    * Math.PI / 180).toFixed(6)};  // 30°
  // Vertical half-FOV for each camera (1:1 aspect → hFOV = vFOV)
  const float V_SIDE_HALF = SIDE_HALF;
  const float V_CTR_HALF  = CTR_HALF;

  varying vec2 vUv;

  // Perspective UV mapping: angle from camera axis → texture U
  float angleToU(float angle, float halfFov) {
    return 0.5 + 0.5 * tan(angle) / tan(halfFov);
  }

  // Screen V → elevation angle → texture V for a given camera vFOV half
  float screenVtoTexV(float sv, float vHalfFov) {
    // Elevation is defined by the center (reference) camera's vFOV
    float elev = atan((sv - 0.5) * 2.0 * tan(V_CTR_HALF));
    return 0.5 + 0.5 * tan(elev) / tan(vHalfFov);
  }

  void main() {
    float u = vUv.x;
    float v = vUv.y;

    // Map screen horizontal → world angle: 0→-150°, 0.5→0°, 1→+150°
    float wAngle = (u - 0.5) * 300.0 * PI / 180.0;

    vec3 color = vec3(0.0);

    if (wAngle >= -CTR_HALF && wAngle <= CTR_HALF) {
      // ── Binocular centre ──────────────────────────────────────────────────
      float uc = angleToU(wAngle, CTR_HALF);
      float vc = screenVtoTexV(v, V_CTR_HALF);
      color = texture2D(tCenter, vec2(uc, vc)).rgb;

    } else if (wAngle < -CTR_HALF) {
      // ── Left monocular eye ───────────────────────────────────────────────
      // Left camera axis is at -SIDE_OFF from forward
      float camAngle = wAngle + SIDE_OFF;          // angle from left-cam axis
      float uc = angleToU(camAngle, SIDE_HALF);
      float vc = screenVtoTexV(v, V_SIDE_HALF);
      color = texture2D(tLeft, vec2(uc, vc)).rgb;

    } else {
      // ── Right monocular eye ──────────────────────────────────────────────
      float camAngle = wAngle - SIDE_OFF;
      float uc = angleToU(camAngle, SIDE_HALF);
      float vc = screenVtoTexV(v, V_SIDE_HALF);
      color = texture2D(tRight, vec2(uc, vc)).rgb;
    }

    // ── Binocular boundary seams ─────────────────────────────────────────────
    // Seams at world angles ±30° → screen u = 0.4 and 0.6
    float seam1 = abs(u - 0.4);
    float seam2 = abs(u - 0.6);
    float seamFactor = 1.0 - 0.55 * (
      smoothstep(0.007, 0.0, seam1) + smoothstep(0.007, 0.0, seam2)
    );
    color *= seamFactor;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ─── Class ───────────────────────────────────────────────────────────────────

export class PigeonVision {
  constructor(renderer, scene, mainCamera) {
    this.renderer   = renderer;
    this.scene      = scene;
    this.mainCamera = mainCamera;

    this.pigeonMode  = false;
    this._strength   = 0;  // 0 = human, 1 = pigeon (animated)

    this._buildCameras();
    this._buildComposite();

    document.addEventListener('pigeonVision', (e) => {
      this.pigeonMode = e.detail;
    });
  }

  _buildCameras() {
    // Square render targets → hFOV = vFOV for all cameras
    this.rtLeft   = new THREE.WebGLRenderTarget(RT_SIZE, RT_SIZE);
    this.rtCenter = new THREE.WebGLRenderTarget(RT_SIZE, RT_SIZE);
    this.rtRight  = new THREE.WebGLRenderTarget(RT_SIZE, RT_SIZE);

    const aspect = 1.0;  // square
    this.leftCam   = new THREE.PerspectiveCamera(SIDE_VFOV, aspect, 0.01, 200);
    this.centerCam = new THREE.PerspectiveCamera(CTR_VFOV,  aspect, 0.01, 200);
    this.rightCam  = new THREE.PerspectiveCamera(SIDE_VFOV, aspect, 0.01, 200);
  }

  _buildComposite() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tLeft:   { value: this.rtLeft.texture   },
        tCenter: { value: this.rtCenter.texture },
        tRight:  { value: this.rtRight.texture  },
      },
      vertexShader:   VERT,
      fragmentShader: FRAG,
      depthTest:  false,
      depthWrite: false,
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    this._quadScene  = new THREE.Scene();
    this._quadScene.add(new THREE.Mesh(geo, mat));
    this._quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  _syncCameras() {
    const mc = this.mainCamera;

    this.centerCam.position.copy(mc.position);
    this.centerCam.rotation.copy(mc.rotation);

    // Side cameras: offset yaw by ±90°, reduce pitch influence (eyes are fixed laterally)
    const sideAngleRad = SIDE_OFFSET_DEG * Math.PI / 180;

    this.leftCam.position.copy(mc.position);
    this.leftCam.rotation.order = 'YXZ';
    this.leftCam.rotation.y = mc.rotation.y + sideAngleRad;
    this.leftCam.rotation.x = mc.rotation.x;
    this.leftCam.rotation.z = 0;

    this.rightCam.position.copy(mc.position);
    this.rightCam.rotation.order = 'YXZ';
    this.rightCam.rotation.y = mc.rotation.y - sideAngleRad;
    this.rightCam.rotation.x = mc.rotation.x;
    this.rightCam.rotation.z = 0;
  }

  resize() {
    // Eye render targets are fixed-size; the main framebuffer is sized in main.js.
  }

  render() {
    const target = this.pigeonMode ? 1 : 0;
    this._strength += (target - this._strength) * 0.07;

    if (this._strength < 0.01) {
      // Human mode: direct render (fastest path)
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.mainCamera);
      return;
    }

    // Pigeon mode: render each eye, then composite
    this._syncCameras();

    this.renderer.setRenderTarget(this.rtLeft);
    this.renderer.render(this.scene, this.leftCam);

    this.renderer.setRenderTarget(this.rtCenter);
    this.renderer.render(this.scene, this.centerCam);

    this.renderer.setRenderTarget(this.rtRight);
    this.renderer.render(this.scene, this.rightCam);

    this.renderer.setRenderTarget(null);
    this.renderer.render(this._quadScene, this._quadCam);
  }
}
