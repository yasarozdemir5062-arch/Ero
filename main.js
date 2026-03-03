(() => {
  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

  let dpr = 1;
  let width = 0;
  let height = 0;
  let pointerX = 0;
  let pointerY = 0;
  let isPointerDown = false;
  let activePointerId = null;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const deviceBudget = Math.min(1500, Math.max(800, Math.floor(window.innerWidth * window.innerHeight * 0.0016)));
  const MAX_PARTICLES = prefersReducedMotion ? Math.floor(deviceBudget * 0.4) : deviceBudget;
  const DRAG_BURST = prefersReducedMotion ? 4 : 8;

  const STATE_DRIFT = 0;
  const STATE_GATHER = 1;
  const STATE_EXPLODE = 2;

  const particles = [];
  const free = [];

  let gatherPoint = null;
  let gatherTriggeredAt = 0;
  let heartBlastQueued = false;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function allocParticle() {
    if (free.length) {
      return free.pop();
    }
    if (particles.length >= MAX_PARTICLES) {
      const recycled = particles.shift();
      if (!recycled) return null;
      return recycled;
    }
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0,
      alpha: 1,
      size: 2,
      targetX: 0,
      targetY: 0,
      state: STATE_DRIFT,
      friction: 0.95,
      colorHue: 340,
      baseSize: 2,
    };
  }

  function emitTrail(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const p = allocParticle();
      if (!p) return;

      const a = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2.4;
      p.x = x + (Math.random() - 0.5) * 6;
      p.y = y + (Math.random() - 0.5) * 6;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.life = 0;
      p.maxLife = 50 + Math.random() * 40;
      p.alpha = 0.95;
      p.baseSize = 1.4 + Math.random() * 2.4;
      p.size = p.baseSize;
      p.state = STATE_DRIFT;
      p.friction = 0.94;
      p.colorHue = 330 + Math.random() * 30;
      particles.push(p);
    }
  }

  function gatherTo(x, y) {
    gatherPoint = { x, y };
    gatherTriggeredAt = performance.now();
    heartBlastQueued = true;

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      p.state = STATE_GATHER;
      p.targetX = x;
      p.targetY = y;
      p.maxLife = Math.max(p.maxLife, 140);
      p.alpha = Math.max(p.alpha, 0.45);
    }
  }

  function spawnHeartExplosion(cx, cy) {
    const points = prefersReducedMotion ? 180 : 280;
    const scaleBase = Math.min(width, height) * 0.015;

    for (let i = 0; i < points; i += 1) {
      const t = (i / points) * Math.PI * 2;
      const hx = 16 * Math.sin(t) ** 3;
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

      const px = cx + hx * scaleBase;
      const py = cy - hy * scaleBase;

      const p = allocParticle();
      if (!p) continue;

      const outwardX = px - cx;
      const outwardY = py - cy;
      const len = Math.hypot(outwardX, outwardY) || 1;
      const speed = 1.8 + Math.random() * 2.8;

      p.x = px;
      p.y = py;
      p.vx = (outwardX / len) * speed + (Math.random() - 0.5) * 0.5;
      p.vy = (outwardY / len) * speed + (Math.random() - 0.5) * 0.5;
      p.life = 0;
      p.maxLife = 55 + Math.random() * 40;
      p.alpha = 1;
      p.baseSize = 2 + Math.random() * 2.4;
      p.size = p.baseSize;
      p.state = STATE_EXPLODE;
      p.friction = 0.965;
      p.colorHue = 345 + Math.random() * 20;
      particles.push(p);
    }
  }

  function onPointerDown(e) {
    activePointerId = e.pointerId;
    isPointerDown = true;
    pointerX = e.clientX;
    pointerY = e.clientY;
    emitTrail(pointerX, pointerY, DRAG_BURST * 2);
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (activePointerId !== e.pointerId) return;
    pointerX = e.clientX;
    pointerY = e.clientY;
    if (isPointerDown) {
      emitTrail(pointerX, pointerY, DRAG_BURST);
    }
  }

  function onPointerUp(e) {
    if (activePointerId !== e.pointerId) return;
    isPointerDown = false;
    pointerX = e.clientX;
    pointerY = e.clientY;
    gatherTo(pointerX, pointerY);
    canvas.releasePointerCapture(e.pointerId);
    activePointerId = null;
  }

  function onPointerCancel(e) {
    if (activePointerId !== e.pointerId) return;
    isPointerDown = false;
    canvas.releasePointerCapture(e.pointerId);
    activePointerId = null;
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life += 1;

      if (p.state === STATE_GATHER) {
        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        p.vx += dx * 0.035;
        p.vy += dy * 0.035;
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.alpha = Math.max(0.25, 1 - p.life / p.maxLife);
      } else {
        p.vx *= p.friction;
        p.vy *= p.friction;
        p.alpha = 1 - p.life / p.maxLife;
      }

      p.x += p.vx;
      p.y += p.vy;

      if (p.state === STATE_EXPLODE) {
        const decay = p.life / p.maxLife;
        p.size = p.baseSize * (1 - decay * 0.7);
      } else {
        p.size = p.baseSize;
      }

      if (
        p.life >= p.maxLife ||
        p.alpha <= 0 ||
        p.size <= 0.1 ||
        p.x < -40 ||
        p.x > width + 40 ||
        p.y < -40 ||
        p.y > height + 40
      ) {
        particles.splice(i, 1);
        free.push(p);
        continue;
      }

      ctx.fillStyle = `hsla(${p.colorHue}, 100%, 65%, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    if (heartBlastQueued && gatherPoint && performance.now() - gatherTriggeredAt > 180) {
      spawnHeartExplosion(gatherPoint.x, gatherPoint.y);
      heartBlastQueued = false;
    }

    requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });

  canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerup', onPointerUp, { passive: true });
  canvas.addEventListener('pointercancel', onPointerCancel, { passive: true });

  requestAnimationFrame(animate);
})();
