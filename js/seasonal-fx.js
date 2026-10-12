// js/seasonal-fx.js - moved out of index.html (N-303, SEC-12b step 3). Code unchanged.
(function() {
  const canvas = document.getElementById('fx-canvas');
  const ctx    = canvas.getContext('2d');
  let animFrame   = null;
  let activeEffect = null;
  let _footballCleanup = null;
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  function stopAll() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    if (_footballCleanup) { _footballCleanup(); _footballCleanup = null; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = 'none';
    activeEffect = null;
  }
  // ── Snow ──────────────────────────────────────────────────────────
  function startSnow() {
    stopAll(); activeEffect = 'snow';
    canvas.style.display = 'block'; resize();
    const flakes = [];
    const count = Math.floor((canvas.width * canvas.height) / 18000);
    for (let i = 0; i < count; i++) {
      flakes.push({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        r: Math.random() * 2 + 1, speed: Math.random() * 0.6 + 0.3,
        drift: (Math.random() - 0.5) * 0.3, alpha: Math.random() * 0.5 + 0.3,
      });
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      flakes.forEach(f => {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${f.alpha})`; ctx.fill();
        f.y += f.speed; f.x += f.drift;
        if (f.y > canvas.height) { f.y = -f.r; f.x = Math.random() * canvas.width; }
        if (f.x > canvas.width) f.x = 0;
        if (f.x < 0) f.x = canvas.width;
      });
      animFrame = requestAnimationFrame(draw);
    }
    draw();
  }
  // ── Christmas Lights ──────────────────────────────────────────────
  function startLights() {
    stopAll(); activeEffect = 'lights';
    canvas.style.display = 'block'; resize();
    const COLOURS = ['#ff3b3b','#ffcc00','#33cc55','#3399ff','#ff66cc','#ff9900'];
    const count = Math.floor(canvas.width / 60);
    const bulbs = [];
    const sagDepth = 28;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      bulbs.push({
        x: t * canvas.width, y: 18 + Math.sin(Math.PI * t) * sagDepth,
        colour: COLOURS[i % COLOURS.length],
        phase: Math.random() * Math.PI * 2,
        speed: 0.015 + Math.random() * 0.01,
      });
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath(); ctx.moveTo(0, 18);
      for (let i = 1; i <= count; i++) {
        const t = i / count;
        ctx.lineTo(t * canvas.width, 18 + Math.sin(Math.PI * (i - 0.5) / count) * sagDepth);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
      bulbs.forEach(b => {
        b.phase += b.speed;
        const glow = 0.55 + Math.sin(b.phase) * 0.45;
        const r = 6;
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 3);
        grad.addColorStop(0, b.colour + 'ff');
        grad.addColorStop(0.4, b.colour + Math.round(glow * 180).toString(16).padStart(2,'0'));
        grad.addColorStop(1, b.colour + '00');
        ctx.beginPath(); ctx.arc(b.x, b.y, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fillStyle = b.colour; ctx.globalAlpha = glow; ctx.fill(); ctx.globalAlpha = 1;
      });
      animFrame = requestAnimationFrame(draw);
    }
    draw();
  }
  // ── Summer ────────────────────────────────────────────────────────
  function startSummer() {
    stopAll(); activeEffect = 'summer';
    canvas.style.display = 'block'; resize();
    let tick = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width, h = canvas.height;
      const sx = w - 80, sy = 80;
      const sunGrad = ctx.createRadialGradient(sx, sy, 10, sx, sy, 140);
      sunGrad.addColorStop(0,   'rgba(255,240,100,0.95)');
      sunGrad.addColorStop(0.2, 'rgba(255,200,50,0.5)');
      sunGrad.addColorStop(0.6, 'rgba(255,160,20,0.15)');
      sunGrad.addColorStop(1,   'rgba(255,140,0,0)');
      ctx.beginPath(); ctx.arc(sx, sy, 140, 0, Math.PI * 2);
      ctx.fillStyle = sunGrad; ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy, 28, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,240,100,0.95)'; ctx.fill();
      const beachTop = h - 90;
      const beachGrad = ctx.createLinearGradient(0, beachTop, 0, h);
      beachGrad.addColorStop(0, 'rgba(210,180,120,0.82)');
      beachGrad.addColorStop(1, 'rgba(190,155,90,0.92)');
      ctx.fillStyle = beachGrad; ctx.fillRect(0, beachTop, w, 90);
      [0, 1].forEach(layer => {
        const offset = Math.sin(tick * 0.018 + layer * Math.PI) * 6;
        const waveY  = beachTop - 14 + layer * 8 + offset;
        ctx.beginPath(); ctx.moveTo(0, waveY);
        for (let x = 0; x <= w; x += 4) {
          ctx.lineTo(x, waveY + Math.sin((x / w) * Math.PI * 6 + tick * 0.04 + layer * 1.2) * 4);
        }
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
        ctx.fillStyle = layer === 0 ? 'rgba(80,180,210,0.22)' : 'rgba(100,200,230,0.14)';
        ctx.fill();
      });
      tick++;
      animFrame = requestAnimationFrame(draw);
    }
    draw();
  }
  // ── Spring ────────────────────────────────────────────────────────
  function startSpring() {
    stopAll(); activeEffect = 'spring';
    canvas.style.display = 'block'; resize();
    let tick = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width, h = canvas.height;
      const grassTop = h - 70;
      const grassGrad = ctx.createLinearGradient(0, grassTop, 0, h);
      grassGrad.addColorStop(0, 'rgba(80,160,60,0.85)');
      grassGrad.addColorStop(1, 'rgba(50,120,30,0.95)');
      ctx.fillStyle = grassGrad; ctx.fillRect(0, grassTop, w, 70);
      const bladeCount = Math.floor(w / 8);
      for (let i = 0; i < bladeCount; i++) {
        const x    = (i / bladeCount) * w;
        const sway = Math.sin(tick * 0.025 + i * 0.4) * 3;
        const bh   = 14 + Math.sin(i * 1.7) * 6;
        ctx.beginPath();
        ctx.moveTo(x, grassTop);
        ctx.quadraticCurveTo(x + sway, grassTop - bh * 0.5, x + sway * 1.5, grassTop - bh);
        ctx.strokeStyle = 'rgba(60,140,40,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
      }
      const flowerPositions = [0.08,0.17,0.26,0.35,0.44,0.53,0.62,0.71,0.80,0.89];
      const petalColours    = ['#ff9eb5','#ffda79','#c9a0ff','#ff9eb5','#79e0ff','#ffda79','#c9a0ff','#ff9eb5','#79e0ff','#ffda79'];
      flowerPositions.forEach((t, fi) => {
        const x    = t * w;
        const y    = grassTop - 4;
        const sway = Math.sin(tick * 0.025 + fi * 0.9) * 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sway, y - 18);
        ctx.strokeStyle = 'rgba(60,140,40,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
        for (let p = 0; p < 5; p++) {
          const angle = (p / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(x + sway + Math.cos(angle) * 5, y - 18 + Math.sin(angle) * 5, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = petalColours[fi % petalColours.length];
          ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.beginPath(); ctx.arc(x + sway, y - 18, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,220,50,0.95)'; ctx.fill();
      });
      tick++;
      animFrame = requestAnimationFrame(draw);
    }
    draw();
  }
  // ── Autumn ────────────────────────────────────────────────────────
  function startAutumn() {
    stopAll(); activeEffect = 'autumn';
    canvas.style.display = 'block'; resize();
    const LEAF_COLOURS = ['#cc4400','#dd6600','#ee8800','#bb3300','#ffaa00','#993300'];
    const leaves = [];
    const count  = Math.floor((canvas.width * canvas.height) / 14000);
    for (let i = 0; i < count; i++) {
      leaves.push({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        size: Math.random() * 7 + 5, speed: Math.random() * 0.8 + 0.3,
        drift: (Math.random() - 0.5) * 0.6, spin: (Math.random() - 0.5) * 0.04,
        angle: Math.random() * Math.PI * 2,
        colour: LEAF_COLOURS[Math.floor(Math.random() * LEAF_COLOURS.length)],
        alpha: Math.random() * 0.5 + 0.4, wobble: Math.random() * Math.PI * 2,
      });
    }
    function drawLeaf(x, y, size, angle, colour, alpha) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.bezierCurveTo(size * 0.8, -size * 0.5, size * 0.8, size * 0.5, 0, size * 0.3);
      ctx.bezierCurveTo(-size * 0.8, size * 0.5, -size * 0.8, -size * 0.5, 0, -size);
      ctx.fillStyle = colour; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(0, size * 0.3);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.globalAlpha = 1; ctx.restore();
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      leaves.forEach(l => {
        l.wobble += 0.02; l.y += l.speed;
        l.x += l.drift + Math.sin(l.wobble) * 0.4; l.angle += l.spin;
        if (l.y > canvas.height + l.size) { l.y = -l.size; l.x = Math.random() * canvas.width; }
        if (l.x > canvas.width + l.size) l.x = -l.size;
        if (l.x < -l.size) l.x = canvas.width + l.size;
        drawLeaf(l.x, l.y, l.size, l.angle, l.colour, l.alpha);
      });
      animFrame = requestAnimationFrame(draw);
    }
    draw();
  }
  // ── World Cup Football ────────────────────────────────────────────
  function startFootball() {
    stopAll(); activeEffect = 'football';
    canvas.style.display = 'block'; resize();
    const ball = {
      x: canvas.width * 0.35, y: canvas.height * 0.45,
      vx: 2.4, vy: 1.7, r: 18, angle: 0,
    };
    const mouse = { x: -999, y: -999, px: -999, py: -999 };
    function onMove(e) { mouse.x = e.clientX; mouse.y = e.clientY; }
    window.addEventListener('mousemove', onMove);
    _footballCleanup = () => window.removeEventListener('mousemove', onMove);
    // ── Players: 5 per team (1 keeper + 4 outfield) ──
    const players = [];
    function makeTeam(side, colour) {
      // side = -1 (left, attacking right) or +1 (right)
      const w = canvas.width, h = canvas.height;
      const keeperX = side < 0 ? 70 : w - 70;
      players.push({ x: keeperX, y: h / 2, r: 15, colour, keeper: true, side,
                     tx: keeperX, ty: h / 2, spd: 0.4 });
      // Outfield roam within their own half-ish
      const zoneMin = side < 0 ? 0.12 : 0.52;
      const zoneMax = side < 0 ? 0.48 : 0.88;
      for (let i = 0; i < 4; i++) {
        const x = w * (zoneMin + Math.random() * (zoneMax - zoneMin));
        const y = h * (0.2 + Math.random() * 0.6);
        players.push({ x, y, r: 15, colour, keeper: false, side,
                       tx: x, ty: y, spd: 0.5 + Math.random() * 0.3,
                       zoneMin, zoneMax });
      }
    }
    makeTeam(-1, '#d33');   // red team, left
    makeTeam(+1, '#36c');   // blue team, right
    function movePlayers(w, h) {
      players.forEach(p => {
        if (Math.hypot(p.tx - p.x, p.ty - p.y) < 6) {
          // pick a new wander target
          if (p.keeper) {
            p.tx = p.side < 0 ? 70 : w - 70;
            p.ty = h / 2 + (Math.random() - 0.5) * h * 0.25;
          } else {
            p.tx = w * (p.zoneMin + Math.random() * (p.zoneMax - p.zoneMin));
            p.ty = h * (0.15 + Math.random() * 0.7);
          }
        }
        const a = Math.atan2(p.ty - p.y, p.tx - p.x);
        p.x += Math.cos(a) * p.spd; p.y += Math.sin(a) * p.spd;
      });
    }
    function drawPlayers() {
      players.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y + 4, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.keeper ? '#eee' : p.colour; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
      });
    }
    function collideBall() {
      players.forEach(p => {
        const dx = ball.x - p.x, dy = ball.y - p.y;
        const d = Math.hypot(dx, dy), min = ball.r + p.r;
        if (d < min && d > 0.1) {
          const nx = dx / d, ny = dy / d;
          // push ball clear of the player
          ball.x = p.x + nx * min; ball.y = p.y + ny * min;
          // reflect velocity about the collision normal
          const dot = ball.vx * nx + ball.vy * ny;
          ball.vx -= 2 * dot * nx; ball.vy -= 2 * dot * ny;
          ball.vx *= 1.05; ball.vy *= 1.05; // small kick off the player
        }
      });
    }
    function drawPitch(w, h) {
      const stripes = 10, bandH = h / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(40,135,55,0.9)' : 'rgba(50,150,65,0.9)';
        ctx.fillRect(0, i * bandH, w, bandH + 1);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2.5;
      const m = 40;
      ctx.strokeRect(m, m, w - m * 2, h - m * 2);
      ctx.beginPath(); ctx.moveTo(w / 2, m); ctx.lineTo(w / 2, h - m); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.13, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
      const boxH = h * 0.42, boxW = w * 0.10, sixH = h * 0.20, sixW = w * 0.04;
      ctx.strokeRect(m, (h - boxH) / 2, boxW, boxH);
      ctx.strokeRect(m, (h - sixH) / 2, sixW, sixH);
      ctx.strokeRect(w - m - boxW, (h - boxH) / 2, boxW, boxH);
      ctx.strokeRect(w - m - sixW, (h - sixH) / 2, sixW, sixH);
      ctx.beginPath(); ctx.arc(m + boxW, h / 2, boxW * 0.55, -Math.PI * 0.4, Math.PI * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(w - m - boxW, h / 2, boxW * 0.55, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
    }
    function drawBall(x, y, r, angle) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.beginPath(); ctx.arc(3, 5, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
      ctx.beginPath();
      for (let p = 0; p < 5; p++) {
        const a = -Math.PI / 2 + p * (Math.PI * 2 / 5);
        const px = Math.cos(a) * r * 0.42, py = Math.sin(a) * r * 0.42;
        p === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = '#1a1a1a'; ctx.fill();
      for (let p = 0; p < 5; p++) {
        const a = -Math.PI / 2 + p * (Math.PI * 2 / 5);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
        ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
        ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(26,26,26,0.85)'; ctx.stroke();
      }
      ctx.restore();
    }
    function draw() {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      drawPitch(w, h);
      drawPlayers();
      // Cursor kick
      const dx = ball.x - mouse.x, dy = ball.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      const kickRadius = ball.r + 45;
      if (dist < kickRadius && dist > 0.1) {
        const mvx = mouse.x - mouse.px, mvy = mouse.y - mouse.py;
        const swipe = Math.min(Math.hypot(mvx, mvy), 40) * 0.15;
        const force = (1 - dist / kickRadius) * 6 + swipe;
        ball.vx += (dx / dist) * force;
        ball.vy += (dy / dist) * force;
      }
      mouse.px = mouse.x; mouse.py = mouse.y;
      // Friction + speed clamp
      ball.vx *= 0.99; ball.vy *= 0.99;
      const sp = Math.hypot(ball.vx, ball.vy), MAX = 14, MIN = 1.2;
      if (sp > MAX) { ball.vx *= MAX / sp; ball.vy *= MAX / sp; }
      if (sp < MIN && sp > 0) { ball.vx *= MIN / sp; ball.vy *= MIN / sp; }
      movePlayers(w, h);
      collideBall();
      ball.x += ball.vx; ball.y += ball.vy;
      const minX = 40 + ball.r, maxX = w - 40 - ball.r;
      const minY = 40 + ball.r, maxY = h - 40 - ball.r;
      if (ball.x < minX) { ball.x = minX; ball.vx *= -1; }
      if (ball.x > maxX) { ball.x = maxX; ball.vx *= -1; }
      if (ball.y < minY) { ball.y = minY; ball.vy *= -1; }
      if (ball.y > maxY) { ball.y = maxY; ball.vy *= -1; }
      ball.angle += ball.vx * 0.03;
      drawBall(ball.x, ball.y, ball.r, ball.angle);
      animFrame = requestAnimationFrame(draw);
    }
    draw();
  }
  
  // ── Public API ────────────────────────────────────────────────────
  window.fxStop     = stopAll;
  window.fxFootball = startFootball;
  window.fxSnow   = startSnow;
  window.fxLights = startLights;
  window.fxSummer = startSummer;
  window.fxSpring = startSpring;
  window.fxAutumn = startAutumn;
  window.addEventListener('resize', () => { if (activeEffect) resize(); });
// Load seasonal effect from SharePoint on page load — must wait for
// api-admin.js (now deferred) before getSeasonalEffect() exists
  document.addEventListener('DOMContentLoaded', () => {
    getSeasonalEffect().then(saved => {
      if (saved === 'snow')   startSnow();
      if (saved === 'lights') startLights();
      if (saved === 'summer') startSummer();
      if (saved === 'spring') startSpring();
      if (saved === 'autumn')   startAutumn();
      if (saved === 'football') startFootball();
    });
  });
})();