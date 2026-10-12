import type { DrumSound, EngineConfig, InstrumentPreset } from '../types'

type StepCallback = (step: number) => void
type ErrorCallback = (message: string) => void

/**
 * A look-ahead Web Audio scheduler. UI timers only queue notes; audio timing comes
 * from AudioContext.currentTime so the sequencer does not depend on paint timing.
 */
export class AudioEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private timer: number | null = null
  private nextNoteTime = 0
  private currentStep = 0
  private config: EngineConfig | null = null
  private active = false
  private onStep: StepCallback = () => undefined
  private onError: ErrorCallback = () => undefined
  private noiseBuffer: AudioBuffer | null = null
  private scheduledSources = new Set<AudioScheduledSourceNode>()

  async initialize(): Promise<void> {
    if (!this.context) {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
      if (!AudioContextClass) throw new Error('Web Audio is not supported in this browser.')
      this.context = new AudioContextClass()
      this.master = this.context.createGain()
      this.master.gain.value = 0.82
      this.master.connect(this.context.destination)
      this.noiseBuffer = this.makeNoiseBuffer(this.context)
    }
    if (this.context.state === 'suspended') await this.context.resume()
  }

  update(config: EngineConfig): void {
    this.config = config
  }

  isPlaying(): boolean {
    return this.active
  }

  async play(config: EngineConfig, onStep: StepCallback, onError: ErrorCallback): Promise<void> {
    try {
      await this.initialize()
      this.config = config
      this.onStep = onStep
      this.onError = onError
      if (this.active || !this.context) return
      this.restoreOutput()
      this.active = true
      this.nextNoteTime = this.context.currentTime + 0.06
      this.schedule()
      this.timer = window.setInterval(() => this.schedule(), 25)
    } catch (error) {
      this.onError(error instanceof Error ? error.message : 'Could not start the audio engine.')
    }
  }

  stop(): void {
    this.pause()
    this.currentStep = 0
  }

  pause(): void {
    this.active = false
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    if (this.context && this.master) {
      this.master.gain.cancelScheduledValues(this.context.currentTime)
      this.master.gain.setValueAtTime(0.0001, this.context.currentTime)
    }
    for (const source of this.scheduledSources) {
      try { source.stop() } catch { /* source has already ended */ }
    }
    this.scheduledSources.clear()
  }

  async preview(sound: DrumSound): Promise<void> {
    try {
      await this.initialize()
      this.restoreOutput()
      if (this.context) this.playDrum(sound, this.context.currentTime, 0.9, 0, 0)
    } catch (error) {
      this.onError(error instanceof Error ? error.message : 'Could not preview this sound.')
    }
  }

  async previewInstrument(instrument: InstrumentPreset, pitch = 60): Promise<void> {
    try {
      await this.initialize()
      this.restoreOutput()
      if (this.context) this.playInstrument(instrument, pitch, this.context.currentTime, 0.82, 0, 0.72)
    } catch (error) {
      this.onError(error instanceof Error ? error.message : 'Could not preview this instrument.')
    }
  }

  dispose(): void {
    this.stop()
    void this.context?.close()
    this.context = null
    this.master = null
  }

  private schedule(): void {
    if (!this.context || !this.config || !this.active) return
    const scheduleAheadSeconds = 0.12
    while (this.nextNoteTime < this.context.currentTime + scheduleAheadSeconds) {
      this.scheduleStep(this.currentStep, this.nextNoteTime)
      this.advanceStep()
    }
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.config) return
    const hasSolo = [...this.config.tracks, ...this.config.instruments].some((track) => track.solo)
    for (const track of this.config.tracks) {
      const sequenceStep = track.pattern.steps[step % track.pattern.steps.length]
      if (sequenceStep?.active && !track.muted && (!hasSolo || track.solo)) {
        this.playDrum(track.sound, time, sequenceStep.velocity * track.volume, track.pan, 0)
      }
    }
    for (const track of this.config.instruments) {
      if (track.muted || (hasSolo && !track.solo)) continue
      for (const note of track.notes) {
        if (note.startStep === step) {
          this.playInstrument(track.instrument, note.pitch, time, note.velocity * track.volume, track.pan, note.lengthSteps * 60 / this.config.tempo / 4)
        }
      }
    }
    if (this.config.metronome && step % 4 === 0) this.click(time, step % 16 === 0)
    window.setTimeout(() => this.onStep(step), Math.max(0, (time - (this.context?.currentTime ?? time)) * 1000))
  }

  private advanceStep(): void {
    if (!this.config) return
    const secondsPerStep = 60 / this.config.tempo / 4
    // Lengthen the first half of each pair and shorten the second by the same
    // amount. This creates swing without changing the bar's total duration.
    const swingAmount = (this.config.swing / 100) * 0.45
    const swingMultiplier = this.currentStep % 2 === 0 ? 1 + swingAmount : 1 - swingAmount
    this.nextNoteTime += secondsPerStep * swingMultiplier
    this.currentStep = (this.currentStep + 1) % 16
  }

  private createVoice(gainValue: number, pan: number, time: number): { gain: GainNode; panner: StereoPannerNode } | null {
    if (!this.context || !this.master) return null
    const gain = this.context.createGain()
    const panner = this.context.createStereoPanner()
    gain.gain.setValueAtTime(Math.max(0.0001, gainValue), time)
    panner.pan.setValueAtTime(pan, time)
    gain.connect(panner).connect(this.master)
    return { gain, panner }
  }

  private playDrum(sound: DrumSound, time: number, velocity: number, pan: number, _pitch: number): void {
    if (!this.context || !this.master) return
    if (sound === 'kick') {
      const voice = this.createVoice(velocity * 0.9, pan, time)
      if (!voice) return
      const oscillator = this.context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(145, time)
      oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.15)
      voice.gain.gain.setValueAtTime(velocity * 0.9, time)
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.42)
      oscillator.connect(voice.gain)
      this.registerSource(oscillator)
      oscillator.start(time)
      oscillator.stop(time + 0.43)
      return
    }

    const voice = this.createVoice(velocity * (sound === 'hihat' ? 0.28 : 0.58), pan, time)
    if (!voice || !this.noiseBuffer) return
    const noise = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = sound === 'hihat' ? 6500 : sound === 'clap' ? 1250 : 1050
    noise.buffer = this.noiseBuffer
    const length = sound === 'hihat' ? 0.065 : sound === 'clap' ? 0.18 : 0.16
    voice.gain.gain.setValueAtTime(velocity * (sound === 'hihat' ? 0.28 : 0.58), time)
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, time + length)
    noise.connect(filter).connect(voice.gain)
    this.registerSource(noise)
    noise.start(time)
    noise.stop(time + length + 0.01)

    if (sound === 'snare') {
      const tone = this.context.createOscillator()
      tone.type = 'triangle'
      tone.frequency.setValueAtTime(185, time)
      const toneGain = this.context.createGain()
      toneGain.gain.setValueAtTime(velocity * 0.22, time)
      toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08)
      tone.connect(toneGain).connect(voice.panner)
      this.registerSource(tone)
      tone.start(time)
      tone.stop(time + 0.09)
    }
  }

  private click(time: number, accent: boolean): void {
    if (!this.context || !this.master) return
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.frequency.value = accent ? 1300 : 920
    gain.gain.setValueAtTime(accent ? 0.09 : 0.05, time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04)
    osc.connect(gain).connect(this.master)
    this.registerSource(osc)
    osc.start(time)
    osc.stop(time + 0.05)
  }

  private playInstrument(instrument: InstrumentPreset, midiNote: number, time: number, velocity: number, pan: number, duration: number): void {
    if (!this.context || !this.master) return
    const voice = this.createVoice(Math.max(0.0001, velocity * 0.62), pan, time)
    if (!voice) return
    const oscillator = this.context.createOscillator()
    const filter = this.context.createBiquadFilter()
    const config: Record<InstrumentPreset, { type: OscillatorType; cutoff: number; attack: number; release: number; level: number }> = {
      keys: { type: 'triangle', cutoff: 3600, attack: 0.012, release: 0.28, level: 0.5 },
      bass: { type: 'sawtooth', cutoff: 720, attack: 0.008, release: 0.18, level: 0.46 },
      pad: { type: 'sine', cutoff: 1800, attack: 0.16, release: 0.62, level: 0.43 },
      lead: { type: 'square', cutoff: 2700, attack: 0.01, release: 0.22, level: 0.32 },
    }
    const preset = config[instrument]
    const length = Math.max(0.09, duration)
    oscillator.type = preset.type
    oscillator.frequency.setValueAtTime(440 * 2 ** ((midiNote - 69) / 12), time)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(preset.cutoff, time)
    filter.Q.value = instrument === 'lead' ? 1.3 : 0.65
    voice.gain.gain.cancelScheduledValues(time)
    voice.gain.gain.setValueAtTime(0.0001, time)
    voice.gain.gain.linearRampToValueAtTime(Math.max(0.0001, velocity * preset.level), time + preset.attack)
    voice.gain.gain.setValueAtTime(Math.max(0.0001, velocity * preset.level * (instrument === 'pad' ? 0.72 : 0.58)), time + Math.max(preset.attack, length - preset.release))
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, time + length + preset.release)
    oscillator.connect(filter).connect(voice.gain)
    this.registerSource(oscillator)
    oscillator.start(time)
    oscillator.stop(time + length + preset.release + 0.01)
  }

  private makeNoiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.45), context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1
    return buffer
  }

  private restoreOutput(): void {
    if (!this.context || !this.master) return
    this.master.gain.cancelScheduledValues(this.context.currentTime)
    this.master.gain.setValueAtTime(0.0001, this.context.currentTime)
    this.master.gain.linearRampToValueAtTime(0.82, this.context.currentTime + 0.008)
  }

  private registerSource(source: AudioScheduledSourceNode): void {
    this.scheduledSources.add(source)
    source.onended = () => this.scheduledSources.delete(source)
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
