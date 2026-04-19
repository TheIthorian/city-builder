# Brick Borough

Brick Borough is a small isometric city builder built as a static web game. It uses a single HTML canvas, procedural pixel-art style sprites, zoning and infrastructure placement, overlay icons for city problems, and a lightweight population sample simulation.

## Features

- Isometric map with road, utility, park, and zoning placement.
- Zone growth with three building levels and simple sprite overlays.
- Population sample simulation with named households, jobs, mood, and employment.
- Service coverage, land value, and issue overlays.
- Zero dependencies, so it runs directly from a static server.

## Run

```bash
npm run dev
```

Then open `http://localhost:4173`.

## Controls

- Left click: build with the selected tool
- Right click: bulldoze
- Drag: paint zones or roads
- Mouse wheel: zoom
- `W`, `A`, `S`, `D`: pan camera
- `1`-`8`: select tools
- `B`: bulldozer
- `Space`: pause/resume simulation

## Desktop/WASM direction

The current build is a static web game. The simulation and renderer are self-contained in `src/main.js`, which makes it straightforward to move the core into Rust/WASM or wrap the existing web build in Tauri for desktop distribution.
