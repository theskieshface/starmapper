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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewerEl.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#040916");

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1000);
camera.position.set(0, 0, cameraDistance);

const starGroup = new THREE.Group();
scene.add(starGroup);
scene.add(createBackgroundStars());

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
let axisTickSegments = null;
let lastAxisStep = null;
let lastAxisExtent = null;
buildAxisNameLabels();

const glowTexture = createGlowTexture();

const TEFF_COLOR_DB = [
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
  { temp: 40000, hex: "#a1b7ff" }
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
  M: 3400
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

function colorFromTemperature(tempK) {
  if (!Number.isFinite(tempK)) return "#ffffff";
  const t = clamp(tempK, TEFF_COLOR_DB[0].temp, TEFF_COLOR_DB[TEFF_COLOR_DB.length - 1].temp);
  for (let i = 0; i < TEFF_COLOR_DB.length - 1; i += 1) {
    const lo = TEFF_COLOR_DB[i];
    const hi = TEFF_COLOR_DB[i + 1];
    if (t >= lo.temp && t <= hi.temp) {
      const mix = (t - lo.temp) / (hi.temp - lo.temp);
      return rgbToHex(interpolateRgb(hexToRgb(lo.hex), hexToRgb(hi.hex), mix));
    }
  }
  return TEFF_COLOR_DB[TEFF_COLOR_DB.length - 1].hex;
}

function temperatureFromSpectral(spectralType) {
  if (!spectralType) return null;
  const clean = spectralType.trim().toUpperCase();
  const exact = clean.match(/^([OBAFGKM])([0-9])/);
  if (exact) {
    const key = `${exact[1]}${exact[2]}`;
    if (SPECTRAL_TEFF_DB[key]) return SPECTRAL_TEFF_DB[key];
  }
  const classOnly = clean.match(/^([OBAFGKM])/);
  if (!classOnly) return null;
  return SPECTRAL_CLASS_TEFF[classOnly[1]] ?? null;
}

function effectiveTemperature(starData) {
  return Number.isFinite(starData.temperature)
    ? starData.temperature
    : temperatureFromSpectral(starData.spectralType);
}

function colorHexForStar(starData) {
  return colorFromTemperature(effectiveTemperature(starData));
}

function applyTemperatureSeparation(color, teff) {
  if (!Number.isFinite(teff)) return color;

  const cool = clamp((6200 - teff) / 3200, 0, 1);
  const hot = clamp((teff - 6500) / 17000, 0, 1);

  const separated = color.clone();
  separated.r = clamp(separated.r * (1 + cool * 0.42) * (1 - hot * 0.18), 0, 1);
  separated.g = clamp(separated.g * (1 - cool * 0.22) * (1 - hot * 0.08), 0, 1);
  separated.b = clamp(separated.b * (1 - cool * 0.5) * (1 + hot * 0.4), 0, 1);
  return separated;
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
  return base;
}

function computeRenderStyle(starData) {
  const teff = effectiveTemperature(starData);
  const baseColor = applyTemperatureSeparation(new THREE.Color(colorHexForStar(starData)), teff);

  const lum = Number.isFinite(starData.luminosity) ? Math.max(starData.luminosity, 0) : 0;
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
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(512, 512, 0, 512, 512, 512);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.03, "rgba(255,255,255,0.995)");
  gradient.addColorStop(0.08, "rgba(255,255,255,0.965)");
  gradient.addColorStop(0.16, "rgba(255,255,255,0.87)");
  gradient.addColorStop(0.28, "rgba(255,255,255,0.69)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.46)");
  gradient.addColorStop(0.58, "rgba(255,255,255,0.27)");
  gradient.addColorStop(0.74, "rgba(255,255,255,0.13)");
  gradient.addColorStop(0.88, "rgba(255,255,255,0.05)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 1024);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function buildGrids() {
  const size = 140;
  const div = 14;

  const xy = new THREE.GridHelper(size, div, 0x355a97, 0x1f355f);
  xy.rotation.x = Math.PI / 2;
  xy.material.opacity = 0.2;
  xy.material.transparent = true;

  const xz = new THREE.GridHelper(size, div, 0x36507e, 0x1f3152);
  xz.material.opacity = 0.18;
  xz.material.transparent = true;

  const yz = new THREE.GridHelper(size, div, 0x4b4f7e, 0x2a2b52);
  yz.rotation.z = Math.PI / 2;
  yz.material.opacity = 0.16;
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
  const s = (spectralType || "").toUpperCase();
  if (!s) return 1;
  if (/VI\b/.test(s)) return 0.5;
  if (/V\b/.test(s)) return 0.72;
  if (/IV\b/.test(s)) return 0.92;
  if (/III\b/.test(s)) return 1.2;
  if (/II\b/.test(s)) return 1.45;
  if (/IA\+?\b/.test(s)) return 2.1;
  if (/IAB\b/.test(s)) return 1.95;
  if (/IA\b/.test(s)) return 2;
  if (/IB\b/.test(s)) return 1.72;
  if (/I\b/.test(s)) return 1.8;
  return 1;
}

function getSpectralTypeScale(spectralType, teff) {
  const s = (spectralType || "").toUpperCase().trim();
  const classMatch = s.match(/^([OBAFGKM])/);
  const subtypeMatch = s.match(/^([OBAFGKM])([0-9](?:\.[0-9])?)/);

  const classScale = {
    O: 1.35,
    B: 1.24,
    A: 1.14,
    F: 1.04,
    G: 0.96,
    K: 0.82,
    M: 0.66
  };

  let scale = classMatch ? classScale[classMatch[1]] ?? 1 : 1;
  if (subtypeMatch) {
    const subtype = clamp(Number(subtypeMatch[2]), 0, 9);
    scale *= 1 - subtype * 0.012;
  }

  if (Number.isFinite(teff)) {
    const coolBoost = clamp((6000 - teff) / 3500, 0, 1);
    scale *= 1 - coolBoost * 0.1;
  }

  return clamp(scale, 0.45, 1.5);
}

function getWorldUnitsPerPixel() {
  const fovRad = (camera.fov * Math.PI) / 180;
  return (2 * cameraDistance * Math.tan(fovRad / 2)) / Math.max(1, viewerEl.clientHeight);
}

function rebuildAxisTickSegments(step, extent) {
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

    verts.push(v, -tickHalf, 0, v, tickHalf, 0);
    verts.push(-tickHalf, v, 0, tickHalf, v, 0);
    verts.push(0, -tickHalf, v, 0, tickHalf, v);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x7f9dcc, transparent: true, opacity: 0.42 });
  axisTickSegments = new THREE.LineSegments(geo, mat);
  starGroup.add(axisTickSegments);
}

function updateDynamicAxisScale() {
  const worldUnitsPerPixel = getWorldUnitsPerPixel();
  const targetSpacingPx = 78;
  const step = niceStep(worldUnitsPerPixel * targetSpacingPx);
  const extent = Math.max(step * 2, Math.ceil((worldUnitsPerPixel * viewerEl.clientHeight * 0.7) / step) * step);

  if (step !== lastAxisStep || extent !== lastAxisExtent) {
    rebuildAxisTickSegments(step, extent);
    lastAxisStep = step;
    lastAxisExtent = extent;
  }

  axisTickLabelEntries.length = 0;
  const count = Math.floor(extent / step);

  for (let i = -count; i <= count; i += 1) {
    const v = i * step;
    if (Math.abs(v) < step * 0.001) continue;

    axisTickLabelEntries.push({ axis: "x", local: new THREE.Vector3(v, 1.8, 0), text: formatLyValue(v, step) });
    axisTickLabelEntries.push({ axis: "y", local: new THREE.Vector3(1.8, v, 0), text: formatLyValue(v, step) });
    axisTickLabelEntries.push({ axis: "z", local: new THREE.Vector3(0, 1.8, v), text: formatLyValue(v, step) });
  }
}

function createLabelElement(starData) {
  const el = document.createElement("div");
  el.className = "star-label";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = starData.name;

  const spectral = document.createElement("div");
  spectral.className = "spectral";
  spectral.textContent = starData.spectralType?.trim() || "";
  spectral.style.display = spectral.textContent ? "block" : "none";

  el.append(name, spectral);
  labelLayer.appendChild(el);

  return { el, name, spectral };
}

function updateLabelText(star) {
  star.labelNameEl.textContent = star.name;
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
  const renderStyle = computeRenderStyle(starData);
  const teff = effectiveTemperature(starData);
  const radius =
    computeStarRadius(starData.luminosity) *
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
    visible: false
  };
}

function applySelectionVisualState() {
  stars.forEach((star) => {
    const active = star.id === selectedStarId;
    const occ = star.occlusion ?? 1;
    const selectBoost = active ? 1.18 : 1;

    star.mesh.scale.setScalar(active ? 1.22 : 1);
    star.mesh.material.opacity = 0.42 + 0.58 * occ;
    star.mesh.material.emissiveIntensity = star.baseEmissiveIntensity * selectBoost * (0.62 + 0.38 * occ);
    star.glow.material.opacity = star.baseGlowOpacity * selectBoost * (0.5 + 0.5 * occ);

    if (occ < 0.98) {
      const blurPx = (1 - occ) * 3.2;
      star.labelEl.style.filter = `blur(${blurPx.toFixed(2)}px) brightness(${(0.58 + 0.42 * occ).toFixed(2)})`;
      star.labelEl.style.opacity = `${0.4 + 0.6 * occ}`;
    } else {
      star.labelEl.style.filter = "none";
      star.labelEl.style.opacity = "1";
    }
  });
}

function refreshStarVisual(star) {
  disposeStarVisual(star);
  Object.assign(star, buildStarObject(star));
}

function refreshAllStars() {
  stars.forEach((star) => refreshStarVisual(star));
  applySelectionVisualState();
  renderStarList();
}

function clearAllStars() {
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

function updateOverlayPosition(el, local, yOffset = 0, scale = 1) {
  tempWorldVec.copy(local);
  starGroup.localToWorld(tempWorldVec);
  const p = projectWorldToScreen(tempWorldVec);
  if (!p.visible) {
    el.style.display = "none";
    return;
  }

  el.style.display = "block";
  el.style.transform = `translate(${p.x}px, ${p.y - yOffset}px) translate(-50%, -100%) scale(${scale})`;
}

function updateAxisOverlays() {
  const worldUnitsPerPixel = getWorldUnitsPerPixel();
  const axisEnd = worldUnitsPerPixel * 160;
  axisNameLabels.forEach((a) => {
    if (a.axis === "x") tempLocalVec.set(axisEnd, 0, 0);
    if (a.axis === "y") tempLocalVec.set(0, axisEnd, 0);
    if (a.axis === "z") tempLocalVec.set(0, 0, axisEnd);
    updateOverlayPosition(a.el, tempLocalVec, 0, 1);
  });

  ensureTickLabelPool(axisTickLabelEntries.length);
  for (let i = 0; i < axisTickLabelEntries.length; i += 1) {
    const entry = axisTickLabelEntries[i];
    const el = axisTickLabelPool[i];
    el.textContent = entry.text;
    updateOverlayPosition(el, entry.local, 0, 1);
  }
  hideUnusedTickLabels(axisTickLabelEntries.length);
}

function updateLabelPositions() {
  stars.forEach((star) => {
    star.mesh.getWorldPosition(tempWorldVec);
    const p = projectWorldToScreen(tempWorldVec);
    star.visible = p.visible;

    if (!p.visible) {
      star.labelEl.style.display = "none";
      return;
    }

    star.projectedX = p.x;
    star.projectedY = p.y;
    star.projectedDistance = camera.position.distanceTo(tempWorldVec);

    const scale = clamp(94 / star.projectedDistance, 0.72, 1.34);
    const yOffset = 10 + star.radius * 20;

    star.labelEl.style.display = "block";
    star.labelEl.style.transform = `translate(${p.x}px, ${p.y - yOffset}px) translate(-50%, -100%) scale(${scale})`;
  });
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
      const threshold = 13 + (a.radius + b.radius) * 5.5;

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

function pickStarAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const meshes = stars.map((s) => s.mesh);
  const intersections = raycaster.intersectObjects(meshes, false);

  if (intersections.length > 0) {
    selectStar(intersections[0].object.userData.starId);
  }
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
  refreshAllStars();
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

const clock = new THREE.Clock();

function animate() {
  const dt = clock.getDelta();
  starGroup.rotation.y += dt * 0.025;

  updateDynamicAxisScale();
  updateLabelPositions();
  updateAxisOverlays();
  applyDepthOcclusion();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
