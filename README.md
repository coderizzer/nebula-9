# NEBULA//9

A vertical arcade space shooter built with HTML5 Canvas and vanilla JavaScript. One self-contained HTML file, no dependencies, no build step, no external assets. All graphics are drawn in code and all audio, including the music, is synthesized with the Web Audio API.

<!-- Replace with your own hero image or GIF once captured -->
<!-- ![NEBULA//9 gameplay](docs/gameplay.gif) -->

## Demo

- **Play online:** `https://<your-username>.github.io/<repo-name>/` *(enable GitHub Pages on the `main` branch and update this link)*
- **Run locally:** see [Installation](#installation).

## Features

- **Four enemy types** with distinct silhouettes, movement patterns and attack behaviours (scout, fighter, tank, elite).
- **Wave progression** with a hand-authored opening (waves 1-6) followed by a threat-budget generator that scales indefinitely.
- **Combo and multiplier system** with a graze mechanic that rewards close calls.
- **Four power-ups:** Rapid Fire, Triple Shot, Shield and Health, all time-limited or single-use.
- **Procedural audio:** synthesized sound effects and a generative music track that gains layers as the waves get harder.
- **Game-feel systems:** ship tilt, recoil spring, muzzle flashes, bullet trails, screen shake, damage vignette and fade transitions.
- **Complete UI flow:** menu, how to play, high score, settings, pause and game over, with keyboard, mouse and touch navigation.
- **Desktop and mobile support:** keyboard controls, plus a floating analog stick and fire zone on touch devices.
- **Accessibility basics:** keyboard-operable menus, a screen-reader status line for waves, pickups and game over, a visible focus ring, and reduced screen shake when `prefers-reduced-motion` is set.
- **Local top-10 leaderboard** with score, wave, best combo and date, stored as JSON in `localStorage`, with a two-step clear.
- **Fullscreen** (`F` or Settings) using the Fullscreen API, shown only where the browser supports it.
- **Gamepad support** through the Gamepad API: analog stick or D-pad to move, `A`/bumpers/trigger to fire, `Start` to pause, and full menu navigation.
- **Persistent settings and records:** volume, music/SFX toggles, high score, best wave and best combo are stored in `localStorage`.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move | `WASD` or arrow keys | Left half of the screen (floating analog stick) |
| Fire | `Space` (hold) | Right half of the screen (hold) |
| Pause | `Esc` or `P` | Pause button at the top |
| Menu navigation | `↑` `↓` / `W` `S`, `Enter` or `Space` to confirm, `Esc` to go back | Tap |
| Fullscreen | `F` | Settings menu (where supported) |
| Music on/off | `M` | Settings menu |
| SFX on/off | `N` | Settings menu |
| Volume | `-` / `+` | Settings menu |

The game also pauses automatically when the window loses focus or the tab is hidden.

**Gamepad** (Xbox-style layout): left stick or D-pad to move and navigate menus, `A`, `RB` or `RT` to fire, `A` to confirm, `B` to go back, `Start` to pause. Press any button once so the browser detects the controller.

## Tech Stack

- **HTML5 Canvas 2D** for all rendering
- **Vanilla JavaScript (ES6+)**, no frameworks or libraries
- **Web Audio API** for sound effects and music
- **Pointer Events** for unified mouse and touch input
- **Gamepad API** and **Fullscreen API** for controller input and fullscreen play
- **CSS** only for layout, safe-area handling and the touch-control overlay
- **`localStorage`** for settings and records

## Architecture Overview

Everything lives in a single `index.html` by design, so the game can be opened from disk or hosted anywhere with no tooling. The script is organised into clearly separated, commented sections:

| Module | Responsibility |
|---|---|
| `P`, `CFG`, `EDEF`, `PW` | Palette, tuning values, enemy and power-up definitions |
| `Input` | Key state, per-frame "pressed" edges and the shared touch axis/fire state |
| `Sfx` | Audio graph, sound effects, generative music scheduler, audio settings |
| `Starfield`, `Particle`, `Spark`, `Ring`, `MuzzleFlash`, `ScorePop` | Visual effects |
| `Bullet`, `Player`, `Enemy`, `Powerup` | Gameplay entities |
| `World` | Entity lists, wave spawning, collisions, scoring, combo and drops, HUD |
| `UI` | Screen layouts, button state and actions |
| `Game` | State machine (`menu`, `play`, `pause`, `over`), screens, transitions, cached background |
| Bootstrap | Canvas sizing, touch controls, main loop, adaptive quality |

**Main loop.** The simulation advances in fixed 1/60 s steps using an accumulator, so gameplay behaves the same at any display refresh rate. Rendering happens only after at least one simulation step.

**State machine.** `Game` owns the high-level state and transitions between states through a fade-to-black. `World` owns everything that exists during a run, so starting a new game is just creating a new `World`.

**Rendering.** The canvas always keeps a fixed 480 × 720 logical coordinate system. A transform maps it to whatever backing-store size the device needs, so game code never deals with device pixels.

## Game Mechanics

### Enemies

| Type | HP | Score | Behaviour |
|---|---|---|---|
| Scout | 1 | 150 | Fast entry, then lateral dashes. Does not shoot. |
| Fighter | 3 | 300 | Weaves side to side. Fires a single aimed shot. |
| Tank | 7 | 600 | Slow march. Fires a three-bullet fan. |
| Elite | 5 | 1200 | Diagonal entry, then strafes. Fires two-shot bursts and retreats if it gets too low. |

Enemy HP scales by 8% per wave and speed by 4% per wave (speed bonus capped at +80%). Most of the difficulty comes from the *mix* of enemies rather than inflated stats.

### Waves

- **Waves 1-6** are authored to teach one idea at a time: scouts only, then fighters, then more volume, then tanks, attrition, and finally the first elite.
- **Wave 7 onward** uses a threat budget of `min(40, 10 + wave × 3)`, spent on enemies at costs of scout 1, fighter 2, tank 3, elite 5. Elites start appearing in the random mix from wave 8.
- Spawn interval shortens with each wave down to a floor of 0.3 s. Enemy fire is slower in the early waves.

### Scoring

- **Combo:** every kill extends a 2.6 s combo timer. The multiplier rises by 1 for every 5 kills in the chain, up to ×8.
- **Risk and reward:** taking a hit resets the combo. Grazing an enemy bullet (a near miss) refreshes the timer and awards bonus points, so staying close to danger pays off.
- **Wave bonus:** clearing a wave awards `200 × wave`, plus 500 for a flawless wave. Every fifth wave also grants an extra life (maximum 5).
- **Milestones:** score thresholds trigger on-screen feedback and a sound cue.

### Power-ups

| Power-up | Effect | Duration |
|---|---|---|
| Rapid Fire | Fire delay × 0.55 | 8 s |
| Triple Shot | Three-way fan instead of two parallel guns | 10 s |
| Shield | Absorbs one hit and preserves the combo | 12 s or until hit |
| Health | +1 life (max 5) | Instant |

Drops are random but constrained: a per-enemy chance, at least 7 s between drops, at most two pickups on screen, and a pity bonus after 12 kills without a drop. Health drops are weighted toward low-life situations, and a buff that is already active is less likely to drop again. Picking up an active buff refreshes its timer rather than stacking.

## Project Structure

```
nebula-9/
├── index.html     # markup
├── style.css      # layout, safe areas, touch-control overlay
├── game.js        # all game code (about 1,300 lines, sectioned)
├── README.md
└── docs/          # screenshots and GIFs for this README
```

## Robustness and Accessibility

- **Error handling:** the main loop is wrapped so an unexpected error shows a clear "reload" message instead of a frozen canvas. Missing Canvas support shows a message, audio errors never interrupt gameplay, and every `localStorage` access is guarded for private-mode and blocked-storage cases.
- **Accessibility:** menus work fully by keyboard, a visually hidden live region announces waves, pickups and game over, the canvas has a description and focus ring, and screen shake is reduced when the OS requests reduced motion. The game itself is real-time and visual, so it is not playable with a screen reader.
- **Ramming** an enemy damages both sides rather than acting as a free kill, so it can't be used to farm score.

## Challenges and Solutions

| Challenge | Solution |
|---|---|
| Keeping gameplay consistent across 60, 120 and 144 Hz displays | Fixed-timestep simulation with an accumulator; rendering is skipped when no simulation step occurred. |
| A gentle first minute that still ramps up | Hand-authored early waves that introduce one mechanic each, slower enemy fire early on, then a budget-based generator for open-ended scaling. |
| Making the combo system meaningful without making it complicated | One timer, one multiplier, one reset rule. The graze mechanic adds a risk/reward choice without a new input or UI element. |
| Power-ups that help without making the player permanently strong | Short fixed durations, no stacking, spacing and on-screen caps on drops, and a pity timer instead of pure randomness. |
| Audio that doesn't get repetitive with no audio files | Randomized pitch on frequent sounds, per-sound rate limiting, and a generative music scheduler that varies chord progressions, bass and arpeggio patterns, with layers tied to wave intensity. |
| Building a full menu system on a canvas | A small `UI` layer with one layout function per screen, a single selection index shared by keyboard and mouse, and eased hover and press animations. |
| Touch controls on screens that don't match the game's 2:3 shape | The canvas is letterboxed to keep its aspect ratio, and the touch overlay is DOM-based and positioned relative to the screen so thumbs can use the full display. |
| Accidental scrolling, zooming and text selection on mobile | `touch-action: none`, fixed-position body, `overscroll-behavior: none`, and cancelled `touchmove`/gesture events. |
| Sharp rendering on high-DPI screens without wasting fill rate | Backing store scaled by device pixel ratio (capped at 2×) behind a fixed logical coordinate system. |

## Performance Considerations

- **Allocation control:** dead entities are removed in place instead of rebuilding arrays each frame, and particles and sparks are recycled through object pools. Particle counts are capped.
- **Cached background:** the static nebula is rendered once to an offscreen canvas and redrawn with a single `drawImage`, rebuilt only on resize.
- **Glow cost:** `shadowBlur` is the most expensive effect in use, so it is applied through a single helper that can scale it down or disable it.
- **Adaptive quality:** if the average frame time stays above roughly 25 ms during play, the game steps down through three quality levels (lower render resolution, lower particle caps, reduced or no glow). It does not step back up within a session. Phones with 4 or fewer logical cores start one level down.
- **Additive blending** is limited to particles and sparks.
- **Size:** about 70 KB uncompressed (roughly 22 KB gzipped), with no network requests.

## Installation

No build tools are required.

```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
```

Then either open `index.html` directly in a browser, or serve it locally:

```bash
# Python 3
python -m http.server 8000
# then visit http://localhost:8000
```

Audio starts after your first key press or tap, as required by browser autoplay policies.

### Deploying with GitHub Pages

1. Make sure `index.html` is in the repository root (it already is in this layout).
2. In the repository, go to **Settings → Pages**.
3. Select the `main` branch and the `/ (root)` folder, then save.

## Screenshots

<!-- Capture these at a 2:3 portrait size and place them in docs/ -->

| Menu | Gameplay | Power-ups | Game over |
|---|---|---|---|
| *(add `docs/menu.png`)* | *(add `docs/gameplay.png`)* | *(add `docs/powerups.png`)* | *(add `docs/gameover.png`)* |

## Known Limitations

- The game has been checked with headless smoke tests, but it has not been tested across a broad matrix of devices and browsers. It targets current evergreen browsers (Chrome, Edge, Firefox, Safari) and relies on Pointer Events, Web Audio and `visualViewport`.
- Fullscreen is unavailable where the browser blocks it (iPhone Safari, some embedded frames), and the setting is hidden there. The Gamepad API generally needs a secure context, so use GitHub Pages or `localhost` if a controller isn't detected. Gamepad support has been simulated in tests but not tried with physical controllers.
- The leaderboard is local to one browser and stores no player names.
- Landscape orientation on phones leaves a small playfield, since the game is designed for portrait.
- There are no automated gameplay tests, and the single-file structure makes unit testing harder than it would be with modules.
- Canvas UI text is not selectable and does not scale with browser text-size settings.

## Future Improvements

- Boss waves and enemy formation patterns
- Persistent progression (unlocks, ship upgrades) and an online leaderboard (the current one is local only)
- Difficulty settings
- A gameplay-focused landscape layout
- Splitting the single file into ES modules with a lightweight bundler for easier testing
- Unit tests for the wave generator, scoring and drop logic

## License

Add a license of your choice before publishing (for example, MIT) and reference it here.
