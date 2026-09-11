# EdgeFleet — Decentralized Edge-AI Fleet Coordination

**SIH Problem Statement 26123** — Bharat Electronics Limited
Edge-AI Based Distributed Fleet Coordination for Autonomous Mobile Robots (AMRs) in Smart Warehouses

## What this is
A simulated multi-robot warehouse fleet (4 AMRs) that coordinates
without a central brain — each robot independently broadcasts its
position/intent over a lightweight P2P message bus and decides
locally whether to move or yield, using an A*-based path planner and
a priority-based deadlock resolution rule.

## Features
- Decentralized P2P-style communication layer (p2pBus.js)
- A* path planning per robot
- Real-time collision detection & deadlock resolution
- Dynamic task allocation & re-routing around blocked aisles
- Live fleet dashboard (robot position, battery, task, status)
- One-click benchmark: decentralized priority-routing vs traditional stop-and-wait

## Run it
    npm install --prefix backend
    npm start

Then open http://localhost:4000 in your browser.

## Tech stack
Node.js, Express, WebSocket (ws), vanilla JS/HTML/CSS frontend.

## Benchmark result (chokepoint scenario)
| Mode | Ticks to complete 10 tasks |
|---|---|
| Stop-and-wait | 5000 (capped - deadlocked) |
| Decentralized priority routing | 60 |

98.8% faster, with zero inter-robot collisions.
