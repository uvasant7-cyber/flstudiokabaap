import { type ChangeEvent, type CSSProperties, type FormEvent, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft, BookOpen, Bot, ChevronDown, CircleHelp, CircleStop, Clock3, Download,
  Drum, FileAudio, FolderOpen, Headphones, History, House, Layers3, LibraryBig, ListMusic,
  Maximize2, Mic2, Music2, Pause, Piano, Play, Plus, Redo2, RotateCcw,
  PanelRightClose, PanelRightOpen, Save, Search, Send, Settings2, SlidersHorizontal, Sparkles, Volume2, VolumeX, WandSparkles,
} from 'lucide-react'
import { AudioEngine } from './audio/AudioEngine'
import { BeatbotMark } from './components/BeatbotMark'
import { createInstrumentTrack, createProject, downloadProject, instrumentDetails, isProject, loadStoredProject, lofiTemplate, saveProject, trapTemplate } from './lib/project'
import { isInstrumentTrack, type DrumSound, type DrumTrack, type InstrumentPreset, type InstrumentTrack, type MidiNote, type Mode, type Project, type ProjectTrack } from './types'

type Screen = 'home' | 'studio'
type WorkspaceView = 'arrangement' | 'patterns' | 'piano' | 'instruments' | 'library' | 'mixer' | 'tutorials' | 'settings'
type Snapshot = Project
type ProposalAction = 'hihat-foundation' | 'hihat-pickup' | 'kick-foundation'
type NavId = WorkspaceView | 'home' | 'projects'

interface BeatbotMessage {
  role: 'assistant' | 'user'
  text: string
}

interface BeatbotProposal {
  title: string
  detail: string
  affected: string
  action: ProposalAction
  previewSound: DrumSound
}

interface NavigationItem {
  id: NavId
  label: string
  icon: LucideIcon
  group: string
}

const modeCopy: Record<Mode, string> = {
  beginner: 'Essential creation controls with simple explanations.',
  creator: 'A focused workspace for building and shaping patterns.',
  pro: 'Detailed project, arrangement, and mix controls are visible.',
}

const navItems: readonly NavigationItem[] = [
  { id: 'home', label: 'Home', icon: House, group: 'project' },
  { id: 'projects', label: 'Projects', icon: FolderOpen, group: 'project' },
  { id: 'library', label: 'Sound Library', icon: LibraryBig, group: 'tools' },
  { id: 'instruments', label: 'Instruments', icon: Piano, group: 'tools' },
  { id: 'mixer', label: 'Mixer', icon: SlidersHorizontal, group: 'tools' },
  { id: 'tutorials', label: 'Tutorials', icon: BookOpen, group: 'learn' },
] as const

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function completedLessonSteps(project: Project, isPlaying: boolean): string[] {
  const complete: string[] = []
  if (project.tracks.find((track) => track.sound === 'kick')?.pattern.steps.some((step) => step.active)) complete.push('kick')
  if (project.tracks.find((track) => track.sound === 'snare')?.pattern.steps.some((step) => step.active)) complete.push('snare')
  if (project.tracks.find((track) => track.sound === 'hihat')?.pattern.steps.some((step) => step.active)) complete.push('hats')
  if (isPlaying) complete.push('play')
  return complete
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export default function App() {
  const [project, setProject] = useState<Project>(() => loadStoredProject() ?? createProject())
  const [screen, setScreen] = useState<Screen>(() => (loadStoredProject() ? 'studio' : 'home'))
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [playing, setPlaying] = useState(false)
  const [metronome, setMetronome] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [activeView, setActiveView] = useState<WorkspaceView>('arrangement')
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [beatbotOpen, setBeatbotOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(false)
  const [beatbotMessages, setBeatbotMessages] = useState<BeatbotMessage[]>([{ role: 'assistant', text: "Hey! I'm BEATBOT. Let's make something great." }])
  const [proposal, setProposal] = useState<BeatbotProposal | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const engine = useRef<AudioEngine | null>(null)
  const projectRef = useRef(project)

  if (!engine.current) engine.current = new AudioEngine()

  const allTracks = useMemo<ProjectTrack[]>(() => [...project.tracks, ...project.instrumentTracks], [project.tracks, project.instrumentTracks])
  const engineConfig = useMemo(() => ({ tempo: project.tempo, swing: project.swing, tracks: project.tracks, instruments: project.instrumentTracks, metronome }), [project.tempo, project.swing, project.tracks, project.instrumentTracks, metronome])
  const selectedTrack = allTracks.find((track) => track.id === selectedTrackId) ?? null
  const lessonSteps = completedLessonSteps(project, playing)

  useEffect(() => { engine.current?.update(engineConfig) }, [engineConfig])
  useEffect(() => { if (!playing) setPlayhead(0) }, [playing])
  useEffect(() => () => engine.current?.dispose(), [])
  useEffect(() => {
    const timer = window.setTimeout(() => saveProject(project), 350)
    return () => window.clearTimeout(timer)
  }, [project])

  function changeProject(change: (current: Project) => Project, record = true): void {
    const current = projectRef.current
    if (record) {
      setHistory((items) => [...items.slice(-39), clone(current)])
      setFuture([])
    }
    const next = { ...change(current), updatedAt: new Date().toISOString() }
    projectRef.current = next
    setProject(next)
  }

  function chooseProject(next: Project): void {
    engine.current?.stop()
    setPlaying(false)
    projectRef.current = next
    setProject(next)
    setHistory([])
    setFuture([])
    setSelectedTrackId(null)
    setScreen('studio')
    setActiveView('arrangement')
    setNotice(`Opened ${next.name}.`)
  }

  async function startPlayback(): Promise<void> {
    if (playing) return
    await engine.current?.play(engineConfig, (step) => setPlayhead(step), (message) => setNotice(message))
    setPlaying(engine.current?.isPlaying() ?? false)
  }

  function pausePlayback(): void {
    engine.current?.pause()
    setPlaying(false)
  }

  function stopPlayback(): void {
    engine.current?.stop()
    setPlaying(false)
    setPlayhead(0)
  }

  function undo(): void {
    const previous = history.at(-1)
    if (!previous) return
    setFuture((items) => [clone(projectRef.current), ...items])
    setHistory((items) => items.slice(0, -1))
    projectRef.current = previous
    setProject(previous)
  }

  function redo(): void {
    const next = future[0]
    if (!next) return
    setHistory((items) => [...items, clone(projectRef.current)])
    setFuture((items) => items.slice(1))
    projectRef.current = next
    setProject(next)
  }

  function updateTrack(trackId: string, update: (track: DrumTrack) => DrumTrack): void {
    changeProject((current) => ({ ...current, tracks: current.tracks.map((track) => track.id === trackId ? update(track) : track) }))
  }

  function updateInstrument(trackId: string, update: (track: InstrumentTrack) => InstrumentTrack): void {
    changeProject((current) => ({ ...current, instrumentTracks: current.instrumentTracks.map((track) => track.id === trackId ? update(track) : track) }))
  }

  function addInstrument(instrument: InstrumentPreset): void {
    const track = createInstrumentTrack(instrument)
    changeProject((current) => ({ ...current, instrumentTracks: [...current.instrumentTracks, track] }))
    setSelectedTrackId(track.id)
    setActiveView('piano')
    setNotice(`${track.name} added. Place notes in Piano Roll.`)
  }

  function toggleStep(trackId: string, stepIndex: number): void {
    updateTrack(trackId, (track) => ({ ...track, pattern: { ...track.pattern, steps: track.pattern.steps.map((step, index) => index === stepIndex ? { ...step, active: !step.active } : step) } }))
  }

  function changeVelocity(trackId: string, stepIndex: number, velocity: number): void {
    updateTrack(trackId, (track) => ({ ...track, pattern: { ...track.pattern, steps: track.pattern.steps.map((step, index) => index === stepIndex ? { ...step, velocity } : step) } }))
  }

  function toggleMute(trackId: string): void {
    if (projectRef.current.tracks.some((track) => track.id === trackId)) updateTrack(trackId, (track) => ({ ...track, muted: !track.muted }))
    else updateInstrument(trackId, (track) => ({ ...track, muted: !track.muted }))
  }
  function toggleSolo(trackId: string): void {
    if (projectRef.current.tracks.some((track) => track.id === trackId)) updateTrack(trackId, (track) => ({ ...track, solo: !track.solo }))
    else updateInstrument(trackId, (track) => ({ ...track, solo: !track.solo }))
  }

  function applyMode(mode: Mode): void { changeProject((current) => ({ ...current, mode })) }
  function openImport(): void { importInput.current?.click() }

  async function importProject(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 2_000_000 || !file.name.toLowerCase().endsWith('.json')) {
      setNotice('Choose a valid Beatforge .json project smaller than 2 MB.')
      return
    }
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isProject(parsed)) throw new Error('Invalid project')
      chooseProject({ ...parsed, instrumentTracks: parsed.instrumentTracks ?? [] })
    } catch {
      setNotice('This file is not a valid Beatforge project.')
    }
  }

  function handleNav(id: NavId): void {
    if (id === 'home' || id === 'projects') { stopPlayback(); setScreen('home'); return }
    setActiveView(id as WorkspaceView)
    if (id === 'tutorials') setBeatbotOpen(false)
  }

  function suggestionFor(text: string): { reply: string; nextProposal: BeatbotProposal | null } {
    const input = text.toLowerCase()
    const activeHits = project.tracks.reduce((total, track) => total + track.pattern.steps.filter((step) => step.active).length, 0)
    if (/drum|hat|beat|variation/.test(input)) {
      const hatTrack = project.tracks.find((track) => track.sound === 'hihat')
      const hasHats = Boolean(hatTrack?.pattern.steps.some((step) => step.active))
      return {
        reply: hasHats
          ? 'I found an existing hi-hat pattern. I can add a single pickup before the loop restarts without replacing your current hits.'
          : 'Your hi-hat lane is empty. I can add an editable eighth-note foundation while leaving every other track unchanged.',
        nextProposal: {
          title: hasHats ? 'Add a hi-hat pickup' : 'Add an eighth-note hi-hat foundation',
          detail: hasHats ? 'Adds one low-velocity hi-hat on step 16.' : 'Activates eight evenly spaced hi-hats at a comfortable velocity.',
          affected: hatTrack?.name ?? 'Hi-hat',
          action: hasHats ? 'hihat-pickup' : 'hihat-foundation',
          previewSound: 'hihat',
        },
      }
    }
    if (/create|start|rap|trap/.test(input)) {
      return {
        reply: `This project is at ${project.tempo} BPM with ${activeHits} active drum hits. I can add a four-beat kick foundation; it only adds missing hits, so your work stays intact.`,
        nextProposal: { title: 'Add a kick foundation', detail: 'Adds kick hits on steps 1, 5, 9, and 13 without clearing existing steps.', affected: 'Kick', action: 'kick-foundation', previewSound: 'kick' },
      }
    }
    if (/mix|loud|volume/.test(input)) {
      const muted = project.tracks.filter((track) => track.muted).map((track) => track.name)
      return { reply: muted.length ? `${muted.join(', ')} ${muted.length === 1 ? 'is' : 'are'} muted. The current Phase 1 mixer gives each drum lane real volume, pan, mute, and solo controls; EQ and compression are not available yet.` : 'All drum lanes are audible. Use Mixer to balance their real playback volumes. EQ and compression are not available yet, so I will not pretend to process your mix.', nextProposal: null }
    }
    if (/learn|teach|next|help/.test(input)) {
      const next = ['kick', 'snare', 'hats', 'play'].find((step) => !lessonSteps.includes(step))
      return { reply: next === 'kick' ? 'Start by placing a kick on steps 1, 5, 9, and 13. Those are the first pulse points in this 16-step grid.' : next === 'snare' ? 'Great foundation. Add a snare on steps 5 and 13 to make the backbeat easy to hear.' : next === 'hats' ? 'Now add hi-hats between the larger hits. Start every other step, then experiment.' : next === 'play' ? 'Your drum parts are in place. Press Play and listen for one small change you would like to make.' : 'Your first drum-beat lesson is complete. Try a template from Home, or open Mixer to balance the lanes.', nextProposal: null }
    }
    return { reply: `I am running locally and can see ${selectedTrack ? `the selected ${selectedTrack.name} track` : 'your project'}. You can add playable Keys, Bass, Pad, and Lead tracks in Instruments, then edit their real MIDI notes in Piano Roll.`, nextProposal: null }
  }

  function sendBeatbotPrompt(text: string): void {
    const trimmed = text.trim()
    if (!trimmed) return
    const result = suggestionFor(trimmed)
    setBeatbotMessages((messages) => [...messages, { role: 'user', text: trimmed }, { role: 'assistant', text: result.reply }])
    setProposal(result.nextProposal)
  }

  function applyProposal(): void {
    if (!proposal) return
    const stepsByAction: Record<ProposalAction, number[]> = { 'hihat-foundation': [0, 2, 4, 6, 8, 10, 12, 14], 'hihat-pickup': [15], 'kick-foundation': [0, 4, 8, 12] }
    const targetSound: DrumSound = proposal.action === 'kick-foundation' ? 'kick' : 'hihat'
    const positions = stepsByAction[proposal.action]
    changeProject((current) => ({
      ...current,
      tracks: current.tracks.map((track) => track.sound !== targetSound ? track : ({ ...track, pattern: { ...track.pattern, steps: track.pattern.steps.map((step, index) => positions.includes(index) ? { ...step, active: true, velocity: Math.max(step.velocity, proposal.action === 'hihat-pickup' ? 0.45 : 0.72) } : step) } })),
    }))
    setBeatbotMessages((messages) => [...messages, { role: 'assistant', text: `Applied: ${proposal.title}. The change is editable and Undo is available in the transport bar.` }])
    setProposal(null)
  }

  if (screen === 'home') {
    const saved = loadStoredProject()
    return <Home savedProject={saved} onCreate={() => chooseProject(createProject())} onContinue={() => saved && chooseProject(saved)} onTemplate={(template) => chooseProject(template === 'trap' ? trapTemplate() : lofiTemplate())} onImport={openImport} inputRef={importInput} onFile={importProject} />
  }

  return (
    <main className={`daw-shell ${sidebarCompact ? 'sidebar-compact' : ''}`}>
      <Sidebar activeView={activeView} compact={sidebarCompact} onToggleCompact={() => setSidebarCompact((value) => !value)} onNav={handleNav} onOpenBeatbot={() => { setBeatbotOpen(true); setRightPanelOpen(true) }} beatbotOpen={beatbotOpen} />
      <div className="daw-frame">
        <TransportBar project={project} playing={playing} metronome={metronome} playhead={playhead} historyLength={history.length} futureLength={future.length} renameOpen={renameOpen} onRenameOpen={() => setRenameOpen(true)} onRename={(name) => { changeProject((current) => ({ ...current, name: name.trim() || current.name })); setRenameOpen(false) }} onStart={() => void startPlayback()} onPause={pausePlayback} onStop={stopPlayback} onMetronome={() => setMetronome((value) => !value)} onTempo={(tempo) => changeProject((current) => ({ ...current, tempo }))} onUndo={undo} onRedo={redo} onSave={() => setNotice(saveProject(project) ? 'Project saved locally.' : 'Could not save locally. Check browser storage settings.')} onExport={() => downloadProject(project)} />
        <section className="utilitybar">
          <div className="workspace-tabs" aria-label="Primary production workspace"><button className={activeView === 'arrangement' ? 'active' : ''} onClick={() => setActiveView('arrangement')}><Layers3 size={13} /> Arrangement</button><button className={activeView === 'patterns' ? 'active' : ''} onClick={() => setActiveView('patterns')}><ListMusic size={13} /> Step Sequencer</button><button className={activeView === 'piano' ? 'active' : ''} onClick={() => setActiveView('piano')}><Piano size={13} /> Piano Roll</button></div>
          <label className="swing-control"><span>Swing</span><input aria-label="Swing amount" type="range" min="0" max="30" value={project.swing} onChange={(event) => changeProject((current) => ({ ...current, swing: Number(event.target.value) }))} /><output>{project.swing}%</output></label>
          <div className="mode-switcher" aria-label="Workspace mode">{(Object.keys(modeCopy) as Mode[]).map((mode) => <button key={mode} className={project.mode === mode ? 'selected' : ''} onClick={() => applyMode(mode)}>{mode}</button>)}</div><span className="mode-summary">{modeCopy[project.mode]}</span><IconControl label={rightPanelOpen ? 'Hide inspector' : 'Show inspector'} active={rightPanelOpen} onClick={() => setRightPanelOpen((value) => !value)}>{rightPanelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}</IconControl>
        </section>
        <div className={`workspace-layout ${rightPanelOpen ? '' : 'right-panel-hidden'}`}>
          <section className="main-workspace">
            <WorkspaceContent view={activeView} project={project} playing={playing} playhead={playhead} selectedTrackId={selectedTrackId} onSelectTrack={setSelectedTrackId} onToggleStep={toggleStep} onVelocity={changeVelocity} onUpdateTrack={updateTrack} onUpdateInstrument={updateInstrument} onAddInstrument={addInstrument} onToggleMute={toggleMute} onToggleSolo={toggleSolo} onPreview={(sound) => void engine.current?.preview(sound)} onPreviewInstrument={(instrument, pitch) => void engine.current?.previewInstrument(instrument, pitch)} onOpenPatterns={() => setActiveView('patterns')} onUpdateProject={changeProject} />
          </section>
          {rightPanelOpen && <aside className="right-panel">
            {beatbotOpen
              ? <BeatbotPanel project={project} selectedTrack={selectedTrack} messages={beatbotMessages} proposal={proposal} onClose={() => setBeatbotOpen(false)} onClear={() => { setBeatbotMessages([{ role: 'assistant', text: "Hey! I'm BEATBOT. Let's make something great." }]); setProposal(null) }} onSend={sendBeatbotPrompt} onApply={applyProposal} onDismiss={() => setProposal(null)} onPreview={(sound) => void engine.current?.preview(sound)} />
              : <Inspector project={project} selectedTrack={selectedTrack} lessonSteps={lessonSteps} onUpdateTrack={updateTrack} onUpdateInstrument={updateInstrument} onSelectTutorials={() => setActiveView('tutorials')} onOpenBeatbot={() => setBeatbotOpen(true)} />}
          </aside>}
        </div>
        <StatusBar project={project} selectedTrack={selectedTrack} playing={playing} activeView={activeView} />
      </div>
      {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss message">Close</button></div>}
      <input ref={importInput} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void importProject(event)} />
    </main>
  )
}

function IconControl({ label, children, active = false, disabled = false, onClick, className = '' }: { label: string; children: React.ReactNode; active?: boolean; disabled?: boolean; onClick?: () => void; className?: string }) {
  return <button type="button" className={`icon-control ${active ? 'active' : ''} ${className}`} onClick={onClick} disabled={disabled} aria-label={label} title={label}>{children}</button>
}

function Sidebar({ activeView, compact, onToggleCompact, onNav, onOpenBeatbot, beatbotOpen }: { activeView: WorkspaceView; compact: boolean; onToggleCompact: () => void; onNav: (id: NavId) => void; onOpenBeatbot: () => void; beatbotOpen: boolean }) {
  let lastGroup = ''
  return <aside className="sidebar">
    <div className="sidebar-brand"><BeatbotMark size={27} /><span>BEATFORGE</span><button onClick={onToggleCompact} aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} title={compact ? 'Expand sidebar' : 'Collapse sidebar'}><Maximize2 size={14} /></button></div>
    <nav aria-label="Primary navigation">{navItems.map((item) => { const divider = item.group !== lastGroup; lastGroup = item.group; const Icon = item.icon; const active = item.id === activeView; return <div className={divider ? 'nav-section-start' : ''} key={item.id}><button className={`nav-item ${active ? 'active' : ''}`} onClick={() => onNav(item.id)} title={item.label}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span></button></div> })}</nav>
    <div className="sidebar-bottom"><button className={`beatbot-nav ${beatbotOpen ? 'active' : ''}`} onClick={onOpenBeatbot} title="Open BEATBOT AI"><BeatbotMark size={21} /><span>BEATBOT</span><Sparkles size={13} /></button><button className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => onNav('settings')} title="Settings"><Settings2 size={18} /><span>Settings</span></button></div>
  </aside>
}

function TransportBar({ project, playing, metronome, playhead, historyLength, futureLength, renameOpen, onRenameOpen, onRename, onStart, onPause, onStop, onMetronome, onTempo, onUndo, onRedo, onSave, onExport }: { project: Project; playing: boolean; metronome: boolean; playhead: number; historyLength: number; futureLength: number; renameOpen: boolean; onRenameOpen: () => void; onRename: (name: string) => void; onStart: () => void; onPause: () => void; onStop: () => void; onMetronome: () => void; onTempo: (tempo: number) => void; onUndo: () => void; onRedo: () => void; onSave: () => void; onExport: () => void }) {
  const position = `001:${Math.floor(playhead / 4) + 1}.${playhead % 4 + 1}`
  return <header className="transport-bar">
    <div className="project-identity">{renameOpen ? <input autoFocus aria-label="Project name" defaultValue={project.name} onBlur={(event) => onRename(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()} /> : <button onClick={onRenameOpen} title="Rename project"><strong>{project.name}</strong><ChevronDown size={14} /></button>}<span><Save size={11} /> Autosaved locally</span></div>
    <div className="transport-controls" aria-label="Transport controls"><IconControl label="Play" active={playing} onClick={onStart} className="play"><Play size={16} fill="currentColor" /></IconControl><IconControl label="Pause" disabled={!playing} onClick={onPause}><Pause size={15} /></IconControl><IconControl label="Stop" onClick={onStop}><CircleStop size={16} /></IconControl><IconControl label="Toggle metronome" active={metronome} onClick={onMetronome}><Clock3 size={15} /></IconControl></div>
    <div className="time-controls"><label><span>BPM</span><input aria-label="Tempo in beats per minute" type="number" min="40" max="240" value={project.tempo} onChange={(event) => onTempo(Math.max(40, Math.min(240, Number(event.target.value) || 40)))} /></label><div className="time-signature"><span>SIG</span><b>{project.timeSignature[0]}/{project.timeSignature[1]}</b></div><output aria-label="Current position">{position}</output></div>
    <div className="transport-actions"><span className="audio-status"><i /> Web Audio starts on Play</span><IconControl label="Undo" disabled={!historyLength} onClick={onUndo}><History size={16} /></IconControl><IconControl label="Redo" disabled={!futureLength} onClick={onRedo}><Redo2 size={16} /></IconControl><button className="export-button" onClick={onExport}><Download size={14} /> Export</button><IconControl label="Save project" onClick={onSave}><Save size={16} /></IconControl></div>
  </header>
}

function WorkspaceContent({ view, project, playing, playhead, selectedTrackId, onSelectTrack, onToggleStep, onVelocity, onUpdateTrack, onUpdateInstrument, onAddInstrument, onToggleMute, onToggleSolo, onPreview, onPreviewInstrument, onOpenPatterns, onUpdateProject }: { view: WorkspaceView; project: Project; playing: boolean; playhead: number; selectedTrackId: string | null; onSelectTrack: (id: string) => void; onToggleStep: (trackId: string, step: number) => void; onVelocity: (trackId: string, step: number, velocity: number) => void; onUpdateTrack: (trackId: string, update: (track: DrumTrack) => DrumTrack) => void; onUpdateInstrument: (trackId: string, update: (track: InstrumentTrack) => InstrumentTrack) => void; onAddInstrument: (instrument: InstrumentPreset) => void; onToggleMute: (trackId: string) => void; onToggleSolo: (id: string) => void; onPreview: (sound: DrumSound) => void; onPreviewInstrument: (instrument: InstrumentPreset, pitch?: number) => void; onOpenPatterns: () => void; onUpdateProject: (change: (current: Project) => Project) => void }) {
  if (view === 'library') return <SoundLibrary tracks={project.tracks} onPreview={onPreview} onPreviewInstrument={onPreviewInstrument} onAddInstrument={onAddInstrument} />
  if (view === 'instruments') return <InstrumentBrowser instrumentTracks={project.instrumentTracks} onAdd={onAddInstrument} onPreview={onPreviewInstrument} />
  if (view === 'mixer') return <Mixer tracks={[...project.tracks, ...project.instrumentTracks]} onSelect={onSelectTrack} onUpdateTrack={onUpdateTrack} onUpdateInstrument={onUpdateInstrument} onMute={onToggleMute} onSolo={onToggleSolo} />
  if (view === 'tutorials') return <Tutorials project={project} playing={playing} onOpenPatterns={onOpenPatterns} />
  if (view === 'settings') return <SettingsPanel project={project} onUpdateProject={onUpdateProject} />
  if (view === 'piano') return <PianoRoll instrumentTracks={project.instrumentTracks} selectedTrackId={selectedTrackId} onSelectTrack={onSelectTrack} onUpdateInstrument={onUpdateInstrument} onAddInstrument={onAddInstrument} onPreview={onPreviewInstrument} />
  if (view === 'patterns') return <StepSequencer project={project} playhead={playhead} selectedTrackId={selectedTrackId} onSelectTrack={onSelectTrack} onToggleStep={onToggleStep} onVelocity={onVelocity} onUpdateTrack={onUpdateTrack} onToggleMute={onToggleMute} onToggleSolo={onToggleSolo} onPreview={onPreview} />
  return <ArrangementView project={project} playhead={playhead} selectedTrackId={selectedTrackId} onSelectTrack={onSelectTrack} onOpenPatterns={onOpenPatterns} />
}

function ArrangementView({ project, playhead, selectedTrackId, onSelectTrack, onOpenPatterns }: { project: Project; playhead: number; selectedTrackId: string | null; onSelectTrack: (id: string) => void; onOpenPatterns: () => void }) {
  return <div className="arrangement-workspace arrangement-only"><div className="workspace-heading"><div><p className="section-kicker">ARRANGEMENT</p><h1>One-bar arrangement</h1><p>Pattern and MIDI clips both read the same saved project data used by playback.</p></div></div><Timeline tracks={[...project.tracks, ...project.instrumentTracks]} playhead={playhead} selectedTrackId={selectedTrackId} onSelect={onSelectTrack} /><div className="workspace-callout"><ListMusic size={17} /><div><b>Edit drums in Step Sequencer and melodies in Piano Roll</b><p>All timing and playback stay connected when you switch workspaces.</p></div><button className="primary-button" onClick={onOpenPatterns}>Open Step Sequencer</button></div></div>
}

function StepSequencer({ project, playhead, selectedTrackId, onSelectTrack, onToggleStep, onVelocity, onUpdateTrack, onToggleMute, onToggleSolo, onPreview }: { project: Project; playhead: number; selectedTrackId: string | null; onSelectTrack: (id: string) => void; onToggleStep: (trackId: string, step: number) => void; onVelocity: (trackId: string, step: number, velocity: number) => void; onUpdateTrack: (trackId: string, update: (track: DrumTrack) => DrumTrack) => void; onToggleMute: (trackId: string) => void; onToggleSolo: (id: string) => void; onPreview: (sound: DrumSound) => void }) {
  return <div className="arrangement-workspace sequencer-workspace"><div className="sequencer-header"><div><p className="section-kicker">STEP SEQUENCER</p><h1>Pattern 01</h1><p>Click a pad to place a hit. Active pads expose a velocity control underneath.</p></div><button className="text-action" onClick={() => project.tracks.forEach((track) => onUpdateTrack(track.id, (current) => ({ ...current, pattern: { ...current.pattern, steps: current.pattern.steps.map((step) => ({ ...step, active: false })) } })))}>Clear pattern</button></div><div className="step-grid-labels">{Array.from({ length: 16 }, (_, index) => <span key={index} className={index % 4 === 0 ? 'downbeat' : ''}>{index + 1}</span>)}</div><div className="track-rows">{project.tracks.map((track) => <TrackRow key={track.id} track={track} playhead={playhead} selected={track.id === selectedTrackId} onSelect={() => onSelectTrack(track.id)} onPreview={onPreview} onToggleStep={onToggleStep} onVelocity={onVelocity} onMute={onToggleMute} onSolo={onToggleSolo} />)}</div></div>
}

function PianoRoll({ instrumentTracks, selectedTrackId, onSelectTrack, onUpdateInstrument, onAddInstrument, onPreview }: { instrumentTracks: InstrumentTrack[]; selectedTrackId: string | null; onSelectTrack: (id: string) => void; onUpdateInstrument: (id: string, update: (track: InstrumentTrack) => InstrumentTrack) => void; onAddInstrument: (instrument: InstrumentPreset) => void; onPreview: (instrument: InstrumentPreset, pitch?: number) => void }) {
  const activeTrack = instrumentTracks.find((track) => track.id === selectedTrackId) ?? instrumentTracks[0] ?? null
  const pitches = Array.from({ length: 25 }, (_, index) => 72 - index)
  const noteName = (pitch: number) => `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][pitch % 12]}${Math.floor(pitch / 12) - 1}`
  const blackKey = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12)
  function toggleNote(pitch: number, startStep: number): void {
    if (!activeTrack) return
    onUpdateInstrument(activeTrack.id, (track) => {
      const existing = track.notes.find((note) => note.pitch === pitch && note.startStep === startStep)
      return existing
        ? { ...track, notes: track.notes.filter((note) => note.id !== existing.id) }
        : { ...track, notes: [...track.notes, { id: crypto.randomUUID(), pitch, startStep, lengthSteps: 1, velocity: 0.76 }] }
    })
  }
  if (!activeTrack) return <section className="content-panel piano-roll-empty"><div className="workspace-heading"><div><p className="section-kicker">PIANO ROLL</p><h1>MIDI note editor</h1><p>Add an instrument to begin writing notes that the audio engine can play.</p></div></div><div className="piano-empty-state"><Piano size={37} /><h2>No instrument track yet</h2><p>Add a playable instrument, then use this Piano Roll to create the MIDI notes used by transport playback.</p><div>{(Object.keys(instrumentDetails) as InstrumentPreset[]).map((preset) => <button key={preset} className="secondary-button" onClick={() => onAddInstrument(preset)}><Plus size={14} /> {instrumentDetails[preset].name}</button>)}</div></div></section>
  return <section className="content-panel piano-roll"><div className="workspace-heading"><div><p className="section-kicker">PIANO ROLL</p><h1>{activeTrack.name}</h1><p>Click a grid cell to add or remove a note. These notes are saved and played by the transport.</p></div><div className="piano-track-selector">{instrumentTracks.map((track) => <button key={track.id} className={track.id === activeTrack.id ? 'active' : ''} onClick={() => onSelectTrack(track.id)}><i style={{ background: track.color }} />{track.name}</button>)}<button className="add-instrument-mini" onClick={() => onAddInstrument('keys')} title="Add Studio Keys"><Plus size={14} /></button></div></div><div className="piano-roll-toolbar"><span><Piano size={14} /> {instrumentDetails[activeTrack.instrument].category}</span><button onClick={() => onPreview(activeTrack.instrument, 60)}><Play size={13} fill="currentColor" /> Preview</button><span>16 steps • 1 bar</span></div><div className="piano-editor" role="grid" aria-label={`${activeTrack.name} MIDI note editor`}><div className="piano-ruler">{Array.from({ length: 16 }, (_, index) => <span key={index} className={index % 4 === 0 ? 'downbeat' : ''}>{index + 1}</span>)}</div><div className="piano-note-rows">{pitches.map((pitch) => <div className="piano-row" key={pitch}><button className={`piano-key ${blackKey(pitch) ? 'black' : ''}`} onClick={() => onPreview(activeTrack.instrument, pitch)} title={`Preview ${noteName(pitch)}`}>{noteName(pitch)}</button>{Array.from({ length: 16 }, (_, startStep) => { const note = activeTrack.notes.find((item) => item.pitch === pitch && item.startStep === startStep); return <button key={startStep} className={`midi-cell ${note ? 'active' : ''} ${startStep % 4 === 0 ? 'downbeat' : ''}`} style={note ? { '--note-color': activeTrack.color } as CSSProperties : undefined} onClick={() => toggleNote(pitch, startStep)} aria-label={`${noteName(pitch)} at step ${startStep + 1}${note ? ', active' : ''}`} /> })}</div>)}</div></div></section>
}

function Timeline({ tracks, playhead, selectedTrackId, onSelect }: { tracks: ProjectTrack[]; playhead: number; selectedTrackId: string | null; onSelect: (id: string) => void }) {
  return <section className="timeline" aria-label="One bar arrangement timeline"><div className="timeline-ruler"><span>1.1</span><span>1.2</span><span>1.3</span><span>1.4</span></div>{tracks.map((track) => { const instrument = isInstrumentTrack(track); const clipName = instrument ? `${track.name} MIDI` : track.pattern.name; const clipMeta = instrument ? `${track.notes.length} notes` : '16 steps'; return <button key={track.id} className={`timeline-lane ${selectedTrackId === track.id ? 'selected' : ''}`} onClick={() => onSelect(track.id)}><span className="lane-label"><i style={{ background: track.color }} />{track.name}</span><span className={`timeline-clip ${instrument ? 'midi-clip' : ''}`} style={{ '--track-color': track.color } as CSSProperties}><b>{clipName}</b><small>{clipMeta}</small>{playhead >= 0 && <i className="timeline-playhead" style={{ left: `${(playhead / 16) * 100}%` }} />}</span></button> })}</section>
}

function TrackRow({ track, playhead, selected, onSelect, onPreview, onToggleStep, onVelocity, onMute, onSolo }: { track: DrumTrack; playhead: number; selected: boolean; onSelect: () => void; onPreview: (sound: DrumSound) => void; onToggleStep: (trackId: string, step: number) => void; onVelocity: (trackId: string, step: number, velocity: number) => void; onMute: (id: string) => void; onSolo: (id: string) => void }) {
  return <article className={`track-row ${selected ? 'selected' : ''}`} style={{ '--track-color': track.color } as CSSProperties}><div className="track-strip"><button className="sound-preview" onClick={() => onPreview(track.sound)} title={`Preview ${track.name}`}><Volume2 size={13} /></button><button className="track-title" onClick={onSelect}><span />{track.name}</button><button className={`small-toggle ${track.muted ? 'active' : ''}`} onClick={() => onMute(track.id)} title="Mute track">M</button><button className={`small-toggle solo ${track.solo ? 'active' : ''}`} onClick={() => onSolo(track.id)} title="Solo track">S</button></div><div className="steps" role="group" aria-label={`${track.name} pattern`}>{track.pattern.steps.map((step, index) => <div className={`step-wrap ${playhead === index ? 'current' : ''}`} key={index}><button className={`step ${step.active ? 'on' : ''} ${index % 4 === 0 ? 'downbeat' : ''}`} aria-label={`${track.name}, step ${index + 1}${step.active ? ', active' : ''}`} aria-pressed={step.active} onClick={() => onToggleStep(track.id, index)} />{step.active && <input className="velocity" aria-label={`${track.name} step ${index + 1} velocity`} type="range" min="0.2" max="1" step="0.05" value={step.velocity} onChange={(event) => onVelocity(track.id, index, Number(event.target.value))} />}</div>)}</div></article>
}

function SoundLibrary({ tracks, onPreview, onPreviewInstrument, onAddInstrument }: { tracks: DrumTrack[]; onPreview: (sound: DrumSound) => void; onPreviewInstrument: (instrument: InstrumentPreset, pitch?: number) => void; onAddInstrument: (instrument: InstrumentPreset) => void }) {
  type LibraryFilter = 'all' | 'kick' | 'snare' | 'hihat' | 'instruments' | 'bass' | 'keys' | 'synths'
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [query, setQuery] = useState('')
  const instrumentPresets = Object.keys(instrumentDetails) as InstrumentPreset[]
  const normalizedQuery = query.trim().toLowerCase()
  const visibleDrums = tracks.filter((track) => {
    if (filter === 'instruments' || filter === 'bass' || filter === 'keys' || filter === 'synths') return false
    const matchesCategory = filter === 'all' || filter === 'kick' && track.sound === 'kick' || filter === 'snare' && ['snare', 'clap'].includes(track.sound) || filter === 'hihat' && track.sound === 'hihat'
    return matchesCategory && track.name.toLowerCase().includes(normalizedQuery)
  })
  const visibleInstruments = instrumentPresets.filter((preset) => {
    const matchesCategory = filter === 'all' || filter === 'instruments' || filter === preset || filter === 'synths' && ['pad', 'lead'].includes(preset)
    const detail = instrumentDetails[preset]
    return matchesCategory && `${detail.name} ${detail.category}`.toLowerCase().includes(normalizedQuery)
  })
  const hasResults = visibleDrums.length + visibleInstruments.length > 0
  return <section className="content-panel library-workspace">
    <div className="workspace-heading"><div><p className="section-kicker">SOUND BROWSER</p><h1>Sound Library</h1><p>Original drum voices and playable synth instruments, organized by type.</p></div><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sounds" aria-label="Search sounds" /></label></div>
    <div className="library-layout"><aside className="library-tree"><b>PACKS</b><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All sounds</button><span>Drums</span><button className={filter === 'kick' ? 'active' : ''} onClick={() => setFilter('kick')}>Kicks & BassDrums</button><button className={filter === 'snare' ? 'active' : ''} onClick={() => setFilter('snare')}>Snares & Claps</button><button className={filter === 'hihat' ? 'active' : ''} onClick={() => setFilter('hihat')}>Hats & Percussion</button><span>Instruments</span><button className={filter === 'bass' ? 'active' : ''} onClick={() => setFilter('bass')}>Bass</button><button className={filter === 'keys' ? 'active' : ''} onClick={() => setFilter('keys')}>Keyboard</button><button className={filter === 'synths' ? 'active' : ''} onClick={() => setFilter('synths')}>Pads & Leads</button></aside><div className="sound-list"><div className="sound-list-head"><span>Sound</span><span>Type</span><span>Engine</span><span /></div>{visibleDrums.map((track) => <div className="sound-library-row" key={track.id}><span><i style={{ background: track.color }} /><b>{track.name}</b></span><span>Drum voice</span><span>Web Audio synth</span><button onClick={() => onPreview(track.sound)}><Play size={13} fill="currentColor" /> Preview</button></div>)}{visibleInstruments.map((preset) => <div className="sound-library-row" key={preset}><span><i style={{ background: instrumentDetails[preset].color }} /><b>{instrumentDetails[preset].name}</b></span><span>{instrumentDetails[preset].category}</span><span>Playable synth</span><button onClick={() => { onAddInstrument(preset); onPreviewInstrument(preset) }}><Plus size={13} /> Add</button></div>)}{!hasResults && <p className="library-empty">No sounds match this search.</p>}</div></div>
  </section>
}

function InstrumentBrowser({ instrumentTracks, onAdd, onPreview }: { instrumentTracks: InstrumentTrack[]; onAdd: (instrument: InstrumentPreset) => void; onPreview: (instrument: InstrumentPreset, pitch?: number) => void }) {
  const [filter, setFilter] = useState<'all' | InstrumentPreset>('all')
  const presets = (Object.keys(instrumentDetails) as InstrumentPreset[]).filter((preset) => filter === 'all' || preset === filter)
  return <section className="content-panel instruments-workspace"><div className="workspace-heading"><div><p className="section-kicker">INSTRUMENT RACK</p><h1>Add a playable instrument</h1><p>Each preset creates a real instrument track with notes that can be edited in Piano Roll and played by the transport.</p></div><span className="instrument-count">{instrumentTracks.length} in project</span></div><div className="instrument-browser-layout"><aside className="instrument-category-list"><b>INSTRUMENT TYPES</b><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All instruments</button><button className={filter === 'keys' ? 'active' : ''} onClick={() => setFilter('keys')}>Keyboard</button><button className={filter === 'bass' ? 'active' : ''} onClick={() => setFilter('bass')}>Bass</button><button className={filter === 'pad' ? 'active' : ''} onClick={() => setFilter('pad')}>Pads & Synths</button><button className={filter === 'lead' ? 'active' : ''} onClick={() => setFilter('lead')}>Leads</button><b>DRUM LIBRARY</b><span>Browse kicks, snares, hats, and percussion in Sound Library.</span></aside><div className="instrument-cards">{presets.map((preset) => <article className="instrument-card" key={preset} style={{ '--instrument-color': instrumentDetails[preset].color } as CSSProperties}><i><Piano size={19} /></i><span>{instrumentDetails[preset].category}</span><h2>{instrumentDetails[preset].name}</h2><p>{instrumentDetails[preset].description}</p><div><button className="secondary-button" onClick={() => onPreview(preset)}><Play size={14} fill="currentColor" /> Preview</button><button className="primary-button" onClick={() => onAdd(preset)}><Plus size={14} /> Add track</button></div></article>)}</div></div></section>
}

function Mixer({ tracks, onSelect, onUpdateTrack, onUpdateInstrument, onMute, onSolo }: { tracks: ProjectTrack[]; onSelect: (id: string) => void; onUpdateTrack: (id: string, update: (track: DrumTrack) => DrumTrack) => void; onUpdateInstrument: (id: string, update: (track: InstrumentTrack) => InstrumentTrack) => void; onMute: (id: string) => void; onSolo: (id: string) => void }) {
  return <section className="content-panel mixer-view"><div className="workspace-heading"><div><p className="section-kicker">REAL-TIME CONTROLS</p><h1>Mixer</h1><p>Faders, pan, mute, and solo directly affect both drum and instrument playback.</p></div><span className="master-label"><Volume2 size={15} /> Master output</span></div><div className="mixer-strips">{tracks.map((track) => <article className="mixer-strip" key={track.id}><button className="mixer-name" onClick={() => onSelect(track.id)}><i style={{ background: track.color }} />{track.name}</button><label>Volume<input className="mixer-fader" aria-label={`${track.name} volume`} type="range" min="0" max="1" step="0.01" value={track.volume} onChange={(event) => isInstrumentTrack(track) ? onUpdateInstrument(track.id, (current) => ({ ...current, volume: Number(event.target.value) })) : onUpdateTrack(track.id, (current) => ({ ...current, volume: Number(event.target.value) }))} /></label><output>{percent(track.volume)}</output><label>Pan<input aria-label={`${track.name} pan`} type="range" min="-1" max="1" step="0.05" value={track.pan} onChange={(event) => isInstrumentTrack(track) ? onUpdateInstrument(track.id, (current) => ({ ...current, pan: Number(event.target.value) })) : onUpdateTrack(track.id, (current) => ({ ...current, pan: Number(event.target.value) }))} /></label><div><button className={track.muted ? 'active' : ''} onClick={() => onMute(track.id)}>Mute</button><button className={track.solo ? 'active solo' : ''} onClick={() => onSolo(track.id)}>Solo</button></div></article>)}</div></section>
}

function Tutorials({ project, playing, onOpenPatterns }: { project: Project; playing: boolean; onOpenPatterns: () => void }) {
  const done = completedLessonSteps(project, playing)
  const lessons = [['kick', 'Place a kick', 'Start with steps 1, 5, 9, and 13.'], ['snare', 'Add a snare', 'Try steps 5 and 13 for a clear backbeat.'], ['hats', 'Add hi-hats', 'Use every other step to give the groove motion.'], ['play', 'Listen back', 'Press Play and make one decision from what you hear.']] as const
  return <section className="content-panel tutorials"><div className="workspace-heading"><div><p className="section-kicker">BEAT SCHOOL</p><h1>Create your first drum beat</h1><p>Lesson steps read your actual pattern. Nothing is marked complete until you do it.</p></div><button className="primary-button" onClick={onOpenPatterns}><ListMusic size={15} /> Open pattern</button></div><div className="lesson-card"><div className="lesson-progress"><span>Progress</span><b>{Math.round(done.length / lessons.length * 100)}%</b><i><em style={{ width: `${done.length / lessons.length * 100}%` }} /></i></div>{lessons.map(([id, title, detail], index) => <div className={`lesson-step ${done.includes(id) ? 'done' : index === done.length ? 'current' : ''}`} key={id}><span>{done.includes(id) ? 'Done' : index + 1}</span><div><b>{title}</b><p>{done.includes(id) ? 'Completed from your project activity.' : detail}</p></div></div>)}</div></section>
}

function Inspector({ project, selectedTrack, lessonSteps, onUpdateTrack, onUpdateInstrument, onSelectTutorials, onOpenBeatbot }: { project: Project; selectedTrack: ProjectTrack | null; lessonSteps: string[]; onUpdateTrack: (id: string, update: (track: DrumTrack) => DrumTrack) => void; onUpdateInstrument: (id: string, update: (track: InstrumentTrack) => InstrumentTrack) => void; onSelectTutorials: () => void; onOpenBeatbot: () => void }) {
  if (!selectedTrack) return <section className="inspector"><PanelHeader icon={<SlidersHorizontal size={17} />} title="Inspector" subtitle="Nothing selected" /><div className="empty-inspector"><Layers3 size={28} /><h2>Start shaping your beat</h2><p>Select a timeline clip or track name to inspect it. Your project currently has {project.tracks.length} drum lanes.</p><button className="primary-button" onClick={onSelectTutorials}><BookOpen size={15} /> Continue Beat School</button><button className="secondary-button" onClick={onOpenBeatbot}><BeatbotMark size={17} /> Ask BEATBOT</button></div><div className="inspector-tip"><b>Current lesson: {lessonSteps.length}/4 complete</b><p>Every transport and sequencer control uses the real project state.</p></div></section>
  const instrument = isInstrumentTrack(selectedTrack)
  const updateSelected = (change: (track: ProjectTrack) => ProjectTrack) => instrument ? onUpdateInstrument(selectedTrack.id, (track) => change(track) as InstrumentTrack) : onUpdateTrack(selectedTrack.id, (track) => change(track) as DrumTrack)
  const activity = instrument ? `${selectedTrack.notes.length} MIDI notes` : `${selectedTrack.pattern.steps.filter((step) => step.active).length} active hits`
  return <section className="inspector"><PanelHeader icon={instrument ? <Piano size={17} /> : <Drum size={17} />} title={selectedTrack.name} subtitle={instrument ? 'Instrument track' : 'Drum track'} /><div className="track-color-row"><i style={{ background: selectedTrack.color }} /><span>{activity}</span><span>{instrument ? 'MIDI' : '16 steps'}</span></div><InspectorRange label="Volume" value={selectedTrack.volume} display={percent(selectedTrack.volume)} min={0} max={1} step={0.01} onChange={(value) => updateSelected((track) => ({ ...track, volume: value }))} /><InspectorRange label="Pan" value={selectedTrack.pan} display={selectedTrack.pan === 0 ? 'Center' : selectedTrack.pan < 0 ? `${Math.round(Math.abs(selectedTrack.pan) * 100)}% L` : `${Math.round(selectedTrack.pan * 100)}% R`} min={-1} max={1} step={0.05} onChange={(value) => updateSelected((track) => ({ ...track, pan: value }))} /><div className="inspector-group"><span>{instrument ? 'Preset' : 'Instrument'}</span><b>{instrument ? instrumentDetails[selectedTrack.instrument].name : `Original ${selectedTrack.name} synth`}</b><small>{instrument ? 'Editable MIDI notes play through this Web Audio preset.' : 'This implemented drum voice is edited in Step Sequencer.'}</small></div><div className="inspector-group"><span>Output</span><b>Master</b><small>Fader, pan, mute, and solo affect playback immediately.</small></div></section>
}

function PanelHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) { return <header className="panel-header"><span>{icon}</span><div><h2>{title}</h2><p>{subtitle}</p></div></header> }

function InspectorRange({ label, value, display, min, max, step, onChange }: { label: string; value: number; display: string; min: number; max: number; step: number; onChange: (value: number) => void }) { return <label className="inspector-range"><span>{label}<b>{display}</b></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label> }

function BeatbotPanel({ project, selectedTrack, messages, proposal, onClose, onClear, onSend, onApply, onDismiss, onPreview }: { project: Project; selectedTrack: ProjectTrack | null; messages: BeatbotMessage[]; proposal: BeatbotProposal | null; onClose: () => void; onClear: () => void; onSend: (text: string) => void; onApply: () => void; onDismiss: () => void; onPreview: (sound: DrumSound) => void }) {
  const [input, setInput] = useState('')
  function submit(event: FormEvent): void { event.preventDefault(); onSend(input); setInput('') }
  const quickActions = ['Create a Beat', 'Suggest a Melody', 'Build a Bassline', 'Improve My Drums', 'Help Me Mix', 'Teach Me Music Production']
  const activity = selectedTrack ? isInstrumentTrack(selectedTrack) ? `${selectedTrack.notes.length} MIDI notes on this track` : `${selectedTrack.pattern.steps.filter((step) => step.active).length} active hits on this track` : `${project.tracks.length} drum tracks and ${project.instrumentTracks.length} instruments at ${project.tempo} BPM`
  return <section className="beatbot-panel"><header className="beatbot-header"><BeatbotMark size={31} /><div><h2>BEATBOT</h2><p><i /> Local project assistant</p></div><button onClick={onClear} title="Clear conversation"><RotateCcw size={15} /></button><button onClick={onClose} title="Minimize BEATBOT"><ArrowLeft size={17} /></button></header><div className="beatbot-context"><span>CONTEXT</span><b>{selectedTrack ? selectedTrack.name : project.name}</b><small>{activity}</small></div><div className="beatbot-chat"><div className="beatbot-welcome"><BeatbotMark size={39} /><h3>Make something great.</h3><p>I can help you build beats, understand music production, improve your arrangement, and learn new techniques.</p></div>{messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === 'assistant' ? 'BEATBOT' : 'YOU'}</span><p>{message.text}</p></div>)}{proposal && <div className="proposal-card"><span>EDITABLE SUGGESTION</span><h3>{proposal.title}</h3><p>{proposal.detail}</p><small>Affects: {proposal.affected}. It only adds notes and can be undone.</small><div><button className="secondary-button" onClick={() => onPreview(proposal.previewSound)}><Volume2 size={14} /> Audition</button><button className="primary-button" onClick={onApply}>Apply change</button><button className="quiet-button" onClick={onDismiss}>Dismiss</button></div></div>}</div><div className="quick-actions">{quickActions.map((action) => <button key={action} onClick={() => onSend(action)}>{action === 'Improve My Drums' ? <Drum size={14} /> : action === 'Help Me Mix' ? <SlidersHorizontal size={14} /> : action === 'Teach Me Music Production' ? <BookOpen size={14} /> : <Sparkles size={14} />}{action}</button>)}</div><form className="beatbot-input" onSubmit={submit}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about this project..." aria-label="Message BEATBOT" /><button disabled={!input.trim()} aria-label="Send message"><Send size={16} /></button></form><p className="beatbot-disclaimer">Local rule-based assistance in this release. No project data is sent to an external AI service.</p></section>
}

function SettingsPanel({ project, onUpdateProject }: { project: Project; onUpdateProject: (change: (current: Project) => Project) => void }) {
  return <section className="content-panel settings-workspace"><div className="workspace-heading"><div><p className="section-kicker">PROJECT SETTINGS</p><h1>Project controls</h1><p>Changes apply to this project immediately and are saved locally.</p></div></div><div className="settings-card"><label>Project name<input value={project.name} onChange={(event) => onUpdateProject((current) => ({ ...current, name: event.target.value || 'Untitled Beat' }))} /></label><label>Tempo (BPM)<input type="number" min="40" max="240" value={project.tempo} onChange={(event) => onUpdateProject((current) => ({ ...current, tempo: Math.max(40, Math.min(240, Number(event.target.value) || 40)) }))} /></label><label>Swing <input type="range" min="0" max="30" value={project.swing} onChange={(event) => onUpdateProject((current) => ({ ...current, swing: Number(event.target.value) }))} /><output>{project.swing}%</output></label><label>Workspace mode<select value={project.mode} onChange={(event) => onUpdateProject((current) => ({ ...current, mode: event.target.value as Mode }))}><option value="beginner">Beginner</option><option value="creator">Creator</option><option value="pro">Pro</option></select></label><div className="settings-info"><b>Time signature: {project.timeSignature[0]}/{project.timeSignature[1]}</b><p>This project uses a 4/4, one-bar pattern grid, so the time signature remains fixed.</p></div></div></section>
}

function StatusBar({ project, selectedTrack, playing, activeView }: { project: Project; selectedTrack: ProjectTrack | null; playing: boolean; activeView: WorkspaceView }) {
  return <footer className="status-bar"><span><i className="status-dot" /> Web Audio initializes on Play</span><span>Project: {project.name}</span><span>Selected: {selectedTrack?.name ?? 'None'}</span><span>Snap: 1/16</span><span>{activeView.toUpperCase()}</span><span className={playing ? 'playing-state' : ''}>{playing ? 'Playing' : 'Stopped'}</span></footer>
}

function Home({ savedProject, onCreate, onContinue, onTemplate, onImport, inputRef, onFile }: { savedProject: Project | null; onCreate: () => void; onContinue: () => void; onTemplate: (template: 'trap' | 'lofi') => void; onImport: () => void; inputRef: RefObject<HTMLInputElement | null>; onFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void> }) {
  return <main className="home"><nav className="home-nav"><div className="home-logo"><BeatbotMark size={29} /><b>BEATFORGE</b></div><span>MAKE BEATS. LEARN MUSIC. CREATE WITHOUT LIMITS.</span><button className="secondary-button" onClick={onImport}><FolderOpen size={15} /> Open project</button></nav><section className="home-hero"><div><p className="section-kicker">A SERIOUS STARTING POINT</p><h1>Build the beat.<br /><em>Learn the craft.</em></h1><p>Beatforge gives you a working drum instrument, timing-accurate playback, editable projects, and practical guidance from the first click.</p><div className="hero-actions"><button className="primary-button" onClick={onCreate}><Plus size={16} /> New project</button>{savedProject && <button className="secondary-button" onClick={onContinue}><History size={15} /> Continue project</button>}</div></div><div className="home-signal"><BeatbotMark size={50} /><span>BEATBOT ENABLED</span><strong>Professional tools.<br />Plain language.</strong><p>Guidance stays connected to the project you are actually making.</p></div></section><section className="template-section"><div><p className="section-kicker">STARTER PROJECTS</p><h2>Open, edit, and make it yours.</h2></div><div className="template-grid"><TemplateCard icon={<Drum size={24} />} name="Midnight Trap" bpm="140 BPM" description="Tight hats and a half-time backbeat." onClick={() => onTemplate('trap')} /><TemplateCard icon={<Headphones size={24} />} name="Dusty Lo-Fi" bpm="78 BPM" description="Relaxed swing and an easy pocket." onClick={() => onTemplate('lofi')} /><div className="template-note"><FileAudio size={23} /><b>Your projects stay local.</b><p>Beatforge does not require an account, sound pack, or cloud AI service to make a working beat.</p></div></div></section><input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void onFile(event)} /></main>
}

function TemplateCard({ icon, name, bpm, description, onClick }: { icon: React.ReactNode; name: string; bpm: string; description: string; onClick: () => void }) { return <button className="template-card" onClick={onClick}><span>{icon}</span><small>{bpm}</small><h3>{name}</h3><p>{description}</p><b>Open starter <ArrowLeft size={14} /></b></button> }
