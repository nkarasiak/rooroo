import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';

export const SUN_ELEVATION = 45;   // degrees above horizon
export const SUN_AZIMUTH   = 20;   // degrees east of south

export function setupLighting(scene) {
  // Physically-based sky (Preetham atmospheric scattering) — node version for WebGPU
  const sky = new SkyMesh();
  sky.scale.setScalar(10000);
  scene.add(sky);

  sky.turbidity.value       = 3.0;   // clearer air
  sky.rayleigh.value        = 2.4;   // bluer sky dome
  sky.mieCoefficient.value  = 0.005;
  sky.mieDirectionalG.value = 0.8;

  const phi   = THREE.MathUtils.degToRad(90 - SUN_ELEVATION);
  const theta = THREE.MathUtils.degToRad(SUN_AZIMUTH);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  sky.sunPosition.value.copy(sunDir);

  // Sky/ground bounce (replaces flat ambient)
  const hemi = new THREE.HemisphereLight(0xc8d8f0, 0x3d3020, 0.5);
  scene.add(hemi);

  // Sun — position matches sky sun direction
  const sun = new THREE.DirectionalLight(0xfff2c8, 2.6);
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 140;
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  // Blue-sky fill from opposite quarter
  const fill = new THREE.DirectionalLight(0xa0c0e8, 0.22);
  fill.position.set(-15, 20, -10);
  scene.add(fill);
}
