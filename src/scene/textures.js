import * as THREE from 'three/webgpu';

// CC0 PBR sets (ambientCG) extracted to public/textures/<key>/{color,normal,rough}.jpg.
// Loaded once and shared across every instanced building/sidewalk in the city.
const loader = new THREE.TextureLoader();
const KEYS = ['asphalt', 'sidewalk', 'brickA', 'brickB', 'glass'];

export async function loadCityTextures() {
  const reg = {};
  await Promise.all(KEYS.map(async (k) => {
    const [color, normal, rough] = await Promise.all([
      loader.loadAsync(`textures/${k}/color.jpg`),
      loader.loadAsync(`textures/${k}/normal.jpg`),
      loader.loadAsync(`textures/${k}/rough.jpg`),
    ]);
    color.colorSpace  = THREE.SRGBColorSpace;   // albedo is sRGB
    normal.colorSpace = THREE.NoColorSpace;     // normal/rough are linear data
    rough.colorSpace  = THREE.NoColorSpace;
    for (const t of [color, normal, rough]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;   // grazing-angle ground needs it; clamps to device max
    }
    reg[k] = { color, normal, rough };
  }));
  return reg;
}
