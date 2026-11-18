# Hand Particles

Webcam hand tracking (Google MediaPipe) driving ~14,000 glowing particles (Three.js), all in the browser.

## Run it

```bash
npm install     # only needed once
npm run dev     # then open http://localhost:5173
```

Click **Start camera** and allow camera access. Before that, moving the mouse also stirs the particles.

| Gesture | Effect |
|---|---|
| 👆 Any hand | Particles gently follow your index fingertip |
| ☝️ Point | A bigger, stronger swarm follows your fingertip |
| 🖐️ Open palm | It rains in a strip under your hand |
| ✊ Fist | Scatters every particle outward from your hand |
| 🤏 Pinch | Fireworks burst, then a stream of sparkles |
| ✌️ Peace | Switches to the next color theme (starts on glowing blue) |

## Dark magic mood (Dim)

With **Dim: On**, a cool teal tint and a dark vignette surround you. The area around your face stays clear and the edges fade to near-black. The vignette follows your face using Face Landmarker. **Dim: Off** shows the plain, fully clear camera. The colors and fade are in `src/style.css` (`#tint`, `#vignette`), and the size of the clear area is set by `INNER` / `OUTER` in `src/vignette.ts`.

## Wizard hat

MediaPipe **Face Landmarker** puts a wizard hat on your head. The visible hat is 1.3× your face width, measured between face points 234 and 454. Its bottom edge sits just above your forehead (point 10). It keeps the image's original proportions, tilts with your head, and is smoothed so it doesn't shake. Use the **Hat: On/Off** button to toggle it. The image is `public/costume/harry_potter_hat.webp`, and the fitting settings are at the top of `src/hat.ts`.

## Wand tip tracking

Put a strip of bright colored tape (neon green by default) on the tip of your wand. A glowing gold trail follows the tip and fades over about half a second. The panel shows **Wand: tracked** or **Wand: lost**.

- **Color tracking:** each camera frame is checked for pixels in the tape's HSV color range, and the densest patch of them is the tip.
- **Calibrate wand:** click the button, then click the wand tip on screen. Its color and a matching tolerance are sampled and saved in your browser. The dot on the button shows the color being tracked. Press Esc to cancel.
- **Fallback:** if the color isn't visible, the tip is estimated from your hand: a line from the wrist through the index knuckle, about 1.5× your hand's length. The panel then says *estimated from hand*.
- **Smoothing:** the position is eased (lerped) toward each new reading to remove jitter. Fast moves catch up quicker.

Settings are at the top of `src/wand.ts` (default color, `WAND_LENGTH`, blob size limits) and `src/wandTrail.ts` (`TRAIL_MS`, width, gold color).

## Files

- `src/handTracking.ts` – webcam + MediaPipe model loading
- `src/gestures.ts` – recognizes gestures from the 21 hand points
- `src/particles.ts` – particle physics and the glow shader
- `src/skeleton.ts` – the faint hand outline
- `src/hat.ts` – wizard hat placed with face tracking
- `src/wand.ts` – wand tip tracking (HSV color, calibration, hand fallback, smoothing)
- `src/wandTrail.ts` – the glowing gold trail behind the wand tip
- `src/main.ts` – connects everything, runs once per frame
- `public/` – the MediaPipe engine (`wasm/`) and hand model, served locally

## Tweaking

- Particle count: `PARTICLE_COUNT` in `src/main.ts`
- Gesture strengths and sizes: `buildForces()` in `src/main.ts`
- Color themes: `PALETTES` in `src/particles.ts`

## Sharing it

`npm run build` creates a `dist/` folder you can upload to any static host (Netlify, Vercel, GitHub Pages). Browsers only allow camera access over **https** or on localhost.
