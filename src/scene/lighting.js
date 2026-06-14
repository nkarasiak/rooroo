import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export const SUN_ELEVATION = 45;   // degrees above horizon
export const SUN_AZIMUTH   = 20;   // degrees east of south

export function setupLighting(scene) {
  // Physically-based sky (Preetham atmospheric scattering)
  const sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);

  const u = sky.material.uniforms;
  u['turbidity'].value      = 5.5;
  u['rayleigh'].value       = 1.6;
  u['mieCoefficient'].value = 0.006;
  u['mieDirectionalG'].value = 0.82;

  const phi   = THREE.MathUtils.degToRad(90 - SUN_ELEVATION);
  const theta = THREE.MathUtils.degToRad(SUN_AZIMUTH);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  u['sunPosition'].value.copy(sunDir);

  // Sky/ground bounce (replaces flat ambient)
  const hemi = new THREE.HemisphereLight(0xc8d8f0, 0x3d3020, 0.5);
  scene.add(hemi);

  // Sun — position matches sky sun direction
  const sun = new THREE.DirectionalLight(0xfff5d0, 1.4);
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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
