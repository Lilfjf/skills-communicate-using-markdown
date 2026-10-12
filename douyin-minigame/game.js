// 叠叠高 —— 抖音小游戏最小可上线版本
// 玩法：方块左右移动，点屏幕放下；没对齐的部分会被切掉，方块越来越窄，切没了就结束。

const sys = tt.getSystemInfoSync();
const W = sys.windowWidth;
const H = sys.windowHeight;
const DPR = sys.pixelRatio || 2;

const canvas = tt.createCanvas(); // 第一次创建的就是屏幕上的主画布
canvas.width = W * DPR;
canvas.height = H * DPR;
const ctx = canvas.getContext('2d');
ctx.scale(DPR, DPR);

const raf = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (fn) => setTimeout(fn, 16);

// ---------- 参数 ----------
const BLOCK_H = 28;          // 每层高度
const START_W = W * 0.6;     // 初始宽度
const BASE_Y = H * 0.75;     // 底座所在高度
const PERFECT = 5;           // 误差小于 5px 判定“完美”

// ---------- 状态 ----------
let state = 'menu';          // menu | playing | over
let stack = [];              // 已放好的方块 {x, w, color}
let mover = null;            // 正在移动的方块 {x, w, dir, speed}
let pieces = [];             // 被切掉、正在掉落的碎块
let camY = 0;                // 镜头上移量（实际值）
let camTarget = 0;
let combo = 0;
let flash = 0;               // “完美”提示剩余帧数
let best = Number(safeGet('best')) || 0;

function safeGet(k) { try { return tt.getStorageSync(k); } catch (e) { return 0; } }
function safeSet(k, v) { try { tt.setStorageSync(k, v); } catch (e) {} }

function colorOf(i) { return `hsl(${(i * 12 + 190) % 360}, 70%, 60%)`; }
function score() { return stack.length - 1; }

function resetStack() {
  stack = [{ x: (W - START_W) / 2, w: START_W, color: colorOf(0) }];
}
resetStack(); // 首页也显示底座

function startGame() {
  resetStack();
  pieces = [];
  camY = camTarget = 0;
  combo = 0;
  flash = 0;
  newMover();
  state = 'playing';
}

function newMover() {
  const top = stack[stack.length - 1];
  const fromLeft = stack.length % 2 === 0;
  mover = {
    x: fromLeft ? -top.w : W,
    w: top.w,
    dir: fromLeft ? 1 : -1,
    speed: Math.min(2.5 + stack.length * 0.12, 7),
  };
}

function layerY(i) { return BASE_Y - i * BLOCK_H + camY; }

function drop() {
  const top = stack[stack.length - 1];
  const i = stack.length;
  let x = mover.x;
  let w = mover.w;

  if (Math.abs(x - top.x) < PERFECT) {
    x = top.x;
    combo++;
    flash = 40;
    tryVibrate();
  } else {
    combo = 0;
    const left = Math.max(x, top.x);
    const right = Math.min(x + w, top.x + top.w);
    const overlap = right - left;
    if (overlap <= 0) {
      pieces.push({ x, w, y: layerY(i), vy: 0, color: colorOf(i) });
      return gameOver();
    }
    // 切掉的部分变成碎块往下掉
    if (x < left) pieces.push({ x, w: left - x, y: layerY(i), vy: 0, color: colorOf(i) });
    if (x + w > right) pieces.push({ x: right, w: x + w - right, y: layerY(i), vy: 0, color: colorOf(i) });
    x = left;
    w = overlap;
  }

  stack.push({ x, w, color: colorOf(i) });
  if (layerY(i) < H * 0.45) camTarget += BLOCK_H; // 叠高了镜头跟着上移
  newMover();
}

function gameOver() {
  state = 'over';
  mover = null;
  if (score() > best) { best = score(); safeSet('best', best); }
}

function tryVibrate() { try { tt.vibrateShort({}); } catch (e) {} }

function share() {
  try {
    tt.shareAppMessage({ title: `我叠了 ${score()} 层，你能超过我吗？` });
  } catch (e) {}
}
try { tt.onShareAppMessage(() => ({ title: '叠叠高：手残党能叠几层？' })); } catch (e) {}
try { tt.showShareMenu({}); } catch (e) {}

// ---------- 按钮 ----------
const btnRetry = { x: W / 2 - 110, y: H * 0.52, w: 220, h: 52, text: '再来一局' };
const btnShare = { x: W / 2 - 110, y: H * 0.52 + 70, w: 220, h: 52, text: '炫耀给好友' };
function hit(b, x, y) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }

tt.onTouchStart((e) => {
  const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || { clientX: 0, clientY: 0 };
  if (state === 'menu') return startGame();
  if (state === 'playing') return drop();
  if (state === 'over') {
    if (hit(btnRetry, t.clientX, t.clientY)) startGame();
    else if (hit(btnShare, t.clientX, t.clientY)) share();
  }
});

// ---------- 每帧更新 ----------
function update() {
  if (mover) {
    mover.x += mover.dir * mover.speed;
    if (mover.x + mover.w > W) { mover.x = W - mover.w; mover.dir = -1; }
    if (mover.x < 0) { mover.x = 0; mover.dir = 1; }
  }
  camY += (camTarget - camY) * 0.1;
  pieces.forEach((p) => { p.vy += 0.6; p.y += p.vy; });
  pieces = pieces.filter((p) => p.y < H + 50);
  if (flash > 0) flash--;
}

// ---------- 绘制 ----------
function draw() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1b1f3b');
  g.addColorStop(1, '#3a2b5c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  stack.forEach((b, i) => drawBlock(b.x, layerY(i), b.w, b.color));
  if (mover) drawBlock(mover.x, layerY(stack.length), mover.w, colorOf(stack.length));
  pieces.forEach((p) => drawBlock(p.x, p.y, p.w, p.color));

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';

  if (state === 'menu') {
    text('叠叠高', W / 2, H * 0.28, 48);
    text('点击屏幕放下方块，对齐越准叠得越高', W / 2, H * 0.28 + 50, 15, 'rgba(255,255,255,0.8)');
    text('点击任意位置开始', W / 2, H * 0.9, 18, 'rgba(255,255,255,0.7)');
    return;
  }

  if (state === 'playing') text(String(score()), W / 2, H * 0.15, 56);

  if (flash > 0) {
    const label = combo > 1 ? `完美 ×${combo}` : '完美!';
    text(label, W / 2, H * 0.22, 26, `rgba(255,230,120,${flash / 40})`);
  }

  if (state === 'over') {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    text('游戏结束', W / 2, H * 0.25, 36);
    text(`本局 ${score()} 层`, W / 2, H * 0.25 + 56, 28);
    text(`最高 ${best} 层`, W / 2, H * 0.25 + 92, 18, 'rgba(255,255,255,0.75)');
    drawButton(btnRetry, '#ff5a7a');
    drawButton(btnShare, '#4cc3ff');
  }
}

function drawBlock(x, y, w, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, BLOCK_H - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, y, w, 4);
}

function drawButton(b, color) {
  ctx.fillStyle = color;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  text(b.text, b.x + b.w / 2, b.y + b.h / 2 + 7, 20);
}

function text(s, x, y, size, color) {
  ctx.font = `bold ${size}px sans-serif`;
  ctx.fillStyle = color || '#fff';
  ctx.fillText(s, x, y);
}

function loop() {
  update();
  draw();
  raf(loop);
}
loop();
