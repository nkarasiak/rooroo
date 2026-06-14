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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbdd6ee);
scene.fog = new THREE.FogExp2(0xc0d8f0, 0.007);

buildWorld(scene);
setupLighting(scene);

// IBL environment map — gives correct reflections to all metallic/specular surfaces
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0,    '#3a68aa');  // zenith
  g.addColorStop(0.42, '#bdd6ee'); // horizon sky
  g.addColorStop(0.55, '#d0c8a8'); // horizon ground
  g.addColorStop(1,    '#3a2810'); // nadir
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  const envTex = new THREE.CanvasTexture(c);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(envTex).texture;
  envTex.dispose();
  pmrem.dispose();
}

const camera = new THREE.PerspectiveCamera(90, innerWidth / innerHeight, 0.01, 200);

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
