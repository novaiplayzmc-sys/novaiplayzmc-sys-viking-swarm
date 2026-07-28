'use strict';

// ===== Tunables (one place to retune the whole game) =====
const BEST_KEY = 'swarm-best';     // localStorage: longest survived time (seconds)
const MUTE_KEY = 'swarm-muted';    // localStorage: sound on/off

const ARENA = { w: 720, h: 480 };  // play field in CSS pixels

// Base hero stats. `damage` is seeded from the equipped weapon in freshGame.
const PLAYER_BASE = { maxHp: 100, fireRate: 2, moveSpeed: 180, projectiles: 1, radius: 16 };

const GOLD_VALUE = 1;              // XP per gold coin a kill drops
const ENEMY_TOUCH_DAMAGE = 8;      // HP lost when an enemy reaches you
const ENEMY_HIT_COOLDOWN = 0.6;    // seconds of i-frames after a touch

const PROJECTILE_SPEED = 380;      // px/sec
const PROJECTILE_RADIUS = 6;
const PROJECTILE_LIFE = 1.6;       // seconds before a shot fizzles

const SHAKE_ON_HIT = 0.25;         // seconds of screen shake on a player hit
const POP_TIME = 0.18;             // hero squash/stretch duration

const SPAWN_BASE = 1.3;            // seconds between spawns at t=0
const SPAWN_MIN = 0.35;            // fastest the swarm can spawn
const SPAWN_RAMP = 0.012;          // spawn interval shed per second survived

// ===== Registries (the kid's edit points — one row per entry, auto-wired) =====
// Each is generic/neutral so a kid's CLAUDE.md re-skins it. Adding a row is the
// whole "add an enemy / weapon / upgrade" move — the loop picks it up for free.

// Enemies. behavior ∈ chase | zigzag | splitter (the engine supports all three;
// the starter ships `glitch`, a basic chaser). Row shape: { id, emoji, hp, speed, behavior }.
const ENEMIES = {
  // Regular defenders
  peasant:    { id: 'peasant',    emoji: '🧑‍🌾', hp: 15, speed: 70, behavior: 'chase' },
  footman:    { id: 'footman',    emoji: '🗡️', hp: 25, speed: 55, behavior: 'chase' },
  skirmisher: { id: 'skirmisher', emoji: '🏹', hp: 18, speed: 50, behavior: 'zigzag' },
  // Bosses (knight = wave 3 only, others cycle from wave 6+)
  knight:          { id: 'knight',          emoji: '🛡️', hp: 40,  speed: 50, behavior: 'chase',  touchDamage: 32, defence: 0.20, xp: 10, boss: true, radius: 22 },
  crossbowCaptain: { id: 'crossbowCaptain', emoji: '🎯', hp: 55,  speed: 45, behavior: 'zigzag', touchDamage: 26, defence: 0.10, xp: 12, boss: true, radius: 20 },
  templar:         { id: 'templar',         emoji: '⚔️', hp: 70,  speed: 55, behavior: 'chase',  touchDamage: 30, defence: 0.25, xp: 15, boss: true, radius: 24 },
  berserker:       { id: 'berserker',       emoji: '💢', hp: 50,  speed: 75, behavior: 'chase',  touchDamage: 40, defence: 0.05, xp: 12, boss: true, radius: 20 },
  warlord:         { id: 'warlord',         emoji: '💀', hp: 100, speed: 40, behavior: 'chase',  touchDamage: 45, defence: 0.35, xp: 20, boss: true, radius: 28 },
};

// Weapons (auto-fire). pattern ∈ straight | spread | boomerang (engine supports all
// three; starter ships `blaster`, straight). cadence multiplies the hero fireRate.
const WEAPONS = {
  throwingAxe: { id: 'throwingAxe', pattern: 'straight',  damage: 10, cadence: 1 },
  twinAxes:    { id: 'twinAxes',    pattern: 'spread',    damage: 8,  cadence: 0.85 },
  battleHorn:  { id: 'battleHorn',  pattern: 'boomerang', damage: 14, cadence: 0.7 },
};

// Upgrades (level-up cards). name + flavor are the VOICE surface — neutral in the
// starter, re-skinned by the kid's CLAUDE.md. apply(state) mutates the run's stats.
const UPGRADES = {
  power: { id: 'power', name: 'Sharper Axes',    flavor: 'Your axes bite deeper into the foe!', apply: (s) => { s.player.damage += 5; } },
  rapid: { id: 'rapid', name: 'Berserker Fury',  flavor: 'Hurl axes faster, like a madman!',    apply: (s) => { s.player.fireRate += 0.6; } },
  swift: { id: 'swift', name: 'Fleet Footed',    flavor: 'Run like the northern wind!',          apply: (s) => { s.player.moveSpeed += 36; } },
};

// Particle bursts per content id, with a graceful fallback. Add a row when you add
// content; if you forget, `_default` keeps the kill/hit from looking unfinished.
const BURSTS = {
  _default:         ['#ffaa44', '#ff6644'],
  peasant:          ['#8b6914', '#d4a574', '#5a3820'],
  footman:          ['#aaa', '#666', '#ccc'],
  skirmisher:       ['#4a6030', '#8b6914', '#6a8050'],
  knight:           ['#888', '#b8860b', '#ccc'],
  crossbowCaptain:  ['#5a4a3a', '#8b6914', '#4a3020'],
  templar:          ['#ddd', '#b8860b', '#8b2020'],
  berserker:        ['#d4a574', '#f44', '#5a3a20'],
  warlord:          ['#222', '#f44', '#b8860b', '#ff0'],
};

// Wave definitions. Each { enemies: [{id, count}], spawnEvery: seconds, boss?: id }.
// Knight only appears ONCE at wave 3. Later bosses cycle jarl → berserker → warlord.
const WAVES = [
  { enemies: [{id:'peasant', count:5}],                                                    spawnEvery: 1.1 },
  { enemies: [{id:'peasant', count:8}],                                                    spawnEvery: 0.9 },
  { enemies: [{id:'peasant', count:4},{id:'footman', count:4}],                            spawnEvery: 0.8, boss: 'knight' },
  { enemies: [{id:'footman', count:7},{id:'peasant', count:3}],                            spawnEvery: 0.7 },
  { enemies: [{id:'footman', count:5},{id:'skirmisher', count:3}],                         spawnEvery: 0.65 },
  { enemies: [{id:'footman', count:6},{id:'skirmisher', count:4}],                         spawnEvery: 0.6, boss: 'crossbowCaptain' },
  { enemies: [{id:'footman', count:7},{id:'skirmisher', count:4},{id:'peasant', count:3}], spawnEvery: 0.55 },
  { enemies: [{id:'footman', count:8},{id:'skirmisher', count:5}],                         spawnEvery: 0.5 },
  { enemies: [{id:'footman', count:9},{id:'skirmisher', count:5},{id:'peasant', count:4}], spawnEvery: 0.45, boss: 'templar' },
  { enemies: [{id:'footman', count:10},{id:'skirmisher', count:6}],                        spawnEvery: 0.4 },
  { enemies: [{id:'footman', count:10},{id:'skirmisher', count:7}],                        spawnEvery: 0.38 },
  { enemies: [{id:'footman', count:11},{id:'skirmisher', count:7},{id:'peasant', count:5}],spawnEvery: 0.35, boss: 'berserker' },
  { enemies: [{id:'footman', count:12},{id:'skirmisher', count:8}],                        spawnEvery: 0.32 },
  { enemies: [{id:'footman', count:13},{id:'skirmisher', count:8},{id:'peasant', count:6}],spawnEvery: 0.3 },
  { enemies: [{id:'footman', count:14},{id:'skirmisher', count:9}],                        spawnEvery: 0.28, boss: 'warlord' },
];

// Get wave config. For waves beyond the defined list, generate procedurally.
// Knight only appears at wave 3 — later boss waves cycle jarl/berserker/warlord.
function getWaveConfig(waveNum) {
  if (waveNum <= WAVES.length) return WAVES[waveNum - 1];
  const isBossWave = waveNum % 5 === 0;
  const scale = 1 + (waveNum - WAVES.length) * 0.06;
  const bossCycle = ['crossbowCaptain', 'templar', 'berserker', 'warlord'];
  const cfg = {
    enemies: [
      { id: 'footman', count: Math.round(10 * scale) },
      { id: 'skirmisher', count: Math.round(6 * scale) },
      { id: 'peasant', count: Math.round(5 * scale) },
    ],
    spawnEvery: Math.max(0.15, 0.35 - (waveNum - WAVES.length) * 0.008),
  };
  if (isBossWave) cfg.boss = bossCycle[(Math.floor(waveNum / 5) - 1) % bossCycle.length];
  return cfg;
}

// ===== Pure helpers: clamp + collision/distance math =====
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// Squared distance — cheaper than hypot when you only need to compare.
function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

// Do two circles overlap or touch? (radii sum compared in squared space)
function circleHit(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

// The enemy closest to (x, y), or null if the swarm is empty. Drives auto-fire aim.
function nearestEnemy(x, y, enemies) {
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// ===== Progression: XP → level =====
// XP needed to advance FROM `level` to the next. Gentle, predictable ramp.
function xpForLevel(level) {
  return 5 + (level - 1) * 3;
}

// Add XP to `state` (which carries level/xp/xpToNext), rolling over as many
// level-ups as the amount earns. Mutates state; returns the count of levels gained.
function applyXp(state, amount) {
  state.xp += amount;
  let gained = 0;
  while (state.xp >= state.xpToNext) {
    state.xp -= state.xpToNext;
    state.level += 1;
    state.xpToNext = xpForLevel(state.level);
    gained += 1;
  }
  return gained;
}

// ===== Difficulty ramp =====
// Seconds between enemy spawns — shrinks the longer you survive, down to a floor.
function spawnInterval(time) {
  return Math.max(SPAWN_MIN, SPAWN_BASE - time * SPAWN_RAMP);
}

// ===== Small formatting / record helpers (pure) =====
function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

// The better of a previous best and a new run (both in seconds, whole numbers).
function betterBest(prev, time) {
  return Math.max(Math.round(prev || 0), Math.round(time || 0));
}

// ===== Firing & aim (pure) =====
// Unit vector from (x,y) toward (tx,ty), scaled by `speed` → {vx,vy}. (0,0) if identical.
function steer(x, y, tx, ty, speed) {
  const dx = tx - x, dy = ty - y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { vx: 0, vy: 0 };
  return { vx: (dx / len) * speed, vy: (dy / len) * speed };
}

// Build one volley of projectiles from `player` toward (tx,ty) using `weapon`.
// straight = aimed shot(s) (× player.projectiles, lightly fanned); spread = a 3-shot
// fan; boomerang = an aimed shot flagged to return. Pure — the caller pushes them.
function spawnProjectiles(player, weapon, tx, ty) {
  const base = steer(player.x, player.y, tx, ty, PROJECTILE_SPEED);
  const baseAngle = (base.vx === 0 && base.vy === 0) ? 0 : Math.atan2(base.vy, base.vx);
  const mk = (angle, extra) => Object.assign({
    x: player.x, y: player.y,
    vx: Math.cos(angle) * PROJECTILE_SPEED,
    vy: Math.sin(angle) * PROJECTILE_SPEED,
    damage: player.damage, radius: PROJECTILE_RADIUS, life: PROJECTILE_LIFE,
    weaponId: weapon.id,
  }, extra || {});
  const shots = [];
  if (weapon.pattern === 'spread') {
    for (const off of [-0.25, 0, 0.25]) shots.push(mk(baseAngle + off));
  } else if (weapon.pattern === 'boomerang') {
    shots.push(mk(baseAngle, { boomerang: true, age: 0 }));
  } else { // straight (default)
    const n = Math.max(1, player.projectiles | 0);
    for (let i = 0; i < n; i++) {
      const off = (n === 1) ? 0 : (i / (n - 1) - 0.5) * 0.3;
      shots.push(mk(baseAngle + off));
    }
  }
  return shots;
}

// ===== Upgrades: offer 3, apply the chosen one (pure) =====
// 3 distinct upgrade ids (all of them, shuffled, when only 3 ship). Pass a seeded
// rng for deterministic tests; defaults to Math.random.
function offerUpgrades(rng) {
  const r = rng || Math.random;
  const pool = Object.keys(UPGRADES);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  return pool.slice(0, 3);
}

// Apply the chosen upgrade to the run and record it. Returns false for an unknown id.
function chooseUpgrade(state, id) {
  const up = UPGRADES[id];
  if (!up) return false;
  up.apply(state);
  state.upgradesTaken.push(id);
  return true;
}

// ===== State factory (ONE game-state object) =====
// A fresh run. weaponId picks the equipped weapon (default blaster); the hero's
// live `damage` is seeded from that weapon so the +damage upgrade has a base to grow.
function freshGame(weaponId) {
  const wId = (weaponId && WEAPONS[weaponId]) ? weaponId : 'throwingAxe';
  const weapon = WEAPONS[wId];
  const player = Object.assign({}, PLAYER_BASE, {
    x: ARENA.w / 2, y: ARENA.h / 2,
    hp: PLAYER_BASE.maxHp, damage: weapon.damage, weaponId: wId,
    pop: 0, invuln: 0, aim: 0,
  });
  return {
    status: 'start', time: 0, score: 0,
    level: 1, xp: 0, xpToNext: xpForLevel(1),
    player,
    enemies: [], projectiles: [], gold: [], particles: [], floaters: [],
    shake: 0, fireTimer: 0,
    // Wave system state
    wave: 1, wavePhase: 'announce', waveSpawnQueue: [], waveSpawnTimer: 0,
    waveBossId: null, waveBossSpawned: false, bossFightActive: false,
    bossesDefeated: [],
    upgradesTaken: [], offered: [], pendingLevels: 0,
  };
}

// ===== Best-run persistence (parse logic is pure via betterBest; I/O is guarded) =====
function loadBest() {
  if (typeof localStorage === 'undefined') return 0;
  const n = Number(localStorage.getItem(BEST_KEY));
  return (Number.isFinite(n) && n > 0) ? Math.round(n) : 0;
}
function saveBest(time) {
  const best = betterBest(loadBest(), time);
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
  }
  return best;
}

// ===== Engine: spawning, kills, juice data, level-up, game over =====
// Spawn one enemy from the ENEMIES pool just outside a random edge. Pure data push;
// `rng` is injectable for tests. The spawn director (in update) sets the cadence.
function spawnEnemy(state, rng) {
  const r = rng || Math.random;
  const ids = Object.keys(ENEMIES).filter((id) => !ENEMIES[id].boss);
  const def = ENEMIES[ids[Math.floor(r() * ids.length)]];
  const edge = Math.floor(r() * 4);
  let x, y;
  if (edge === 0) { x = r() * ARENA.w; y = -20; }
  else if (edge === 1) { x = ARENA.w + 20; y = r() * ARENA.h; }
  else if (edge === 2) { x = r() * ARENA.w; y = ARENA.h + 20; }
  else { x = -20; y = r() * ARENA.h; }
  state.enemies.push({
    id: def.id, emoji: def.emoji, behavior: def.behavior,
    x, y, hp: def.hp, maxHp: def.hp, speed: def.speed,
    xp: def.xp || GOLD_VALUE, radius: def.radius || 16,
    touchDamage: def.touchDamage || ENEMY_TOUCH_DAMAGE,
    defence: def.defence || 0,
    boss: def.boss || false,
    age: 0, split: def.behavior === 'splitter',
  });
}

// Spawn a boss by its registry id. Sets bossFightActive and shakes the screen.
function spawnBossById(state, bossId) {
  const def = ENEMIES[bossId];
  if (!def) return;
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  if (edge === 0) { x = Math.random() * ARENA.w; y = -30; }
  else if (edge === 1) { x = ARENA.w + 30; y = Math.random() * ARENA.h; }
  else if (edge === 2) { x = Math.random() * ARENA.w; y = ARENA.h + 30; }
  else { x = -30; y = Math.random() * ARENA.h; }
  state.enemies.push({
    id: def.id, emoji: def.emoji, behavior: def.behavior,
    x, y, hp: def.hp, maxHp: def.hp, speed: def.speed,
    xp: def.xp || GOLD_VALUE, radius: def.radius || 22,
    touchDamage: def.touchDamage || ENEMY_TOUCH_DAMAGE,
    defence: def.defence || 0,
    boss: true,
    age: 0, split: false,
  });
  state.bossFightActive = true;
  state.bossesDefeated.push(bossId);
  state.shake = 0.4;
  const bossName = bossId.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
  spawnFloater(state, ARENA.w / 2, ARENA.h / 2, '⚔️ ' + bossName + ' APPEARS! ⚔️', 'boss', 2.5);
  state._boss = true;
}

// A dead enemy scores, drops an XP chip, throws a burst, and — if a splitter —
// breaks into two smaller non-splitting chasers (the engine supports it; the
// starter doesn't ship one).
function killEnemy(state, e) {
  state.score += (e.boss ? 50 : 5);
  if (e.boss) {
    // Boss drops 10 gold chips scattered around
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
      const dist = 15 + Math.random() * 30;
      state.gold.push({
        x: e.x + Math.cos(angle) * dist,
        y: e.y + Math.sin(angle) * dist,
        value: e.xp || GOLD_VALUE, radius: 8, age: 0,
      });
    }
  } else {
    state.gold.push({ x: e.x, y: e.y, value: e.xp || GOLD_VALUE, radius: 8, age: 0 });
  }
  spawnBurst(state, e.x, e.y, e.id);
  state._kill = true;
  if (e.boss) { state.bossFightActive = false; state._bossKill = true; }
  if (e.split) {
    const childHp = Math.max(1, Math.round(e.maxHp / 2));
    for (let i = 0; i < 2; i++) {
      state.enemies.push({
        id: e.id, emoji: e.emoji, behavior: 'chase',
        x: e.x + (i ? 14 : -14), y: e.y, hp: childHp, maxHp: childHp,
        speed: e.speed * 1.2, xp: e.xp, radius: 12, age: 0, split: false,
      });
    }
  }
}

// A floating number (real damage or +N XP). Plain data; the renderer draws + ages it.
function spawnFloater(state, x, y, text, kind, life) {
  state.floaters.push({ x, y, text, kind: kind || 'dmg', age: 0, life: life || 0.9 });
}

// A particle burst keyed off content id, with graceful fallback. Plain data only.
function spawnBurst(state, x, y, id) {
  const colors = BURSTS[id] || BURSTS._default;
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI * 2 * i) / 6 + (Math.random() * 0.5);
    const spd = 60 + Math.random() * 80;
    state.particles.push({
      x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      color: colors[i % colors.length], age: 0, life: 0.7,
    });
  }
}

// Pause the run and offer 1-of-3 upgrade cards. Extra levels (from a big gulp of XP)
// queue in pendingLevels so each gets its own card pick.
function levelUp(state, levels) {
  state.status = 'levelup';
  state.pendingLevels = (state.pendingLevels || 0) + (levels - 1);
  state.offered = offerUpgrades();
  state.player.pop = POP_TIME;
  state._levelup = true;
}

function gameOver(state) {
  state.status = 'over';
  state.best = saveBest(state.time);
  state._over = true;
}

// ===== Engine: the simulation step =====
// Advance the whole game by `dt` seconds. `input` is a movement vector {x,y} in
// roughly [-1,1] (the DOM layer builds it from the keys held). Runs only while
// playing. Sets one-shot `_event` flags the audio layer consumes + clears each frame.
function update(state, dt, input) {
  if (state.status !== 'playing') return;
  const p = state.player;
  const mv = input || { x: 0, y: 0 };

  state.time += dt;
  if (p.pop > 0) p.pop = Math.max(0, p.pop - dt);
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

  // age + cull the juice layers (plain data; the renderer just reads them)
  for (const f of state.floaters) { f.age += dt; f.y -= (f.kind === 'boss' ? 10 : 22) * dt; }
  state.floaters = state.floaters.filter((f) => f.age < f.life);
  for (const t of state.particles) { t.age += dt; t.x += t.vx * dt; t.y += t.vy * dt; t.vy += 120 * dt; }
  state.particles = state.particles.filter((t) => t.age < t.life);
  for (const gd of state.gold) gd.age += dt;

  // --- move the hero (normalized so diagonals aren't faster) ---
  if (mv.x || mv.y) {
    const len = Math.hypot(mv.x, mv.y);
    p.x = clamp(p.x + (mv.x / len) * p.moveSpeed * dt, p.radius, ARENA.w - p.radius);
    p.y = clamp(p.y + (mv.y / len) * p.moveSpeed * dt, p.radius, ARENA.h - p.radius);
  }

  // --- wave director (replaces old spawn + boss directors) ---
  const waveCfg = getWaveConfig(state.wave);

  if (state.wavePhase === 'announce') {
    state.waveBossId = waveCfg.boss || null;
    // Build flat spawn queue from wave config
    state.waveSpawnQueue = [];
    for (const group of waveCfg.enemies) {
      for (let i = 0; i < group.count; i++) state.waveSpawnQueue.push(group.id);
    }
    state.waveSpawnTimer = 1.0;
    state.waveBossSpawned = false;
    state.wavePhase = 'spawning';
    // Announce the wave
    const bossText = state.waveBossId ? ' ⚔️ BOSS APPROACHES!' : '';
    spawnFloater(state, ARENA.w / 2, ARENA.h / 2 - 30, '⚔️ WAVE ' + state.wave + bossText, 'boss', 2.0);
    if (state.waveBossId) state._bossWarn = true;
  }

  if (state.wavePhase === 'spawning') {
    state.waveSpawnTimer -= dt;
    if (state.waveSpawnTimer <= 0 && state.waveSpawnQueue.length > 0) {
      const enemyId = state.waveSpawnQueue.shift();
      const def = ENEMIES[enemyId];
      if (def) {
        const edge = Math.floor(Math.random() * 4);
        let x, y;
        if (edge === 0) { x = Math.random() * ARENA.w; y = -20; }
        else if (edge === 1) { x = ARENA.w + 20; y = Math.random() * ARENA.h; }
        else if (edge === 2) { x = Math.random() * ARENA.w; y = ARENA.h + 20; }
        else { x = -20; y = Math.random() * ARENA.h; }
        state.enemies.push({
          id: def.id, emoji: def.emoji, behavior: def.behavior,
          x, y, hp: def.hp, maxHp: def.hp, speed: def.speed,
          xp: def.xp || GOLD_VALUE, radius: def.radius || 16,
          touchDamage: def.touchDamage || ENEMY_TOUCH_DAMAGE,
          defence: def.defence || 0,
          boss: false,
          age: 0, split: def.behavior === 'splitter',
        });
      }
      state.waveSpawnTimer = waveCfg.spawnEvery;
    }
    if (state.waveSpawnQueue.length === 0) state.wavePhase = 'fighting';
  }

  if (state.wavePhase === 'fighting') {
    if (state.enemies.length === 0) {
      if (state.waveBossId && !state.waveBossSpawned) {
        state.wavePhase = 'boss';
        spawnBossById(state, state.waveBossId);
        state.waveBossSpawned = true;
      } else {
        state.wavePhase = 'complete';
        state.waveSpawnTimer = 2.5;
        spawnFloater(state, ARENA.w / 2, ARENA.h / 2 - 30, '🏆 WAVE ' + state.wave + ' CLEARED!', 'xp', 2.0);
      }
    }
  }

  if (state.wavePhase === 'boss') {
    if (!state.bossFightActive) {
      state.wavePhase = 'complete';
      state.waveSpawnTimer = 3.5;
      spawnFloater(state, ARENA.w / 2, ARENA.h / 2 - 30, '💀 BOSS DEFEATED! VALHALLA AWAITS!', 'boss', 2.5);
      // _bossKill is already set by killEnemy when the boss enemy dies
    }
  }

  if (state.wavePhase === 'complete') {
    state.waveSpawnTimer -= dt;
    if (state.waveSpawnTimer <= 0) {
      state.wave += 1;
      state.wavePhase = 'announce';
    }
  }

  // --- auto-fire at the nearest enemy ---
  const weapon = WEAPONS[p.weaponId];
  const target = nearestEnemy(p.x, p.y, state.enemies);
  if (target) {
    p.aim = Math.atan2(target.y - p.y, target.x - p.x);
    state.fireTimer -= dt;
    if (state.fireTimer <= 0) {
      for (const shot of spawnProjectiles(p, weapon, target.x, target.y)) state.projectiles.push(shot);
      state.fireTimer = 1 / (p.fireRate * (weapon.cadence || 1));
      p.pop = POP_TIME;
      state._fired = true;
    }
  }

  // --- move enemies by behavior ---
  for (const e of state.enemies) {
    e.age += dt;
    const s = steer(e.x, e.y, p.x, p.y, e.speed);
    let vx = s.vx, vy = s.vy;
    if (e.behavior === 'zigzag') {
      const perp = Math.atan2(vy, vx) + Math.PI / 2;
      const wob = Math.sin(e.age * 6) * e.speed * 0.6;
      vx += Math.cos(perp) * wob; vy += Math.sin(perp) * wob;
    }
    e.x += vx * dt; e.y += vy * dt;
  }

  // --- move projectiles (boomerangs reverse once at half-life) ---
  for (const pr of state.projectiles) {
    pr.life -= dt;
    if (pr.boomerang) {
      pr.age += dt;
      if (pr.age > PROJECTILE_LIFE / 2) { pr.vx *= -1; pr.vy *= -1; pr.boomerang = false; }
    }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
  }
  state.projectiles = state.projectiles.filter((pr) =>
    pr.life > 0 && pr.x > -40 && pr.x < ARENA.w + 40 && pr.y > -40 && pr.y < ARENA.h + 40);

  // --- projectile → enemy ---
  for (const pr of state.projectiles) {
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (circleHit(pr.x, pr.y, pr.radius, e.x, e.y, e.radius)) {
        const defReduce = e.defence || 0;
        const actualDmg = Math.round(pr.damage * (1 - defReduce));
        e.hp -= actualDmg;
        pr.life = 0;
        spawnFloater(state, e.x, e.y, String(actualDmg), 'dmg');
        spawnBurst(state, e.x, e.y, e.id);
        state._hit = true;
        if (e.hp <= 0) killEnemy(state, e);
        break;
      }
    }
  }
  state.projectiles = state.projectiles.filter((pr) => pr.life > 0);
  state.enemies = state.enemies.filter((e) => e.hp > 0);

  // --- enemy → hero (respecting i-frames) ---
  if (p.invuln <= 0) {
    for (const e of state.enemies) {
      if (circleHit(p.x, p.y, p.radius, e.x, e.y, e.radius)) {
        p.hp = clamp(p.hp - (e.touchDamage || ENEMY_TOUCH_DAMAGE), 0, p.maxHp);
        p.invuln = ENEMY_HIT_COOLDOWN;
        state.shake = SHAKE_ON_HIT;
        state._hurt = true;
        if (p.hp <= 0) { gameOver(state); return; }
        break;
      }
    }
  }

  // --- hero → gold coins (a pickup magnet via a larger collect radius) ---
  let gained = 0;
  const kept = [];
  for (const gd of state.gold) {
    if (circleHit(p.x, p.y, p.radius + 18, gd.x, gd.y, gd.radius)) {
      gained += gd.value;
      state.score += gd.value * 10;
      spawnFloater(state, gd.x, gd.y, '+' + gd.value, 'xp');
      state._gold = true;
    } else kept.push(gd);
  }
  state.gold = kept;
  if (gained > 0) {
    const levels = applyXp(state, gained);
    if (levels > 0) levelUp(state, levels);
  }
}

// ===== Sound (synthesized Web Audio — NO audio files, ever) =====
// Tiny oscillator blips. Guarded so node never touches AudioContext/localStorage.
// A mute toggle persists separately from the run. The context unlocks on the first
// user gesture (start click), per browser autoplay rules.
const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
let audioCtx = null;
let muted = false;

function loadMute() {
  return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
}
function setMute(on) {
  muted = on;
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(MUTE_KEY, on ? '1' : '0'); } catch (e) {}
  }
  const btn = (typeof document !== 'undefined') && document.getElementById('mute');
  if (btn) { btn.textContent = on ? '🔇' : '🔊'; btn.setAttribute('aria-pressed', String(on)); }
}
function ensureAudio() {
  if (muted || !AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(ctx, freq, start, dur, type, peak) {
  const o = ctx.createOscillator();
  const gain = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak || 0.14, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(gain); gain.connect(ctx.destination);
  o.start(start); o.stop(start + dur + 0.03);
}
const SFX = {
  // Axe throw — sharp metallic clang
  fire:    (c, t) => { tone(c, 880, t, 0.05, 'square', 0.07); tone(c, 440, t + 0.02, 0.04, 'triangle', 0.05); },
  // Axe hits armor
  hit:     (c, t) => { tone(c, 220, t, 0.06, 'triangle', 0.08); tone(c, 110, t + 0.02, 0.04, 'square', 0.05); },
  // Death groan — low descending saw
  kill:    (c, t) => { tone(c, 200, t, 0.06, 'sawtooth', 0.1); tone(c, 150, t + 0.05, 0.08, 'sawtooth', 0.08); tone(c, 90, t + 0.1, 0.15, 'sawtooth', 0.09); },
  // Gold coin chime
  gold:    (c, t) => { tone(c, 1047, t, 0.06, 'triangle', 0.1); tone(c, 1319, t + 0.04, 0.06, 'triangle', 0.08); },
  // Player hurt — deep thud
  hurt:    (c, t) => { tone(c, 80, t, 0.2, 'sawtooth', 0.15); tone(c, 50, t + 0.05, 0.18, 'square', 0.1); },
  // Level up — viking laugh (rapid ascending notes)
  levelup: (c, t) => { [392, 440, 523, 587, 659, 523, 440].forEach((f, i) => tone(c, f, t + i * 0.06, 0.08, 'triangle', 0.12)); },
  // Game over — mournful horn
  over:    (c, t) => { [330, 262, 196].forEach((f, i) => tone(c, f, t + i * 0.16, 0.3, 'sawtooth', 0.12)); },
  // Boss warning — war horn
  bossWarn:(c, t) => { tone(c, 131, t, 0.4, 'square', 0.16); tone(c, 165, t + 0.2, 0.3, 'square', 0.14); },
  // Boss spawn — deep horn blast
  boss:    (c, t) => { [98, 73, 55].forEach((f, i) => tone(c, f, t + i * 0.15, 0.45, 'sawtooth', 0.18)); },
  // Boss kill — triumphant fanfare
  bossKill:(c, t) => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.09, 0.2, 'triangle', 0.14)); },
};
function sfx(name) {
  const ctx = ensureAudio();
  if (!ctx) return;
  (SFX[name] || SFX.fire)(ctx, ctx.currentTime); // unknown cues fall back to a soft blip
}

// Map the one-shot event flags update() set this frame to sounds, then clear them.
function consumeAudioEvents(state) {
  if (state._fired)   { sfx('fire');    state._fired = false; }
  if (state._hit)     { sfx('hit');     state._hit = false; }
  if (state._kill)    { sfx('kill');    state._kill = false; }
  if (state._gold)     { sfx('gold');     state._gold = false; }
  if (state._hurt)    { sfx('hurt');    state._hurt = false; }
  if (state._levelup) { sfx('levelup'); state._levelup = false; }
  if (state._over)     { sfx('over');     state._over = false; }
  if (state._bossWarn) { sfx('bossWarn'); state._bossWarn = false; }
  if (state._boss)      { sfx('boss');      state._boss = false; }
  if (state._bossKill)  { sfx('bossKill');  state._bossKill = false; }
}

// ===== Render (canvas 2D — browser only) =====
// Neutral palette, read from CSS custom properties so a kid's CLAUDE.md can re-skin
// the look by editing style.css. Falls back to literals if the page hasn't loaded them.
function cssVar(name, fallback) {
  if (typeof document === 'undefined' || !document.documentElement) return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// The viking hero: a round shield with horns that points where it's aiming.
// Squashes on a pop. Color from --hero CSS variable.
function drawHero(ctx, p) {
  const squash = 1 + (p.pop > 0 ? (p.pop / POP_TIME) * 0.35 : 0);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.aim || 0);
  ctx.scale(squash, 2 - squash);
  if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.5;
  const r = p.radius;
  // Shield body
  ctx.fillStyle = '#4a1515';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // Shield rim
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 3;
  ctx.stroke();
  // Center boss
  ctx.fillStyle = '#777';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  // Horns
  ctx.fillStyle = '#d4c4a8';
  ctx.beginPath();
  ctx.moveTo(-r * 0.15, -r * 0.6);
  ctx.lineTo(-r * 0.45, -r * 1.3);
  ctx.lineTo(r * 0.1, -r * 0.7);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.15, -r * 0.6);
  ctx.lineTo(r * 0.45, -r * 1.3);
  ctx.lineTo(-r * 0.1, -r * 0.7);
  ctx.fill();
  // Direction wedge
  ctx.fillStyle = cssVar('--hero', '#ff3b3b');
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(r * 0.15, r * 0.3);
  ctx.lineTo(r * 0.15, -r * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ===== Coastal medieval village background =====
function drawBackground(ctx) {
  const W = ARENA.w, H = ARENA.h;
  // Sky gradient (dusk)
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.65);
  sky.addColorStop(0, '#1a2a40'); sky.addColorStop(0.5, '#2d4a60'); sky.addColorStop(1, '#4a6a7a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // Distant mountains
  ctx.fillStyle = '#1e3045';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.5); ctx.lineTo(80, H * 0.28); ctx.lineTo(180, H * 0.42);
  ctx.lineTo(270, H * 0.22); ctx.lineTo(380, H * 0.38); ctx.lineTo(500, H * 0.25);
  ctx.lineTo(600, H * 0.35); ctx.lineTo(W, H * 0.3); ctx.lineTo(W, H); ctx.lineTo(0, H);
  ctx.closePath(); ctx.fill();
  // Snow caps
  ctx.fillStyle = '#3a4a50';
  ctx.beginPath(); ctx.moveTo(250, H * 0.28); ctx.lineTo(270, H * 0.22); ctx.lineTo(290, H * 0.30); ctx.fill();
  ctx.beginPath(); ctx.moveTo(470, H * 0.30); ctx.lineTo(500, H * 0.25); ctx.lineTo(530, H * 0.32); ctx.fill();

  // Castle on hill (right)
  ctx.fillStyle = '#4a4040';
  ctx.fillRect(W - 180, H * 0.35, 120, 100);
  ctx.fillRect(W - 190, H * 0.30, 30, 120); // left tower
  ctx.fillRect(W - 60, H * 0.28, 30, 125);  // right tower
  for (let bx = W - 182; bx < W - 58; bx += 18) ctx.fillRect(bx, H * 0.32, 14, 8);
  ctx.fillRect(W - 192, H * 0.26, 34, 10);
  ctx.fillRect(W - 62, H * 0.24, 34, 10);
  ctx.fillStyle = '#1a1010';
  ctx.fillRect(W - 148, H * 0.55, 56, 65);
  ctx.beginPath(); ctx.arc(W - 120, H * 0.55, 28, Math.PI, 0); ctx.fill();

  // Village longhouses
  const houses = [[30, 0.68, 70, 50], [140, 0.65, 55, 40], [240, 0.70, 80, 45]];
  for (const [hx, hy, hw, hh] of houses) {
    ctx.fillStyle = '#5a4030'; ctx.fillRect(hx, H * hy, hw, hh);
    ctx.fillStyle = '#2a1808';
    ctx.beginPath(); ctx.moveTo(hx - 8, H * hy); ctx.lineTo(hx + hw / 2, H * (hy - 0.15)); ctx.lineTo(hx + hw + 8, H * hy); ctx.fill();
  }
  // Warm windows
  ctx.fillStyle = '#da9030';
  [[50, 0.74, 7], [80, 0.74, 7], [158, 0.72, 6], [260, 0.76, 7]].forEach(([wx, wy, ws]) => ctx.fillRect(wx, H * wy, ws, ws));

  // Pine trees
  ctx.fillStyle = '#1a3025';
  [330, 365, 400, 580, 615].forEach(tx => {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(tx, H * 0.68 - i * 12);
      ctx.lineTo(tx - 14 + i * 3, H * 0.68 - i * 8 + 5);
      ctx.lineTo(tx + 14 - i * 3, H * 0.68 - i * 8 + 5);
      ctx.fill();
    }
    ctx.fillStyle = '#2a1808'; ctx.fillRect(tx - 2, H * 0.68, 4, 10); ctx.fillStyle = '#1a3025';
  });

  // Ground
  ctx.fillStyle = '#2a4020'; ctx.fillRect(0, H * 0.78, W, H * 0.06);
  // Shore
  ctx.fillStyle = '#1a3045';
  ctx.beginPath(); ctx.moveTo(0, H * 0.86);
  ctx.quadraticCurveTo(W * 0.3, H * 0.83, W * 0.5, H * 0.88);
  ctx.quadraticCurveTo(W * 0.7, H * 0.93, W, H * 0.85);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  // Water shimmer
  ctx.strokeStyle = 'rgba(60,100,120,0.4)'; ctx.lineWidth = 1;
  for (let wx = 0; wx < W; wx += 35) {
    ctx.beginPath(); ctx.moveTo(wx, H * 0.89 + Math.sin(wx * 0.1) * 2);
    ctx.lineTo(wx + 18, H * 0.89 + Math.sin((wx + 18) * 0.1) * 2); ctx.stroke();
  }

  // Viking longship
  ctx.fillStyle = '#3a2010';
  ctx.beginPath(); ctx.moveTo(430, H * 0.91); ctx.lineTo(470, H * 0.89);
  ctx.lineTo(510, H * 0.86); ctx.lineTo(550, H * 0.89); ctx.lineTo(580, H * 0.92);
  ctx.lineTo(560, H * 0.94); ctx.lineTo(450, H * 0.94); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(510, H * 0.86); ctx.lineTo(510, H * 0.76); ctx.stroke();
  ctx.fillStyle = '#c44030';
  ctx.beginPath(); ctx.moveTo(510, H * 0.77); ctx.lineTo(535, H * 0.81); ctx.lineTo(510, H * 0.86); ctx.fill();
  // Dragon head
  ctx.fillStyle = '#2a1008';
  ctx.beginPath(); ctx.moveTo(575, H * 0.91); ctx.lineTo(592, H * 0.88); ctx.lineTo(580, H * 0.93); ctx.fill();
  // Shields
  ctx.fillStyle = '#8b2020';
  for (let sx = 450; sx < 560; sx += 25) { ctx.beginPath(); ctx.arc(sx, H * 0.925, 5, 0, Math.PI * 2); ctx.fill(); }

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.02)'; ctx.lineWidth = 0.5;
  for (let gx = 0; gx <= W; gx += 48) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
  for (let gy = 0; gy <= H; gy += 48) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
}

// ===== Enemy drawing (proper shapes, no emojis) =====
function drawEnemy(ctx, e) {
  const r = e.radius, x = e.x, y = e.y;
  ctx.save(); ctx.translate(x, y);
  if (e.boss) {
    ctx.shadowColor = '#f00'; ctx.shadowBlur = 10;
    // Boss HP bar
    const bw = r * 1.8, bh = 5;
    ctx.fillStyle = '#300'; ctx.fillRect(-bw / 2, -r - 18, bw, bh);
    ctx.fillStyle = '#f33'; ctx.fillRect(-bw / 2, -r - 18, bw * (e.hp / e.maxHp), bh);
  }

  switch (e.id) {
    case 'peasant': {
      ctx.fillStyle = '#8b6914'; ctx.fillRect(-5, -2, 10, 12); // body
      ctx.fillStyle = '#d4a574'; ctx.beginPath(); ctx.arc(0, -6, 5, 0, Math.PI * 2); ctx.fill(); // head
      ctx.strokeStyle = '#5a3820'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(5, -8); ctx.lineTo(5, 6); ctx.stroke(); // pitchfork handle
      ctx.beginPath(); ctx.moveTo(5, -8); ctx.lineTo(2, -12); ctx.stroke(); // tine
      ctx.beginPath(); ctx.moveTo(5, -8); ctx.lineTo(8, -12); ctx.stroke(); // tine
      break;
    }
    case 'footman': {
      ctx.fillStyle = '#6a6a6a'; ctx.fillRect(-5, -1, 10, 10); // armor
      ctx.fillStyle = '#7a7a7a'; ctx.beginPath(); ctx.arc(0, -5, 5, 0, Math.PI * 2); ctx.fill(); // helmet
      ctx.fillStyle = '#333'; ctx.fillRect(-4, -3, 8, 2); // visor slit
      ctx.fillStyle = '#ccc'; ctx.fillRect(5, -9, 2, 13); // sword blade
      ctx.fillStyle = '#8b6914'; ctx.fillRect(4, 2, 4, 2); // hilt
      ctx.fillStyle = '#7a7a7a'; ctx.beginPath(); ctx.arc(8, -3, 3, 0, Math.PI * 2); ctx.fill(); // shield
      break;
    }
    case 'skirmisher': {
      ctx.fillStyle = '#4a6030'; ctx.fillRect(-5, -1, 10, 10); // green tunic
      ctx.fillStyle = '#6a8050'; ctx.beginPath(); ctx.arc(0, -5, 5, 0, Math.PI * 2); ctx.fill(); // hood
      ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(4, -4, 7, -Math.PI * 0.6, Math.PI * 0.6); ctx.stroke(); // bow
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(4, -10); ctx.lineTo(0, -7); ctx.stroke(); // arrow
      break;
    }
    case 'knight': {
      ctx.fillStyle = '#555'; ctx.fillRect(-7, -2, 14, 14); // plate armor
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(0, -7, 7, 0, Math.PI * 2); ctx.fill(); // helm
      ctx.fillStyle = '#222'; ctx.fillRect(-5, -9, 10, 3); // visor
      ctx.fillStyle = '#aaa'; ctx.fillRect(7, -12, 2, 18); // sword
      ctx.fillStyle = '#8b6914'; ctx.fillRect(5, 3, 6, 2); // hilt
      ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(10, -2, 5, 0, Math.PI * 2); ctx.fill(); // big shield
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1; ctx.stroke(); // gold rim
      break;
    }
    case 'crossbowCaptain': {
      ctx.fillStyle = '#5a4a3a'; ctx.fillRect(-6, -1, 12, 12); // leather armor
      ctx.fillStyle = '#6a5040'; ctx.beginPath(); ctx.arc(0, -6, 6, 0, Math.PI * 2); ctx.fill(); // hood
      ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(-10, -2); ctx.stroke(); // crossbow stock
      ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(-6, 1); ctx.stroke(); // bow arms
      ctx.fillStyle = '#333'; ctx.fillRect(4, -4, 4, 2); // bolt
      break;
    }
    case 'templar': {
      ctx.fillStyle = '#888'; ctx.fillRect(-7, -2, 14, 14); // heavy plate
      ctx.fillStyle = '#999'; ctx.beginPath(); ctx.arc(0, -7, 7, 0, Math.PI * 2); ctx.fill(); // great helm
      ctx.fillStyle = '#111'; ctx.fillRect(-4, -7, 8, 2); ctx.fillRect(-1, -10, 2, 6); // cross slit
      ctx.fillStyle = '#ddd'; ctx.fillRect(7, -13, 2.5, 20); // greatsword
      ctx.fillStyle = '#b8860b'; ctx.fillRect(5, 4, 7, 2); // gold hilt
      // Cape
      ctx.fillStyle = '#8b2020'; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-10, 10); ctx.lineTo(-2, 8); ctx.fill();
      break;
    }
    case 'berserker': {
      ctx.fillStyle = '#d4a574'; ctx.fillRect(-6, -1, 12, 12); // bare chest
      ctx.fillStyle = '#e8c8a0'; ctx.beginPath(); ctx.arc(0, -6, 6, 0, Math.PI * 2); ctx.fill(); // head
      // Bear pelt
      ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.arc(0, -8, 7, Math.PI, 0); ctx.fill();
      ctx.fillRect(-7, -8, 14, 4);
      // Wild eyes
      ctx.fillStyle = '#f00'; ctx.fillRect(-3, -7, 2, 2); ctx.fillRect(1, -7, 2, 2);
      // Dual axes
      ctx.fillStyle = '#aaa'; ctx.fillRect(3, -10, 3, 7); ctx.fillRect(-6, -8, 3, 6);
      ctx.fillStyle = '#8b6914'; ctx.fillRect(1, -10, 7, 1.5); ctx.fillRect(-8, -8, 7, 1.5);
      break;
    }
    case 'warlord': {
      ctx.fillStyle = '#222'; ctx.fillRect(-8, -2, 16, 16); // dark plate
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, -8, 8, 0, Math.PI * 2); ctx.fill(); // helm
      // Crown spikes
      ctx.fillStyle = '#b8860b';
      for (let ci = -6; ci <= 6; ci += 3) ctx.fillRect(ci, -18, 2, 5);
      ctx.fillStyle = '#111'; ctx.fillRect(-6, -10, 12, 2); // visor
      ctx.fillStyle = '#f44'; ctx.fillRect(8, -14, 3, 22); // flaming sword
      ctx.fillStyle = '#ff0'; ctx.fillRect(7, -14, 5, 3); // flame
      ctx.fillStyle = '#b8860b'; ctx.fillRect(6, 5, 7, 2); // gold hilt
      break;
    }
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function render(ctx, state) {
  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 40 : 0;
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 40 : 0;
  ctx.save();
  ctx.clearRect(0, 0, ARENA.w, ARENA.h);
  ctx.translate(shakeX, shakeY);

  // Coastal medieval village background
  drawBackground(ctx);

  // Gold coins (spinning circles)
  for (const gd of state.gold) {
    ctx.save();
    ctx.translate(gd.x, gd.y);
    const scaleX = Math.abs(Math.cos(gd.age * 5));
    ctx.scale(scaleX, 1);
    ctx.fillStyle = cssVar('--xp', '#ffd700');
    ctx.beginPath();
    ctx.arc(0, 0, gd.radius, 0, Math.PI * 2);
    ctx.fill();
    // Coin rim
    ctx.fillStyle = cssVar('--arena', '#0f1117');
    ctx.beginPath();
    ctx.arc(0, 0, gd.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Projectiles — small throwing axes
  for (const pr of state.projectiles) {
    ctx.save(); ctx.translate(pr.x, pr.y);
    ctx.rotate(Math.atan2(pr.vy, pr.vx) + Math.PI / 4);
    // Axe head
    ctx.fillStyle = '#aaa';
    ctx.fillRect(-3, -6, 6, 7);
    ctx.fillStyle = '#ccc';
    ctx.beginPath(); ctx.moveTo(3, -6); ctx.lineTo(8, -9); ctx.lineTo(3, -1); ctx.fill();
    // Handle
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(-1.5, 1, 3, 8);
    ctx.restore();
  }

  // Enemies (drawn shapes — no emojis)
  for (const e of state.enemies) drawEnemy(ctx, e);

  // hero
  drawHero(ctx, state.player);

  // Particle bursts — colored sparks
  for (const t of state.particles) {
    ctx.globalAlpha = Math.max(0, 1 - t.age / t.life);
    ctx.fillStyle = t.color || '#ffaa44';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 2 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // floating numbers (real damage / +N XP / boss announcements)
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.max(0, 1 - f.age / f.life);
    if (f.kind === 'boss') {
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.fillStyle = '#ff3b3b';
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 12;
    } else if (f.kind === 'xp') {
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillStyle = cssVar('--xp', '#ffcf5c');
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    } else {
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillStyle = cssVar('--ink', '#e8edf5');
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ===== HUD + overlays (DOM — browser only) =====
function updateHud(state) {
  if (typeof document === 'undefined') return;
  const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  set('hp-fill', (el) => { el.style.width = clamp(state.player.hp / state.player.maxHp * 100, 0, 100) + '%'; });
  set('timer', (el) => { el.textContent = formatTime(state.time); });
  set('score', (el) => { el.textContent = String(state.score); });
  set('level', (el) => { el.textContent = 'Raider ' + state.level; });
  set('wave', (el) => { el.textContent = 'Wave ' + (state.wave || 1); });
  set('xp-fill', (el) => { el.style.width = clamp(state.xp / state.xpToNext * 100, 0, 100) + '%'; });
}

// Show exactly the overlay the current status calls for. `handlers` wires the
// buttons: { onStart, onChoose(id), onRestart }. Built fresh each status change.
function showOverlays(state, handlers) {
  if (typeof document === 'undefined') return;
  const start = document.getElementById('start-screen');
  const levelup = document.getElementById('levelup');
  const over = document.getElementById('gameover');
  if (!start || !levelup || !over) return;
  start.hidden = state.status !== 'start';
  levelup.hidden = state.status !== 'levelup';
  over.hidden = state.status !== 'over';

  if (state.status === 'levelup') {
    const row = document.getElementById('cards');
    row.innerHTML = '';
    for (const id of state.offered) {
      const u = UPGRADES[id];
      const card = document.createElement('button');
      card.className = 'card';
      card.innerHTML = '<span class="card-name">' + u.name + '</span><span class="card-flavor">' + u.flavor + '</span>';
      card.addEventListener('click', () => handlers.onChoose(id));
      row.appendChild(card);
    }
  }
  if (state.status === 'over') {
    const t = document.getElementById('over-time');
    const b = document.getElementById('over-best');
    if (t) t.textContent = formatTime(state.time);
    if (b) b.textContent = formatTime(state.best || loadBest());
  }
}

// ===== Input + game loop + wiring (browser only) =====
const KEYS_LEFT  = ['ArrowLeft', 'a', 'A'];
const KEYS_RIGHT = ['ArrowRight', 'd', 'D'];
const KEYS_UP    = ['ArrowUp', 'w', 'W'];
const KEYS_DOWN  = ['ArrowDown', 's', 'S'];
const held = new Set();

function inputVector() {
  let x = 0, y = 0;
  if (KEYS_LEFT.some((k) => held.has(k))) x -= 1;
  if (KEYS_RIGHT.some((k) => held.has(k))) x += 1;
  if (KEYS_UP.some((k) => held.has(k))) y -= 1;
  if (KEYS_DOWN.some((k) => held.has(k))) y += 1;
  return { x, y };
}

let state = null;
let lastStatus = null;

function startRun() {
  state.status = 'playing';
  ensureAudio(); // unlock audio on this user gesture
}

function resumeFromLevelUp(id) {
  chooseUpgrade(state, id);
  if (state.pendingLevels > 0) {        // another level queued → offer again
    state.pendingLevels -= 1;
    state.offered = offerUpgrades();
    showOverlays(state, { onChoose: resumeFromLevelUp });
  } else {
    state.status = 'playing';
  }
}

function init() {
  const canvas = document.getElementById('arena');
  if (!canvas) return;
  canvas.width = ARENA.w;
  canvas.height = ARENA.h;
  const ctx = canvas.getContext('2d');

  state = freshGame();
  muted = loadMute();
  setMute(muted);

  const handlers = {
    onChoose: resumeFromLevelUp,
    onStart: startRun,
    onRestart: () => { state = freshGame(); startRun(); },
  };

  window.addEventListener('keydown', (e) => {
    if ([].concat(KEYS_LEFT, KEYS_RIGHT, KEYS_UP, KEYS_DOWN).includes(e.key)) e.preventDefault();
    held.add(e.key);
  });
  window.addEventListener('keyup', (e) => held.delete(e.key));
  window.addEventListener('blur', () => held.clear()); // fix: clear stuck keys when window loses focus

  const startBtn = document.getElementById('start-btn');
  if (startBtn) startBtn.addEventListener('click', handlers.onStart);
  const restartBtn = document.getElementById('restart-btn');
  if (restartBtn) restartBtn.addEventListener('click', handlers.onRestart);
  const muteBtn = document.getElementById('mute');
  if (muteBtn) muteBtn.addEventListener('click', () => setMute(!muted));

  const bestEl = document.getElementById('start-best');
  if (bestEl) bestEl.textContent = formatTime(loadBest());

  let last = (typeof performance !== 'undefined') ? performance.now() : 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // clamp dt so a tab-out doesn't teleport the swarm
    last = now;
    update(state, dt, inputVector());
    consumeAudioEvents(state);
    render(ctx, state);
    updateHud(state);
    if (state.status !== lastStatus) { showOverlays(state, handlers); lastStatus = state.status; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', init);
}

// ===== Node export guard (the browser ignores this; node --test reads it) =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ARENA, PLAYER_BASE, GOLD_VALUE, ENEMY_TOUCH_DAMAGE, PROJECTILE_SPEED,
    ENEMIES, WEAPONS, UPGRADES, BURSTS,
    clamp, dist2, circleHit, nearestEnemy,
    xpForLevel, applyXp, spawnInterval, formatTime, betterBest,
    steer, spawnProjectiles, offerUpgrades, chooseUpgrade,
    freshGame, loadBest, saveBest,
    spawnEnemy, killEnemy, spawnFloater, spawnBurst, spawnBossById, getWaveConfig, levelUp, gameOver, update,
  };
}
