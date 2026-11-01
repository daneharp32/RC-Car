# RC Car Multiplayer

A browser-based 3D RC car driving game with peer-to-peer multiplayer.

## Project layout

```text
RC-Car/
├── index.html   # Page structure, menus, HUD, and styling
├── main.js      # Game setup, physics, vehicle visuals, controls, and networking
└── README.md    # Setup notes, controls, and code map
```

The project intentionally starts with a small, flat file layout. The game is an early prototype, so keeping the entry point obvious makes it easier to deploy and debug. As systems grow, we can split them into focused files without changing the game all at once.

## Run and deploy

This is a static web app. There is no build command.

For Cloudflare Pages:
- Framework preset: **None**
- Build command: leave blank
- Build output directory: **.**
- Entry file: `index.html`

The project imports libraries from CDNs, so an internet connection is required. Serve it over HTTPS when deployed; localhost is suitable for local testing.

## Controls

- **W / Up Arrow** — accelerate
- **S / Down Arrow** — reverse
- **A / Left Arrow** — steer left
- **D / Right Arrow** — steer right
- **Space** — brake
- **R** — reset the car

## Code map: `main.js`

The file is divided into labeled sections. Use your editor's Find feature to search for these headings:

1. **Renderer, scene, camera, and lighting** — display setup.
2. **Practice track and obstacles** — ground, track markings, cones, and barriers.
3. **Physics world and vehicle setup** — gravity, chassis, suspension, and wheel configuration.
4. **Vehicle visuals** — body, tires, rims, and player name tags.
5. **Local vehicle updates** — synchronizes the rendered car and wheels with physics.
6. **Multiplayer state** — snapshots, peer tracking, and remote cars.
7. **Keyboard controls and reset** — input handling and vehicle reset.
8. **Driving forces** — steering, throttle, reverse, and braking.
9. **Room connection and UI events** — joining/leaving a room and updating the interface.
10. **Resize and animation loop** — frame updates, camera follow, HUD, and network sends.

## Multiplayer notes

Players enter the same room code to meet in the same arena. Trystero handles peer discovery/signaling and WebRTC carries vehicle-state updates directly between browsers. No game account or custom game server is currently required.

This first multiplayer pass synchronizes vehicle position, rotation, steering, and wheel rotation. It is **not** server-authoritative and does not yet implement car-to-car collision handling. Each browser simulates its own car locally.

## Debugging and safe iteration

- Change one system at a time.
- Keep commits small and describe the specific change in each commit message.
- Test the preview after each meaningful change before moving on.
- If something breaks, use GitHub's commit history to return to the last working version.
- Check the browser console for JavaScript errors; include the exact error text when reporting a bug.

## Current prototype status

The code has been copied from the isolated prototype branch in the DustRunner repository. It has **not yet been confirmed through a live browser test** in this new repository. Physics feel, wheel visuals, and multiplayer connection behavior should be tested in the deployed preview before treating this as a verified working build.
