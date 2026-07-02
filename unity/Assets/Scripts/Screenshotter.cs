using System.Collections;
using System.IO;
using UnityEngine;

// Screenshot mode: launch the player with `-shoot` to fly the camera through preset
// poses and capture PNGs to persistentDataPath, then quit. Disabled in normal play.
[RequireComponent(typeof(Camera))]
public class Screenshotter : MonoBehaviour
{
    struct Pose { public Vector3 pos, look; public float fov; public Pose(Vector3 p, Vector3 l, float f = 60f) { pos = p; look = l; fov = f; } }

    static bool HasArg(string a)
    {
        foreach (var s in System.Environment.GetCommandLineArgs()) if (s == a) return true;
        return false;
    }

    void Start()
    {
        if (!HasArg("-shoot")) { enabled = false; return; }
        var pc = GetComponent<PigeonController>(); if (pc) pc.enabled = false;
        var hud = GetComponent<Hud>(); if (hud) hud.enabled = false;
        StartCoroutine(Shoot());
    }

    IEnumerator Shoot()
    {
        // world units (SCALE=100). midtown ~z=-400, financial ~z=1000, park z[-2200..-900] x[-300..300]
        var poses = new[]
        {
            new Pose(new Vector3(0, 500, 1900), new Vector3(0, 60, -300)),      // aerial skyline, looking N over island
            new Pose(new Vector3(0, 24, -8), new Vector3(0, 120, 1250), 74f),    // shot1: low on the x=0 avenue, wide FOV, looking S down the canyon to the ESB hero
            new Pose(new Vector3(0, 220, -1500), new Vector3(0, 20, -1900)),     // over Central Park (trees), looking down
            new Pose(new Vector3(-820, 90, -300), new Vector3(-300, 20, -300)),  // over west river, looking E at city + water
        };

        yield return null;              // let CityGen.Start build the world
        yield return new WaitForEndOfFrame();

        for (int k = 0; k < poses.Length; k++)
        {
            transform.position = poses[k].pos;
            transform.rotation = Quaternion.LookRotation(poses[k].look - poses[k].pos, Vector3.up);
            GetComponent<Camera>().fieldOfView = poses[k].fov;
            for (int f = 0; f < 3; f++) yield return new WaitForEndOfFrame();

            string p = Path.Combine(Application.persistentDataPath, $"shot{k}.png");
            ScreenCapture.CaptureScreenshot(p, 1);
            Debug.Log("SHOT " + p);
            for (int f = 0; f < 25; f++) yield return null;   // allow async write
        }
        Application.Quit();
    }
}
