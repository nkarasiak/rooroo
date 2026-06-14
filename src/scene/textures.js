import * as THREE from 'three/webgpu';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// CC0 PBR sets (ambientCG), KTX2-compressed (BasisLZ color/rough, UASTC normal,
// mipmapped) in public/textures/<key>/{color,normal,rough}.ktx2. KTX2 stays
// GPU-compressed → ~6x less VRAM than decoded JPG/PNG, key on integrated GPUs.
// The basis transcoder lives in public/basis/.
const KEYS = ['asphalt', 'sidewalk', 'brickA', 'brickB', 'brickC', 'concrete', 'plaster', 'glass'];

export async function loadCityTextures(renderer) {
  const loader = new KTX2Loader()
    .setTranscoderPath('basis/')
    .detectSupport(renderer);

  const reg = {};
  await Promise.all(KEYS.map(async (k) => {
    const [color, normal, rough] = await Promise.all([
      loader.loadAsync(`textures/${k}/color.ktx2`),
      loader.loadAsync(`textures/${k}/normal.ktx2`),
      loader.loadAsync(`textures/${k}/rough.ktx2`),
    ]);
    color.colorSpace  = THREE.SRGBColorSpace;   // albedo is sRGB
    normal.colorSpace = THREE.NoColorSpace;     // normal/rough are linear data
    rough.colorSpace  = THREE.NoColorSpace;
    for (const t of [color, normal, rough]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;   // grazing-angle ground; clamps to device max
    }
    reg[k] = { color, normal, rough };
  }));

  loader.dispose();
  return reg;
}
