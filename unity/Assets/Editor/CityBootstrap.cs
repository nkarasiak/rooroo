using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;

// Headless project bootstrap: builds materials + scene + component wiring so the whole
// thing runs with no manual editor work. Invoke via:
//   Unity.exe -batchmode -quit -projectPath unity -executeMethod CityBootstrap.Run
// Uses the built-in render pipeline + Standard shader (GPU instancing enabled).
public static class CityBootstrap
{
    public static void Run()
    {
        var mats = BuildMaterials();

        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        SetupEnvironment();

        // Camera rig (Camera is required by PigeonController)
        var camGo = new GameObject("Main Camera");
        camGo.tag = "MainCamera";
        var cam = camGo.AddComponent<Camera>();
        cam.nearClipPlane = 0.1f;
        cam.farClipPlane = 2000f;
        cam.fieldOfView = 60f;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.30f, 0.56f, 0.80f);   // flat illustration blue
        var pigeon = camGo.AddComponent<PigeonController>();
        var hud = camGo.AddComponent<Hud>();
        camGo.AddComponent<PostFX>();
        camGo.AddComponent<Screenshotter>();

        // City
        var cityGo = new GameObject("City");
        var city = cityGo.AddComponent<CityGen>();
        city.buildingMat = mats.building;
        city.groundMat = mats.ground;
        city.parkMat = mats.park;
        city.waterMat = mats.water;
        city.trunkMat = mats.trunk;
        city.canopyMat = mats.canopy;
        city.flatMat = mats.flat;

        // wire refs
        pigeon.city = city;
        hud.pigeon = pigeon;

        // Sun — light forward = -sunDir (shader sunDir = dir TO sun)
        var lightGo = new GameObject("Sun");
        var light = lightGo.AddComponent<Light>();
        light.type = LightType.Directional;
        light.color = new Color(1f, 0.98f, 0.93f);   // soft warm sun
        light.intensity = 1.0f;                        // gentle — most fill comes from ambient
        light.shadows = LightShadows.Soft;
        // higher sun (shorter shadows), from upper-right like the reference
        lightGo.transform.rotation = Quaternion.LookRotation(-new Vector3(0.45f, 0.92f, 0.35f).normalized);

        // shadow quality tuned for the SCALE=100 world on an integrated GPU
        QualitySettings.shadows = ShadowQuality.All;
        QualitySettings.shadowResolution = ShadowResolution.Medium;
        QualitySettings.shadowDistance = 700f;
        QualitySettings.shadowCascades = 2;

        // Save scene + build settings
        System.IO.Directory.CreateDirectory("Assets/Scenes");
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Main.unity");
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene("Assets/Scenes/Main.unity", true) };

        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("CityBootstrap: scene + materials + wiring done.");
    }

    // Headless standalone build — verifies the scene loads + compiles into a runnable exe.
    public static void BuildWin()
    {
        var opts = new BuildPlayerOptions
        {
            scenes = new[] { "Assets/Scenes/Main.unity" },
            locationPathName = "Build/Pigeon.exe",
            target = BuildTarget.StandaloneWindows64,
            options = BuildOptions.None,
        };
        var summary = BuildPipeline.BuildPlayer(opts).summary;
        Debug.Log($"BuildWin: result={summary.result} errors={summary.totalErrors} size={summary.totalSize}");
        if (summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
            EditorApplication.Exit(2);
    }

    struct Mats { public Material building, ground, park, water, trunk, canopy, flat; }

    static Mats BuildMaterials()
    {
        System.IO.Directory.CreateDirectory("Assets/Materials");

        var building = new Material(Shader.Find("City/Building")) { name = "Building" };
        building.enableInstancing = true;
        AssetDatabase.CreateAsset(building, "Assets/Materials/Building.mat");

        var water = new Material(Shader.Find("City/Water")) { name = "Water" };
        AssetDatabase.CreateAsset(water, "Assets/Materials/Water.mat");

        return BuildRest(building, water);
    }

    static Material GroundMat()
    {
        var g = new Material(Shader.Find("City/Ground")) { name = "Ground" };
        AssetDatabase.CreateAsset(g, "Assets/Materials/Ground.mat");
        return g;
    }

    static Mats BuildRest(Material building, Material water)
    {

        return new Mats
        {
            building = building,
            water = water,
            ground = GroundMat(),
            park = Mat("Park", new Color(0.52f, 0.66f, 0.40f)),
            trunk = Mat("Trunk", new Color(0.50f, 0.38f, 0.28f)),
            canopy = Mat("Canopy", new Color(0.40f, 0.58f, 0.36f)),
            flat = FlatMat(),
        };
    }

    static Material FlatMat()
    {
        var m = new Material(Shader.Find("City/Flat")) { name = "Flat" };
        m.enableInstancing = true;
        AssetDatabase.CreateAsset(m, "Assets/Materials/Flat.mat");
        return m;
    }

    // Flat illustration sky: solid blue clear (set on the camera) + light atmospheric haze.
    static void SetupEnvironment()
    {
        // no procedural skybox — the camera clears to a flat blue (see Run)
        RenderSettings.skybox = null;

        // ambient: cool-blue sky fill, warm-neutral ground so tan facades stay warm
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color(0.58f, 0.70f, 0.86f);
        RenderSettings.ambientEquatorColor = new Color(0.66f, 0.66f, 0.64f);
        RenderSettings.ambientGroundColor = new Color(0.52f, 0.50f, 0.46f);

        // light atmospheric perspective — pale haze pales distant towers + the hero
        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogColor = new Color(0.72f, 0.82f, 0.92f);
        RenderSettings.fogDensity = 0.00025f;
    }

    static Material Mat(string name, Color c)
    {
        var m = new Material(Shader.Find("Standard")) { name = name };
        m.color = c;
        m.SetFloat("_Glossiness", 0.1f);
        m.enableInstancing = true;
        AssetDatabase.CreateAsset(m, $"Assets/Materials/{name}.mat");
        return m;
    }
}
