# RC Car Multiplayer

A browser-based 3D RC car driving game with peer-to-peer multiplayer.

## Project layout

```text
RC-Car/
├── index.html      # Menus, HUD, page structure, and CSS
├── main.js         # App startup, renderer, and animation loop
├── track.js        # Closed dirt course, scenery, curbs, jumps, and start/finish
├── gravel-map.js   # Open gravel basin, sculpted terrain, jumps, full-size parked cars, and trees
├── car.js          # Detailed RC truck, chassis, wheels, and removable body shell
├── physics.js      # Cannon-es world, ramp colliders, suspension, and vehicle physics
├── garage.js       # Showroom, component hover inspection, and shell animation
├── controls.js     # Keyboard input, camera orbit, reset, and driving controls
├── multiplayer.js  # Trystero rooms, player snapshots, and remote vehicles
└── README.md       # Setup notes and project map
```

The game uses native JavaScript ES modules. `index.html` still loads only `main.js`, which imports the other files. No build command or bundler is required.

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
2. **track.js** — builds the selectable closed dirt circuit, blue-sky environment, perimeter tree line, textured surfaces, red/white curbs, jumps, scenery, and start/finish gantry.
3. **gravel-map.js** — builds the open Gravel Basin: bumpy gravel heightfield, large natural jumps, scattered rock detail, three parked full-size vehicles, perimeter pines, and a checkpoint route for race modes.
4. **car.js** — builds the detailed short-course truck, chassis components, wheels, body shell, and player name tags.
5. **physics.js** — creates the Cannon-es world, switchable terrain colliders, parked-vehicle collision shapes, chassis body, raycast vehicle, and suspension.
6. **garage.js** — creates the showroom, handles menu/garage transitions, component hover labels, and shell removal animation.
7. **controls.js** — handles keyboard input, camera dragging, vehicle reset, steering, throttle, braking, and airborne control.
8. **multiplayer.js** — joins/leaves rooms, synchronizes selected maps in lobby announcements, sends snapshots, receives player state, and updates remote vehicle visuals.

## Multiplayer notes

Players enter the same room code to meet in the same arena. Trystero handles peer discovery/signaling and WebRTC carries vehicle-state updates directly between browsers. No game account or custom game server is currently required.

This is peer-to-peer rather than server-authoritative. Each browser simulates its own car locally and exchanges vehicle snapshots with other players.

## Safe iteration

- Keep a backup branch before significant changes.
- Change one system at a time and test the Cloudflare preview after each meaningful change.
- Confirm the deployment reports **Success** before testing it.
- If something breaks, return to the last working GitHub backup branch.
