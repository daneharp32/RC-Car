# RC Car Multiplayer

A browser-based 3D RC car driving game with peer-to-peer multiplayer.

## Project layout

```text
RC-Car/
├── index.html      # Menus, HUD, page structure, and CSS
├── main.js         # App startup, renderer, and animation loop
├── track.js        # Closed dirt course, scenery, curbs, jumps, and start/finish
├── assets/
│   └── scx30-shell-b64/  # Compressed, optimized Ranger body asset fragments
├── car.js          # Chassis, wheels, and imported removable body shell
├── physics.js      # Cannon-es world, ramp colliders, suspension, and vehicle physics
├── garage.js       # Showroom, component hover inspection, and shell animation
├── controls.js     # Keyboard input, camera orbit, reset, and driving controls
├── multiplayer.js  # Trystero rooms, player snapshots, and remote vehicles
└── README.md       # Setup notes and project map
```

The game uses native JavaScript ES modules. `index.html` still loads only `main.js`, which imports the other files. The optimized Ranger shell is fetched as six compressed text fragments, joined and decoded at startup, then shared by all player cars. No build command or bundler is required.

## Run and deploy

This is a static web app. For Cloudflare Pages:
- Framework preset: **None**
- Build command: leave blank
- Build output directory: **.**
- Entry file: `index.html`

The project imports Three.js, Cannon-es, and Trystero from CDNs, so an internet connection is required. Serve it over HTTPS when deployed; localhost is suitable for local testing.

## Controls

- **W / Up Arrow** — accelerate
- **S / Down Arrow** — reverse
- **A / Left Arrow** — steer left
- **D / Right Arrow** — steer right
- **Space** — brake
- **R** — reset the car
- **Drag** — orbit the camera around the vehicle

## Code map

1. **main.js** — creates the renderer and arena, connects the systems, and runs the frame loop.
2. **track.js** — builds the closed dirt circuit, blue-sky environment, perimeter tree line, textured surfaces, red/white curbs, jumps, scenery, and start/finish gantry.
3. **car.js** — builds the chassis and wheels, then attaches the optimized imported Ranger body shell and player name tags.
4. **physics.js** — creates the Cannon-es world, ramp colliders, chassis body, raycast vehicle, and suspension.
5. **garage.js** — creates the showroom, handles menu/garage transitions, component hover labels, and shell removal animation.
6. **controls.js** — handles keyboard input, camera dragging, vehicle reset, steering, throttle, braking, and airborne control.
7. **multiplayer.js** — joins/leaves rooms, sends snapshots, receives player state, and updates remote vehicle visuals.

## Multiplayer notes

Players enter the same room code to meet in the same arena. Trystero handles peer discovery/signaling and WebRTC carries vehicle-state updates directly between browsers. No game account or custom game server is currently required.

This is peer-to-peer rather than server-authoritative. Each browser simulates its own car locally and exchanges vehicle snapshots with other players.

## Safe iteration

- Keep a backup branch before significant changes.
- Change one system at a time and test the Cloudflare preview after each meaningful change.
- Confirm the deployment reports **Success** before testing it.
- If something breaks, return to the last working GitHub backup branch.
