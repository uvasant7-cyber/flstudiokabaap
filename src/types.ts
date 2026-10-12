export type Mode = 'beginner' | 'creator' | 'pro'
export type DrumSound = 'kick' | 'snare' | 'hihat' | 'clap'
export type InstrumentPreset = 'keys' | 'bass' | 'pad' | 'lead'

export interface Step {
  active: boolean
  velocity: number
}

export interface Pattern {
  id: string
  name: string
  length: number
  steps: Step[]
}

export interface DrumTrack {
  id: string
  name: string
  color: string
  sound: DrumSound
  volume: number
  pan: number
  muted: boolean
  solo: boolean
  pattern: Pattern
}

export interface MidiNote {
  id: string
  pitch: number
  startStep: number
  lengthSteps: number
  velocity: number
}

export interface InstrumentTrack {
  id: string
  name: string
  color: string
  instrument: InstrumentPreset
  volume: number
  pan: number
  muted: boolean
  solo: boolean
  notes: MidiNote[]
}

export type ProjectTrack = DrumTrack | InstrumentTrack

export function isInstrumentTrack(track: ProjectTrack): track is InstrumentTrack {
  return 'instrument' in track
}

export interface LessonProgress {
  lessonId: string
  completedSteps: string[]
  dismissed: boolean
}

export interface Project {
  version: 1
  id: string
  name: string
  tempo: number
  timeSignature: [number, number]
  swing: number
  mode: Mode
  tracks: DrumTrack[]
  instrumentTracks: InstrumentTrack[]
  lesson: LessonProgress
  createdAt: string
  updatedAt: string
}

export interface EngineConfig {
  tempo: number
  swing: number
  tracks: DrumTrack[]
  instruments: InstrumentTrack[]
  metronome: boolean
}
