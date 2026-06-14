import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const _loader = new GLTFLoader();

function load(url) {
  return new Promise((resolve, reject) => _loader.load(url, resolve, undefined, reject));
}

// Turn on shadow casting/receiving for every mesh in a subtree.
export function enableShadows(obj) {
  obj.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
}

// Uniformly scale so the bounding-box height equals targetHeight.
export function fitHeight(obj, targetHeight) {
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(targetHeight / size.y);
}

// Uniformly scale so the longest horizontal bounding-box dimension equals targetLen.
export function fitLength(obj, targetLen) {
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(targetLen / Math.max(size.x, size.z));
}

// Wrap an object in a Group whose origin sits at the object's base centre
// (XZ centroid, lowest Y). Positioning the returned group at a surface Y
// then seats the model's feet exactly on that surface.
export function seatedGroup(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= box.min.y;
  const g = new THREE.Group();
  g.add(obj);
  return g;
}

export async function loadModels() {
  const [pigeon, car, carPolice, tree, treePine] = await Promise.all([
    load('models/pigeon.glb'),
    load('models/car.glb'),
    load('models/car_police.glb'),
    load('models/tree.glb'),
    load('models/tree_pine.glb'),
  ]);
  return {
    pigeon:    { scene: pigeon.scene, animations: pigeon.animations },
    car:       car.scene,
    carPolice: carPolice.scene,
    tree:      tree.scene,
    treePine:  treePine.scene,
  };
}
