const { useEffect, useMemo, useRef, useState } = React;

function rgbToHsv(r, g, b) {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === nr) h = ((ng - nb) / delta) % 6;
    else if (max === ng) h = (nb - nr) / delta + 2;
    else h = (nr - ng) / delta + 4;

    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

function extractColorBins(imageData, settings) {
  const {
    hueBins,
    satBins,
    valBins,
    maxSamples,
    saturationFloor,
    brightnessFloor,
    sampleStep,
  } = settings;

  const data = imageData.data;
  const pixelCount = imageData.width * imageData.height;
  const stride = Math.max(1, Math.floor(sampleStep));

  const samples = [];
  for (let i = 0, seen = 0; i < pixelCount && seen < maxSamples; i += stride) {
    const idx = i * 4;
    const a = data[idx + 3];
    if (a < 8) continue;

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const hsv = rgbToHsv(r, g, b);
    if (hsv.s < saturationFloor || hsv.v < brightnessFloor) continue;

    samples.push(hsv);
    seen += 1;
  }

  const bins = new Map();
  for (const hsv of samples) {
    const hBin = Math.min(hueBins - 1, Math.floor((hsv.h / 360) * hueBins));
    const sBin = Math.min(satBins - 1, Math.floor(hsv.s * satBins));
    const vBin = Math.min(valBins - 1, Math.floor(hsv.v * valBins));
    const key = `${hBin}:${sBin}:${vBin}`;

    const existing = bins.get(key);
    if (existing) existing.count += 1;
    else bins.set(key, { hBin, sBin, vBin, count: 1 });
  }

  const points = Array.from(bins.values()).map((bin) => {
    const h = ((bin.hBin + 0.5) / hueBins) * 360;
    const s = (bin.sBin + 0.5) / satBins;
    const v = (bin.vBin + 0.5) / valBins;

    return {
      x: h / 360,
      y: s,
      z: v,
      count: bin.count,
      color: `hsl(${h.toFixed(0)} ${Math.max(14, s * 100).toFixed(0)}% ${(28 + v * 58).toFixed(0)}%)`,
    };
  });

  return {
    points,
    sampled: samples.length,
    uniqueBins: points.length,
  };
}

function createAxisLine(start, end, color = 0x8aa2ba) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...start),
    new THREE.Vector3(...end),
  ]);
  const material = new THREE.LineBasicMaterial({ color });
  return new THREE.Line(geometry, material);
}

function ThreeColorGraph({ points, pointScale, cameraDistance, showGrid }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const meshGroupRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const gridRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1118);

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.01, 100);
    camera.position.set(cameraDistance, cameraDistance * 0.95, cameraDistance * 1.3);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    let controls;
    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.target.set(0.5, 0.5, 0.5);
    } else {
      controls = {
        update() {},
        dispose() {},
      };
    }
    controlsRef.current = controls;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.6);
    directional.position.set(2, 2.5, 2);
    scene.add(directional);

    const box = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)), 0x344f68);
    scene.add(box);

    const axisX = createAxisLine([0, 0, 0], [1.15, 0, 0], 0xff8585);
    const axisY = createAxisLine([0, 0, 0], [0, 1.15, 0], 0x8dffb3);
    const axisZ = createAxisLine([0, 0, 0], [0, 0, 1.15], 0x8db7ff);
    scene.add(axisX, axisY, axisZ);

    if (showGrid) {
      const grid = new THREE.GridHelper(1.2, 12, 0x46617e, 0x2a3847);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = 0.6;
      scene.add(grid);
      gridRef.current = grid;
    }

    const meshGroup = new THREE.Group();
    scene.add(meshGroup);

    let frameId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    const resize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener("resize", resize);

    sceneRef.current = scene;
    meshGroupRef.current = meshGroup;

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (!meshGroupRef.current) return;
    const meshGroup = meshGroupRef.current;

    while (meshGroup.children.length > 0) {
      const obj = meshGroup.children.pop();
      obj.geometry?.dispose?.();
      obj.material?.dispose?.();
      meshGroup.remove(obj);
    }

    if (points.length === 0) return;

    const maxCount = points.reduce((m, p) => Math.max(m, p.count), 1);

    points.forEach((point) => {
      const radius = 0.004 + Math.pow(point.count / maxCount, 0.5) * pointScale;
      const geometry = new THREE.SphereGeometry(radius, 12, 12);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(point.color),
        roughness: 0.35,
        metalness: 0.08,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(point.x, point.y, point.z);
      meshGroup.add(mesh);
    });
  }, [points, pointScale]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.set(cameraDistance, cameraDistance * 0.95, cameraDistance * 1.3);
    controls.update();
  }, [cameraDistance]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (showGrid && !gridRef.current) {
      const grid = new THREE.GridHelper(1.2, 12, 0x46617e, 0x2a3847);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = 0.6;
      scene.add(grid);
      gridRef.current = grid;
      return;
    }

    if (!showGrid && gridRef.current) {
      scene.remove(gridRef.current);
      gridRef.current.geometry?.dispose?.();
      gridRef.current.material?.dispose?.();
      gridRef.current = null;
    }
  }, [showGrid]);

  return <div ref={containerRef} className="canvas-wrap" />;
}

function App() {
  const [imageName, setImageName] = useState("No image loaded");
  const [imageData, setImageData] = useState(null);
  const [graphData, setGraphData] = useState({ points: [], sampled: 0, uniqueBins: 0 });

  const [settings, setSettings] = useState({
    maxSamples: 18000,
    sampleStep: 1,
    hueBins: 64,
    satBins: 20,
    valBins: 20,
    pointScale: 0.06,
    saturationFloor: 0,
    brightnessFloor: 0,
    cameraDistance: 1.8,
    showGrid: true,
  });

  const prettyPointCount = useMemo(() => graphData.points.length.toLocaleString(), [graphData.points.length]);

  const onUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const maxDim = 1200;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.floor(img.width * scale));
      canvas.height = Math.max(1, Math.floor(img.height * scale));

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setImageData(data);
      setImageName(file.name);
      URL.revokeObjectURL(url);
    };

    img.src = url;
  };

  const resetGraph = () => {
    setGraphData({ points: [], sampled: 0, uniqueBins: 0 });
  };

  useEffect(() => {
    if (imageData) {
      const result = extractColorBins(imageData, settings);
      setGraphData(result);
    }
  }, [imageData, settings]);

  return (
    <div className="app">
      <aside className="panel">
        <h1>3D Photo Color Graph</h1>
        <p>Upload a photo to plot HSV values in 3D. Sphere size shows how often that color bucket appears.</p>

        <div className="control">
          <label>Photo</label>
          <input type="file" accept="image/*" onChange={onUpload} />
        </div>

        <div className="control">
          <label>
            Color Samples
            <span>{settings.maxSamples.toLocaleString()}</span>
          </label>
          <input
            type="range"
            min="1000"
            max="100000"
            step="1000"
            value={settings.maxSamples}
            onChange={(e) => setSettings((s) => ({ ...s, maxSamples: Number(e.target.value) }))}
          />
        </div>

        <div className="control">
          <label>
            Pixel Step
            <span>{settings.sampleStep}</span>
          </label>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={settings.sampleStep}
            onChange={(e) => setSettings((s) => ({ ...s, sampleStep: Number(e.target.value) }))}
          />
        </div>

        <div className="control">
          <label>
            Hue Bins
            <span>{settings.hueBins}</span>
          </label>
          <input
            type="range"
            min="8"
            max="120"
            step="1"
            value={settings.hueBins}
            onChange={(e) => setSettings((s) => ({ ...s, hueBins: Number(e.target.value) }))}
          />
        </div>

        <div className="control">
          <label>
            Saturation Bins
            <span>{settings.satBins}</span>
          </label>
          <input
            type="range"
            min="4"
            max="40"
            step="1"
            value={settings.satBins}
            onChange={(e) => setSettings((s) => ({ ...s, satBins: Number(e.target.value) }))}
          />
        </div>

        <div className="control">
          <label>
            Brightness Bins
            <span>{settings.valBins}</span>
          </label>
          <input
            type="range"
            min="4"
            max="40"
            step="1"
            value={settings.valBins}
            onChange={(e) => setSettings((s) => ({ ...s, valBins: Number(e.target.value) }))}
          />
        </div>

        <div className="control">
          <label>
            Point Size Scale
            <span>{settings.pointScale.toFixed(3)}</span>
          </label>
          <input
            type="range"
            min="0.01"
            max="0.12"
            step="0.005"
            value={settings.pointScale}
            onChange={(e) => setSettings((s) => ({ ...s, pointScale: Number(e.target.value) }))}
          />
        </div>

        <div className="control">
          <label>
            Min Saturation
            <span>{settings.saturationFloor.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.saturationFloor}
            onChange={(e) => setSettings((s) => ({ ...s, saturationFloor: Number(e.target.value) }))}
          />
        </div>

        <div className="control">
          <label>
            Min Brightness
            <span>{settings.brightnessFloor.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.brightnessFloor}
            onChange={(e) => setSettings((s) => ({ ...s, brightnessFloor: Number(e.target.value) }))}
          />
        </div>

        <div className="control">
          <label>
            Camera Distance
            <span>{settings.cameraDistance.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="1.2"
            max="3.8"
            step="0.05"
            value={settings.cameraDistance}
            onChange={(e) => setSettings((s) => ({ ...s, cameraDistance: Number(e.target.value) }))}
          />
        </div>

        <div className="control">
          <label>
            Show Grid
            <span>{settings.showGrid ? "On" : "Off"}</span>
          </label>
          <input
            type="checkbox"
            checked={settings.showGrid}
            onChange={(e) => setSettings((s) => ({ ...s, showGrid: e.target.checked }))}
          />
        </div>

        <div className="button-row">
          <button onClick={() => imageData && setGraphData(extractColorBins(imageData, settings))}>Rebuild</button>
          <button className="secondary" onClick={resetGraph}>Clear</button>
        </div>

        <div className="meta">
          <div>Image: {imageName}</div>
          <div>Sampled Pixels: {graphData.sampled.toLocaleString()}</div>
          <div>Active Color Buckets: {prettyPointCount}</div>
        </div>

        <div className="legend">Axes: X = Hue, Y = Saturation, Z = Brightness (Value). Drag to orbit and inspect.</div>
      </aside>

      <section className="viewer">
        <ThreeColorGraph
          points={graphData.points}
          pointScale={settings.pointScale}
          cameraDistance={settings.cameraDistance}
          showGrid={settings.showGrid}
        />
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
