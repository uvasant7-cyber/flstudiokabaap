import type { DrumSound, DrumTrack, InstrumentPreset, InstrumentTrack, MidiNote, Project, Step } from '../types'

export const PROJECT_STORAGE_KEY = 'beatforge-ai-project-v1'

const colors: Record<DrumSound, string> = {
  kick: '#b485ff',
  snare: '#ff8b6b',
  hihat: '#ffcf5a',
  clap: '#55d8c1',
}

const soundNames: Record<DrumSound, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hihat: 'Hi-hat',
  clap: 'Clap',
}

export const instrumentDetails: Record<InstrumentPreset, { name: string; color: string; category: string; description: string }> = {
  keys: { name: 'Studio Keys', color: '#58b9ff', category: 'Keyboard', description: 'A bright, compact polyphonic keyboard tone.' },
  bass: { name: 'Deep Bass', color: '#a685ff', category: 'Bass', description: 'A focused low synth for simple basslines.' },
  pad: { name: 'Air Pad', color: '#5ad7bf', category: 'Pads & Synths', description: 'A soft sustained pad for wide chords.' },
  lead: { name: 'Neon Lead', color: '#ff9d62', category: 'Leads', description: 'A clear lead synth for melodies.' },
}

const createSteps = (activeSteps: number[], length = 16): Step[] =>
  Array.from({ length }, (_, index) => ({
    active: activeSteps.includes(index),
    velocity: index % 4 === 0 ? 1 : 0.76,
  }))

export function createDrumTrack(sound: DrumSound, activeSteps: number[], length = 16): DrumTrack {
  const id = `track-${sound}-${crypto.randomUUID()}`
  return {
    id,
    name: soundNames[sound],
    color: colors[sound],
    sound,
    volume: sound === 'hihat' ? 0.62 : 0.82,
    pan: 0,
    muted: false,
    solo: false,
    pattern: { id: `pattern-${id}`, name: `${soundNames[sound]} Pattern`, length, steps: createSteps(activeSteps, length) },
  }
}

export function createInstrumentTrack(instrument: InstrumentPreset): InstrumentTrack {
  const detail = instrumentDetails[instrument]
  return {
    id: `instrument-${instrument}-${crypto.randomUUID()}`,
    name: detail.name,
    color: detail.color,
    instrument,
    volume: instrument === 'bass' ? 0.7 : 0.62,
    pan: 0,
    muted: false,
    solo: false,
    notes: [],
  }
}

export function createProject(name = 'Untitled Beat'): Project {
  const now = new Date().toISOString()
  return {
    version: 1,
    id: crypto.randomUUID(),
    name,
    tempo: 92,
    timeSignature: [4, 4],
    swing: 0,
    mode: 'beginner',
    tracks: [
      createDrumTrack('kick', []),
      createDrumTrack('snare', []),
      createDrumTrack('hihat', []),
      createDrumTrack('clap', []),
    ],
    instrumentTracks: [createInstrumentTrack('keys')],
    lesson: { lessonId: 'first-beat', completedSteps: [], dismissed: false },
    createdAt: now,
    updatedAt: now,
  }
}

export function trapTemplate(): Project {
  const project = createProject('Midnight Trap Starter')
  project.tempo = 140
  project.swing = 11
  project.tracks = [
    createDrumTrack('kick', [0, 3, 6, 10, 12, 14]),
    createDrumTrack('snare', [4, 12]),
    createDrumTrack('hihat', Array.from({ length: 16 }, (_, index) => index)),
    createDrumTrack('clap', [12]),
  ]
  project.instrumentTracks = [createInstrumentTrack('bass')]
  project.instrumentTracks[0].notes = createNotes([
    [36, 0, 3], [36, 6, 2], [43, 8, 3], [41, 12, 3],
  ])
  return project
}

export function lofiTemplate(): Project {
  const project = createProject('Dusty Lo-Fi Starter')
  project.tempo = 78
  project.swing = 18
  project.tracks = [
    createDrumTrack('kick', [0, 6, 8, 11]),
    createDrumTrack('snare', [4, 12]),
    createDrumTrack('hihat', [2, 6, 10, 14]),
    createDrumTrack('clap', [12]),
  ]
  project.instrumentTracks = [createInstrumentTrack('keys')]
  project.instrumentTracks[0].notes = createNotes([
    [60, 0, 3], [63, 4, 3], [67, 8, 3], [63, 12, 3],
  ])
  return project
}

function createNotes(entries: Array<[number, number, number]>): MidiNote[] {
  return entries.map(([pitch, startStep, lengthSteps]) => ({ id: crypto.randomUUID(), pitch, startStep, lengthSteps, velocity: 0.72 }))
}

function isStep(value: unknown): value is Step {
  return Boolean(value && typeof value === 'object' && typeof (value as Step).active === 'boolean' && typeof (value as Step).velocity === 'number')
}

function isMidiNote(value: unknown): value is MidiNote {
  return Boolean(value && typeof value === 'object'
    && typeof (value as MidiNote).id === 'string'
    && typeof (value as MidiNote).pitch === 'number'
    && typeof (value as MidiNote).startStep === 'number'
    && typeof (value as MidiNote).lengthSteps === 'number'
    && typeof (value as MidiNote).velocity === 'number')
}

function isInstrumentTrack(value: unknown): value is InstrumentTrack {
  return Boolean(value && typeof value === 'object'
    && typeof (value as InstrumentTrack).id === 'string'
    && typeof (value as InstrumentTrack).name === 'string'
    && Object.keys(instrumentDetails).includes((value as InstrumentTrack).instrument)
    && Array.isArray((value as InstrumentTrack).notes)
    && (value as InstrumentTrack).notes.every(isMidiNote))
}

export function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Project>
  return candidate.version === 1
    && typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.tempo === 'number'
    && Array.isArray(candidate.tracks)
    && candidate.tracks.every((track) => typeof track.id === 'string'
      && typeof track.name === 'string'
      && Array.isArray(track.pattern?.steps)
      && track.pattern.steps.every(isStep))
    && (candidate.instrumentTracks === undefined || (Array.isArray(candidate.instrumentTracks) && candidate.instrumentTracks.every(isInstrumentTrack)))
}

export function loadStoredProject(): Project | null {
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isProject(parsed) ? { ...parsed, instrumentTracks: parsed.instrumentTracks ?? [] } : null
  } catch {
    return null
  }
}

export function saveProject(project: Project): boolean {
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({ ...project, updatedAt: new Date().toISOString() }))
    return true
  } catch {
    return false
  }
}

export function downloadProject(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(blob)
  anchor.download = `${safeFilename(project.name)}.beatforge.json`
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}

export function safeFilename(value: string): string {
  return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'beatforge-project'
}
