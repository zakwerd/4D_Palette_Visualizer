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
  const PRESET_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
  const PRESET_SLOTS = Array.from({ length: 23 }, function (_v, i) {
    return String(i + 1).padStart(2, '0');
  });
  const FALLBACK_PRESET_SVG = [
    "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='900' viewBox='0 0 1200 900'>",
    "<defs>",
    "<linearGradient id='g1' x1='0' y1='0' x2='1' y2='1'>",
    "<stop offset='0%' stop-color='#0ab8a1'/>",
    "<stop offset='35%' stop-color='#0f7db8'/>",
    "<stop offset='70%' stop-color='#f2b705'/>",
    "<stop offset='100%' stop-color='#ef476f'/>",
    "</linearGradient>",
    "</defs>",
    "<rect width='1200' height='900' fill='url(#g1)'/>",
    "<circle cx='250' cy='220' r='190' fill='#ffe38c' opacity='0.7'/>",
    "<circle cx='890' cy='280' r='220' fill='#84f0cb' opacity='0.55'/>",
    "<rect x='180' y='520' width='760' height='220' rx='40' fill='#17334d' opacity='0.5'/>",
    "<path d='M120 700 C300 480, 540 880, 760 650 C930 490, 1080 760, 1160 620' stroke='#ffffff' stroke-width='26' fill='none' opacity='0.55'/>",
    "</svg>",
  ].join("");
  const FALLBACK_PRESET_SRC = 'data:image/svg+xml;utf8,' + encodeURIComponent(FALLBACK_PRESET_SVG);
  const FALLBACK_PRESET = { name: 'Preset Demo', src: FALLBACK_PRESET_SRC, isDemo: true };
  const DATA_CACHE_BUSTER = '2026-03-02-kandinsky-1';
  const ARTIST_OPTIONS = [
    { id: 'basquiat', label: 'Basquiat', searchName: 'Jean-Michel Basquiat', dataPath: './data/basquait-palettes.json' },
    { id: 'cezanne', label: 'Cezanne', searchName: 'Paul Cezanne', dataPath: './data/cezanne-palettes.json' },
    { id: 'kandinsky', label: 'Kandinsky', searchName: 'Wassily Kandinsky', dataPath: './data/kandinsky-palettes.json' },
    { id: 'vangogh', label: 'Van Gogh', searchName: 'Vincent van Gogh', dataPath: './data/van-gogh-palettes.json' },
  ];
  const DEFAULT_ARTIST_BLURBS = {
    basquiat: {
      title: "Basquiat's Palettes:",
      body: "Basquiat's palettes are bold, high-contrast, and emotionally charged. He often juxtaposes saturated primaries-acidic yellows, hot reds, electric blues-with raw blacks and exposed ground, creating tension between vibrancy and abrasion. Color functions less as natural description and more as symbolic force: crowns glow in yellow, skeletal figures clash against dark fields, and layered marks allow hues to bleed, scrape, and collide. His paintings feel chromatically urgent-color as rhythm, protest, and pulse rather than harmony.",
    },
    vangogh: {
      title: "Van Gogh's Palettes:",
      body: "Van Gogh’s palettes are intense, expressive, and emotionally saturated. He amplifies complementary contrasts-vivid yellows against cobalt blues, viridian greens against burning oranges-to heighten psychological charge. Thick impasto brushstrokes make color tactile, turning pigment into movement and light into rhythm. Rather than naturalistic harmony, he pursues chromatic emotion: night skies vibrate in electric blues, fields blaze in sulfurous gold, and shadows pulse with unexpected violets. In his work, color is not descriptive-it is feeling made visible.",
    },
    cezanne: {
      title: "Cezanne's Palettes:",
      body: "Cézanne’s palettes are structured, modulated, and architectonic. He builds form through interlocking planes of color-cool blues and greens balancing warm ochres, siennas, and muted reds-allowing hue shifts to model depth instead of relying on line or heavy shadow. Rather than dramatic contrast, he favors tonal variation and subtle temperature changes, letting strokes accumulate into stable, geometric harmony. His color is constructive: patches of pigment operate like facets, turning apples, mountains, and figures into enduring arrangements of light and structure.",
    },
    kandinsky: {
      title: "Kandinsky's Palettes:",
      body: "Kandinsky’s color language is abstract, musical, and structural. His palettes move between luminous primaries, dark anchors, and rhythmic contrasts, using color as an autonomous force rather than natural description. Across years, his work shifts from expressive washes to sharper geometric orchestration while preserving chromatic tension and motion.",
    },
  };

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

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsv = rgbToHsv(r, g, b);
      if (hsv.s < settings.saturationFloor || hsv.v < settings.brightnessFloor) continue;

      samples.push({
        h: hsv.h,
        s: hsv.s,
        v: hsv.v,
        r: r,
        g: g,
        b: b,
      });
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
      if (existing) {
        existing.count += 1;
        existing.rSum += c.r;
        existing.gSum += c.g;
        existing.bSum += c.b;
      } else {
        bins.set(key, {
          hBin: hBin,
          sBin: sBin,
          vBin: vBin,
          count: 1,
          rSum: c.r,
          gSum: c.g,
          bSum: c.b,
        });
      }
    }

    const points = Array.from(bins.values()).map(function (bin) {
      const hh = ((bin.hBin + 0.5) / settings.hueBins) * 360;
      const ss = (bin.sBin + 0.5) / settings.satBins;
      const vv = (bin.vBin + 0.5) / settings.valBins;
      const sphere = hsvToSphere(hh, ss, vv);
      const avgR = Math.round(bin.rSum / bin.count);
      const avgG = Math.round(bin.gSum / bin.count);
      const avgB = Math.round(bin.bSum / bin.count);
      return {
        x: sphere.x,
        y: sphere.y,
        z: sphere.z,
        hue: hh,
        saturation: ss,
        brightness: vv,
        count: bin.count,
        color: 'rgb(' + avgR + ' ' + avgG + ' ' + avgB + ')',
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

  function pointToFeature(p) {
    const rad = (p.hue / 180) * Math.PI;
    const chroma = p.saturation;
    return {
      x: Math.cos(rad) * chroma,
      y: Math.sin(rad) * chroma,
      z: p.brightness,
    };
  }

  function featureDistance2(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = (a.z - b.z) * 0.85;
    return dx * dx + dy * dy + dz * dz;
  }

  function hsvToRgb(hh, ss, vv) {
    const h = ((hh % 360) + 360) % 360;
    const c = vv * ss;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = vv - c;
    let r = 0;
    let g = 0;
    let b = 0;

    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }

  function normalizeHue(h) {
    return ((h % 360) + 360) % 360;
  }

  function withDataVersion(path) {
    const sep = path.indexOf('?') >= 0 ? '&' : '?';
    return path + sep + 'v=' + encodeURIComponent(DATA_CACHE_BUSTER);
  }

  function toHexByte(n) {
    const s = Math.max(0, Math.min(255, n)).toString(16);
    return s.length === 1 ? '0' + s : s;
  }

  function createRng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildImagePalette(points, paletteSize, variationSeed) {
    if (!points.length || paletteSize < 1) return [];
    const rand = createRng(variationSeed || 1);

    const sorted = points.slice().sort(function (a, b) { return b.count - a.count; });
    const sampleLimit = Math.min(sorted.length, Math.max(2600, paletteSize * 320));
    const source = sorted.slice(0, sampleLimit);
    const features = source.map(pointToFeature);
    const k = Math.min(paletteSize, source.length);
    const centers = [];
    const firstIndex = Math.min(source.length - 1, Math.floor(rand() * Math.min(source.length, Math.max(1, paletteSize * 5))));
    centers.push({ x: features[firstIndex].x, y: features[firstIndex].y, z: features[firstIndex].z });

    // Deterministic weighted farthest-point init to spread centers across the image's palette.
    while (centers.length < k) {
      let bestI = -1;
      let bestScore = -1;
      for (let i = 0; i < source.length; i += 1) {
        const f = features[i];
        let nearest = Infinity;
        for (let c = 0; c < centers.length; c += 1) {
          nearest = Math.min(nearest, featureDistance2(f, centers[c]));
        }
        const score = nearest * source[i].count * (0.9 + rand() * 0.2);
        if (score > bestScore) {
          bestScore = score;
          bestI = i;
        }
      }
      if (bestI < 0) break;
      centers.push({ x: features[bestI].x, y: features[bestI].y, z: features[bestI].z });
    }

    const assignments = new Array(source.length).fill(0);
    for (let iter = 0; iter < 10; iter += 1) {
      const sums = centers.map(function () { return { x: 0, y: 0, z: 0, w: 0 }; });

      for (let i = 0; i < source.length; i += 1) {
        const f = features[i];
        let bestK = 0;
        let bestDist = Infinity;
        for (let c = 0; c < centers.length; c += 1) {
          const d = featureDistance2(f, centers[c]);
          if (d < bestDist) {
            bestDist = d;
            bestK = c;
          }
        }
        assignments[i] = bestK;
        const w = source[i].count;
        sums[bestK].x += f.x * w;
        sums[bestK].y += f.y * w;
        sums[bestK].z += f.z * w;
        sums[bestK].w += w;
      }

      for (let c = 0; c < centers.length; c += 1) {
        if (sums[c].w > 0) {
          centers[c].x = sums[c].x / sums[c].w;
          centers[c].y = sums[c].y / sums[c].w;
          centers[c].z = sums[c].z / sums[c].w;
        }
      }
    }

    const clusters = centers.map(function () {
      return { x: 0, y: 0, z: 0, w: 0 };
    });
    for (let i = 0; i < source.length; i += 1) {
      const idx = assignments[i];
      const w = source[i].count;
      clusters[idx].x += features[i].x * w;
      clusters[idx].y += features[i].y * w;
      clusters[idx].z += features[i].z * w;
      clusters[idx].w += w;
    }

    const palette = [];
    for (let c = 0; c < clusters.length; c += 1) {
      const cl = clusters[c];
      if (cl.w <= 0) continue;
      const cx = cl.x / cl.w;
      const cy = cl.y / cl.w;
      const cz = Math.max(0, Math.min(1, cl.z / cl.w));
      const sat = Math.max(0, Math.min(1, Math.sqrt(cx * cx + cy * cy)));
      let hue = (Math.atan2(cy, cx) * 180) / Math.PI;
      if (hue < 0) hue += 360;
      const rgb = hsvToRgb(hue, sat, cz);
      const hex = '#' + toHexByte(rgb.r) + toHexByte(rgb.g) + toHexByte(rgb.b);
      palette.push({
        id: c + '-' + Math.round(hue) + '-' + Math.round(cl.w),
        color: 'rgb(' + rgb.r + ' ' + rgb.g + ' ' + rgb.b + ')',
        hex: hex.toUpperCase(),
        count: Math.round(cl.w),
      });
    }

    palette.sort(function (a, b) { return b.count - a.count; });
    return palette.slice(0, paletteSize);
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

  function imageToImageData(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const maxDim = 1200;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.floor(img.width * scale));
    canvas.height = Math.max(1, Math.floor(img.height * scale));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function buildRandomDemoPreset() {
    const w = 1200;
    const h = 900;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = w;
    canvas.height = h;

    const hueA = Math.floor(Math.random() * 360);
    const hueB = normalizeHue(hueA + 55 + Math.random() * 180);
    const hueC = normalizeHue(hueA + 150 + Math.random() * 120);

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, 'hsl(' + hueA + ' 78% 38%)');
    grad.addColorStop(0.45, 'hsl(' + hueB + ' 74% 34%)');
    grad.addColorStop(1, 'hsl(' + hueC + ' 80% 44%)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const layers = 10 + Math.floor(Math.random() * 6);
    for (let i = 0; i < layers; i += 1) {
      const hShift = normalizeHue(hueA + (i * 31) + (Math.random() * 70));
      const sat = 48 + Math.random() * 44;
      const light = 30 + Math.random() * 42;
      ctx.globalAlpha = 0.18 + Math.random() * 0.4;
      ctx.fillStyle = 'hsl(' + hShift + ' ' + sat.toFixed(1) + '% ' + light.toFixed(1) + '%)';
      const cx = Math.random() * w;
      const cy = Math.random() * h;
      const rx = 80 + Math.random() * 360;
      const ry = 70 + Math.random() * 280;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const lineCount = 14 + Math.floor(Math.random() * 16);
    for (let i = 0; i < lineCount; i += 1) {
      const hLine = normalizeHue(hueB + (Math.random() * 130) - 65);
      const sat = 58 + Math.random() * 35;
      const light = 46 + Math.random() * 30;
      ctx.globalAlpha = 0.24 + Math.random() * 0.42;
      ctx.strokeStyle = 'hsl(' + hLine + ' ' + sat.toFixed(1) + '% ' + light.toFixed(1) + '%)';
      ctx.lineWidth = 4 + Math.random() * 24;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(Math.random() * w, Math.random() * h);
      ctx.bezierCurveTo(
        Math.random() * w,
        Math.random() * h,
        Math.random() * w,
        Math.random() * h,
        Math.random() * w,
        Math.random() * h
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    return {
      imageData: ctx.getImageData(0, 0, w, h),
      previewSrc: canvas.toDataURL('image/png'),
    };
  }

  function canSampleImage(src) {
    return new Promise(function (resolve) {
      const img = new Image();
      if (/^https?:\/\//i.test(src)) img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          const c = document.createElement('canvas');
          const ctx = c.getContext('2d', { willReadFrequently: true });
          c.width = 1;
          c.height = 1;
          ctx.drawImage(img, 0, 0, 1, 1);
          ctx.getImageData(0, 0, 1, 1);
          resolve(true);
        } catch (_err) {
          resolve(false);
        }
      };
      img.onerror = function () {
        resolve(false);
      };
      img.src = src;
    });
  }

  function canLoadImage(src) {
    return new Promise(function (resolve) {
      const img = new Image();
      if (/^https?:\/\//i.test(src)) img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(true); };
      img.onerror = function () { resolve(false); };
      img.src = src;
    });
  }

  function isFileProtocolPage() {
    return typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
  }

  function isLocalPresetSource(src) {
    return /^\.?\/?presets\//i.test(src);
  }

  function resolvePresetSource(slot) {
    if (isFileProtocolPage()) return Promise.resolve(null);

    const sources = PRESET_EXTENSIONS.map(function (ext) {
      return './presets/preset-' + slot + '.' + ext;
    });

    function tryAt(index) {
      if (index >= sources.length) return Promise.resolve(null);
      return canLoadImage(sources[index]).then(function (ok) {
        if (ok) return sources[index];
        return tryAt(index + 1);
      });
    }

    return tryAt(0);
  }

  function yearStartValue(yearText) {
    if (!yearText) return Number.POSITIVE_INFINITY;
    const m = String(yearText).match(/(\d{4})/);
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  }

  function buildShuffledIndices(total) {
    const order = Array.from({ length: total }, function (_v, i) { return i; });
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    return order;
  }

  function parseArtistGraphs(data) {
    if (!data || !Array.isArray(data.graphs)) return [];
    return data.graphs.map(function (g) {
      return {
        id: g.id,
        title: g.title || g.id,
        year: g.year || null,
        source: g.source || '',
        image: g.image || '',
        points: (g.points || []).map(function (p) {
          return Object.assign({}, p, {
            color: 'rgb(' + p.r + ' ' + p.g + ' ' + p.b + ')',
          });
        }),
      };
    });
  }

  function CanvasGraph(props) {
    const points = props.points;
    const pointScale = props.pointScale;
    const cameraDistance = props.cameraDistance;
    const showGrid = props.showGrid;
    const hueResetToken = props.hueResetToken;
    const externalHueShiftDeg = props.hueShiftDeg;
    const onHueShiftChange = props.onHueShiftChange;
    const miniImageSrc = props.miniImageSrc;
    const showBackLink = props.showBackLink !== false;
    const showMiniViewer = props.showMiniViewer !== false;
    const stopAutoRotateOnWheel = props.stopAutoRotateOnWheel !== false;

    const canvasRef = useRef(null);
    const wrapRef = useRef(null);
    const projectedRef = useRef([]);
    const [view, setView] = useState(function () {
      return {
        rx: (Math.random() * 2.4) - 1.2,
        ry: Math.random() * Math.PI * 2,
        zoom: 0.9,
      };
    });
    const [hueShiftDeg, setHueShiftDeg] = useState(0);
    const [autoRotate, setAutoRotate] = useState(false);
    const [hover, setHover] = useState(null);
    const [miniViewerOpen, setMiniViewerOpen] = useState(false);
    const dragRef = useRef({ active: false, x: 0, y: 0 });
    const wheelDragRef = useRef({ active: false });
    const wheelUiRef = useRef(null);

    function updateHueShift(nextDeg) {
      const normalized = normalizeHue(nextDeg);
      setHueShiftDeg(normalized);
      if (onHueShiftChange) onHueShiftChange(normalized);
    }

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
      setHueShiftDeg(0);
    }, [hueResetToken]);

    useEffect(function () {
      setMiniViewerOpen(false);
    }, [hueResetToken]);

    useEffect(function () {
      if (typeof externalHueShiftDeg !== 'number') return;
      setHueShiftDeg(normalizeHue(externalHueShiftDeg));
    }, [externalHueShiftDeg]);

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
        const shiftedHue = normalizeHue(p.hue + hueShiftDeg);
        const shiftedRgb = hsvToRgb(shiftedHue, p.saturation, p.brightness);
        const shiftedColor = 'rgb(' + shiftedRgb.r + ' ' + shiftedRgb.g + ' ' + shiftedRgb.b + ')';
        const pr = toWorld(p.x, p.y, p.z);
        return {
          x: pr.x,
          y: pr.y,
          z: pr.z,
          depth: pr.depth,
          color: shiftedColor,
          count: p.count,
          hue: shiftedHue,
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
        const normalized = p.count / maxCount;
        let size = (1.5 + normalized * 19.5) * sizeFactor;
        const minSize = 1.5 * sizeFactor;
        const maxSize = 21 * sizeFactor;
        size = Math.max(minSize, Math.min(maxSize, size));
        p.size = size;

        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 1;
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2D hue wheel inset: angle = hue, radius = saturation, point alpha/size influenced by value/count.
      if (points.length) {
        const insetRadius = Math.max(52, Math.min(82, Math.floor(Math.min(width, height) * 0.12)));
        const insetPadding = 22;
        const insetCx = width - insetRadius - insetPadding;
        const insetCy = height - insetRadius - insetPadding;
        const plotRadius = insetRadius - 10;
        const controlRadius = insetRadius + 18;
        const handleAngle = (normalizeHue(hueShiftDeg) / 180) * Math.PI;
        const handleRadius = 7;
        const handleX = insetCx + Math.cos(handleAngle) * controlRadius;
        const handleY = insetCy + Math.sin(handleAngle) * controlRadius;
        const resetR = 10;
        const resetX = width - (resetR + 8);
        const resetY = height - (resetR + 8);

        ctx.save();
        ctx.beginPath();
        ctx.arc(insetCx, insetCy, insetRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(30, 28, 33, 0.92)';
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(130, 169, 201, 0.45)';
        ctx.stroke();

        if (typeof ctx.createConicGradient === 'function') {
          const hueRing = ctx.createConicGradient(0, insetCx, insetCy);
          hueRing.addColorStop(0 / 6, '#ff0000');
          hueRing.addColorStop(1 / 6, '#ffff00');
          hueRing.addColorStop(2 / 6, '#00ff00');
          hueRing.addColorStop(3 / 6, '#00ffff');
          hueRing.addColorStop(4 / 6, '#0000ff');
          hueRing.addColorStop(5 / 6, '#ff00ff');
          hueRing.addColorStop(1, '#ff0000');
          ctx.beginPath();
          ctx.arc(insetCx, insetCy, insetRadius - 3, 0, Math.PI * 2);
          ctx.lineWidth = 4;
          ctx.strokeStyle = hueRing;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(insetCx, insetCy, plotRadius, 0, Math.PI * 2);
        ctx.clip();

        for (let i = 0; i < points.length; i += 1) {
          const p = points[i];
          const shiftedHue = normalizeHue(p.hue + hueShiftDeg);
          const shiftedRgb = hsvToRgb(shiftedHue, p.saturation, p.brightness);
          const shiftedColor = 'rgb(' + shiftedRgb.r + ' ' + shiftedRgb.g + ' ' + shiftedRgb.b + ')';
          const angle = (shiftedHue / 360) * Math.PI * 2;
          const radius = Math.max(0, Math.min(1, p.saturation)) * plotRadius;
          const px = insetCx + Math.cos(angle) * radius;
          const py = insetCy + Math.sin(angle) * radius;
          const localNorm = p.count / maxCount;
          const dotSize = 0.8 + Math.pow(localNorm, 0.5) * 5.2;

          ctx.beginPath();
          ctx.fillStyle = shiftedColor;
          ctx.globalAlpha = 0.25 + (Math.max(0, Math.min(1, p.brightness)) * 0.75);
          ctx.arc(px, py, dotSize, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = 'rgba(238, 243, 250, 0.75)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(insetCx, insetCy, controlRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.98;
        ctx.fillStyle = 'rgba(226, 232, 241, 0.98)';
        ctx.beginPath();
        ctx.arc(handleX, handleY, handleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(31, 44, 62, 0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.globalAlpha = 0.96;
        ctx.fillStyle = 'rgba(22, 42, 63, 0.95)';
        ctx.strokeStyle = 'rgba(117, 155, 194, 0.92)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(resetX, resetY, resetR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Reset icon (curved arrow)
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#d8deea';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(resetX, resetY, 5.2, Math.PI * 0.28, Math.PI * 1.72);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(resetX + 4.6, resetY - 2.8);
        ctx.lineTo(resetX + 2.0, resetY - 3.3);
        ctx.lineTo(resetX + 3.2, resetY - 0.8);
        ctx.fillStyle = '#d8deea';
        ctx.fill();

        wheelUiRef.current = {
          cx: insetCx,
          cy: insetCy,
          controlRadius: controlRadius,
          handleX: handleX,
          handleY: handleY,
          handleRadius: handleRadius,
          resetButton: { x: resetX, y: resetY, r: resetR },
        };
      } else {
        wheelUiRef.current = null;
      }

      ctx.globalAlpha = 1;

      ctx.fillStyle = '#8ba2b8';
      ctx.font = '12px sans-serif';
      ctx.fillText('Hue = around sphere', 16, height - 40);
      ctx.fillText('Brightness = vertical latitude', 16, height - 24);
      ctx.fillText('Saturation = radial distance', 16, height - 8);

      projectedRef.current = projected;
    }, [points, pointScale, cameraDistance, showGrid, view, hueShiftDeg]);

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
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const ui = wheelUiRef.current;
        if (ui) {
          const dxh = mx - ui.handleX;
          const dyh = my - ui.handleY;
          const handleHit = (dxh * dxh + dyh * dyh) <= Math.pow(ui.handleRadius + 4, 2);
          const distCenter = Math.hypot(mx - ui.cx, my - ui.cy);
          const ringHit = Math.abs(distCenter - ui.controlRadius) <= 10;
          const dResetX = mx - ui.resetButton.x;
          const dResetY = my - ui.resetButton.y;
          const inReset = (dResetX * dResetX + dResetY * dResetY) <= Math.pow(ui.resetButton.r + 3, 2);

          if (inReset) {
            updateHueShift(0);
            setHover(null);
            return;
          }

          if (handleHit || ringHit) {
            const angle = Math.atan2(my - ui.cy, mx - ui.cx);
            updateHueShift((angle * 180) / Math.PI);
            wheelDragRef.current.active = true;
            if (canvas.setPointerCapture && e.pointerId != null) canvas.setPointerCapture(e.pointerId);
            setHover(null);
            return;
          }
        }
      }

      setAutoRotate(false);
      dragRef.current.active = true;
      dragRef.current.x = e.clientX;
      dragRef.current.y = e.clientY;
      updateHoverFromEvent(e);
    }

    function onPointerMove(e) {
      if (wheelDragRef.current.active) {
        const ui = wheelUiRef.current;
        const canvas = canvasRef.current;
        if (ui && canvas) {
          const rect = canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const angle = Math.atan2(my - ui.cy, mx - ui.cx);
          updateHueShift((angle * 180) / Math.PI);
          setHover(null);
        }
        return;
      }

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
      wheelDragRef.current.active = false;
      dragRef.current.active = false;
    }

    function onPointerLeave() {
      wheelDragRef.current.active = false;
      dragRef.current.active = false;
      setHover(null);
    }

    function onWheel(e) {
      e.preventDefault();
      if (stopAutoRotateOnWheel) setAutoRotate(false);
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
      showBackLink
        ? h(
          'a',
          {
            href: 'https://juicedup.cargo.site/',
            className: 'back-juice-link',
          },
          'Back to JUICE'
        )
        : null,
      showMiniViewer && miniImageSrc
        ? h(
          'button',
          {
            type: 'button',
            className: 'mini-viewer-btn',
            onClick: function () { setMiniViewerOpen(true); },
            title: 'Open image preview',
          },
          h('img', {
            className: 'mini-viewer-image',
            src: miniImageSrc,
            alt: 'Selected source preview',
            style: { filter: 'hue-rotate(' + hueShiftDeg.toFixed(1) + 'deg)' },
          })
        )
        : null,
      showMiniViewer && miniViewerOpen && miniImageSrc
        ? h(
          'div',
          {
            className: 'mini-viewer-modal',
            onClick: function () { setMiniViewerOpen(false); },
          },
          h(
            'div',
            {
              className: 'mini-viewer-modal-inner',
              onClick: function (e) { e.stopPropagation(); },
            },
            h('button', {
              type: 'button',
              className: 'mini-viewer-close',
              onClick: function () { setMiniViewerOpen(false); },
              title: 'Close',
            }, '\u00D7'),
            h('img', {
              className: 'mini-viewer-modal-image',
              src: miniImageSrc,
              alt: 'Expanded selected source',
              style: { filter: 'hue-rotate(' + hueShiftDeg.toFixed(1) + 'deg)' },
            })
          )
        )
        : null,
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

  function MiniOrbitGraph(props) {
    const points = props.points || [];
    const mode = props.mode || 'mini';
    const canvasRef = useRef(null);
    const wrapRef = useRef(null);
    const pointsRef = useRef(points);
    const rotationRef = useRef({
      angle: Math.random() * Math.PI * 2,
      rx: -0.65 + (Math.random() * 0.25),
    });

    useEffect(function () {
      pointsRef.current = points;
    }, [points]);

    useEffect(function () {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return undefined;

      function onResize() {
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const w = Math.max(1, Math.floor(wrap.clientWidth));
        const h = Math.max(1, Math.floor(wrap.clientHeight));
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      onResize();
      window.addEventListener('resize', onResize);

      if (mode === 'feature') {
        rotationRef.current.rx = -0.58;
      }

      let frameId = 0;
      const zoom = mode === 'feature' ? 1.85 : 0.92;
      const dotScale = mode === 'feature' ? 1.45 : 1.0;
      const speed = mode === 'feature' ? 0.005 : 0.006;

      function draw() {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const bg = ctx.createLinearGradient(0, 0, width, height);
        bg.addColorStop(0, 'rgba(14, 28, 42, 0.95)');
        bg.addColorStop(1, 'rgba(9, 18, 28, 0.95)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        const activePoints = pointsRef.current || [];
        const rx = rotationRef.current.rx;
        const angle = rotationRef.current.angle;

        let maxCount = 1;
        for (let i = 0; i < activePoints.length; i += 1) {
          if (activePoints[i].count > maxCount) maxCount = activePoints[i].count;
        }

        const rendered = activePoints.map(function (p) {
          const rotated = rotate3(p.x, p.y, p.z, rx, angle);
          const pr = project3(rotated, width, height, zoom);
          return {
            x: pr.x,
            y: pr.y,
            z: pr.z,
            depth: pr.depth,
            count: p.count,
            color: p.color || ('rgb(' + p.r + ' ' + p.g + ' ' + p.b + ')'),
          };
        });
        rendered.sort(function (a, b) { return b.z - a.z; });

        for (let i = 0; i < rendered.length; i += 1) {
          const p = rendered[i];
          const size = (0.85 + Math.pow(p.count / maxCount, 0.55) * 4.35) * dotScale;
          ctx.beginPath();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = p.color;
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        rotationRef.current.angle += speed;
        frameId = requestAnimationFrame(draw);
      }

      draw();
      return function () {
        cancelAnimationFrame(frameId);
        window.removeEventListener('resize', onResize);
      };
    }, [mode]);

    return h('div', { className: 'mini-orbit-wrap', ref: wrapRef }, h('canvas', { ref: canvasRef, className: 'mini-orbit-canvas' }));
  }

  function App() {
    const [imageName, setImageName] = useState('No image loaded');
    const [imageData, setImageData] = useState(null);
    const [graphData, setGraphData] = useState({ points: [], sampled: 0, uniqueBins: 0 });
    const [runtimeError, setRuntimeError] = useState('');
    const [paletteVariationSeed, setPaletteVariationSeed] = useState(1);
    const [selectedPresetIndex, setSelectedPresetIndex] = useState(-1);
    const [availablePresets, setAvailablePresets] = useState([FALLBACK_PRESET]);
    const [presetsResolved, setPresetsResolved] = useState(false);
    const [hueResetToken, setHueResetToken] = useState(0);
    const [hueShiftDeg, setHueShiftDeg] = useState(0);
    const [miniImageSrc, setMiniImageSrc] = useState(FALLBACK_PRESET.src);
    const [selectedArtistId, setSelectedArtistId] = useState(function () {
      const idx = Math.floor(Math.random() * ARTIST_OPTIONS.length);
      return ARTIST_OPTIONS[idx].id;
    });
    const [artistGraphsById, setArtistGraphsById] = useState({});
    const [artistLoading, setArtistLoading] = useState(false);
    const [artistLoadError, setArtistLoadError] = useState('');
    const [artistCycleIndex, setArtistCycleIndex] = useState(0);
    const [artistCycleOrderById, setArtistCycleOrderById] = useState({});
    const [miniVisibleCountByArtist, setMiniVisibleCountByArtist] = useState({});
    const [expandedMiniGraphIndex, setExpandedMiniGraphIndex] = useState(-1);
    const [artistBlurbs, setArtistBlurbs] = useState(DEFAULT_ARTIST_BLURBS);
    const presetTrackRef = useRef(null);
    const presetButtonRefs = useRef([]);
    const uploadedMiniSrcRef = useRef(null);

    const [settings, setSettings] = useState({
      maxSamples: 59000,
      sampleStep: 16,
      hueBins: 28,
      satBins: 23,
      valBins: 10,
      paletteSize: 8,
      pointScale: 0.85,
      saturationFloor: 0,
      brightnessFloor: 0,
      cameraDistance: 0.9,
      showGrid: false,
    });

    const prettyPointCount = useMemo(function () {
      return graphData.points.length.toLocaleString();
    }, [graphData.points.length]);

    const shiftedGraphPoints = useMemo(function () {
      return graphData.points.map(function (p) {
        const shiftedHue = normalizeHue(p.hue + hueShiftDeg);
        const shiftedRgb = hsvToRgb(shiftedHue, p.saturation, p.brightness);
        return Object.assign({}, p, {
          hue: shiftedHue,
          color: 'rgb(' + shiftedRgb.r + ' ' + shiftedRgb.g + ' ' + shiftedRgb.b + ')',
        });
      });
    }, [graphData.points, hueShiftDeg]);

    const paletteSwatches = useMemo(function () {
      return buildImagePalette(shiftedGraphPoints, settings.paletteSize, paletteVariationSeed);
    }, [shiftedGraphPoints, settings.paletteSize, paletteVariationSeed]);

    const graphSettings = useMemo(function () {
      return {
        maxSamples: settings.maxSamples,
        sampleStep: settings.sampleStep,
        hueBins: settings.hueBins,
        satBins: settings.satBins,
        valBins: settings.valBins,
        pointScale: settings.pointScale,
        saturationFloor: settings.saturationFloor,
        brightnessFloor: settings.brightnessFloor,
        cameraDistance: settings.cameraDistance,
        showGrid: settings.showGrid,
      };
    }, [
      settings.maxSamples,
      settings.sampleStep,
      settings.hueBins,
      settings.satBins,
      settings.valBins,
      settings.pointScale,
      settings.saturationFloor,
      settings.brightnessFloor,
      settings.cameraDistance,
      settings.showGrid,
    ]);

    function setSetting(key, value) {
      setSettings(function (s) {
        const next = Object.assign({}, s);
        next[key] = value;
        return next;
      });
    }

    function updateMiniImageSrc(src, keepBlobUrl) {
      if (uploadedMiniSrcRef.current && uploadedMiniSrcRef.current !== src) {
        URL.revokeObjectURL(uploadedMiniSrcRef.current);
        uploadedMiniSrcRef.current = null;
      }
      setMiniImageSrc(src || '');
      if (keepBlobUrl && /^blob:/i.test(src || '')) {
        uploadedMiniSrcRef.current = src;
      }
    }

    function loadPreset(preset, visibleIndex, suppressError) {
      if (!preset) return;
      setSelectedPresetIndex(visibleIndex);

      if (preset.isDemo) {
        try {
          const demo = buildRandomDemoPreset();
          setImageData(demo.imageData);
          setImageName(preset.name);
          updateMiniImageSrc(demo.previewSrc, false);
          setHueShiftDeg(0);
          setHueResetToken(function (n) { return n + 1; });
          setPaletteVariationSeed(1);
          setRuntimeError('');
        } catch (err) {
          if (!suppressError) {
            setRuntimeError('Could not build random preset demo image.');
          }
        }
        return;
      }

      if (isFileProtocolPage() && isLocalPresetSource(preset.src)) {
        if (!suppressError) {
          setRuntimeError(
            'Preset images cannot be sampled over file://. Start a local server and open http://localhost:5173 (example: python3 -m http.server 5173).'
          );
        }
        return;
      }

      function applyImage(img, cleanupUrl) {
        try {
          const data = imageToImageData(img);
          setImageData(data);
          setImageName(preset.name);
          updateMiniImageSrc(preset.src, false);
          setHueShiftDeg(0);
          setHueResetToken(function (n) { return n + 1; });
          setPaletteVariationSeed(1);
          setRuntimeError('');
        } catch (err) {
          if (!suppressError) {
            setRuntimeError(
              'Preset image cannot be sampled due browser CORS/security restrictions. Serve this app over http://localhost instead of file://.'
            );
          }
        } finally {
          if (cleanupUrl) URL.revokeObjectURL(cleanupUrl);
        }
      }

      function loadViaImage(url, cleanupUrl) {
        const img = new Image();
        if (/^https?:\/\//i.test(url)) img.crossOrigin = 'anonymous';
        img.onload = function () {
          applyImage(img, cleanupUrl);
        };
        img.onerror = function () {
          if (cleanupUrl) URL.revokeObjectURL(cleanupUrl);
          if (!suppressError) setRuntimeError('Could not load preset image: ' + preset.src);
        };
        img.src = url;
      }

      fetch(preset.src, { mode: 'cors' })
        .then(function (res) {
          if (!res.ok) throw new Error('fetch failed');
          return res.blob();
        })
        .then(function (blob) {
          if (!blob || !blob.size) throw new Error('empty blob');
          const objectUrl = URL.createObjectURL(blob);
          loadViaImage(objectUrl, objectUrl);
        })
        .catch(function () {
          loadViaImage(preset.src, null);
        });
    }

    function onUpload(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = function () {
        try {
          const data = imageToImageData(img);
          setImageData(data);
          setImageName(file.name);
          updateMiniImageSrc(url, true);
          setHueShiftDeg(0);
          setHueResetToken(function (n) { return n + 1; });
          setSelectedPresetIndex(-1);
          setPaletteVariationSeed(1);
          setRuntimeError('');
        } catch (err) {
          setRuntimeError(String(err && err.message ? err.message : err));
        }
      };

      img.onerror = function () {
        setRuntimeError('Could not load image file.');
        URL.revokeObjectURL(url);
      };

      img.src = url;
    }

    useEffect(function () {
      let cancelled = false;
      const artist = ARTIST_OPTIONS.find(function (a) { return a.id === selectedArtistId; });
      if (!artist) return undefined;

      setArtistCycleIndex(0);
      setExpandedMiniGraphIndex(-1);
      setMiniVisibleCountByArtist(function (prev) {
        if (typeof prev[selectedArtistId] === 'number') return prev;
        const next = Object.assign({}, prev);
        next[selectedArtistId] = 12;
        return next;
      });
      setArtistLoadError('');

      setArtistLoading(true);
      fetch(withDataVersion(artist.dataPath), { cache: 'no-store' })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (cancelled) return;
          const parsed = parseArtistGraphs(data);
          setArtistGraphsById(function (prev) {
            const next = Object.assign({}, prev);
            next[selectedArtistId] = parsed;
            return next;
          });
          setArtistLoading(false);
        })
        .catch(function () {
          if (cancelled) return;
          setArtistGraphsById(function (prev) {
            const next = Object.assign({}, prev);
            next[selectedArtistId] = [];
            return next;
          });
          setArtistLoadError('No color dataset found for this artist yet.');
          setArtistLoading(false);
        });

      return function () {
        cancelled = true;
      };
    }, [selectedArtistId]);

    useEffect(function () {
      let cancelled = false;
      fetch(withDataVersion('./data/artist-blurbs.json'), { cache: 'no-store' })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (cancelled || !data || typeof data !== 'object') return;
          setArtistBlurbs(Object.assign({}, DEFAULT_ARTIST_BLURBS, data));
        })
        .catch(function () {
          if (!cancelled) setArtistBlurbs(DEFAULT_ARTIST_BLURBS);
        });
      return function () {
        cancelled = true;
      };
    }, []);

    useEffect(function () {
      return function () {
        if (uploadedMiniSrcRef.current) {
          URL.revokeObjectURL(uploadedMiniSrcRef.current);
          uploadedMiniSrcRef.current = null;
        }
      };
    }, []);

    const activeArtistGraphs = artistGraphsById[selectedArtistId] || [];
    const activeCycleOrder = artistCycleOrderById[selectedArtistId] || [];
    const activeCycleGraphs = (activeCycleOrder.length === activeArtistGraphs.length
      ? activeCycleOrder
      : activeArtistGraphs.map(function (_g, idx) { return idx; }))
      .map(function (idx) { return activeArtistGraphs[idx]; })
      .filter(Boolean);
    const currentCycleGraph = activeCycleGraphs[artistCycleIndex] || null;
    const visibleMiniCount = miniVisibleCountByArtist[selectedArtistId] || 12;
    const sortedMiniGraphs = activeArtistGraphs.slice()
      .sort(function (a, b) {
        const ay = yearStartValue(a.year);
        const by = yearStartValue(b.year);
        if (ay !== by) return ay - by;
        return String(a.title || '').localeCompare(String(b.title || ''));
      });
    const visibleMiniGraphs = sortedMiniGraphs.slice(0, visibleMiniCount);

    useEffect(function () {
      if (!activeArtistGraphs.length) return;
      setArtistCycleOrderById(function (prev) {
        const existing = prev[selectedArtistId];
        if (Array.isArray(existing) && existing.length === activeArtistGraphs.length) return prev;
        const next = Object.assign({}, prev);
        next[selectedArtistId] = buildShuffledIndices(activeArtistGraphs.length);
        return next;
      });
    }, [selectedArtistId, activeArtistGraphs.length]);

    useEffect(function () {
      if (activeCycleGraphs.length < 2) return undefined;
      const id = window.setInterval(function () {
        setArtistCycleIndex(function (idx) {
          return (idx + 1) % activeCycleGraphs.length;
        });
      }, 1250);
      return function () {
        window.clearInterval(id);
      };
    }, [activeCycleGraphs.length]);

    useEffect(function () {
      if (artistCycleIndex >= activeCycleGraphs.length) {
        setArtistCycleIndex(0);
      }
    }, [artistCycleIndex, activeCycleGraphs.length]);

    useEffect(function () {
      if (expandedMiniGraphIndex < 0) return undefined;
      function onKeyDown(e) {
        if (!visibleMiniGraphs.length) return;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setExpandedMiniGraphIndex(function (idx) {
            if (idx < 0) return idx;
            return (idx - 1 + visibleMiniGraphs.length) % visibleMiniGraphs.length;
          });
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setExpandedMiniGraphIndex(function (idx) {
            if (idx < 0) return idx;
            return (idx + 1) % visibleMiniGraphs.length;
          });
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setExpandedMiniGraphIndex(-1);
        }
      }
      window.addEventListener('keydown', onKeyDown);
      return function () {
        window.removeEventListener('keydown', onKeyDown);
      };
    }, [expandedMiniGraphIndex, visibleMiniGraphs.length]);

    useEffect(function () {
      if (expandedMiniGraphIndex >= visibleMiniGraphs.length) {
        setExpandedMiniGraphIndex(-1);
      }
    }, [expandedMiniGraphIndex, visibleMiniGraphs.length]);

    useEffect(function () {
      let cancelled = false;
      Promise.all(PRESET_SLOTS.map(function (slot) {
        return resolvePresetSource(slot).then(function (src) {
          if (!src) return null;
          return { name: 'Preset ' + slot, src: src };
        });
      })).then(function (resolved) {
        if (cancelled) return;
        const valid = resolved.filter(Boolean);
        setAvailablePresets([FALLBACK_PRESET].concat(valid));
        setPresetsResolved(true);
      });
      return function () {
        cancelled = true;
      };
    }, []);

    useEffect(function () {
      if (!presetsResolved) return;
      if (!availablePresets.length) return;
      if (imageData) return;
      const localPresetIndices = [];
      for (let i = 0; i < availablePresets.length; i += 1) {
        if (isLocalPresetSource(availablePresets[i].src)) localPresetIndices.push(i);
      }
      const randomPool = localPresetIndices.length
        ? localPresetIndices
        : availablePresets.map(function (_preset, i) { return i; });
      const randomIndex = randomPool[Math.floor(Math.random() * randomPool.length)];
      setSelectedPresetIndex(randomIndex);
      loadPreset(availablePresets[randomIndex], randomIndex, true);
    }, [availablePresets, imageData, presetsResolved]);

    useEffect(function () {
      if (selectedPresetIndex < 0) return;
      const track = presetTrackRef.current;
      const selectedButton = presetButtonRefs.current[selectedPresetIndex];
      if (!track || !selectedButton) return;

      const left = selectedButton.offsetLeft - ((track.clientWidth - selectedButton.clientWidth) / 2);
      const maxLeft = Math.max(0, track.scrollWidth - track.clientWidth);
      const target = Math.max(0, Math.min(maxLeft, left));
      track.scrollTo({ left: target, behavior: 'smooth' });
    }, [selectedPresetIndex, availablePresets.length]);

    function resetGraph() {
      setGraphData({ points: [], sampled: 0, uniqueBins: 0 });
    }

    useEffect(function () {
      if (!imageData) return;
      try {
        const result = extractColorBins(imageData, graphSettings);
        setGraphData(result);
      } catch (err) {
        setRuntimeError(String(err && err.message ? err.message : err));
      }
    }, [imageData, graphSettings]);

    const selectedArtist = ARTIST_OPTIONS.find(function (a) { return a.id === selectedArtistId; }) || ARTIST_OPTIONS[0];
    const sortedArtistOptions = ARTIST_OPTIONS.slice().sort(function (a, b) {
      return a.label.localeCompare(b.label);
    });
    const selectedArtistBlurb = artistBlurbs[selectedArtistId] || DEFAULT_ARTIST_BLURBS[selectedArtistId] || {
      title: selectedArtist.label + "'s Palettes:",
      body: 'No artist blurb added yet.',
    };

    return h(
      'div',
      { className: 'app' },
      h(
        'aside',
        { className: 'panel' },
        h('h1', null, '3D Color Palette Visualizer'),
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
          h('button', { onClick: function () { if (imageData) setGraphData(extractColorBins(imageData, graphSettings)); } }, 'Rebuild'),
          h('button', { className: 'secondary', onClick: resetGraph }, 'Clear')
        ),

        runtimeError ? h('div', { className: 'meta' }, h('div', { style: { color: '#ff8f8f', marginTop: '8px' } }, 'Runtime error: ' + runtimeError)) : null
      ),

      h('div', { className: 'content-stack' },
        h('section', { className: 'viewer' },
          h('div', { className: 'viewer-layout' },
            h(CanvasGraph, {
              points: graphData.points,
              pointScale: settings.pointScale,
              cameraDistance: settings.cameraDistance,
            showGrid: settings.showGrid,
            hueResetToken: hueResetToken,
            hueShiftDeg: hueShiftDeg,
            onHueShiftChange: setHueShiftDeg,
            miniImageSrc: miniImageSrc,
            stopAutoRotateOnWheel: false,
          }),
            h('aside', { className: 'palette-column' },
              h('div', { className: 'palette-title' }, 'Palette'),
              h(
                'div',
                {
                  className: 'palette-swatches',
                  style: { '--palette-count': String(Math.max(1, settings.paletteSize)) },
                },
                (paletteSwatches.length ? paletteSwatches : Array.from({ length: settings.paletteSize })).map(function (swatch, i) {
                  const empty = !swatch;
                  return h(
                    'div',
                    { key: swatch ? swatch.id : 'placeholder-' + i, className: 'palette-item' },
                    h('div', {
                      className: 'palette-swatch',
                      style: {
                        background: empty ? 'linear-gradient(150deg, #172433, #12202c)' : swatch.color,
                      },
                    }),
                    h('div', { className: 'palette-label' }, empty ? '--' : swatch.hex)
                  );
                })
              ),
              h('div', { className: 'palette-controls' },
                h('div', { className: 'palette-size-row' },
                  h('span', { className: 'palette-size-label' }, 'Palette Size'),
                  h('div', { className: 'palette-size-buttons' },
                    h('button', {
                      type: 'button',
                      className: 'palette-btn',
                      onClick: function () {
                        setSetting('paletteSize', Math.max(2, settings.paletteSize - 1));
                      },
                    }, '-'),
                    h('span', { className: 'palette-size-value' }, String(settings.paletteSize)),
                    h('button', {
                      type: 'button',
                      className: 'palette-btn',
                      onClick: function () {
                        setSetting('paletteSize', Math.min(16, settings.paletteSize + 1));
                      },
                    }, '+')
                  )
                ),
                h('button', {
                  type: 'button',
                  className: 'palette-regenerate-btn',
                  onClick: function () {
                    setPaletteVariationSeed(function (v) { return v + 1; });
                  },
                }, 'Regenerate Palette')
              )
            )
          ),
          h('div', { className: 'preset-strip' },
            h('div', { className: 'preset-strip-head' }, 'Preset Examples'),
            h('div', { className: 'preset-track', ref: presetTrackRef },
              availablePresets.map(function (preset, i) {
                return h(
                  'button',
                  {
                    key: preset.src,
                    ref: function (el) { presetButtonRefs.current[i] = el; },
                    type: 'button',
                    className: 'preset-thumb-btn' + (selectedPresetIndex === i ? ' active' : ''),
                    onClick: function () { loadPreset(preset, i, false); },
                    title: preset.name,
                  },
                  h('img', {
                    className: 'preset-thumb-img',
                    src: preset.src,
                    alt: preset.name,
                    loading: 'lazy',
                  }),
                  h('span', { className: 'preset-thumb-label' }, preset.name)
                );
              })
            )
          )
        ),
        h('section', { className: 'artist-feature-section' },
          h('div', { className: 'artist-feature-copy' },
            h('h2', { className: 'artist-feature-title' }, selectedArtistBlurb.title),
            h(
              'label',
              { className: 'artist-select-wrap' },
              h('span', { className: 'artist-select-label' }, 'Artist'),
              h(
                'select',
                {
                  className: 'artist-select',
                  value: selectedArtistId,
                  onChange: function (e) { setSelectedArtistId(e.target.value); },
                },
                sortedArtistOptions.map(function (artist) {
                  return h('option', { key: artist.id, value: artist.id }, artist.label);
                })
              )
            ),
            h('p', { className: 'artist-feature-blurb' }, selectedArtistBlurb.body),
            !artistLoading && !activeArtistGraphs.length
              ? h('p', { className: 'artist-data-note' }, artistLoadError || 'No color data added for this artist yet.')
              : null
          ),
          h('div', { className: 'artist-feature-graph' },
            h(
              'div',
              { className: 'artist-feature-frame' },
              currentCycleGraph
                ? h(MiniOrbitGraph, { points: currentCycleGraph.points, mode: 'feature' })
                : h('div', { className: 'artist-empty-state' }, artistLoading ? 'Loading data...' : 'No data')
            ),
            currentCycleGraph
              ? h('div', { className: 'artist-feature-meta' },
                h('div', { className: 'artist-feature-meta-title' }, currentCycleGraph.title || 'Untitled'),
                h('div', { className: 'artist-feature-meta-year' }, currentCycleGraph.year || 'Year unknown')
              )
              : null
          )
        ),
        visibleMiniGraphs.length
          ? h('section', { className: 'artist-mini-grid-section' },
            h('div', { className: 'artist-mini-grid-scroll' },
              h('div', { className: 'artist-mini-grid' },
                visibleMiniGraphs.map(function (graph, idx) {
                  const workLabel = graph.year ? (graph.title + ' (' + graph.year + ')') : graph.title;
                  return h(
                    'article',
                    {
                      key: graph.id || (selectedArtistId + '-' + idx),
                      className: 'artist-mini-grid-item',
                      role: 'button',
                      tabIndex: 0,
                      onClick: function () { setExpandedMiniGraphIndex(idx); },
                      onKeyDown: function (e) {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedMiniGraphIndex(idx);
                        }
                      },
                      title: workLabel || ('Open ' + selectedArtist.label + ' graph ' + String(idx + 1)),
                      'aria-label': workLabel || ('Open ' + selectedArtist.label + ' graph ' + String(idx + 1)),
                    },
                    h(MiniOrbitGraph, { points: graph.points, mode: 'mini' }),
                    h('div', { className: 'artist-mini-caption' },
                      h('div', { className: 'artist-mini-title' }, graph.title || 'Untitled'),
                      h('div', { className: 'artist-mini-year' }, graph.year || 'Year unknown')
                    )
                  );
                })
              )
            ),
            (visibleMiniCount < sortedMiniGraphs.length)
              ? h(
                'button',
                {
                  type: 'button',
                  className: 'artist-load-more-btn',
                  onClick: function () {
                    setMiniVisibleCountByArtist(function (prev) {
                      const next = Object.assign({}, prev);
                      const currentCount = next[selectedArtistId] || 12;
                      next[selectedArtistId] = Math.min(sortedMiniGraphs.length, currentCount + 12);
                      return next;
                    });
                  },
                },
                'Load more palettes'
              )
              : null
          )
          : null,
        expandedMiniGraphIndex >= 0 && visibleMiniGraphs[expandedMiniGraphIndex]
          ? h(
            'div',
            {
              className: 'mini-graph-modal',
              onClick: function () { setExpandedMiniGraphIndex(-1); },
            },
            h(
              'div',
              {
                className: 'mini-graph-modal-inner',
                onClick: function (e) { e.stopPropagation(); },
              },
              h(
                'div',
                { className: 'mini-graph-modal-head' },
                h('div', { className: 'mini-graph-modal-title' },
                  visibleMiniGraphs[expandedMiniGraphIndex].year
                    ? (visibleMiniGraphs[expandedMiniGraphIndex].title + ' (' + visibleMiniGraphs[expandedMiniGraphIndex].year + ')')
                    : (visibleMiniGraphs[expandedMiniGraphIndex].title || (selectedArtist.label + ' Graph ' + String(expandedMiniGraphIndex + 1)))
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mini-graph-modal-close',
                    onClick: function () { setExpandedMiniGraphIndex(-1); },
                  },
                  'Close'
                )
              ),
              h(
                'div',
                { className: 'mini-graph-modal-canvas' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mini-graph-nav mini-graph-nav-left',
                    onClick: function () {
                      setExpandedMiniGraphIndex(function (idx) {
                        return (idx - 1 + visibleMiniGraphs.length) % visibleMiniGraphs.length;
                      });
                    },
                    title: 'Previous graph',
                    'aria-label': 'Previous graph',
                  },
                  '\u2039'
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mini-graph-nav mini-graph-nav-right',
                    onClick: function () {
                      setExpandedMiniGraphIndex(function (idx) {
                        return (idx + 1) % visibleMiniGraphs.length;
                      });
                    },
                    title: 'Next graph',
                    'aria-label': 'Next graph',
                  },
                  '\u203A'
                ),
                h(CanvasGraph, {
                  points: visibleMiniGraphs[expandedMiniGraphIndex].points,
                  pointScale: settings.pointScale,
                  cameraDistance: settings.cameraDistance,
                  showGrid: false,
                  showBackLink: false,
                  showMiniViewer: false,
                  stopAutoRotateOnWheel: false,
                })
              ),
              h(
                'div',
                { className: 'mini-graph-modal-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mini-graph-find-btn',
                    onClick: function () {
                      const work = visibleMiniGraphs[expandedMiniGraphIndex] || {};
                      const queryParts = [
                        work.title || '',
                        work.year || '',
                        selectedArtist.searchName || selectedArtist.label || '',
                      ].filter(Boolean);
                      const query = encodeURIComponent(queryParts.join(' '));
                      window.open('https://www.google.com/search?tbm=isch&q=' + query, '_blank', 'noopener,noreferrer');
                    },
                  },
                  'Find this painting'
                )
              )
            )
          )
          : null
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
