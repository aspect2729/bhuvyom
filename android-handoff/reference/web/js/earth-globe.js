/* EarthGlobe — photoreal rotating Earth, WebGL2, no libraries.
 *
 * How it works
 *  - No mesh: every pixel inside the globe ray-traces a perfect sphere, so the
 *    edge stays razor sharp at any size / pixel density.
 *  - Textures (NASA): 8K day colour, 8K city lights, 8K clouds, 4K ocean mask,
 *    4K elevation bump. Trilinear mipmaps + 16x anisotropic filtering.
 *  - Shading: day/night terminator with warm band, city lights on the night side,
 *    drifting clouds with cast shadows, sun glint on oceans only, relief from
 *    the bump map, Fresnel atmosphere rim + outer glow, ACES tone mapping.
 *  - Background pass draws a sparse, slowly twinkling star field on pure black.
 *  - Optional pulsing marker (Bengaluru 12.97°N, 77.59°E).
 *  - Drag horizontally to spin. Pauses when off-screen or tab hidden.
 *
 * Usage
 *   const globe = new EarthGlobe(canvas, {
 *     textures: { day, lights, clouds, ocean, bump },   // URLs (same origin, or CORS-enabled)
 *     layout: (cssWidth, cssHeight) => [ { cx, cy, r, lat, sun:[x,y,z], mark:1, clipTop, clipBottom } ],
 *     atmosphere: [0.36, 0.56, 0.95], markerColor: [0.92, 0.63, 0.35],
 *     startLon: 1.3542 + 0.5,   // radians; centre longitude at start
 *     spin: 1                   // 1 = 0.03 rad/s (≈ one turn every 3.5 min)
 *   });
 *   globe.destroy();
 *
 * Shader source: window.EARTH_FRAGMENT_SHADER (js/earth-shader.js, same as shaders/earth.frag).
 * Requires an HTTP server: browsers refuse WebGL textures loaded from file:// URLs.
 */
(function () {
  const UNIFORMS = ['uRes', 'uDpr', 'uMode', 'uTime', 'uC', 'uR', 'uLon', 'uLat', 'uSun', 'uFade', 'uMark', 'uMarkOn', 'uMarkCol', 'uAtm', 'uCloudRot', 'tDay', 'tLights', 'tClouds', 'tOcean', 'tBump'];
  const BENGALURU = [0.2264, 1.3542]; // lat, lon in radians (12.97° N, 77.59° E)

  class EarthGlobe {
    constructor(canvas, opts) {
      this.cv = canvas;
      this.o = Object.assign({ atmosphere: [0.36, 0.56, 0.95], markerColor: [0.92, 0.63, 0.35], startLon: 0, spin: 1, maxDpr: 2 }, opts);
      this.lon = this.o.startLon;
      this.loaded = {};
      this.visible = true;
      this.frame = this.frame.bind(this);
      if (!this.init()) { canvas.dataset.webgl = 'unsupported'; return; }
      this.bindDrag();
      if ('IntersectionObserver' in window) {
        this.io = new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; }, { rootMargin: '200px' });
        this.io.observe(canvas);
      }
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }

    init() {
      const gl = this.cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
      if (!gl) return false;
      this.gl = gl;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s)); return s; };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, window.EARTH_VERTEX_SHADER));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, window.EARTH_FRAGMENT_SHADER));
      gl.bindAttribLocation(p, 0, 'p');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(p)); return false; }
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one full-screen triangle
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.U = {};
      UNIFORMS.forEach((k) => { this.U[k] = gl.getUniformLocation(p, k); });
      this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      [['day', 0, true], ['lights', 1, false], ['clouds', 2, false], ['ocean', 3, false], ['bump', 4, false]].forEach(([k, unit, srgb]) => {
        gl.uniform1i(this.U['t' + k[0].toUpperCase() + k.slice(1)], unit);
        this.loadTex(k, unit, srgb);
      });
      return true;
    }

    loadTex(key, unit, srgb) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!this.gl) return;
        let src = img;
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        if (img.naturalWidth > max) { // older GPUs: downscale to the largest supported size
          const c = document.createElement('canvas');
          c.width = max; c.height = max / 2;
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          src = c;
        }
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        if (srgb) gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, src); // colour: sRGB -> linear in hardware
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, src);              // data maps: single channel
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        this.loaded[key] = true;
      };
      img.src = this.o.textures[key];
    }

    bindDrag() {
      const cv = this.cv;
      this.onDown = (e) => { this.drag = { x: e.clientX }; cv.style.cursor = 'grabbing'; };
      this.onMove = (e) => {
        if (!this.drag) return;
        const dx = e.clientX - this.drag.x; this.drag.x = e.clientX;
        const g = this.o.layout(cv.clientWidth, cv.clientHeight)[0];
        this.lon -= dx / g.r; // drag right = surface moves right
      };
      this.onUp = () => { this.drag = null; cv.style.cursor = 'grab'; };
      cv.addEventListener('pointerdown', this.onDown);
      window.addEventListener('pointermove', this.onMove);
      window.addEventListener('pointerup', this.onUp);
    }

    frame(now) {
      if (!this.gl) return;
      this.raf = requestAnimationFrame(this.frame);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (!this.visible || document.hidden) return;
      const gl = this.gl, cv = this.cv, U = this.U, t = now / 1000;
      if (!this.drag) this.lon -= dt * 0.03 * this.o.spin; // west-to-east rotation
      const dpr = Math.min(window.devicePixelRatio || 1, this.o.maxDpr);
      const cw = cv.clientWidth, ch = cv.clientHeight;
      const W = Math.max(1, Math.round(cw * dpr)), H = Math.max(1, Math.round(ch * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      if (this.loaded.day && this.loaded.clouds && !this.t0) this.t0 = t;
      const fade = this.t0 ? Math.min(1, (t - this.t0) / 1.8) : 0; // fade in once textures are on the GPU

      gl.viewport(0, 0, W, H);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uDpr, dpr);
      gl.uniform1f(U.uTime, t);
      gl.uniform1i(U.uMode, 0); // pass 0: star field
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied; glow is additive (alpha 0)
      gl.enable(gl.SCISSOR_TEST);
      gl.uniform1i(U.uMode, 1); // pass 1..n: globes
      gl.uniform1f(U.uFade, fade);
      gl.uniform3fv(U.uAtm, this.o.atmosphere);
      gl.uniform3fv(U.uMarkCol, this.o.markerColor);
      gl.uniform1f(U.uCloudRot, t * 0.0008); // clouds drift slightly faster than the ground
      gl.uniform2f(U.uMark, BENGALURU[0], BENGALURU[1]);
      this.o.layout(cw, ch).forEach((g) => {
        const lon = g.lon != null ? g.lon : this.lon;
        const pad = g.r * 0.35 + 24;
        const x0 = Math.max(0, g.cx - g.r - pad), x1 = Math.min(cw, g.cx + g.r + pad);
        const y0 = Math.max(0, g.clipTop || 0, g.cy - g.r - pad), y1 = Math.min(ch, g.clipBottom != null ? g.clipBottom : ch, g.cy + g.r + pad);
        if (x1 <= x0 || y1 <= y0) return;
        gl.scissor(Math.floor(x0 * dpr), Math.floor(H - y1 * dpr), Math.ceil((x1 - x0) * dpr), Math.ceil((y1 - y0) * dpr));
        gl.uniform2f(U.uC, g.cx * dpr, g.cy * dpr);
        gl.uniform1f(U.uR, g.r * dpr);
        gl.uniform1f(U.uLon, lon);
        gl.uniform1f(U.uLat, g.lat);
        gl.uniform3fv(U.uSun, g.sun);
        gl.uniform1f(U.uMarkOn, (g.mark || 0) * fade);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      });
    }

    destroy() {
      cancelAnimationFrame(this.raf);
      if (this.io) this.io.disconnect();
      this.cv.removeEventListener('pointerdown', this.onDown);
      window.removeEventListener('pointermove', this.onMove);
      window.removeEventListener('pointerup', this.onUp);
      const ext = this.gl && this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      this.gl = null;
    }
  }

  window.EarthGlobe = EarthGlobe;
})();
