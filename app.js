(function () {
  const React = window.React;
  const ReactDOM = window.ReactDOM;

  if (!React || !ReactDOM) {
    document.body.innerHTML = '<pre style="color:#ffd7d7;background:#2a0f12;border:1px solid #8a3f48;padding:16px;border-radius:8px">Startup error: React failed to load from CDN.</pre>';
    return;
  }

  const h = React.createElement;
  const useEffect = React.useEffect;
  const useMemo = React.useMemo;
  const useRef = React.useRef;
  const useState = React.useState;

  function rgbToHsv(r, g, b) {
    const nr = r / 255;
    const ng = g / 255;
    const nb = b / 255;
    const max = Math.max(nr, ng, nb);
    const min = Math.min(nr, ng, nb);
    const delta = max - min;

    let hue = 0;
    if (delta !== 0) {
      if (max === nr) hue = ((ng - nb) / delta) % 6;
      else if (max === ng) hue = (nb - nr) / delta + 2;
      else hue = (nr - ng) / delta + 4;

      hue *= 60;
      if (hue < 0) hue += 360;
    }

    const sat = max === 0 ? 0 : delta / max;
    return { h: hue, s: sat, v: max };
  }

  function extractColorBins(imageData, settings) {
    const data = imageData.data;
    const pixelCount = imageData.width * imageData.height;
    const stride = Math.max(1, Math.floor(settings.sampleStep));

    const samples = [];
    let seen = 0;
    for (let i = 0; i < pixelCount && seen < settings.maxSamples; i += stride) {
      const idx = i * 4;
      if (data[idx + 3] < 8) continue;

      const hsv = rgbToHsv(data[idx], data[idx + 1], data[idx + 2]);
      if (hsv.s < settings.saturationFloor || hsv.v < settings.brightnessFloor) continue;

      samples.push(hsv);
      seen += 1;
    }

    const bins = new Map();
    for (let i = 0; i < samples.length; i += 1) {
      const c = samples[i];
      const hBin = Math.min(settings.hueBins - 1, Math.floor((c.h / 360) * settings.hueBins));
      const sBin = Math.min(settings.satBins - 1, Math.floor(c.s * settings.satBins));
      const vBin = Math.min(settings.valBins - 1, Math.floor(c.v * settings.valBins));
      const key = hBin + ':' + sBin + ':' + vBin;
      const existing = bins.get(key);
      if (existing) existing.count += 1;
      else bins.set(key, { hBin: hBin, sBin: sBin, vBin: vBin, count: 1 });
    }

    const points = Array.from(bins.values()).map(function (bin) {
      const hh = ((bin.hBin + 0.5) / settings.hueBins) * 360;
      const ss = (bin.sBin + 0.5) / settings.satBins;
      const vv = (bin.vBin + 0.5) / settings.valBins;
      const sphere = hsvToSphere(hh, ss, vv);
      return {
        x: sphere.x,
        y: sphere.y,
        z: sphere.z,
        hue: hh,
        saturation: ss,
        brightness: vv,
        count: bin.count,
        color: 'hsl(' + Math.round(hh) + ' ' + Math.max(14, ss * 100).toFixed(0) + '% ' + (28 + vv * 58).toFixed(0) + '%)',
      };
    });

    return { points: points, sampled: samples.length, uniqueBins: points.length };
  }

  function hsvToSphere(h, s, v) {
    const theta = (h / 360) * Math.PI * 2;
    const latitude = (v - 0.5) * Math.PI;
    const y = Math.sin(latitude) * 0.5;
    const ringRadius = Math.cos(latitude) * s * 0.5;
    const x = Math.cos(theta) * ringRadius;
    const z = Math.sin(theta) * ringRadius;
    return { x: x, y: y, z: z };
  }

  function rotate3(x, y, z, rx, ry) {
    const cosY = Math.cos(ry);
    const sinY = Math.sin(ry);
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;

    const cosX = Math.cos(rx);
    const sinX = Math.sin(rx);
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;

    return { x: x1, y: y2, z: z2 };
  }

  function project3(v, width, height, zoom) {
    const camera = 2.2;
    const depth = camera - v.z;
    const f = (zoom * 340) / Math.max(0.25, depth);
    return {
      x: width * 0.5 + v.x * f,
      y: height * 0.5 - v.y * f,
      z: v.z,
      depth: depth,
    };
  }

  function drawLine(ctx, a, b, color, width) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = width || 1;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function CanvasGraph(props) {
    const points = props.points;
    const pointScale = props.pointScale;
    const cameraDistance = props.cameraDistance;
    const showGrid = props.showGrid;

    const canvasRef = useRef(null);
    const wrapRef = useRef(null);
    const projectedRef = useRef([]);
    const [view, setView] = useState({ rx: -0.55, ry: 0.75, zoom: 0.9 });
    const [autoRotate, setAutoRotate] = useState(false);
    const [hover, setHover] = useState(null);
    const dragRef = useRef({ active: false, x: 0, y: 0 });

    useEffect(function () {
      function onResize() {
        const wrap = wrapRef.current;
        const canvas = canvasRef.current;
        if (!wrap || !canvas) return;
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const w = Math.max(320, Math.floor(wrap.clientWidth));
        const h = Math.max(360, Math.floor(wrap.clientHeight));
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
      }

      onResize();
      window.addEventListener('resize', onResize);
      return function () {
        window.removeEventListener('resize', onResize);
      };
    }, []);

    useEffect(function () {
      if (points.length > 0) {
        setAutoRotate(true);
        setHover(null);
      }
    }, [points.length]);

    useEffect(function () {
      if (!autoRotate) return;
      const id = window.setInterval(function () {
        setView(function (v) {
          return { rx: v.rx, ry: v.ry + 0.008, zoom: v.zoom };
        });
      }, 16);
      return function () {
        window.clearInterval(id);
      };
    }, [autoRotate]);

    useEffect(function () {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, '#0f1822');
      bg.addColorStop(1, '#0a1118');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const zoom = Math.max(0.18, (4.2 - cameraDistance) * view.zoom);

      function toWorld(wx, wy, wz) {
        const r = rotate3(wx, wy, wz, view.rx, view.ry);
        return project3(r, width, height, zoom);
      }

      if (showGrid) {
        function drawRing(pointAtFn, color) {
          const segments = 84;
          let prev = null;
          for (let i = 0; i <= segments; i += 1) {
            const t = (i / segments) * Math.PI * 2;
            const wp = pointAtFn(t);
            const p = toWorld(wp.x, wp.y, wp.z);
            if (prev) drawLine(ctx, prev, p, color, 1);
            prev = p;
          }
        }

        drawRing(
          function (t) { return { x: Math.cos(t) * 0.5, y: 0, z: Math.sin(t) * 0.5 }; },
          '#365069'
        );
        drawRing(
          function (t) { return { x: Math.cos(t) * 0.5, y: Math.sin(t) * 0.5, z: 0 }; },
          '#2f475d'
        );
        drawRing(
          function (t) { return { x: 0, y: Math.sin(t) * 0.5, z: Math.cos(t) * 0.5 }; },
          '#2f475d'
        );
      }

      const projected = points.map(function (p) {
        const pr = toWorld(p.x, p.y, p.z);
        return {
          x: pr.x,
          y: pr.y,
          z: pr.z,
          depth: pr.depth,
          color: p.color,
          count: p.count,
          hue: p.hue,
          saturation: p.saturation,
          brightness: p.brightness,
          size: 1,
        };
      });

      projected.sort(function (a, b) {
        return b.z - a.z;
      });

      let maxCount = 1;
      for (let i = 0; i < projected.length; i += 1) {
        if (projected[i].count > maxCount) maxCount = projected[i].count;
      }

      for (let i = 0; i < projected.length; i += 1) {
        const p = projected[i];
        const sizeFactor = Math.max(0.4, pointScale);
        const depthBoost = Math.min(1.65, 1 / Math.max(0.72, p.depth));
        const normalized = p.count / maxCount;
        const proportional = Math.pow(normalized, 0.42);
        let size = (2.1 + proportional * 16.0) * sizeFactor * depthBoost;
        const minSize = 1.5 * sizeFactor;
        const maxSize = 21 * sizeFactor;
        size = Math.max(minSize, Math.min(maxSize, size));
        p.size = size;

        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.92;
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;

      ctx.fillStyle = '#8ba2b8';
      ctx.font = '12px sans-serif';
      ctx.fillText('Hue = around sphere', 16, height - 40);
      ctx.fillText('Brightness = vertical latitude', 16, height - 24);
      ctx.fillText('Saturation = radial distance', 16, height - 8);

      projectedRef.current = projected;
    }, [points, pointScale, cameraDistance, showGrid, view]);

    function updateHoverFromEvent(e) {
      const canvas = canvasRef.current;
      if (!canvas || projectedRef.current.length === 0) {
        if (hover) setHover(null);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let best = null;
      let bestDist2 = Infinity;
      const rendered = projectedRef.current;

      for (let i = 0; i < rendered.length; i += 1) {
        const p = rendered[i];
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist2 = dx * dx + dy * dy;
        const hitRadius = Math.max(6, p.size + 3);
        if (dist2 <= hitRadius * hitRadius && dist2 < bestDist2) {
          bestDist2 = dist2;
          best = p;
        }
      }

      if (!best) {
        if (hover) setHover(null);
        return;
      }

      setHover({
        x: best.x + 14,
        y: best.y + 12,
        hue: best.hue,
        saturation: best.saturation,
        brightness: best.brightness,
        count: best.count,
      });
    }

    function onPointerDown(e) {
      setAutoRotate(false);
      dragRef.current.active = true;
      dragRef.current.x = e.clientX;
      dragRef.current.y = e.clientY;
      updateHoverFromEvent(e);
    }

    function onPointerMove(e) {
      updateHoverFromEvent(e);
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current.x = e.clientX;
      dragRef.current.y = e.clientY;
      setView(function (v) {
        return {
          rx: Math.max(-1.5, Math.min(1.5, v.rx + dy * 0.008)),
          ry: v.ry + dx * 0.008,
          zoom: v.zoom,
        };
      });
    }

    function onPointerUp() {
      dragRef.current.active = false;
    }

    function onPointerLeave() {
      dragRef.current.active = false;
      setHover(null);
    }

    function onWheel(e) {
      e.preventDefault();
      setAutoRotate(false);
      const dz = e.deltaY > 0 ? -0.06 : 0.06;
      setView(function (v) {
        return {
          rx: v.rx,
          ry: v.ry,
          zoom: Math.max(0.45, Math.min(1.8, v.zoom + dz)),
        };
      });
    }

    function onDoubleClick() {
      setAutoRotate(function (v) { return !v; });
    }

    return h(
      'div',
      {
        ref: wrapRef,
        className: 'canvas-wrap',
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        onPointerLeave: onPointerLeave,
      },
      h('canvas', {
        ref: canvasRef,
        className: 'graph-canvas',
        onPointerDown: onPointerDown,
        onWheel: onWheel,
        onDoubleClick: onDoubleClick,
      }),
      hover
        ? h(
          'div',
          {
            className: 'point-tooltip',
            style: {
              left: hover.x.toFixed(1) + 'px',
              top: hover.y.toFixed(1) + 'px',
            },
          },
          h('div', null, 'H: ' + hover.hue.toFixed(1) + '°'),
          h('div', null, 'S: ' + (hover.saturation * 100).toFixed(1) + '%'),
          h('div', null, 'V: ' + (hover.brightness * 100).toFixed(1) + '%'),
          h('div', null, 'Count: ' + hover.count)
        )
        : null
    );
  }

  function ControlRange(props) {
    return h(
      'div',
      { className: 'control' },
      h('label', null, props.label, h('span', null, props.valueLabel)),
      h('input', {
        type: 'range',
        min: props.min,
        max: props.max,
        step: props.step,
        value: props.value,
        onChange: function (e) {
          props.onChange(Number(e.target.value));
        },
      })
    );
  }

  function App() {
    const [imageName, setImageName] = useState('No image loaded');
    const [imageData, setImageData] = useState(null);
    const [graphData, setGraphData] = useState({ points: [], sampled: 0, uniqueBins: 0 });
    const [runtimeError, setRuntimeError] = useState('');

    const [settings, setSettings] = useState({
      maxSamples: 18000,
      sampleStep: 1,
      hueBins: 64,
      satBins: 20,
      valBins: 20,
      pointScale: 1.2,
      saturationFloor: 0,
      brightnessFloor: 0,
      cameraDistance: 0.9,
      showGrid: true,
    });

    const prettyPointCount = useMemo(function () {
      return graphData.points.length.toLocaleString();
    }, [graphData.points.length]);

    function setSetting(key, value) {
      setSettings(function (s) {
        const next = Object.assign({}, s);
        next[key] = value;
        return next;
      });
    }

    function onUpload(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = function () {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          const maxDim = 1200;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));

          canvas.width = Math.max(1, Math.floor(img.width * scale));
          canvas.height = Math.max(1, Math.floor(img.height * scale));

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);

          setImageData(data);
          setImageName(file.name);
          setRuntimeError('');
        } catch (err) {
          setRuntimeError(String(err && err.message ? err.message : err));
        } finally {
          URL.revokeObjectURL(url);
        }
      };

      img.onerror = function () {
        setRuntimeError('Could not load image file.');
        URL.revokeObjectURL(url);
      };

      img.src = url;
    }

    function resetGraph() {
      setGraphData({ points: [], sampled: 0, uniqueBins: 0 });
    }

    useEffect(function () {
      if (!imageData) return;
      try {
        const result = extractColorBins(imageData, settings);
        setGraphData(result);
      } catch (err) {
        setRuntimeError(String(err && err.message ? err.message : err));
      }
    }, [imageData, settings]);

    return h(
      'div',
      { className: 'app' },
      h(
        'aside',
        { className: 'panel' },
        h('h1', null, '3D Palette Visualizer'),
        h('p', null, 'Upload a photo to plot HSV values in 3D. Sphere size shows how often that color bucket appears.'),

        h('div', { className: 'control' }, h('label', null, 'Photo'), h('input', { type: 'file', accept: 'image/*', onChange: onUpload })),

        h(ControlRange, { label: 'Camera Distance', valueLabel: settings.cameraDistance.toFixed(2), min: 0, max: 4.2, step: 0.05, value: settings.cameraDistance, onChange: function (v) { setSetting('cameraDistance', v); } }),
        h(ControlRange, { label: 'Color Samples', valueLabel: settings.maxSamples.toLocaleString(), min: 1000, max: 100000, step: 1000, value: settings.maxSamples, onChange: function (v) { setSetting('maxSamples', v); } }),
        h(ControlRange, { label: 'Pixel Step', valueLabel: String(settings.sampleStep), min: 1, max: 20, step: 1, value: settings.sampleStep, onChange: function (v) { setSetting('sampleStep', v); } }),
        h(ControlRange, { label: 'Hue Bins', valueLabel: String(settings.hueBins), min: 8, max: 120, step: 1, value: settings.hueBins, onChange: function (v) { setSetting('hueBins', v); } }),
        h(ControlRange, { label: 'Saturation Bins', valueLabel: String(settings.satBins), min: 4, max: 40, step: 1, value: settings.satBins, onChange: function (v) { setSetting('satBins', v); } }),
        h(ControlRange, { label: 'Brightness Bins', valueLabel: String(settings.valBins), min: 4, max: 40, step: 1, value: settings.valBins, onChange: function (v) { setSetting('valBins', v); } }),
        h(ControlRange, { label: 'Point Size Scale', valueLabel: settings.pointScale.toFixed(2), min: 0.4, max: 2.8, step: 0.05, value: settings.pointScale, onChange: function (v) { setSetting('pointScale', v); } }),
        h(ControlRange, { label: 'Min Saturation', valueLabel: settings.saturationFloor.toFixed(2), min: 0, max: 1, step: 0.01, value: settings.saturationFloor, onChange: function (v) { setSetting('saturationFloor', v); } }),
        h(ControlRange, { label: 'Min Brightness', valueLabel: settings.brightnessFloor.toFixed(2), min: 0, max: 1, step: 0.01, value: settings.brightnessFloor, onChange: function (v) { setSetting('brightnessFloor', v); } }),

        h('div', { className: 'control' },
          h('label', null, 'Show Grid', h('span', null, settings.showGrid ? 'On' : 'Off')),
          h('input', { type: 'checkbox', checked: settings.showGrid, onChange: function (e) { setSetting('showGrid', e.target.checked); } })
        ),

        h('div', { className: 'button-row' },
          h('button', { onClick: function () { if (imageData) setGraphData(extractColorBins(imageData, settings)); } }, 'Rebuild'),
          h('button', { className: 'secondary', onClick: resetGraph }, 'Clear')
        ),

        h('div', { className: 'meta' },
          h('div', null, 'Image: ' + imageName),
          h('div', null, 'Sampled Pixels: ' + graphData.sampled.toLocaleString()),
          h('div', null, 'Active Color Buckets: ' + prettyPointCount),
          runtimeError ? h('div', { style: { color: '#ff8f8f', marginTop: '8px' } }, 'Runtime error: ' + runtimeError) : null
        ),

        h('div', { className: 'legend' }, 'Color sphere mapping: hue wraps around, brightness is vertical, saturation moves toward/away from center. Auto-rotates after upload. Click/drag or scroll to freeze. Double-click to resume/pause rotation.')
      ),

      h('section', { className: 'viewer' },
        h(CanvasGraph, {
          points: graphData.points,
          pointScale: settings.pointScale,
          cameraDistance: settings.cameraDistance,
          showGrid: settings.showGrid,
        })
      )
    );
  }

  try {
    const rootEl = document.getElementById('root');
    ReactDOM.createRoot(rootEl).render(h(App));
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    document.body.innerHTML = '<pre style="color:#ffd7d7;background:#2a0f12;border:1px solid #8a3f48;padding:16px;border-radius:8px">Startup error: ' + msg + '</pre>';
  }
})();
