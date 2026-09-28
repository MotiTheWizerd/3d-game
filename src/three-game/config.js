export const CONFIG = {
  lanes: [-2.5, 0, 2.5],
  laneChangeSpeed: 14,

  player: {
    restY: 0.55,
    jumpVelocity: 14,
    gravity: -42,
    halfWidth: 0.45,
    halfDepth: 0.45,
    halfHeight: 0.55,
  },

  world: {
    spawnZ: -110,
    recycleZ: 16,
    fogNear: 30,
    fogFar: 110,
    backgroundColor: 0x07070f,
    fogColor: 0x07070f,
    groundLength: 260,
    dashCount: 24,
    dashSpacing: 6,
  },

  speed: {
    initial: 16,
    max: 48,
    acceleration: 0.55,
  },

  obstacles: {
    spawnIntervalStart: 1.35,
    spawnIntervalMin: 0.55,
    rampSeconds: 90,
    halfWidth: 0.9,
    halfDepth: 0.9,
    // 2.6+ is a solid wall (see CollisionSystem + jumpableMaxHeight)
    heights: [1.0, 1.4, 2.6],
    jumpableMaxHeight: 1.4,
  },

  coins: {
    spawnInterval: 2.4,
    value: 10,
    y: 1.1,
    radius: 0.35,
    packSizeMin: 3,
    packSizeMax: 5,
    packSpacing: 1.4,
  },

  powerUps: {
    // Spawning: every N seconds a power-up appears (increases over time).
    spawnIntervalStart: 8,
    spawnIntervalMin: 4,
    rampSeconds: 120,
    // Types and their properties.
    types: {
      shield: {
        label: "🛡 Shield",
        color: 0x00e5ff,
        emissive: 0x005566,
        halfSize: 0.6,
        scale: 1.0,
      },
      magnet: {
        label: "🧲 Magnet",
        color: 0xff2d55,
        emissive: 0x66001a,
        halfSize: 0.5,
        scale: 1.0,
      },
      score2x: {
        label: "⭐ 2× Score",
        color: 0xffd60a,
        emissive: 0x665500,
        halfSize: 0.55,
        scale: 1.0,
      },
      slowmo: {
        label: "⏳ Slow-Mo",
        color: 0x9d4edd,
        emissive: 0x2d004b,
        halfSize: 0.55,
        scale: 1.0,
      },
      ghost: {
        label: "👻 Ghost",
        color: 0xb8fff4,
        emissive: 0x1a5548,
        halfSize: 0.55,
        scale: 1.0,
      },
    },
    // Active durations.
    duration: 10,
    // Magnet: extra pickup radius in units.
    magnetRadius: 3.0,
    // Slow-mo: world scroll multiplier while active.
    slowmoFactor: 0.6,
  },
  pause: {
    // Tab-switch / minimize auto-pauses a live run (manual: P or Esc).
    autoOnHidden: true,
  },

  touch: {
    // One-finger gestures on the track (see core/TouchControls.js). Pixels are
    // CSS px, so thresholds are finger-width-ish and independent of resolution.
    swipeThreshold: 28, // travel per lane change; a long flick crosses several
    tapSlopPx: 16, // movement still counted as a tap, not a swipe
    holdToPauseMs: 420, // finger held still this long, then lifted -> pause
    // Listen on every device: desktop simply never fires touch* events, so the
    // same build answers keyboard and thumb without a runtime branch.
    attachAlways: true,
    // On-screen ⏸ for phones, where there is no P key.
    showPauseButton: true,
  },

  dash: {
    // Shift bursts through obstacles; energy fills from coins (4 coins = full).
    duration: 1.2,
    speedMultiplier: 1.6,
    energyPerCoin: 0.25,
    smashBonus: 25,
  },

  fx: {
    // Particle presets (see systems/ParticleSystem.js): speed in units/s,
    // life in seconds, gravity applied to vy, colors picked per particle.
    particles: {
      max: 600,
      coin: {
        count: 16, speed: 5.5, speedVariance: 0.5, life: 0.5, size: 0.14,
        gravity: -7, upBias: 0.35, drag: 2,
        colors: [0xffd60a, 0xfff3b0, 0xffffff],
      },
      smash: {
        count: 28, speed: 10, speedVariance: 0.5, life: 0.7, size: 0.2,
        gravity: -20, upBias: 0.55, drag: 1,
        colors: [0xff4530, 0xff9f0a, 0xffd60a],
      },
      crash: {
        count: 80, speed: 13, speedVariance: 0.5, life: 1.0, size: 0.26,
        gravity: -24, upBias: 0.4, drag: 0.8,
        colors: [0xff2d55, 0xff9f0a, 0xffe066],
      },
      trail: {
        count: 2, speed: 3, speedVariance: 0.4, life: 0.3, size: 0.18,
        gravity: 0, upBias: 0.1, drag: 1.5, emitInterval: 0.016,
        colors: [0x00e5ff, 0x7c4dff],
      },
    },
    camera: {
      // Shake: trauma decays linearly, offset scales with trauma^2.
      shakeMaxOffset: 0.4,
      shakeMaxRoll: 0.07,
      shakeDecay: 1.8,
      shakeFrequency: 31,
      // FOV punch on dash start, exponential ease back to base.
      fovPunch: 9,
      fovDecay: 6,
    },
  },

  score: {
    distanceScale: 1,
    bestKey: "neon-runner-best",
  },

  audio: {
    masterVolume: 0.9,
    mutedKey: "neon-runner-muted",
    // Background loop: i - VI - III - VII in A minor, arp + bass + hats.
    // Roots/tones are midi numbers; the scheduler runs on a 25ms timer.
    music: {
      tempo: 132,
      volume: 1.0,
      bassVolume: 0.22,
      arpVolume: 0.1,
      hatVolume: 0.05,
      chords: [
        { root: 33, tones: [57, 60, 64, 69] }, // Am
        { root: 29, tones: [53, 57, 60, 65] }, // F
        { root: 36, tones: [60, 64, 67, 72] }, // C
        { root: 31, tones: [55, 59, 62, 67] }, // G
      ],
      arpOrder: [0, 1, 2, 3, 0, 2, 1, 3],
    },
  },

  colors: {
    player: 0x00e5ff,
    playerEmissive: 0x004d5a,
    obstacle: 0xff2d55,
    obstacleAlt: 0xff7a45,
    coin: 0xffd60a,
    dashEnergy: 0x00e5ff,
    dashReady: 0xb04dff,
    ground: 0x0d0d1c,
    groundEdge: 0x1a1a35,
    dash: 0x3d3d7a,
    sky: 0x07070f,
    fog: 0x07070f,
    hemiSky: 0x6a7cff,
    hemiGround: 0x1a1030,
    dirLight: 0xffffff,
    accentGlow: 0x7c4dff,
  },
};