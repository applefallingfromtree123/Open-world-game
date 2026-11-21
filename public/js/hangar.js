// 격납고 3D 장면 — 도킹 중 함선 전시 (조선소 미리보기 포함)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { E } from './engine.js';
import { instantiateShip, animateShip } from './models.js';
import { SHIPS } from './data.js';

export const HG = { scene: null, camera: null, ship: null, yaw: 0.8, pitch: 0.18, dist: 30, drag: false, auto: true, t: 0, type: null };

function stripTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#1b1f26'; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = '#2c333d'; x.lineWidth = 3;
  for (let i = 0; i <= 512; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
  x.fillStyle = '#d6a21a';
  for (let i = -512; i < 512; i += 48) { x.save(); x.beginPath(); x.rect(0, 240, 512, 32); x.clip(); x.beginPath(); x.moveTo(i, 240); x.lineTo(i + 24, 240); x.lineTo(i + 56, 272); x.lineTo(i + 32, 272); x.fill(); x.restore(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function initHangar() {
  const s = new THREE.Scene();
  s.background = new THREE.Color('#07090d');
  s.fog = new THREE.Fog('#07090d', 90, 260);
  const pm = new THREE.PMREMGenerator(E.renderer);
  s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  s.environmentIntensity = 0.45;
  HG.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2000);
  // 바닥
  const floorTex = stripTex(); floorTex.repeat.set(10, 10);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: floorTex, color: '#8a93a0', roughness: 0.7, metalness: 0.5 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(34, 36, 1.2, 64), new THREE.MeshStandardMaterial({ color: '#2a3038', roughness: 0.35, metalness: 0.8 }));
  pad.position.y = 0.6; pad.receiveShadow = true; s.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(35, 0.25, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ce1ff').multiplyScalar(1.3) }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 1.25; s.add(ring);
  const ring2 = ring.clone(); ring2.scale.setScalar(0.6); s.add(ring2);
  // 벽 · 천장 조명 스트립
  const wallMat = new THREE.MeshStandardMaterial({ color: '#141920', roughness: 0.8, metalness: 0.4, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(320, 120, 320), wallMat);
  room.position.y = 60; s.add(room);
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfe6ff').multiplyScalar(1.2) });
  for (let i = -3; i <= 3; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 240), stripMat); st.position.set(i * 40, 118, 0); s.add(st);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.BoxGeometry(6, 70, 6), new THREE.MeshStandardMaterial({ color: '#232a33', metalness: 0.7, roughness: 0.4 }));
    p.position.set(Math.cos(a) * 120, 35, Math.sin(a) * 120); p.castShadow = true; s.add(p);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 60, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? '#ff8a3c' : '#5ce1ff').multiplyScalar(2) }));
    l.position.set(Math.cos(a) * 116.5, 35, Math.sin(a) * 116.5); s.add(l);
  }
  // 조명
  const key = new THREE.SpotLight('#ffffff', 700, 0, Math.PI / 6, 0.6, 1.6);
  key.position.set(30, 90, 40); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003;
  s.add(key, key.target);
  const rim = new THREE.SpotLight('#5ce1ff', 420, 0, Math.PI / 6, 0.6, 1.6); rim.position.set(-60, 40, -70); s.add(rim, rim.target);
  const rim2 = new THREE.SpotLight('#ff8a3c', 300, 0, Math.PI / 6, 0.6, 1.6); rim2.position.set(70, 30, -50); s.add(rim2, rim2.target);
  s.add(new THREE.HemisphereLight('#8aa0c0', '#20140a', 0.35));
  HG.scene = s;
}

export function showShip(type, paint) {
  if (HG.ship) HG.scene.remove(HG.ship);
  HG.ship = instantiateShip(type, paint);
  HG.ship.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const size = SHIPS[type].size;
  HG.ship.position.y = 2 + size * 0.22;
  HG.scene.add(HG.ship);
  HG.dist = size * 2.1 + 10;
  HG.type = type;
}

export function updateHangar(dt) {
  HG.t += dt;
  if (HG.auto) HG.yaw += dt * 0.12;
  const c = HG.camera;
  c.aspect = E.W / E.H; c.updateProjectionMatrix();
  const y = HG.ship ? HG.ship.position.y : 5;
  const off = Math.min(E.W * 0.18, 260) / E.W; // UI 패널 쪽으로 화면 중심 이동
  c.position.set(Math.cos(HG.yaw) * Math.cos(HG.pitch) * HG.dist, y + Math.sin(HG.pitch) * HG.dist, Math.sin(HG.yaw) * Math.cos(HG.pitch) * HG.dist);
  c.lookAt(0, y, 0);
  c.setViewOffset(E.W, E.H, -E.W * off, 0, E.W, E.H);
  if (HG.ship) {
    HG.ship.position.y = (2 + SHIPS[HG.type].size * 0.22) + Math.sin(HG.t * 0.8) * 0.3;
    animateShip(HG.ship, HG.t, 0.05, false, false);
  }
}
export function hangarInput(el) {
  let lx = 0, ly = 0;
  el.addEventListener('mousedown', (e) => { HG.drag = true; HG.auto = false; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('mouseup', () => { HG.drag = false; });
  window.addEventListener('mousemove', (e) => {
    if (!HG.drag) return;
    HG.yaw += (e.clientX - lx) * 0.006; HG.pitch = Math.max(-0.1, Math.min(1.2, HG.pitch + (e.clientY - ly) * 0.004));
    lx = e.clientX; ly = e.clientY;
  });
  el.addEventListener('wheel', (e) => { HG.dist = Math.max(8, Math.min(220, HG.dist * (1 + Math.sign(e.deltaY) * 0.08))); });
}
