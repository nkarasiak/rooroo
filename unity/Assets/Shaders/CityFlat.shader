// Flat-shaded vertex-coloured prop shader (cars, water towers, etc). Built-in RP,
// instanced, soft high-key wrap lighting + gentle shadows. Colour comes from the mesh.
Shader "City/Flat"
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

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                fixed4 color : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };
            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 wnormal : TEXCOORD0;
                fixed4 color : COLOR;
                SHADOW_COORDS(1)
                UNITY_FOG_COORDS(2)
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            v2f vert(appdata v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                o.wnormal = UnityObjectToWorldNormal(v.normal);
                o.color = v.color;
                o.pos = UnityObjectToClipPos(v.vertex);
                TRANSFER_SHADOW(o);
                UNITY_TRANSFER_FOG(o, o.pos);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float3 n = normalize(i.wnormal);
                float3 L = normalize(_WorldSpaceLightPos0.xyz);
                float wrap = saturate(dot(n, L) * 0.5 + 0.5);
                fixed sh = SHADOW_ATTENUATION(i);
                float shade = lerp(0.72, 1.0, sh);
                float3 amb = ShadeSH9(float4(n, 1));
                float3 col = i.color.rgb * (_LightColor0.rgb * wrap * shade * 0.85 + amb + 0.12);

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
