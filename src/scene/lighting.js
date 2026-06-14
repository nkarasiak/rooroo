import * as THREE from 'three';

export function setupLighting(scene) {
  const ambient = new THREE.AmbientLight(0xd0d8e8, 0.75);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff2d0, 1.4);
  sun.position.set(25, 50, 15);
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

  // Soft fill from opposite side (sky bounce)
  const fill = new THREE.DirectionalLight(0xb0c8e8, 0.3);
  fill.position.set(-15, 20, -10);
  scene.add(fill);
}
