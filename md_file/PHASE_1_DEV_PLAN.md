# Phase 1 Development Plan: Basic Skeleton & Zone Topology Visualization

## Objective
Implement the basic structure of the OT Network Automated Topology and Asset Identification System Proof of Concept. The goal is to verify that we can visualize a network topology with Zones (Compound Nodes) using Cytoscape.js and `mockData`.

## Tasks

1.  **Project Setup**
    *   Create HTML/CSS/JS file structure.
    *   Include `cytoscape.js` and `cytoscape-fcose.js` via CDN.

2.  **Implementation**
    *   **mockData Construction**: Define `nodes` and `edges`.
        *   Define Parent Nodes (Zones): Engine Room, Bridge, Server Room.
        *   Define Child Nodes (Assets): PC, PLC, Switch, etc. assigned to Zones using `parent` attribute.
    *   **Cytoscape Initialization**:
        *   Initialize Cytoscape instance on a full-screen container.
        *   Apply `fcose` layout logic.
    *   **Styling**:
        *   Differentiate Zones (dashed border, light background).
        *   Differentiate Asset Types (color/shape).
        *   Style Edges (taxi/bezier curves).

3.  **Verification**
    *   Open `index.html` in a browser.
    *   Confirm Zones contain their respective nodes.
    *   Confirm Layout organizes nodes within zones effectively.

## Next Steps (After Phase 1 Verification)
*   Proceed to Phase 2: Detail Panel & Charts.
