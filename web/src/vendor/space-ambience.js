/* SpaceAmbience — generated "deep space" sound bed. No audio files.
 *
 * Layers (all synthesised live with the Web Audio API):
 *  1. Rumble   — stereo brown noise, low-passed at 260 Hz, gain 0.55
 *  2. Air hiss — stereo white noise, band-pass ~2.2 kHz (Q 0.45) swept ±900 Hz by a 0.045 Hz LFO, gain 0.016
 *  3. Drone    — sines at 55, 82.41, 110.2, 164.8 Hz (slightly detuned), low-passed at 500 Hz,
 *                gain 0.05 with a slow 0.07 Hz swell
 *  Master gain → DynamicsCompressor → speakers. Noise loops are cross-faded so they never click.
 *
 * Browsers block audio until the user interacts, so call toggle() from a click.
 *   const amb = new SpaceAmbience(); button.onclick = () => amb.toggle();
 */
(function () {
  class SpaceAmbience {
    constructor() { this.on = false; this.a = null; }

    build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const sr = ctx.sampleRate;
      const noise = (secs, brown) => {
        const len = Math.floor(sr * secs), buf = ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
          const d = buf.getChannelData(ch); let last = 0;
          for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
          }
          const f = Math.floor(sr * 0.5); // 0.5 s cross-fade for a seamless loop
          for (let i = 0; i < f; i++) { const k = i / f; d[len - f + i] = d[len - f + i] * (1 - k) + d[i] * k; }
        }
        const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0.5; s.loopEnd = secs; return s;
      };
      const master = ctx.createGain(); master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);

      const rumble = noise(14, true), lp = ctx.createBiquadFilter(), g1 = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 260; g1.gain.value = 0.55;
      rumble.connect(lp); lp.connect(g1); g1.connect(master);

      const hiss = noise(8, false), bp = ctx.createBiquadFilter(), g2 = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.45; g2.gain.value = 0.016;
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.045; lfoG.gain.value = 900;
      lfo.connect(lfoG); lfoG.connect(bp.frequency);
      hiss.connect(bp); bp.connect(g2); g2.connect(master);

      const dg = ctx.createGain(), dlp = ctx.createBiquadFilter(); dg.gain.value = 0.05; dlp.type = 'lowpass'; dlp.frequency.value = 500;
      const trem = ctx.createOscillator(), tremG = ctx.createGain(); trem.frequency.value = 0.07; tremG.gain.value = 0.025;
      trem.connect(tremG); tremG.connect(dg.gain);
      const oscs = [55, 82.41, 110.2, 164.8].map((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = (i % 2 ? 5 : -4);
        const og = ctx.createGain(); og.gain.value = 0.5 / (i + 1); o.connect(og); og.connect(dlp); return o;
      });
      dlp.connect(dg); dg.connect(master);
      [rumble, hiss, lfo, trem, ...oscs].forEach((n) => n.start());
      return { ctx, master };
    }

    toggle() {
      if (!this.a) this.a = this.build();
      if (!this.a) return false;
      const { ctx, master } = this.a;
      this.on = !this.on;
      if (this.on) ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(this.on ? 0.9 : 0, ctx.currentTime, this.on ? 0.8 : 0.3); // ~2 s fade in, ~1 s fade out
      return this.on;
    }

    destroy() { if (this.a) { try { this.a.ctx.close(); } catch (e) {} } }
  }
  window.SpaceAmbience = SpaceAmbience;
})();
