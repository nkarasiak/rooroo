// River/harbour water — built-in RP. Animated normal ripples, fresnel, skybox reflection,
// sun glint. Port of the raymarch water block (city.frag.glsl:648-660). Cheap: one pass,
// only water pixels.
Shader "City/Water"
{
    SubShader
    {
        Tags { "RenderType" = "Opaque" }
        Pass
        {
            Tags { "LightMode" = "ForwardBase" }
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog
            #include "UnityCG.cginc"
            #include "Lighting.cginc"

            struct appdata { float4 vertex : POSITION; };
            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 wpos : TEXCOORD0;
                UNITY_FOG_COORDS(1)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.wpos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.pos = UnityObjectToClipPos(v.vertex);
                UNITY_TRANSFER_FOG(o, o.pos);
                return o;
            }

            // small ripple normal from a couple of scrolling sines
            float3 rippleNormal(float2 p, float t)
            {
                float2 a = p * 0.9 + float2(t * 0.6, t * 0.35);
                float2 b = p * 1.7 - float2(t * 0.4, t * 0.55);
                float nx = sin(a.x) * 0.5 + sin(b.y * 1.3) * 0.3;
                float nz = cos(a.y) * 0.5 + cos(b.x * 1.1) * 0.3;
                return normalize(float3(nx * 0.06, 1.0, nz * 0.06));
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float t = _Time.y;
                float3 vdir = normalize(_WorldSpaceCameraPos - i.wpos);
                float3 n = rippleNormal(i.wpos.xz * 0.02, t);

                // flat stylized water: soft teal, gentle fresnel lighten toward the sky tint
                float3 deep = float3(0.34, 0.56, 0.66);
                float3 shallow = float3(0.55, 0.74, 0.80);
                float fres = pow(1.0 - saturate(dot(n, vdir)), 3.0);
                float3 col = lerp(deep, shallow, saturate(0.25 + 0.55 * fres));

                // soft sun sheen (subtle)
                float3 r = reflect(-vdir, n);
                float3 L = normalize(_WorldSpaceLightPos0.xyz);
                float spec = pow(saturate(dot(r, L)), 60.0);
                col += float3(1, 0.98, 0.9) * spec * 0.5;

                fixed4 outc = fixed4(col, 1);
                UNITY_APPLY_FOG(i.fogCoord, outc);
                return outc;
            }
            ENDCG
        }
    }
    Fallback "Diffuse"
}
