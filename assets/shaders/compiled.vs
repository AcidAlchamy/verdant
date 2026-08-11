{@}common.glsl{@}
#define PI  3.141592653589793
#define TAU 6.283185307179586

float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
vec2  hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3*.1031); p3 += dot(p3, p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }

float vnoise(vec3 x){
    vec3 i = floor(x), f = fract(x);
    f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash13(i+vec3(0,0,0)), hash13(i+vec3(1,0,0)), f.x),
                   mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x),
                   mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p, int oct){
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 6; i++){ if (i >= oct) break; s += a*vnoise(p); p *= 2.02; a *= 0.5; }
    return s;
}
float sat(float x){ return clamp(x, 0.0, 1.0); }
vec3  sat3(vec3 x){ return clamp(x, 0.0, 1.0); }
float remap(float x, float a, float b){ return sat((x-a)/(b-a)); }
float ease(float x){ return x*x*(3.0-2.0*x); }
float easeOut(float x){ return 1.0 - pow(1.0-x, 3.0); }
float easeIn(float x){ return x*x*x; }

// Rodrigues-lite: build a basis that points +Y along dir.
mat3 basisFromUp(vec3 up){
    vec3 a = abs(up.y) > 0.99 ? vec3(1,0,0) : vec3(0,1,0);
    vec3 x = normalize(cross(a, up));
    vec3 z = cross(up, x);
    return mat3(x, up, z);
}
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c,-s,s,c); }

{@}curl.glsl{@}
// Curl of an analytic trigonometric potential field.
//
// The usual route is snoiseVec3() sampled four times to approximate the partial
// derivatives — that is ~96 trig evaluations per lookup. Because our potential is
// built from sines directly, the partials are known in closed form: we pay 18 trig
// calls and get a divergence-free field that is *exactly* correct rather than
// approximately. Cheap enough to run on 16k particles on integrated graphics.
vec3 curlNoise(vec3 p, float t){
    float x = p.x, y = p.y, z = p.z;

    // Potential psi = (P1, P2, P3)
    // P1 = sin(y*a)*cos(z*b) + sin(z*c + t)
    // P2 = sin(z*d)*cos(x*e) + sin(x*f - t)
    // P3 = sin(x*g)*cos(y*h) + sin(y*i + t*0.7)
    const float a=1.31, b=0.87, c=0.53, d=1.11, e=0.97, f=0.61, g=1.23, h=0.79, i=0.47;

    float dP1_dy =  a*cos(y*a)*cos(z*b);
    float dP1_dz = -b*sin(y*a)*sin(z*b) + c*cos(z*c + t);
    float dP2_dz =  d*cos(z*d)*cos(x*e);
    float dP2_dx = -e*sin(z*d)*sin(x*e) + f*cos(x*f - t);
    float dP3_dx =  g*cos(x*g)*cos(y*h);
    float dP3_dy = -h*sin(x*g)*sin(y*h) + i*cos(y*i + t*0.7);

    return vec3(dP3_dy - dP2_dz,
                dP1_dz - dP3_dx,
                dP2_dx - dP1_dy);
}

{@}sdf.glsl{@}
// Leaf silhouette. uv in [0,1]^2, stem at uv.y = 0, tip at uv.y = 1.
// Half-width follows a beta-like profile so the base is round and the tip is a point.
float leafHalfWidth(float t, float wide, float tip){
    float w = pow(max(t, 0.0), 0.55) * pow(max(1.0 - t, 0.0), tip);
    return w * wide;
}
float leafMask(vec2 uv, float wide, float tip, float serration){
    float t = uv.y;
    float w = leafHalfWidth(t, wide, tip);
    w *= 1.0 + serration * sin(t * 34.0);
    float d = abs(uv.x - 0.5) - w;
    return 1.0 - smoothstep(-0.006, 0.006, d);
}
// Vein structure: 1 at the ribs, 0 in the blade.
float leafVeins(vec2 uv, float count){
    float t = uv.y;
    float x = (uv.x - 0.5);
    float mid = 1.0 - smoothstep(0.0, 0.012 * (1.0 - t*0.6), abs(x));
    float sweep = x * 5.5 * (1.0 - t*0.35) + t * count;
    float side = abs(fract(sweep) - 0.5) * 2.0;
    side = 1.0 - smoothstep(0.55, 0.95, side);
    side *= smoothstep(0.02, 0.16, t) * (1.0 - smoothstep(0.72, 0.99, t));
    return max(mid, side * 0.55);
}
// Petal: rounder than a leaf, with a soft notch at the tip.
float petalMask(vec2 uv, float wide, float notch){
    float t = uv.y;
    float w = pow(sin(PI * clamp(t, 0.0, 1.0)), 0.72) * wide;
    w *= 1.0 - notch * smoothstep(0.86, 1.0, t) * (1.0 - abs(uv.x-0.5)*3.0);
    float d = abs(uv.x - 0.5) - w;
    return 1.0 - smoothstep(-0.01, 0.01, d);
}

{@}atmos.glsl{@}
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uSkyTop;
uniform vec3  uSkyHorizon;
uniform vec3  uFogColor;
uniform float uFogDensity;
uniform float uFogHeight;

vec3 skyColor(vec3 rd){
    float h = rd.y * 0.5 + 0.5;
    vec3 c = mix(uSkyHorizon, uSkyTop, pow(sat(h), 0.72));
    float sun = sat(dot(rd, normalize(uSunDir)));
    c += uSunColor * pow(sun, 220.0) * 3.4;            // disc
    c += uSunColor * pow(sun, 7.0)  * 0.30;            // inner glow
    c += uSunColor * pow(sun, 2.0)  * 0.030;           // wide bloom in the haze
    c += uSkyHorizon * pow(1.0 - abs(rd.y), 8.0) * 0.28;
    return c;
}
// Height-attenuated exponential fog. Ground haze sits low and thick.
vec3 applyFog(vec3 col, float dist, vec3 worldPos, vec3 rd){
    float hf   = exp(-max(worldPos.y - uFogHeight, 0.0) * 0.16);
    float f    = 1.0 - exp(-dist * uFogDensity * hf);
    float back = pow(sat(dot(rd, normalize(uSunDir))), 5.0);
    vec3  fc   = mix(uFogColor, uSunColor, back * 0.55);
    return mix(col, fc, sat(f));
}

{@}lighting.glsl{@}
// Wrapped diffuse — foliage does not go black on the shadow side.
float wrapDiffuse(vec3 n, vec3 l, float w){
    return sat((dot(n, l) + w) / (1.0 + w));
}
// Cheap two-sided translucency. This is the single most important term for
// making leaves read as *alive*: light bleeding through the blade from behind.
float backScatter(vec3 n, vec3 l, vec3 v, float power, float scale){
    vec3 h = normalize(l + n * 0.28);
    return pow(sat(dot(v, -h)), power) * scale;
}
float fresnel(vec3 n, vec3 v, float p){
    return pow(1.0 - sat(dot(n, v)), p);
}
vec3 aces(vec3 x){
    const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
    return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}

{@}wind.glsl{@}
uniform float uWindStrength;
uniform float uWindSpeed;
// uTime comes from the global preamble the loader injects into every stage.

// Two-band wind: a slow travelling gust plus a fast flutter. Amplitude is scaled
// by the caller with a stiffness term so trunks barely move and leaf tips whip.
vec3 windOffset(vec3 worldPos, float phase, float stiffness){
    float t = uTime * uWindSpeed;
    float gust  = sin(worldPos.x * 0.16 + worldPos.z * 0.11 + t * 0.55 + phase);
    gust       *= 0.6 + 0.4 * sin(t * 0.21 + phase * 2.1);
    float flut  = sin(t * 3.1 + phase * 9.7) * 0.34 + sin(t * 5.3 + phase * 4.1) * 0.18;
    float amp   = uWindStrength * stiffness;
    return vec3(gust * amp, flut * amp * 0.22, gust * amp * 0.55 + flut * amp * 0.3);
}

{@}screen.vs{@}
#!SHADER
out vec2 vUv;
void main(){
    // Fullscreen triangle from gl_VertexID — no attribute buffer, no VAO binding.
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}

{@}sky.fs{@}
#!UNIFORMS
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform float uStarFade;
uniform float uCloud;
uniform float uCloudSharp;
#!SHADER
in vec2 vUv;
out vec4 fragColor;
void main(){
    vec4 ndc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec4 w = uInvViewProj * ndc;
    vec3 rd = normalize(w.xyz / w.w - uCameraPos);

    vec3 c = skyColor(rd);

    // Cirrus. The ray is projected onto a flat plane overhead, so the noise
    // stretches toward the horizon on its own and never needs a second octave
    // set for perspective. Lit from the sun's side, dark on the other.
    if (uCloud > 0.001 && rd.y > 0.0){
        vec3 cp = rd / max(rd.y, 0.055) * 0.30;
        cp.xz += uTime * 0.0035;
        float n = fbm(vec3(cp.x, cp.z * 2.6, 4.0), 5);
        float cl = smoothstep(0.40, uCloudSharp, n) * smoothstep(0.0, 0.24, rd.y);
        float sun = sat(dot(rd, normalize(uSunDir)));
        vec3 lit = mix(uFogColor * 1.15, uSunColor * 1.25, pow(sun, 2.5) * 0.85 + 0.10);
        c = mix(c, lit, sat(cl * uCloud));
    }

    // Stars, only while the grade is dark enough to earn them.
    if (uStarFade > 0.001){
        vec3 sp = rd * 90.0;
        vec3 id = floor(sp);
        float n = hash13(id);
        float star = pow(sat(1.0 - length(fract(sp) - 0.5) * 2.4), 34.0);
        star *= step(0.9955, n) * (0.45 + 0.55 * sin(uTime * 1.7 + n * 60.0));
        c += vec3(0.72, 0.80, 1.0) * star * uStarFade * sat(rd.y * 2.0);
    }
    fragColor = vec4(c, 1.0);
}

{@}ground.vs{@}
#!ATTRIBUTES
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aUv;
#!UNIFORMS
uniform mat4 uViewProj;
uniform float uGroundLift;
#!VARYINGS
out vec3 vWorld;
out vec2 vUv;
out float vHeight;
#!SHADER
void main(){
    vec3 p = aPosition;
    // Terrain is flattened to exactly y = 0 at the trunk so the tree, the seed
    // and the opening camera all share a known ground plane, then allowed to
    // roll freely once it is far enough away to be scenery.
    float roll = smoothstep(0.0, 16.0, length(p.xz));
    float h = ((fbm(vec3(p.x, 0.0, p.z) * 0.055, 4) - 0.5) * 2.8
             + (fbm(vec3(p.x, 7.3, p.z) * 0.31, 3) - 0.5) * 0.44) * roll;
    h += smoothstep(5.5, 0.0, length(p.xz)) * 0.34;   // root flare mounds the soil
    p.y += h * uGroundLift;
    vHeight = h;
    vWorld = p;
    vUv = aUv;
    gl_Position = uViewProj * vec4(p, 1.0);
}

{@}ground.fs{@}
#!UNIFORMS
uniform vec3 uCameraPos;
uniform vec3 uSoilDark;
uniform vec3 uSoilLight;
uniform vec3 uMossColor;
uniform float uMossAmount;
#!VARYINGS
in vec3 vWorld;
in vec2 vUv;
in float vHeight;
#!SHADER
out vec4 fragColor;
void main(){
    vec3 v = normalize(uCameraPos - vWorld);
    float d = length(uCameraPos - vWorld);

    float grain = fbm(vWorld * 2.4, 4);

    // Chapter two puts the camera underground. Rather than build a cutaway, the
    // soil is shaded from beneath as a dense earth ceiling — no sun reaches it,
    // and the heavy brown fog closes the rest of the void.
    if (uCameraPos.y < vWorld.y){
        vec3 sub = uSoilDark * (0.55 + grain * 1.5);
        sub *= 0.35 + 0.65 * exp(-d * 0.35);
        fragColor = vec4(applyFog(sub, d, vWorld, -v), 1.0);
        return;
    }

    // Normal from the same fbm the vertex stage used, differentiated on screen.
    float e = 0.35;
    float hx = fbm(vec3(vWorld.x+e, 0.0, vWorld.z) * 0.055, 3) - fbm(vec3(vWorld.x-e, 0.0, vWorld.z) * 0.055, 3);
    float hz = fbm(vec3(vWorld.x, 0.0, vWorld.z+e) * 0.055, 3) - fbm(vec3(vWorld.x, 0.0, vWorld.z-e) * 0.055, 3);
    float roll = smoothstep(0.0, 16.0, length(vWorld.xz));
    vec3 n = normalize(vec3(-hx * 3.6 * roll, 1.0, -hz * 3.6 * roll));

    float clumps = fbm(vWorld * 0.42 + 11.0, 3);

    vec3 soil = mix(uSoilDark, uSoilLight, sat(grain * 1.25 - 0.1));
    float moss = sat(smoothstep(0.42, 0.72, clumps) * uMossAmount * sat(n.y * 1.4));
    vec3 col = mix(soil, uMossColor * (0.72 + grain * 0.6), moss);

    vec3 l = normalize(uSunDir);
    float diff = wrapDiffuse(n, l, 0.55);
    float ao = sat(0.42 + vHeight * 0.22 + clumps * 0.3);
    col *= (0.16 + diff * 0.95) * ao;
    col += uSunColor * fresnel(n, v, 4.0) * 0.05;

    col = applyFog(col, d, vWorld, -v);
    fragColor = vec4(col, 1.0);
}

{@}grass.vs{@}
#!ATTRIBUTES
layout(location = 0) in vec2 aBlade;      // x: -1..1 across the blade, y: 0..1 up it
layout(location = 1) in vec4 aOffset;     // xyz world root, w height scale
layout(location = 2) in vec4 aParams;     // x rotation, y phase, z bend, w tint
#!UNIFORMS
uniform mat4 uViewProj;
uniform float uGrowth;
#!VARYINGS
out vec3 vWorld;
out float vUp;
out float vTint;
out vec3 vNormal;
#!SHADER
void main(){
    float grow = sat(uGrowth * 1.35 - hash11(aOffset.x * 12.9 + aOffset.z * 7.3) * 0.35);
    grow = easeOut(grow);

    float t = aBlade.y;
    float width = (1.0 - pow(t, 1.6)) * 0.036;
    float height = aOffset.w * grow;

    // Bend the blade along an arc, then let wind push the tip.
    float bend = aParams.z * t * t;
    vec3 local = vec3(aBlade.x * width, t * height, bend * height);
    local.xz = rot2(aParams.x) * local.xz;

    vec3 world = aOffset.xyz + local;
    world += windOffset(aOffset.xyz, aParams.y, t * t * 1.4);

    vec3 tangent = normalize(vec3(cos(aParams.x), 0.0, sin(aParams.x)));
    vNormal = normalize(cross(tangent, vec3(0.0, 1.0, 0.35)));
    vWorld  = world;
    vUp     = t;
    vTint   = aParams.w;
    gl_Position = uViewProj * vec4(world, 1.0);
}

{@}grass.fs{@}
#!UNIFORMS
uniform vec3 uCameraPos;
uniform vec3 uGrassBase;
uniform vec3 uGrassTip;
#!VARYINGS
in vec3 vWorld;
in float vUp;
in float vTint;
in vec3 vNormal;
#!SHADER
out vec4 fragColor;
void main(){
    vec3 v = normalize(uCameraPos - vWorld);
    vec3 l = normalize(uSunDir);
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;

    vec3 col = mix(uGrassBase, uGrassTip, pow(vUp, 0.7)) * (0.72 + vTint * 0.55);
    float diff = wrapDiffuse(n, l, 0.7);
    float trans = backScatter(n, l, v, 3.0, 1.0) * (0.35 + vUp * 0.85);

    col *= 0.20 + diff * 0.85;
    col += uSunColor * trans * 0.85 * uGrassTip;
    col *= mix(0.42, 1.0, vUp);                   // self-shadow toward the root

    col = applyFog(col, length(uCameraPos - vWorld), vWorld, -v);
    fragColor = vec4(col, 1.0);
}

{@}branch.vs{@}
#!ATTRIBUTES
layout(location = 0) in vec3 aPosition;   // unit cylinder, y 0..1
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aSeg0;       // xyz start, w radius start
layout(location = 3) in vec4 aSeg1;       // xyz end,   w radius end
layout(location = 4) in vec4 aMeta;       // x birth, y depth, z phase, w twist
#!UNIFORMS
uniform mat4 uViewProj;
uniform float uGrowth;
#!VARYINGS
out vec3 vWorld;
out vec3 vNormal;
out vec3 vBark;
out float vDepthN;
out float vAlong;
out float vSeed;
#!SHADER
void main(){
    // Each segment reveals itself by extending from its start point once the
    // growth front passes its birth time. No CPU work, no buffer rewrites.
    float birth = aMeta.x;
    float g = sat((uGrowth - birth) / max(0.0001, 0.13));
    g = easeOut(g);

    vec3 dir = aSeg1.xyz - aSeg0.xyz;
    float len = length(dir);
    vec3 up = len > 0.00001 ? dir / len : vec3(0.0, 1.0, 0.0);
    mat3 basis = basisFromUp(up);

    float r = mix(aSeg0.w, aSeg1.w, aPosition.y) * g;
    // Buttress the base of the trunk only (depth 0), fading out within a metre.
    float yWorld = aSeg0.y + aPosition.y * len * g;
    r *= 1.0 + 1.35 * exp(-max(yWorld, 0.0) * 2.1) * step(aMeta.y, 0.5);
    vec3 local = vec3(aPosition.x * r, aPosition.y * len * g, aPosition.z * r);
    vec3 world = aSeg0.xyz + basis * local;

    float stiff = pow(sat(aMeta.y / 7.0), 1.7) * (0.2 + aPosition.y * 0.8);
    world += windOffset(aSeg0.xyz, aMeta.z, stiff * 0.6);

    vNormal = normalize(basis * vec3(aNormal.x, aNormal.y * 0.15, aNormal.z));
    vWorld  = world;
    vDepthN = aMeta.y / 7.0;
    vAlong  = aPosition.y;
    vSeed   = aMeta.z;
    // Bark is sampled in the branch's own frame: the unit circle removes the
    // seam, and stretching Y turns the noise into vertical fibre at any radius.
    vBark = vec3(aPosition.x * 2.2, (aSeg0.y + aPosition.y * len) * 4.5, aPosition.z * 2.2)
          + aMeta.z * 17.0;

    gl_Position = uViewProj * vec4(world, 1.0);
    if (g <= 0.0001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);  // cull unborn
}

{@}branch.fs{@}
#!UNIFORMS
uniform vec3 uCameraPos;
uniform vec3 uBarkDark;
uniform vec3 uBarkLight;
uniform float uBarkRough;
#!VARYINGS
in vec3 vWorld;
in vec3 vNormal;
in vec3 vBark;
in float vDepthN;
in float vAlong;
in float vSeed;
#!SHADER
out vec4 fragColor;
void main(){
    vec3 v = normalize(uCameraPos - vWorld);
    vec3 l = normalize(uSunDir);
    vec3 n = normalize(vNormal);

    // Vertical fibre plus a coarser plate break, both in branch-local space.
    float fibre = fbm(vBark, 4);
    float plate = fbm(vBark * vec3(2.6, 0.28, 2.6) + 9.0, 3);
    // Ridged noise gives the deep fissures a smooth fbm can't.
    float ridge = 1.0 - abs(fibre * 2.0 - 1.0);
    float crack = smoothstep(0.30, 0.86, ridge * 0.75 + plate * 0.5);

    vec3 col = mix(uBarkDark, uBarkLight, crack);
    col *= 0.62 + fibre * 0.72;
    // Young twigs lose the fissures and pick up a little chlorophyll.
    col = mix(col, mix(uBarkLight, vec3(0.16, 0.19, 0.10), 0.45), smoothstep(0.55, 0.92, vDepthN));

    float diff = wrapDiffuse(n, l, 0.30);
    float rim  = fresnel(n, v, 3.2);
    float ao   = mix(0.55, 1.0, crack);              // dirt settles in the cracks

    col *= (0.10 + diff * 1.0) * ao;
    col += uSunColor * rim * 0.11 * (1.0 - uBarkRough);

    col = applyFog(col, length(uCameraPos - vWorld), vWorld, -v);
    fragColor = vec4(col, 1.0);
}

{@}leaf.vs{@}
#!ATTRIBUTES
layout(location = 0) in vec2 aQuad;       // 0..1
layout(location = 1) in vec4 aAnchor;     // xyz world, w scale
layout(location = 2) in vec4 aOrient;     // xyz normal-ish direction, w birth
layout(location = 3) in vec4 aMeta;       // x phase, y tintA, z tintB, w kind
#!UNIFORMS
uniform mat4 uViewProj;
uniform float uGrowth;
uniform float uLeafFall;
#!VARYINGS
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vTint;
out float vKind;
out float vOpen;
#!SHADER
void main(){
    float birth = aOrient.w;
    float open = sat((uGrowth - birth) / 0.20);
    open = easeOut(open);

    vec3 dir = normalize(aOrient.xyz + vec3(0.0001));
    mat3 basis = basisFromUp(dir);

    // Unfurl: the blade scales up from the stem while rolling flat.
    float roll = (1.0 - open) * 1.6;
    vec2 q = aQuad - vec2(0.5, 0.0);
    q.x *= mix(0.12, 1.0, open);
    float scale = aAnchor.w * mix(0.25, 1.0, open);

    vec3 local = vec3(q.x, aQuad.y, sin(aQuad.y * PI) * roll * 0.28) * scale;
    local.yz = rot2(-0.35 + roll * 0.4) * local.yz;

    vec3 world = aAnchor.xyz + basis * local;

    // Late in the story a fraction of the canopy lets go and drifts down.
    float fallSeed = hash11(aMeta.x * 31.7);
    float fall = sat((uLeafFall * 1.25 - 0.34 - fallSeed) * 3.2);
    if (fall > 0.0){
        float f = fall * fall;
        world.y -= f * (3.0 + fallSeed * 7.0);
        world.xz += vec2(sin(uTime * 0.9 + fallSeed * 40.0), cos(uTime * 0.7 + fallSeed * 22.0)) * f * 2.4;
        local.xy = rot2(f * 6.0 * (fallSeed - 0.5)) * local.xy;
    }

    world += windOffset(aAnchor.xyz, aMeta.x, 1.0);

    vNormal = normalize(basis * vec3(0.0, 0.25, 1.0));
    vWorld  = world;
    vUv     = aQuad;
    vTint   = vec3(aMeta.y, aMeta.z, fall);
    vKind   = aMeta.w;
    vOpen   = open;

    gl_Position = uViewProj * vec4(world, 1.0);
    if (open <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}

{@}leaf.fs{@}
#!UNIFORMS
uniform vec3 uCameraPos;
uniform vec3 uLeafYoung;
uniform vec3 uLeafMature;
uniform vec3 uLeafAutumn;
uniform float uAutumn;
uniform float uTranslucency;
#!VARYINGS
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vTint;
in float vKind;
in float vOpen;
#!SHADER
out vec4 fragColor;
void main(){
    float mask = leafMask(vUv, 0.46 + vKind * 0.13, 0.58, 0.020);
    if (mask < 0.5) discard;

    vec3 v = normalize(uCameraPos - vWorld);
    vec3 l = normalize(uSunDir);
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;

    float veins = leafVeins(vUv, 7.0 + vKind * 4.0);

    vec3 green = mix(uLeafYoung, uLeafMature, sat(vTint.x));
    float autumn = sat(uAutumn + vTint.z * 0.55 + (vTint.y - 0.5) * 0.30);
    vec3 base = mix(green, uLeafAutumn * (0.7 + vTint.y * 0.6), autumn);

    float diff  = wrapDiffuse(n, l, 0.85);
    float trans = backScatter(n, l, v, 2.2, 1.0) * uTranslucency;
    float spec  = pow(sat(dot(reflect(-l, n), v)), 42.0) * 0.5;

    vec3 col = base * (0.16 + diff * 0.78);
    // The blade glows where the sun is behind it — brighter and yellower in the thin parts.
    col += uSunColor * base * trans * (1.25 - veins * 0.6) * 1.9;
    col += uSunColor * spec * (0.25 + veins * 0.4);
    col *= 1.0 - veins * 0.24;
    col *= 0.80 + vTint.y * 0.42;

    col = applyFog(col, length(uCameraPos - vWorld), vWorld, -v);
    fragColor = vec4(col, 1.0);
}

{@}flower.vs{@}
#!ATTRIBUTES
layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec4 aAnchor;     // xyz world, w scale
layout(location = 2) in vec4 aOrient;     // xyz up dir, w birth
layout(location = 3) in vec4 aMeta;       // x petalIndex/count, y phase, z hue, w kind
#!UNIFORMS
uniform mat4 uViewProj;
uniform float uBloom;
#!VARYINGS
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormal;
out float vHue;
out float vOpen;
out float vKind;
#!SHADER
void main(){
    float birth = aOrient.w;
    float open = sat((uBloom - birth) / 0.26);
    open = easeOut(open);

    float ang = aMeta.x * TAU;
    vec3 up = normalize(aOrient.xyz + vec3(0.0001));
    mat3 basis = basisFromUp(up);

    // Petals start folded vertically and rotate outward as the flower opens.
    float pitch = mix(1.48, 0.34 + 0.30 * sin(ang * 3.0), open);
    vec2 q = aQuad - vec2(0.5, 0.0);
    vec3 local = vec3(q.x * 0.62, aQuad.y, 0.0) * aAnchor.w * mix(0.2, 1.0, open);
    local.yz = rot2(pitch) * local.yz;
    local.xz = rot2(ang) * local.xz;
    local.y += aAnchor.w * 0.12;

    vec3 world = aAnchor.xyz + basis * local;
    world += windOffset(aAnchor.xyz, aMeta.y, 0.55);

    vec3 nrm = vec3(0.0, 0.6, 1.0);
    nrm.yz = rot2(pitch) * nrm.yz;
    nrm.xz = rot2(ang) * nrm.xz;

    vNormal = normalize(basis * nrm);
    vWorld = world;
    vUv = aQuad;
    vHue = aMeta.z;
    vOpen = open;
    vKind = aMeta.w;

    gl_Position = uViewProj * vec4(world, 1.0);
    if (open <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}

{@}flower.fs{@}
#!UNIFORMS
uniform vec3 uCameraPos;
uniform vec3 uPetalA;
uniform vec3 uPetalB;
uniform vec3 uPetalCore;
#!VARYINGS
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
in float vHue;
in float vOpen;
in float vKind;
#!SHADER
out vec4 fragColor;
void main(){
    float mask = petalMask(vUv, 0.40, 0.55 * vKind);
    if (mask < 0.5) discard;

    vec3 v = normalize(uCameraPos - vWorld);
    vec3 l = normalize(uSunDir);
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;

    vec3 base = mix(uPetalA, uPetalB, vHue);
    // Colour concentrates toward the throat of the flower.
    base = mix(uPetalCore, base, smoothstep(0.0, 0.55, vUv.y));
    float streak = 0.85 + 0.3 * sin((vUv.x - 0.5) * 26.0) * smoothstep(0.1, 0.9, vUv.y);

    float diff  = wrapDiffuse(n, l, 1.0);
    float trans = backScatter(n, l, v, 1.6, 1.0) * 1.5;

    vec3 col = base * streak * (0.46 + diff * 0.68);
    col += uSunColor * base * trans * 0.85;
    col *= 0.75 + vOpen * 0.45;
    col += uPetalCore * pow(1.0 - vUv.y, 7.0) * 0.28;

    col = applyFog(col, length(uCameraPos - vWorld), vWorld, -v);
    fragColor = vec4(col, 1.0);
}

{@}seed.vs{@}
#!ATTRIBUTES
layout(location = 0) in vec3 aPosition;
#!UNIFORMS
uniform mat4 uViewProj;
uniform vec3 uSeedPos;
uniform float uSeedScale;
uniform float uSeedOpen;
#!VARYINGS
out vec3 vWorld;
out vec3 vNormal;
out vec3 vLocal;
#!SHADER
void main(){
    vec3 p = aPosition;
    // An egg, not a ball — and the halves part along the seam as it opens.
    p *= vec3(0.74, 1.0, 0.74);
    p.y *= 1.0 + p.y * 0.16;
    p.x += sign(p.x) * uSeedOpen * 0.30 * (1.0 - abs(p.y));

    vec3 world = uSeedPos + p * uSeedScale;
    vNormal = normalize(aPosition);
    vLocal  = p;
    vWorld  = world;
    gl_Position = uViewProj * vec4(world, 1.0);
}

{@}seed.fs{@}
#!UNIFORMS
uniform vec3 uCameraPos;
uniform vec3 uSeedCore;
uniform float uSeedOpen;
uniform float uSeedGlow;
#!VARYINGS
in vec3 vWorld;
in vec3 vNormal;
in vec3 vLocal;
#!SHADER
out vec4 fragColor;
void main(){
    vec3 v = normalize(uCameraPos - vWorld);
    vec3 l = normalize(uSunDir);
    vec3 n = normalize(vNormal);

    float grain = fbm(vLocal * 26.0, 4);
    vec3 husk = mix(vec3(0.048, 0.038, 0.030), vec3(0.16, 0.12, 0.085), grain);

    float diff = wrapDiffuse(n, l, 0.45);
    float rim  = fresnel(n, v, 2.6);

    vec3 col = husk * (0.10 + diff * 0.95);
    col += uSunColor * rim * 0.45;

    // The seam: a thin line of stored light that widens as the seed opens.
    float seam = 1.0 - smoothstep(0.0, 0.030 + uSeedOpen * 0.22, abs(vLocal.x));
    seam *= smoothstep(0.98, 0.55, abs(vLocal.y));
    col += uSeedCore * seam * uSeedGlow * (0.5 + uSeedOpen * 5.0);
    col += uSeedCore * pow(rim, 2.0) * uSeedGlow * 0.35;

    col = applyFog(col, length(uCameraPos - vWorld), vWorld, -v);
    fragColor = vec4(col, 1.0);
}

{@}gpgpu.fs{@}
#!UNIFORMS
uniform sampler2D tPos;      // xyz position, w life
uniform sampler2D tSeed;     // static per-particle randomness
uniform float uDelta;
uniform float uCurlScale;
uniform float uCurlStrength;
uniform float uRise;
uniform float uSpread;
uniform vec3  uOrigin;
uniform float uLifeSpeed;
uniform float uMode;         // 0 dust, 1 pollen, 2 petals, 3 fireflies
#!SHADER
in vec2 vUv;
out vec4 fragColor;
void main(){
    vec4 P = texture(tPos, vUv);
    vec4 S = texture(tSeed, vUv);
    vec3 p = P.xyz;
    float life = P.w;

    vec3 flow = curlNoise(p * uCurlScale + vec3(0.0, uTime * 0.05, 0.0), uTime * 0.22);
    flow *= uCurlStrength;

    // Fireflies orbit their seed point instead of drifting on the wind.
    if (uMode > 2.5){
        vec3 home = uOrigin + (S.xyz - 0.5) * uSpread * 2.0;
        flow += (home - p) * 0.9;
        flow += vec3(sin(uTime * 1.7 + S.x * 60.0), cos(uTime * 1.3 + S.y * 60.0), sin(uTime * 2.1 + S.z * 60.0)) * 0.35;
    }

    p += flow * uDelta;
    p.y += uRise * uDelta * (0.4 + S.w * 1.2);

    life -= uDelta * uLifeSpeed * (0.6 + S.w * 0.8);

    // Respawn in a disc around the origin when a particle expires or drifts out.
    float outOfRange = step(uSpread * 1.9, length(p - uOrigin));
    if (life <= 0.0 || outOfRange > 0.5){
        float a = S.x * TAU;
        float r = sqrt(S.y) * uSpread;
        p = uOrigin + vec3(cos(a) * r, (S.z - 0.35) * uSpread * 0.9, sin(a) * r);
        life = 1.0;
    }
    fragColor = vec4(p, life);
}

{@}particle.vs{@}
#!ATTRIBUTES
layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec2 aLookup;
#!UNIFORMS
uniform sampler2D tPos;
uniform sampler2D tSeed;
uniform mat4 uViewProj;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform float uSize;
uniform float uMode;
uniform float uOpacity;
#!VARYINGS
out vec2 vUv;
out vec4 vSeed;
out float vLife;
out float vFade;
out vec3 vWorld;
#!SHADER
void main(){
    vec4 P = texture(tPos, aLookup);
    vec4 S = texture(tSeed, aLookup);

    float size = uSize * (0.35 + S.w * 1.3);
    // Petals are big flat flakes; dust and fireflies are small points.
    if (uMode > 1.5 && uMode < 2.5) size *= 2.1;

    vec2 q = aQuad - 0.5;
    if (uMode > 1.5 && uMode < 2.5) q.x *= 0.55;   // petal aspect

    float spin = uTime * (0.4 + S.x * 1.4) + S.y * TAU;
    q = rot2(spin) * q;

    vec3 world = P.xyz + (uCameraRight * q.x + uCameraUp * q.y) * size;

    // Fade in at birth, out at death, so nothing ever pops.
    vFade = smoothstep(0.0, 0.18, P.w) * smoothstep(1.0, 0.82, P.w);
    vLife = P.w;
    vSeed = S;
    vUv = aQuad;
    vWorld = world;
    gl_Position = uViewProj * vec4(world, 1.0);
}

{@}particle.fs{@}
#!UNIFORMS
uniform vec3 uCameraPos;
uniform vec3 uParticleColor;
uniform vec3 uParticleColorB;
uniform float uMode;
uniform float uOpacity;
#!VARYINGS
in vec2 vUv;
in vec4 vSeed;
in float vLife;
in float vFade;
in vec3 vWorld;
#!SHADER
out vec4 fragColor;
void main(){
    float a;
    vec3 col = mix(uParticleColor, uParticleColorB, vSeed.x);

    if (uMode > 1.5 && uMode < 2.5){
        // Petal flake — a real silhouette, not a blob.
        a = petalMask(vUv, 0.42, 0.35);
        float shade = 0.6 + 0.5 * sin(vUv.y * 3.0 + vSeed.y * 6.0);
        col *= shade;
    } else {
        float d = length(vUv - 0.5) * 2.0;
        a = pow(sat(1.0 - d), uMode > 2.5 ? 2.2 : 3.4);
        if (uMode > 2.5){
            // Firefly: pulsing core with a hot centre.
            float pulse = 0.35 + 0.65 * pow(sat(sin(uTime * 2.3 + vSeed.x * TAU) * 0.5 + 0.5), 2.5);
            a *= pulse;
            col += vec3(0.9, 0.75, 0.3) * pow(sat(1.0 - d), 12.0) * pulse;
        }
    }

    a *= vFade * uOpacity;
    if (a < 0.004) discard;

    float dist = length(uCameraPos - vWorld);
    a *= smoothstep(0.35, 1.6, dist);              // don't smear the near plane
    a *= exp(-dist * uFogDensity * 0.55);

    fragColor = vec4(col * a, a);                  // premultiplied, additive-friendly
}

{@}text.vs{@}
#!ATTRIBUTES
layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec4 aRect;      // x,y offset  z,w size  (local units)
layout(location = 2) in vec4 aUvRect;    // atlas uv rect
layout(location = 3) in vec4 aCharMeta;  // x index, y lineIndex, z total, w rand
#!UNIFORMS
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform float uReveal;
uniform float uStagger;
uniform float uDrift;
#!VARYINGS
out vec2 vUv;
out float vAlpha;
#!SHADER
void main(){
    // Per-character stagger. This is why the type feels typeset rather than faded in.
    // The index already runs 0..1 across the whole block including line breaks, so
    // the last glyph's delay is exactly uStagger and the window closes at 1.0.
    float n = aCharMeta.z > 0.0 ? aCharMeta.x / aCharMeta.z : 0.0;
    float delay = n * uStagger;
    float t = sat((uReveal - delay) / max(0.0001, 1.0 - uStagger));
    float e = easeOut(t);

    vec2 pos = aRect.xy + aQuad * aRect.zw;
    vec3 local = vec3(pos, 0.0);
    local.y += (1.0 - e) * uDrift * (0.6 + aCharMeta.w * 0.8);
    local.z += (1.0 - e) * uDrift * 0.5 * (aCharMeta.w - 0.5);

    vAlpha = e;
    vUv = mix(aUvRect.xy, aUvRect.zw, aQuad);
    gl_Position = uViewProj * uModel * vec4(local, 1.0);
    if (e <= 0.0005) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}

{@}text.fs{@}
#!UNIFORMS
uniform sampler2D tAtlas;
uniform vec3 uColor;
uniform vec3 uHaloColor;
uniform float uHalo;
uniform float uOpacity;
#!VARYINGS
in vec2 vUv;
in float vAlpha;
#!SHADER
out vec4 fragColor;
void main(){
    float a = texture(tAtlas, vUv).a;

    // Legibility over a blown-out canopy. Rather than eight dilation taps, read a
    // coarse mip of the same atlas — the glyph cells are padded enough that the
    // blur stays inside its own cell — and lay that behind the letter as a scrim.
    float halo = sat(textureLod(tAtlas, vUv, 3.0).a * 2.6) * uHalo;

    float fade = vAlpha * uOpacity;
    float alpha = max(a, halo) * fade;
    if (alpha < 0.003) discard;

    // Premultiplied: the glyph sits on top of its own shadow.
    vec3 rgb = uHaloColor * (halo * fade) * (1.0 - a) + uColor * (a * fade);
    fragColor = vec4(rgb, alpha);
}

{@}bright.fs{@}
#!UNIFORMS
uniform sampler2D tScene;
uniform float uThreshold;
uniform float uKnee;
#!SHADER
in vec2 vUv;
out vec4 fragColor;
void main(){
    vec3 c = texture(tScene, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // Soft knee so the bloom ramps in instead of clipping on.
    float s = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    s = s * s / (4.0 * uKnee + 0.0001);
    float contrib = max(s, l - uThreshold) / max(l, 0.0001);
    fragColor = vec4(c * contrib, 1.0);
}

{@}down.fs{@}
#!UNIFORMS
uniform sampler2D tMap;
uniform vec2 uTexel;
#!SHADER
in vec2 vUv;
out vec4 fragColor;
void main(){
    // 13-tap Call-of-Duty style downsample — stable, no fireflies.
    vec3 a = texture(tMap, vUv + uTexel * vec2(-2,  2)).rgb;
    vec3 b = texture(tMap, vUv + uTexel * vec2( 0,  2)).rgb;
    vec3 c = texture(tMap, vUv + uTexel * vec2( 2,  2)).rgb;
    vec3 d = texture(tMap, vUv + uTexel * vec2(-2,  0)).rgb;
    vec3 e = texture(tMap, vUv).rgb;
    vec3 f = texture(tMap, vUv + uTexel * vec2( 2,  0)).rgb;
    vec3 g = texture(tMap, vUv + uTexel * vec2(-2, -2)).rgb;
    vec3 h = texture(tMap, vUv + uTexel * vec2( 0, -2)).rgb;
    vec3 i = texture(tMap, vUv + uTexel * vec2( 2, -2)).rgb;
    vec3 j = texture(tMap, vUv + uTexel * vec2(-1,  1)).rgb;
    vec3 k = texture(tMap, vUv + uTexel * vec2( 1,  1)).rgb;
    vec3 l = texture(tMap, vUv + uTexel * vec2(-1, -1)).rgb;
    vec3 m = texture(tMap, vUv + uTexel * vec2( 1, -1)).rgb;
    vec3 r = (j + k + l + m) * 0.125;
    r += (a + b + d + e) * 0.03125;
    r += (b + c + e + f) * 0.03125;
    r += (d + e + g + h) * 0.03125;
    r += (e + f + h + i) * 0.03125;
    fragColor = vec4(r, 1.0);
}

{@}up.fs{@}
#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tPrev;
uniform vec2 uTexel;
uniform float uRadius;
#!SHADER
in vec2 vUv;
out vec4 fragColor;
void main(){
    vec2 o = uTexel * uRadius;
    vec3 s = texture(tMap, vUv + vec2(-o.x,  o.y)).rgb;
    s += texture(tMap, vUv + vec2( 0.0,  o.y)).rgb * 2.0;
    s += texture(tMap, vUv + vec2( o.x,  o.y)).rgb;
    s += texture(tMap, vUv + vec2(-o.x,  0.0)).rgb * 2.0;
    s += texture(tMap, vUv).rgb * 4.0;
    s += texture(tMap, vUv + vec2( o.x,  0.0)).rgb * 2.0;
    s += texture(tMap, vUv + vec2(-o.x, -o.y)).rgb;
    s += texture(tMap, vUv + vec2( 0.0, -o.y)).rgb * 2.0;
    s += texture(tMap, vUv + vec2( o.x, -o.y)).rgb;
    fragColor = vec4(texture(tPrev, vUv).rgb + s * 0.0625, 1.0);
}

{@}godray.fs{@}
#!UNIFORMS
uniform sampler2D tMap;
uniform vec2 uSunUv;
uniform float uDensity;
uniform float uDecay;
uniform float uWeight;
uniform int uSamples;
#!SHADER
in vec2 vUv;
out vec4 fragColor;
void main(){
    vec2 delta = (vUv - uSunUv) * (uDensity / float(uSamples));
    vec2 uv = vUv;
    vec3 acc = vec3(0.0);
    float illum = 1.0;
    // Radial march back toward the sun, accumulating whatever survived the bright pass.
    for (int i = 0; i < 48; i++){
        if (i >= uSamples) break;
        uv -= delta;
        acc += texture(tMap, uv).rgb * illum * uWeight;
        illum *= uDecay;
    }
    float edge = 1.0 - smoothstep(0.35, 1.25, length(vUv - uSunUv));
    fragColor = vec4(acc / float(uSamples) * edge, 1.0);
}

{@}composite.fs{@}
#!UNIFORMS
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform vec2  uResolution;
uniform float uExposure;
uniform float uBloomAmount;
uniform float uRayAmount;
uniform vec3  uLift;
uniform vec3  uGamma;
uniform vec3  uGain;
uniform vec3  uShadowTint;
uniform vec3  uHighlightTint;
uniform float uSaturation;
uniform float uContrast;
uniform float uVignette;
uniform float uVignetteSoft;
uniform float uGrain;
uniform float uAberration;
uniform float uFade;
#!SHADER
in vec2 vUv;
out vec4 fragColor;

vec3 sampleAberrated(vec2 uv, float amount){
    vec2 dir = uv - 0.5;
    float r = texture(tScene, uv - dir * amount).r;
    float g = texture(tScene, uv).g;
    float b = texture(tScene, uv + dir * amount).b;
    return vec3(r, g, b);
}
void main(){
    // Lateral chromatic aberration, scaled by distance from centre like a real lens.
    float ab = uAberration * dot(vUv - 0.5, vUv - 0.5) * 0.013;
    vec3 col = sampleAberrated(vUv, ab);

    col += texture(tBloom, vUv).rgb * uBloomAmount;
    col += texture(tRays,  vUv).rgb * uRayAmount;

    col *= uExposure;
    col = aces(col);

    // ASC-CDL style grade: slope / offset / power, then split-tone.
    col = pow(max(col * uGain + uLift, 0.0), max(uGamma, vec3(0.001)));
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, col * uShadowTint, 1.0 - smoothstep(0.0, 0.5, l));
    col = mix(col, col * uHighlightTint, smoothstep(0.45, 1.0, l));
    col = mix(vec3(l), col, uSaturation);
    col = (col - 0.5) * uContrast + 0.5;

    float d = length((vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0));
    col *= mix(1.0, 1.0 - smoothstep(uVignetteSoft, 1.15, d), uVignette);

    // Grain in luminance only, and stronger in the shadows — like real film.
    float n = hash13(vec3(gl_FragCoord.xy, fract(uTime) * 1000.0)) - 0.5;
    col += n * uGrain * (1.0 - smoothstep(0.0, 0.75, l));

    // Ordered dither kills banding in the big soft gradients.
    float dither = (hash22(gl_FragCoord.xy).x - 0.5) / 255.0;
    col += dither;

    col *= uFade;
    fragColor = vec4(max(col, 0.0), 1.0);
}

{@}blit.fs{@}
#!UNIFORMS
uniform sampler2D tMap;
#!SHADER
in vec2 vUv;
out vec4 fragColor;
void main(){ fragColor = texture(tMap, vUv); }
