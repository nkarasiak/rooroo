import * as THREE from 'three/webgpu';

// Spatial hash over AABB colliders. The pigeon physics scans colliders twice
// per frame (_getSurfaceY + _resolveXZ); a flat array would be O(cityN). This
// buckets colliders by XZ cell so a query only touches the pigeon's neighbourhood.
//
// API mirrors the old plain array enough that the controller can iterate the
// result of queryXZ() exactly as it used to iterate `this.colliders`.
export class ColliderGrid {
  constructor(cellSize = 16) {
    this.cellSize = cellSize;
    this.cells = new Map();   // "cx,cz" -> [{ aabb, mesh? }]
    this.all = [];            // every collider (for full rebuilds / debug)
  }

  _key(cx, cz) { return cx + ',' + cz; }

  insert(collider) {
    this.all.push(collider);
    const { aabb } = collider;
    const x0 = Math.floor(aabb.min.x / this.cellSize);
    const x1 = Math.floor(aabb.max.x / this.cellSize);
    const z0 = Math.floor(aabb.min.z / this.cellSize);
    const z1 = Math.floor(aabb.max.z / this.cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this._key(cx, cz);
        let bucket = this.cells.get(k);
        if (!bucket) { bucket = []; this.cells.set(k, bucket); }
        bucket.push(collider);
      }
    }
  }

  // Convenience: register an axis-aligned box collider.
  addAABB(x0, y0, z0, x1, y1, z1, mesh) {
    this.insert({
      mesh,
      aabb: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)),
    });
  }

  // All colliders whose cell overlaps the query point (+radius). Returns a
  // de-duplicated array (a large AABB spans several cells).
  queryXZ(x, z, radius = 0) {
    const r = radius + 1e-3;
    const x0 = Math.floor((x - r) / this.cellSize);
    const x1 = Math.floor((x + r) / this.cellSize);
    const z0 = Math.floor((z - r) / this.cellSize);
    const z1 = Math.floor((z + r) / this.cellSize);
    const out = [];
    const seen = new Set();
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const bucket = this.cells.get(this._key(cx, cz));
        if (!bucket) continue;
        for (const c of bucket) {
          if (seen.has(c)) continue;
          seen.add(c);
          out.push(c);
        }
      }
    }
    return out;
  }

  clear() { this.cells.clear(); this.all.length = 0; }
}
