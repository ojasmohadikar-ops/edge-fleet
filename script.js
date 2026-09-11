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

                // Robots
                if (data.robots) {
                    updateRobotCards(data.robots);
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

    // Update nav button highlight
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('active');
    }
}
