import { CONFIG } from "../config.js";

function overlaps(a, b) {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ
  );
}

function obstacleBounds(mesh) {
  const p = mesh.position;
  const hw = CONFIG.obstacles.halfWidth;
  const hd = CONFIG.obstacles.halfDepth;
  const hh = mesh.userData.halfHeight ?? 0.5;
  const height = hh * 2;
  // Walls taller than jumpableMaxHeight ignore Y — must lane-switch, jump won't clear.
  const solidWall = height > CONFIG.obstacles.jumpableMaxHeight;
  return {
    minX: p.x - hw,
    maxX: p.x + hw,
    minY: solidWall ? -Infinity : 0,
    maxY: solidWall ? Infinity : height,
    minZ: p.z - hd,
    maxZ: p.z + hd,
  };
}

function coinBounds(mesh) {
  const p = mesh.position;
  const r = CONFIG.coins.radius + 0.15;
  return {
    minX: p.x - r,
    maxX: p.x + r,
    minY: p.y - r,
    maxY: p.y + r,
    minZ: p.z - r,
    maxZ: p.z + r,
  };
}

export class CollisionSystem {
  /** Indices into `obstacles` that currently overlap the player. */
  findObstacleHits(player, obstacles) {
    const pb = player.getBounds();
    const hits = [];
    for (let i = 0; i < obstacles.length; i++) {
      if (overlaps(pb, obstacleBounds(obstacles[i]))) {
        hits.push(i);
      }
    }
    return hits;
  }

  checkObstacleHit(player, obstacles) {
    return this.findObstacleHits(player, obstacles).length > 0;
  }

  collectCoins(player, coins) {
    const pb = player.getBounds();
    const collected = [];
    for (let i = 0; i < coins.length; i++) {
      if (overlaps(pb, coinBounds(coins[i]))) {
        collected.push(i);
      }
    }
    return collected.reverse();
  }

  /** Indices into `powerUps` that currently overlap the player (reverse order for splicing). */
  collectPowerUps(player, powerUps) {
    function puBounds(mesh) {
      const p = mesh.position;
      const hs = CONFIG.powerUps.types[mesh.userData.type]?.halfSize ?? 0.5;
      return {
        minX: p.x - hs,
        maxX: p.x + hs,
        minY: p.y - hs,
        maxY: p.y + hs,
        minZ: p.z - hs,
        maxZ: p.z + hs,
      };
    }
    const pb = player.getBounds();
    const collected = [];
    for (let i = 0; i < powerUps.length; i++) {
      if (overlaps(pb, puBounds(powerUps[i]))) {
        collected.push(i);
      }
    }
    return collected.reverse();
  }
}
