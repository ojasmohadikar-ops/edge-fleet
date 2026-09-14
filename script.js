// ================= EDGE-FLEET FRONTEND CONFIG =================

const API_URL = "https://edge-fleet-production.up.railway.app";

// ================= TASK ALLOCATION API =================

async function loadTasks() {
    try {
        const response = await fetch(`${API_URL}/api/tasks`);

        if (!response.ok) {
            throw new Error(`Task API request failed: ${response.status}`);
        }

        const tasks = await response.json();

        console.log("Backend Tasks:", tasks);

        updateTaskTable(tasks);

    } catch (error) {
        console.error("Task API Error:", error);
    }
}

// ================= UPDATE TASK TABLE =================

function updateTaskTable(tasks) {
    const tableBody = document.querySelector("#taskAllocationTable tbody");

    if (!tableBody) {
        console.log("Task Allocation table not found");
        return;
    }

    tableBody.innerHTML = "";

    tasks.forEach(task => {
        const row = document.createElement("tr");

        const pickup = task.pickup
            ? `(${task.pickup.x}, ${task.pickup.y})`
            : "-";

        const drop = task.drop
            ? `(${task.drop.x}, ${task.drop.y})`
            : "-";

        const robot = task.assignedTo !== null && task.assignedTo !== undefined
            ? `Robot ${task.assignedTo}`
            : "Unassigned";

        const status = task.stage || "unassigned";

        row.innerHTML = `
            <td>${task.id}</td>
            <td>${pickup}</td>
            <td>${drop}</td>
            <td>${robot}</td>
            <td>${status}</td>
        `;

        tableBody.appendChild(row);
    });
}

// ================= LOAD TASKS =================

loadTasks();


// ================= WEBSOCKET CONNECTION =================

let socket;

function connectWebSocket() {

    try {

        socket = new WebSocket("wss://edge-fleet-production.up.railway.app");

        socket.onopen = () => {
            console.log("EDGE-FLEET WebSocket Connected");
        };

        socket.onmessage = (event) => {

            try {

                const data = JSON.parse(event.data);

                console.log("Live Simulation Update:", data);

                if (data.gridSize) {
                    GRID_SIZE = data.gridSize;
                }

                updateLiveEvents(data);

                // Robots
                if (data.robots) {
                    updateRobotCards(data.robots);
                    updateRobotPositions(data.robots);
                    updateAnalyticsCharts(data);
                }

                // Tasks
                if (data.tasks) {
                    updateTaskTable(data.tasks);
                }

                // Metrics
                if (data.collisionCount !== undefined) {
                    updateMetric(
                        "collisionCount",
                        data.collisionCount
                    );
                }

                if (data.deadlockResolutions !== undefined) {
                    updateMetric(
                        "deadlockResolutions",
                        data.deadlockResolutions
                    );
                }

                if (data.tasksCompleted !== undefined) {
                    updateMetric(
                        "tasksCompleted",
                        data.tasksCompleted
                    );
                }

                if (data.reroutesFromBlockage !== undefined) {
                    updateMetric(
                        "reroutesFromBlockage",
                        data.reroutesFromBlockage
                    );
                }

                if (data.type === 'benchmark-result') {
                    renderBenchmarkResult(data.result);
                }

            } catch (error) {

                console.error(
                    "WebSocket Data Error:",
                    error
                );

            }
        };

        socket.onerror = (error) => {
            console.error(
                "WebSocket Error:",
                error
            );
        };

        socket.onclose = () => {

            console.log(
                "WebSocket disconnected. Retrying..."
            );

            setTimeout(
                connectWebSocket,
                3000
            );
        };

    } catch (error) {

        console.error(
            "WebSocket Connection Error:",
            error
        );
    }
}

// ================= LIVE P2P EVENTS =================
let lastEventState = { collisionCount: 0, deadlockResolutions: 0, reroutesFromBlockage: 0 };

function addLiveEvent(message) {
    const list = document.getElementById("eventList");
    if (!list) return;

    if (list.querySelector("p")?.textContent === "Waiting for live events...") {
        list.innerHTML = "";
    }

    const item = document.createElement("p");
    item.style.margin = "8px 0";
    item.textContent = "• " + message;
    list.prepend(item);

    while (list.children.length > 6) {
        list.removeChild(list.lastChild);
    }
}

function updateLiveEvents(data) {
    if (data.collisionCount > lastEventState.collisionCount) {
        addLiveEvent("⚠️ Collision avoidance: Robot priority/wait decision triggered.");
    }

    if (data.deadlockResolutions > lastEventState.deadlockResolutions) {
        addLiveEvent("🔄 Deadlock resolved: P2P priority reassigned and robot rerouted.");
    }

    if (data.reroutesFromBlockage > lastEventState.reroutesFromBlockage) {
        addLiveEvent("🚧 Aisle blockage detected: Robot route recalculated.");
    }

    lastEventState.collisionCount = data.collisionCount ?? lastEventState.collisionCount;
    lastEventState.deadlockResolutions = data.deadlockResolutions ?? lastEventState.deadlockResolutions;
    lastEventState.reroutesFromBlockage = data.reroutesFromBlockage ?? lastEventState.reroutesFromBlockage;
}

// ================= UPDATE METRICS =================

function updateMetric(id, value) {

    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}


// ================= BENCHMARK =================

async function loadBenchmark() {

    try {

        const response =
            await fetch(`${API_URL}/benchmark`);

        if (!response.ok) {
            throw new Error(
                "Benchmark API failed"
            );
        }

        const result =
            await response.json();

        console.log(
            "Benchmark Result:",
            result
        );

        if (
            result.improvementPercent !==
            undefined
        ) {

            updateMetric(
                "improvementPercent",
                `${result.improvementPercent}%`
            );

        }

    } catch (error) {

        console.error(
            "Benchmark Error:",
            error
        );

    }
}


// ================= START =================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        console.log(
            "EDGE-FLEET Frontend Started 🚛"
        );

        connectWebSocket();

        loadTasks();

        loadBenchmark();

    }
);
// ================= LIVE ROBOT RENDERING =================
function updateRobotCards(robots) {
    const statusContainer = document.querySelector('.robot-status');
    const cardsContainer = document.querySelector('.robot-cards');
    if (!statusContainer || !cardsContainer) return;

    statusContainer.innerHTML = '';
    cardsContainer.innerHTML = '';

    robots.forEach((r) => {
        const label = `R${r.id + 1}`;
        const battery = Math.round(r.battery);
        const taskLabel = r.currentTask !== null && r.currentTask !== undefined
            ? `Task T-${r.currentTask}` : 'Idle';
        const statusLabel = r.status
            ? r.status.charAt(0).toUpperCase() + r.status.slice(1)
            : 'Unknown';

        // Top "Robot Status" panel row
        const row = document.createElement('div');
        row.className = 'robot-row';
        row.innerHTML = `
            <div class="robot-id">${label}</div>
            <div>
                <b>Robot 0${r.id + 1}</b>
                <p>${statusLabel} • ${taskLabel}</p>
            </div>
            <strong>${battery}%</strong>
        `;
        statusContainer.appendChild(row);

        // Bottom "Robot Fleet" cards
        const card = document.createElement('div');
        card.className = 'robot-card';
        card.innerHTML = `
            <h2>Robot 0${r.id + 1}</h2>
            <p>Status: <b>${statusLabel}</b></p>
            <p>Battery: ${battery}%</p>
            <p>${taskLabel}</p>
            <p>Position: (${r.x}, ${r.y})</p>
        `;
        cardsContainer.appendChild(card);
    });
}

// ================= BENCHMARK BUTTON =================
function setupBenchmarkButton() {
    const btn = document.getElementById('runBenchmarkBtn');
    const resultBox = document.getElementById('benchmarkResult');
    if (!btn || !resultBox) {
        console.warn('Benchmark button or result box not found in DOM yet.');
        return;
    }
    console.log('Benchmark button wired up successfully.');

    btn.addEventListener('click', async () => {
        console.log('Run Benchmark clicked');
        btn.disabled = true;
        btn.textContent = 'Running...';
        resultBox.innerHTML = '<i>Simulating decentralized vs stop-and-wait...</i>';

        try {
            const res = await fetch('/api/run-benchmark', { method: 'POST' });
            const data = await res.json();
            renderBenchmarkResult(data);
        } catch (err) {
            resultBox.innerHTML = '<span style="color:red;">Benchmark failed. Is the server running?</span>';
            console.error('Benchmark error:', err);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Run Benchmark';
        }
    });
}
setupBenchmarkButton();
document.addEventListener('DOMContentLoaded', setupBenchmarkButton);

function renderBenchmarkResult(data) {
    const resultBox = document.getElementById('benchmarkResult');
    if (!resultBox) return;
    resultBox.innerHTML = `
        <div><b>Decentralized:</b> ${data.decentralizedTicks} ticks</div>
        <div><b>Stop-and-Wait:</b> ${data.stopAndWaitTicks} ticks</div>
        <div style="margin-top:8px;font-size:20px;font-weight:700;color:#16a34a;">
            ${data.improvementPercent}% faster
        </div>
    `;
}

// ================= BENCHMARK BUTTON =================
function setupBenchmarkButton() {
    const btn = document.getElementById('runBenchmarkBtn');
    const resultBox = document.getElementById('benchmarkResult');
    if (!btn || !resultBox) {
        console.warn('Benchmark button or result box not found in DOM yet.');
        return;
    }
    console.log('Benchmark button wired up successfully.');

    btn.addEventListener('click', async () => {
        console.log('Run Benchmark clicked');
        btn.disabled = true;
        btn.textContent = 'Running...';
        resultBox.innerHTML = '<i>Simulating decentralized vs stop-and-wait...</i>';

        try {
            const res = await fetch('/api/run-benchmark', { method: 'POST' });
            const data = await res.json();
            renderBenchmarkResult(data);
        } catch (err) {
            resultBox.innerHTML = '<span style="color:red;">Benchmark failed. Is the server running?</span>';
            console.error('Benchmark error:', err);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Run Benchmark';
        }
    });
}
setupBenchmarkButton();
document.addEventListener('DOMContentLoaded', setupBenchmarkButton);

function renderBenchmarkResult(data) {
    const resultBox = document.getElementById('benchmarkResult');
    if (!resultBox) return;
    resultBox.innerHTML = `
        <div><b>Decentralized:</b> ${data.decentralizedTicks} ticks</div>
        <div><b>Stop-and-Wait:</b> ${data.stopAndWaitTicks} ticks</div>
        <div style="margin-top:8px;font-size:20px;font-weight:700;color:#16a34a;">
            ${data.improvementPercent}% faster
        </div>
    `;
}

// ================= PAGE NAVIGATION =================
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    // Show the selected page
    const target = document.getElementById(pageId);
    if (target) {
        target.classList.add('active');
    } else {
        console.warn('No page found with id:', pageId);
    }

    // Analytics charts need a resize/redraw once their canvas becomes visible
    if (pageId === 'analytics') {
        initCharts();
        setTimeout(() => {
            [taskChart, collisionChart, batteryChart, efficiencyChart].forEach(c => {
                if (c) { c.resize(); c.update(); }
            });
        }, 50);
    }

    // Update nav button highlight
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('active');
    }
}

// ================= LIVE ROBOT POSITION UPDATE =================
let GRID_SIZE = 20;

function updateRobotPositions(robots) {
    const robotEls = [
        document.querySelector('.robot1'),
        document.querySelector('.robot2'),
        document.querySelector('.robot3'),
        document.querySelector('.robot4')
    ];

    // Ensure R4 has the same visual base class as the other robots
    const r4 = document.querySelector('.robot4');
    if (r4) {
        r4.classList.add('robot');
        r4.style.width = '35px';
        r4.style.height = '35px';
        r4.style.display = 'flex';
        r4.style.alignItems = 'center';
        r4.style.justifyContent = 'center';
        r4.style.borderRadius = '8px';
        r4.style.background = '#22c55e';
        r4.style.color = '#06130a';
        r4.style.border = '2px solid rgba(255,255,255,0.8)';
        r4.style.boxShadow = '0 0 14px rgba(34,197,94,0.65)';
        r4.style.zIndex = '50';
    }

    const simEls = [
        document.querySelector('.sim-r1'),
        document.querySelector('.sim-r2'),
        document.querySelector('.sim-r3'),
        document.querySelector('.sim-r4')
    ];

    robots.forEach((robot, i) => {
        const el = robotEls[i];
        const simEl = simEls[i];

        if (robot.x === undefined || robot.y === undefined) return;

        const leftPct = (robot.x / (GRID_SIZE - 1)) * 100;
        const topPct = (robot.y / (GRID_SIZE - 1)) * 100;

        [el, simEl].forEach(target => {
            if (!target) return;

            target.style.left = leftPct + '%';
            target.style.top = topPct + '%';
            target.style.right = 'auto';

            target.style.transition =
                'left 850ms cubic-bezier(0.22, 1, 0.36, 1), ' +
                'top 850ms cubic-bezier(0.22, 1, 0.36, 1), ' +
                'transform 250ms ease';

            target.style.willChange = 'left, top, transform';
        });
    });
}

/* ================= SIMULATION CONTROLS ================= */

let simulationRunning = false;

async function startSimulation() {
    try {
        const response = await fetch(`${API_URL}/toggle-simulation`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error("Simulation toggle request failed");
        }

        const data = await response.json();

        simulationRunning = Boolean(data.running);

        addLiveEvent(
            simulationRunning
                ? "▶️ Simulation started: multi-robot P2P coordination active."
                : "⏸️ Simulation paused."
        );

        console.log(
            simulationRunning
                ? "🚀 Backend simulation RUNNING"
                : "⏸️ Backend simulation PAUSED"
        );

    } catch (error) {
        console.error("Simulation control error:", error);
        addLiveEvent("❌ Unable to control backend simulation.");
    }
}

async function blockAisle() {
    try {
        const x = Math.floor(Math.random() * 18) + 1;
        const y = Math.floor(Math.random() * 18) + 1;

        const response = await fetch(`${API_URL}/block`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ x, y })
        });

        if (!response.ok) throw new Error("Block request failed");

        addLiveEvent(`🚧 Dynamic aisle blocked at (${x}, ${y}).`);
    } catch (error) {
        console.error("Block aisle error:", error);
        addLiveEvent("❌ Unable to block aisle.");
    }
}

async function rerouteRobot() {
    addLiveEvent("🔄 AI reroute triggered: robots recalculating optimal paths.");
}

function simulateEvent() {
    addLiveEvent("📡 P2P event simulated: robots exchanged movement intents.");
}


// ================= LOGIN HANDLING =================
function handleLogin(event) {
    event.preventDefault();
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();

    if (user === 'admin' && pass === 'admin123') {
        document.getElementById('loginScreen').style.display = 'none';
        sessionStorage.setItem('edgefleet_logged_in', 'true');
        if (sessionStorage.getItem('edgefleet_configured') === 'true') {
            document.getElementById('appRoot').classList.remove('app-hidden');
        } else {
            document.getElementById('setupScreen').classList.remove('app-hidden');
        }
    } else {
        alert('Invalid credentials. Use admin / admin123');
    }
    return false;
}

async function handleSetup(event) {
    event.preventDefault();
    const gridSize = parseInt(document.getElementById('setupGridSize').value, 10);
    const numRobots = parseInt(document.getElementById('setupNumRobots').value, 10);

    try {
        const response = await fetch(`${API_URL}/configure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gridSize, numRobots })
        });
        if (!response.ok) throw new Error('Configure failed');

        sessionStorage.setItem('edgefleet_configured', 'true');
        document.getElementById('setupScreen').classList.add('app-hidden');
        document.getElementById('appRoot').classList.remove('app-hidden');
    } catch (error) {
        alert('Failed to configure warehouse. Check console for details.');
        console.error('Setup error:', error);
    }
    return false;
}

// Auto-skip login/setup if already done this session
// Auto-skip removed: login screen always shows first on page load.

// ================= ANALYTICS CHARTS =================
const MAX_HISTORY_POINTS = 30;
const chartHistory = {
    labels: [],
    tasksCompleted: [],
    collisions: [],
    deadlocks: [],
    efficiency: [],
    batteryByRobot: {}
};

let chartsInitialized = false;
let taskChart, collisionChart, batteryChart, efficiencyChart;

function initCharts() {
    if (chartsInitialized) return;
    const tasksCanvas = document.getElementById('chartTasks');
    const collisionsCanvas = document.getElementById('chartCollisions');
    const batteryCanvas = document.getElementById('chartBattery');
    const efficiencyCanvas = document.getElementById('chartEfficiency');
    const debugEl = document.getElementById('chartDebugStatus');
    if (!tasksCanvas || !collisionsCanvas || !batteryCanvas || !efficiencyCanvas) {
        if (debugEl) debugEl.textContent = 'DEBUG: canvas elements not found in DOM';
        return;
    }
    if (typeof Chart === 'undefined') {
        if (debugEl) debugEl.textContent = 'DEBUG: Chart.js library did not load';
        return;
    }
    if (debugEl) debugEl.textContent = 'DEBUG: initCharts() ran successfully, Chart.js loaded';

    const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 } } } },
        scales: {
            x: { ticks: { font: { size: 9 } } },
            y: { beginAtZero: true, ticks: { font: { size: 9 } } }
        }
    };

    taskChart = new Chart(tasksCanvas, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Tasks Completed', data: [], borderColor: '#065a82', backgroundColor: 'rgba(6,90,130,0.1)', fill: true, tension: 0.3 }] },
        options: baseOptions
    });

    collisionChart = new Chart(collisionsCanvas, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'Collisions', data: [], borderColor: '#c0392b', backgroundColor: 'rgba(192,57,43,0.1)', fill: true, tension: 0.3 },
            { label: 'Deadlock Resolutions', data: [], borderColor: '#f2a93b', backgroundColor: 'rgba(242,169,59,0.1)', fill: true, tension: 0.3 }
        ] },
        options: baseOptions
    });

    batteryChart = new Chart(batteryCanvas, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: baseOptions
    });

    efficiencyChart = new Chart(efficiencyCanvas, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Efficiency %', data: [], borderColor: '#02c39a', backgroundColor: 'rgba(2,195,154,0.1)', fill: true, tension: 0.3 }] },
        options: baseOptions
    });

    chartsInitialized = true;
}

function pushHistory(arr, value) {
    arr.push(value);
    if (arr.length > MAX_HISTORY_POINTS) arr.shift();
}

function updateAnalyticsCharts(data) {
    if (!data.robots) return;
    const debugEl2 = document.getElementById('chartDebugStatus');
    if (!chartsInitialized) {
        if (debugEl2) debugEl2.textContent = 'DEBUG: waiting for charts to initialize (open Analytics tab)';
        return;
    }
    if (debugEl2) debugEl2.textContent = 'DEBUG: data points collected = ' + chartHistory.labels.length;

    const timeLabel = new Date().toLocaleTimeString('en-IN', { hour12: false });
    pushHistory(chartHistory.labels, timeLabel);
    pushHistory(chartHistory.tasksCompleted, data.tasksCompleted || 0);
    pushHistory(chartHistory.collisions, data.collisionCount || 0);
    pushHistory(chartHistory.deadlocks, data.deadlockResolutions || 0);

    const totalBattery = data.robots.reduce((sum, r) => sum + (r.battery || 0), 0);
    const avgBattery = data.robots.length ? totalBattery / data.robots.length : 0;
    const baselineTime = 100;
    const estEfficiency = data.tasksCompleted ? Math.min(99, ((data.tasksCompleted * 5) / baselineTime) * 24) : 0;
    pushHistory(chartHistory.efficiency, Math.round(estEfficiency));

    data.robots.forEach(r => {
        const key = `R${r.id + 1}`;
        if (!chartHistory.batteryByRobot[key]) chartHistory.batteryByRobot[key] = [];
        pushHistory(chartHistory.batteryByRobot[key], Math.round(r.battery));
    });

    taskChart.data.labels = chartHistory.labels;
    taskChart.data.datasets[0].data = chartHistory.tasksCompleted;
    taskChart.update();

    collisionChart.data.labels = chartHistory.labels;
    collisionChart.data.datasets[0].data = chartHistory.collisions;
    collisionChart.data.datasets[1].data = chartHistory.deadlocks;
    collisionChart.update();

    const batteryColors = ['#00d4ff', '#a878ff', '#ffb84d', '#02c39a'];
    batteryChart.data.labels = chartHistory.labels;
    batteryChart.data.datasets = Object.keys(chartHistory.batteryByRobot).map((key, i) => ({
        label: key,
        data: chartHistory.batteryByRobot[key],
        borderColor: batteryColors[i % batteryColors.length],
        fill: false,
        tension: 0.3
    }));
    batteryChart.update();

    efficiencyChart.data.labels = chartHistory.labels;
    efficiencyChart.data.datasets[0].data = chartHistory.efficiency;
    efficiencyChart.update();
}

/* ================= REGISTER + SETUP ================= */

function showRegister() {
    const user = prompt("Create Operator ID:");
    if (!user) return;

    const pass = prompt("Create Password:");
    if (!pass) return;

    localStorage.setItem("edgeFleetUser", user);
    localStorage.setItem("edgeFleetPass", pass);

    alert("Registration successful! You can now sign in.");
}

function saveFleetSetup() {
    const setup = {
        warehouseName: document.getElementById("warehouseName")?.value || "",
        warehouseLocation: document.getElementById("warehouseLocation")?.value || "",
        warehouseGrid: document.getElementById("warehouseGrid")?.value || "",
        warehouseRobots: document.getElementById("warehouseRobots")?.value || "",
        robotId: document.getElementById("robotId")?.value || "",
        robotName: document.getElementById("robotName")?.value || "",
        robotType: document.getElementById("robotType")?.value || "",
        robotBattery: document.getElementById("robotBattery")?.value || ""
    };

    localStorage.setItem("edgeFleetSetup", JSON.stringify(setup));
    displayFleetSetup();
    alert("Setup saved successfully!");
}

function displayFleetSetup() {
    const box = document.getElementById("savedSetupInfo");
    if (!box) return;

    const raw = localStorage.getItem("edgeFleetSetup");

    if (!raw) {
        box.innerHTML = "<p>No setup information saved yet.</p>";
        return;
    }

    const s = JSON.parse(raw);

    box.innerHTML = `
        <div class="setup-saved-grid">
            <div>
                <strong>🏭 Warehouse</strong>
                <p>Name: ${s.warehouseName || "-"}</p>
                <p>Location: ${s.warehouseLocation || "-"}</p>
                <p>Grid: ${s.warehouseGrid || "-"}</p>
                <p>Robots: ${s.warehouseRobots || "-"}</p>
            </div>

            <div>
                <strong>🤖 Robot</strong>
                <p>ID: ${s.robotId || "-"}</p>
                <p>Name: ${s.robotName || "-"}</p>
                <p>Type: ${s.robotType || "-"}</p>
                <p>Battery: ${s.robotBattery || 0}%</p>
            </div>
        </div>
    `;
}

document.addEventListener("DOMContentLoaded", displayFleetSetup);


/* ================= PROFESSIONAL REGISTRATION ================= */

function showRegisterPage() {
    const login = document.getElementById("loginScreen");
    const register = document.getElementById("registerScreen");
    const setup = document.getElementById("setupScreen");

    if (login) login.classList.add("app-hidden");
    if (setup) setup.classList.add("app-hidden");
    if (register) register.classList.remove("app-hidden");
}

function showLoginPage() {
    const login = document.getElementById("loginScreen");
    const register = document.getElementById("registerScreen");

    if (register) register.classList.add("app-hidden");
    if (login) login.classList.remove("app-hidden");
}

function handleRegister(event) {
    event.preventDefault();

    const name = document.getElementById("registerName").value.trim();
    const user = document.getElementById("registerUser").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const warehouse = document.getElementById("registerWarehouse").value.trim();
    const pass = document.getElementById("registerPass").value;
    const confirm = document.getElementById("registerConfirm").value;

    if (pass !== confirm) {
        alert("Passwords do not match.");
        return false;
    }

    if (pass.length < 6) {
        alert("Password must contain at least 6 characters.");
        return false;
    }

    const account = {
        name,
        user,
        email,
        warehouse,
        pass,
        registeredAt: new Date().toISOString()
    };

    localStorage.setItem("edgeFleetAccount", JSON.stringify(account));

    // Save operator information for dashboard/setup use
    localStorage.setItem("edgeFleetUser", user);
    localStorage.setItem("edgeFleetOperatorName", name);
    localStorage.setItem("edgeFleetWarehouse", warehouse);

    alert("Account created successfully! Welcome to EdgeFleet.");

    // Directly enter the application
    const registerScreen = document.getElementById("registerScreen");
    if (registerScreen) registerScreen.classList.add("app-hidden");

    const loginScreen = document.getElementById("loginScreen");
    if (loginScreen) loginScreen.classList.add("app-hidden");

    const setupScreen = document.getElementById("setupScreen");
    if (setupScreen) setupScreen.classList.add("app-hidden");

    const app = document.querySelector(".app");
    if (app) app.classList.remove("app-hidden");

    if (typeof showPage === "function") {
        showPage("dashboard");
    }

    return false;
}


/* ================= TRY DEMO ================= */

function tryDemo() {
    localStorage.setItem("edgeFleetUser", "demo");
    localStorage.setItem("edgeFleetOperatorName", "Demo Operator");
    localStorage.setItem("edgeFleetWarehouse", "EdgeFleet Smart Warehouse");

    const loginScreen = document.getElementById("loginScreen");
    const registerScreen = document.getElementById("registerScreen");
    const setupScreen = document.getElementById("setupScreen");
    const app = document.querySelector(".app");

    if (loginScreen) loginScreen.classList.add("app-hidden");
    if (registerScreen) registerScreen.classList.add("app-hidden");
    if (setupScreen) setupScreen.classList.add("app-hidden");

    if (app) app.classList.remove("app-hidden");

    if (typeof showPage === "function") {
        showPage("dashboard");
    }

    if (typeof startSimulation === "function") {
        setTimeout(() => {
            try {
                startSimulation();
            } catch (e) {
                console.log("Demo simulation start skipped:", e);
            }
        }, 500);
    }
}

