"use client";

import { useEffect, useRef } from "react";
import points from "@/lib/visuals/globe-points.json";

type Vector = [number, number, number];
const TAU = Math.PI * 2;
const location = (latitude: number, longitude: number): Vector => {
  const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
  return [Math.cos(lat) * Math.sin(lon), -Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
};

// Geographic routes follow the sphere; lift gives each transfer a visible arc.
const cities = [location(6.5, 3.4), location(51.5, -.1), location(40.7, -74), location(1.3, 103.8)];
const routes = [1, 2, 3].map(index => {
  const from = cities[index], to = cities[0];
  const distance = Math.acos(Math.max(-1, Math.min(1, from.reduce((sum, value, i) => sum + value * to[i], 0))));
  return Array.from({ length: 81 }, (_, step): Vector => {
    const t = step / 80, lift = 1 + Math.sin(t * Math.PI) * .19;
    const a = Math.sin((1 - t) * distance) / Math.sin(distance);
    const b = Math.sin(t * distance) / Math.sin(distance);
    return from.map((value, i) => (value * a + to[i] * b) * lift) as Vector;
  });
});
const graticule: Vector[][] = [
  ...[-60, -30, 0, 30, 60].map(lat => Array.from({ length: 121 }, (_, i) => location(lat, i * 3))),
  ...Array.from({ length: 12 }, (_, j) => Array.from({ length: 61 }, (_, i) => location(i * 3 - 90, j * 30))),
];

// Land samples derived from Natural Earth 1:110m public-domain land polygons.
export function AnimatedGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, angle = -.26, last = 0, elapsed = 0, visible = false, width = 0, height = 0;
    const resize = () => {
      width = canvas.clientWidth; height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = () => {
      if (!width || !height) return;
      const radius = Math.min(width, height) * .455;
      const cx = width * .5, cy = height * .5;
      const sin = Math.sin(angle), cos = Math.cos(angle);
      const project = ([x, y, z]: number[]): Vector => {
        const rx = x * cos + z * sin, rz = z * cos - x * sin;
        // A small axial tilt gives the silhouette depth while keeping north up.
        const ty = y * .993 - rz * .12, depth = y * .12 + rz * .993;
        return [cx + (rx * .99 + ty * .14) * radius, cy + (ty * .99 - rx * .14) * radius, depth];
      };
      ctx.clearRect(0, 0, width, height);
      const halo = ctx.createRadialGradient(cx, cy, radius * .65, cx, cy, radius * 1.2);
      halo.addColorStop(0, "rgba(80,86,81,0)");
      halo.addColorStop(.65, "rgba(80,86,81,.025)");
      halo.addColorStop(1, "rgba(80,86,81,0)");
      ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height);

      // Orbital guides stay outside the globe and remain secondary to the map.
      ctx.strokeStyle = "rgba(76,81,77,.12)"; ctx.lineWidth = .7;
      ctx.beginPath(); ctx.ellipse(cx, cy, radius * 1.17, radius * .38, -.36, 0, TAU); ctx.stroke();
      ctx.setLineDash([2, 6]); ctx.strokeStyle = "rgba(76,81,77,.09)";
      ctx.beginPath(); ctx.arc(cx, cy, radius * 1.12, -.8, 2.2); ctx.stroke(); ctx.setLineDash([]);

      const surface = ctx.createRadialGradient(cx - radius * .4, cy - radius * .4, 0, cx, cy, radius);
      surface.addColorStop(0, "rgba(255,254,250,.9)");
      surface.addColorStop(.7, "rgba(231,232,227,.5)");
      surface.addColorStop(1, "rgba(76,81,77,.09)");
      ctx.fillStyle = surface; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.fill();

      const line = (samples: Vector[], color: string, lineWidth: number) => {
        ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.beginPath();
        let drawing = false;
        for (const point of samples) {
          const [x, y, z] = project(point);
          if (z <= .015) { drawing = false; continue; }
          if (drawing) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          drawing = true;
        }
        ctx.stroke();
      };
      for (const ring of graticule) line(ring, "rgba(76,81,77,.075)", .55);

      const buckets: number[][][] = Array.from({ length: 9 }, () => []);
      for (const [x, y, z, land] of points) {
        const [px, py, depth] = project([x, y, z]);
        if (depth <= 0) continue;
        const bucket = land ? Math.min(8, 3 + Math.floor(depth * 5)) : Math.min(2, Math.floor(depth * 3));
        buckets[bucket].push([px, py, land ? .65 + depth * .65 : .38]);
      }
      for (let i = 0; i < buckets.length; i++) {
        ctx.fillStyle = `rgba(65,71,67,${[.08, .12, .16, .24, .34, .45, .58, .7, .82][i]})`;
        ctx.beginPath();
        for (const [x, y, size] of buckets[i]) { ctx.moveTo(x + size, y); ctx.arc(x, y, size, 0, TAU); }
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(76,81,77,.18)"; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.stroke();

      routes.forEach((route, index) => {
        line(route, "rgba(11,176,107,.12)", 4);
        line(route, "rgba(11,176,107,.65)", 1);
        const progress = reducedMotion.matches ? .58 : (elapsed / 4300 + index * .32) % 1;
        const step = Math.floor(progress * 80);
        line(route.slice(Math.max(0, step - 9), step + 1), "rgba(11,176,107,.9)", 2);
        const [x, y, depth] = project(route[step]);
        if (depth > 0) {
          ctx.shadowColor = "#0bb06b"; ctx.shadowBlur = 10;
          ctx.fillStyle = "#0bb06b"; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
          ctx.fillStyle = "#fffefa"; ctx.beginPath(); ctx.arc(x, y, 1, 0, TAU); ctx.fill();
        }
      });
      for (const city of cities) {
        const [x, y, depth] = project(city);
        if (depth <= .05) continue;
        const pulse = reducedMotion.matches ? 0 : (elapsed % 2200) / 2200;
        ctx.strokeStyle = `rgba(11,176,107,${.3 * (1 - pulse)})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, 5 + pulse * 10, 0, TAU); ctx.stroke();
        ctx.fillStyle = "#fffefa"; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
        ctx.fillStyle = "#0bb06b"; ctx.beginPath(); ctx.arc(x, y, 2.3, 0, TAU); ctx.fill();
      }
    };
    const animate = (time: number) => {
      frame = 0;
      if (!visible || document.hidden || reducedMotion.matches) { last = 0; return; }
      if (!last || time - last >= 32) {
        const delta = last ? Math.min(time - last, 64) : 0;
        elapsed += delta; angle += delta * .000035;
        draw(); last = time;
      }
      frame = requestAnimationFrame(animate);
    };
    const restart = () => {
      cancelAnimationFrame(frame); frame = 0; last = 0; draw();
      if (visible && !document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(animate);
    };
    const observer = new ResizeObserver(() => { resize(); draw(); }); observer.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; restart(); }); intersection.observe(canvas);
    reducedMotion.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
    resize(); restart();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect();
      reducedMotion.removeEventListener("change", restart); document.removeEventListener("visibilitychange", restart);
    };
  }, []);
  return <div className="pointer-events-none absolute inset-0" aria-hidden="true"><canvas ref={canvasRef} className="h-full w-full"/></div>;
}
