using UnityEngine;

// Minimal on-screen HUD via OnGUI (no TMP/Canvas setup needed) — port of src/main.js:46-53.
public class Hud : MonoBehaviour
{
    public PigeonController pigeon;

    float _fps;
    static readonly string[] ZONES = { "CITY", "PARK", "WATER" };

    void Update()
    {
        // smoothed fps
        _fps = Mathf.Lerp(_fps, 1f / Mathf.Max(Time.deltaTime, 1e-4f), 0.1f);
    }

    void OnGUI()
    {
        if (pigeon == null) return;
        var p = pigeon.PosShaderUnits;
        GUI.color = Color.white;
        GUI.Label(new Rect(10, 10, 500, 20), $"STATE {pigeon.StateName}");
        GUI.Label(new Rect(10, 28, 500, 20), $"ZONE  {ZONES[pigeon.Zone]}");
        GUI.Label(new Rect(10, 46, 500, 20), $"POS   {p.x:F2}, {p.y:F3}, {p.z:F2}");
        GUI.Label(new Rect(10, 64, 500, 20), $"FPS   {_fps:F0}");
    }
}
