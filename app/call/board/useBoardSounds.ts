import { useMemo, useRef } from "react";

export function useBoardSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);

  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const chalkGainRef = useRef<GainNode | null>(null);
  const bpRef = useRef<BiquadFilterNode | null>(null);
  const hpRef = useRef<BiquadFilterNode | null>(null);
  const lpRef = useRef<BiquadFilterNode | null>(null);

  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);

  const bodyOscRef = useRef<OscillatorNode | null>(null);
  const bodyGainRef = useRef<GainNode | null>(null);

  const ensure = () => {
    if (ctxRef.current) return;

    const Ctx = (window.AudioContext ||
      (window as any).webkitAudioContext) as typeof AudioContext | undefined;

    if (!Ctx) return;

    const ctx = new Ctx();
    const master = ctx.createGain();

    master.gain.value = 0.42;
    master.connect(ctx.destination);

    ctxRef.current = ctx;
    masterRef.current = master;
  };

  const resumeIfNeeded = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
  };

  const startIfNeeded = () => {
    ensure();

    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;

    resumeIfNeeded();

    if (srcRef.current) return;

    const bufferSize = Math.floor(ctx.sampleRate * 2.0);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.42;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 420;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1600;
    bp.Q.value = 1.1;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6200;

    const chalkGain = ctx.createGain();
    chalkGain.gain.value = 0.0;

    const lfo = ctx.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.value = 13;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.16;

    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = "sine";
    bodyOsc.frequency.value = 95;

    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.0;

    lfo.connect(lfoGain);
    lfoGain.connect(chalkGain.gain);

    src.connect(hp);
    hp.connect(bp);
    bp.connect(lp);
    lp.connect(chalkGain);
    chalkGain.connect(master);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(master);

    src.start();
    lfo.start();
    bodyOsc.start();

    srcRef.current = src;
    chalkGainRef.current = chalkGain;
    bpRef.current = bp;
    hpRef.current = hp;
    lpRef.current = lp;
    lfoRef.current = lfo;
    lfoGainRef.current = lfoGain;
    bodyOscRef.current = bodyOsc;
    bodyGainRef.current = bodyGain;
  };

  const dispose = () => {
    try {
      srcRef.current?.stop();
    } catch {}
    try {
      lfoRef.current?.stop();
    } catch {}
    try {
      bodyOscRef.current?.stop();
    } catch {}

    try {
      srcRef.current?.disconnect();
    } catch {}
    try {
      lfoRef.current?.disconnect();
    } catch {}
    try {
      bodyOscRef.current?.disconnect();
    } catch {}
    try {
      chalkGainRef.current?.disconnect();
    } catch {}
    try {
      bpRef.current?.disconnect();
    } catch {}
    try {
      hpRef.current?.disconnect();
    } catch {}
    try {
      lpRef.current?.disconnect();
    } catch {}
    try {
      lfoGainRef.current?.disconnect();
    } catch {}
    try {
      bodyGainRef.current?.disconnect();
    } catch {}

    srcRef.current = null;
    lfoRef.current = null;
    bodyOscRef.current = null;
    chalkGainRef.current = null;
    bpRef.current = null;
    hpRef.current = null;
    lpRef.current = null;
    lfoGainRef.current = null;
    bodyGainRef.current = null;

    const ctx = ctxRef.current;
    ctxRef.current = null;
    masterRef.current = null;

    try {
      void ctx?.close();
    } catch {}
  };

  const chalkTap = (strength = 1) => {
    ensure();

    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;

    resumeIfNeeded();

    const t0 = ctx.currentTime;
    const s = Math.max(0.1, Math.min(1.4, strength));

    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = "sine";
    body.frequency.setValueAtTime(180, t0);
    body.frequency.exponentialRampToValueAtTime(90, t0 + 0.055);

    bodyGain.gain.setValueAtTime(0.0001, t0);
    bodyGain.gain.exponentialRampToValueAtTime(0.09 * s, t0 + 0.008);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);

    body.connect(bodyGain);
    bodyGain.connect(master);

    const tip = ctx.createOscillator();
    const tipGain = ctx.createGain();
    tip.type = "triangle";
    tip.frequency.setValueAtTime(1450 + Math.random() * 500, t0);

    tipGain.gain.setValueAtTime(0.0001, t0);
    tipGain.gain.exponentialRampToValueAtTime(0.035 * s, t0 + 0.003);
    tipGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.026);

    tip.connect(tipGain);
    tipGain.connect(master);

    const noiseBuf = ctx.createBuffer(
      1,
      Math.floor(ctx.sampleRate * 0.035),
      ctx.sampleRate
    );

    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      ch[i] = (Math.random() * 2 - 1) * 0.35;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 850;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2300 + Math.random() * 1200;
    bp.Q.value = 1.4;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.022 * s, t0 + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);

    noise.connect(hp);
    hp.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(master);

    body.start(t0);
    tip.start(t0);
    noise.start(t0);

    body.stop(t0 + 0.11);
    tip.stop(t0 + 0.04);
    noise.stop(t0 + 0.04);
  };

  const chalkStart = () => {
    startIfNeeded();

    const ctx = ctxRef.current;
    const g = chalkGainRef.current;
    const body = bodyGainRef.current;
    if (!ctx || !g || !body) return;

    const t = ctx.currentTime;

    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.setTargetAtTime(0.014, t, 0.014);

    body.gain.cancelScheduledValues(t);
    body.gain.setValueAtTime(body.gain.value, t);
    body.gain.setTargetAtTime(0.0035, t, 0.025);
  };

  const chalkMove = (speed01: number, pressure01: number) => {
    startIfNeeded();

    const ctx = ctxRef.current;
    const g = chalkGainRef.current;
    const bp = bpRef.current;
    const hp = hpRef.current;
    const lp = lpRef.current;
    const lfo = lfoRef.current;
    const lfoG = lfoGainRef.current;
    const body = bodyGainRef.current;

    if (!ctx || !g || !bp || !hp || !lp || !lfo || !lfoG || !body) return;

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const s = clamp01(speed01);
    const p = clamp01(pressure01);

    const powder = Math.max(0, Math.min(1, p * 1.2 + (1 - s) * 0.45));
    const snag = Math.random() < 0.09 + powder * 0.08 ? 1 : 0;
    const squeak = Math.random() < 0.025 + p * 0.025 ? 1 : 0;
    const jitter = 0.82 + Math.random() * 0.34;

    const amp =
      0.01 +
      0.04 * s +
      0.09 * p +
      0.075 * powder +
      0.09 * snag;

    const center =
      (950 + 1300 * s + 650 * powder + 2300 * squeak - 420 * p) *
      jitter;

    const q = 0.75 + 1.2 * powder + 3.5 * squeak;

    const hpFreq = 320 + 680 * s + 260 * squeak;
    const lpFreq = squeak ? 7800 : 4300 + 2200 * (1 - powder);

    const gateDepth =
      0.22 + 0.5 * powder + 0.22 * Math.random() + 0.25 * snag;

    const lfoHz = snag ? 4 + Math.random() * 7 : 10 + Math.random() * 30;

    const bodyAmp = 0.003 + 0.018 * p + 0.012 * powder + 0.018 * snag;

    const t = ctx.currentTime;

    bp.frequency.setTargetAtTime(center, t, 0.018);
    bp.Q.setTargetAtTime(q, t, 0.025);
    hp.frequency.setTargetAtTime(hpFreq, t, 0.025);
    lp.frequency.setTargetAtTime(lpFreq, t, 0.025);
    lfo.frequency.setTargetAtTime(lfoHz, t, 0.035);
    lfoG.gain.setTargetAtTime(gateDepth, t, 0.035);
    g.gain.setTargetAtTime(amp, t, 0.016);
    body.gain.setTargetAtTime(bodyAmp, t, 0.035);
  };

  const chalkEnd = () => {
    const ctx = ctxRef.current;
    const g = chalkGainRef.current;
    const body = bodyGainRef.current;
    if (!ctx || !g || !body) return;

    const t = ctx.currentTime;

    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.035);

    body.gain.cancelScheduledValues(t);
    body.gain.setValueAtTime(body.gain.value, t);
    body.gain.linearRampToValueAtTime(0.0001, t + 0.045);

    window.setTimeout(() => {
      const nowCtx = ctxRef.current;
      if (!nowCtx || nowCtx !== ctx) return;

      const gg = chalkGainRef.current;
      const bb = bodyGainRef.current;

      if (gg) gg.gain.value = 0;
      if (bb) bb.gain.value = 0;
    }, 70);
  };

  return useMemo(
    () => ({
      chalkTap,
      chalkStart,
      chalkMove,
      chalkEnd,
      dispose,
    }),
    []
  );
}