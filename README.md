# WLED Matrix Editor

Pixel art editor for WLED 2D matrices. Open it in a browser, draw on the
canvas, the matrix mirrors what you're doing in real time. When you're happy
with a drawing, save it to the device as a GIF that plays back through WLED's
Image effect.

![WLED Matrix Editor](public/wled-matrix-editor.png)

## Why the GIF route

Saving a drawing as a regular WLED preset (the raw pixel-array kind) works,
but those presets snap to full brightness with no fade when you turn the
lights on — they bypass WLED's effect renderer, so the global brightness curve
never touches them. Uploading the drawing as a GIF and playing it via the
Image effect (`fx:53`) goes through the normal render path, so on/off
transitions fade like any other effect. That's the only reason this tool
encodes GIFs in the browser — to work around that one limitation.

## Features

### Drawing

- Click-and-drag pen with two brush sizes
- Right-click to erase
- Undo with `Ctrl+Z`, clear with `Ctrl+Shift+C`
- Keyboard shortcuts for tool switching: `P`, `E`, `B`, `[`, `]`

### Color and composition

- Full RGB picker with recent-color history
- Linear, radial, and elliptical gradient generator
- Image import with automatic resampling to your matrix size

### WLED integration

- Live preview — every brush stroke is sent to the device over the JSON API
- Save the canvas to the device as a GIF, with an optional `psave` to a
  preset slot in the same call
- Discover other WLED devices on the network via `/json/nodes` (the seed
  device asks its UDP sync mesh; clicking a peer chains to discovery again)
- The last-used device URL is kept in `localStorage`
- Matrix dimensions are read from `info.leds.matrix` on connect

### Quality of life

- Dark mode
- Auto-saves drawings to localStorage
- Copy a raw JSON preset to the clipboard if you prefer the classic flow

## Getting started

### From source

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # single-file build at dist/index.html
```

Production build is a single inlined HTML file (~180 KB gzipped). Everything's
in there: JS, CSS, fonts.

### Running it on the WLED device

Upload `dist/index.html` to the WLED filesystem at `http://<your-wled>/edit`.
Once it's served by WLED itself, calls to the API are same-origin and you
skip CORS entirely.

### First time setup

Open the settings panel (gear icon), enter your WLED's address, click Save.
The matrix dimensions are read from the device. If you have more than one
WLED on the network, click Discover — the tool will list the rest.

## Keyboard reference

| Action            | Shortcut         |
| ----------------- | ---------------- |
| Pen               | `P`              |
| Eraser            | `E`              |
| Cycle brush size  | `B`, or `[` / `]`|
| Undo              | `Ctrl+Z`         |
| Clear canvas      | `Ctrl+Shift+C`   |
| Erase pixel       | Right-click drag |

## Future Ideas

- Multi-frame animations. `omggif` already supports them, this just needs a timeline UI.
- Browse existing GIFs on the device via `/edit?list=/` so you can overwrite
  or delete from the tool.

PRs and issues welcome.

## License

MIT.
