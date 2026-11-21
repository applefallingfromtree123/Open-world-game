// ============================================================
//  렌더링 엔진 — Three.js, 플로팅 오리진, 블룸, 절차적 하늘, 환경맵
// ============================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mulberry32 } from './util.js';

export const E = {
  renderer: null, scene: null, camera: null, composer: null, bloom: null, post: null,
  origin: new THREE.Vector3(),      // 카메라의 월드 좌표 (플로팅 오리진)
  anchors: [],                      // { obj, pos } — 월드 좌표에 고정된 오브젝트
  sun: null, sunDir: new THREE.Vector3(1, 0, 0), hemi: null,
  envMap: null, W: 1, H: 1, dpr: 1, quality: 'high', time: 0,
  sky: null, skyStars: null,
};

// 로그 깊이 버퍼용 셰이더 조각 (커스텀 셰이더에 삽입)
export const LD = {
  vpars: '\n#include <common>\n#include <logdepthbuf_pars_vertex>\n',
  vmain: '\n#include <logdepthbuf_vertex>\n',
  fpars: '\n#include <logdepthbuf_pars_fragment>\n',
  fmain: '\n#include <logdepthbuf_fragment>\n',
};

export function initEngine(canvas, quality = 'high') {
  E.quality = quality;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = quality !== 'low';
  r.shadowMap.type = THREE.PCFShadowMap;
  E.renderer = r;
  E.scene = new THREE.Scene();
  E.camera = new THREE.PerspectiveCamera(65, 1, 0.5, 2e7);
  E.scene.add(E.camera);

  E.sun = new THREE.DirectionalLight(0xffffff, 3.2);
  E.sun.castShadow = quality !== 'low';
  E.sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  const sc = E.sun.shadow.camera;
  sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140; sc.near = 1; sc.far = 3000;
  E.sun.shadow.bias = -0.0004;
  E.sun.shadow.normalBias = 0.6;
  E.scene.add(E.sun, E.sun.target);
  E.hemi = new THREE.HemisphereLight(0x5a6a9a, 0x1a1020, 0.55);
  E.scene.add(E.hemi);
  // 카메라 방향 보조광 — 그늘진 면도 형태가 읽히도록
  const fill = new THREE.DirectionalLight(0x8aa4c8, 0.45);
  fill.position.set(0.3, 0.6, 1);
  E.camera.add(fill); E.camera.add(fill.target); fill.target.position.set(0, 0, -1);
  E.scene.add(new THREE.AmbientLight(0x101018, 0.6));

  E.composer = new EffectComposer(r);
  E.composer.addPass(new RenderPass(E.scene, E.camera));
  E.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.55, 0.82);
  E.composer.addPass(E.bloom);
  E.post = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uHit: { value: 0 }, uWarp: { value: 0 }, uTime: { value: 0 }, uLow: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uHit, uWarp, uTime, uLow; varying vec2 vUv;
      void main(){
        vec2 c = vUv - 0.5;
        float r = length(c);
        float ab = 0.0015 + uHit * 0.012 + uWarp * 0.02 * r;
        vec2 dir = c * ab;
        vec4 col;
        col.r = texture2D(tDiffuse, vUv + dir).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - dir).b;
        col.a = 1.0;
        float vig = smoothstep(0.85, 0.25, r);
        col.rgb *= mix(0.55, 1.0, vig);
        col.rgb += vec3(0.9, 0.08, 0.05) * uHit * smoothstep(0.25, 0.75, r) * 0.6;
        col.rgb = mix(col.rgb, vec3(dot(col.rgb, vec3(0.3,0.59,0.11))) * vec3(1.0,0.4,0.35), uLow * (0.25 + 0.15*sin(uTime*6.0)));
        gl_FragColor = col;
      }`,
  });
  E.composer.addPass(E.post);
  E.composer.addPass(new OutputPass());

  resize();
  window.addEventListener('resize', resize);
}

export function resize() {
  const r = E.renderer; if (!r) return;
  E.dpr = Math.min(window.devicePixelRatio || 1, E.quality === 'high' ? 1.75 : E.quality === 'mid' ? 1.25 : 1);
  E.W = window.innerWidth; E.H = window.innerHeight;
  r.setPixelRatio(E.dpr);
  r.setSize(E.W, E.H, false);
  E.composer.setPixelRatio(E.dpr);
  E.composer.setSize(E.W, E.H);
  E.camera.aspect = E.W / E.H;
  E.camera.updateProjectionMatrix();
}

export function setQuality(q) {
  E.quality = q;
  E.renderer.shadowMap.enabled = q !== 'low';
  E.sun.castShadow = q !== 'low';
  resize();
}

// ---------- 플로팅 오리진 ----------
export function anchor(obj, pos) {
  const a = { obj, pos };
  E.anchors.push(a);
  E.scene.add(obj);
  return a;
}
export function unanchor(obj) {
  const i = E.anchors.findIndex((a) => a.obj === obj);
  if (i >= 0) E.anchors.splice(i, 1);
  if (obj.parent) obj.parent.remove(obj);
}
export function clearAnchors() {
  for (const a of E.anchors) if (a.obj.parent) a.obj.parent.remove(a.obj);
  E.anchors.length = 0;
}
export function syncAnchors() {
  const o = E.origin;
  for (const a of E.anchors) a.obj.position.set(a.pos.x - o.x, a.pos.y - o.y, a.pos.z - o.z);
}
// 월드 좌표 → 렌더 좌표
export const rel = (p, out) => out.set(p.x - E.origin.x, p.y - E.origin.y, p.z - E.origin.z);

// ---------- 하늘 ----------
const skyVert = `
  varying vec3 vDir;
  void main(){ vDir = normalize(position); vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; }`;
const skyFrag = `
  varying vec3 vDir; uniform vec3 c1, c2, c3; uniform float seed, dens; uniform vec3 band;
  float h(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float n(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<6;i++){ v+=a*n(p); p*=2.02; a*=0.5; } return v; }
  void main(){
    vec3 d = normalize(vDir);
    float b = dot(d, band);
    float milky = exp(-b*b*9.0);
    vec3 q = d*2.2 + seed;
    float w = fbm(q + fbm(q*1.7)*1.4);
    float w2 = fbm(d*5.0 - seed*0.7);
    float dust = smoothstep(0.45, 0.75, fbm(d*7.0 + seed*2.0));
    vec3 col = vec3(0.004, 0.005, 0.012);
    float neb = smoothstep(0.42, 0.95, w) * dens;
    col += mix(c1, c2, smoothstep(0.3, 0.8, w2)) * neb * 0.55;
    col += c3 * pow(smoothstep(0.5, 1.0, w), 3.0) * 0.6 * dens;
    col += vec3(0.55, 0.5, 0.45) * milky * (0.05 + 0.10 * w2) ;
    col *= 1.0 - dust * milky * 0.75;
    gl_FragColor = vec4(col, 1.0);
  }`;

export function buildSky(seedNum, colors) {
  if (E.sky) { E.scene.remove(E.sky); E.sky.geometry.dispose(); E.sky.material.dispose(); }
  if (E.skyStars) { E.scene.remove(E.skyStars); E.skyStars.geometry.dispose(); }
  const rnd = mulberry32(seedNum);
  const band = new THREE.Vector3(rnd() - 0.5, 1.6, rnd() - 0.5).normalize();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      c1: { value: new THREE.Color(colors[0]) }, c2: { value: new THREE.Color(colors[1]) }, c3: { value: new THREE.Color(colors[2]) },
      seed: { value: (seedNum % 1000) / 37 }, dens: { value: 0.6 + rnd() * 0.6 }, band: { value: band },
    },
    vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
  E.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  E.sky.renderOrder = -100; E.sky.frustumCulled = false;
  E.scene.add(E.sky);   // 카메라는 항상 렌더 원점에 있으므로 하늘은 원점에 고정

  // 별 (카메라에 고정된 천구)
  const N = E.quality === 'low' ? 3000 : 7000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    v.set(Math.cos(th) * s, u, Math.sin(th) * s);
    // 은하수 띠 근처에 더 많은 별
    if (rnd() < 0.5) { const b = v.dot(band); v.addScaledVector(band, -b * 0.85).normalize(); }
    v.multiplyScalar(900);
    pos.set([v.x, v.y, v.z], i * 3);
    const k = rnd();
    c.set(k < 0.15 ? '#9bb8ff' : k < 0.3 ? '#ffd9a8' : k < 0.36 ? '#ff9a7a' : '#ffffff');
    const br = 0.35 + Math.pow(rnd(), 6) * 2.4;
    col.set([c.r * br, c.g * br, c.b * br], i * 3);
    size[i] = 1 + Math.pow(rnd(), 8) * 3.5;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const sm = new THREE.ShaderMaterial({
    uniforms: { uPix: { value: E.dpr } },
    vertexShader: `attribute float size; varying vec3 vC; uniform float uPix;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uPix * 1.4; }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a, a); }`,
    vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  E.skyStars = new THREE.Points(g, sm);
  E.skyStars.frustumCulled = false; E.skyStars.renderOrder = -99;
  E.scene.add(E.skyStars);

  // 반사용 환경맵
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat.clone());
  envSky.material.uniforms.dens.value *= 1.6;
  envScene.add(envSky);
  const pm = new THREE.PMREMGenerator(E.renderer);
  if (E.envMap) E.envMap.dispose();
  E.envMap = pm.fromScene(envScene, 0.02).texture;
  pm.dispose();
  E.scene.environment = E.envMap;
  E.scene.environmentIntensity = 0.55;
}

// 태양 조명 방향 갱신 (항성은 월드 원점)
export function updateSun(focusWorld, focusRel, color, intensity) {
  E.sunDir.copy(focusWorld).negate().normalize();     // 초점 → 항성 방향
  if (E.sunDir.lengthSq() < 0.5) E.sunDir.set(0, 1, 0);
  E.sun.position.copy(focusRel).addScaledVector(E.sunDir, 1500);
  E.sun.target.position.copy(focusRel);
  if (color) E.sun.color.set(color);
  if (intensity !== undefined) E.sun.intensity = intensity;
}

export function render(dt) {
  E.time += dt;
  E.post.uniforms.uTime.value = E.time;
  E.composer.render(dt);
}
