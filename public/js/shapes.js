// 함선 외형 정의 (2D 윤곽 — 3D 모델은 이 윤곽을 돌출시켜 생성)
// ---------- 함선 모양 ----------
function mirror(half) {
  const pts = half.slice();
  for (let i = half.length - 1; i >= 0; i--) if (half[i][1] !== 0) pts.push([half[i][0], -half[i][1]]);
  return pts;
}
export const SHAPES = {
  shuttle: mirror([[1.1, 0], [0.2, 0.35], [-0.6, 0.75], [-0.35, 0.2], [-0.5, 0]]),
  interceptor: mirror([[1.35, 0], [0.1, 0.28], [-0.5, 1.0], [-0.7, 0.95], [-0.45, 0.25], [-0.75, 0]]),
  miner: mirror([[1.0, 0.25], [0.55, 0.3], [0.45, 0.85], [-0.8, 0.85], [-1.0, 0.4], [-0.85, 0]]),
  hauler: mirror([[1.0, 0.3], [0.75, 0.6], [-1.0, 0.6], [-1.15, 0.3], [-1.0, 0]]),
  fighter: mirror([[1.35, 0], [0.35, 0.25], [0.05, 1.05], [-0.55, 1.05], [-0.35, 0.3], [-0.8, 0]]),
  runner: mirror([[1.45, 0], [0.2, 0.42], [-0.9, 0.72], [-0.55, 0.15], [-0.7, 0]]),
  frigate: mirror([[1.25, 0], [0.65, 0.35], [0.35, 0.9], [-0.7, 0.9], [-1.0, 0.45], [-0.8, 0]]),
  exhumer: mirror([[1.0, 0.45], [0.5, 0.5], [0.4, 1.0], [-0.6, 1.0], [-0.7, 0.55], [-1.05, 0.5], [-1.05, 0]]),
  destroyer: mirror([[1.5, 0], [0.4, 0.2], [0.0, 0.75], [-0.9, 0.85], [-0.75, 0.25], [-1.1, 0.2], [-1.1, 0]]),
  cruiser: mirror([[1.3, 0], [0.85, 0.3], [0.5, 0.42], [0.3, 0.95], [-0.5, 1.0], [-0.75, 0.55], [-1.15, 0.5], [-1.15, 0]]),
  drone: mirror([[1.0, 0], [0.1, 0.8], [-0.8, 0.45], [-0.6, 0]]),
  raider: mirror([[1.25, 0], [-0.1, 0.95], [-0.45, 0.3], [-1.0, 0.65], [-0.75, 0]]),
  enforcer: mirror([[1.2, 0.2], [0.6, 0.7], [-0.2, 1.0], [-1.0, 0.8], [-0.8, 0.3], [-1.1, 0]]),
  boss: mirror([[1.3, 0], [0.9, 0.25], [1.1, 0.6], [0.4, 0.55], [0.3, 1.1], [-0.4, 0.75], [-0.6, 1.2], [-0.9, 0.5], [-1.2, 0.3], [-0.9, 0]]),
  guardian: mirror([[1.1, 0], [0, 0.7], [-1.1, 0], [-0.9, 0]]),
};

export function drawShipShape(c, shape, color, r, thrust, t, glow = true) {
  const pts = SHAPES[shape] || SHAPES.shuttle;
  // 엔진 화염
  if (thrust) {
    const fl = r * (0.9 + Math.random() * 0.6) * thrust;
    const g = c.createLinearGradient(-r * 0.6, 0, -r * 0.6 - fl, 0);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(-r * 0.55, r * 0.28); c.lineTo(-r * 0.6 - fl, 0); c.lineTo(-r * 0.55, -r * 0.28); c.closePath(); c.fill();
  }
  c.beginPath();
  c.moveTo(pts[0][0] * r, pts[0][1] * r);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0] * r, pts[i][1] * r);
  c.closePath();
  c.fillStyle = 'rgba(10,6,30,0.92)';
  c.fill();
  if (glow) { c.shadowColor = color; c.shadowBlur = 12; }
  c.strokeStyle = color; c.lineWidth = Math.max(1.2, r * 0.09);
  c.stroke();
  c.shadowBlur = 0;
  // 조종석/코어
  c.fillStyle = color;
  c.globalAlpha = 0.55 + Math.sin(t * 6) * 0.2;
  c.beginPath(); c.arc(r * 0.25, 0, r * 0.16, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;
  // 디테일 라인
  c.strokeStyle = color; c.globalAlpha = 0.4; c.lineWidth = 1;
  c.beginPath(); c.moveTo(r * 0.9, 0); c.lineTo(-r * 0.6, 0); c.stroke();
  c.globalAlpha = 1;
}

