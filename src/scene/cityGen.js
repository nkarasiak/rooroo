import { mulberry32, hashSeed, range, rangeInt, pick, chance } from './rng.js';

// ─── Procedural city layout (pure data — no THREE objects) ──────────────────────
//
// A grid of blocks separated by streets. Each block is a raised sidewalk slab
// subdivided into building lots. The output is renderer-agnostic so the builder
// (cityBuilder.js) can instantiate meshes + colliders however it likes.

export const DEFAULT_PARAMS = {
  citySeed:   1337,
  blocksX:    5,
  blocksZ:    5,
  blockSize:  38,   // sidewalk-slab side (m)
  street:     12,   // carriageway width between slabs (m)
  sidewalkH:  0.2,  // slab top height above road
  margin:     2.4,  // walkable sidewalk strip inside the slab edge
  lotGap:     0.6,  // gap between adjacent building footprints
  minLot:     9,    // smallest lot side before we stop subdividing
  minH:       9,
  maxH:       30,
  downtownH:  20,   // extra height bonus toward the city centre
};

const MATERIAL_CLASSES = ['brickA', 'brickB', 'concrete', 'glass'];

// Split a rect into lots by recursively cutting the longer axis.
function subdivide(rng, rect, minLot, depth, out) {
  const w = rect.x1 - rect.x0;
  const d = rect.z1 - rect.z0;
  const canX = w > minLot * 2;
  const canZ = d > minLot * 2;
  if (depth <= 0 || (!canX && !canZ)) { out.push(rect); return; }
  // Bias toward cutting the longer side; jitter the cut position.
  const cutX = canX && (!canZ || w >= d);
  const t = range(rng, 0.4, 0.6);
  if (cutX) {
    const xm = rect.x0 + w * t;
    subdivide(rng, { x0: rect.x0, z0: rect.z0, x1: xm, z1: rect.z1 }, minLot, depth - 1, out);
    subdivide(rng, { x0: xm, z0: rect.z0, x1: rect.x1, z1: rect.z1 }, minLot, depth - 1, out);
  } else {
    const zm = rect.z0 + d * t;
    subdivide(rng, { x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: zm }, minLot, depth - 1, out);
    subdivide(rng, { x0: rect.x0, z0: zm, x1: rect.x1, z1: rect.z1 }, minLot, depth - 1, out);
  }
}

export function generateCity(params = {}) {
  const P = { ...DEFAULT_PARAMS, ...params };
  const pitch = P.blockSize + P.street;
  const cx0 = -(P.blocksX - 1) / 2;
  const cz0 = -(P.blocksZ - 1) / 2;
  const half = P.blockSize / 2;
  const maxDist = Math.hypot((P.blocksX - 1) / 2, (P.blocksZ - 1) / 2) || 1;

  const blocks = [];

  for (let gx = 0; gx < P.blocksX; gx++) {
    for (let gz = 0; gz < P.blocksZ; gz++) {
      const bx = (cx0 + gx) * pitch;
      const bz = (cz0 + gz) * pitch;
      const block = {
        gx, gz, cx: bx, cz: bz,
        rect: { x0: bx - half, z0: bz - half, x1: bx + half, z1: bz + half },
        lots: [],
      };

      // Subdivide the inner (margin-inset) area into lots.
      const m = P.margin;
      const inner = { x0: bx - half + m, z0: bz - half + m, x1: bx + half - m, z1: bz + half - m };
      const rng = mulberry32(hashSeed(P.citySeed, gx, gz));
      const lotRects = [];
      subdivide(rng, inner, P.minLot, 3, lotRects);

      // Distance to centre → taller downtown.
      const dist = Math.hypot(cx0 + gx, cz0 + gz) / maxDist;
      const heightBias = (1 - dist) * P.downtownH;

      lotRects.forEach((lr, i) => {
        const lrng = mulberry32(hashSeed(P.citySeed, gx * 31 + gz, i + 1, 7));
        const g = P.lotGap;
        const fx0 = lr.x0 + g, fz0 = lr.z0 + g, fx1 = lr.x1 - g, fz1 = lr.z1 - g;
        const w = fx1 - fx0, d = fz1 - fz0;
        if (w < 3 || d < 3) return;

        const baseH = range(lrng, P.minH, P.maxH);
        const height = Math.min(P.maxH + P.downtownH, baseH + heightBias * range(lrng, 0.3, 1));
        const tall = height > 24;
        const materialClass = tall
          ? (chance(lrng, 0.6) ? 'glass' : 'concrete')
          : pick(lrng, ['brickA', 'brickA', 'brickB', 'concrete']);

        block.lots.push({
          rect: { x0: fx0, z0: fz0, x1: fx1, z1: fz1 },
          center: { x: (fx0 + fx1) / 2, z: (fz0 + fz1) / 2 },
          w, d, height, materialClass,
          litRatio: range(lrng, 0.25, 0.55),
          seed: hashSeed(P.citySeed, gx, gz, i + 100),
        });
      });

      blocks.push(block);
    }
  }

  const extent = ((Math.max(P.blocksX, P.blocksZ)) * pitch) / 2;
  return {
    params: P,
    pitch,
    blocks,
    bounds: { minX: -extent, maxX: extent, minZ: -extent, maxZ: extent },
  };
}

export { MATERIAL_CLASSES };
