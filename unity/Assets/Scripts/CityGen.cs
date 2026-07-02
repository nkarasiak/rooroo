using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

// City layout + collision + rendering. Port of src/city.js (regionType / buildingAt /
// nearbyBuildings) plus the mesh build that replaces the raymarch shader.
//
// Buildings are drawn with GPU instancing (Graphics.DrawMeshInstanced), per-building
// (top, seed) fed to the facade shader via MaterialPropertyBlock. No per-building
// GameObjects, no PhysX colliders. Collision is the same custom AABB math as the web
// version (NearbyBuildings / GetSurfaceY, consumed by PigeonController).
public class CityGen : MonoBehaviour
{
    public const float SCALE = 100f;

    const int ISLAND_MIN_X = -6, ISLAND_MAX_X = 5, ISLAND_MIN_Z = -32, ISLAND_MAX_Z = 13;
    const int PARK_MIN_X = -3, PARK_MAX_X = 3, PARK_MIN_Z = -22, PARK_MAX_Z = -9;

    public const float WATER_Y = -0.004f * SCALE;

    public Material buildingMat;   // City/Building shader (instancing on)
    public Material groundMat;
    public Material parkMat;
    public Material waterMat;
    public Material trunkMat;      // Standard, instancing on
    public Material canopyMat;     // Standard, instancing on
    public Material flatMat;       // City/Flat (vertex-coloured props: cars, water towers)

    public struct LotAABB { public float minX, maxX, minZ, maxZ, top; }

    readonly Dictionary<long, List<LotAABB>> _cache = new Dictionary<long, List<LotAABB>>();

    // pre-sliced instancing batches (max 1023 each)
    readonly List<Matrix4x4[]> _batchM = new List<Matrix4x4[]>();
    readonly List<Vector4[]> _batchD = new List<Vector4[]>();
    readonly List<Matrix4x4[]> _trunkB = new List<Matrix4x4[]>();
    readonly List<Matrix4x4[]> _canopyB = new List<Matrix4x4[]>();
    readonly List<Matrix4x4[]> _carB = new List<Matrix4x4[]>();
    readonly List<Matrix4x4[]> _towerB = new List<Matrix4x4[]>();
    readonly List<Matrix4x4[]> _suvB = new List<Matrix4x4[]>();
    readonly List<Matrix4x4[]> _truckB = new List<Matrix4x4[]>();
    readonly List<Matrix4x4[]> _lampB = new List<Matrix4x4[]>();
    readonly List<Matrix4x4[]> _lightB = new List<Matrix4x4[]>();
    MaterialPropertyBlock _mpb;
    Mesh _cube, _canopy, _carMesh, _towerMesh, _suvMesh, _truckMesh, _lampMesh, _lightMesh, _esbMesh;

    static float Sat(float x) => Mathf.Clamp01(x);
    static long Key(int i, int j) => ((long)i << 32) ^ (uint)j;

    public static int RegionType(int bx, int bz)
    {
        if (bx < ISLAND_MIN_X || bx > ISLAND_MAX_X || bz < ISLAND_MIN_Z || bz > ISLAND_MAX_Z) return 2;
        if (bx >= PARK_MIN_X && bx <= PARK_MAX_X && bz >= PARK_MIN_Z && bz <= PARK_MAX_Z) return 1;
        return 0;
    }

    // 9 packed-lot AABBs for block (i,j) — port of src/city.js:35-53.
    public List<LotAABB> BuildingAt(int i, int j)
    {
        if (RegionType(i, j) != 0) return null;
        long key = Key(i, j);
        if (_cache.TryGetValue(key, out var cached)) return cached;

        const float M = 0.085f, span = 1.0f - 2.0f * M, cellHalf = span / 6.0f;
        float dMid = Mathf.Sqrt((i + 0.5f) * (i + 0.5f) + (j + 4.0f) * (j + 4.0f));
        float dFin = Mathf.Sqrt((i + 0.5f) * (i + 0.5f) + (j - 10.0f) * (j - 10.0f));
        float downtown = Mathf.Max(Mathf.Max(Sat(6.0f / dMid), Sat(4.0f / dFin)), 0.35f);

        var arr = new List<LotAABB>(9);
        for (int lj = 0; lj < 3; lj++)
            for (int li = 0; li < 3; li++)
            {
                float r1 = CityHash.LotRand(i, j, li, lj, 0);
                float r2 = CityHash.LotRand(i, j, li, lj, 1);
                float r3 = CityHash.LotRand(i, j, li, lj, 2);
                float fpx = cellHalf * (0.60f + 0.40f * r2);
                float fpz = cellHalf * (0.60f + 0.40f * r3);
                float cx = i + M + li / 3.0f * span + cellHalf;
                float cz = j + M + lj / 3.0f * span + cellHalf;
                // mid-rise 5th-Ave blocks (tops + cornices in frame); the ESB is the lone tower
                float top = Mathf.Floor((0.10f + r1 * r1 * 1.2f) * downtown * 20.0f) * 0.05f + 0.10f;
                arr.Add(new LotAABB { minX = cx - fpx, maxX = cx + fpx, minZ = cz - fpz, maxZ = cz + fpz, top = top });
            }
        _cache[key] = arr;
        return arr;
    }

    public void NearbyBuildings(float x, float z, List<LotAABB> outList)
    {
        outList.Clear();
        int ci = Mathf.FloorToInt(x), cj = Mathf.FloorToInt(z);
        for (int di = -1; di <= 1; di++)
            for (int dj = -1; dj <= 1; dj++)
            {
                var a = BuildingAt(ci + di, cj + dj);
                if (a != null) outList.AddRange(a);
            }
    }

    void Start()
    {
        _cube = BuildCubeMesh();
        _canopy = BuildCanopyMesh();
        _carMesh = BuildCarMesh();
        _towerMesh = BuildTowerMesh();
        _suvMesh = BuildSuvMesh();
        _truckMesh = BuildTruckMesh();
        _lampMesh = BuildLampMesh();
        _lightMesh = BuildTrafficMesh();
        _esbMesh = BuildEsbMesh();
        _mpb = new MaterialPropertyBlock();
        BuildInstances();
        BuildTrees();
        BuildCars();
        BuildProps();
        BuildGroundPlanes();
        BuildEsb();
    }

    void Update()
    {
        if (buildingMat != null)
            for (int b = 0; b < _batchM.Count; b++)
            {
                _mpb.SetVectorArray("_InstData", _batchD[b]);
                Graphics.DrawMeshInstanced(_cube, 0, buildingMat, _batchM[b], _batchM[b].Length, _mpb);
            }

        if (trunkMat != null)
            for (int b = 0; b < _trunkB.Count; b++)
                Graphics.DrawMeshInstanced(_cube, 0, trunkMat, _trunkB[b], _trunkB[b].Length, null, ShadowCastingMode.On, true);
        if (canopyMat != null)
            for (int b = 0; b < _canopyB.Count; b++)
                Graphics.DrawMeshInstanced(_canopy, 0, canopyMat, _canopyB[b], _canopyB[b].Length, null, ShadowCastingMode.On, true);
        if (flatMat != null)
        {
            for (int b = 0; b < _carB.Count; b++)
                Graphics.DrawMeshInstanced(_carMesh, 0, flatMat, _carB[b], _carB[b].Length, null, ShadowCastingMode.On, true);
            for (int b = 0; b < _suvB.Count; b++)
                Graphics.DrawMeshInstanced(_suvMesh, 0, flatMat, _suvB[b], _suvB[b].Length, null, ShadowCastingMode.On, true);
            for (int b = 0; b < _truckB.Count; b++)
                Graphics.DrawMeshInstanced(_truckMesh, 0, flatMat, _truckB[b], _truckB[b].Length, null, ShadowCastingMode.On, true);
            for (int b = 0; b < _lampB.Count; b++)
                Graphics.DrawMeshInstanced(_lampMesh, 0, flatMat, _lampB[b], _lampB[b].Length, null, ShadowCastingMode.On, true);
            for (int b = 0; b < _lightB.Count; b++)
                Graphics.DrawMeshInstanced(_lightMesh, 0, flatMat, _lightB[b], _lightB[b].Length, null, ShadowCastingMode.On, true);
            for (int b = 0; b < _towerB.Count; b++)
                Graphics.DrawMeshInstanced(_towerMesh, 0, flatMat, _towerB[b], _towerB[b].Length, null, ShadowCastingMode.On, true);
        }
    }

    // Traffic in the avenue lanes — mostly yellow taxis, some grey SUVs / white trucks.
    // Oriented along the road, hash-gated; denser packed rows than before.
    void BuildCars()
    {
        var taxis = new List<Matrix4x4>();
        var suvs = new List<Matrix4x4>();
        var trucks = new List<Matrix4x4>();
        var rotZ = Quaternion.identity;                 // faces +Z (avenue)
        var rotX = Quaternion.Euler(0, 90f, 0);         // faces +X (cross street)
        for (int i = ISLAND_MIN_X; i <= ISLAND_MAX_X; i++)
            for (int j = ISLAND_MIN_Z; j <= ISLAND_MAX_Z; j++)
            {
                if (RegionType(i, j) != 0) continue;
                for (int s = 0; s < 6; s++)
                {
                    uint h = CityHash.UHash((uint)((i + 64) | ((j + 64) << 8) | (s << 16)));
                    if ((h & 0xff) / 256f > 0.72f) continue;                    // denser (was 0.45)
                    float t = 0.10f + 0.80f * (((h >> 8) & 0xff) / 256f);
                    Vector3 pos; Quaternion rot;
                    if (s < 3)   // avenue lanes (along Z): west/east/west offsets
                    { float ox = (s == 1 ? 0.035f : -0.035f); pos = new Vector3((i + ox) * SCALE, 0f, (j + t) * SCALE); rot = rotZ; }
                    else         // cross-street lanes (along X)
                    { pos = new Vector3((i + t) * SCALE, 0f, (j + (s == 3 ? -0.035f : 0.035f)) * SCALE); rot = rotX; }
                    var m = Matrix4x4.TRS(pos, rot, Vector3.one);
                    float pick = ((h >> 16) & 0xff) / 256f;
                    if (pick > 0.90f) trucks.Add(m);
                    else if (pick > 0.76f) suvs.Add(m);
                    else taxis.Add(m);
                }
            }
        Slice(taxis, _carB);
        Slice(suvs, _suvB);
        Slice(trucks, _truckB);
    }

    // Lamp posts + traffic lights along the x=0 avenue sidewalks (shot1 axis).
    void BuildProps()
    {
        var lamps = new List<Matrix4x4>();
        var lights = new List<Matrix4x4>();
        var qWest = Quaternion.identity;                // arm reaches +X (from the west curb)
        var qEast = Quaternion.Euler(0, 180f, 0);       // arm reaches -X (from the east curb)
        for (int j = ISLAND_MIN_Z; j <= ISLAND_MAX_Z; j++)
        {
            if (RegionType(0, j) != 0 && RegionType(-1, j) != 0) continue;   // skip park/water stretch
            float zc = (j + 0.5f) * SCALE;              // lamps mid-block, both curbs
            lamps.Add(Matrix4x4.TRS(new Vector3(-7f, 0f, zc), qWest, Vector3.one));
            lamps.Add(Matrix4x4.TRS(new Vector3(7f, 0f, zc), qEast, Vector3.one));
            float zi = (j + 0.06f) * SCALE;             // traffic light near the intersection
            lights.Add(Matrix4x4.TRS(new Vector3(-7f, 0f, zi), qWest, Vector3.one));
        }
        Slice(lamps, _lampB);
        Slice(lights, _lightB);
    }

    // Empire-State hero tower — a single tall setback+spire landmark capping the avenue.
    void BuildEsb()
    {
        var go = new GameObject("Empire");
        go.transform.SetParent(transform, false);
        go.transform.position = new Vector3(0f, 0f, 12.5f * SCALE);   // south terminus of the x=0 avenue
        go.AddComponent<MeshFilter>().sharedMesh = _esbMesh;
        var r = go.AddComponent<MeshRenderer>();
        r.sharedMaterial = flatMat;
        r.shadowCastingMode = ShadowCastingMode.On;
    }

    // Trees in Central Park — grid + jitter, hash-gated (loose port of TreeField).
    void BuildTrees()
    {
        var trunks = new List<Matrix4x4>();
        var canopies = new List<Matrix4x4>();
        const float step = 0.14f;   // shader units between candidate trees
        for (float x = PARK_MIN_X; x < PARK_MAX_X + 1; x += step)
            for (float z = PARK_MIN_Z; z < PARK_MAX_Z + 1; z += step)
            {
                if (RegionType(Mathf.FloorToInt(x), Mathf.FloorToInt(z)) != 1) continue;
                uint h = CityHash.UHash((uint)(Mathf.RoundToInt(x * 97f) * 73856093 ^ Mathf.RoundToInt(z * 97f) * 19349663));
                float r0 = (h & 0xffff) / 65536f;
                if (r0 > 0.55f) continue;                       // groves, not a solid carpet
                float r1 = ((h >> 16) & 0xff) / 256f, r2 = ((h >> 8) & 0xff) / 256f;
                float jx = (r1 - 0.5f) * step * 0.8f, jz = (r2 - 0.5f) * step * 0.8f;
                float wx = (x + jx) * SCALE, wz = (z + jz) * SCALE;

                float scl = (0.7f + 0.6f * r1);
                float trunkH = 0.050f * scl, trunkW = 0.010f * scl, canR = 0.060f * scl;
                trunks.Add(Matrix4x4.TRS(new Vector3(wx, 0f, wz), Quaternion.identity,
                    new Vector3(trunkW, trunkH, trunkW) * SCALE));
                canopies.Add(Matrix4x4.TRS(new Vector3(wx, (trunkH + canR * 0.7f) * SCALE, wz),
                    Quaternion.Euler(0, r2 * 360f, 0), new Vector3(canR, canR * 1.25f, canR) * SCALE));
            }

        // street trees along sidewalks of every city block (south + west edges)
        const float off = 0.11f;   // sidewalk offset from the block's integer grid line
        float[] ts = { 0.28f, 0.5f, 0.72f };
        for (int i = ISLAND_MIN_X; i <= ISLAND_MAX_X; i++)
            for (int j = ISLAND_MIN_Z; j <= ISLAND_MAX_Z; j++)
            {
                if (RegionType(i, j) != 0) continue;
                foreach (float t in ts)
                {
                    AddStreetTree(trunks, canopies, i + off, j + t);       // west sidewalk
                    AddStreetTree(trunks, canopies, i + 1 - off, j + t);   // east sidewalk
                    AddStreetTree(trunks, canopies, i + t, j + off);       // south sidewalk
                    AddStreetTree(trunks, canopies, i + t, j + 1 - off);   // north sidewalk
                }
            }

        Slice(trunks, _trunkB);
        Slice(canopies, _canopyB);
    }

    void AddStreetTree(List<Matrix4x4> trunks, List<Matrix4x4> canopies, float x, float z)
    {
        uint h = CityHash.UHash((uint)(Mathf.RoundToInt(x * 131f) * 73856093 ^ Mathf.RoundToInt(z * 131f) * 19349663));
        if ((h & 0xffff) / 65536f > 0.7f) return;                       // gaps
        float r = ((h >> 16) & 0xff) / 256f;
        float scl = 0.8f + 0.4f * r;
        float trunkH = 0.045f * scl, trunkW = 0.008f * scl, canR = 0.038f * scl;
        float wx = x * SCALE, wz = z * SCALE;
        trunks.Add(Matrix4x4.TRS(new Vector3(wx, 0f, wz), Quaternion.identity, new Vector3(trunkW, trunkH, trunkW) * SCALE));
        canopies.Add(Matrix4x4.TRS(new Vector3(wx, (trunkH + canR * 0.7f) * SCALE, wz),
            Quaternion.Euler(0, r * 360f, 0), new Vector3(canR, canR * 1.3f, canR) * SCALE));
    }

    static void Slice(List<Matrix4x4> src, List<Matrix4x4[]> dst)
    {
        for (int off = 0; off < src.Count; off += 1023)
            dst.Add(src.GetRange(off, Mathf.Min(1023, src.Count - off)).ToArray());
    }

    void BuildInstances()
    {
        var mats = new List<Matrix4x4>();
        var data = new List<Vector4>();
        var towers = new List<Matrix4x4>();
        for (int i = ISLAND_MIN_X; i <= ISLAND_MAX_X; i++)
            for (int j = ISLAND_MIN_Z; j <= ISLAND_MAX_Z; j++)
            {
                var lots = BuildingAt(i, j);
                if (lots == null) continue;
                for (int k = 0; k < lots.Count; k++)
                {
                    var b = lots[k];
                    float cx = (b.minX + b.maxX) * 0.5f * SCALE;
                    float cz = (b.minZ + b.maxZ) * 0.5f * SCALE;
                    float sx = (b.maxX - b.minX) * SCALE;
                    float sz = (b.maxZ - b.minZ) * SCALE;
                    float sy = b.top * SCALE;
                    mats.Add(Matrix4x4.TRS(new Vector3(cx, 0f, cz), Quaternion.identity, new Vector3(sx, sy, sz)));
                    float seed = i * 3.17f + j * 1.73f + k * 0.31f;
                    data.Add(new Vector4(b.top, seed, 0f, 0f));

                    // NYC rooftop water tower on some low/mid roofs
                    uint th = CityHash.UHash((uint)((i + 64) | ((j + 64) << 8) | (k << 16) | (1 << 20)));
                    if (b.top < 1.3f && (th & 0xff) / 256f < 0.30f)
                    {
                        float yaw = ((th >> 8) & 0xff) / 256f * 360f;
                        float ox = ((th >> 16 & 0xf) / 16f - 0.5f) * sx * 0.4f;
                        float oz = ((th >> 20 & 0xf) / 16f - 0.5f) * sz * 0.4f;
                        towers.Add(Matrix4x4.TRS(new Vector3(cx + ox, sy, cz + oz), Quaternion.Euler(0, yaw, 0), Vector3.one));
                    }
                }
            }

        for (int off = 0; off < mats.Count; off += 1023)
        {
            int n = Mathf.Min(1023, mats.Count - off);
            _batchM.Add(mats.GetRange(off, n).ToArray());
            _batchD.Add(data.GetRange(off, n).ToArray());
        }
        Slice(towers, _towerB);
    }

    void BuildGroundPlanes()
    {
        float w = (ISLAND_MAX_X - ISLAND_MIN_X + 1) * SCALE;
        float d = (ISLAND_MAX_Z - ISLAND_MIN_Z + 1) * SCALE;
        float cx = (ISLAND_MIN_X + ISLAND_MAX_X + 1) * 0.5f * SCALE;
        float cz = (ISLAND_MIN_Z + ISLAND_MAX_Z + 1) * 0.5f * SCALE;

        MakeQuad("Water", new Vector3(0, WATER_Y, 0), new Vector3(w * 6f, 1f, d * 6f), waterMat);
        MakeQuad("Street", new Vector3(cx, 0f, cz), new Vector3(w, 1f, d), groundMat);

        float pw = (PARK_MAX_X - PARK_MIN_X + 1) * SCALE;
        float pd = (PARK_MAX_Z - PARK_MIN_Z + 1) * SCALE;
        float pcx = (PARK_MIN_X + PARK_MAX_X + 1) * 0.5f * SCALE;
        float pcz = (PARK_MIN_Z + PARK_MAX_Z + 1) * 0.5f * SCALE;
        MakeQuad("Park", new Vector3(pcx, 0.05f, pcz), new Vector3(pw, 1f, pd), parkMat);
    }

    void MakeQuad(string name, Vector3 pos, Vector3 scale, Material mat)
    {
        var go = new GameObject(name);
        go.transform.SetParent(transform, false);
        go.transform.position = pos;
        go.transform.localScale = scale;
        go.AddComponent<MeshFilter>().sharedMesh = FlatQuadMesh();
        go.AddComponent<MeshRenderer>().sharedMaterial = mat;
    }

    static Mesh _quad;
    static Mesh FlatQuadMesh()
    {
        if (_quad != null) return _quad;
        _quad = new Mesh { name = "FlatQuad" };
        _quad.vertices = new[]
        {
            new Vector3(-0.5f, 0, -0.5f), new Vector3(0.5f, 0, -0.5f),
            new Vector3(0.5f, 0, 0.5f), new Vector3(-0.5f, 0, 0.5f)
        };
        _quad.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) };
        _quad.triangles = new[] { 0, 2, 1, 0, 3, 2 };
        _quad.normals = new[] { Vector3.up, Vector3.up, Vector3.up, Vector3.up };
        return _quad;
    }

    // ---- vertex-coloured mesh helper ----
    class MB
    {
        public List<Vector3> v = new List<Vector3>();
        public List<Vector3> n = new List<Vector3>();
        public List<Color> c = new List<Color>();
        public List<int> t = new List<int>();

        void Quad(Vector3 a, Vector3 b, Vector3 d, Vector3 e, Vector3 nn, Color col)
        {
            int i0 = v.Count;
            v.Add(a); v.Add(b); v.Add(d); v.Add(e);
            for (int k = 0; k < 4; k++) { n.Add(nn); c.Add(col); }
            t.Add(i0); t.Add(i0 + 2); t.Add(i0 + 1);
            t.Add(i0); t.Add(i0 + 3); t.Add(i0 + 2);
        }

        public void Box(Vector3 ctr, Vector3 size, Color col)
        {
            Vector3 h = size * 0.5f;
            Vector3 p0 = ctr + new Vector3(-h.x, -h.y, -h.z), p1 = ctr + new Vector3(h.x, -h.y, -h.z);
            Vector3 p2 = ctr + new Vector3(h.x, -h.y, h.z), p3 = ctr + new Vector3(-h.x, -h.y, h.z);
            Vector3 q0 = ctr + new Vector3(-h.x, h.y, -h.z), q1 = ctr + new Vector3(h.x, h.y, -h.z);
            Vector3 q2 = ctr + new Vector3(h.x, h.y, h.z), q3 = ctr + new Vector3(-h.x, h.y, h.z);
            Quad(q0, q1, q2, q3, Vector3.up, col);
            Quad(p3, p2, p1, p0, Vector3.down, col);
            Quad(p0, p1, q1, q0, new Vector3(0, 0, -1), col);
            Quad(p2, p3, q3, q2, new Vector3(0, 0, 1), col);
            Quad(p1, p2, q2, q1, new Vector3(1, 0, 0), col);
            Quad(p3, p0, q0, q3, new Vector3(-1, 0, 0), col);
        }

        public void Cyl(Vector3 baseCtr, float r, float height, int sides, Color col)
        {
            for (int s = 0; s < sides; s++)
            {
                float a0 = 2f * Mathf.PI * s / sides, a1 = 2f * Mathf.PI * (s + 1) / sides;
                Vector3 d0 = new Vector3(Mathf.Cos(a0), 0, Mathf.Sin(a0)), d1 = new Vector3(Mathf.Cos(a1), 0, Mathf.Sin(a1));
                Vector3 b0 = baseCtr + d0 * r, b1 = baseCtr + d1 * r;
                Vector3 t0 = b0 + Vector3.up * height, t1 = b1 + Vector3.up * height;
                Vector3 nn = (d0 + d1).normalized;
                Quad(b0, b1, t1, t0, nn, col);
            }
        }

        public void Cone(Vector3 baseCtr, float r, float height, int sides, Color col)
        {
            Vector3 apex = baseCtr + Vector3.up * height;
            for (int s = 0; s < sides; s++)
            {
                float a0 = 2f * Mathf.PI * s / sides, a1 = 2f * Mathf.PI * (s + 1) / sides;
                Vector3 b0 = baseCtr + new Vector3(Mathf.Cos(a0), 0, Mathf.Sin(a0)) * r;
                Vector3 b1 = baseCtr + new Vector3(Mathf.Cos(a1), 0, Mathf.Sin(a1)) * r;
                Vector3 nn = (Vector3.Cross(b1 - b0, apex - b0)).normalized;
                int i0 = v.Count;
                v.Add(b0); v.Add(b1); v.Add(apex);
                for (int k = 0; k < 3; k++) { n.Add(nn); c.Add(col); }
                t.Add(i0); t.Add(i0 + 1); t.Add(i0 + 2);
            }
        }

        public Mesh ToMesh(string name)
        {
            var m = new Mesh { name = name };
            m.SetVertices(v); m.SetNormals(n); m.SetColors(c); m.SetTriangles(t, 0);
            return m;
        }
    }

    // Low-poly taxi: body + greenhouse cabin + roof sign + 4 wheels. Forward +Z, sits on y=0.
    static Mesh BuildCarMesh()
    {
        var mb = new MB();
        Color yellow = new Color(0.93f, 0.74f, 0.16f);
        Color glass = new Color(0.13f, 0.15f, 0.19f);
        Color wheel = new Color(0.07f, 0.07f, 0.08f);
        Color amber = new Color(0.96f, 0.72f, 0.20f);
        mb.Box(new Vector3(0, 0.55f, 0f), new Vector3(1.6f, 0.55f, 3.1f), yellow);      // body
        mb.Box(new Vector3(0, 1.00f, -0.15f), new Vector3(1.34f, 0.5f, 1.5f), glass);   // cabin
        mb.Box(new Vector3(0, 1.30f, -0.1f), new Vector3(0.34f, 0.18f, 0.5f), amber);   // taxi roof sign
        float wx = 0.72f, wz = 1.02f;
        mb.Box(new Vector3(wx, 0.28f, wz), new Vector3(0.26f, 0.52f, 0.6f), wheel);
        mb.Box(new Vector3(-wx, 0.28f, wz), new Vector3(0.26f, 0.52f, 0.6f), wheel);
        mb.Box(new Vector3(wx, 0.28f, -wz), new Vector3(0.26f, 0.52f, 0.6f), wheel);
        mb.Box(new Vector3(-wx, 0.28f, -wz), new Vector3(0.26f, 0.52f, 0.6f), wheel);
        return mb.ToMesh("Taxi");
    }

    // NYC rooftop water tower: legs + wooden tank + conical roof. Base at y=0 (roof level).
    static Mesh BuildTowerMesh()
    {
        var mb = new MB();
        Color wood = new Color(0.52f, 0.35f, 0.22f);
        Color roof = new Color(0.28f, 0.28f, 0.31f);
        Color leg = new Color(0.30f, 0.24f, 0.18f);
        float lx = 1.5f;
        mb.Box(new Vector3(lx, 0.6f, lx), new Vector3(0.32f, 1.2f, 0.32f), leg);
        mb.Box(new Vector3(-lx, 0.6f, lx), new Vector3(0.32f, 1.2f, 0.32f), leg);
        mb.Box(new Vector3(lx, 0.6f, -lx), new Vector3(0.32f, 1.2f, 0.32f), leg);
        mb.Box(new Vector3(-lx, 0.6f, -lx), new Vector3(0.32f, 1.2f, 0.32f), leg);
        mb.Cyl(new Vector3(0, 1.2f, 0), 2.3f, 3.0f, 12, wood);
        mb.Cone(new Vector3(0, 4.2f, 0), 2.5f, 1.6f, 12, roof);
        return mb.ToMesh("WaterTower");
    }

    // Grey SUV — taller/boxier than the taxi. Forward +Z, sits on y=0.
    static Mesh BuildSuvMesh()
    {
        var mb = new MB();
        Color grey = new Color(0.42f, 0.44f, 0.47f);
        Color glass = new Color(0.13f, 0.15f, 0.19f);
        Color wheel = new Color(0.07f, 0.07f, 0.08f);
        mb.Box(new Vector3(0, 0.65f, 0f), new Vector3(1.7f, 0.7f, 3.4f), grey);       // body
        mb.Box(new Vector3(0, 1.15f, -0.1f), new Vector3(1.5f, 0.55f, 2.0f), glass);  // cabin
        float wx = 0.78f, wz = 1.15f;
        mb.Box(new Vector3(wx, 0.32f, wz), new Vector3(0.28f, 0.6f, 0.66f), wheel);
        mb.Box(new Vector3(-wx, 0.32f, wz), new Vector3(0.28f, 0.6f, 0.66f), wheel);
        mb.Box(new Vector3(wx, 0.32f, -wz), new Vector3(0.28f, 0.6f, 0.66f), wheel);
        mb.Box(new Vector3(-wx, 0.32f, -wz), new Vector3(0.28f, 0.6f, 0.66f), wheel);
        return mb.ToMesh("Suv");
    }

    // White box truck — cargo box + cab (front +Z). Sits on y=0.
    static Mesh BuildTruckMesh()
    {
        var mb = new MB();
        Color white = new Color(0.90f, 0.90f, 0.90f);
        Color cab = new Color(0.80f, 0.82f, 0.84f);
        Color glass = new Color(0.13f, 0.15f, 0.19f);
        Color wheel = new Color(0.07f, 0.07f, 0.08f);
        mb.Box(new Vector3(0, 1.5f, -0.3f), new Vector3(2.0f, 2.4f, 3.4f), white);     // cargo box (rear)
        mb.Box(new Vector3(0, 0.95f, 2.1f), new Vector3(1.9f, 1.5f, 1.5f), cab);       // cab (front)
        mb.Box(new Vector3(0, 1.45f, 2.85f), new Vector3(1.7f, 0.55f, 0.12f), glass);  // windshield
        float wx = 0.9f;
        mb.Box(new Vector3(wx, 0.4f, 1.7f), new Vector3(0.3f, 0.8f, 0.8f), wheel);
        mb.Box(new Vector3(-wx, 0.4f, 1.7f), new Vector3(0.3f, 0.8f, 0.8f), wheel);
        mb.Box(new Vector3(wx, 0.4f, -1.4f), new Vector3(0.3f, 0.8f, 0.8f), wheel);
        mb.Box(new Vector3(-wx, 0.4f, -1.4f), new Vector3(0.3f, 0.8f, 0.8f), wheel);
        return mb.ToMesh("Truck");
    }

    // Street lamp — pole + arm (reaching +X) + warm lamp head. Base at y=0.
    static Mesh BuildLampMesh()
    {
        var mb = new MB();
        Color pole = new Color(0.28f, 0.29f, 0.31f);
        Color head = new Color(0.95f, 0.86f, 0.55f);
        mb.Box(new Vector3(0, 3.5f, 0), new Vector3(0.25f, 7.0f, 0.25f), pole);   // pole
        mb.Box(new Vector3(0.9f, 6.9f, 0), new Vector3(1.8f, 0.2f, 0.2f), pole);  // arm
        mb.Box(new Vector3(1.7f, 6.7f, 0), new Vector3(0.5f, 0.35f, 0.5f), head); // lamp head
        return mb.ToMesh("Lamp");
    }

    // Traffic light — pole + arm (+X) + 3-light signal housing (faces +Z). Base at y=0.
    static Mesh BuildTrafficMesh()
    {
        var mb = new MB();
        Color pole = new Color(0.25f, 0.26f, 0.28f);
        Color box = new Color(0.15f, 0.16f, 0.18f);
        Color red = new Color(0.85f, 0.20f, 0.18f);
        Color amber = new Color(0.95f, 0.70f, 0.20f);
        Color grn = new Color(0.30f, 0.75f, 0.40f);
        mb.Box(new Vector3(0, 3.0f, 0), new Vector3(0.28f, 6.0f, 0.28f), pole);   // pole
        mb.Box(new Vector3(1.2f, 5.8f, 0), new Vector3(2.4f, 0.2f, 0.2f), pole);  // arm
        mb.Box(new Vector3(2.2f, 5.4f, 0), new Vector3(0.5f, 1.4f, 0.4f), box);   // housing
        mb.Box(new Vector3(2.2f, 5.85f, 0.22f), new Vector3(0.28f, 0.28f, 0.05f), red);
        mb.Box(new Vector3(2.2f, 5.40f, 0.22f), new Vector3(0.28f, 0.28f, 0.05f), amber);
        mb.Box(new Vector3(2.2f, 4.95f, 0.22f), new Vector3(0.28f, 0.28f, 0.05f), grn);
        return mb.ToMesh("Traffic");
    }

    // Empire-State-style landmark: setback box stack + mooring mast + tapered spire + antenna.
    // Centred x/z=0, base at y=0, ~500 world units tall. Pale limestone-silver.
    static Mesh BuildEsbMesh()
    {
        var mb = new MB();
        Color stone = new Color(0.82f, 0.83f, 0.86f);
        Color crown = new Color(0.74f, 0.76f, 0.80f);
        Color mast = new Color(0.66f, 0.68f, 0.73f);
        Color ant = new Color(0.30f, 0.30f, 0.33f);
        mb.Box(new Vector3(0, 35f, 0), new Vector3(120f, 70f, 120f), stone);   // base
        mb.Box(new Vector3(0, 100f, 0), new Vector3(96f, 60f, 96f), stone);    // setback 1
        mb.Box(new Vector3(0, 155f, 0), new Vector3(78f, 50f, 78f), stone);    // setback 2
        mb.Box(new Vector3(0, 255f, 0), new Vector3(60f, 150f, 60f), stone);   // main shaft
        mb.Box(new Vector3(0, 350f, 0), new Vector3(46f, 40f, 46f), crown);    // crown 1
        mb.Box(new Vector3(0, 385f, 0), new Vector3(32f, 30f, 32f), crown);    // crown 2
        mb.Cyl(new Vector3(0, 400f, 0), 10f, 30f, 12, mast);                   // mooring mast
        mb.Cone(new Vector3(0, 430f, 0), 8f, 40f, 12, mast);                   // tapered top
        mb.Box(new Vector3(0, 485f, 0), new Vector3(3f, 30f, 3f), ant);        // antenna
        return mb.ToMesh("Empire");
    }

    // Octahedron foliage blob, radius 1, centered at origin.
    static Mesh BuildCanopyMesh()
    {
        var m = new Mesh { name = "Canopy" };
        m.vertices = new[]
        {
            new Vector3(0, 1, 0), new Vector3(0, -1, 0),
            new Vector3(1, 0, 0), new Vector3(-1, 0, 0),
            new Vector3(0, 0, 1), new Vector3(0, 0, -1),
        };
        m.triangles = new[]
        {
            0, 4, 2, 0, 2, 5, 0, 5, 3, 0, 3, 4,   // top
            1, 2, 4, 1, 5, 2, 1, 3, 5, 1, 4, 3,   // bottom
        };
        m.RecalculateNormals();
        return m;
    }

    // Unit cube, x/z in [-0.5,0.5], y in [0,1]. 24 verts so each face has its own flat
    // normal (needed for the facade face-axis logic + correct lighting).
    static Mesh BuildCubeMesh()
    {
        var mesh = new Mesh { name = "BuildingCube" };
        var v = new List<Vector3>();
        var nrm = new List<Vector3>();
        var tri = new List<int>();

        void Face(Vector3 a, Vector3 b, Vector3 c, Vector3 dd, Vector3 nn)
        {
            int i0 = v.Count;
            v.Add(a); v.Add(b); v.Add(c); v.Add(dd);
            nrm.Add(nn); nrm.Add(nn); nrm.Add(nn); nrm.Add(nn);
            tri.Add(i0); tri.Add(i0 + 2); tri.Add(i0 + 1);
            tri.Add(i0); tri.Add(i0 + 3); tri.Add(i0 + 2);
        }

        Vector3 b0 = new Vector3(-0.5f, 0, -0.5f), b1 = new Vector3(0.5f, 0, -0.5f),
                b2 = new Vector3(0.5f, 0, 0.5f), b3 = new Vector3(-0.5f, 0, 0.5f);
        Vector3 t0 = new Vector3(-0.5f, 1, -0.5f), t1 = new Vector3(0.5f, 1, -0.5f),
                t2 = new Vector3(0.5f, 1, 0.5f), t3 = new Vector3(-0.5f, 1, 0.5f);

        Face(t0, t1, t2, t3, Vector3.up);
        Face(b3, b2, b1, b0, Vector3.down);
        Face(b0, b1, t1, t0, new Vector3(0, 0, -1));
        Face(b2, b3, t3, t2, new Vector3(0, 0, 1));
        Face(b1, b2, t2, t1, new Vector3(1, 0, 0));
        Face(b3, b0, t0, t3, new Vector3(-1, 0, 0));

        mesh.SetVertices(v);
        mesh.SetNormals(nrm);
        mesh.SetTriangles(tri, 0);
        return mesh;
    }
}
