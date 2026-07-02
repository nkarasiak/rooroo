// Flat-shaded low-poly building — built-in RP. Untitled-Goose-Game style: matte pastel
// colour per building (no textures), soft high-key wrap lighting, gentle shadows, clean
// sparse windows. Instanced; per-instance (top, seed).
Shader "City/Building"
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
            #pragma multi_compile_instancing
            #pragma multi_compile_fwdbase
            #pragma multi_compile_fog
            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            struct appdata { float4 vertex : POSITION; float3 normal : NORMAL; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 wpos : TEXCOORD0;
                float3 wnormal : TEXCOORD1;
                SHADOW_COORDS(2)
                UNITY_FOG_COORDS(3)
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            UNITY_INSTANCING_BUFFER_START(Props)
                UNITY_DEFINE_INSTANCED_PROP(float4, _InstData)   // x=top, y=seed
            UNITY_INSTANCING_BUFFER_END(Props)

            static const float SCALE = 100.0;
            float hash11(float p) { p = frac(p * 0.1031); p *= p + 33.33; p *= p + p; return frac(p); }

            // warm-stone palette, biased to tan/beige (5th-Ave illustration)
            float3 palette(float t)
            {
                int idx = (int)floor(t * 6.0);
                if (idx <= 0) return float3(0.86, 0.78, 0.60);   // tan
                if (idx == 1) return float3(0.90, 0.85, 0.72);   // beige
                if (idx == 2) return float3(0.82, 0.79, 0.70);   // warm stone
                if (idx == 3) return float3(0.80, 0.72, 0.52);   // pale ochre
                if (idx == 4) return float3(0.72, 0.74, 0.62);   // olive-grey
                return float3(0.74, 0.77, 0.80);                 // cool grey (distance variety)
            }

            v2f vert(appdata v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_TRANSFER_INSTANCE_ID(v, o);
                o.wpos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.wnormal = UnityObjectToWorldNormal(v.normal);
                o.pos = UnityObjectToClipPos(v.vertex);
                TRANSFER_SHADOW(o);
                UNITY_TRANSFER_FOG(o, o.pos);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);
                float4 d = UNITY_ACCESS_INSTANCED_PROP(Props, _InstData);
                float top = d.x, seed = d.y;
                float3 n = normalize(i.wnormal);
                float ysu = i.wpos.y / SCALE;

                float3 body = palette(hash11(seed));
                float3 col = body;

                if (n.y > 0.5)
                {
                    col = body * 0.92;                    // flat roof, barely darker
                }
                else
                {
                    // clean punched-window columns: darker recessed panes
                    float tang = abs(n.x) > abs(n.z) ? i.wpos.z : i.wpos.x;
                    float storeyH = 0.024, bayW = 0.026;
                    float2 cell = float2(frac(tang / SCALE / bayW), frac(ysu / storeyH));
                    float2 a = step(float2(0.25, 0.28), cell);
                    float2 b = step(cell, float2(0.75, 0.72));
                    float win = a.x * a.y * b.x * b.y;
                    float3 pane = body * 0.55 + float3(0.03, 0.04, 0.06);
                    col = lerp(body, pane, win * 0.9);

                    // storefront base — darker glassy shopfront band
                    float3 store = body * 0.50 + float3(0.02, 0.03, 0.05);
                    col = lerp(col, store, step(ysu, storeyH * 1.4));

                    // green cornice cap near the roofline
                    float corniceH = 0.012;
                    col = lerp(col, float3(0.20, 0.32, 0.24), step(top - corniceH, ysu));
                }

                // soft high-key wrap lighting + gentle shadow (never crushed to black)
                float3 L = normalize(_WorldSpaceLightPos0.xyz);
                float wrap = saturate(dot(n, L) * 0.5 + 0.5);       // half-lambert
                fixed sh = SHADOW_ATTENUATION(i);
                float shade = lerp(0.72, 1.0, sh);                  // shadows stay light
                float3 amb = ShadeSH9(float4(n, 1));
                col *= (_LightColor0.rgb * wrap * shade * 0.85 + amb + 0.12);

                fixed4 outc = fixed4(col, 1);
                UNITY_APPLY_FOG(i.fogCoord, outc);
                return outc;
            }
            ENDCG
        }

        Pass
        {
            Tags { "LightMode" = "ShadowCaster" }
            CGPROGRAM
            #pragma vertex vertS
            #pragma fragment fragS
            #pragma multi_compile_shadowcaster
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"
            struct appdataS { float4 vertex : POSITION; float3 normal : NORMAL; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct v2fS { V2F_SHADOW_CASTER; };
            v2fS vertS(appdataS v) { v2fS o; UNITY_SETUP_INSTANCE_ID(v); TRANSFER_SHADOW_CASTER_NORMALOFFSET(o) return o; }
            float4 fragS(v2fS i) : SV_Target { SHADOW_CASTER_FRAGMENT(i) }
            ENDCG
        }
    }
    Fallback "Diffuse"
}
