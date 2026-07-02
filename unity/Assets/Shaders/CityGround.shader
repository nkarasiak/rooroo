// Procedural NYC street surface — built-in RP, receives shadows. Asphalt roads along the
// block grid, sidewalks + curbs, painted lane lines, and crosswalks at intersections.
// All derived from world XZ (shader units = block coords). One big ground quad.
Shader "City/Ground"
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
            #pragma multi_compile_fwdbase
            #pragma multi_compile_fog
            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            struct appdata { float4 vertex : POSITION; float3 normal : NORMAL; };
            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 wpos : TEXCOORD0;
                SHADOW_COORDS(1)
                UNITY_FOG_COORDS(2)
            };

            static const float SCALE = 100.0;
            static const float M = 0.085;     // half road width (= building margin)
            static const float SW = 0.030;    // sidewalk width

            float h2(float2 p) { return frac(sin(dot(p, float2(41.3, 289.1))) * 43758.5); }

            v2f vert(appdata v)
            {
                v2f o;
                o.wpos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.pos = UnityObjectToClipPos(v.vertex);
                TRANSFER_SHADOW(o);
                UNITY_TRANSFER_FOG(o, o.pos);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 P = i.wpos.xz / SCALE;
                float2 cell = frac(P);
                // signed distance to nearest integer grid line per axis, in [-0.5,0.5]
                float2 s = cell - step(0.5, cell);   // = cell<0.5 ? cell : cell-1
                float2 e = abs(s);                   // dist to the road centre line per axis

                float roadX = step(e.x, M);          // avenue running along Z
                float roadZ = step(e.y, M);          // cross street running along X
                float road = max(roadX, roadZ);
                float inter = roadX * roadZ;

                float3 asphalt = float3(0.46, 0.47, 0.49) * (0.96 + 0.08 * h2(floor(P * 40.0)));
                float3 sidewalk = float3(0.70, 0.69, 0.66);
                float3 curb = float3(0.58, 0.58, 0.58);

                float3 col;
                if (road > 0.5)
                {
                    col = asphalt;

                    // lane markings for whichever road we're on (skip inside intersections)
                    if (roadX > 0.5 && inter < 0.5)
                    {
                        float dc = e.x;                       // 0 at centre .. M at curb
                        // double yellow centre
                        col = lerp(col, float3(0.75, 0.6, 0.1), step(dc, 0.004));
                        // dashed white lane line mid-lane, dashes along Z
                        float dash = step(0.5, frac(P.y * 12.0));
                        col = lerp(col, float3(0.8, 0.8, 0.8), step(abs(dc - M * 0.55), 0.0022) * dash);
                    }
                    if (roadZ > 0.5 && inter < 0.5)
                    {
                        float dc = e.y;
                        col = lerp(col, float3(0.75, 0.6, 0.1), step(dc, 0.004));
                        float dash = step(0.5, frac(P.x * 12.0));
                        col = lerp(col, float3(0.8, 0.8, 0.8), step(abs(dc - M * 0.55), 0.0022) * dash);
                    }

                    // crosswalk stripes just outside the intersection box
                    float xbandZ = step(e.y, M + 0.018) * step(M, e.y) * roadX;   // stripes across the avenue
                    float xbandX = step(e.x, M + 0.018) * step(M, e.x) * roadZ;
                    float stripesZ = step(0.5, frac(P.x * 60.0));
                    float stripesX = step(0.5, frac(P.y * 60.0));
                    col = lerp(col, float3(0.85, 0.85, 0.85), xbandZ * stripesZ);
                    col = lerp(col, float3(0.85, 0.85, 0.85), xbandX * stripesX);
                }
                else
                {
                    // sidewalk band, then a curb line, then base concrete under buildings
                    float onSidewalk = step(e.x, M + SW) + step(e.y, M + SW);
                    col = onSidewalk > 0.5 ? sidewalk : float3(0.52, 0.52, 0.52);
                    // curb line at the road edge
                    float curbLine = step(abs(e.x - M), 0.004) + step(abs(e.y - M), 0.004);
                    col = lerp(col, curb, saturate(curbLine));
                }

                float3 n = float3(0, 1, 0);
                float wrap = saturate(dot(n, normalize(_WorldSpaceLightPos0.xyz)) * 0.5 + 0.5);
                fixed sh = SHADOW_ATTENUATION(i);
                float shade = lerp(0.72, 1.0, sh);
                float3 lit = _LightColor0.rgb * wrap * shade * 0.85 + ShadeSH9(float4(n, 1)) + 0.12;
                col *= lit;

                fixed4 outc = fixed4(col, 1);
                UNITY_APPLY_FOG(i.fogCoord, outc);
                return outc;
            }
            ENDCG
        }
    }
    Fallback "Diffuse"
}
