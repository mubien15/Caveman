# Caveman

A voxel survival game that runs in a browser, built for thumbs. Dig, build, hunt boar, and
shelter before dark — an infinite blocky world with caves, ore seams, a day/night sky and a
generative ambient score, in about 100 KB of hand-written JavaScript.

No build step, no framework, no bundler. Open `index.html` and play.

## Playing

**On a phone** (best held in landscape):

| Do this | To |
| --- | --- |
| Left thumb, anywhere on the left | Walk — the stick appears under your thumb |
| Push the stick to full stretch | Break into a run |
| Right thumb, drag | Look around |
| **Hold** on a block | Dig it — keep holding and drag to carry on digging |
| **Tap** the world | Place what you are holding, eat it, or strike a boar |
| Round buttons | Jump, sneak (won't walk off ledges), dig at the crosshair, place at the crosshair |

**On a desktop:** `WASD` walk · `Shift` run · `Space` jump · `Z` sneak · left-click mine or
strike · right-click place or eat · `1`–`9` or scroll to pick a slot · `E` bag · `C` camera ·
`Esc` pause.

## What is in the world

Grass, sand and stone terrain with carved caves, flint and coal seams, clay by the water,
trees, boar herds, and a mud-brick hut waiting at spawn. Nine recipes turn logs and flint into
planks, sticks, a pick, an axe, a club, a campfire, thatch, mud brick and glass. Roast meat on
a fire before you eat it. Hunger drains, falls hurt, and the world saves itself to
`localStorage` as you play.

## Layout

```
index.html      the page: canvas, HUD, menus
style.css       every pixel of UI
js/core.js      namespace, seeded noise, storage, options, sound effects, ambient score
js/blocks.js    block and item tables, recipes, procedurally painted textures and icons
js/world.js     terrain generation, chunk storage, meshing with ambient occlusion, raycasts
js/entities.js  collision sweep, the player, the caveman model, boars, particles
js/ui.js        HUD, bag and crafting, menus, toasts
js/input.js     keyboard, mouse (pointer lock or drag), and touch controls
js/main.js      renderer, sky and daylight, held-item view, game flow, save/load, main loop
```

Three.js r128 loads from a CDN; everything else is in this repository. Textures are painted
into a canvas atlas at startup rather than shipped as images, so there are no binary assets.

## Running it locally

Any static server works:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Tests

`tools/` holds a headless-Chromium harness (Playwright) that actually plays the game: it walks
the caveman with a synthetic thumb, holds a finger down to dig and checks that blocks break and
land in the bag, taps to place, drags to confirm it looks instead of digging, and screenshots
the HUD at phone and desktop sizes.

```bash
npm install playwright three            # three is only used to vendor a local copy
cp node_modules/three/build/three.min.js vendor/three.min.js
tools/build.sh                          # writes dist/ with the CDN swapped for vendor/
node tools/smoke.mjs                    # desktop: loads, plays, fast-forwards to night
node tools/touch.mjs                    # phone: ten control checks
node tools/layout.mjs                   # screenshots portrait, landscape and desktop
```

Screenshots land in `shots/`. `tools/build.sh` exists because the game is also published as a
Claude Artifact, where the page is wrapped in a standard document shell; the script reproduces
that wrapper locally so tests run against the same markup that ships.
