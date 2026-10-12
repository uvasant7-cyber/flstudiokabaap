import { describe, expect, it } from 'vitest'
import { createProject, isProject, safeFilename } from './project'

describe('project model', () => {
  it('creates an editable four-track drum project', () => {
    const project = createProject()
    expect(project.tracks).toHaveLength(4)
    expect(project.instrumentTracks).toHaveLength(1)
    expect(project.instrumentTracks[0].instrument).toBe('keys')
    expect(project.tracks.every((track) => Array.isArray(track.pattern.steps))).toBe(true)
    expect(project.tracks[0].pattern.steps).toHaveLength(16)
    expect(project.tracks.some((track) => track.pattern.steps.some((step) => step.active))).toBe(false)
  })

  it('only accepts a valid project shape', () => {
    expect(isProject(createProject())).toBe(true)
    expect(isProject({ version: 1, name: 'bad' })).toBe(false)
  })

  it('makes downloaded filenames safe', () => {
    expect(safeFilename('My / First: Beat!')).toBe('My-First-Beat')
  })
})
