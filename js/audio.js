/* ============================================================
   AUDIO — procedural sound effects via Web Audio API.
   No external files needed.
   ============================================================ */

const Audio = (function () {
  let ctx = null;
  let enabled = true;
  let masterGain = null;

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.25;
      masterGain.connect(ctx.destination);
    } catch (e) { /* no audio */ }
    return ctx;
  }

  function setEnabled(on) { enabled = !!on; }

  function tone({ freq = 440, type = 'sine', dur = 0.12, vol = 0.5, attack = 0.005, decay = 0.08, slideTo = null }) {
    if (!enabled) return;
    const c = ensureCtx(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + attack);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + attack + decay);
    o.connect(g); g.connect(masterGain);
    o.start();
    o.stop(c.currentTime + dur + 0.05);
  }

  function noise({ dur = 0.08, vol = 0.2, hpf = 800 }) {
    if (!enabled) return;
    const c = ensureCtx(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    const bufferSize = Math.floor(c.sampleRate * dur);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = c.createBufferSource(); src.buffer = buffer;
    const filt = c.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = hpf;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(filt); filt.connect(g); g.connect(masterGain);
    src.start();
  }

  return {
    setEnabled, ensureCtx,
    tap: () => { tone({ freq: 700, dur: 0.05, vol: 0.3, slideTo: 900 }); },
    coin: () => { tone({ freq: 880, dur: 0.08, vol: 0.35 }); tone({ freq: 1320, dur: 0.06, vol: 0.25, type: 'triangle' }); },
    levelUp: () => {
      tone({ freq: 523, dur: 0.1, vol: 0.4 });
      setTimeout(() => tone({ freq: 659, dur: 0.1, vol: 0.4 }), 90);
      setTimeout(() => tone({ freq: 784, dur: 0.18, vol: 0.4 }), 180);
    },
    rare: () => {
      tone({ freq: 660, dur: 0.18, vol: 0.4, type: 'triangle' });
      setTimeout(() => tone({ freq: 880, dur: 0.18, vol: 0.4, type: 'triangle' }), 140);
      setTimeout(() => tone({ freq: 1320, dur: 0.32, vol: 0.4, type: 'triangle' }), 260);
    },
    epic: () => {
      tone({ freq: 440, dur: 0.2, vol: 0.4, type: 'square' });
      setTimeout(() => tone({ freq: 660, dur: 0.2, vol: 0.4, type: 'square' }), 160);
      setTimeout(() => tone({ freq: 880, dur: 0.2, vol: 0.4, type: 'square' }), 320);
      setTimeout(() => tone({ freq: 1320, dur: 0.4, vol: 0.5, type: 'sawtooth' }), 480);
    },
    legendary: () => {
      for (let i = 0; i < 8; i++) setTimeout(() => tone({ freq: 440 + i * 120, dur: 0.12, vol: 0.45, type: 'sawtooth' }), i * 80);
      setTimeout(() => tone({ freq: 1320, dur: 0.7, vol: 0.55, type: 'triangle', slideTo: 2640 }), 700);
    },
    rip: () => { noise({ dur: 0.18, vol: 0.35, hpf: 1500 }); },
    win: () => {
      tone({ freq: 523, dur: 0.12, vol: 0.4 });
      setTimeout(() => tone({ freq: 659, dur: 0.12, vol: 0.4 }), 110);
      setTimeout(() => tone({ freq: 784, dur: 0.12, vol: 0.4 }), 220);
      setTimeout(() => tone({ freq: 1047, dur: 0.28, vol: 0.45 }), 330);
    },
    lose: () => {
      tone({ freq: 392, dur: 0.18, vol: 0.4, slideTo: 196, type: 'sawtooth' });
    },
    click: () => { tone({ freq: 1200, dur: 0.03, vol: 0.2 }); },
    buy: () => { tone({ freq: 600, dur: 0.06, vol: 0.3 }); tone({ freq: 1000, dur: 0.08, vol: 0.3 }); },
  };
})();
