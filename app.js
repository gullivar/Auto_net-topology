/**
 * SAGuard OT Topology PoC - Reserved Region Layout
 * Approach: Deterministic Slotting (Bin Packing) + Preset Layout
 */

// =============================================================================
// Settings
// =============================================================================
const SIM_INTERVAL_MS = 1000;

// CHANGED: 1.5 Seconds for fast cleanup
const EDGE_TIMEOUT_MS = 1500;

// Layout Constants
const NODE_SLOT_SIZE = 140;     // Node visual area (Width/Height)
const NODES_PER_ROW = 20;       // User Request: 20 per row
const ROWS_PER_ZONE = 2;        // User Request: 2 rows (Total 40)
const MAX_NODES_PER_ZONE = NODES_PER_ROW * ROWS_PER_ZONE; // 40

const ZONE_HEADER_HEIGHT = 100; // Space for Label
// Calculated Zone Dimensions
const ZONE_CONTENT_WIDTH = NODES_PER_ROW * NODE_SLOT_SIZE;
const ZONE_CONTENT_HEIGHT = ROWS_PER_ZONE * NODE_SLOT_SIZE;
const ZONE_TOTAL_HEIGHT = ZONE_HEADER_HEIGHT + ZONE_CONTENT_HEIGHT;

// CHANGED: Reduced from 500 to 250 (Half as requested)
const ZONE_GAP = 250;

// =============================================================================
// State
// =============================================================================
let cy;
let simInterval;
let isRunning = false;
const knownIPs = new Set();

// Layout State Manager
const zoneNodeCounts = {};  // { zoneId: currentCount }

// OT Subnet Definitions (Zones) - Vertical Stack
const OT_ZONES = [
    { id: 'zone_10', subnet: '192.168.10', name: 'Control Zone (192.168.10.x)', x: 0, y: 0, color: '#f0fdf4' },
    { id: 'zone_20', subnet: '192.168.20', name: 'Navi Zone (192.168.20.x)', x: 0, y: (ZONE_TOTAL_HEIGHT + ZONE_GAP) * 1, color: '#f0fdf4' },
    { id: 'zone_30', subnet: '192.168.30', name: 'Propulsion Zone (192.168.30.x)', x: 0, y: (ZONE_TOTAL_HEIGHT + ZONE_GAP) * 2, color: '#fffbeb' },
    { id: 'zone_40', subnet: '192.168.40', name: 'Cargo Zone (192.168.40.x)', x: 0, y: (ZONE_TOTAL_HEIGHT + ZONE_GAP) * 3, color: '#fdf2f8' },
    { id: 'zone_50', subnet: '192.168.50', name: 'Comm Zone (192.168.50.x)', x: 0, y: (ZONE_TOTAL_HEIGHT + ZONE_GAP) * 4, color: '#fef2f2' }
];

// Initialize State
OT_ZONES.forEach(z => {
    zoneNodeCounts[z.id] = 0;
});

// =============================================================================
// 1. Initialization
// =============================================================================

function initNetworkMap() {
    cy = cytoscape({
        container: document.getElementById('cy'),

        style: [
            {
                selector: 'node:parent', // Zone
                style: {
                    'label': 'data(label)',
                    'text-valign': 'top',
                    'text-halign': 'center',
                    'font-size': '36px',
                    'font-weight': 'bold',
                    'color': '#333',
                    'background-color': 'data(color)',
                    'border-width': 4,
                    'border-color': '#cbd5e1',
                    'shape': 'roundrectangle',
                    'padding': '0px'
                }
            },
            {
                selector: 'node[parent]', // Child nodes
                style: {
                    'label': 'data(label)',
                    'text-valign': 'bottom',
                    'text-halign': 'center',
                    'text-margin-y': 10,
                    'width': 60,
                    'height': 60,
                    'font-size': '18px',
                    'font-weight': 'bold',
                    'color': '#1e293b',
                    'background-color': '#2ecc71', // GREEN
                    'border-width': 3,
                    'border-color': '#fff',
                    'transition-property': 'background-color border-color',
                    'transition-duration': '0.3s'
                }
            },
            { selector: '.pc', style: { 'shape': 'rectangle' } },
            { selector: '.server', style: { 'shape': 'round-rectangle', 'width': 70 } },
            { selector: '.plc', style: { 'shape': 'diamond', 'width': 80, 'height': 80 } },
            { selector: '.firewall', style: { 'shape': 'hexagon', 'width': 90, 'height': 90, 'label': 'GW/FW' } },
            { selector: '.offline', style: { 'background-color': '#e74c3c', 'border-color': '#c0392b' } },
            { selector: '.online', style: { 'background-color': '#2ecc71' } },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#e2e8f0',
                    'curve-style': 'bezier',
                    'target-arrow-shape': 'triangle',
                    'target-arrow-color': '#e2e8f0',
                    'opacity': 0.7
                }
            },
            {
                selector: '.traffic-active',
                style: {
                    'width': 4,
                    'line-color': '#f59e0b',
                    'target-arrow-color': '#f59e0b',
                    'opacity': 1,
                    'z-index': 999
                }
            }
        ],
        layout: { name: 'preset' }
    });

    cy.on('tap', 'node', (evt) => {
        if (!evt.target.isParent()) showDetails(evt.target.data());
    });
    cy.on('dbltap', fitToScreen);

    initBaseData();
    fitToScreen();
}

function getNextSlotPosition(zoneId) {
    const zoneDef = OT_ZONES.find(z => z.id === zoneId);
    if (!zoneDef) return { x: 0, y: 0 };

    const slotIndex = zoneNodeCounts[zoneId];

    // Grid Logic within Zone
    const col = slotIndex % NODES_PER_ROW;
    const row = Math.floor(slotIndex / NODES_PER_ROW);

    const localX = (col * NODE_SLOT_SIZE) + (NODE_SLOT_SIZE / 2);
    const localY = ZONE_HEADER_HEIGHT + (row * NODE_SLOT_SIZE) + (NODE_SLOT_SIZE / 2);

    return {
        x: zoneDef.x + localX,
        y: zoneDef.y + localY
    };
}

function initBaseData() {
    cy.batch(() => {
        OT_ZONES.forEach(zone => {
            cy.add({
                group: 'nodes',
                data: { id: zone.id, label: zone.name, color: zone.color },
                classes: 'zone'
            });

            addZoneAnchors(zone);

            // Default Assets
            createNode(zone.subnet, 1, zone.id, 'Firewall'); // Gateway
            const count = 3;
            for (let i = 0; i < count; i++) {
                createNode(zone.subnet, i + 10, zone.id);
            }
        });
    });
}

function addZoneAnchors(zone) {
    // Top-Left (Padding Top ~80px)
    cy.add({ data: { id: `${zone.id}_tl`, parent: zone.id }, position: { x: zone.x - 50, y: zone.y - 80 }, style: { width: 1, height: 1, opacity: 0, events: 'no' } });
    // Bottom-Right (Padding Bottom ~50px)
    cy.add({ data: { id: `${zone.id}_br`, parent: zone.id }, position: { x: zone.x + ZONE_CONTENT_WIDTH + 50, y: zone.y + ZONE_TOTAL_HEIGHT + 50 }, style: { width: 1, height: 1, opacity: 0, events: 'no' } });
}

// =============================================================================
// Simulation
// =============================================================================

window.startSimulation = function () {
    if (isRunning) return;
    isRunning = true;
    const statusEl = document.getElementById('log-status');
    if (statusEl) statusEl.innerText = "Running...";

    simInterval = setInterval(() => {
        simulateTrafficEvent();

        if (Math.random() < 0.05) {
            simulateScanEvent();
        }

        pruneStaleEdges();

    }, SIM_INTERVAL_MS);
};

window.stopSimulation = function () {
    isRunning = false;
    clearInterval(simInterval);
    const statusEl = document.getElementById('log-status');
    if (statusEl) statusEl.innerText = "Paused";
};

window.fitToScreen = function () {
    cy.fit(undefined, 50);
};

window.resetLayout = function () {
    location.reload();
};

function pruneStaleEdges() {
    const now = Date.now();
    cy.edges().forEach(edge => {
        const lastSeen = edge.data('lastSeen');
        // If lastSeen exists AND time diff > (1500)
        if (lastSeen && (now - lastSeen > EDGE_TIMEOUT_MS)) {
            cy.remove(edge);
        }
    });
}

function simulateTrafficEvent() {
    let srcIp = Math.random() < 0.3 ? generateRandomIP() : pickExistingIP();
    let dstIp = pickExistingIP();

    if (!srcIp || !dstIp || srcIp === dstIp) return;

    ensureNodeExists(srcIp);
    ensureNodeExists(dstIp);

    createEdge(srcIp, dstIp, true);
    addLog(`[TRAFFIC] ${srcIp} -> ${dstIp}`);
}

function simulateScanEvent() {
    const target = pickExistingIP();
    if (!target) return;

    const isDead = Math.random() > 0.9;
    const status = isDead ? 'DOWN' : 'UP';

    updateNodeStatus(target, status);
    addLog(`[SCAN] ${target} is ${status}`);
}

// =============================================================================
// Helpers
// =============================================================================

function updateNodeStatus(ip, status) {
    const node = cy.getElementById(ip);
    if (node.nonempty()) {
        node.removeClass('online offline');
        if (status === 'DOWN') {
            node.addClass('offline');
        } else {
            node.addClass('online');
        }
        node.data('status', status);
    }
}

function ensureNodeExists(ip) {
    if (knownIPs.has(ip)) return;
    const subnet = ip.split('.').slice(0, 3).join('.');
    const zone = OT_ZONES.find(z => z.subnet === subnet) || OT_ZONES[0];
    if (zoneNodeCounts[zone.id] >= MAX_NODES_PER_ZONE) return;
    createNode(subnet, ip.split('.')[3], zone.id);
}

function createNode(subnet, hostNum, parentId, forceType = null) {
    const ip = `${subnet}.${hostNum}`;
    if (knownIPs.has(ip)) return;

    let type = forceType || 'PC';
    let label = ip;
    if (!forceType) {
        const zoneName = OT_ZONES.find(z => z.id === parentId)?.name || '';
        if (zoneName.includes('PLC')) type = 'PLC';
        if (zoneName.includes('Server')) type = 'Server';
        if (ip.endsWith('.1')) type = 'Firewall';
    }

    const pos = getNextSlotPosition(parentId);
    zoneNodeCounts[parentId]++;

    cy.add({
        group: 'nodes',
        data: {
            id: ip,
            label: label,
            ip: ip,
            type: ml_getTypeName(type),
            parent: parentId,
            status: 'UP'
        },
        position: pos, // LOCKED POSITION
        classes: `${type.toLowerCase()} online`
    });

    knownIPs.add(ip);

    const node = cy.getElementById(ip);
    node.animation({
        style: { 'width': 80, 'height': 80 },
        duration: 300
    }).play();
}

function createEdge(src, dst, isTraffic = false) {
    const edgeId = `${src}_${dst}`;

    // Check if edge exists
    let edge = cy.getElementById(edgeId);

    if (edge.empty()) {
        edge = cy.add({
            group: 'edges',
            // --- FIXED: ADDING lastSeen TIMESTAMP ---
            data: { id: edgeId, source: src, target: dst, lastSeen: Date.now() }
        });
    } else {
        // --- FIXED: UPDATING lastSeen TIMESTAMP ---
        edge.data('lastSeen', Date.now());
    }

    if (isTraffic) {
        edge.addClass('traffic-active');
        setTimeout(() => edge.removeClass('traffic-active'), 500);
    }
}

function ml_getTypeName(t) {
    if (t === 'PC') return 'Workstation';
    return t;
}

function generateRandomIP() {
    const avail = OT_ZONES.filter(z => zoneNodeCounts[z.id] < MAX_NODES_PER_ZONE);
    if (avail.length === 0) return null;
    const zone = avail[Math.floor(Math.random() * avail.length)];
    const host = 100 + Math.floor(Math.random() * 150);
    return `${zone.subnet}.${host}`;
}

function pickExistingIP() {
    const ips = Array.from(knownIPs);
    if (ips.length === 0) return null;
    return ips[Math.floor(Math.random() * ips.length)];
}

function addLog(msg) {
    const content = document.getElementById('logTerminal');
    if (!content) return;
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.style.borderLeft = msg.includes('SCAN') ? "3px solid #e74c3c" : "3px solid #2ecc71";
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    content.appendChild(div);
    content.scrollTop = content.scrollHeight;
}

function showDetails(data) {
    const el = document.getElementById('detailsFloater');
    if (!el) return;
    el.style.display = 'block';
    document.getElementById('detail-title').innerText = data.ip;
    document.getElementById('detail-content').innerHTML = `
        Status: <b>${data.status || 'UP'}</b><br>
        Type: ${data.type}
    `;
}

document.addEventListener('DOMContentLoaded', initNetworkMap);
