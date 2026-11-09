/* 漫才アニメーション本体
 * renderFrame(t) が t 秒時点の1フレームを canvas に描く（決定的＝同じ t なら同じ絵）。
 * ブラウザ再生と、render.mjs による mp4 書き出しの両方がこの関数を使う。
 */
(() => {
  const W = 1280, H = 720, FPS = 24;
  const TL = window.TIMELINE;
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  // ---------- 素材 ----------
  const SPR = {};
  const NAMES = ['m_front', 'm_left', 'm_right', 'm_shout', 'j_front', 'j_left', 'j_right', 'j_laugh'];
  const loadAll = () => Promise.all(NAMES.map(n => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { SPR[n] = im; res(); };
    im.onerror = rej;
    im.src = 'sprites/' + n + '.png';
  })));

  // ---------- ユーティリティ ----------
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = k => { k = clamp(k); return k * k * (3 - 2 * k); };
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const env = t => {
    const f = t * FPS, i = Math.floor(f), e = TL.env;
    if (i < 0 || i >= e.length - 1) return 0;
    return lerp(e[i], e[i + 1], f - i);
  };
  const lineAt = t => TL.lines.find(l => t >= l.s && t < l.e);
  const fitAt = t => TL.fitness.find(f => t >= f.call && t < f.back + 0.6);
  const pinkFrom = TL.fitness[0].strip + 3.2;   // ここからピンクのウェア姿

  // ---------- 背景（M-1風：赤×金のきらびやかなステージ。静的部分は一度だけ描く） ----------
  const BG = document.createElement('canvas');
  const BGS = 1.6;
  BG.width = W * BGS; BG.height = H * BGS;
  const FLOOR = 560;        // 床と壁の境目
  const FEET = 660;         // 立ち位置の足元

  function goldGrad(g, x0, y0, x1, y1) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, '#6b4a10'); gr.addColorStop(0.25, '#f6d776'); gr.addColorStop(0.5, '#fff6c8');
    gr.addColorStop(0.75, '#d9a93a'); gr.addColorStop(1, '#6b4a10');
    return gr;
  }

  function paintStatic() {
    const g = BG.getContext('2d');
    g.scale(BGS, BGS);
    // 奥の壁
    let gr = g.createLinearGradient(0, 0, 0, FLOOR);
    gr.addColorStop(0, '#12020a'); gr.addColorStop(0.55, '#5a0612'); gr.addColorStop(1, '#a01018');
    g.fillStyle = gr; g.fillRect(0, 0, W, FLOOR);

    // 中央の放射光
    g.save(); g.translate(640, 330);
    for (let i = 0; i < 36; i++) {
      g.rotate(Math.PI * 2 / 36);
      const rg = g.createLinearGradient(0, 0, 0, -620);
      rg.addColorStop(0, 'rgba(255,210,90,0.55)'); rg.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = rg;
      g.beginPath(); g.moveTo(-6, -150); g.lineTo(6, -150); g.lineTo(34, -620); g.lineTo(-34, -620); g.fill();
    }
    g.restore();

    // LEDパネルの格子
    g.save(); g.globalAlpha = 0.5;
    for (let x = 0; x < W; x += 40) for (let y = 30; y < FLOOR; y += 40) {
      const d = Math.hypot(x - 640, y - 330);
      if (d < 215) continue;
      const k = 0.25 + 0.75 * rnd(x * 0.31 + y * 1.7);
      g.fillStyle = `rgba(255,${90 + 110 * k | 0},${30 * k | 0},${0.10 + 0.22 * k})`;
      g.fillRect(x + 3, y + 3, 34, 34);
    }
    g.restore();

    // 左右の金の柱
    for (const px of [70, 250, 1030, 1210]) {
      g.fillStyle = goldGrad(g, px - 28, 0, px + 28, 0);
      g.fillRect(px - 28, 0, 56, FLOOR);
      g.fillStyle = 'rgba(60,20,0,0.55)'; g.fillRect(px - 14, 0, 28, FLOOR);
    }
    // 左右のアーチ（金の門）
    for (const ax of [160, 1120]) {
      g.lineWidth = 16; g.strokeStyle = goldGrad(g, ax - 110, 0, ax + 110, 0);
      g.beginPath(); g.moveTo(ax - 76, FLOOR); g.lineTo(ax - 76, 300); g.arc(ax, 300, 76, Math.PI, 0); g.lineTo(ax + 76, FLOOR); g.stroke();
      const ag = g.createLinearGradient(0, 220, 0, FLOOR);
      ag.addColorStop(0, '#2a0410'); ag.addColorStop(1, '#c2281c');
      g.fillStyle = ag;
      g.beginPath(); g.moveTo(ax - 68, FLOOR); g.lineTo(ax - 68, 300); g.arc(ax, 300, 68, Math.PI, 0); g.lineTo(ax + 68, FLOOR); g.fill();
    }

    // 中央の大円（金の多重リング）
    const cg = g.createRadialGradient(640, 330, 10, 640, 330, 200);
    cg.addColorStop(0, '#fff2b0'); cg.addColorStop(0.35, '#ff9a2a'); cg.addColorStop(0.8, '#b3160f'); cg.addColorStop(1, '#3a0408');
    g.fillStyle = cg; g.beginPath(); g.arc(640, 330, 200, 0, 7); g.fill();
    [[205, 20], [165, 9], [128, 6]].forEach(([r, w]) => {
      g.lineWidth = w; g.strokeStyle = goldGrad(g, 640 - r, 330 - r, 640 + r, 330 + r);
      g.beginPath(); g.arc(640, 330, r, 0, 7); g.stroke();
    });
    // 中央のエンブレム（オリジナル。番組ロゴは使わない）
    g.save(); g.translate(640, 330);
    g.fillStyle = '#7a0a0a'; g.beginPath(); g.arc(0, 0, 96, 0, 7); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#f6d776'; g.stroke();
    g.font = '900 120px "IPAGothic","Noto Sans JP",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#3a0505'; g.strokeText('笑', 0, 6);
    g.fillStyle = goldGrad(g, -60, -60, 60, 60); g.fillText('笑', 0, 6);
    g.restore();

    // 上部トラスと看板
    g.fillStyle = '#08060a'; g.fillRect(0, 0, W, 34);
    g.fillStyle = goldGrad(g, 0, 34, 0, 60); g.fillRect(0, 34, W, 22);
    g.fillStyle = '#5a0612'; g.fillRect(0, 40, W, 10);

    // 床（光沢のある黒赤）
    gr = g.createLinearGradient(0, FLOOR, 0, H);
    gr.addColorStop(0, '#3b060c'); gr.addColorStop(0.3, '#1a0408'); gr.addColorStop(1, '#070205');
    g.fillStyle = gr; g.fillRect(0, FLOOR, W, H - FLOOR);
    // 壁の映り込み
    const rf = g.createRadialGradient(640, FLOOR, 10, 640, FLOOR, 520);
    rf.addColorStop(0, 'rgba(255,170,60,0.55)'); rf.addColorStop(1, 'rgba(255,90,20,0)');
    g.save(); g.translate(0, FLOOR); g.scale(1, 0.32); g.translate(0, -FLOOR);
    g.fillStyle = rf; g.fillRect(0, FLOOR, W, 600); g.restore();
    // 円形のお立ち台
    g.save(); g.translate(640, FEET + 6); g.scale(1, 0.2);
    const pg = g.createRadialGradient(0, 0, 20, 0, 0, 420);
    pg.addColorStop(0, '#d21c1c'); pg.addColorStop(0.75, '#7c0c12'); pg.addColorStop(1, '#3a0408');
    g.fillStyle = pg; g.beginPath(); g.arc(0, 0, 420, 0, 7); g.fill();
    g.lineWidth = 14; g.strokeStyle = '#f6d776'; g.stroke();
    g.lineWidth = 5; g.strokeStyle = 'rgba(255,240,180,0.6)'; g.beginPath(); g.arc(0, 0, 330, 0, 7); g.stroke();
    g.restore();
    // 床の境目の金ライン
    g.fillStyle = goldGrad(g, 0, FLOOR - 6, 0, FLOOR + 6); g.fillRect(0, FLOOR - 5, W, 9);
  }

  // 電球・スポットライトなど動く部分
  function paintLights(t, party) {
    const bulb = (x, y, on, r = 4.2) => {
      ctx.fillStyle = on ? '#fff7cf' : '#8a5a16';
      if (on) { ctx.shadowColor = '#ffd34a'; ctx.shadowBlur = 12; }
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
    };
    const step = Math.floor(t * (party ? 10 : 4));
    // 中央リングの電球（流れる）
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2;
      bulb(640 + Math.cos(a) * 205, 330 + Math.sin(a) * 205, (i + step) % 3 !== 0);
    }
    // 柱の電球
    for (const px of [70, 250, 1030, 1210]) for (let y = 70; y < FLOOR - 10; y += 26) bulb(px, y, ((y / 26 | 0) + step) % 4 !== 0, 3.6);
    // アーチの電球
    for (const ax of [160, 1120]) for (let i = 0; i <= 14; i++) {
      const a = Math.PI + i / 14 * Math.PI;
      bulb(ax + Math.cos(a) * 76, 300 + Math.sin(a) * 76, (i + step) % 3 !== 0, 3.4);
    }
    // 上からのスポットライト
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cols = party ? ['255,60,160', '80,200,255', '255,230,60', '120,255,120', '255,120,40', '190,110,255']
      : ['255,220,150', '255,190,110', '255,235,190', '255,190,110', '255,220,150', '255,200,130'];
    for (let i = 0; i < 6; i++) {
      const x0 = 140 + i * 200;
      const sway = Math.sin(t * (party ? 3.1 : 0.45) + i * 1.3) * (party ? 0.42 : 0.12);
      ctx.save(); ctx.translate(x0, 44); ctx.rotate(sway);
      const lg = ctx.createLinearGradient(0, 0, 0, 640);
      const c = cols[(i + (party ? step >> 2 : 0)) % 6];
      lg.addColorStop(0, `rgba(${c},${party ? 0.5 : 0.26})`); lg.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(95, 640); ctx.lineTo(-95, 640); ctx.fill();
      ctx.restore();
      ctx.fillStyle = `rgba(${c},0.95)`; ctx.beginPath(); ctx.arc(x0, 46, 9, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- 小道具 ----------
  function drawMic() {
    const x = 645;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, FEET + 4, 46, 9, 0, 0, 7); ctx.fill();
    let g = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
    g.addColorStop(0, '#55595f'); g.addColorStop(0.5, '#e9edf2'); g.addColorStop(1, '#4c5056');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, FEET - 2, 38, 8, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#1c1c1f'; ctx.lineWidth = 1.5; ctx.stroke();
    g = ctx.createLinearGradient(x - 4, 0, x + 4, 0);
    g.addColorStop(0, '#6c7178'); g.addColorStop(0.5, '#f4f6f8'); g.addColorStop(1, '#5b6067');
    ctx.fillStyle = g; ctx.fillRect(x - 3.5, 372, 7, FEET - 374);
    ctx.strokeRect(x - 3.5, 372, 7, FEET - 374);
    // マイク本体（センターマイク風・ロゴなし）
    ctx.fillStyle = '#3b3e44'; ctx.fillRect(x - 6, 356, 12, 20);
    g = ctx.createLinearGradient(x - 16, 0, x + 16, 0);
    g.addColorStop(0, '#7b8088'); g.addColorStop(0.45, '#f2f4f6'); g.addColorStop(1, '#666b73');
    ctx.fillStyle = g; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - 16, 296, 32, 62, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.roundRect(x - 12, 300, 24, 30, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,45,0.6)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 12, 303 + i * 5); ctx.lineTo(x + 12, 303 + i * 5); ctx.stroke(); }
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x - 12 + i * 4.8, 300); ctx.lineTo(x - 12 + i * 4.8, 330); ctx.stroke(); }
    ctx.restore();
  }

  const MX = 300;   // エクササイズ器具の位置
  function drawMachine(t, swing) {
    ctx.save(); ctx.translate(MX, FEET);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 6, 120, 13, 0, 0, 7); ctx.fill();
    const tube = (pts, w = 9) => {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#26282c'; ctx.lineWidth = w + 3; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      ctx.strokeStyle = '#f2f4f7'; ctx.lineWidth = w; ctx.stroke();
    };
    tube([[-105, 2], [105, 2]], 11);
    tube([[-85, 2], [-70, -190], [-20, -205]]);            // 奥の手すり
    tube([[85, 2], [70, -190], [20, -205]]);
    tube([[-70, -190], [70, -190]], 7);
    // 振り子ペダル
    for (const s of [-1, 1]) {
      const a = s * swing * 0.5;
      const px = Math.sin(a) * 150, py = -175 + Math.cos(a) * 150;
      tube([[s * 22, -175], [s * 22 + px, py]], 6);
      ctx.fillStyle = '#c9202a'; ctx.strokeStyle = '#26282c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(s * 22 + px - 22, py - 4, 44, 9, 3); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- キャラクター ----------
  // スプライト内の口の位置（正面絵のみ口パクを重ねる）
  const MOUTH = { m_front: [121, 131, 13], j_front: [148, 164, 17] };

  function drawMouth(name, open) {
    const m = MOUTH[name]; if (!m || open < 0.12) return;
    const im = SPR[name];
    const x = m[0] - im.width / 2, y = m[1] - im.height;
    const rx = m[2] * (0.75 + 0.3 * open), ry = 2 + m[2] * 0.62 * open;
    ctx.fillStyle = '#4a1712'; ctx.strokeStyle = '#2a120d'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(x, y + ry * 0.45, rx, ry, 0, 0, 7); ctx.fill(); ctx.stroke();
    if (open > 0.35) {
      ctx.save(); ctx.beginPath(); ctx.ellipse(x, y + ry * 0.45, rx - 1, ry - 1, 0, 0, 7); ctx.clip();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - rx, y - ry, rx * 2, ry * 0.75);
      ctx.fillStyle = '#e0706f'; ctx.beginPath(); ctx.ellipse(x, y + ry * 1.35, rx * 0.7, ry * 0.7, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
  }

  function shadow(x, w) {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath(); ctx.ellipse(x, FEET + 3, w, 11, 0, 0, 7); ctx.fill();
  }

  // o: {x, name, h(画面上の高さ), talk(0-1), lean, hop, sq(つぶれ), flip}
  function drawSprite(o) {
    const im = SPR[o.name];
    const sc = o.h / im.height;
    shadow(o.x, im.width * sc * 0.42);
    ctx.save();
    ctx.translate(o.x, FEET - (o.hop || 0));
    ctx.rotate(o.lean || 0);
    const sq = (o.sq || 0) + o.talk * 0.012;
    ctx.scale(sc * (o.flip ? -1 : 1) * (1 + sq * 0.6), sc * (1 - sq));
    ctx.drawImage(im, -im.width / 2, -im.height);
    drawMouth(o.name, o.talk);
    ctx.restore();
  }

  // ピンクのスポーツウェア姿の松田（頭はスプライト、体はベクター描画）
  const SKIN = '#f4cba8', INK = '#2a1a14', PINK = '#d6337f', PINK2 = '#a81f60';
  function limb(x, y, a1, l1, a2, l2, w, col, sock) {
    const ex = x + Math.sin(a1) * l1, ey = y + Math.cos(a1) * l1;
    const fx = ex + Math.sin(a2) * l2, fy = ey + Math.cos(a2) * l2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = w + 3.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
    if (sock) {   // 青いしましまソックス＋白い靴
      const k = 0.42, sx = lerp(ex, fx, k), sy = lerp(ey, fy, k);
      ctx.strokeStyle = '#2545b8'; ctx.lineWidth = w + 1; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.strokeStyle = '#8fb0ff'; ctx.lineWidth = w + 1; ctx.setLineDash([5, 9]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(fx, fy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fafafa'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(fx + 7, fy + 8, 21, 10, 0, 0, 7); ctx.fill(); ctx.stroke();
    }
    return [fx, fy];
  }

  // p: {x, h, talk, lean, hop, flip, armL:[a1,a2], armR:[a1,a2], legL:[a1,a2], legR:[a1,a2], headTilt, socks}
  function drawPink(p) {
    const im = SPR.m_front;
    const sc = p.h / 599;
    shadow(p.x, 70);
    ctx.save();
    ctx.translate(p.x, FEET - (p.hop || 0));
    ctx.rotate(p.lean || 0);
    ctx.scale(sc * (p.flip ? -1 : 1), sc);
    ctx.translate(0, -599);          // 以降はスプライトと同じ 243x599 の座標系（中心 x=0）
    const socks = p.socks !== false;
    ctx.save(); ctx.scale(1.3, 1);   // 体は頭に対して少し幅広に
    // 脚
    limb(-26, 345, p.legL[0], 122, p.legL[1], 118, 34, SKIN, socks);
    limb(26, 345, p.legR[0], 122, p.legR[1], 118, 34, SKIN, socks);
    // 奥側の腕は胴体の前に描く簡易表現なので先に胴体
    ctx.fillStyle = SKIN; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-58, 172); ctx.quadraticCurveTo(0, 158, 58, 172);
    ctx.quadraticCurveTo(50, 250, 46, 300); ctx.quadraticCurveTo(54, 330, 52, 352);
    ctx.lineTo(-52, 352); ctx.quadraticCurveTo(-54, 330, -46, 300); ctx.quadraticCurveTo(-50, 250, -58, 172);
    ctx.fill(); ctx.stroke();
    // 首
    ctx.fillRect(-17, 140, 34, 34);
    // へそ
    ctx.strokeStyle = 'rgba(120,70,40,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 292, 4, 0.3, 2.8); ctx.stroke();
    // ブラトップ
    ctx.fillStyle = PINK; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-55, 196); ctx.quadraticCurveTo(0, 180, 55, 196);
    ctx.lineTo(51, 250); ctx.quadraticCurveTo(0, 262, -51, 250); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-36, 196); ctx.lineTo(-30, 162); ctx.moveTo(36, 196); ctx.lineTo(30, 162); ctx.stroke();
    ctx.strokeStyle = PINK2; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = '#f7a8cf'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-50, 240); ctx.quadraticCurveTo(0, 252, 50, 240); ctx.stroke();
    // ショートパンツ
    ctx.fillStyle = PINK; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-49, 314); ctx.quadraticCurveTo(0, 322, 49, 314);
    ctx.lineTo(58, 392); ctx.lineTo(6, 396); ctx.lineTo(0, 372); ctx.lineTo(-6, 396); ctx.lineTo(-58, 392); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = PINK2; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-48, 322); ctx.quadraticCurveTo(0, 330, 48, 322); ctx.stroke();
    // 腕
    const hl = limb(-62, 186, p.armL[0], 82, p.armL[1], 78, 22, SKIN);
    const hr = limb(62, 186, p.armR[0], 82, p.armR[1], 78, 22, SKIN);
    for (const h of [hl, hr]) { ctx.fillStyle = SKIN; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(h[0], h[1], 14, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    // 頭（スプライト上部を切り出して使用）
    ctx.save(); ctx.translate(0, 150); ctx.rotate(p.headTilt || 0); ctx.translate(0, -150);
    ctx.drawImage(im, 0, 0, 243, 153, -121.5, 0, 243, 153);
    const m = MOUTH.m_front, open = p.talk;
    if (open > 0.12) {
      const rx = m[2] * (0.8 + 0.4 * open), ry = 2 + m[2] * 0.75 * open;
      ctx.fillStyle = '#4a1712'; ctx.strokeStyle = '#2a120d'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, m[1] + ry * 0.45, rx, ry, 0, 0, 7); ctx.fill(); ctx.stroke();
      if (open > 0.35) { ctx.fillStyle = '#fff'; ctx.fillRect(-rx * 0.7, m[1] - ry * 0.4, rx * 1.4, ry * 0.45); }
    }
    ctx.restore();
    ctx.restore();
  }

  // ---------- 演出 ----------
  function impact(x, y, k, big) {   // ツッコミの衝撃マーク
    if (k <= 0 || k >= 1) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(big ? 1.5 : 1, big ? 1.5 : 1);
    ctx.globalAlpha = 1 - k * k;
    const r = 26 + 46 * ease(k);
    ctx.fillStyle = '#fff36b'; ctx.strokeStyle = '#d1281c'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, rr = i % 2 ? r * 0.5 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function telop(text, k, y, size, col) {   // 画面に飛び込む大きな文字
    if (k <= 0 || k >= 1) return;
    const pop = k < 0.12 ? 1.9 - 0.9 * ease(k / 0.12) : 1 + 0.03 * Math.sin(k * 50);
    ctx.save(); ctx.translate(640, y); ctx.rotate(-0.045); ctx.scale(pop, pop);
    ctx.globalAlpha = k > 0.88 ? (1 - k) / 0.12 : 1;
    ctx.font = `900 ${size}px "IPAGothic","Noto Sans JP",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a0010'; ctx.lineWidth = size * 0.3; ctx.strokeText(text, 0, 0);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = size * 0.14; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = col; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function notes(t, t0) {   // エクササイズ中の音符
    ctx.save(); ctx.font = '900 44px sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i < 9; i++) {
      const life = ((t - t0) * 0.45 + rnd(i) * 3) % 1;
      const x = MX + (i % 2 ? 1 : -1) * (95 + rnd(i + 20) * 130) + Math.sin(t * 2 + i) * 16;
      const y = 380 - life * 270;
      ctx.globalAlpha = Math.sin(life * Math.PI);
      ctx.fillStyle = ['#ff5fb0', '#5fd0ff', '#ffe45f', '#8dff8a'][i % 4];
      ctx.strokeStyle = '#1a0010'; ctx.lineWidth = 5;
      const ch = i % 2 ? '♪' : '♫';
      ctx.strokeText(ch, x, y); ctx.fillText(ch, x, y);
    }
    ctx.restore();
  }

  function clothes(t, t0) {   // 脱ぎ捨てた服が飛ぶ
    const items = [['#15151a', 0.0, -1], ['#f3f3f3', 0.45, 1], ['#1c2c6b', 0.75, -1], ['#15151a', 1.2, 1]];
    items.forEach(([col, d, dir], i) => {
      const k = (t - t0 - d) / 0.9; if (k <= 0) return;
      const kk = Math.min(k, 1);
      const x = 500 + dir * (40 + 150 * kk) + i * 8, y = k >= 1 ? FEET - 4 : 380 - 230 * Math.sin(kk * Math.PI * 0.62) + 290 * kk * kk;
      ctx.save(); ctx.translate(x, Math.min(y, FEET - 4)); ctx.rotate(k >= 1 ? 0.2 * dir : kk * 5 * dir);
      ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath();
      if (k >= 1) ctx.ellipse(0, 0, 38, 8, 0, 0, 7); else ctx.roundRect(-30, -22, 60, 44, 10);
      ctx.fill(); ctx.stroke(); ctx.restore();
    });
  }

  // ---------- 字幕 ----------
  const WHO = { m: ['松田', '#3aa0ff'], j: ['じろう', '#ffc928'] };
  function subtitle(line) {
    if (!line || !line.text) return;
    ctx.save();
    ctx.font = '900 38px "IPAGothic","Noto Sans JP",sans-serif'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    // 長い行は2行に折り返す
    const max = 1010; let rows = [line.text];
    if (ctx.measureText(line.text).width > max) {
      const s = line.text; let cut = Math.ceil(s.length / 2), best = cut, bd = 99;
      for (let i = 4; i < s.length - 3; i++) if ('、。！？ '.includes(s[i]) && Math.abs(i + 1 - cut) < bd) { bd = Math.abs(i + 1 - cut); best = i + 1; }
      rows = [s.slice(0, best), s.slice(best)];
    }
    const [name, col] = WHO[line.who];
    const y0 = 668 - (rows.length - 1) * 46;
    const g = ctx.createLinearGradient(0, y0 - 46, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, 'rgba(0,0,0,0.62)'); g.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = g; ctx.fillRect(0, y0 - 46, W, H - y0 + 46);
    const w = Math.max(...rows.map(r => ctx.measureText(r).width));
    const x0 = 640 - w / 2 + 50;
    // 話者ラベル
    ctx.font = '900 24px "IPAGothic","Noto Sans JP",sans-serif';
    const nw = ctx.measureText(name).width + 22;
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x0 - nw - 14, y0 - 18, nw, 36, 6); ctx.fill();
    ctx.fillStyle = '#10101a'; ctx.textAlign = 'center'; ctx.fillText(name, x0 - nw / 2 - 14, y0 + 1);
    ctx.font = '900 38px "IPAGothic","Noto Sans JP",sans-serif'; ctx.textAlign = 'left';
    rows.forEach((r, i) => {
      ctx.strokeStyle = '#000'; ctx.lineWidth = 8; ctx.strokeText(r, x0, y0 + i * 46);
      ctx.fillStyle = '#fff'; ctx.fillText(r, x0, y0 + i * 46);
    });
    ctx.restore();
  }

  // ---------- カメラ ----------
  const SHOTS = {
    wide: [640, 360, 1], mid: [645, 385, 1.42], m: [520, 330, 1.85], j: [775, 345, 1.85],
    gym: [400, 400, 1.3], gymcu: [300, 330, 1.9], two: [645, 350, 1.62],
  };
  function camAt(t) {
    let cur = TL.shots[0];
    for (const s of TL.shots) { if (s.t <= t) cur = s; else break; }
    const [cx, cy, z] = SHOTS[cur.shot];
    const drift = 1 + Math.min(t - cur.t, 12) * 0.004;   // カット中のゆっくりした寄り
    return [cx, cy, z * drift];
  }

  // ---------- 1フレーム描画 ----------
  function renderFrame(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const line = lineAt(t);
    const e = env(t);
    const fit = fitAt(t);
    const pink = t >= pinkFrom;
    const exercising = fit && t >= fit.ex && t < fit.exEnd;
    const party = !!exercising;

    const [cx, cy, z] = camAt(t);
    ctx.setTransform(z, 0, 0, z, W / 2 - cx * z, H / 2 - cy * z);
    ctx.drawImage(BG, 0, 0, W, H);
    paintLights(t, party);
    if (t >= TL.fitness[0].call - 0.2) drawMachine(t, exercising ? Math.sin((t - fit.ex) * 9) : 0);
    drawMic();

    const talkM = line && line.who === 'm' ? clamp(e * 1.5) : 0;
    const talkJ = line && line.who === 'j' ? clamp(e * 1.5) : 0;
    const slap = TL.slaps.find(s => t >= s.t - 0.12 && t < s.t + 0.55);
    const sk = slap ? (t - slap.t) : -1;

    // ---- じろう ----
    let jn = 'j_front', jlean = 0, jx = 795, jhop = 0, jsq = 0;
    if (line && line.who === 'j') { jn = line.pose === 'laugh' ? 'j_laugh' : 'j_front'; jhop = talkJ * 5; }
    else if (line && line.who === 'm') jn = line.other === 'front' ? 'j_front' : line.other === 'laugh' ? 'j_laugh' : 'j_left';
    if (fit && t >= fit.strip && t < fit.back) jn = (t - fit.strip) % 7 < 4.5 ? 'j_left' : 'j_front';
    if (slap && slap.by === 'j') {      // 叩く：体ごと相手側へ踏み込む
      const k = sk < 0 ? ease((sk + 0.12) / 0.12) : 1 - ease(sk / 0.35);
      jn = 'j_left'; jx -= 85 * k; jlean = -0.2 * k; jhop = 14 * k;
    }
    if (jn === 'j_laugh') { jhop += Math.abs(Math.sin(t * 13)) * 5; jsq = 0.01 * Math.sin(t * 26); }
    const jidle = Math.sin(t * 1.7 + 1) * 0.006;
    const J = { x: jx, name: jn, h: jn === 'j_laugh' ? 505 : 478, talk: talkJ, lean: jlean + jidle, hop: jhop, sq: jsq };

    // ---- 松田 ----
    let M;
    const hit = slap && slap.by === 'j' && sk >= 0 ? 1 - ease(sk / 0.5) : 0;
    if (!pink) {
      let mn = 'm_front', mhop = 0, mlean = 0, msq = 0, mx = 500;
      if (line && line.who === 'm') { mn = line.pose === 'shout' ? 'm_shout' : 'm_front'; mhop = talkM * 6; }
      else if (line && line.who === 'j') mn = line.other === 'front' ? 'm_front' : 'm_right';
      if (mn === 'm_shout') { mlean = Math.sin(t * 9) * 0.018 * (0.4 + talkM); mhop = talkM * 9; }
      const st = TL.fitness[0].strip;
      if (t >= st) { mn = 'm_front'; mx += Math.sin(t * 46) * 7; mlean = Math.sin(t * 31) * 0.07; mhop = Math.abs(Math.sin(t * 15)) * 12; }
      else if (t >= TL.fitness[0].call && t < st) { mn = 'm_shout'; mhop = Math.abs(Math.sin(t * 16)) * 16; }
      mlean -= hit * 0.16; msq += hit * 0.05;
      M = () => drawSprite({ x: mx - hit * 14, name: mn, h: mn === 'm_shout' ? 520 : 500, talk: talkM, lean: mlean + Math.sin(t * 1.5) * 0.005, hop: mhop, sq: msq });
    } else {
      const p = { x: 500, h: 500, talk: talkM, lean: -hit * 0.14, hop: 0, armL: [0.12, 0.05], armR: [-0.12, -0.05], legL: [0.03, 0], legR: [-0.03, 0], headTilt: -hit * 0.3 };
      const f = TL.fitness.find(f => t >= f.strip && t < f.back + 0.01) || null;
      const sway = Math.sin(t * 9);
      if (f) {
        const run = (k, from, to) => {   // 走る
          p.x = lerp(from, to, ease(k)); p.flip = to > from;
          const c = Math.sin(t * 22); p.legL = [0.75 * c, 0.5 + 0.5 * c]; p.legR = [-0.75 * c, 0.5 - 0.5 * c];
          p.armL = [-0.9 * c, -1.2]; p.armR = [0.9 * c, -1.2]; p.hop = Math.abs(c) * 12; p.lean = (to > from ? 1 : -1) * 0.12;
          if (p.flip) p.lean = 0.12;
        };
        const goFrom = Math.max(f.strip + (f === TL.fitness[0] ? 3.2 : 0), f.strip);
        if (t < f.go) {               // 靴下を履く（かがむ）※1回目のみ
          const k = prog(t, goFrom, f.go);
          p.socks = k > 0.55; p.lean = -0.35 * Math.sin(k * Math.PI); p.armL = [0.5, 0.2]; p.armR = [0.2, 0.1];
          p.legL = [0.5 * Math.sin(k * Math.PI), -0.7 * Math.sin(k * Math.PI)]; p.hop = 4 * Math.abs(Math.sin(t * 12));
        } else if (t < f.ex) run(prog(t, f.go, f.ex), 500, MX);
        else if (t < f.exEnd) {       // 器具でエクササイズ
          p.x = MX; p.hop = 14 + Math.abs(sway) * 10;
          p.legL = [0.62 * sway, 0.05]; p.legR = [-0.62 * sway, 0.05];
          p.armL = [-0.5, 0.25 + 0.15 * sway]; p.armR = [0.5, -0.25 + 0.15 * sway];
          p.lean = 0.05 * sway; p.headTilt = 0.1 * Math.sin(t * 4.5);
        } else run(prog(t, f.exEnd, f.back), MX, 500);
      } else {
        // マイク前：しゃべりに合わせて手振り
        const g = talkM;
        p.hop = g * 6; p.armL = [-0.15 - g * 0.5, -0.2 - g * 1.3]; p.armR = [0.15 + g * 0.4, 0.2 + g * 1.0];
        if (line && line.who === 'm' && line.pose === 'shout') { p.armL = [-0.5, -2.4 + 0.2 * sway]; p.armR = [0.5, 2.4 - 0.2 * sway]; p.hop = 8 + Math.abs(sway) * 10; }
        if (line && line.pose === 'doya') { p.armL = [-0.75, 2.2]; p.armR = [0.75, -2.2]; p.headTilt = -0.12; }   // 腰に手
      }
      M = () => drawPink(p);
    }
    // スーツ姿の「どや顔」
    if (!pink && line && line.pose === 'doya') {
      M = () => drawSprite({ x: 500, name: 'm_front', h: 500, talk: 0, lean: -0.05, hop: 0, sq: -0.015 });
    }

    M(); drawSprite(J);
    if (t >= TL.fitness[0].strip && t < TL.fitness[0].ex + 400) clothes(t, TL.fitness[0].strip + 0.4);
    if (exercising) notes(t, fit.ex);
    if (slap) impact(slap.by === 'j' ? 512 : 780, slap.high ? 175 : 200, sk / 0.4, slap.big);

    // ---- 画面固定の要素 ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (party) {   // エクササイズ中はフラッシュ
      ctx.fillStyle = `hsla(${(t * 240) % 360},90%,60%,0.10)`; ctx.fillRect(0, 0, W, H);
    }
    for (const tp of TL.telops) telop(tp.text, prog(t, tp.s, tp.e), tp.y || 250, tp.size || 110, tp.col || '#ff3d9a');
    // コンビ名テロップ
    const nk = prog(t, 0.3, 5.5);
    if (nk > 0 && nk < 1) {
      ctx.save(); ctx.globalAlpha = Math.min(1, nk * 12, (1 - nk) * 12);
      ctx.fillStyle = 'rgba(120,8,14,0.92)'; ctx.beginPath(); ctx.roundRect(40, 560, 470, 84, 8); ctx.fill();
      ctx.strokeStyle = '#f6d776'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#f6d776'; ctx.font = '900 20px "IPAGothic",sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(TL.title.sub, 62, 582);
      ctx.fillStyle = '#fff'; ctx.font = '900 40px "IPAGothic",sans-serif'; ctx.fillText(TL.title.main, 60, 618);
      ctx.restore();
    }
    if (!(nk > 0 && nk < 1)) subtitle(line);
    // 冒頭フェードイン／オチの暗転
    const fade = Math.max(1 - prog(t, 0, 0.5), prog(t, TL.blackout, TL.blackout + 0.35));
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  }

  window.ANIM = { W, H, FPS, duration: TL.duration, ready: loadAll().then(() => { paintStatic(); renderFrame(0); }), renderFrame };
})();
