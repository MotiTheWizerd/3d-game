import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { formatLogLine } from "../../scripts/serve.js";

// Why this file exists: a page whose modules fail to load still shows the
// Start Run button (it's plain HTML), so "nothing happens when I click" looks
// like a game bug when it is really a dead server. These tests pin both halves
// of the fix — the server answers for the page AND for the module graph, and it
// says so on stdout line by line.

const SERVE = fileURLToPath(new URL("../../scripts/serve.js", import.meta.url));

async function withServer(fn) {
  const child = spawn(process.execPath, [SERVE], {
    env: { ...process.env, PORT: "0" }, // 0 = any free port, so this never fights ./run.sh
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines = [];
  const gotLine = new Promise((resolve) => {
    const onData = (chunk) => {
      for (const line of chunk.toString().split("\n")) {
        if (!line.trim()) continue;
        lines.push(line);
        if (/localhost:(\d+)/.test(line)) resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
  });

  // Stdout arrives in its own time: a response can resolve before the server's
  // log line has been piped to us, so log assertions wait for the line.
  const waitFor = async (pred, ms = 2000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (pred()) return true;
      await new Promise((r) => setTimeout(r, 20));
    }
    return false;
  };

  try {
    await Promise.race([
      gotLine,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("server never announced a port")), 4000)
      ),
    ]);
    const port = Number(lines.join("\n").match(/localhost:(\d+)/)[1]);
    assert.ok(port > 0, `got a real bound port, saw ${port}`);
    await fn({ port, lines, waitFor, base: `http://127.0.0.1:${port}` });
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
}

async function get(url) {
  const res = await fetch(url);
  return { status: res.status, type: res.headers.get("content-type"), text: await res.text() };
}

test("the game page and its whole module graph serve 200", async () => {
  await withServer(async ({ base }) => {
    const page = await get(`${base}/public/three-game/`);
    assert.equal(page.status, 200);
    assert.match(page.type, /text\/html/);
    assert.match(page.text, /script type="module"/, "the shell is HTML, not JSON error");

    // Every file that showed up as ERR_CONNECTION_REFUSED in the wild report.
    const modules = [
      "/src/three-game/main.js",
      "/src/three-game/game/World.js",
      "/src/three-game/game/Player.js",
      "/src/three-game/game/CoinSpawner.js",
      "/src/three-game/game/ObstacleSpawner.js",
      "/src/three-game/game/PowerUpSpawner.js",
      "/src/three-game/systems/ParticleSystem.js",
      "/src/three-game/systems/PowerUpSystem.js",
      "/src/three-game/systems/CollisionSystem.js",
      "/src/three-game/systems/ScoreSystem.js",
      "/src/three-game/systems/CameraFX.js",
      "/src/three-game/core/InputManager.js",
      "/src/three-game/core/TouchControls.js",
    ];
    for (const path of modules) {
      const res = await get(`${base}${path}`);
      assert.equal(res.status, 200, `${path} must load or the game is dead`);
      assert.match(res.type, /javascript/, `${path} must be served as a module`);
    }
  });
});

test("three.js itself is reachable through the bare-specifier import map", async () => {
  await withServer(async ({ base }) => {
    const res = await get(`${base}/node_modules/three/build/three.module.js`);
    assert.equal(res.status, 200);
    assert.ok(res.text.length > 100000, "the real library, not an empty file");
  });
});

test("every hit is logged, tagged, with misses standing out", async () => {
  await withServer(async ({ base, lines, waitFor }) => {
    const saw = (re) => lines.some((l) => re.test(l));
    await get(`${base}/public/three-game/`);
    assert.ok(
      await waitFor(() => saw(/ok 200 GET {2}\/public\/three-game\/index\.html {2}\d+\.\dms$/)),
      `page hit logged, saw: ${lines.join(" | ")}`
    );

    await get(`${base}/src/three-game/main.js`);
    assert.ok(await waitFor(() => saw(/ok 200 GET {2}\/src\/three-game\/main\.js/)), "module logged");

    await get(`${base}/nope/missing.js`);
    assert.ok(await waitFor(() => saw(/MISS 404 GET {2}\/nope\/missing\.js/)), "a 404 is scannable at a glance");

    // ...and nothing was mis-tagged as a server error.
    assert.ok(!saw(/FAIL 5\d\d/), "no 5xx during a normal page load");
  });
});

test("the log format is stable for the statuses that matter", () => {
  assert.match(formatLogLine(200, "GET", "/a.js", 1.2), /^  ok 200 GET  \/a\.js {2}1\.2ms$/);
  assert.match(formatLogLine(404, "GET", "/x.js", 0.1), /^MISS 404 GET  \/x\.js/);
  assert.match(formatLogLine(403, "GET", "/../etc/passwd", 0), /^WARN 403/);
  assert.match(formatLogLine(500, "POST", "/y", 0), /^FAIL 500 POST/);
});

test("path traversal outside the project root is refused, not served", async () => {
  await withServer(async ({ base }) => {
    const res = await get(`${base}/../../etc/passwd`);
    assert.ok(res.status === 403 || res.status === 404, `refused, got ${res.status}`);
    assert.doesNotMatch(res.text, /root:x:/, "never leak the passwd file");
  });
});

test("a missing favicon is a MISS, not a crash", async () => {
  await withServer(async ({ base }) => {
    const res = await get(`${base}/favicon.ico`);
    assert.equal(res.status, 404);
  });
});
