import * as THREE from 'three';

/**
 * The wall's surface, painted once on a canvas.
 *
 * A climbing wall is plywood with a grid of T-nuts in it — the bolt holes
 * every hold is screwed into — and the grid is what makes it read as a
 * climbing wall at a glance, even with no holds on it. It is also a ruler:
 * the holes are 20 cm apart, which is what you judge a move against.
 *
 * Nothing is fetched: the texture is drawn here from a seeded generator, so
 * every wall looks the same on every device and the game still has no assets.
 * One texture per look, shared and cached; it is small (512 px for a 1.22 m
 * panel) and mipmapped, so it costs next to nothing on a phone.
 */

export type WallLook = {
  /** Base paint. */
  base: string;
  /** How strong the plywood grain shows, 0..1. */
  grain: number;
  /** T-nut hole colour. */
  nut: string;
  /** Chalk: the pale scuffs a used wall collects. 0..1. */
  chalk: number;
  /** Metres of wall the texture covers, square. */
  metres: number;
  /** Hole spacing, metres. */
  pitch: number;
  /** Dark line round the edge of the tile: a panel seam, or a belt slat's gap. */
  seam?: { color: string; width: number; rows?: boolean; cols?: boolean };
};

/** The bouldering cave: warm off-white plywood, used. */
export const CAVE_LOOK: WallLook = {
  base: '#e3dccb', grain: 0.5, nut: '#6f6656', chalk: 0.55, metres: 1.22, pitch: 0.2,
  seam: { color: '#a59a83', width: 0.012, rows: true, cols: true },
};

/**
 * The highball tower: the same plywood, painted a cool pale grey, with the
 * panel seams stronger — a different wall, two storeys of it, at a glance.
 */
export const TOWER_LOOK: WallLook = {
  base: '#d3d8dc', grain: 0.25, nut: '#5d646c', chalk: 0.7, metres: 1.22, pitch: 0.2,
  seam: { color: '#8c949c', width: 0.016, rows: true, cols: true },
};

/** The walls either side of the climbing area: painted dark, out of the way. */
export const SIDE_LOOK: WallLook = {
  base: '#2b3040', grain: 0.2, nut: '#1c1f2a', chalk: 0, metres: 1.22, pitch: 0.2,
  seam: { color: '#1f2330', width: 0.012, rows: true, cols: true },
};

/** A treadwall's belt: narrow slats with a gap between each, in a lighter birch. */
export const SLAT_LOOK: WallLook = {
  base: '#e8dcc2', grain: 0.7, nut: '#5c5242', chalk: 0.35, metres: 0.25, pitch: 0.125,
  seam: { color: '#3a3328', width: 0.018, rows: true },
};

const cache = new Map<WallLook, THREE.Texture>();

/** The texture for a look. Wall UVs are in metres; this repeats every `look.metres`. */
export function wallTexture(look: WallLook): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const hit = cache.get(look);
  if (hit) return hit;
  const px = 512;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const m = px / look.metres; // pixels per metre
  let seed = 0x9e3779b9;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

  ctx.fillStyle = look.base;
  ctx.fillRect(0, 0, px, px);

  // Plywood grain: long, soft, slightly wavy bands running across.
  if (look.grain > 0) {
    for (let i = 0; i < 70; i++) {
      const y = rnd() * px;
      const h = 2 + rnd() * 10;
      const a = (0.015 + rnd() * 0.035) * look.grain;
      ctx.fillStyle = rnd() > 0.5 ? `rgba(120,90,50,${a})` : `rgba(255,250,240,${a * 1.4})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= px; x += 32) ctx.lineTo(x, y + Math.sin(x / 90 + i) * 3);
      ctx.lineTo(px, y + h);
      for (let x = px; x >= 0; x -= 32) ctx.lineTo(x, y + h + Math.sin(x / 70 + i) * 3);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Chalk: pale scuffs, heavier near the middle of the tile where hands go.
  for (let i = 0; i < 90 * look.chalk; i++) {
    const x = rnd() * px;
    const y = rnd() * px;
    const r = 4 + rnd() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.05 + rnd() * 0.08})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Fine speckle, so flat paint does not look like a render.
  const img = ctx.getImageData(0, 0, px, px);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 10;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  // The T-nut grid. Each hole is a dark dot with a lighter rim below it,
  // so it reads as a hole in the board rather than a painted spot.
  const n = Math.round(look.metres / look.pitch);
  const step = px / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (i + 0.5) * step;
      const y = (j + 0.5) * step;
      const r = Math.max(2.2, 0.0075 * m);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(x, y + r * 0.45, r * 1.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = look.nut;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (look.seam) {
    const w = Math.max(2, look.seam.width * m);
    ctx.fillStyle = look.seam.color;
    if (look.seam.rows) ctx.fillRect(0, 0, px, w);
    if (look.seam.cols) ctx.fillRect(0, 0, w, px);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / look.metres, 1 / look.metres);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(look, tex);
  return tex;
}

/** A soft dark disc, for the contact shadow under each hold. Shared. */
let blob: THREE.Texture | null = null;
export function contactShadowTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  if (blob) return blob;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  blob = new THREE.CanvasTexture(c);
  return blob;
}

/** For tests and screen teardown: the cache is app-lifetime, so this is only for completeness. */
export function disposeWallTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
  blob?.dispose();
  blob = null;
}
