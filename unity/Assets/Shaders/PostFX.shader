// Full-screen tonemap + vignette blit (built-in RP, via OnRenderImage). Cheap: one pass.
Shader "Hidden/PostFX"
{
    Properties { _MainTex ("", 2D) = "white" {} }
    SubShader
    {
        Cull Off ZWrite Off ZTest Always
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float _Exposure;
            float _Vignette;

            // ACES filmic (Narkowicz) — matches the raymarch tonemap
            float3 ACES(float3 x)
            {
                float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
                return saturate((x * (a * x + b)) / (x * (c * x + d) + e));
            }

            fixed4 frag(v2f_img i) : SV_Target
            {
                float3 col = tex2D(_MainTex, i.uv).rgb;
                col = ACES(col * _Exposure);

                // vignette
                float2 d = i.uv - 0.5;
                float v = 1.0 - dot(d, d) * _Vignette;
                col *= saturate(v);

                return fixed4(col, 1);
            }
            ENDCG
        }
    }
}
