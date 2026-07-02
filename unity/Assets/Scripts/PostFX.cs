using UnityEngine;

// Camera post blit: ACES tonemap + vignette (built-in RP). Cheap single pass.
[RequireComponent(typeof(Camera))]
[ExecuteAlways]
public class PostFX : MonoBehaviour
{
    public float exposure = 0.92f;   // palette already bright; avoid blow-out
    public float vignette = 0.08f;   // minimal — clean airy frame

    Material _mat;

    void OnRenderImage(RenderTexture src, RenderTexture dst)
    {
        if (_mat == null)
        {
            var sh = Shader.Find("Hidden/PostFX");
            if (sh == null) { Graphics.Blit(src, dst); return; }
            _mat = new Material(sh) { hideFlags = HideFlags.HideAndDontSave };
        }
        _mat.SetFloat("_Exposure", exposure);
        _mat.SetFloat("_Vignette", vignette);
        Graphics.Blit(src, dst, _mat);
    }
}
