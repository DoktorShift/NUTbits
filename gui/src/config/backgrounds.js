/**
 * Lock screen background presets.
 *
 * Each preset has:
 *   id       — unique key, stored in localStorage
 *   name     — display label
 *   type     — 'whatamesh' | 'neat' | 'static'
 *   preview  — CSS gradient string for the thumbnail
 *   config   — library-specific config object
 */

// ── Whatamesh presets ───────────────────────────────────────────
// Colors are CSS custom properties on the canvas element.

const whatameshPresets = [
  {
    id: 'amber-dusk',
    name: 'Amber Dusk',
    type: 'whatamesh',
    preview: 'linear-gradient(135deg, #1a0e00 0%, #3d1f00 30%, #b45309 60%, #1a1918 100%)',
    config: {
      colors: ['#b45309', '#1a0e00', '#3d1f00', '#0f0e0d'],
    },
  },
  {
    id: 'crimson-tide',
    name: 'Crimson Tide',
    type: 'whatamesh',
    preview: 'linear-gradient(135deg, #1a0005 0%, #4c0519 30%, #9f1239 60%, #0f0e0d 100%)',
    config: {
      colors: ['#9f1239', '#1a0005', '#4c0519', '#0f0e0d'],
    },
  },
]

// ── NEAT presets ───────────────────────────────────────────────
// Full NeatGradient config objects. Designed at neat.firecms.co.

const neatPresets = [
  {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    type: 'neat',
    preview: 'linear-gradient(135deg, #020617 0%, #0c4a6e 35%, #164e63 65%, #020617 100%)',
    config: {
      colors: [
        { color: '#0c4a6e', enabled: true },
        { color: '#164e63', enabled: true },
        { color: '#022c22', enabled: true },
        { color: '#0e7490', enabled: true },
        { color: '#020617', enabled: true },
      ],
      speed: 3,
      horizontalPressure: 3,
      verticalPressure: 4,
      waveFrequencyX: 2,
      waveFrequencyY: 3,
      waveAmplitude: 5,
      shadows: 4,
      highlights: 3,
      colorSaturation: -1,
      colorBrightness: 0.8,
      colorBlending: 6,
      backgroundColor: '#020617',
      backgroundAlpha: 1,
      grainIntensity: 0.3,
      grainScale: 3,
      grainSpeed: 0.5,
      resolution: 0.8,
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    type: 'neat',
    preview: 'linear-gradient(135deg, #0a0118 0%, #1e1b4b 25%, #134e4a 50%, #312e81 75%, #0a0118 100%)',
    config: {
      colors: [
        { color: '#312e81', enabled: true },
        { color: '#134e4a', enabled: true },
        { color: '#1e1b4b', enabled: true },
        { color: '#065f46', enabled: true },
        { color: '#4c1d95', enabled: true },
      ],
      speed: 2,
      horizontalPressure: 4,
      verticalPressure: 5,
      waveFrequencyX: 2,
      waveFrequencyY: 2,
      waveAmplitude: 6,
      shadows: 5,
      highlights: 2,
      colorSaturation: 0,
      colorBrightness: 0.7,
      colorBlending: 7,
      backgroundColor: '#0a0118',
      backgroundAlpha: 1,
      grainIntensity: 0.25,
      grainScale: 3,
      grainSpeed: 0.4,
      resolution: 0.8,
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    type: 'neat',
    preview: 'linear-gradient(135deg, #0f0402 0%, #451a03 30%, #7c2d12 55%, #1c1917 100%)',
    config: {
      colors: [
        { color: '#7c2d12', enabled: true },
        { color: '#451a03', enabled: true },
        { color: '#92400e', enabled: true },
        { color: '#1c1917', enabled: true },
        { color: '#431407', enabled: true },
      ],
      speed: 2,
      horizontalPressure: 3,
      verticalPressure: 4,
      waveFrequencyX: 3,
      waveFrequencyY: 2,
      waveAmplitude: 4,
      shadows: 6,
      highlights: 2,
      colorSaturation: 0,
      colorBrightness: 0.9,
      colorBlending: 5,
      backgroundColor: '#0f0402',
      backgroundAlpha: 1,
      grainIntensity: 0.35,
      grainScale: 2.5,
      grainSpeed: 0.6,
      resolution: 0.8,
    },
  },
  {
    id: 'void',
    name: 'Void',
    type: 'neat',
    preview: 'linear-gradient(135deg, #0a0a0a 0%, #1a1918 40%, #262524 60%, #0a0a0a 100%)',
    config: {
      colors: [
        { color: '#1a1918', enabled: true },
        { color: '#262524', enabled: true },
        { color: '#0f0e0d', enabled: true },
        { color: '#2a2827', enabled: true },
        { color: '#1a1510', enabled: true },
      ],
      speed: 1,
      horizontalPressure: 2,
      verticalPressure: 3,
      waveFrequencyX: 1,
      waveFrequencyY: 1,
      waveAmplitude: 3,
      shadows: 7,
      highlights: 1,
      colorSaturation: -3,
      colorBrightness: 0.6,
      colorBlending: 8,
      backgroundColor: '#0a0a0a',
      backgroundAlpha: 1,
      grainIntensity: 0.4,
      grainScale: 2,
      grainSpeed: 0.3,
      resolution: 0.8,
    },
  },
]

// ── Static preset (no animation) ──────────────────────────────

const staticPresets = [
  {
    id: 'minimal',
    name: 'Minimal',
    type: 'static',
    preview: 'radial-gradient(circle at top, rgba(245,158,11,0.08), transparent 34%), linear-gradient(180deg, #1a1918, #0f0e0d)',
    config: {},
  },
]

// ── Export ─────────────────────────────────────────────────────

export const presets = [
  ...whatameshPresets,
  ...neatPresets,
  ...staticPresets,
]

export const defaultPresetId = 'amber-dusk'

const STORAGE_KEY = 'nutbits_lock_bg'

export function getSelectedPresetId() {
  return localStorage.getItem(STORAGE_KEY) || defaultPresetId
}

export function setSelectedPresetId(id) {
  localStorage.setItem(STORAGE_KEY, id)
}

export function getSelectedPreset() {
  const id = getSelectedPresetId()
  return presets.find(p => p.id === id) || presets[0]
}
