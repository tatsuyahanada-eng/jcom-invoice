/* 漫才アニメーション本体
 * renderFrame(t) が t 秒時点の1フレームを canvas に描く（決定的＝同じ t なら同じ絵）。
 * ブラウザ再生と、render.mjs による mp4 書き出しの両方がこの関数を使う。
 */
(() => {
  const W = 1280, H = 720, FPS = 30;
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
  const sample = (e, t) => {
    const f = t * FPS, i = Math.floor(f);
    if (i < 0 || i >= e.length - 1) return 0;
    return lerp(e[i], e[i + 1], f - i);
  };
  const env = t => sample(TL.env, t), envS = t => sample(TL.envS, t);
  const lineAt = t => TL.lines.find(l => t >= l.s && t < l.e);

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

  // 電球・スポットライトなど動く部分（点滅は段階的でなく、なめらかに明滅させる）
  const GLOW = document.createElement('canvas'); GLOW.width = GLOW.height = 40;
  {
    const g = GLOW.getContext('2d'), r = g.createRadialGradient(20, 20, 1, 20, 20, 20);
    r.addColorStop(0, 'rgba(255,252,225,1)'); r.addColorStop(0.22, 'rgba(255,236,150,0.95)'); r.addColorStop(0.5, 'rgba(255,200,70,0.35)'); r.addColorStop(1, 'rgba(255,180,40,0)');
    g.fillStyle = r; g.fillRect(0, 0, 40, 40);
  }
  function paintLights(t, party) {
    const sp = party ? 9 : 2.6;
    const bulb = (x, y, ph, r) => {
      const b = 0.5 + 0.5 * Math.sin(t * sp - ph);
      ctx.fillStyle = '#8a5a16'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.25 + 0.75 * b * b; ctx.drawImage(GLOW, x - r * 3.4, y - r * 3.4, r * 6.8, r * 6.8); ctx.globalAlpha = 1;
    };
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; bulb(640 + Math.cos(a) * 205, 330 + Math.sin(a) * 205, i * 0.52, 4.2); }
    for (const px of [70, 250, 1030, 1210]) for (let y = 70, i = 0; y < FLOOR - 10; y += 26, i++) bulb(px, y, i * 0.7, 3.6);
    for (const ax of [160, 1120]) for (let i = 0; i <= 14; i++) { const a = Math.PI + i / 14 * Math.PI; bulb(ax + Math.cos(a) * 76, 300 + Math.sin(a) * 76, i * 0.6, 3.4); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x0 = 140 + i * 200;
      const sway = Math.sin(t * (party ? 2.2 : 0.45) + i * 1.3) * (party ? 0.36 : 0.12);
      const hue = party ? (t * 70 + i * 60) % 360 : 38;
      const c = party ? `hsla(${hue},95%,62%,` : 'rgba(255,214,140,';
      ctx.save(); ctx.translate(x0, 44); ctx.rotate(sway);
      const lg = ctx.createLinearGradient(0, 0, 0, 640);
      lg.addColorStop(0, c + (party ? 0.5 : 0.26) + ')'); lg.addColorStop(1, c + '0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(95, 640); ctx.lineTo(-95, 640); ctx.fill();
      ctx.restore();
      ctx.fillStyle = c + '0.95)'; ctx.beginPath(); ctx.arc(x0, 46, 9, 0, 7); ctx.fill();
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
    ctx.fillStyle = g; ctx.fillRect(x - 3.5, 372, 7, FEET - 374); ctx.strokeRect(x - 3.5, 372, 7, FEET - 374);
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

  // ---------- 共通の線画ヘルパー ----------
  const SKIN = '#f6cfac', SKIN_D = '#e2b58f', INK = '#2a1a14', PINK = '#d6337f', PINK2 = '#a81f60', SOCK = '#2b4cc4', SOCK2 = '#9db8ff';
  function path(pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); }
  function tube(pts, w, col, ink = INK) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    path(pts); ctx.strokeStyle = ink; ctx.lineWidth = w + 3.5; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }
  // 2関節のIK：a(付け根)→b(先端)。dir で肘・膝の曲がる向きを選ぶ。戻り値 [関節, 先端]
  function ik(ax, ay, bx, by, l1, l2, dir) {
    let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 0.001;
    const dc = clamp(d, Math.abs(l1 - l2) + 1, l1 + l2 - 0.5);
    if (dc !== d) { bx = ax + dx / d * dc; by = ay + dy / d * dc; d = dc; }
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const base = Math.atan2(by - ay, bx - ax) + dir * a;
    return [[ax + Math.cos(base) * l1, ay + Math.sin(base) * l1], [bx, by]];
  }
  const fromAngles = (x, y, a1, l1, a2, l2) => {
    const j = [x + Math.sin(a1) * l1, y + Math.cos(a1) * l1];
    return [j, [j[0] + Math.sin(a2) * l2, j[1] + Math.cos(a2) * l2]];
  };
  const noise = x => { const i = Math.floor(x), f = x - i; return lerp(rnd(i), rnd(i + 1), f * f * (3 - 2 * f)); };   // なめらかな乱数 0..1
  const pulse = (t, a, b, fi = 0.25, fo = 0.25) => ease((t - a) / fi) * ease((b - t) / fo);       // a〜bで1になる山
  const bounce = (t, hz) => 0.5 - 0.5 * Math.cos(t * hz * Math.PI * 2);

  // ---------- 顔（口パク・まばたき） ----------
  const FACE = {
    m_front: { mouth: [121, 131, 13], eyes: [[102, 91], [140, 91]], er: [10.5, 6.5], skin: '#fbd8bb' },
    j_front: { mouth: [148, 164, 17], eyes: [[122, 122], [175, 121]], er: [12.5, 7.5], skin: '#fccdad' },
    m_right: { mouth: [131, 134, 6], side: true },
  };
  const blinkAt = (t, seed) => {
    const P = 3.3, k = Math.floor(t / P + seed), tb = (k - seed + 0.25 + 0.5 * rnd(k * 3.1 + seed * 17)) * P, d = t - tb;
    return d > 0 && d < 0.17 ? Math.sin(d / 0.17 * Math.PI) : 0;
  };
  function drawFace(name, ox, oy, talk, blink, t) {
    const f = FACE[name]; if (!f) return;
    if (f.eyes && blink > 0.05) {
      for (const [ex, ey] of f.eyes) {
        const [rx, ry] = f.er, x = ox + ex, y = oy + ey;
        ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.clip();
        const lid = y - ry + blink * ry * 2;
        ctx.fillStyle = f.skin; ctx.fillRect(x - rx, y - ry - 1, rx * 2, lid - (y - ry) + 1);
        ctx.strokeStyle = '#3a2218'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x - rx, lid - 1); ctx.quadraticCurveTo(x, lid + 2, x + rx, lid - 1); ctx.stroke();
        ctx.restore();
      }
    }
    if (talk > 0.08) {
      const m = f.mouth, x = ox + m[0], y = oy + m[1];
      const wide = 0.78 + 0.42 * noise(t * 6.5 + (f.side ? 9 : 0));        // 母音っぽく口の横幅を変える
      const rx = m[2] * wide * (0.8 + 0.25 * talk), ry = 1.6 + m[2] * 0.7 * talk * (1.25 - 0.4 * wide);
      ctx.fillStyle = '#4a1712'; ctx.strokeStyle = '#2a120d'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y + ry * 0.45, rx, ry, 0, 0, 7); ctx.fill(); ctx.stroke();
      if (talk > 0.3 && !f.side) {
        ctx.save(); ctx.beginPath(); ctx.ellipse(x, y + ry * 0.45, rx - 1, ry - 1, 0, 0, 7); ctx.clip();
        ctx.fillStyle = '#fff'; ctx.fillRect(x - rx, y - ry, rx * 2, ry * 0.75);
        ctx.fillStyle = '#e0706f'; ctx.beginPath(); ctx.ellipse(x, y + ry * 1.4, rx * 0.7, ry * 0.7, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
    }
  }

  function shadow(x, w, a = 0.42) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.ellipse(x, FEET + 3, w, 11, 0, 0, 7); ctx.fill(); }

  // ---------- スーツ姿（切り抜き絵）：足は床につけたまま、上半身だけをしなやかに動かす ----------
  const HEAD_U = { m_front: .75, m_right: .75, m_left: .75, m_shout: .77, j_front: .67, j_left: .67, j_right: .67, j_laugh: .79 };
  // o: {x, name, h, alpha, sway, lift, headX, headY, lean, sx, sy, talk, blink}
  function drawWarp(o, t) {
    const im = SPR[o.name], Hh = im.height, Ww = im.width, sc = o.h / Hh, hs = HEAD_U[o.name];
    const sm = (a, b, u) => { const k = clamp((u - a) / (b - a)); return k * k * (3 - 2 * k); };
    const dxAt = u => (o.sway || 0) * u * u + (o.headX || 0) * sm(hs - 0.07, hs + 0.05, u);
    const dyAt = u => -(o.lift || 0) * sm(0.28, 0.62, u) + (o.headY || 0) * sm(hs - 0.07, hs + 0.05, u);
    ctx.save();
    ctx.translate(o.x, FEET); ctx.rotate(o.lean || 0); ctx.scale(sc * (o.sx || 1), sc * (o.sy || 1));
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    const n = Math.max(3, Math.round(Hh / 150)), ov = ctx.globalAlpha < 1 ? 0 : 0.7;
    for (let y = 0; y < Hh; y += n) {
      const u0 = 1 - y / Hh, u1 = 1 - Math.min(Hh, y + n) / Hh, hh = Math.min(n, Hh - y);
      const d0 = dyAt(u0), d1 = dyAt(u1);
      ctx.drawImage(im, 0, y, Ww, hh, -Ww / 2 + dxAt((u0 + u1) / 2), y - Hh + d0, Ww, hh + d1 - d0 + ov);
    }
    const f = FACE[o.name];
    if (f) { const u = 1 - f.mouth[1] / Hh; drawFace(o.name, -Ww / 2 + dxAt(u), -Hh + dyAt(u), o.talk || 0, o.blink || 0, t); }
    ctx.restore();
  }

  // ---------- ピンクのウェア姿（頭は絵、体は関節つきの線画） ----------
  const SC = 500 / 599;       // 体のスケール（線画の単位は元絵のピクセル）
  function foot(p, dir, sock) {
    ctx.save(); ctx.translate(p[0], p[1]);
    ctx.fillStyle = sock > 0.02 ? SOCK : SKIN; ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.ellipse(dir * 15, 6, 26, 12, 0, 0, 7); ctx.fill(); ctx.stroke();
    if (sock > 0.02) { ctx.strokeStyle = SOCK2; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(dir * 8, -5); ctx.lineTo(dir * 8, 17); ctx.moveTo(dir * 24, -3); ctx.lineTo(dir * 24, 15); ctx.stroke(); }
    ctx.restore();
  }
  function leg(h, kf, w, sock, shade) {       // kf = [膝, 足首]
    const [k, f] = kf, col = shade ? SKIN_D : SKIN;
    tube([h, k, f], w, col);
    tube([h, [lerp(h[0], k[0], 0.42), lerp(h[1], k[1], 0.42)]], w + 3, shade ? PINK2 : PINK);     // ショートパンツの裾
    if (sock > 0.02) {            // しましまソックス（sock=0→1 で引き上げる）
      const top = [lerp(f[0], k[0], 0.62 * sock), lerp(f[1], k[1], 0.62 * sock)];
      ctx.lineCap = 'butt'; path([top, f]); ctx.strokeStyle = INK; ctx.lineWidth = w + 5; ctx.stroke();
      ctx.strokeStyle = SOCK; ctx.lineWidth = w + 1.5; ctx.stroke();
      ctx.strokeStyle = SOCK2; ctx.setLineDash([6, 9]); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'round';
    }
  }
  function hand(p, shade) { ctx.fillStyle = shade ? SKIN_D : SKIN; ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(p[0], p[1], 14, 0, 7); ctx.fill(); ctx.stroke(); }

  // 正面。p: {x, y, lean, bodyDy, headX, headY, headTilt, talk, blink, armL/armR:[a1,a2] or handL/handR:[x,y], legL/legR:[a1,a2], sockL, sockR, alpha, sx}
  function drawPinkFront(p, t) {
    ctx.save();
    ctx.globalAlpha = p.alpha == null ? 1 : p.alpha;
    ctx.translate(p.x, FEET - (p.y || 0)); ctx.rotate(p.lean || 0); ctx.scale(SC * (p.sx || 1), SC * (p.sy || 1));
    ctx.translate(0, -599 + (p.bodyDy || 0));
    const B = 1.28;    // 体の横幅
    const hipL = [-28 * B, 345], hipR = [28 * B, 345];
    const kL = fromAngles(hipL[0], hipL[1], p.legL[0], 122, p.legL[1], 118 - (p.bodyDy || 0) * (p.legL[0] === 0 ? 1 : 0));
    const kR = fromAngles(hipR[0], hipR[1], p.legR[0], 122, p.legR[1], 118 - (p.bodyDy || 0) * (p.legR[0] === 0 ? 1 : 0));
    leg(hipL, kL, 42, p.sockL); foot(kL[1], -0.4, p.sockL);
    leg(hipR, kR, 42, p.sockR); foot(kR[1], 0.4, p.sockR);
    // 胴
    ctx.fillStyle = SKIN; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-60 * B, 174); ctx.quadraticCurveTo(0, 158, 60 * B, 174);
    ctx.quadraticCurveTo(52 * B, 250, 47 * B, 300); ctx.quadraticCurveTo(55 * B, 330, 53 * B, 356);
    ctx.lineTo(-53 * B, 356); ctx.quadraticCurveTo(-55 * B, 330, -47 * B, 300); ctx.quadraticCurveTo(-52 * B, 250, -60 * B, 174);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = SKIN_D; ctx.globalAlpha *= 0.5; ctx.beginPath(); ctx.ellipse(0, 300, 30 * B, 26, 0, 0, Math.PI); ctx.fill(); ctx.globalAlpha = p.alpha == null ? 1 : p.alpha;
    ctx.fillStyle = SKIN; ctx.fillRect(-20, 138, 40, 36);
    ctx.strokeStyle = 'rgba(120,70,40,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 294, 4, 0.3, 2.8); ctx.stroke();
    // ブラトップ
    ctx.fillStyle = PINK; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-57 * B, 196); ctx.quadraticCurveTo(0, 180, 57 * B, 196);
    ctx.lineTo(52 * B, 252); ctx.quadraticCurveTo(0, 264, -52 * B, 252); ctx.closePath(); ctx.fill(); ctx.stroke();
    tube([[-38 * B, 196], [-27, 160]], 6, PINK2); tube([[38 * B, 196], [27, 160]], 6, PINK2);
    ctx.strokeStyle = '#f7a8cf'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-50 * B, 241); ctx.quadraticCurveTo(0, 253, 50 * B, 241); ctx.stroke();
    // ショートパンツ
    ctx.fillStyle = PINK; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-50 * B, 316); ctx.quadraticCurveTo(0, 324, 50 * B, 316);
    ctx.lineTo(56 * B, 372); ctx.lineTo(4, 384); ctx.lineTo(0, 372); ctx.lineTo(-4, 384); ctx.lineTo(-56 * B, 372); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = PINK2; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-49 * B, 325); ctx.quadraticCurveTo(0, 333, 49 * B, 325); ctx.stroke();
    // 頭
    ctx.save(); ctx.translate((p.headX || 0), 150 + (p.headY || 0)); ctx.rotate(p.headTilt || 0); ctx.translate(0, -150);
    ctx.drawImage(SPR.m_front, 0, 0, 243, 153, -121.5, 0, 243, 153);
    drawFace('m_front', -121.5, 0, p.talk, p.blink, t);
    ctx.restore();
    // 腕（頭より手前）
    const sL = [-64 * B, 188], sR = [64 * B, 188];
    const aL = p.handL ? ik(sL[0], sL[1], p.handL[0], p.handL[1], 82, 78, 1) : fromAngles(sL[0], sL[1], p.armL[0], 82, p.armL[1], 78);
    const aR = p.handR ? ik(sR[0], sR[1], p.handR[0], p.handR[1], 82, 78, -1) : fromAngles(sR[0], sR[1], p.armR[0], 82, p.armR[1], 78);
    tube([sL, ...aL], 25, SKIN); hand(aL[1]); tube([sR, ...aR], 25, SKIN); hand(aR[1]);
    ctx.restore();
  }

  // 横向き（+x 方向を向く。flip で反転）。単位は元絵ピクセル、原点は足元の床、yは上が負。
  // p: {x, y, flip, hip:[x,yUp], lean, headTilt, talk, fN, fF（足首の位置）, hN, hF（手の位置）または armN/armF:[a1,a2], sock, alpha}
  function drawPinkSide(p, t, extraFront) {
    ctx.save();
    ctx.globalAlpha = p.alpha == null ? 1 : p.alpha;
    ctx.translate(p.x, FEET - (p.y || 0)); ctx.scale(SC * (p.flip ? -1 : 1) * (p.sx || 1), SC);
    const H = [p.hip[0], -p.hip[1]], c = Math.cos(p.lean), s = Math.sin(p.lean);
    const T = (x, y) => [H[0] + x * c - y * s, H[1] + x * s + y * c];        // 胴体座標→全体
    const sh = T(4, -166), sock = p.sock == null ? 1 : p.sock;
    const arm = (tgt, ang) => tgt ? ik(sh[0], sh[1], tgt[0], tgt[1], 82, 78, 1) : fromAngles(sh[0], sh[1], ang[0], 82, ang[1], 78);
    const lg = f => ik(H[0], H[1], f[0], f[1], 122, 118, -1);
    // 奥の腕・奥の脚
    const aF = arm(p.hF, p.armF); tube([sh, ...aF], 29, SKIN_D); hand(aF[1], true);
    const lF = lg(p.fF); leg(H, lF, 52, sock, true); foot(lF[1], 1, sock);
    // 胴（横から）
    ctx.save(); ctx.translate(H[0], H[1]); ctx.rotate(p.lean);
    ctx.fillStyle = SKIN; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-40, 14); ctx.quadraticCurveTo(-52, -70, -44, -150); ctx.quadraticCurveTo(-34, -188, 6, -188);
    ctx.quadraticCurveTo(52, -168, 56, -120); ctx.quadraticCurveTo(52, -84, 46, -60); ctx.quadraticCurveTo(52, -24, 46, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = SKIN; ctx.fillRect(-16, -202, 38, 28);                                           // 首
    ctx.fillStyle = PINK; ctx.beginPath(); ctx.moveTo(-47, -152); ctx.quadraticCurveTo(0, -164, 54, -150); ctx.lineTo(54, -98); ctx.quadraticCurveTo(0, -88, -49, -98); ctx.closePath(); ctx.fill(); ctx.stroke();
    tube([[-8, -154], [2, -186]], 6, PINK2);
    ctx.strokeStyle = '#f7a8cf'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-46, -108); ctx.quadraticCurveTo(0, -98, 52, -108); ctx.stroke();
    ctx.fillStyle = PINK; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-46, -36); ctx.quadraticCurveTo(0, -46, 48, -36); ctx.lineTo(52, 26); ctx.quadraticCurveTo(0, 40, -46, 26); ctx.closePath(); ctx.fill(); ctx.stroke();
    // 頭（横顔の絵）
    ctx.save(); ctx.translate(6, -186); ctx.rotate(p.headTilt || 0);
    ctx.drawImage(SPR.m_right, 0, 0, 166, 151, -95, -150, 166, 151);
    drawFace('m_right', -95, -150, p.talk, 0, t);
    ctx.restore();
    ctx.restore();
    // 手前の脚
    const lN = lg(p.fN); leg(H, lN, 54, sock); foot(lN[1], 1, sock);
    if (extraFront) extraFront();          // 器具の手前側パーツ（脚と腕の間に挟む）
    const aN = arm(p.hN, p.armN); tube([sh, ...aN], 31, SKIN); hand(aN[1]);
    ctx.restore();
  }

  // ---------- エクササイズ器具（横から見た振り子式ウォーカー） ----------
  const MX = 300, PIV = [0, -300], PEND = 266;
  const plate = th => [PIV[0] + Math.sin(th) * PEND, PIV[1] + Math.cos(th) * PEND];          // 足を乗せる板
  const grip = th => [50 - 112 * Math.sin(th), -378 + 14 * Math.abs(Math.sin(th))];           // ハンドルの握り
  function machinePart(th, near) {
    const pl = plate(th), g = grip(th), col = near ? '#f4f6f9' : '#b9bec6';
    tube([PIV, pl], 9, col);
    tube([[PIV[0] + 6, PIV[1] + 30], [g[0] - 6, g[1] + 34], g], 8, col);
    ctx.fillStyle = near ? '#d0222c' : '#8f1820'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(pl[0] - 46, pl[1] - 2, 92, 13, 4); ctx.fill(); ctx.stroke();
    tube([[g[0] - 4, g[1] + 16], g], 12, '#2b2d33');
  }
  function drawMachine(th, front) {       // front=false: 奥側と骨組み、true: 手前の振り子
    ctx.save(); ctx.translate(MX, FEET); ctx.scale(SC, SC);
    if (!front) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 8, 190, 16, 0, 0, 7); ctx.fill();
      machinePart(-th, false);
      tube([[-150, -4], [150, -4]], 13, '#e9ecf0');
      tube([[-128, -6], PIV, [128, -6]], 11, '#e9ecf0');
      tube([[-70, -140], [70, -140]], 7, '#cfd3d9');
      tube([[-128, -6], [-128, -40]], 11, '#e9ecf0'); tube([[128, -6], [128, -40]], 11, '#e9ecf0');
      ctx.fillStyle = '#3a3d44'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(PIV[0], PIV[1], 15, 0, 7); ctx.fill(); ctx.stroke();
    } else machinePart(th, true);
    ctx.restore();
  }

  // ---------- 演出 ----------
  function impact(x, y, k, big) {
    if (k <= 0 || k >= 1) return;
    ctx.save(); ctx.translate(x, y); const s = (big ? 1.5 : 1) * (0.5 + 0.9 * ease(k * 2.2)); ctx.scale(s, s); ctx.rotate(k * 0.5);
    ctx.globalAlpha = 1 - k * k;
    ctx.fillStyle = '#fff36b'; ctx.strokeStyle = '#d1281c'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, rr = i % 2 ? 30 : 62; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function telop(text, k, y, size, col) {
    if (k <= 0 || k >= 1) return;
    const a = k / 0.14, pop = k < 0.14 ? 2.1 - 1.1 * ease(a) + 0.12 * Math.sin(a * Math.PI) : 1 + 0.015 * Math.sin(k * 40);
    ctx.save(); ctx.translate(640, y); ctx.rotate(-0.045); ctx.scale(pop, pop);
    ctx.globalAlpha = Math.min(1, k / 0.05, (1 - k) / 0.12);
    ctx.font = `900 ${size}px "IPAGothic","Noto Sans JP",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a0010'; ctx.lineWidth = size * 0.3; ctx.strokeText(text, 0, 0);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = size * 0.14; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = col; ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  function notes(t, t0, amt) {
    if (amt <= 0) return;
    ctx.save(); ctx.font = '900 44px sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i < 9; i++) {
      const life = ((t - t0) * 0.32 + rnd(i) * 3) % 1;
      const x = MX + (i % 2 ? 1 : -1) * (120 + rnd(i + 20) * 130) + Math.sin(t * 1.6 + i) * 18, y = 400 - life * 290;
      ctx.globalAlpha = Math.sin(life * Math.PI) * amt;
      ctx.fillStyle = ['#ff5fb0', '#5fd0ff', '#ffe45f', '#8dff8a'][i % 4]; ctx.strokeStyle = '#1a0010'; ctx.lineWidth = 5;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2.2 + i * 2) * 0.25);
      const ch = i % 2 ? '♪' : '♫'; ctx.strokeText(ch, 0, 0); ctx.fillText(ch, 0, 0); ctx.restore();
    }
    ctx.restore();
  }
  function puff(t, t0) {          // 着替えの「ぼわん」
    const k = (t - t0) / 0.75; if (k <= 0 || k >= 1) return;
    ctx.save();
    for (let i = 0; i < 11; i++) {
      const a = i / 11 * Math.PI * 2 + rnd(i) * 0.5, r = (40 + 150 * ease(k * 1.4)) * (0.6 + 0.5 * rnd(i + 5));
      ctx.globalAlpha = (1 - k) * 0.95; ctx.fillStyle = '#fff8f0'; ctx.strokeStyle = 'rgba(90,60,60,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(500 + Math.cos(a) * r, 400 + Math.sin(a) * r * 0.9, 62 * (1 - k * 0.55), 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  function clothes(t, t0) {       // 飛んでいく服（放物線→床でふわっと落ち着く）
    const items = [['#15151a', 0.0, -1, 76, 60], ['#f3f3f3', 0.12, 1, 64, 52], ['#1c2c6b', 0.2, 1, 18, 70], ['#15151a', 0.28, -1, 70, 56]];
    items.forEach(([col, d, dir, w, h], i) => {
      const k = (t - t0 - d) / 1.15; if (k <= 0) return;
      const kk = Math.min(k, 1), land = ease((k - 1) / 0.25);
      const x = 500 + dir * (30 + (150 + i * 26) * (1 - (1 - kk) * (1 - kk)));
      const y = Math.min(FEET - 6, 400 - 330 * kk * (1 - kk) * 2.2 + 254 * kk * kk);
      ctx.save(); ctx.translate(x, y); ctx.rotate((1 - land) * (kk * 4.2 * dir) + land * 0.12 * dir); ctx.scale(1, 1 - 0.72 * land);
      ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 12); ctx.fill(); ctx.stroke(); ctx.restore();
    });
  }

  // ---------- 字幕 ----------
  const WHO = { m: ['松田', '#3aa0ff'], j: ['じろう', '#ffc928'] };
  function subtitle(line, t) {
    if (!line || !line.text) return;
    ctx.save();
    const F = '900 38px "IPAGothic","Noto Sans JP",sans-serif';
    ctx.font = F; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
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
    ctx.globalAlpha = clamp((t - line.s) / 0.1 + 0.3);
    const w = Math.max(...rows.map(r => ctx.measureText(r).width)), x0 = 640 - w / 2 + 50;
    ctx.font = '900 24px "IPAGothic","Noto Sans JP",sans-serif';
    const nw = ctx.measureText(name).width + 22;
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x0 - nw - 14, y0 - 18, nw, 36, 6); ctx.fill();
    ctx.fillStyle = '#10101a'; ctx.textAlign = 'center'; ctx.fillText(name, x0 - nw / 2 - 14, y0 + 1);
    ctx.font = F; ctx.textAlign = 'left';
    rows.forEach((r, i) => { ctx.strokeStyle = '#000'; ctx.lineWidth = 8; ctx.strokeText(r, x0, y0 + i * 46); ctx.fillStyle = '#fff'; ctx.fillText(r, x0, y0 + i * 46); });
    ctx.restore();
  }

  // ---------- カメラ ----------
  const SHOTS = {
    wide: [640, 360, 1], mid: [645, 385, 1.42], m: [520, 330, 1.85], j: [775, 345, 1.85], two: [645, 350, 1.62],
    gym: [430, 395, 1.34], gymcu: [335, 280, 1.9], feet: [305, 575, 2.3],
  };
  function camAt(t) {
    let cur = TL.shots[0];
    for (const s of TL.shots) { if (s.t <= t) cur = s; else break; }
    const [cx, cy, z] = SHOTS[cur.shot], dt = t - cur.t;
    const drift = 1 + Math.min(dt, 14) * 0.0035;                       // カット中はゆっくり寄る
    return [cx + Math.sin(t * 0.37) * 2.2, cy + Math.sin(t * 0.29 + 1) * 1.6, z * drift];   // わずかな手持ちの揺れ
  }

  // ---------- 状態（誰がどの絵か）を台本から前もって組み立てる ----------
  const F1 = TL.fitness[0], F2 = TL.fitness[1];
  const segM = [{ t: 0, n: 'm_front' }], segJ = [{ t: 0, n: 'j_front' }];
  {
    const push = (arr, t, n) => { if (arr[arr.length - 1].n !== n) arr.push({ t, n }); };
    TL.lines.forEach((l, i) => {
      const long = l.e - l.s >= 0.9, next = TL.lines[i + 1], gap = next ? next.s - l.e : 9;
      if (l.who === 'm') {
        push(segM, l.s, l.pose === 'shout' ? 'm_shout' : 'm_front');
        if (l.pose === 'shout' && gap > 0.4) push(segM, l.e + 0.2, 'm_front');
        if (long || l.other) push(segJ, l.s + 0.12, l.other === 'front' ? 'j_front' : l.other === 'laugh' ? 'j_laugh' : 'j_left');
      } else {
        push(segJ, l.s, l.pose === 'laugh' ? 'j_laugh' : 'j_front');
        if (l.pose === 'laugh' && gap > 0.4) push(segJ, l.e + 0.2, 'j_front');
        if (long || l.other) push(segM, l.s + 0.12, l.other === 'front' ? 'm_front' : 'm_right');
      }
    });
  }
  const segAt = (arr, t) => { let c = arr[0]; for (const s of arr) { if (s.t <= t) c = s; else break; } return c.n; };
  function nameJ(t) {
    for (const s of TL.slaps) if (t >= s.t - 0.5 && t < s.t + 0.75) return 'j_left';
    for (const f of TL.fitness) if (t >= (f.puff || f.go) - 0.3 && t < f.back - 0.2) {
      const d = t - f.on;                      // 器具の方を見守り、ときどき正面（カメラ目線）
      return d > 5 && (d % 9.5) > 6.6 ? 'j_front' : 'j_left';
    }
    return segAt(segJ, t);
  }
  function nameM(t) { return t >= F1.call && t < F1.puff - 1.0 ? 'm_shout' : t >= F1.puff - 1.0 ? 'm_front' : segAt(segM, t); }
  // 絵が切り替わった直後は 0.2 秒かけて前の絵から溶かす
  function blendOf(fn, t) {
    const cur = fn(t), dt = 1 / 30;
    for (let i = 1; i <= 6; i++) if (fn(t - i * dt) !== cur) return { cur, prev: fn(t - i * dt), k: ease((i - 0.5) / 6) };
    return { cur, prev: null, k: 1 };
  }
  const settle = k => Math.sin(k * Math.PI) * 0.03;           // 切り替え時の小さな「ため」

  // ---------- 1フレーム描画 ----------
  function renderFrame(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const line = lineAt(t);
    const gate = line ? Math.min(1, (t - line.s) / 0.07, (line.e - t) / 0.09) : 0;
    const eF = clamp(env(t) * 1.45) * gate, eS = clamp(envS(t) * 1.6) * gate;
    const talkM = line && line.who === 'm' ? eF : 0, talkJ = line && line.who === 'j' ? eF : 0;
    const powM = line && line.who === 'm' ? eS : 0, powJ = line && line.who === 'j' ? eS : 0;
    const fit = TL.fitness.find(f => t >= f.call && t < f.back + 0.4);
    const glideAmt = f => f ? ease((t - f.glide) / 1.3) * ease((f.stop - t) / 0.7) : 0;
    const party = fit ? glideAmt(fit) : 0;

    const [cx, cy, z] = camAt(t);
    ctx.setTransform(z, 0, 0, z, W / 2 - cx * z, H / 2 - cy * z);
    ctx.drawImage(BG, 0, 0, W, H);
    paintLights(t, party > 0.5);

    // ツッコミ（じろうの腕が振り下ろされ、松田の頭が揺れて戻る）
    const slap = TL.slaps.find(s => t >= s.t - 0.42 && t < s.t + 1.0);
    const sd = slap ? t - slap.t : -9;
    const hitK = sd >= 0 ? Math.exp(-sd * 5.5) : 0, hitOsc = sd >= 0 ? Math.cos(sd * 17) * hitK : 0;

    // ---- エクササイズの進行 ----
    let th = 0;           // 振り子の角度（手前の脚）
    const onMachine = fit && t >= fit.on && t < fit.off;
    if (fit && t >= fit.on && t < fit.off + 0.1) {
      const wobble = pulse(t, fit.on + 0.9, fit.glide - 0.5, 0.6, 0.6) * 0.07 * Math.sin((t - fit.on) * 2.6);    // 乗った直後の試し漕ぎ
      th = wobble + glideAmt(fit) * 0.43 * Math.cos(Math.PI * (t - fit.anchor) / fit.half);
    }
    if (t >= F1.call - 0.3) drawMachine(th, false);
    drawMic();

    // ---- じろう ----
    const bj = blendOf(nameJ, t);
    const reach = slap ? (sd < -0.12 ? -0.35 * ease((sd + 0.42) / 0.3) : sd < 0 ? -0.35 + 1.35 * ((sd + 0.12) / 0.12) ** 2 : 1 - ease((sd - 0.14) / 0.38)) : 0;   // 体の傾き：-で振りかぶり、1で命中
    const stepIn = slap ? 92 * ease((sd + 0.42) / 0.34) * (1 - ease((sd - 0.3) / 0.5)) : 0;      // 叩く前に一歩踏み込む
    const drawJ = (name, alpha, k) => {
      const laugh = name === 'j_laugh', lb = laugh ? bounce(t, 3.1) : 0;
      drawWarp({
        x: 795 - stepIn, name, h: laugh ? 505 : 478, alpha,
        sway: (noise(t * 0.35 + 7) - 0.5) * 7 - Math.max(0, reach) * 26 + Math.min(0, reach) * -30,
        lift: 1.6 * Math.sin(t * 1.5 + 1) + powJ * 6 + lb * 7 + settle(k) * 120,
        headY: talkJ * 2.4 + lb * 3 + pulse(t % 5.3, 1.0, 1.25, 0.12, 0.2) * (talkJ ? 0 : 3),
        headX: (noise(t * 0.6 + 3) - 0.5) * 4, sy: 1 - settle(k), sx: 1 + settle(k) * 0.6,
        talk: talkJ, blink: blinkAt(t, 0.37),
      }, t);
    };
    // ---- 松田 ----
    const pink = t >= F1.puff;
    const drawMsuit = (name, alpha, k) => {
      const shout = name === 'm_shout', sb = shout ? bounce(t, 2.9) * (0.35 + powM) : 0;
      const crouch = pulse(t, F1.puff - 0.9, F1.puff + 0.2, 0.55, 0.12);           // 着替え前の「ため」
      const hype = t >= F1.call && t < F1.puff - 1 ? bounce(t, 3.0) : 0;
      drawWarp({
        x: 500, name, h: shout ? 520 : 500, alpha,
        sway: (noise(t * 0.4) - 0.5) * 6 + (shout ? Math.sin(t * 5.8) * 4 * powM : 0) - hitOsc * 9,
        lift: 1.5 * Math.sin(t * 1.7) + powM * 6 + sb * 8 + hype * 9 + settle(k) * 120 - crouch * 26,
        headY: talkM * 2.2 + hitK * 9 + (line && line.pose === 'doya' ? -3 : 0),
        headX: (noise(t * 0.7 + 11) - 0.5) * 4 - hitOsc * 14,
        sy: 1 - settle(k) - crouch * 0.07, sx: 1 + settle(k) * 0.6 + crouch * 0.05,
        talk: shout ? 0 : talkM, blink: blinkAt(t, 0.11),
      }, t);
    };

    // ピンク姿の松田：場面ごとのポーズをなめらかにつなぐ
    const sideAt = (f) => {            // 横向きポーズ（走る／器具の上）。戻り値に kind を入れる
      const run = (k, from, to) => {
        const ph = t * 15.5, x = lerp(from, to, ease(k)), amp = Math.sin(clamp(k) * Math.PI) ** 0.5;
        const ft = o => [72 * amp * Math.sin(ph + o), -14 - 62 * amp * Math.max(0, Math.cos(ph + o))];
        return { x, flip: to < from, hip: [0, 246 + 7 * Math.cos(ph * 2) * amp], lean: 0.2 * amp, headTilt: -0.08 * amp,
          fN: ft(0), fF: ft(Math.PI), armN: [-0.85 * amp * Math.sin(ph), -0.85 * amp * Math.sin(ph) + 1.35 * amp + 0.1], armF: [0.85 * amp * Math.sin(ph), 0.85 * amp * Math.sin(ph) + 1.35 * amp + 0.1] };
      };
      if (t < f.on) return run((t - f.go) / (f.on - f.go), 500, MX);
      if (t >= f.off) return run((t - f.off) / (f.back - f.off), MX, 500);
      // 器具の上：足は板、手はハンドルに固定して体を合わせる
      const g = glideAmt(f), ph = Math.PI * (t - f.anchor) / f.half;
      const fiddle = pulse(t, f.on + 0.5, f.glide - 0.9, 0.7, 0.8) * (0.72 + 0.28 * Math.sin((t - f.on) * 1.9));   // かがんで足元を確かめる
      const pN = plate(th), pF = plate(-th), spread = (th / 0.43) ** 2;
      const turn = ease((t - f.on) / 0.3);                 // 乗りながら向きを変える
      const p = { x: MX, flip: false, sx: Math.max(0.3, Math.abs(turn * 2 - 1)),
        hip: [-6 + 5 * Math.sin(ph) * g, 284 - 15 * spread - 4 * g * Math.cos(ph * 2) - fiddle * 16],
        lean: 0.07 + 0.03 * g * Math.sin(ph + 0.4) + fiddle * 0.5, headTilt: 0.05 * g * Math.sin(ph - 0.9) - fiddle * 0.12 + talkM * 0.03,
        fN: [pN[0], pN[1] - 14], fF: [pF[0], pF[1] - 14], hN: grip(th), hF: grip(-th) };
      if (turn < 0.5) p.flip = true;
      if (fiddle > 0.01) { const k = fiddle; p.hN = [lerp(p.hN[0], 62, k), lerp(p.hN[1], -150 + 16 * Math.sin(t * 5), k)]; }
      return p;
    };
    const frontAt = () => {
      const g = powM, n1 = noise(t * 1.1 + 2), n2 = noise(t * 1.1 + 40), br = Math.sin(t * 1.7);
      const p = { x: 500, y: 0, lean: (noise(t * 0.4) - 0.5) * 0.03, bodyDy: br * 1.5 - g * 3, headX: (noise(t * 0.7 + 11) - 0.5) * 5 - hitOsc * 16, headY: talkM * 2.5 + hitK * 10,
        headTilt: (noise(t * 0.5 + 5) - 0.5) * 0.05 - hitOsc * 0.2, talk: talkM, blink: blinkAt(t, 0.11),
        armL: [-0.14 - g * (0.25 + 0.4 * n1), -0.1 - g * (0.7 + 1.1 * n1)], armR: [0.14 + g * (0.25 + 0.4 * n2), 0.1 + g * (0.7 + 1.1 * n2)],
        legL: [0, 0], legR: [0, 0], sockL: 1, sockR: 1 };
      const mix = (k, q) => { if (k <= 0) return; for (const key of ['armL', 'armR']) p[key] = [lerp(p[key][0], q[key][0], k), lerp(p[key][1], q[key][1], k)]; if (q.headTilt != null) p.headTilt = lerp(p.headTilt, q.headTilt, k); if (q.bodyDy != null) p.bodyDy = lerp(p.bodyDy, q.bodyDy, k); };
      // 叫ぶ（両こぶしを突き上げる）／どや顔（腰に手）
      let shout = 0, doya = pulse(t, F1.puff + 0.35, F1.puff + 1.9, 0.3, 0.4);
      for (const l of TL.lines) if (l.who === 'm' && t > l.s - 0.3 && t < l.e + 0.5) { if (l.pose === 'shout') shout = Math.max(shout, pulse(t, l.s - 0.05, l.e + 0.2, 0.2, 0.3)); if (l.pose === 'doya') doya = Math.max(doya, pulse(t, l.s, l.e, 0.3, 0.3)); }
      const sb = bounce(t, 2.9);
      mix(shout, { armL: [-0.55, -2.5 + 0.25 * sb], armR: [0.55, 2.5 - 0.25 * sb], bodyDy: -6 * sb });
      mix(doya, { armL: [-0.8, 0.75], armR: [0.8, -0.75], headTilt: -0.1, bodyDy: -3 });
      // 靴下を片足ずつ履く
      const sock = (a, b, L) => {
        const k = pulse(t, a, b, 0.45, 0.4); if (t < a) p[L ? 'sockL' : 'sockR'] = 0; else p[L ? 'sockL' : 'sockR'] = ease((t - a - 0.5) / (b - a - 1.0));
        if (k <= 0) return;
        const s = L ? -1 : 1, hop = bounce(t, 2.2) * k;
        p[L ? 'legL' : 'legR'] = [s * 1.15 * k, -s * 0.5 * k]; p.lean += s * 0.13 * k; p.y = hop * 7; p.headTilt += s * 0.15 * k; p.headY += 6 * k;
        const hip = [s * 28 * 1.28, 345], kn = fromAngles(hip[0], hip[1], s * 1.15 * k, 122, -s * 0.5 * k, 118)[1];
        const pull = 0.5 + 0.5 * Math.sin((t - a) * 6);
        p.handL = [lerp(-110, kn[0] - 16, k), lerp(330, kn[1] - 30 - 40 * pull, k)]; p.handR = [lerp(110, kn[0] + 16, k), lerp(330, kn[1] - 30 - 40 * pull, k)];
      };
      if (t < F1.go + 0.3) { sock(F1.puff + 2.1, F1.puff + 4.1, true); sock(F1.puff + 4.2, F1.puff + 6.3, false); }
      // 着替え直後は軽く跳ねて着地
      const land = (t - F1.puff) / 0.45; if (land > 0 && land < 1) { p.y = 46 * Math.sin(land * Math.PI); p.sy = 1 + 0.05 * Math.sin(land * Math.PI); }
      const sq = pulse(t, F1.puff + 0.42, F1.puff + 0.75, 0.08, 0.2); p.bodyDy += sq * 12;
      return p;
    };

    const drawM = () => {
      if (!pink) {
        const bm = blendOf(nameM, t);
        if (bm.prev) drawMsuit(bm.prev, 1, bm.k);
        drawMsuit(bm.cur, bm.prev ? bm.k : 1, bm.k);
        const pf = (t - F1.puff + 0.12) / 0.12; if (pf > 0) { ctx.fillStyle = `rgba(255,255,255,${clamp(pf) * 0.6})`; }
        return;
      }
      const f = TL.fitness.find(f => t >= f.go - 0.2 && t < f.back + 0.2);
      const kSide = f ? ease((t - (f.go - 0.2)) / 0.2) * ease((f.back + 0.2 - t) / 0.2) : 0;      // 正面⇄横向きのつなぎ
      if (kSide < 1) { const p = frontAt(); p.alpha = 1; shadow(500, 74); drawPinkFront(p, t); }
      if (kSide > 0) {
        const p = sideAt(f); p.alpha = kSide; p.talk = talkM; p.sock = 1;
        const on = t >= f.on && t < f.off;
        p.y = on ? 0 : 0; if (!on) shadow(p.x, 66);
        drawPinkSide(p, t, on ? () => { ctx.restore(); drawMachine(th, true); ctx.save(); ctx.translate(p.x, FEET); ctx.scale(SC * (p.flip ? -1 : 1) * (p.sx || 1), SC); } : null);
      }
    };

    shadow(500, pink ? 0 : 92); shadow(795, 104);
    drawM();
    if (bj.prev) drawJ(bj.prev, 1, bj.k);
    drawJ(bj.cur, bj.prev ? bj.k : 1, bj.k);

    // じろうのツッコミの腕
    if (slap && sd < 0.56) {
      const jx = 795 - stepIn, S = [jx - 42 - Math.max(0, reach) * 24, FEET - 300];
      const rest = [jx - 70, FEET - 170], back = [jx - 20, FEET - 470], hit = [556, FEET - 452];
      const arc = q => [lerp(back[0], hit[0], q), lerp(back[1], hit[1], q) - Math.sin(q * Math.PI) * 26];
      const mixP = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
      const tgt = sd < -0.12 ? mixP(rest, back, ease((sd + 0.42) / 0.3))          // 振りかぶる
        : sd < 0 ? arc(((sd + 0.12) / 0.12) ** 2)                                 // 振り下ろす（加速）
        : sd < 0.14 ? [hit[0], hit[1] + 7 * Math.sin(sd / 0.14 * Math.PI)]        // 当たって止まる
        : mixP(hit, rest, ease((sd - 0.14) / 0.38));                              // 戻す
      const drawArm = (tg, a) => {
        const j = ik(S[0], S[1], tg[0], tg[1], 96, 98, -1);
        ctx.globalAlpha = a; tube([S, ...j], 31, '#17171c', '#050506');
        const d = Math.atan2(j[1][1] - j[0][1], j[1][0] - j[0][0]);
        ctx.save(); ctx.translate(j[1][0], j[1][1]); ctx.rotate(d);
        ctx.fillStyle = '#f4f4f4'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fillRect(-5, -15, 9, 30); ctx.strokeRect(-5, -15, 9, 30);
        ctx.fillStyle = '#fccdad'; ctx.beginPath(); ctx.ellipse(19, 0, 21, 12, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
      };
      if (sd > -0.1 && sd < 0.04) for (let i = 3; i >= 1; i--) {       // 振り下ろしの残像
        const q = clamp((sd - i * 0.02 + 0.12) / 0.12); drawArm(arc(q * q), 0.16);
      }
      drawArm(tgt, clamp((sd + 0.42) / 0.08) * clamp((0.54 - sd) / 0.08));
    }
    if (slap) impact(530, FEET - 478, sd / 0.42, slap.big);

    if (t >= F1.puff - 0.05) { clothes(t, F1.puff); puff(t, F1.puff - 0.08); }
    if (fit) notes(t, fit.glide, party);

    // ---- 画面固定の要素 ----
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    if (party > 0) { ctx.fillStyle = `hsla(${(t * 70) % 360},90%,60%,${0.09 * party})`; ctx.fillRect(0, 0, W, H); }
    for (const tp of TL.telops) telop(tp.text, prog(t, tp.s, tp.e), tp.y || 250, tp.size || 110, tp.col || '#ff3d9a');
    const nk = prog(t, 0.3, 6.2);
    if (nk > 0 && nk < 1) {         // コンビ名テロップ（左からすべり込む）
      ctx.save(); ctx.globalAlpha = Math.min(1, nk * 14, (1 - nk) * 10); ctx.translate(-60 * (1 - ease(nk * 9)), 0);
      ctx.fillStyle = 'rgba(120,8,14,0.92)'; ctx.beginPath(); ctx.roundRect(40, 62, 470, 84, 8); ctx.fill();
      ctx.strokeStyle = '#f6d776'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#f6d776'; ctx.font = '900 20px "IPAGothic",sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(TL.title.sub, 62, 84);
      ctx.fillStyle = '#fff'; ctx.font = '900 40px "IPAGothic",sans-serif'; ctx.fillText(TL.title.main, 60, 120);
      ctx.restore();
    }
    subtitle(line, t);
    const fade = Math.max(1 - prog(t, 0, 0.6), prog(t, TL.blackout, TL.blackout + 0.35));
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  }

  window.ANIM = { W, H, FPS, duration: TL.duration, ready: loadAll().then(() => { paintStatic(); renderFrame(0); }), renderFrame };
})();
