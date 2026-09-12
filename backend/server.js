const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const p2pBus = require('./p2pBus');
const app = express();
app.use(express.static(path.join(__dirname, '..')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const NUM_ROBOTS = 4, GRID_SIZE = 20, TICK_MS = 300, STUCK_LIMIT = 3, NUM_TASKS = 6;
const baseGrid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
for (let i = 5; i < 15; i++) { baseGrid[8][i] = 1; baseGrid[12][i] = 1; }
baseGrid[8][10] = 0; baseGrid[12][10] = 0;
let dynamicBlocks = new Set();
function isWalkable(x, y) {
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
  if (baseGrid[y][x] === 1) return false;
  if (dynamicBlocks.has(`${x},${y}`)) return false;
  return true;
}
function astar(start, goal, extraBlockedCell = null) {
  const key = (p) => `${p.x},${p.y}`;
  const openSet = [start]; const cameFrom = {};
  const gScore = { [key(start)]: 0 }; const fScore = { [key(start)]: heuristic(start, goal) };
  function heuristic(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  while (openSet.length > 0) {
    openSet.sort((a, b) => (fScore[key(a)] ?? Infinity) - (fScore[key(b)] ?? Infinity));
    const current = openSet.shift();
    if (current.x === goal.x && current.y === goal.y) {
      const path = [current]; let c = key(current);
      while (cameFrom[c]) { path.unshift(cameFrom[c]); c = key(cameFrom[c]); }
      return path;
    }
    const neighbors = [{x:current.x+1,y:current.y},{x:current.x-1,y:current.y},{x:current.x,y:current.y+1},{x:current.x,y:current.y-1}];
    for (const n of neighbors) {
      if (!isWalkable(n.x, n.y)) continue;
      if (extraBlockedCell && n.x === extraBlockedCell.x && n.y === extraBlockedCell.y) continue;
      const tentativeG = (gScore[key(current)] ?? Infinity) + 1;
      if (tentativeG < (gScore[key(n)] ?? Infinity)) {
        cameFrom[key(n)] = current; gScore[key(n)] = tentativeG;
        fScore[key(n)] = tentativeG + heuristic(n, goal);
        if (!openSet.some(p => p.x === n.x && p.y === n.y)) openSet.push(n);
      }
    }
  }
  return [];
}
function randomWalkable() {
  let x, y;
  do { x = Math.floor(Math.random() * GRID_SIZE); y = Math.floor(Math.random() * GRID_SIZE); } while (!isWalkable(x, y));
  return { x, y };
}
let tasks = [], taskIdCounter = 0, tasksCompleted = 0;
function spawnTask() { tasks.push({ id: taskIdCounter++, pickup: randomWalkable(), drop: randomWalkable(), assignedTo: null, stage: 'unassigned' }); }
function ensureTaskPool() {
  while (tasks.filter(t => t.stage !== 'done').length < NUM_TASKS) spawnTask();
  // Prevent unbounded memory growth: keep only the most recent 50 completed tasks.
  const doneTasks = tasks.filter(t => t.stage === 'done');
  if (doneTasks.length > 50) {
    const toRemove = doneTasks.length - 50;
    const removeIds = new Set(doneTasks.slice(0, toRemove).map(t => t.id));
    tasks = tasks.filter(t => !removeIds.has(t.id));
  }
}
let robots = [], collisionCount = 0, deadlockResolutions = 0, reroutesFromBlockage = 0;
function distance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function assignTaskToRobot(r) {
  ensureTaskPool();
  const unassigned = tasks.filter(t => t.stage === 'unassigned');
  if (unassigned.length === 0) { r.status = 'idle'; r.currentTask = null; return; }
  let best = unassigned[0]; let bestDist = distance(r, best.pickup);
  for (const t of unassigned) { const d = distance(r, t.pickup); if (d < bestDist) { best = t; bestDist = d; } }
  best.assignedTo = r.id; best.stage = 'to_pickup'; r.currentTask = best.id;
  r.path = astar({ x: r.x, y: r.y }, best.pickup); r.path.shift(); r.status = 'moving';
}
function initRobots() {
  robots = []; tasks = []; taskIdCounter = 0; tasksCompleted = 0; dynamicBlocks.clear(); ensureTaskPool();
  for (let i = 0; i < NUM_ROBOTS; i++) {
    const start = randomWalkable();
    const r = { id: i, x: start.x, y: start.y, battery: 100, status: 'idle', path: [], currentTask: null, waitTicks: 0 };
    assignTaskToRobot(r); robots.push(r);
  }
}
initRobots();
function replanIfPathBlocked(r) {
  const stillValid = r.path.every(p => isWalkable(p.x, p.y));
  if (!stillValid && r.path.length > 0) {
    const goal = r.path[r.path.length - 1];
    r.path = astar({ x: r.x, y: r.y }, goal);
    r.status = r.path.length > 0 ? 'rerouted' : 'idle';
    reroutesFromBlockage++;
  }
}

// ===================== P2P DECENTRALIZED LAYER =====================
// Har robot apna intent independently broadcast karta hai bus par.
// Koi central authority "sabke liye" decide nahi karti — har robot
// apne neighbours ka last-known broadcast padhta hai aur khud faisla
// karta hai ki move kare ya wait kare (local rule: lowest-id-wins on
// a contested cell — yehi rule hai jo real distributed systems mein
// "token/priority based mutual exclusion" ke naam se jaana jaata hai).
function broadcastIntents(robots) {
  robots.forEach(r => {
    const next = r.path.length > 0 ? r.path[0] : { x: r.x, y: r.y };
    p2pBus.broadcast(r.id, { x: r.x, y: r.y, next, status: r.status, battery: r.battery });
  });
}

function decideMoveDecentralized(robot, next) {
  // Har robot apne neighbours ka broadcast state padhta hai (koi
  // central object nahi bhejta — bus sirf relay hai, decision yahin
  // local function mein ho raha hai, per robot, independently).
  const neighborStates = p2pBus.getNeighborStates(robot.id);
  let contested = false;
  let loses = false;
  for (const [idStr, state] of Object.entries(neighborStates)) {
    const otherId = Number(idStr);
    if (state.next.x === next.x && state.next.y === next.y) {
      contested = true;
      if (otherId < robot.id) loses = true; // lower id gets local priority token
    }
    // swap/head-on conflict: other robot's next cell is my current cell,
    // and my next cell is their current cell
    if (state.next.x === robot.x && state.next.y === robot.y &&
        next.x === state.x && next.y === state.y) {
      contested = true;
      if (otherId < robot.id) loses = true;
    }
  }
  return { contested, loses };
}

function moveRobots() {
  robots.forEach(r => replanIfPathBlocked(r));

  // Step 1: resolve arrivals first so newly assigned tasks get a fresh path
  robots.forEach(r => {
    if (r.path.length === 0 && r.status !== 'waiting') handleArrival(r);
  });

  // Step 2: broadcast the CURRENT intent after arrival/task assignment
  broadcastIntents(robots);

  // Step 3: every robot independently decides move/wait using ONLY neighbor broadcasts
  const decisions = robots.map(r => {
    const next = r.path.length > 0 ? r.path[0] : { x: r.x, y: r.y };
    const { contested, loses } = decideMoveDecentralized(r, next);
    if (contested && loses) {
      r.status = 'waiting'; r.waitTicks++; collisionCount++;
      return { robot: r, next, move: false };
    }
    return { robot: r, next, move: true };
  });

  decisions.forEach(({ robot, next, move }) => {
    if (!move) return;
    robot.x = next.x; robot.y = next.y;
    if (robot.path.length > 0) robot.path.shift();
    robot.battery = Math.max(0, robot.battery - 0.05);
    robot.waitTicks = 0;
    if (robot.path.length > 0) robot.status = 'moving';
  });

  robots.forEach(r => {
    if (r.status === 'waiting' && r.waitTicks >= STUCK_LIMIT) {
      const blockedCell = r.path.length > 0 ? r.path[0] : null;
      const goal = r.path.length > 0 ? r.path[r.path.length - 1] : { x: r.x, y: r.y };
      const newPath = astar({ x: r.x, y: r.y }, goal, blockedCell);
      deadlockResolutions++; r.waitTicks = 0;
      if (newPath.length > 0) {
        newPath.shift();
        r.path = newPath;
        r.status = 'rerouted';
      } else {
        r.status = 'waiting';
      }
    }
  });
}
// ===================== END P2P DECENTRALIZED LAYER =====================

function handleArrival(r) {
  const task = tasks.find(t => t.id === r.currentTask);
  if (!task) { assignTaskToRobot(r); return; }
  if (task.stage === 'to_pickup') {
    task.stage = 'to_drop'; r.path = astar({ x: r.x, y: r.y }, task.drop); r.path.shift(); r.status = 'moving';
  } else if (task.stage === 'to_drop') {
    task.stage = 'done'; tasksCompleted++; r.currentTask = null; assignTaskToRobot(r);
  }
}
app.use(express.json());
app.post('/block', (req, res) => {
  const { x, y } = req.body;
  if (isWalkable(x, y)) dynamicBlocks.add(`${x},${y}`);
  res.json({ ok: true, blocks: Array.from(dynamicBlocks) });
});
app.post('/unblock', (req, res) => {
  const { x, y } = req.body;
  dynamicBlocks.delete(`${x},${y}`);
  res.json({ ok: true, blocks: Array.from(dynamicBlocks) });
});
function runBenchmark() {
  const FIXED_SEED_TASKS = 10;
  const results = {};
  const savedDynamicBlocks = dynamicBlocks;
  dynamicBlocks = new Set();
  // Force ALL robots through a SINGLE chokepoint (10,8) by walling off
  // the entire rows 8 and 12 across the full grid width, leaving only
  // (10,8) open. The base wall only spans columns 5-14, so robots were
  // previously walking around it unobstructed - this closes that gap.
  for (let x = 0; x < GRID_SIZE; x++) {
    if (x !== 10) dynamicBlocks.add(`${x},8`);
    if (x !== 10) dynamicBlocks.add(`${x},12`);
  }
  const fixedStarts = [
    { x: 2, y: 2 },
    { x: 17, y: 2 },
    { x: 2, y: 17 },
    { x: 17, y: 17 }
  ];
  const fixedTargets = [
    { x: 17, y: 17 },
    { x: 2, y: 17 },
    { x: 17, y: 2 },
    { x: 2, y: 2 },
    { x: 10, y: 10 }
  ];
  for (const mode of ['decentralized', 'stopAndWait']) {
    let simRobots = [];
    let simTasksCompleted = 0;
    let tick = 0;
    const MAX_TICKS = 5000;
    for (let i = 0; i < NUM_ROBOTS; i++) {
      const start = fixedStarts[i];
      simRobots.push({ id: i, x: start.x, y: start.y, path: [], target: null, waitTicks: 0 });
    }
    let targetIndex = 0;
    function newTarget(r) {
      r.target = fixedTargets[targetIndex % fixedTargets.length];
      targetIndex++;
      r.path = astar({ x: r.x, y: r.y }, r.target);
      if (r.path.length > 0) r.path.shift();
    }
    simRobots.forEach(r => newTarget(r));
    while (simTasksCompleted < FIXED_SEED_TASKS && tick < MAX_TICKS) {
      tick++;
      const intents = simRobots.map(r => {
        if (r.path.length === 0) { simTasksCompleted++; newTarget(r); }
        const next = r.path.length > 0 ? r.path[0] : { x: r.x, y: r.y };
        return { robot: r, next };
      });
      const cellClaims = {};
      intents.forEach(({ robot, next }) => {
        const k = `${next.x},${next.y}`;
        if (!cellClaims[k]) cellClaims[k] = [];
        cellClaims[k].push(robot);
      });
      const allowed = new Set();
      Object.values(cellClaims).forEach(claimants => {
        if (claimants.length === 1) {
          allowed.add(claimants[0].id);
        } else {
          if (mode === 'decentralized') {
            claimants.sort((a, b) => a.id - b.id);
            allowed.add(claimants[0].id);
            claimants.slice(1).forEach(r => { r.waitTicks++; });
          } else {
            claimants.forEach(r => { r.waitTicks += 3; });
          }
        }
      });
      intents.forEach(({ robot, next }) => {
        if (!allowed.has(robot.id)) return;
        robot.x = next.x; robot.y = next.y;
        if (robot.path.length > 0) robot.path.shift();
      });
    }
    results[mode] = { ticks: tick };
  }
  const improvement = ((results.stopAndWait.ticks - results.decentralized.ticks) / results.stopAndWait.ticks) * 100;
  const result = {
    decentralizedTicks: results.decentralized.ticks,
    stopAndWaitTicks: results.stopAndWait.ticks,
    improvementPercent: improvement.toFixed(1)
  };
  dynamicBlocks = savedDynamicBlocks;
  return result;
}
app.get('/api/tasks', (req, res) => { res.json(tasks); });
app.get('/benchmark', (req, res) => { const result = runBenchmark(); res.json(result); });
app.post('/api/run-benchmark', (req, res) => {
  const result = runBenchmark();
  const payload = JSON.stringify({ type: 'benchmark-result', result });
  wss.clients.forEach(client => client.send(payload));
  res.json(result);
});
wss.on('connection', (ws) => {
  console.log('Dashboard connected');
  ws.send(JSON.stringify({ type: 'init', grid: baseGrid, robots, tasks, dynamicBlocks: Array.from(dynamicBlocks) }));
});
setInterval(() => {
  moveRobots();
  const data = JSON.stringify({ type: 'update', robots, tasks, collisionCount, deadlockResolutions, tasksCompleted, reroutesFromBlockage, dynamicBlocks: Array.from(dynamicBlocks), p2pActive: true });
  wss.clients.forEach(client => client.send(data));
}, TICK_MS);
const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => console.log(`Backend running on port ${PORT}`));
