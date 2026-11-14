import { Asset } from 'expo-asset';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { EARTH_FRAGMENT_SHADER, EARTH_VERTEX_SHADER } from '@/lib/earthShaders';
import type { LayoutFn } from '@/lib/earthLayouts';

const UNIFORMS = [
  'uRes',
  'uDpr',
  'uMode',
  'uTime',
  'uC',
  'uR',
  'uLon',
  'uLat',
  'uSun',
  'uFade',
  'uMark',
  'uMarkOn',
  'uMarkCol',
  'uAtm',
  'uCloudRot',
  'tDay',
  'tLights',
  'tClouds',
  'tOcean',
  'tBump',
] as const;

const BENGALURU: [number, number] = [0.2264, 1.3542];

export type EarthTextures = {
  day: number;
  lights: number;
  clouds: number;
  ocean: number;
  bump: number;
};

export type EarthGlobeOpts = {
  textures: EarthTextures;
  layout: LayoutFn;
  atmosphere?: [number, number, number];
  markerColor?: [number, number, number];
  startLon?: number;
  spin?: number;
  maxDpr?: number;
  cssWidth: number;
  cssHeight: number;
};

type TexKey = keyof EarthTextures;

/**
 * Port of design-package EarthGlobe for expo-gl (WebGL2).
 * Call endFrameEXP each frame. Destroy on unmount.
 */
export class EarthGlobe {
  private gl: ExpoWebGLRenderingContext;
  private o: Required<
    Pick<EarthGlobeOpts, 'atmosphere' | 'markerColor' | 'startLon' | 'spin' | 'maxDpr'>
  > &
    EarthGlobeOpts;
  private lon: number;
  private loaded: Partial<Record<TexKey, boolean>> = {};
  private U: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private last = 0;
  private t0: number | null = null;
  private dragX: number | null = null;
  private dead = false;
  private aniso: EXT_texture_filter_anisotropic | null = null;

  constructor(gl: ExpoWebGLRenderingContext, opts: EarthGlobeOpts) {
    this.gl = gl;
    this.o = {
      atmosphere: [0.36, 0.56, 0.95],
      markerColor: [0.92, 0.63, 0.35],
      startLon: 1.3542 + 0.5,
      spin: 1,
      maxDpr: 2,
      ...opts,
    };
    this.lon = this.o.startLon;
    if (!this.init()) throw new Error('EarthGlobe: shader init failed');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  setSize(cssWidth: number, cssHeight: number) {
    this.o.cssWidth = cssWidth;
    this.o.cssHeight = cssHeight;
  }

  setLayout(layout: LayoutFn) {
    this.o.layout = layout;
  }

  setSpin(spin: number) {
    this.o.spin = spin;
  }

  beginDrag(x: number) {
    this.dragX = x;
  }

  moveDrag(x: number) {
    if (this.dragX == null) return;
    const dx = x - this.dragX;
    this.dragX = x;
    const g = this.o.layout(this.o.cssWidth, this.o.cssHeight)[0];
    if (g) this.lon -= dx / g.r;
  }

  endDrag() {
    this.dragX = null;
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }

  private init() {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('Earth shader', gl.getShaderInfoLog(s));
      }
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, EARTH_VERTEX_SHADER));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, EARTH_FRAGMENT_SHADER));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('Earth program', gl.getProgramInfoLog(p));
      return false;
    }
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    UNIFORMS.forEach((k) => {
      this.U[k] = gl.getUniformLocation(p, k);
    });
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');

    const units: [TexKey, number, boolean][] = [
      ['day', 0, true],
      ['lights', 1, false],
      ['clouds', 2, false],
      ['ocean', 3, false],
      ['bump', 4, false],
    ];
    units.forEach(([key, unit, srgb]) => {
      const name = ('t' + key[0]!.toUpperCase() + key.slice(1)) as string;
      gl.uniform1i(this.U[name]!, unit);
      void this.loadTex(key, unit, srgb);
    });
    return true;
  }

  private async loadTex(key: TexKey, unit: number, srgb: boolean) {
    const gl = this.gl;
    try {
      const asset = Asset.fromModule(this.o.textures[key]);
      await asset.downloadAsync();
      if (this.dead || !asset.localUri) return;

      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

      // Expo decodes JPEG → RGBA. Prefer sRGB for the day map when available.
      const internal =
        srgb && (gl as WebGL2RenderingContext).SRGB8_ALPHA8
          ? (gl as WebGL2RenderingContext).SRGB8_ALPHA8
          : gl.RGBA;
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, gl.RGBA, gl.UNSIGNED_BYTE, {
        localUri: asset.localUri,
      } as unknown as TexImageSource);

      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (this.aniso) {
        const max = gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
        gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, max));
      }
      this.loaded[key] = true;
    } catch (e) {
      console.warn(`Earth texture ${key} failed`, e);
    }
  }

  private frame = (now: number) => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.frame);
    const gl = this.gl;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.dragX == null) this.lon -= dt * 0.03 * this.o.spin;

    const cw = this.o.cssWidth;
    const ch = this.o.cssHeight;
    const dpr = Math.min(this.o.maxDpr, gl.drawingBufferWidth / Math.max(1, cw) || 1);
    // Prefer actual drawing buffer; fall back to css×dpr
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    const scaleX = W / Math.max(1, cw);
    const scaleY = H / Math.max(1, ch);
    const t = now / 1000;

    if (this.loaded.day && this.loaded.clouds && this.t0 == null) this.t0 = t;
    const fade = this.t0 != null ? Math.min(1, (t - this.t0) / 1.8) : 0;

    const U = this.U;
    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uDpr, (scaleX + scaleY) / 2);
    gl.uniform1f(U.uTime, t);
    gl.uniform1i(U.uMode, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    gl.uniform1i(U.uMode, 1);
    gl.uniform1f(U.uFade, fade);
    gl.uniform3fv(U.uAtm, this.o.atmosphere);
    gl.uniform3fv(U.uMarkCol, this.o.markerColor);
    gl.uniform1f(U.uCloudRot, t * 0.0008);
    gl.uniform2f(U.uMark, BENGALURU[0], BENGALURU[1]);

    this.o.layout(cw, ch).forEach((g) => {
      const lon = this.lon;
      const pad = g.r * 0.35 + 24;
      const x0 = Math.max(0, g.cx - g.r - pad);
      const x1 = Math.min(cw, g.cx + g.r + pad);
      const y0 = Math.max(0, g.clipTop || 0, g.cy - g.r - pad);
      const y1 = Math.min(ch, g.clipBottom != null ? g.clipBottom : ch, g.cy + g.r + pad);
      if (x1 <= x0 || y1 <= y0) return;
      gl.scissor(
        Math.floor(x0 * scaleX),
        Math.floor(H - y1 * scaleY),
        Math.ceil((x1 - x0) * scaleX),
        Math.ceil((y1 - y0) * scaleY),
      );
      gl.uniform2f(U.uC, g.cx * scaleX, g.cy * scaleY);
      gl.uniform1f(U.uR, g.r * ((scaleX + scaleY) / 2));
      gl.uniform1f(U.uLon, lon);
      gl.uniform1f(U.uLat, g.lat);
      gl.uniform3fv(U.uSun, g.sun);
      gl.uniform1f(U.uMarkOn, (g.mark || 0) * fade);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });

    gl.flush();
    gl.endFrameEXP();
  };
}
