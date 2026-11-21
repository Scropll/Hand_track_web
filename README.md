# Hand Particles

Webcam hand tracking (Google MediaPipe) driving ~14,000 glowing particles (Three.js), all in the browser.

## Run it

```bash
npm install     # only needed once
npm run dev     # then open http://localhost:5173
```

Click **Start camera** and allow camera access. Before that, moving the mouse also stirs the particles.

The panel in the bottom-left corner can be hidden with its **−** button; a small **Menu** button then brings it back. Its dot shows the wand status, and the browser remembers whether you left the panel open.

| Gesture | Effect |
|---|---|
| 👆 Any hand | Particles gently follow your index fingertip |
| ☝️ Point | A bigger, stronger swarm follows your fingertip |
| 🖐️ Open palm | It rains in a strip under your hand |
| ✊ Fist | Scatters every particle outward from your hand |
| 🤏 Pinch | Fireworks burst, then a stream of sparkles |
| ✌️ Peace | Switches to the next color theme (starts on glowing blue) |
| 👏 Clap | A friend (`public/costume/clap-character.png`) pops up where your hands met, bobs hello and floats away |
| ☝️🔄 Point + 3 circles | Point with one finger and draw three circles: a little witch on a broomstick swoops around the screen and flies away (off while practicing spells) |

## Dark magic mood (Dim)

With **Dim: On**, a cool teal tint and a dark vignette surround you. The area around your face stays clear and the edges fade to near-black. The vignette follows your face using Face Landmarker. **Dim: Off** shows the plain, fully clear camera. The colors and fade are in `src/style.css` (`#tint`, `#vignette`), and the size of the clear area is set by `INNER` / `OUTER` in `src/vignette.ts`.

## Magic Portrait (Background: Hall)

Click **Background: Room** to switch to **Background: Hall**. The hall picture (`public/assets/hall-bg.jpg`) fills the screen, and MediaPipe selfie segmentation cuts you out of your room with soft edges. You're drawn only inside the gold frame's opening, with a warm candlelight tint. The hat, wand cursor, trail, hand outline, spell guide and particles are all placed in the frame's space, so they stay lined up with you. The vignette is off in the Hall and comes back when you switch to the Room. The segmentation model loads the first time you choose the Hall.

Fine-tune it in the `HALL` config at the top of `src/portrait.ts`:
- `opening`: the inside of the frame as fractions of the picture (now x 20.7%–79.4%, y 20.3%–80%, measured from the frame's inner edge),
- `feather`: how soft your edge is; `cutoff` / `solid`: how strict the cut-out is,
- `videoFilter` and `glow`: the candlelight look.

## Wizard hat

MediaPipe **Face Landmarker** puts a wizard hat on your head. The visible hat is 1.3× your face width, measured between face points 234 and 454. Its bottom edge sits just above your forehead (point 10). It keeps the image's original proportions, tilts with your head, and is smoothed so it doesn't shake. Use the **Hat: On/Off** button to toggle it. The image is `public/costume/harry_potter_hat.webp`, and the fitting settings are at the top of `src/hat.ts`.

## Wand tip tracking

Put a strip of bright colored tape (neon green by default) on the tip of your wand. A glowing gold trail follows the tip and fades over about half a second. The panel shows **Wand: tracked** or **Wand: lost**.

- **Color tracking:** each camera frame is checked for pixels in the tape's HSV color range, and the densest patch of them is the tip.
- **Calibrate wand:** click the button, then click the wand tip on screen. Its color and a matching tolerance are sampled and saved in your browser. The dot on the button shows the color being tracked. Press Esc to cancel.
- **Fallback:** if the color isn't visible, your index fingertip is used as the wand tip, so you can play without a wand. The panel then says *index fingertip*.
- **Cursor:** a small glowing dot shows exactly where the wand tip is being tracked (gold for the colored tip, white for the fingertip).
- **Smoothing:** the position is eased (lerped) toward each new reading to remove jitter. Fast moves catch up quicker.

Settings are at the top of `src/wand.ts` (default color, `WAND_LENGTH`, blob size limits) and `src/wandTrail.ts` (`TRAIL_MS`, width, gold color).

## Spellbook and practice

Click **📖 Spellbook** to open a grid of 21 spells, traced from *A Beginner's Guide to Wand Motions*. Each card shows the wand motion (a dot where it starts, an arrow where it ends), the spell's name and what it does. Choose a spell by clicking it, or by holding your wand tip over its card for 1.5 seconds while a gold ring fills.

In **practice mode** the spell's motion is drawn large in the middle of the screen. Touch the pulsing start dot with your wand tip, then follow the line: the part you've traced fills in glowing gold and *Match %* climbs to 100%. Stay within the faint corridor around the line (about 8% of the screen width). If you leave it for more than half a second, the gold drains away and it says *Try again*. At 100% the screen flashes gold, the spell's name appears, its effect plays, and after 2.5 seconds you're back in the Spellbook. While practicing, the particles dim to 30% and the gesture panel is hidden; **← Spellbook**, **Exit** or Esc leave practice.

Each spell has its own effect on the particles: Lumos lights the wand tip, Nox darkens the screen, Ascendio/Descendo make the particles rise/fall, Reparo gathers them in the middle, Stupefy fires a red bolt, Expelliarmus blasts outward, Finite Incantatem ends every effect, and so on.

- **Edit spells in `src/spells.js`:** shapes (points in a 0–1 box, y going down; add `'corner'` to keep a corner sharp), names, descriptions, colors and which effect each one uses.
- **How strict tracing is:** `CORRIDOR`, `OFF_PATH_MS` and `GUIDE_SIZE` at the top of `src/practice.ts`.
- **Effects:** `src/spellEffects.ts`.

## Files

- `src/handTracking.ts` – webcam + MediaPipe model loading
- `src/gestures.ts` – recognizes gestures from the 21 hand points
- `src/particles.ts` – particle physics and the glow shader
- `src/skeleton.ts` – the faint hand outline
- `src/hat.ts` – wizard hat placed with face tracking
- `src/wand.ts` – wand tip tracking (HSV color, calibration, hand fallback, smoothing)
- `src/wandTrail.ts` – the glowing gold trail behind the wand tip
- `src/spells.js` – all spells: wand motion paths, text, colors, effect
- `src/spellPath.ts` – Catmull-Rom smoothing of the spell paths
- `src/spellbook.ts` – the Spellbook menu (click or wand-hover to choose)
- `src/practice.ts` – practice mode: the big guide symbol and following it with the wand
- `src/spellEffects.ts` – what each spell does to the particles and screen
- `src/portrait.ts` – Magic Portrait: Hall background, selfie cut-out inside the gold frame (config at the top)
- `src/clap.ts` – clap detection (two hands rushing together)
- `src/popCharacter.ts` – the character that pops up on a clap
- `src/circleGesture.ts` – "point and draw three circles" detection
- `src/witch.ts` – the flying witch (`public/costume/witch-broom.webp`)
- `src/main.ts` – connects everything, runs once per frame
- `public/` – the MediaPipe engine (`wasm/`) and hand model, served locally

## Tweaking

- Particle count: `PARTICLE_COUNT` in `src/main.ts`
- Gesture strengths and sizes: `buildForces()` in `src/main.ts`
- Color themes: `PALETTES` in `src/particles.ts`

## Publishing it (Cloudflare Workers, free)

The site is published by Cloudflare as the Worker **hand-track-web**, connected to this GitHub repo. Every time a pull request is merged into `main`, Cloudflare rebuilds and republishes it automatically, usually in 1–3 minutes. The live address is shown on the Worker's **Overview** page (it looks like `https://hand-track-web.<your-name>.workers.dev`).

How it's set up (already done; only needed again for a new project):
1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create** → import the **Hand_track_web** GitHub repository.
2. Build command: `npm run build`. Deploy command: `npx wrangler deploy`. Root directory: `/`.
3. `wrangler.jsonc` tells Cloudflare to publish the built `dist/` folder as static files under the name `hand-track-web`.

Notes:
- Camera access needs https, and `*.workers.dev` is https, so the camera works there.
- `public/_headers` lets browsers keep the large tracking models for a day.
- `.node-version` asks for Node.js 22 when building.
- Build logs are under the Worker's **Deployments** tab if something goes wrong.

## Sharing it

`npm run build` creates a `dist/` folder you can upload to any static host (Netlify, Vercel, GitHub Pages). Browsers only allow camera access over **https** or on localhost.
