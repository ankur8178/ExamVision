/**
 * SubmitCelebration.js
 * Drop this in: frontend/src/components/shared/SubmitCelebration.js
 *
 * Usage in ExamPage.js submitted screen:
 *   import SubmitCelebration from '../components/shared/SubmitCelebration';
 *   <SubmitCelebration />
 */

import React, { useEffect, useRef } from 'react';

// Pick one of 4 styles randomly each time
const STYLES = ['confetti', 'fireworks', 'stars', 'emoji'];

const EMOJIS = ['🎉','🥳','🎊','✨','🏆','💯','🔥','⭐','🎈','👏'];
const COLORS = ['#6c63ff','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4'];

export default function SubmitCelebration() {
  const canvasRef = useRef(null);
  const styleRef  = useRef(STYLES[Math.floor(Math.random() * STYLES.length)]);
  const frameRef  = useRef(null);
  const startRef  = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const style    = styleRef.current;
    const particles = [];
    const DURATION  = 3500; // ms

    // ── Particle factories ────────────────────────────────────────────
    const rand = (a, b) => Math.random() * (b - a) + a;

    if (style === 'confetti') {
      for (let i = 0; i < 180; i++) {
        particles.push({
          x: rand(0, canvas.width),
          y: rand(-canvas.height * 0.5, 0),
          w: rand(8, 16), h: rand(4, 10),
          color: COLORS[Math.floor(rand(0, COLORS.length))],
          rot: rand(0, Math.PI * 2),
          rotV: rand(-0.12, 0.12),
          vx: rand(-1.5, 1.5),
          vy: rand(2, 6),
          alpha: 1,
        });
      }
    } else if (style === 'fireworks') {
      const burst = (bx, by, color) => {
        for (let i = 0; i < 40; i++) {
          const angle = (i / 40) * Math.PI * 2;
          const speed = rand(2, 7);
          particles.push({
            x: bx, y: by,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color, alpha: 1, size: rand(2, 5),
            gravity: 0.08,
          });
        }
      };
      burst(canvas.width * 0.3, canvas.height * 0.35, COLORS[0]);
      burst(canvas.width * 0.7, canvas.height * 0.25, COLORS[2]);
      burst(canvas.width * 0.5, canvas.height * 0.5,  COLORS[4]);
      burst(canvas.width * 0.2, canvas.height * 0.6,  COLORS[1]);
      burst(canvas.width * 0.8, canvas.height * 0.55, COLORS[5]);
    } else if (style === 'stars') {
      for (let i = 0; i < 120; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(1, 5);
        particles.push({
          x: canvas.width / 2,
          y: canvas.height / 2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: rand(4, 14),
          color: COLORS[Math.floor(rand(0, COLORS.length))],
          alpha: 1,
          twinkle: rand(0, Math.PI * 2),
        });
      }
    } else {
      // emoji party
      for (let i = 0; i < 50; i++) {
        particles.push({
          emoji: EMOJIS[Math.floor(rand(0, EMOJIS.length))],
          x: rand(0, canvas.width),
          y: rand(-200, 0),
          vx: rand(-1, 1),
          vy: rand(1.5, 4.5),
          size: rand(20, 48),
          rot: rand(0, Math.PI * 2),
          rotV: rand(-0.1, 0.1),
          alpha: 1,
        });
      }
    }

    // ── Draw loop ─────────────────────────────────────────────────────
    const draw = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / DURATION, 1);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha * (1 - Math.pow(progress, 2));

        if (style === 'confetti') {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          p.x  += p.vx;
          p.y  += p.vy;
          p.rot += p.rotV;
          p.vy *= 1.01;
        } else if (style === 'fireworks') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          p.x  += p.vx;
          p.y  += p.vy;
          p.vy += p.gravity;
          p.vx *= 0.99;
          p.size *= 0.97;
        } else if (style === 'stars') {
          p.twinkle += 0.1;
          const s = p.size * (0.8 + 0.2 * Math.sin(p.twinkle));
          drawStar(ctx, p.x, p.y, 5, s, s / 2.5, p.color);
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.04;
        } else {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.font = `${p.size}px serif`;
          ctx.textAlign = 'center';
          ctx.fillText(p.emoji, 0, 0);
          p.x  += p.vx;
          p.y  += p.vy;
          p.rot += p.rotV;
        }

        ctx.restore();
      });

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0,
        pointerEvents: 'none',
        zIndex: 99999,
      }}
    />
  );
}

// Helper: draw a star shape
function drawStar(ctx, cx, cy, spikes, outerR, innerR, color) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerR);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}