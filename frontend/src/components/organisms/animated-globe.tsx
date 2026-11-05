"use client";

import { useEffect, useRef } from "react";
import points from "@/lib/visuals/globe-points.json";

// Land samples derived from Natural Earth 1:110m public-domain land polygons.
// https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson
export function AnimatedGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, angle = -.42, last = 0, visible = true, width = 0, height = 0;
    const resize = () => {
      width = canvas.clientWidth; height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = () => {
      const radius = Math.min(width, height) * .475;
      const cx = width * .5, cy = height * .5;
      const sin = Math.sin(angle), cos = Math.cos(angle);
      ctx.clearRect(0, 0, width, height);
      // Batch dots by opacity to avoid a separate canvas fill operation for every point.
      const buckets: number[][][] = Array.from({ length: 8 }, () => []);
      for (const [x,y,z,land] of points) {
        const rx = x * cos + z * sin, rz = z * cos - x * sin;
        if (rz <= 0) continue;
        const tx = rx * .985 + y * .17, ty = y * .985 - rx * .17;
        const bucket = land ? Math.min(7, 3 + Math.floor(rz * 4)) : Math.min(2, Math.floor(rz * 3));
        buckets[bucket].push([cx + tx * radius, cy + ty * radius, land ? .7 + rz * .58 : .45]);
      }
      for (let i=0;i<buckets.length;i++) {
        ctx.fillStyle = `rgba(11,15,14,${[.12,.17,.23,.35,.48,.6,.74,.88][i]})`;
        ctx.beginPath();
        for (const [x,y,size] of buckets[i]) { ctx.moveTo(x+size,y);ctx.arc(x,y,size,0,Math.PI*2); }
        ctx.fill();
      }
      // A fine rim keeps the silhouette clear without a solid globe surface.
      ctx.strokeStyle="rgba(11,15,14,.07)";ctx.lineWidth=.7;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();
    };
    const animate = (time: number) => {
      if (visible && !document.hidden && time-last>=32) {
        if (!reducedMotion.matches) angle += .0017;
        draw(); last=time;
      }
      if (!reducedMotion.matches) frame=requestAnimationFrame(animate);
    };
    const restart = () => { cancelAnimationFrame(frame); draw(); if(!reducedMotion.matches)frame=requestAnimationFrame(animate); };
    const observer = new ResizeObserver(() => { resize(); draw(); }); observer.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {visible=entry.isIntersecting;});intersection.observe(canvas);
    reducedMotion.addEventListener("change",restart);
    resize();restart();
    return () => {cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();reducedMotion.removeEventListener("change",restart);};
  }, []);
  return <div className="absolute inset-0" aria-hidden="true"><canvas ref={canvasRef} className="h-full w-full"/><svg viewBox="0 0 700 700" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" fill="none"><path d="M118 177 C150 70 363 62 490 158 S697 119 745 219" stroke="#0bb06b" strokeWidth="1.15" opacity=".65"/><path d="M510 576 C557 458 661 389 692 334" stroke="#0bb06b" strokeWidth=".9" strokeDasharray="2 5" opacity=".5"/><circle cx="118" cy="177" r="8" stroke="#0bb06b" opacity=".3"/><circle cx="118" cy="177" r="2.5" fill="#0bb06b"/><circle cx="510" cy="576" r="9" stroke="#0bb06b" opacity=".25"/><circle cx="510" cy="576" r="2.5" fill="#0bb06b" className="motion-safe:animate-pulse"/></svg></div>;
}
