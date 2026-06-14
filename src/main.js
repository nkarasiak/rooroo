import * as THREE from 'three';
import { buildWorld, getColliders } from './scene/world.js';
import { setupLighting } from './scene/lighting.js';
import { PigeonController } from './pigeon/controller.js';
import { PigeonVision } from './vision/pigeonVision.js';
import { PigeonAudio } from './audio/pigeonAudio.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 60, 130);

const camera = new THREE.PerspectiveCamera(90, innerWidth / innerHeight, 0.01, 200);

buildWorld(scene);
setupLighting(scene);

const colliders = getColliders();
const audio = new PigeonAudio();
const pigeon = new PigeonController(camera, scene, colliders, audio);
const vision = new PigeonVision(renderer, scene, camera);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  vision.resize();
});

const clock = new THREE.Clock();

(function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  pigeon.update(dt);
  vision.render();
})();
