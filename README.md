# 3D Photo Color Graph (React + Three.js)

This app visualizes uploaded image colors in a 3D HSV graph:
- X axis: Hue
- Y axis: Saturation
- Z axis: Brightness (Value)
- Sphere size: color occurrence count

## Run

No build step is required, but run through a local HTTP server (not `file://`) so preset images can be sampled by canvas:

```bash
cd "/Users/werd/Desktop/Portfolio Web Apps"
python3 -m http.server 5173
```

Then open: `http://localhost:5173`

## Controls

- Upload image
- Color samples
- Pixel step
- Hue/Saturation/Brightness bin counts
- Point size scale
- Min saturation / min brightness filters
- Camera distance
- Grid toggle
- Preset examples strip under the graph (requires files in `./presets/`)

## Preset Images

The app includes a scrollable preset strip and randomly selects one preset when it first loads.
Add your images in `./presets/` named:

`preset-01.png` through `preset-18.png`

If you open `index.html` directly as `file://...`, browsers block preset pixel sampling for security reasons.

See [presets/README.txt](/Users/werd/Desktop/Portfolio%20Web%20Apps/presets/README.txt) for details.
