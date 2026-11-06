import { rmSync } from "node:fs";

// Remove compiler caches only. Preserve build output, image and runtime caches.
const caches = [
  ".next/cache/turbopack/",
  ".next/cache/webpack/",
  ".next/cache/swc/",
  ".next/dev/cache/turbopack/",
];

for (const cache of caches) {
  rmSync(new URL(`../${cache}`, import.meta.url), { recursive: true, force: true });
  console.log(`Cleared ${cache}`);
}
