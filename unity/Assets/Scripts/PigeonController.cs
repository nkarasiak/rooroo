using System.Collections.Generic;
using UnityEngine;

// Pigeon physics + input + camera. Verbatim port of src/pigeon.js.
//
// The simulation runs entirely in SHADER UNITS (same numbers as the web version) so it
// shares CityGen's AABB math directly. Only the camera transform is multiplied by
// CityGen.SCALE for display. This keeps the tuned feel identical and avoids scaling the
// physics constants.
[RequireComponent(typeof(Camera))]
public class PigeonController : MonoBehaviour
{
    public CityGen city;   // assign in Inspector

    // constants (shader units) — src/pigeon.js:6-11
    const float EYE_HEIGHT = 0.018f;
    const float BODY_RADIUS = 0.012f;
    const float LAND_GRAB = BODY_RADIUS + 0.02f;
    const float WALK_SPEED = 0.22f, WALK_RUN = 0.55f;
    const float FLY_SPEED = WALK_SPEED * 1.2f, FLY_FAST = 0.9f;
    const float FLAP_FORCE = 0.6f, GRAVITY = 1.6f, GLIDE_RATIO = 5f, LIFT_RESPONSE = 3f;
    const float MOUSE_SENS = 2.2f;   // tune to taste (JS used raw pixels * 0.0022)

    // spawn — src/pigeon.js:13
    static readonly Vector3 SPAWN = new Vector3(0.05f, 0f, 4.05f);
    const float SPAWN_YAW = 0f;

    // state (P) — src/pigeon.js:14-19
    float px, py, pz, yaw, pitch, vx, vy, vz, surfaceY, bob;
    bool moving;
    enum State { WALKING, FLYING }
    State state;

    readonly List<CityGen.LotAABB> _near = new List<CityGen.LotAABB>();

    void Start()
    {
        Respawn();
        Cursor.lockState = CursorLockMode.Locked;
        Cursor.visible = false;
    }

    void Respawn()
    {
        px = SPAWN.x; pz = SPAWN.z; yaw = SPAWN_YAW; pitch = 0f;
        vx = vy = vz = 0f; state = State.WALKING; surfaceY = 0f; py = EYE_HEIGHT;
    }

    // '2' — perch on tallest lot just south of the park — src/pigeon.js:26-39
    void Perch()
    {
        CityGen.LotAABB best = default; bool have = false;
        for (int i = -3; i <= 3; i++)
        {
            var a = city.BuildingAt(i, -8);
            if (a == null) continue;
            foreach (var b in a) if (!have || b.top > best.top) { best = b; have = true; }
        }
        if (!have) { Respawn(); return; }
        px = (best.minX + best.maxX) * 0.5f;
        pz = best.minZ;
        py = best.top + EYE_HEIGHT;
        yaw = 0f; pitch = -0.45f;
        vx = vy = vz = 0f;
        state = State.WALKING; surfaceY = best.top;
    }

    float GetSurfaceY(float x, float z)
    {
        float surf = 0f;
        city.NearbyBuildings(x, z, _near);
        foreach (var a in _near)
            if (x > a.minX - LAND_GRAB && x < a.maxX + LAND_GRAB &&
                z > a.minZ - LAND_GRAB && z < a.maxZ + LAND_GRAB)
                if (surf < a.top) surf = a.top;
        return surf;
    }

    void ResolveXZ()
    {
        city.NearbyBuildings(px, pz, _near);
        foreach (var a in _near)
        {
            if (py >= a.top + EYE_HEIGHT - 0.004f) continue;
            float cx = (a.minX + a.maxX) * 0.5f, cz = (a.minZ + a.maxZ) * 0.5f;
            float halfW = (a.maxX - a.minX) * 0.5f + BODY_RADIUS;
            float halfD = (a.maxZ - a.minZ) * 0.5f + BODY_RADIUS;
            float dx = Mathf.Abs(px - cx), dz = Mathf.Abs(pz - cz);
            if (dx >= halfW || dz >= halfD) continue;
            float ox = halfW - dx, oz = halfD - dz;
            if (ox < oz) { px += ox * Sign(px - cx); if (state == State.FLYING) vx = 0f; }
            else { pz += oz * Sign(pz - cz); if (state == State.FLYING) vz = 0f; }
        }
    }

    void PerchRoof(float top)
    {
        py = top + EYE_HEIGHT; surfaceY = top;
        vx = vy = vz = 0f; state = State.WALKING;
    }

    // Flying collision: walls solid, land only when descending onto a cleared roof — src/pigeon.js:81-102
    void ResolveFlying()
    {
        city.NearbyBuildings(px, pz, _near);
        foreach (var a in _near)
        {
            if (py >= a.top + EYE_HEIGHT) continue;
            float cx = (a.minX + a.maxX) * 0.5f, cz = (a.minZ + a.maxZ) * 0.5f;
            float halfW = (a.maxX - a.minX) * 0.5f + BODY_RADIUS;
            float halfD = (a.maxZ - a.minZ) * 0.5f + BODY_RADIUS;
            float dx = Mathf.Abs(px - cx), dz = Mathf.Abs(pz - cz);
            if (dx >= halfW || dz >= halfD) continue;
            float ox = halfW - dx, oz = halfD - dz;
            if (ox < oz) { px += ox * Sign(px - cx); vx = 0f; }
            else { pz += oz * Sign(pz - cz); vz = 0f; }
        }

        float bestTop = 0f; bool over = false;
        city.NearbyBuildings(px, pz, _near);
        foreach (var a in _near)
            if (px > a.minX - LAND_GRAB && px < a.maxX + LAND_GRAB &&
                pz > a.minZ - LAND_GRAB && pz < a.maxZ + LAND_GRAB && a.top > bestTop)
            { bestTop = a.top; over = true; }

        if (vy <= 0f && over && py >= bestTop && py <= bestTop + EYE_HEIGHT) { PerchRoof(bestTop); return; }
        if (vy <= 0f && py <= EYE_HEIGHT) { py = EYE_HEIGHT; surfaceY = 0f; vx = vy = vz = 0f; state = State.WALKING; }
    }

    void Jump()   // src/pigeon.js:105-113
    {
        if (state != State.FLYING)
        {
            state = State.FLYING; vy = FLAP_FORCE;
            vx = -Mathf.Sin(yaw) * FLY_SPEED * 0.12f;
            vz = -Mathf.Cos(yaw) * FLY_SPEED * 0.12f;
        }
        else vy = Mathf.Min(vy + FLAP_FORCE * 0.55f, FLAP_FORCE);
    }

    void Update()
    {
        HandleMouseAndKeys();

        float dt = Mathf.Min(Time.deltaTime, 0.05f);   // src/main.js:11
        // basis — src/pigeon.js:116-117
        Vector3 fwd = new Vector3(-Mathf.Sin(yaw), 0, -Mathf.Cos(yaw));
        // rgt negated vs the JS source: the sim is right-handed but Unity's camera basis
        // (LookRotation) is left-handed, so camera.right = -X here. Flip to unswap A/D.
        Vector3 rgt = new Vector3(-Mathf.Cos(yaw), 0, Mathf.Sin(yaw));
        bool sprint = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);

        if (state != State.FLYING)
        {
            float spd = sprint ? WALK_RUN : WALK_SPEED;
            float mx = 0, mz = 0;
            if (Input.GetKey(KeyCode.W)) { mx += fwd.x * spd; mz += fwd.z * spd; }
            if (Input.GetKey(KeyCode.S)) { mx -= fwd.x * spd; mz -= fwd.z * spd; }
            if (Input.GetKey(KeyCode.A)) { mx -= rgt.x * spd; mz -= rgt.z * spd; }
            if (Input.GetKey(KeyCode.D)) { mx += rgt.x * spd; mz += rgt.z * spd; }
            moving = (mx != 0 || mz != 0);
            if (moving) bob += dt * 9f;
            px += mx * dt; pz += mz * dt;
            ResolveXZ();
            float newSurf = GetSurfaceY(px, pz);
            if (newSurf < surfaceY - 0.05f)
            {
                state = State.FLYING; vx = 0f; vy = -0.05f; vz = 0f; surfaceY = newSurf;
            }
            else
            {
                surfaceY = newSurf;
                float b = moving ? Mathf.Sin(bob) * 0.003f : 0f;
                py = surfaceY + EYE_HEIGHT + b;
            }
        }
        else
        {
            vy -= GRAVITY * dt;
            float wx = 0, wz = 0;
            if (Input.GetKey(KeyCode.W)) { wx += fwd.x; wz += fwd.z; }
            if (Input.GetKey(KeyCode.S)) { wx -= fwd.x; wz -= fwd.z; }
            if (Input.GetKey(KeyCode.A)) { wx -= rgt.x; wz -= rgt.z; }
            if (Input.GetKey(KeyCode.D)) { wx += rgt.x; wz += rgt.z; }
            if (wx != 0 || wz != 0)
            {
                float len = Mathf.Sqrt(wx * wx + wz * wz);
                float s = (sprint ? FLY_FAST : FLY_SPEED) / len;
                wx *= s; wz *= s;
                vx += (wx - vx) * dt * 4f; vz += (wz - vz) * dt * 4f;
            }
            else { vx *= 1f - dt * 0.6f; vz *= 1f - dt * 0.6f; }

            float hSpeed = Mathf.Sqrt(vx * vx + vz * vz);
            float sink = -hSpeed / GLIDE_RATIO;
            if (vy < sink) vy += (sink - vy) * Mathf.Min(1f, dt * LIFT_RESPONSE);
            px += vx * dt; py += vy * dt; pz += vz * dt;
            ResolveFlying();
        }

        ApplyCamera();
    }

    void HandleMouseAndKeys()
    {
        // mouse look — src/pigeon.js:166-170
        yaw -= Input.GetAxisRaw("Mouse X") * MOUSE_SENS * Time.deltaTime;
        pitch = Mathf.Clamp(pitch - Input.GetAxisRaw("Mouse Y") * MOUSE_SENS * Time.deltaTime, -1.1f, 1.1f);

        if (Input.GetKeyDown(KeyCode.Space)) Jump();
        if (Input.GetKeyDown(KeyCode.R)) Respawn();
        if (Input.GetKeyDown(KeyCode.Alpha2)) Perch();
        if (Input.GetKeyDown(KeyCode.Escape)) { Cursor.lockState = CursorLockMode.None; Cursor.visible = true; }
        if (Cursor.lockState == CursorLockMode.None && Input.GetMouseButtonDown(0))
        { Cursor.lockState = CursorLockMode.Locked; Cursor.visible = false; }
    }

    void ApplyCamera()
    {
        // look dir from yaw/pitch (right-handed, yaw=0 -> -Z north; internally consistent).
        Vector3 dir = new Vector3(
            -Mathf.Sin(yaw) * Mathf.Cos(pitch),
            Mathf.Sin(pitch),
            -Mathf.Cos(yaw) * Mathf.Cos(pitch));
        transform.position = new Vector3(px, py, pz) * CityGen.SCALE;
        transform.rotation = Quaternion.LookRotation(dir, Vector3.up);
    }

    static float Sign(float x) => x >= 0f ? 1f : -1f;   // matches JS Math.sign(x || 1) for the ==0 case

    // expose for HUD
    public string StateName => state.ToString();
    public Vector3 PosShaderUnits => new Vector3(px, py, pz);
    public int Zone => CityGen.RegionType(Mathf.FloorToInt(px), Mathf.FloorToInt(pz));
}
