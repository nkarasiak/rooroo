import * as THREE from 'three/webgpu';
import {
  Fn, uv, texture, float, vec2, vec3, vec4,
  tan, atan, abs, smoothstep, positionGeometry, If,
} from 'three/tsl';

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

// ─── Composite shader (TSL / NodeMaterial — runs on WebGPU + WebGL2 fallback) ──
// Angular constants in radians. Camera half-FOVs are compile-time constants, so
// their tangents are plain JS numbers folded into the node graph.
const SIDE_OFF    = SIDE_OFFSET_DEG * Math.PI / 180;  // 90°
const SIDE_HALF   = SIDE_HALF_DEG   * Math.PI / 180;  // 60°
const CTR_HALF    = CTR_HALF_DEG    * Math.PI / 180;  // 30°
const V_SIDE_HALF = SIDE_HALF;
const V_CTR_HALF  = CTR_HALF;

// Perspective UV mapping: angle from camera axis → texture U (tan(halfFov) constant)
const angleToU = (angle, halfFov) => float(0.5).add(tan(angle).mul(0.5 / Math.tan(halfFov)));

// Screen V → elevation (defined by the centre camera) → texture V for a given vFOV half
const screenVtoTexV = (sv, vHalfFov) => {
  const elev = atan(sv.sub(0.5).mul(2.0 * Math.tan(V_CTR_HALF)));
  return float(0.5).add(tan(elev).mul(0.5 / Math.tan(vHalfFov)));
};

// Build the composite colorNode for the three eye render targets.
// `flipY` accounts for the WebGPU render-target origin (top-left) vs WebGL
// (bottom-left); screenVtoTexV is odd-symmetric about 0.5, so flipping the
// screen-space v input is equivalent to flipping the sampled texture v.
function makeCompositeNode(rtLeft, rtCenter, rtRight, flipY) {
  return Fn(() => {
    const u = uv().x;
    const v = flipY ? uv().y.oneMinus() : uv().y;

    // Map screen horizontal → world angle: 0→-150°, 0.5→0°, 1→+150°
    const wAngle = u.sub(0.5).mul(300.0 * Math.PI / 180);

    // Sample all three eyes unconditionally (texture reads stay in uniform
    // control flow — required on the WebGPU backend), then select by angle.
    const cCenter = texture(rtCenter.texture, vec2(angleToU(wAngle, CTR_HALF), screenVtoTexV(v, V_CTR_HALF))).rgb;
    const cLeft   = texture(rtLeft.texture,   vec2(angleToU(wAngle.add(SIDE_OFF), SIDE_HALF), screenVtoTexV(v, V_SIDE_HALF))).rgb;
    const cRight  = texture(rtRight.texture,  vec2(angleToU(wAngle.sub(SIDE_OFF), SIDE_HALF), screenVtoTexV(v, V_SIDE_HALF))).rgb;

    const color = vec3(0.0).toVar();
    If(wAngle.greaterThanEqual(-CTR_HALF).and(wAngle.lessThanEqual(CTR_HALF)), () => {
      color.assign(cCenter);                 // binocular centre
    }).ElseIf(wAngle.lessThan(-CTR_HALF), () => {
      color.assign(cLeft);                   // left monocular eye
    }).Else(() => {
      color.assign(cRight);                  // right monocular eye
    });

    // Binocular boundary seams at world angles ±30° → screen u = 0.4 and 0.6
    const seamFactor = float(1.0).sub(float(0.55).mul(
      smoothstep(0.007, 0.0, abs(u.sub(0.4))).add(smoothstep(0.007, 0.0, abs(u.sub(0.6))))
    ));
    color.mulAssign(seamFactor);

    return vec4(color, 1.0);
  })();
}

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
    this.rtLeft   = new THREE.RenderTarget(RT_SIZE, RT_SIZE);
    this.rtCenter = new THREE.RenderTarget(RT_SIZE, RT_SIZE);
    this.rtRight  = new THREE.RenderTarget(RT_SIZE, RT_SIZE);

    const aspect = 1.0;  // square
    this.leftCam   = new THREE.PerspectiveCamera(SIDE_VFOV, aspect, 0.01, 350);
    this.centerCam = new THREE.PerspectiveCamera(CTR_VFOV,  aspect, 0.01, 350);
    this.rightCam  = new THREE.PerspectiveCamera(SIDE_VFOV, aspect, 0.01, 350);
  }

  _buildComposite() {
    const mat = new THREE.NodeMaterial();
    // PlaneGeometry(2,2) vertices are already in clip-space — bypass MVP (matches old VERT).
    mat.vertexNode = vec4(positionGeometry.xy, 0.0, 1.0);
    const flipY = !!this.renderer.backend?.isWebGPUBackend;
    mat.colorNode  = makeCompositeNode(this.rtLeft, this.rtCenter, this.rtRight, flipY);
    mat.depthTest  = false;
    mat.depthWrite = false;

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
