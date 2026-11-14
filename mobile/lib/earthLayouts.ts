/** Mobile globe layouts from docs/EARTH-AND-SOUND.md — exact maths. */

export type GlobeLayout = {
  cx: number;
  cy: number;
  r: number;
  lat: number;
  sun: [number, number, number];
  mark: number;
  clipTop: number;
  clipBottom: number;
};

export type LayoutFn = (cw: number, ch: number) => GlobeLayout[];

/** Mobile Home — rising cap from the bottom, camera from ~24° S so India sits in the rim. */
export function mobileHomeLayout(opts: {
  screenH: number;
  safeTop: number;
  compact: boolean;
}): LayoutFn {
  const { screenH: H, safeTop, compact } = opts;
  return (cw) => {
    const textBottom = 82 + safeTop + (compact ? 250 : 362);
    const cap = Math.max(200, Math.min(H * (compact ? 0.4 : 0.44), H - textBottom - 12));
    const r = Math.max(170, 0.66 * cw);
    return [
      {
        cx: 0.5 * cw,
        cy: H - cap + r,
        r,
        lat: -0.42,
        sun: [-0.6, 0.42, 0.68],
        mark: 1,
        clipTop: 0,
        clipBottom: H,
      },
    ];
  };
}

/** Mobile Future Earth — between hero copy and the control dock. */
export function mobileFutureLayout(opts: {
  screenH: number;
  safeTop: number;
  safeBottom: number;
  compact: boolean;
}): LayoutFn {
  const { screenH: H, safeTop, safeBottom, compact } = opts;
  return (cw) => {
    const textBottom = 82 + safeTop + (compact ? 190 : 270);
    const dockTop = H - (88 + safeBottom) - 190;
    const r = Math.max(150, cw * (compact ? 0.4 : 0.48));
    const cy = Math.max(textBottom + 0.35 * r, (textBottom + dockTop) / 2 + 24);
    return [
      {
        cx: 0.66 * cw,
        cy,
        r,
        lat: 0.22,
        sun: [-0.62, 0.36, 0.7],
        mark: 1,
        clipTop: 0,
        clipBottom: H,
      },
    ];
  };
}
