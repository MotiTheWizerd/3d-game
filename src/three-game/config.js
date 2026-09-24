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

  score: {
    distanceScale: 1,
    bestKey: "neon-runner-best",
  },

  audio: {
    masterVolume: 0.9,
    mutedKey: "neon-runner-muted",
  },

  colors: {
    player: 0x00e5ff,
    playerEmissive: 0x004d5a,
    obstacle: 0xff2d55,
    obstacleAlt: 0xff7a45,
    coin: 0xffd60a,
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
