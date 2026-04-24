import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";

const viewerEl = document.getElementById("viewer");
const lumTuneBtn = document.getElementById("lum-tune-btn");
const exportCsvBtn = document.getElementById("export-csv");
const importCsvBtn = document.getElementById("import-csv-btn");
const importCsvInput = document.getElementById("import-csv-input");
const importModeEl = document.getElementById("import-mode");

const gridToggleXY = document.getElementById("grid-xy");
const gridToggleXZ = document.getElementById("grid-xz");
const gridToggleYZ = document.getElementById("grid-yz");
const measureModeBtn = document.getElementById("measure-mode-btn");
const measureHint = document.getElementById("measure-hint");

const starForm = document.getElementById("star-form");
const starListEl = document.getElementById("star-list");

const editForm = document.getElementById("edit-form");
const selectedTitle = document.getElementById("selected-title");
const selectionHint = document.getElementById("selection-hint");
const deleteBtn = document.getElementById("delete-star");

const editInputs = {
  name: document.getElementById("edit-name"),
  x: document.getElementById("edit-x"),
  y: document.getElementById("edit-y"),
  z: document.getElementById("edit-z"),
  spectralType: document.getElementById("edit-spectral"),
  temperature: document.getElementById("edit-temperature"),
  luminosity: document.getElementById("edit-luminosity")
};

const labelLayer = document.createElement("div");
labelLayer.className = "label-layer";
viewerEl.appendChild(labelLayer);

let stars = [];
let selectedStarId = null;
let starIdCounter = 1;
let luminosityTuningEnabled = false;
let cameraDistance = 80;
let measureModeEnabled = false;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewerEl.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#040916");

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1000);
camera.position.set(0, 0, cameraDistance);

const starGroup = new THREE.Group();
scene.add(starGroup);

const ambient = new THREE.AmbientLight(0xffffff, 0.88);
scene.add(ambient);

const point = new THREE.PointLight(0x9ec7ff, 0.9, 400);
point.position.set(35, 50, 25);
scene.add(point);

const grids = buildGrids();
starGroup.add(grids.xy, grids.xz, grids.yz);

const axisLines = new THREE.AxesHelper(72);
axisLines.material.opacity = 0.42;
axisLines.material.transparent = true;
starGroup.add(axisLines);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tempVec = new THREE.Vector3();
const tempWorldVec = new THREE.Vector3();
const tempLocalVec = new THREE.Vector3();
const tempLocalVec2 = new THREE.Vector3();
const tempCamForward = new THREE.Vector3();
const tempCamRight = new THREE.Vector3();
const tempCamUp = new THREE.Vector3();
const tempWorldOffset = new THREE.Vector3();
const tempLocalOffset = new THREE.Vector3();
const tempInvGroupQuat = new THREE.Quaternion();
const tempDeclutterScreenOffset = new THREE.Vector2();
const SYSTEM_COMPONENT_RE = /^(.+\S)\s+([A-Z](?:[a-z])?)$/;
const STAR_DECLUTTER_DISTANCE_LY = 0.1;
const STAR_DECLUTTER_MAX_GROUP_PX = 26;

const interaction = {
  isDragging: false,
  moved: false,
  startX: 0,
  startY: 0,
  pointerId: null,
  arcballVec: new THREE.Vector3()
};

const axisNameLabels = [];
const axisTickLabelPool = [];
const axisTickLabelEntries = [];
const systemLabelPool = [];
let axisTickSegments = null;
let lastAxisStep = null;
let lastAxisExtent = null;
let lastAxisMask = null;
buildAxisNameLabels();

let distanceMeasureIds = [];
let distanceMeasureLine = null;
const distanceMeasureLabel = createOverlayLabel("", "dist-label");
distanceMeasureLabel.style.display = "none";

const glowTexture = createGlowTexture();

const TEFF_COLOR_DB = [
  { temp: 300, hex: "#552017" },
  { temp: 500, hex: "#6c2d1e" },
  { temp: 800, hex: "#7f3c28" },
  { temp: 1200, hex: "#94553a" },
  { temp: 1800, hex: "#af6e49" },
  { temp: 2400, hex: "#c58a5c" },
  { temp: 3000, hex: "#ffb46b" },
  { temp: 3500, hex: "#ffc68f" },
  { temp: 4000, hex: "#ffd1a3" },
  { temp: 4500, hex: "#ffdbc0" },
  { temp: 5000, hex: "#ffe4ce" },
  { temp: 5500, hex: "#ffebda" },
  { temp: 5770, hex: "#fff1e0" },
  { temp: 6000, hex: "#fff3e7" },
  { temp: 6500, hex: "#fff9fd" },
  { temp: 7000, hex: "#f3f2ff" },
  { temp: 8000, hex: "#e3e8ff" },
  { temp: 9000, hex: "#d5ddff" },
  { temp: 10000, hex: "#ccdbff" },
  { temp: 11000, hex: "#c7d7ff" },
  { temp: 12500, hex: "#bfd0ff" },
  { temp: 15000, hex: "#b6c8ff" },
  { temp: 20000, hex: "#afc2ff" },
  { temp: 25000, hex: "#a8beff" },
  { temp: 30000, hex: "#a5baff" },
  { temp: 35000, hex: "#a3b8ff" },
  { temp: 40000, hex: "#a1b7ff" },
  { temp: 60000, hex: "#9ab3ff" },
  { temp: 80000, hex: "#95afff" },
  { temp: 100000, hex: "#91acff" },
  { temp: 120000, hex: "#8ea9ff" }
];

const SPECTRAL_TEFF_DB = {
  O5: 40000,
  O6: 38000,
  O8: 35000,
  O9: 31900,
  B0: 30000,
  B1: 24200,
  B2: 22100,
  B3: 18800,
  B5: 16400,
  B8: 13400,
  B9: 12400,
  A0: 10800,
  A3: 9730,
  A5: 8620,
  A7: 8190,
  F0: 7300,
  F5: 6500,
  G0: 5940,
  G2: 5770,
  G5: 5660,
  K0: 5250,
  K5: 4400,
  M0: 3850,
  M2: 3500,
  M5: 3200
};

const SPECTRAL_CLASS_TEFF = {
  O: 32000,
  B: 17000,
  A: 9200,
  F: 7000,
  G: 5700,
  K: 4500,
  M: 3400,
  L: 1800,
  T: 900,
  Y: 500
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function parseMaybeNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCoordOr(value, fallback = 0) {
  const parsed = parseMaybeNumber(value);
  return parsed === null ? fallback : parsed;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function interpolateRgb(a, b, t) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  };
}

const StellarModel = {
  spectralSubtypeValue(compact) {
    const m = compact.match(/^[A-Z]+([0-9](?:\.[0-9])?)/);
    if (!m) return null;
    return clamp(Number(m[1]), 0, 9.9);
  },

  colorFromTemperature(tempK) {
    if (!Number.isFinite(tempK)) return "#ffffff";
    const t = clamp(tempK, 300, 120000);
    const t100 = t / 100;
    let r;
    let g;
    let b;

    if (t100 <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(t100) - 161.1195681661;
      if (t100 <= 19) b = 0;
      else b = 138.5177312231 * Math.log(t100 - 10) - 305.0447927307;
    } else {
      r = 329.698727446 * Math.pow(t100 - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(t100 - 60, -0.0755148492);
      b = 255;
    }

    return rgbToHex({
      r: clamp(r, 0, 255),
      g: clamp(g, 0, 255),
      b: clamp(b, 0, 255)
    });
  },

  temperatureFromSpectral(spectralType) {
    if (!spectralType) return null;
    const clean = spectralType.trim().toUpperCase();
    const compact = clean.replace(/\s+/g, "");
    const subtype = this.spectralSubtypeValue(compact);

    if (compact.startsWith("WO")) return 150000 - (subtype ?? 4) * 4000;
    if (compact.startsWith("WC")) return 100000 - (subtype ?? 5) * 5000;
    if (compact.startsWith("WR") || compact.startsWith("WN")) return 85000 - (subtype ?? 5) * 3500;
    if (compact.startsWith("DA")) return 100000 - (subtype ?? 5) * 9500;
    if (compact.startsWith("DB")) return 45000 - (subtype ?? 5) * 3300;
    if (compact.includes("NS") || compact.includes("NEUTRON")) return 700000;

    const lty = compact.match(/^([LTY])([0-9](?:\.[0-9])?)/);
    if (lty) {
      const base = { L: 2300, T: 1500, Y: 700 }[lty[1]];
      const slope = { L: 120, T: 110, Y: 55 }[lty[1]];
      return base - Number(lty[2]) * slope;
    }

    const exact = clean.match(/^([OBAFGKM])([0-9])/);
    if (exact) {
      const key = `${exact[1]}${exact[2]}`;
      if (SPECTRAL_TEFF_DB[key]) return SPECTRAL_TEFF_DB[key];
    }
    const classOnly = clean.match(/^([OBAFGKMLTY])/);
    if (!classOnly) return null;
    return SPECTRAL_CLASS_TEFF[classOnly[1]] ?? null;
  },

  defaultLuminosityFromSpectral(spectralType) {
    const s = (spectralType || "").toUpperCase().replace(/\s+/g, "");
    const subtype = this.spectralSubtypeValue(s);
    if (!s) return null;

    if (s.startsWith("WO")) return Math.pow(10, 5.4 - (subtype ?? 4) * 0.07);
    if (s.startsWith("WC")) return Math.pow(10, 5.0 - (subtype ?? 5) * 0.07);
    if (s.startsWith("WR") || s.startsWith("WN")) return Math.pow(10, 4.9 - (subtype ?? 5) * 0.06);
    if (s.startsWith("DA")) return Math.pow(10, 0.78 - (subtype ?? 5) * 0.66);
    if (s.startsWith("DB")) return Math.pow(10, 0.35 - (subtype ?? 5) * 0.5);
    if (s.includes("NS") || s.includes("NEUTRON")) return Math.pow(10, -5.5);
    if (s.startsWith("Y")) return Math.pow(10, -7.2 + (9 - (subtype ?? 5)) * 0.05);
    if (s.startsWith("T")) return Math.pow(10, -6.1 + (9 - (subtype ?? 5)) * 0.06);
    if (s.startsWith("L")) return Math.pow(10, -4.8 + (9 - (subtype ?? 5)) * 0.07);
    return null;
  },

  effectiveLuminosity(starData) {
    if (Number.isFinite(starData.luminosity)) return Math.max(starData.luminosity, 0);
    return this.defaultLuminosityFromSpectral(starData.spectralType) ?? 0;
  },

  effectiveTemperature(starData) {
    return Number.isFinite(starData.temperature) ? starData.temperature : this.temperatureFromSpectral(starData.spectralType);
  },

  applyTemperatureSeparation(color, teff, spectralType = "") {
    if (!Number.isFinite(teff)) return color;
    const compact = spectralType.toUpperCase().replace(/\s+/g, "");

    const cool = clamp((6200 - teff) / 3200, 0, 1);
    const hot = clamp((teff - 6500) / 17000, 0, 1);
    const separated = color.clone();

    separated.r = clamp(separated.r * (1 + cool * 0.42) * (1 - hot * 0.18), 0, 1);
    separated.g = clamp(separated.g * (1 - cool * 0.22) * (1 - hot * 0.08), 0, 1);
    separated.b = clamp(separated.b * (1 - cool * 0.5) * (1 + hot * 0.4), 0, 1);

    if (compact.startsWith("T")) {
      separated.r = clamp(separated.r * 1.16, 0, 1);
      separated.g = clamp(separated.g * 0.43, 0, 1);
      separated.b = clamp(separated.b * 1.12, 0, 1);
      separated.lerp(new THREE.Color("#8a4e88"), 0.62);
    } else if (compact.startsWith("Y")) {
      separated.r = clamp(separated.r * 0.8, 0, 1);
      separated.g = clamp(separated.g * 0.32, 0, 1);
      separated.b = clamp(separated.b * 0.45, 0, 1);
      separated.lerp(new THREE.Color("#3d2d35"), 0.5);
    } else if (compact.startsWith("L")) {
      separated.r = clamp(separated.r * 1.08, 0, 1);
      separated.g = clamp(separated.g * 0.73, 0, 1);
      separated.b = clamp(separated.b * 0.48, 0, 1);
    } else if (compact.startsWith("DA")) {
      separated.r = clamp(separated.r * 0.92, 0, 1);
      separated.g = clamp(separated.g * 0.97, 0, 1);
      separated.b = clamp(separated.b * 1.14, 0, 1);
    } else if (compact.startsWith("DB")) {
      separated.r = clamp(separated.r * 1.05, 0, 1);
      separated.g = clamp(separated.g * 0.98, 0, 1);
      separated.b = clamp(separated.b * 1.08, 0, 1);
    } else if (compact.startsWith("WO") || compact.startsWith("WC") || compact.startsWith("WR") || compact.startsWith("WN")) {
      separated.r = clamp(separated.r * 0.86, 0, 1);
      separated.g = clamp(separated.g * 0.92, 0, 1);
      separated.b = clamp(separated.b * 1.22, 0, 1);
    } else if (compact.includes("NS") || compact.includes("NEUTRON")) {
      separated.r = clamp(separated.r * 0.84, 0, 1);
      separated.g = clamp(separated.g * 0.9, 0, 1);
      separated.b = clamp(separated.b * 1.25, 0, 1);
    }

    return separated;
  },

  luminosityClassScale(spectralType) {
    const s = (spectralType || "").toUpperCase();
    if (!s) return 1;
    if (/VI\b/.test(s)) return 0.6;
    if (/V\b/.test(s)) return 0.7;
    if (/IV\b/.test(s)) return 0.9;
    if (/III\b/.test(s)) return 1.2;
    if (/II\b/.test(s)) return 1.5;
    if (/IA\+?\b/.test(s)) return 2.1;
    if (/IAB\b/.test(s)) return 1.9;
    if (/IA\b/.test(s)) return 2;
    if (/IB\b/.test(s)) return 1.7;
    if (/I\b/.test(s)) return 1.8;
    return 1;
  },

  spectralTypeScale(spectralType, teff) {
    const s = (spectralType || "").toUpperCase().trim();
    const compact = s.replace(/\s+/g, "");
    const subtype = this.spectralSubtypeValue(compact);
    if (compact.startsWith("WO")) return clamp(2.5 - (subtype ?? 4) * 0.06, 1.8, 2.6);
    if (compact.startsWith("WC")) return clamp(2.3 - (subtype ?? 5) * 0.06, 1.65, 2.4);
    if (compact.startsWith("WR") || compact.startsWith("WN")) return clamp(2.15 - (subtype ?? 5) * 0.05, 1.5, 2.2);
    if (compact.startsWith("DA")) return clamp(0.38 - (subtype ?? 5) * 0.02, 0.16, 0.4);
    if (compact.startsWith("DB")) return clamp(0.34 - (subtype ?? 5) * 0.017, 0.17, 0.35);
    if (compact.includes("NS") || compact.includes("NEUTRON")) return 0.1;

    const classMatch = s.match(/^([OBAFGKMLTY])/);
    const subtypeMatch = s.match(/^([OBAFGKMLTY])([0-9](?:\.[0-9])?)/);
    const classScale = { O: 1.35, B: 1.24, A: 1.14, F: 1.04, G: 0.96, K: 0.82, M: 0.66, L: 0.42, T: 0.3, Y: 0.22 };

    let scale = classMatch ? classScale[classMatch[1]] ?? 1 : 1;
    if (subtypeMatch) {
      const numericSubtype = clamp(Number(subtypeMatch[2]), 0, 9);
      scale *= 1 - numericSubtype * 0.012;
    }
    if (Number.isFinite(teff)) {
      const coolBoost = clamp((6000 - teff) / 3500, 0, 1);
      scale *= 1 - coolBoost * 0.1;
    }
    return clamp(scale, 0.22, 1.5);
  }
};

function colorFromTemperature(tempK) {
  return StellarModel.colorFromTemperature(tempK);
}

function spectralSubtypeValue(compact) {
  return StellarModel.spectralSubtypeValue(compact);
}

function temperatureFromSpectral(spectralType) {
  return StellarModel.temperatureFromSpectral(spectralType);
}

function defaultLuminosityFromSpectral(spectralType) {
  return StellarModel.defaultLuminosityFromSpectral(spectralType);
}

function effectiveLuminosity(starData) {
  return StellarModel.effectiveLuminosity(starData);
}

function effectiveTemperature(starData) {
  return StellarModel.effectiveTemperature(starData);
}

function colorHexForStar(starData) {
  return colorFromTemperature(effectiveTemperature(starData));
}

function applyTemperatureSeparation(color, teff, spectralType = "") {
  return StellarModel.applyTemperatureSeparation(color, teff, spectralType);
}

function scaledColor(color, scale) {
  return new THREE.Color(
    clamp(color.r * scale, 0, 1),
    clamp(color.g * scale, 0, 1),
    clamp(color.b * scale, 0, 1)
  );
}

function computeStarRadius(luminosity) {
  const lum = Number.isFinite(luminosity) ? Math.max(luminosity, 0) : 0;
  const base = 0.22 + Math.min(Math.log10(lum + 1) * 0.1, 0.28);
  return base * 0.75;
}

function computeRenderStyle(starData) {
  const teff = effectiveTemperature(starData);
  const baseColor = applyTemperatureSeparation(new THREE.Color(colorHexForStar(starData)), teff, starData.spectralType);

  const lum = effectiveLuminosity(starData);
  const lumNorm = clamp(Math.log10(lum + 1) / 5, 0, 1);

  if (!luminosityTuningEnabled) {
    return {
      color: baseColor,
      emissiveIntensity: 0.56,
      glowOpacity: 0,
      glowSize: 1
    };
  }

  const coolDimming = Number.isFinite(teff) ? clamp(0.45 + (teff - 3000) / 13500, 0.38, 1) : 1;
  const brightnessScale = (0.5 + lumNorm * 1.12) * coolDimming;

  return {
    color: scaledColor(baseColor, brightnessScale),
    emissiveIntensity: (0.44 + lumNorm * 1.6) * coolDimming,
    glowOpacity: (0.13 + lumNorm * 0.72) * coolDimming,
    glowSize: 4.5 + lumNorm * 8.8
  };
}

function createBackgroundStars() {
  const count = 4200;
  const radius = 380;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius + Math.random() * 40;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xaec6ff,
    size: 1.2,
    transparent: true,
    opacity: 0.5,
    sizeAttenuation: true,
    depthWrite: false
  });

  return new THREE.Points(geometry, material);
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, "rgba(255,255,255,0.98)");
  gradient.addColorStop(0.06, "rgba(255,255,255,0.94)");
  gradient.addColorStop(0.15, "rgba(255,255,255,0.8)");
  gradient.addColorStop(0.29, "rgba(255,255,255,0.56)");
  gradient.addColorStop(0.47, "rgba(255,255,255,0.32)");
  gradient.addColorStop(0.66, "rgba(255,255,255,0.16)");
  gradient.addColorStop(0.84, "rgba(255,255,255,0.06)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function buildGrids() {
  const size = 140;
  const div = 14;

  const xy = new THREE.GridHelper(size, div, 0x5f95dc, 0x30518a);
  xy.rotation.x = Math.PI / 2;
  xy.material.opacity = 0.35;
  xy.material.transparent = true;

  const xz = new THREE.GridHelper(size, div, 0x5a87c5, 0x304b77);
  xz.material.opacity = 0.31;
  xz.material.transparent = true;

  const yz = new THREE.GridHelper(size, div, 0x7077c7, 0x40468b);
  yz.rotation.z = Math.PI / 2;
  yz.material.opacity = 0.27;
  yz.material.transparent = true;

  return { xy, xz, yz };
}

function createOverlayLabel(text, className) {
  const el = document.createElement("div");
  el.className = `star-label ${className}`;
  el.textContent = text;
  labelLayer.appendChild(el);
  return el;
}

function buildAxisNameLabels() {
  axisNameLabels.push({ axis: "x", el: createOverlayLabel("X", "axis-label") });
  axisNameLabels.push({ axis: "y", el: createOverlayLabel("Y", "axis-label") });
  axisNameLabels.push({ axis: "z", el: createOverlayLabel("Z", "axis-label") });
}

function ensureTickLabelPool(size) {
  while (axisTickLabelPool.length < size) {
    axisTickLabelPool.push(createOverlayLabel("", "dist-label"));
  }
}

function hideUnusedTickLabels(startIndex) {
  for (let i = startIndex; i < axisTickLabelPool.length; i += 1) {
    axisTickLabelPool[i].style.display = "none";
  }
}

function niceStep(rawStep) {
  if (!(rawStep > 0)) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const fraction = rawStep / magnitude;
  if (fraction <= 1) return 1 * magnitude;
  if (fraction <= 2) return 2 * magnitude;
  if (fraction <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function formatLyValue(v, step) {
  if (step >= 1) return `${Math.round(v).toLocaleString()} ly`;
  const decimals = Math.min(8, Math.max(0, Math.ceil(-Math.log10(step))));
  return `${v.toFixed(decimals)} ly`;
}

function getLuminosityClassScale(spectralType) {
  return StellarModel.luminosityClassScale(spectralType);
}

function getSpectralTypeScale(spectralType, teff) {
  return StellarModel.spectralTypeScale(spectralType, teff);
}

function getWorldUnitsPerPixel() {
  const fovRad = (camera.fov * Math.PI) / 180;
  return (2 * cameraDistance * Math.tan(fovRad / 2)) / Math.max(1, viewerEl.clientHeight);
}

function getWorldUnitsPerPixelAtDistance(distance) {
  const fovRad = (camera.fov * Math.PI) / 180;
  return (2 * Math.max(0.01, distance) * Math.tan(fovRad / 2)) / Math.max(1, viewerEl.clientHeight);
}

function isAxisActive(axis) {
  if (axis === "x") return Boolean(gridToggleXY?.checked || gridToggleXZ?.checked);
  if (axis === "y") return Boolean(gridToggleXY?.checked || gridToggleYZ?.checked);
  if (axis === "z") return Boolean(gridToggleXZ?.checked || gridToggleYZ?.checked);
  return true;
}

function activeAxisMask() {
  return (isAxisActive("x") ? 1 : 0) | (isAxisActive("y") ? 2 : 0) | (isAxisActive("z") ? 4 : 0);
}

function recomputeSpatialDeclutterGroups() {
  const threshold2 = STAR_DECLUTTER_DISTANCE_LY * STAR_DECLUTTER_DISTANCE_LY;
  const visited = new Set();
  let clusterId = 1;

  stars.forEach((s) => {
    updateStarLabelIdentity(s);
    s.declutterGroupSize = 1;
    s.declutterGroupIndex = 0;
    s.declutterClusterId = 0;
  });

  for (let i = 0; i < stars.length; i += 1) {
    const seed = stars[i];
    if (visited.has(seed.id)) continue;

    const queue = [seed];
    const cluster = [];
    visited.add(seed.id);

    for (let q = 0; q < queue.length; q += 1) {
      const current = queue[q];
      cluster.push(current);

      for (let j = 0; j < stars.length; j += 1) {
        const other = stars[j];
        if (visited.has(other.id)) continue;

        const dx = current.x - other.x;
        const dy = current.y - other.y;
        const dz = current.z - other.z;
        if (dx * dx + dy * dy + dz * dz > threshold2) continue;

        visited.add(other.id);
        queue.push(other);
      }
    }

    cluster.sort((a, b) => a.id - b.id);
    const size = cluster.length;
    cluster.forEach((s, idx) => {
      s.declutterGroupSize = size;
      s.declutterGroupIndex = idx;
      s.declutterClusterId = clusterId;
    });
    clusterId += 1;
  }

  recomputeDeclutterLocalOffsets();
}

function parseSystemComponent(name) {
  const clean = (name || "").trim();
  const m = clean.match(SYSTEM_COMPONENT_RE);
  if (!m) return { root: null, component: null };
  return { root: m[1], component: m[2] };
}

function updateStarLabelIdentity(star) {
  const parsed = parseSystemComponent(star.name);
  star.systemRoot = parsed.root;
  star.systemComponent = parsed.component;
  star.primaryLabel = parsed.component || star.name;
}

function ensureSystemLabelPool(size) {
  while (systemLabelPool.length < size) {
    const el = createOverlayLabel("", "system-label");
    el.textContent = "";
    const title = document.createElement("div");
    title.className = "system-label-title";
    const bracket = document.createElement("div");
    bracket.className = "system-label-bracket";
    el.append(title, bracket);
    systemLabelPool.push(el);
  }
}

function hideUnusedSystemLabels(startIndex) {
  for (let i = startIndex; i < systemLabelPool.length; i += 1) {
    systemLabelPool[i].style.display = "none";
  }
}

function getDeclutterScreenOffset(star, outVec2) {
  if ((star.declutterGroupSize ?? 1) <= 1) {
    outVec2.set(0, 0);
    return outVec2;
  }

  const count = star.declutterGroupSize;
  const idx = star.declutterGroupIndex ?? 0;
  const baseAngle = (star.declutterClusterId ?? 0) * 1.61803398875;
  const angle = baseAngle + (idx / count) * Math.PI * 2;
  const radiusPx = Math.min(STAR_DECLUTTER_MAX_GROUP_PX, 6 + (count - 1) * 2.4);
  outVec2.set(Math.cos(angle) * radiusPx, Math.sin(angle) * radiusPx);
  return outVec2;
}

function recomputeDeclutterLocalOffsets() {
  // Camera-independent declutter so clustered stars separate without camera snapping.
  stars.forEach((star) => {
    star.declutterOffsetX = 0;
    star.declutterOffsetY = 0;
    star.declutterOffsetZ = 0;
    if ((star.declutterGroupSize ?? 1) <= 1) return;

    const count = star.declutterGroupSize;
    const idx = star.declutterGroupIndex ?? 0;
    const baseAngle = (star.declutterClusterId ?? 0) * 1.61803398875;
    const angle = baseAngle + (idx / count) * Math.PI * 2;

    // Keep direction camera-independent, but scale amount by zoom/distance so declutter stays visually clean.
    tempLocalVec.set(star.x, star.y, star.z);
    tempWorldVec.copy(tempLocalVec);
    starGroup.localToWorld(tempWorldVec);
    const distToCamera = camera.position.distanceTo(tempWorldVec);
    const wpp = getWorldUnitsPerPixelAtDistance(distToCamera);
    const targetPx = Math.min(STAR_DECLUTTER_MAX_GROUP_PX, 8 + (count - 1) * 3.2);
    const radiusLy = clamp(targetPx * wpp * 2.48, 0.02, STAR_DECLUTTER_DISTANCE_LY * 3.6);
    const zPhase = baseAngle * 0.73 + idx * 0.91;
    const zOffset = Math.sin(zPhase) * radiusLy * 0.35;

    star.declutterOffsetX = Math.cos(angle) * radiusLy;
    star.declutterOffsetY = Math.sin(angle) * radiusLy;
    star.declutterOffsetZ = zOffset;
  });
}

function rebuildAxisTickSegments(step, extent, axisMask) {
  if (axisTickSegments) {
    axisTickSegments.geometry.dispose();
    axisTickSegments.material.dispose();
    starGroup.remove(axisTickSegments);
  }

  const verts = [];
  const tickHalf = clamp(step * 0.08, 0.35, 3.2);
  const count = Math.floor(extent / step);

  for (let i = -count; i <= count; i += 1) {
    const v = i * step;
    if (Math.abs(v) < step * 0.001) continue;

    if (axisMask & 1) verts.push(v, -tickHalf, 0, v, tickHalf, 0);
    if (axisMask & 2) verts.push(-tickHalf, v, 0, tickHalf, v, 0);
    if (axisMask & 4) verts.push(0, -tickHalf, v, 0, tickHalf, v);
  }

  if (verts.length === 0) {
    axisTickSegments = null;
    return;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x9abef3, transparent: true, opacity: 0.62 });
  axisTickSegments = new THREE.LineSegments(geo, mat);
  starGroup.add(axisTickSegments);
}

function updateDynamicAxisScale() {
  const worldUnitsPerPixel = getWorldUnitsPerPixel();
  const targetSpacingPx = 78;
  const step = niceStep(worldUnitsPerPixel * targetSpacingPx);
  const extent = Math.max(step * 2, Math.ceil((worldUnitsPerPixel * viewerEl.clientHeight * 0.7) / step) * step);
  const axisMask = activeAxisMask();

  if (step !== lastAxisStep || extent !== lastAxisExtent || axisMask !== lastAxisMask) {
    rebuildAxisTickSegments(step, extent, axisMask);
    lastAxisStep = step;
    lastAxisExtent = extent;
    lastAxisMask = axisMask;
  }

  axisTickLabelEntries.length = 0;
  const count = Math.floor(extent / step);
  const xActive = (axisMask & 1) !== 0;
  const yActive = (axisMask & 2) !== 0;
  const zActive = (axisMask & 4) !== 0;

  for (let i = -count; i <= count; i += 1) {
    const v = i * step;
    if (Math.abs(v) < step * 0.001) continue;

    if (xActive) axisTickLabelEntries.push({ axis: "x", local: new THREE.Vector3(v, 0, 0), text: formatLyValue(v, step) });
    if (yActive) axisTickLabelEntries.push({ axis: "y", local: new THREE.Vector3(0, v, 0), text: formatLyValue(v, step) });
    if (zActive) axisTickLabelEntries.push({ axis: "z", local: new THREE.Vector3(0, 0, v), text: formatLyValue(v, step) });
  }
}

function createLabelElement(starData) {
  const el = document.createElement("div");
  el.className = "star-label";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = starData.primaryLabel || starData.name;

  const spectral = document.createElement("div");
  spectral.className = "spectral";
  spectral.textContent = starData.spectralType?.trim() || "";
  spectral.style.display = spectral.textContent ? "block" : "none";

  el.append(name, spectral);
  labelLayer.appendChild(el);

  return { el, name, spectral };
}

function updateLabelText(star) {
  updateStarLabelIdentity(star);
  star.labelNameEl.textContent = star.primaryLabel || star.name;
  const s = star.spectralType?.trim() || "";
  star.labelSpectralEl.textContent = s;
  star.labelSpectralEl.style.display = s ? "block" : "none";
}

function disposeStarVisual(star) {
  if (star.mesh) {
    star.mesh.geometry.dispose();
    star.mesh.material.dispose();
    starGroup.remove(star.mesh);
  }

  if (star.glow) {
    star.glow.material.dispose();
    starGroup.remove(star.glow);
  }

  if (star.labelEl?.parentElement) {
    star.labelEl.parentElement.removeChild(star.labelEl);
  }
}

function buildStarObject(starData) {
  updateStarLabelIdentity(starData);
  const renderStyle = computeRenderStyle(starData);
  const teff = effectiveTemperature(starData);
  const radius =
    computeStarRadius(effectiveLuminosity(starData)) *
    getLuminosityClassScale(starData.spectralType) *
    getSpectralTypeScale(starData.spectralType, teff);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 18, 18),
    new THREE.MeshStandardMaterial({
      color: renderStyle.color,
      emissive: renderStyle.color,
      emissiveIntensity: renderStyle.emissiveIntensity,
      roughness: 0.35,
      metalness: 0.05,
      transparent: true,
      opacity: 1
    })
  );

  mesh.position.set(starData.x, starData.y, starData.z);
  mesh.userData.starId = starData.id;

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: renderStyle.color,
      transparent: true,
      opacity: renderStyle.glowOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  glow.position.copy(mesh.position);
  const glowSize = radius * renderStyle.glowSize;
  glow.scale.set(glowSize, glowSize, 1);

  const label = createLabelElement(starData);

  starGroup.add(mesh, glow);

  return {
    mesh,
    glow,
    radius,
    baseEmissiveIntensity: renderStyle.emissiveIntensity,
    baseGlowOpacity: renderStyle.glowOpacity,
    labelEl: label.el,
    labelNameEl: label.name,
    labelSpectralEl: label.spectral,
    occlusion: 1,
    projectedX: 0,
    projectedY: 0,
    projectedDistance: 0,
    visible: false,
    declutterGroupSize: 1,
    declutterGroupIndex: 0,
    declutterClusterId: 0,
    declutterOffsetX: 0,
    declutterOffsetY: 0,
    declutterOffsetZ: 0
  };
}

function applySelectionVisualState() {
  stars.forEach((star) => {
    const active = star.id === selectedStarId;
    const measureIndex = distanceMeasureIds.indexOf(star.id);
    const occ = star.occlusion ?? 1;
    const selectBoost = active ? 1.18 : 1;
    const isMeasureA = measureIndex === 0;
    const isMeasureB = measureIndex === 1;
    const measureBoost = isMeasureA || isMeasureB ? 1.34 : 1;

    star.mesh.scale.setScalar(active ? 1.22 : isMeasureA || isMeasureB ? 1.16 : 1);
    star.mesh.material.opacity = 0.42 + 0.58 * occ;
    star.mesh.material.emissiveIntensity = star.baseEmissiveIntensity * selectBoost * measureBoost * (0.62 + 0.38 * occ);
    star.glow.material.opacity = star.baseGlowOpacity * selectBoost * (0.5 + 0.5 * occ);
    star.mesh.material.emissive.copy(star.mesh.material.color);
    star.labelEl.classList.toggle("measure-selected", isMeasureA || isMeasureB);

    const faded = occ * occ * occ;
    star.labelEl.style.filter = "none";
    star.labelEl.style.opacity = `${0.08 + 0.92 * faded}`;
  });
}

function refreshStarVisual(star) {
  disposeStarVisual(star);
  Object.assign(star, buildStarObject(star));
}

function refreshAllStars({ preserveDeclutter = false } = {}) {
  const declutterById = new Map();
  if (preserveDeclutter) {
    stars.forEach((star) => {
      declutterById.set(star.id, {
        declutterGroupSize: star.declutterGroupSize,
        declutterGroupIndex: star.declutterGroupIndex,
        declutterClusterId: star.declutterClusterId,
        declutterOffsetX: star.declutterOffsetX,
        declutterOffsetY: star.declutterOffsetY,
        declutterOffsetZ: star.declutterOffsetZ
      });
    });
  }

  stars.forEach((star) => refreshStarVisual(star));
  if (preserveDeclutter) {
    stars.forEach((star) => {
      const state = declutterById.get(star.id);
      if (!state) return;
      Object.assign(star, state);
    });
  } else {
    recomputeSpatialDeclutterGroups();
  }
  applySelectionVisualState();
  renderStarList();
}

function clearAllStars() {
  clearDistanceMeasure();
  stars.forEach((star) => disposeStarVisual(star));
  stars = [];
  selectedStarId = null;
  updateSelectionUI();
  renderStarList();
}

function addStar(starData) {
  const star = {
    id: starIdCounter++,
    name: starData.name?.trim() || "Unnamed Star",
    x: parseCoordOr(starData.x, 0),
    y: parseCoordOr(starData.y, 0),
    z: parseCoordOr(starData.z, 0),
    spectralType: starData.spectralType?.trim() || "",
    temperature: parseMaybeNumber(starData.temperature),
    luminosity: parseMaybeNumber(starData.luminosity)
  };

  Object.assign(star, buildStarObject(star));
  stars.push(star);
  recomputeSpatialDeclutterGroups();
  applySelectionVisualState();
  renderStarList();
}

function removeStar(starId) {
  const index = stars.findIndex((s) => s.id === starId);
  if (index === -1) return;

  const star = stars[index];
  disposeStarVisual(star);
  stars.splice(index, 1);

  if (selectedStarId === starId) {
    selectedStarId = null;
    updateSelectionUI();
  }
  if (distanceMeasureIds.includes(starId)) {
    clearDistanceMeasure();
  }

  recomputeSpatialDeclutterGroups();
  applySelectionVisualState();
  renderStarList();
}

function selectStar(starId) {
  selectedStarId = starId;
  updateSelectionUI();
  applySelectionVisualState();
  renderStarList();
}

function selectedStar() {
  return stars.find((s) => s.id === selectedStarId) || null;
}

function updateSelectionUI() {
  const star = selectedStar();
  if (!star) {
    editForm.classList.add("disabled");
    selectedTitle.textContent = "Selected Star";
    selectionHint.textContent = "Click a star in the map to edit its data.";
    editForm.reset();
    return;
  }

  editForm.classList.remove("disabled");
  selectedTitle.textContent = `Selected ${star.name}`;
  selectionHint.textContent = "Update fields to edit this star.";

  editInputs.name.value = star.name;
  editInputs.x.value = star.x;
  editInputs.y.value = star.y;
  editInputs.z.value = star.z;
  editInputs.spectralType.value = star.spectralType || "";
  editInputs.temperature.value = star.temperature ?? "";
  editInputs.luminosity.value = star.luminosity ?? "";
}

function renderStarList() {
  starListEl.innerHTML = "";

  stars.forEach((star) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";

    const swatch = document.createElement("span");
    swatch.className = "star-chip";
    swatch.style.backgroundColor = `#${star.mesh.material.color.getHexString()}`;

    const text = document.createElement("span");
    text.className = "star-list-text";
    text.textContent = star.name;

    btn.append(swatch, text);

    if (star.id === selectedStarId) {
      btn.classList.add("active");
    }

    btn.addEventListener("click", () => selectStar(star.id));
    li.appendChild(btn);
    starListEl.appendChild(li);
  });
}

function projectWorldToScreen(worldVec) {
  tempVec.copy(worldVec).project(camera);
  const width = viewerEl.clientWidth;
  const height = viewerEl.clientHeight;
  return {
    x: (tempVec.x * 0.5 + 0.5) * width,
    y: (-tempVec.y * 0.5 + 0.5) * height,
    z: tempVec.z,
    visible: tempVec.z > -1 && tempVec.z < 1
  };
}

function getScreenNormalOffset(from, to, offsetPx) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const mag = Math.hypot(dx, dy) || 1;
  return {
    x: from.x + (-dy / mag) * offsetPx,
    y: from.y + (dx / mag) * offsetPx
  };
}

function updateAxisOverlays() {
  const worldUnitsPerPixel = getWorldUnitsPerPixel();
  const axisEnd = worldUnitsPerPixel * 160;

  const originWorld = new THREE.Vector3(0, 0, 0);
  starGroup.localToWorld(originWorld);
  const originP = projectWorldToScreen(originWorld);

  axisNameLabels.forEach((a) => {
    if (!isAxisActive(a.axis)) {
      a.el.style.display = "none";
      return;
    }

    if (a.axis === "x") tempLocalVec.set(axisEnd, 0, 0);
    if (a.axis === "y") tempLocalVec.set(0, axisEnd, 0);
    if (a.axis === "z") tempLocalVec.set(0, 0, axisEnd);

    tempWorldVec.copy(tempLocalVec);
    starGroup.localToWorld(tempWorldVec);
    const p = projectWorldToScreen(tempWorldVec);
    if (!p.visible || !originP.visible) {
      a.el.style.display = "none";
      return;
    }

    const labelPos = getScreenNormalOffset(originP, p, 12);
    a.el.style.display = "block";
    a.el.style.transform = `translate(${labelPos.x}px, ${labelPos.y}px) translate(-50%, -100%)`;
  });

  ensureTickLabelPool(axisTickLabelEntries.length);
  for (let i = 0; i < axisTickLabelEntries.length; i += 1) {
    const entry = axisTickLabelEntries[i];
    const el = axisTickLabelPool[i];
    el.textContent = entry.text;
    tempWorldVec.copy(entry.local);
    starGroup.localToWorld(tempWorldVec);
    const p = projectWorldToScreen(tempWorldVec);
    if (!p.visible) {
      el.style.display = "none";
      continue;
    }

    const axisDeltaLocal = worldUnitsPerPixel * 42;
    if (entry.axis === "x") tempLocalVec2.set(entry.local.x + axisDeltaLocal, entry.local.y, entry.local.z);
    if (entry.axis === "y") tempLocalVec2.set(entry.local.x, entry.local.y + axisDeltaLocal, entry.local.z);
    if (entry.axis === "z") tempLocalVec2.set(entry.local.x, entry.local.y, entry.local.z + axisDeltaLocal);

    tempWorldVec.copy(tempLocalVec2);
    starGroup.localToWorld(tempWorldVec);
    const p2 = projectWorldToScreen(tempWorldVec);
    if (!p2.visible) {
      el.style.display = "none";
      continue;
    }

    const labelPos = getScreenNormalOffset(p, p2, 9);

    el.style.display = "block";
    el.style.transform = `translate(${labelPos.x}px, ${labelPos.y}px) translate(-50%, -100%)`;
  }
  hideUnusedTickLabels(axisTickLabelEntries.length);
}

function updateLabelPositions() {
  const visibleByCluster = new Map();

  stars.forEach((star) => {
    tempLocalVec.set(
      star.x + (star.declutterOffsetX ?? 0),
      star.y + (star.declutterOffsetY ?? 0),
      star.z + (star.declutterOffsetZ ?? 0)
    );
    star.mesh.position.copy(tempLocalVec);
    star.glow.position.copy(tempLocalVec);

    tempWorldVec.copy(tempLocalVec);
    starGroup.localToWorld(tempWorldVec);
    const baseProj = projectWorldToScreen(tempWorldVec);
    star.visible = baseProj.visible;

    if (!baseProj.visible) {
      star.labelEl.style.display = "none";
      return;
    }
    const p = baseProj;

    star.projectedX = p.x;
    star.projectedY = p.y;
    star.labelProjectedX = p.x;
    star.labelProjectedY = p.y;
    star.projectedDistance = camera.position.distanceTo(tempWorldVec);
    star.projectedRadiusPx = Math.max(
      1,
      star.radius / Math.max(1e-6, getWorldUnitsPerPixelAtDistance(star.projectedDistance))
    );
    star.labelAnchor = "top";

    if ((star.declutterGroupSize ?? 1) > 1) {
      let arr = visibleByCluster.get(star.declutterClusterId);
      if (!arr) {
        arr = [];
        visibleByCluster.set(star.declutterClusterId, arr);
      }
      arr.push(star);
    }
  });

  visibleByCluster.forEach((clusterStars) => {
    if (clusterStars.length <= 1) return;
    let cx = 0;
    let cy = 0;
    clusterStars.forEach((s) => {
      cx += s.labelProjectedX;
      cy += s.labelProjectedY;
    });
    cx /= clusterStars.length;
    cy /= clusterStars.length;

    clusterStars.forEach((s) => {
      const dx = s.labelProjectedX - cx;
      const dy = s.labelProjectedY - cy;
      if (Math.abs(dx) >= Math.abs(dy)) {
        s.labelAnchor = dx < 0 ? "left" : "right";
      } else {
        s.labelAnchor = dy < 0 ? "top" : "bottom";
      }
    });
  });

  stars.forEach((star) => {
    if (!star.visible) return;
    const isClustered = (star.declutterGroupSize ?? 1) > 1;
    const labelRadiusPx = clamp(star.projectedRadiusPx, 1, 11.2);
    const topOffset = (7 + labelRadiusPx) * 0.8;
    const sideOffset = (11 + labelRadiusPx * 0.8) * 0.8;
    const sideLift = labelRadiusPx * 0.2;
    let x = star.labelProjectedX;
    let y = star.labelProjectedY;
    let tx = "-50%";
    let ty = "-100%";

    if (star.labelAnchor === "left") {
      x -= sideOffset;
      y -= sideLift;
      tx = "-100%";
      ty = "-50%";
    } else if (star.labelAnchor === "right") {
      x += sideOffset;
      y -= sideLift;
      tx = "0%";
      ty = "-50%";
    } else if (star.labelAnchor === "bottom") {
      y += sideOffset * 0.6;
      tx = "-50%";
      ty = "0%";
    } else {
      y -= topOffset;
      tx = "-50%";
      ty = "-100%";
    }

    star.labelEl.style.display = "block";
    star.labelEl.classList.toggle("cluster-component", isClustered);
    star.labelEl.style.transform = `translate(${x}px, ${y}px) translate(${tx}, ${ty})`;
    star.labelScreenX = x;
    star.labelScreenY = y;
  });
}

function updateSystemLabels() {
  const groups = new Map();
  const viewerRect = viewerEl.getBoundingClientRect();

  stars.forEach((star) => {
    if (!star.visible || !star.systemRoot || !star.systemComponent) return;

    const rect = star.labelEl.getBoundingClientRect();
    const left = rect.left - viewerRect.left;
    const right = rect.right - viewerRect.left;
    const top = rect.top - viewerRect.top;
    if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top)) return;

    let g = groups.get(star.systemRoot);
    if (!g) {
      g = {
        count: 0,
        minLeft: Infinity,
        maxRight: -Infinity,
        topY: Infinity,
        dimmedCount: 0
      };
      groups.set(star.systemRoot, g);
    }
    g.count += 1;
    g.minLeft = Math.min(g.minLeft, left);
    g.maxRight = Math.max(g.maxRight, right);
    g.topY = Math.min(g.topY, top);
    if ((star.occlusion ?? 1) < 0.999) g.dimmedCount += 1;
  });

  const entries = Array.from(groups.entries()).filter(([, g]) => g.count >= 2);
  ensureSystemLabelPool(entries.length);

  for (let i = 0; i < entries.length; i += 1) {
    const [root, g] = entries[i];
    const el = systemLabelPool[i];
    const titleEl = el.querySelector(".system-label-title");
    const bracketEl = el.querySelector(".system-label-bracket");
    const centerX = (g.minLeft + g.maxRight) * 0.5;
    const projectedWidth = g.maxRight - g.minLeft;
    const clusterWidth = Math.max(12, projectedWidth + 10);
    // Keep cluster label vertical spacing in fixed screen-space, same style as star labels.
    const y = Math.max(2, g.topY - 12);
    const dimRatio = g.count > 0 ? g.dimmedCount / g.count : 0;

    titleEl.textContent = root;
    bracketEl.style.width = `${clusterWidth}px`;
    el.style.width = `${clusterWidth}px`;
    el.style.opacity = `${clamp(1 - dimRatio, 0.12, 1)}`;
    el.style.display = "block";
    el.style.transform = `translate(${centerX}px, ${y}px) translate(-50%, 0)`;
  }
  hideUnusedSystemLabels(entries.length);
}

function applyDepthOcclusion() {
  stars.forEach((star) => {
    star.occlusion = 1;
  });

  for (let i = 0; i < stars.length; i += 1) {
    const a = stars[i];
    if (!a.visible) continue;

    for (let j = i + 1; j < stars.length; j += 1) {
      const b = stars[j];
      if (!b.visible) continue;

      const dx = a.projectedX - b.projectedX;
      const dy = a.projectedY - b.projectedY;
      const dist2 = dx * dx + dy * dy;
      const threshold = (13 + (a.radius + b.radius) * 5.5) * 0.4;

      if (dist2 > threshold * threshold) continue;

      if (a.projectedDistance < b.projectedDistance) {
        b.occlusion = Math.min(b.occlusion, 0.52);
      } else {
        a.occlusion = Math.min(a.occlusion, 0.52);
      }
    }
  }

  applySelectionVisualState();
}

function starIdAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const meshes = stars.map((s) => s.mesh);
  const intersections = raycaster.intersectObjects(meshes, false);

  if (intersections.length > 0) {
    return intersections[0].object.userData.starId;
  }
  return null;
}

function pickStarAt(clientX, clientY) {
  const starId = starIdAt(clientX, clientY);
  if (starId !== null) selectStar(starId);
}

function clearDistanceMeasure() {
  distanceMeasureIds = [];
  if (distanceMeasureLine) {
    distanceMeasureLine.geometry.dispose();
    distanceMeasureLine.material.dispose();
    starGroup.remove(distanceMeasureLine);
    distanceMeasureLine = null;
  }
  distanceMeasureLabel.style.display = "none";
  applySelectionVisualState();
}

function buildDistanceMeasureLine() {
  if (distanceMeasureLine) {
    distanceMeasureLine.geometry.dispose();
    distanceMeasureLine.material.dispose();
    starGroup.remove(distanceMeasureLine);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x86b9ff, transparent: true, opacity: 0.9 });
  distanceMeasureLine = new THREE.Line(geom, mat);
  starGroup.add(distanceMeasureLine);
}

function handleRightClickMeasure(clientX, clientY) {
  if (!measureModeEnabled) return;
  const starId = starIdAt(clientX, clientY);
  if (starId === null) {
    clearDistanceMeasure();
    updateMeasureHint();
    return;
  }

  if (distanceMeasureIds.length === 0) {
    distanceMeasureIds = [starId];
    distanceMeasureLabel.style.display = "none";
    updateMeasureHint();
    applySelectionVisualState();
    return;
  }

  if (distanceMeasureIds.length === 1) {
    if (distanceMeasureIds[0] === starId) return;
    distanceMeasureIds.push(starId);
    buildDistanceMeasureLine();
    updateMeasureHint();
    applySelectionVisualState();
    return;
  }

  distanceMeasureIds = [starId];
  if (distanceMeasureLine) {
    starGroup.remove(distanceMeasureLine);
    distanceMeasureLine.geometry.dispose();
    distanceMeasureLine.material.dispose();
    distanceMeasureLine = null;
  }
  distanceMeasureLabel.style.display = "none";
  updateMeasureHint();
  applySelectionVisualState();
}

function updateMeasureHint() {
  if (!measureHint) return;
  if (!measureModeEnabled) {
    measureHint.textContent = "Enable measure mode to pick two stars.";
    return;
  }
  if (distanceMeasureIds.length === 0) {
    measureHint.textContent = "Right-click star 1 to start measuring.";
    return;
  }
  if (distanceMeasureIds.length === 1) {
    measureHint.textContent = "Right-click star 2 to complete measurement.";
    return;
  }
  measureHint.textContent = "Measurement active. Right-click another star to restart.";
}

function updateDistanceMeasureVisual() {
  if (distanceMeasureIds.length !== 2 || !distanceMeasureLine) return;

  const a = stars.find((s) => s.id === distanceMeasureIds[0]);
  const b = stars.find((s) => s.id === distanceMeasureIds[1]);
  if (!a || !b) {
    clearDistanceMeasure();
    return;
  }

  const pos = distanceMeasureLine.geometry.attributes.position.array;
  pos[0] = a.x;
  pos[1] = a.y;
  pos[2] = a.z;
  pos[3] = b.x;
  pos[4] = b.y;
  pos[5] = b.z;
  distanceMeasureLine.geometry.attributes.position.needsUpdate = true;
  distanceMeasureLine.geometry.computeBoundingSphere();

  tempLocalVec.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  tempWorldVec.copy(tempLocalVec);
  starGroup.localToWorld(tempWorldVec);
  const p = projectWorldToScreen(tempWorldVec);
  if (!p.visible) {
    distanceMeasureLabel.style.display = "none";
    return;
  }

  const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  distanceMeasureLabel.textContent = `${d.toFixed(d < 10 ? 4 : d < 100 ? 3 : 2)} ly`;
  distanceMeasureLabel.style.display = "block";
  distanceMeasureLabel.style.transform = `translate(${p.x}px, ${p.y - 10}px) translate(-50%, -100%)`;
}

function projectPointerToArcball(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((clientY - rect.top) / rect.height) * 2 - 1);

  const len2 = x * x + y * y;
  if (len2 <= 1) {
    return new THREE.Vector3(x, y, Math.sqrt(1 - len2)).normalize();
  }

  const invLen = 1 / Math.sqrt(len2);
  return new THREE.Vector3(x * invLen, y * invLen, 0);
}

function buildArcballQuaternion(from, to, sensitivity = 1.34) {
  const dot = clamp(from.dot(to), -1, 1);
  const angle = Math.acos(dot) * sensitivity;
  if (angle < 1e-6) return new THREE.Quaternion();

  const axis = new THREE.Vector3().crossVectors(from, to);
  if (axis.lengthSq() < 1e-9) return new THREE.Quaternion();
  axis.normalize();
  return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}

function onPointerDown(event) {
  if (event.button !== 0) return;

  interaction.isDragging = true;
  interaction.moved = false;
  interaction.pointerId = event.pointerId;
  interaction.startX = event.clientX;
  interaction.startY = event.clientY;
  interaction.arcballVec.copy(projectPointerToArcball(event.clientX, event.clientY));

  renderer.domElement.classList.add("dragging");
  renderer.domElement.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (!interaction.isDragging || interaction.pointerId !== event.pointerId) return;

  if (Math.abs(event.clientX - interaction.startX) + Math.abs(event.clientY - interaction.startY) > 3) {
    interaction.moved = true;
  }

  const currentVec = projectPointerToArcball(event.clientX, event.clientY);
  const q = buildArcballQuaternion(interaction.arcballVec, currentVec);
  starGroup.quaternion.premultiply(q);
  interaction.arcballVec.copy(currentVec);
}

function onPointerUp(event) {
  if (interaction.pointerId !== event.pointerId) return;

  if (!interaction.moved) {
    pickStarAt(event.clientX, event.clientY);
  }

  interaction.isDragging = false;
  interaction.pointerId = null;
  renderer.domElement.classList.remove("dragging");
  try {
    renderer.domElement.releasePointerCapture(event.pointerId);
  } catch {
    // no-op
  }
}

function onWheel(event) {
  event.preventDefault();
  const zoomScale = Math.exp(event.deltaY * 0.00065);
  cameraDistance = clamp(cameraDistance * zoomScale, 2, 100000);
  camera.position.set(0, 0, cameraDistance);
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  if (!/[",\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function exportStarsAsCsv() {
  const header = ["name", "x", "y", "z", "spectralType", "temperature", "luminosity"];
  const rows = stars.map((star) => [
    star.name,
    star.x,
    star.y,
    star.z,
    star.spectralType,
    star.temperature ?? "",
    star.luminosity ?? ""
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "star-map.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out;
}

function normalizeHeader(header) {
  return header.trim().toLowerCase().replace(/[\s_]+/g, "");
}

function importStarsFromCsvText(text, mode = "replace") {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return;

  const firstRow = parseCsvLine(lines[0]);
  const looksLikeHeader = firstRow.some((cell) => /[a-z]/i.test(cell));

  let headers = ["name", "x", "y", "z", "spectraltype", "temperature", "luminosity"];
  let dataStart = 0;

  if (looksLikeHeader) {
    headers = firstRow.map((h) => normalizeHeader(h));
    dataStart = 1;
  }

  const imported = [];

  for (let i = dataStart; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length === 1 && cols[0] === "") continue;

    const row = {};
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]] = (cols[c] ?? "").trim();
    }

    imported.push({
      name: row.name || row.star || row.starname || "Unnamed Star",
      x: row.x ?? "0",
      y: row.y ?? "0",
      z: row.z ?? "0",
      spectralType: row.spectraltype || row.spt || row.spectral || "",
      temperature: row.temperature || row.teff || row.temp || "",
      luminosity: row.luminosity || row.lum || row.l || ""
    });
  }

  if (imported.length === 0) return;

  if (mode === "replace") {
    clearAllStars();
  }

  imported.forEach((star) => addStar(star));
}

renderer.domElement.addEventListener("pointerdown", onPointerDown);
renderer.domElement.addEventListener("pointermove", onPointerMove);
renderer.domElement.addEventListener("pointerup", onPointerUp);
renderer.domElement.addEventListener("pointercancel", onPointerUp);
renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
renderer.domElement.addEventListener("contextmenu", (event) => {
  if (!measureModeEnabled) return;
  event.preventDefault();
  handleRightClickMeasure(event.clientX, event.clientY);
});

measureModeBtn?.addEventListener("click", () => {
  measureModeEnabled = !measureModeEnabled;
  measureModeBtn.textContent = `Measure: ${measureModeEnabled ? "On" : "Off"}`;
  measureModeBtn.classList.toggle("active", measureModeEnabled);
  if (!measureModeEnabled) {
    clearDistanceMeasure();
  }
  updateMeasureHint();
});

gridToggleXY?.addEventListener("change", () => {
  grids.xy.visible = gridToggleXY.checked;
});

gridToggleXZ?.addEventListener("change", () => {
  grids.xz.visible = gridToggleXZ.checked;
});

gridToggleYZ?.addEventListener("change", () => {
  grids.yz.visible = gridToggleYZ.checked;
});

starForm.addEventListener("submit", (event) => {
  event.preventDefault();

  addStar({
    name: document.getElementById("star-name").value,
    x: document.getElementById("star-x").value,
    y: document.getElementById("star-y").value,
    z: document.getElementById("star-z").value,
    spectralType: document.getElementById("star-spectral").value,
    temperature: document.getElementById("star-temperature").value,
    luminosity: document.getElementById("star-luminosity").value
  });

  starForm.reset();
});

Object.values(editInputs).forEach((input) => {
  input.addEventListener("input", () => {
    const star = selectedStar();
    if (!star) return;

    star.name = editInputs.name.value.trim() || "Unnamed Star";

    const maybeX = parseMaybeNumber(editInputs.x.value);
    const maybeY = parseMaybeNumber(editInputs.y.value);
    const maybeZ = parseMaybeNumber(editInputs.z.value);
    if (maybeX !== null) star.x = maybeX;
    if (maybeY !== null) star.y = maybeY;
    if (maybeZ !== null) star.z = maybeZ;

    star.spectralType = editInputs.spectralType.value.trim();
    star.temperature = parseMaybeNumber(editInputs.temperature.value);
    star.luminosity = parseMaybeNumber(editInputs.luminosity.value);

    refreshStarVisual(star);
    recomputeSpatialDeclutterGroups();
    updateLabelText(star);
    selectedTitle.textContent = `Selected ${star.name}`;
    selectionHint.textContent = "Update fields to edit this star.";
    applySelectionVisualState();
    renderStarList();
  });
});

deleteBtn.addEventListener("click", () => {
  const star = selectedStar();
  if (!star) return;
  removeStar(star.id);
});

lumTuneBtn.addEventListener("click", () => {
  luminosityTuningEnabled = !luminosityTuningEnabled;
  lumTuneBtn.textContent = `Tune Luminosity: ${luminosityTuningEnabled ? "On" : "Off"}`;
  lumTuneBtn.classList.toggle("active", luminosityTuningEnabled);
  refreshAllStars({ preserveDeclutter: true });
});

exportCsvBtn.addEventListener("click", exportStarsAsCsv);

importCsvBtn.addEventListener("click", () => {
  importCsvInput.click();
});

importCsvInput.addEventListener("change", async () => {
  const file = importCsvInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  importStarsFromCsvText(text, importModeEl?.value || "replace");
  importCsvInput.value = "";
});

function onResize() {
  const { clientWidth, clientHeight } = viewerEl;
  renderer.setSize(clientWidth, clientHeight);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", onResize);

addStar({
  name: "Sun",
  x: 0,
  y: 0,
  z: 0,
  spectralType: "G2V",
  temperature: 5772,
  luminosity: 1
});

addStar({
  name: "Sirius",
  x: 8.6,
  y: 3.2,
  z: -4.1,
  spectralType: "A1V",
  temperature: 9940,
  luminosity: 25.4
});

addStar({
  name: "Betelgeuse",
  x: -38.7,
  y: 12.2,
  z: 16.8,
  spectralType: "M1I",
  temperature: 3500,
  luminosity: 90000
});

addStar({
  name: "Proxima Centauri",
  x: -1.5462832,
  y: 3.1022441,
  z: -2.1230457,
  spectralType: "M5.5Ve",
  temperature: 3042,
  luminosity: 0.0017
});

onResize();
updateMeasureHint();

const clock = new THREE.Clock();

function animate() {
  const dt = clock.getDelta();
  starGroup.rotation.y += dt * 0.02;

  recomputeDeclutterLocalOffsets();
  updateDynamicAxisScale();
  updateLabelPositions();
  updateSystemLabels();
  updateAxisOverlays();
  applyDepthOcclusion();
  updateDistanceMeasureVisual();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
