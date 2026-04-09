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
      resolution: 1,
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
      resolution: 1,
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
      resolution: 1,
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
      resolution: 1,
    },
  },
  {
    id: 'prussian',
    name: 'Prussian',
    type: 'neat',
    preview: 'linear-gradient(135deg, #0b3954 0%, #087e8b 40%, #bfd7ea 70%, #ff5a5f 100%)',
    config: {
      colors: [
        { color: '#0b3954', enabled: true },
        { color: '#087e8b', enabled: true },
        { color: '#bfd7ea', enabled: true },
        { color: '#ff5a5f', enabled: true },
        { color: '#c81d25', enabled: true },
        { color: '#A8E6CF', enabled: false },
      ],
      speed: 4,
      horizontalPressure: 4,
      verticalPressure: 3,
      waveFrequencyX: 0,
      waveFrequencyY: 0,
      waveAmplitude: 0,
      shadows: 2,
      highlights: 7,
      colorBrightness: 1,
      colorSaturation: 8,
      wireframe: false,
      colorBlending: 5,
      backgroundColor: '#FF0000',
      backgroundAlpha: 1,
      grainScale: 0,
      grainIntensity: 0,
      grainSpeed: 0,
      resolution: 1,
    },
  },
  {
    id: 'lemon',
    name: 'Lemon',
    type: 'neat',
    preview: 'linear-gradient(135deg, #F2FF00 0%, #6B00FF 40%, #D5ECEB 70%, #00A2FF 100%)',
    config: {
      colors: [
        { color: '#F2FF00', enabled: true },
        { color: '#6B00FF', enabled: true },
        { color: '#D5ECEB', enabled: true },
        { color: '#E4E4E4', enabled: false },
        { color: '#F6FFFF', enabled: false },
      ],
      speed: 4,
      horizontalPressure: 4,
      verticalPressure: 5,
      waveFrequencyX: 1,
      waveFrequencyY: 2,
      waveAmplitude: 10,
      shadows: 4,
      highlights: 7,
      colorBrightness: 1,
      colorSaturation: 0,
      wireframe: false,
      colorBlending: 7,
      backgroundColor: '#00A2FF',
      backgroundAlpha: 1,
      grainScale: 4,
      grainIntensity: 0.2,
      grainSpeed: 2.2,
      resolution: 1,
    },
  },
  {
    id: 'yex',
    name: 'YEX',
    type: 'neat',
    preview: 'linear-gradient(135deg, #FF5772 0%, #4CB4BB 25%, #FFC600 50%, #8B6AE6 75%, #2E0EC7 100%)',
    config: {
      colors: [
        { color: '#FF5772', enabled: true },
        { color: '#4CB4BB', enabled: true },
        { color: '#FFC600', enabled: true },
        { color: '#8B6AE6', enabled: true },
        { color: '#2E0EC7', enabled: true },
        { color: '#FF9A9E', enabled: true },
      ],
      speed: 1,
      horizontalPressure: 3,
      verticalPressure: 3,
      waveFrequencyX: 3,
      waveFrequencyY: 2,
      waveAmplitude: 7,
      shadows: 3,
      highlights: 4,
      colorBrightness: 1.05,
      colorSaturation: -2,
      wireframe: true,
      colorBlending: 4,
      backgroundColor: '#4A3805',
      backgroundAlpha: 1,
      grainScale: 0,
      grainIntensity: 0,
      grainSpeed: 2.4,
      resolution: 1,
    },
  },
  {
    id: 'splash',
    name: 'Splash',
    type: 'neat',
    preview: 'linear-gradient(135deg, #ffbe0b 0%, #fb5607 25%, #ff006e 50%, #8338ec 75%, #3a86ff 100%)',
    config: {
      colors: [
        { color: '#ffbe0b', enabled: true },
        { color: '#fb5607', enabled: true },
        { color: '#ff006e', enabled: true },
        { color: '#8338ec', enabled: true },
        { color: '#3a86ff', enabled: true },
      ],
      speed: 4,
      horizontalPressure: 2,
      verticalPressure: 2,
      waveFrequencyX: 1,
      waveFrequencyY: 2,
      waveAmplitude: 7,
      shadows: 10,
      highlights: 10,
      colorBrightness: 1,
      colorSaturation: 2,
      wireframe: false,
      colorBlending: 5,
      backgroundColor: '#FFBE0B',
      backgroundAlpha: 1,
      grainScale: 2,
      grainIntensity: 0.3,
      grainSpeed: 0,
      resolution: 1,
    },
  },
  {
    id: 'fire-cms',
    name: 'FIRE CMS',
    type: 'neat',
    preview: 'linear-gradient(135deg, #FF5373 0%, #FFC858 25%, #17E7FF 50%, #6D3BFF 75%, #003FFF 100%)',
    config: {
      colors: [
        { color: '#FF5373', enabled: true },
        { color: '#FFC858', enabled: true },
        { color: '#17E7FF', enabled: true },
        { color: '#6D3BFF', enabled: true },
        { color: '#f5e1e5', enabled: false },
        { color: '#A8E6CF', enabled: false },
      ],
      speed: 2,
      horizontalPressure: 2,
      verticalPressure: 5,
      waveFrequencyX: 2,
      waveFrequencyY: 2,
      waveAmplitude: 5,
      shadows: 10,
      highlights: 8,
      colorBrightness: 1,
      colorSaturation: 10,
      wireframe: true,
      colorBlending: 6,
      backgroundColor: '#003FFF',
      backgroundAlpha: 1,
      grainScale: 0,
      grainIntensity: 0,
      grainSpeed: 0,
      resolution: 1,
    },
  },
  {
    id: 'pastel',
    name: 'Pastel',
    type: 'neat',
    preview: 'linear-gradient(135deg, #cdb4db 0%, #ffc8dd 25%, #ffafcc 50%, #bde0fe 75%, #a2d2ff 100%)',
    config: {
      colors: [
        { color: '#cdb4db', enabled: true },
        { color: '#ffc8dd', enabled: true },
        { color: '#ffafcc', enabled: true },
        { color: '#bde0fe', enabled: true },
        { color: '#a2d2ff', enabled: false },
      ],
      speed: 4,
      horizontalPressure: 4,
      verticalPressure: 6,
      waveFrequencyX: 2,
      waveFrequencyY: 4,
      waveAmplitude: 6,
      shadows: 0,
      highlights: 4,
      colorBrightness: 1,
      colorSaturation: 3,
      wireframe: false,
      colorBlending: 5,
      backgroundColor: '#003FFF',
      backgroundAlpha: 1,
      grainScale: 0,
      grainIntensity: 0,
      grainSpeed: 0,
      resolution: 1,
    },
  },
  {
    id: 'oceans-eleven',
    name: 'Oceans Eleven',
    type: 'neat',
    preview: 'linear-gradient(135deg, #5365FF 0%, #5864FF 25%, #322085 50%, #3B94FF 75%, #003FFF 100%)',
    config: {
      colors: [
        { color: '#5365FF', enabled: true },
        { color: '#5864FF', enabled: true },
        { color: '#322085', enabled: true },
        { color: '#3B94FF', enabled: true },
        { color: '#E1F0F5', enabled: false },
      ],
      speed: 4,
      horizontalPressure: 2,
      verticalPressure: 10,
      waveFrequencyX: 2,
      waveFrequencyY: 10,
      waveAmplitude: 10,
      shadows: 10,
      highlights: 0,
      colorBrightness: 1.2,
      colorSaturation: -3,
      wireframe: false,
      colorBlending: 10,
      backgroundColor: '#003FFF',
      backgroundAlpha: 0,
      grainScale: 0,
      grainIntensity: 0,
      grainSpeed: 10,
      resolution: 1,
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
