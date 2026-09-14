content = open('backend/server.js').read()
changes = 0

# 1. Add constants for charging station
old1 = "const NUM_ROBOTS = 4, GRID_SIZE = 20, TICK_MS = 300, STUCK_LIMIT = 3, NUM_TASKS = 6;"
new1 = old1 + "\nconst CHARGE_STATION = { x: 1, y: 1 };\nconst BATTERY_LOW_THRESHOLD = 20;\nconst CHARGE_RATE = 1.5;"
if old1 in content:
    content = content.replace(old1, new1)
    changes += 1
else:
    print("MISS 1: constants anchor not found")

# 2. Trigger heading-to-charge when battery low (inside moveRobots, right after replanIfPathBlocked)
old2 = "function moveRobots() {\n  robots.forEach(r => replanIfPathBlocked(r));"
new2 = """function moveRobots() {
  robots.forEach(r => replanIfPathBlocked(r));

  // Battery check — send low-battery robots to the charging station
  robots.forEach(r => {
    if (r.battery <= BATTERY_LOW_THRESHOLD && r.status !== 'charging' && r.status !== 'headingToCharge') {
      r.status = 'headingToCharge';
      r.path = astar({ x: r.x, y: r.y }, CHARGE_STATION);
      r.path.shift();
    }
  });"""
if old2 in content:
    content = content.replace(old2, new2)
    changes += 1
else:
    print("MISS 2: moveRobots start anchor not found")

# 3. Prevent false "arrival" trigger for charging robots + detect arrival at station
old3 = """  robots.forEach(r => {
    if (r.path.length === 0 && r.status !== 'waiting') handleArrival(r);
  });"""
new3 = """  robots.forEach(r => {
    if (r.status === 'headingToCharge' && r.path.length === 0) {
      r.status = 'charging';
      r.chargeTicks = 0;
      return;
    }
    if (r.path.length === 0 && r.status !== 'waiting' && r.status !== 'charging' && r.status !== 'headingToCharge') handleArrival(r);
  });"""
if old3 in content:
    content = content.replace(old3, new3)
    changes += 1
else:
    print("MISS 3: arrival trigger anchor not found")

# 4. Charging tick logic — add after the deadlock resolution block
old4 = """      if (newPath.length > 0) {
        newPath.shift();
        r.path = newPath;
        r.status = 'rerouted';
      } else {
        r.status = 'waiting';
      }
    }
  });
}"""
new4 = """      if (newPath.length > 0) {
        newPath.shift();
        r.path = newPath;
        r.status = 'rerouted';
      } else {
        r.status = 'waiting';
      }
    }
  });

  // Charging tick — robots at the station recharge gradually, then resume their task
  robots.forEach(r => {
    if (r.status === 'charging') {
      r.chargeTicks = (r.chargeTicks || 0) + 1;
      r.battery = Math.min(100, r.battery + CHARGE_RATE);
      if (r.battery >= 100) {
        const task = tasks.find(t => t.id === r.currentTask);
        if (task) {
          const target = task.stage === 'to_pickup' ? task.pickup : task.drop;
          r.path = astar({ x: r.x, y: r.y }, target);
          r.path.shift();
          r.status = r.path.length > 0 ? 'moving' : 'idle';
        } else {
          assignTaskToRobot(r);
        }
      }
    }
  });
}"""
if old4 in content:
    content = content.replace(old4, new4)
    changes += 1
else:
    print("MISS 4: deadlock block anchor not found")

print(f"Applied {changes}/4 changes")
if changes == 4:
    open('backend/server.js', 'w').write(content)
    print("File saved successfully")
else:
    print("NOT SAVED — fix misses first")
