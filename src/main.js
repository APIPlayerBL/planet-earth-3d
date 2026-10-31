import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import { PLACES, placeName } from './data.js';
import { UI, t } from './i18n.js';

// ---------- state ----------
const state = {
  lang: (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'ru',
  hovered: null,
  selectedPlace: null,
  pendingClickTimer: null,
  pendingClickPlace: null,
  moved: false,
  pointerDown: null,
  imageFallbackUsed: false,
  hoverScheduled: false,
  lastHoverEvent: null
};

const wikiCache = new Map(); // key -> { data, time }
const WIKI_TTL = 60 * 60 * 1000;

function wikiCacheKey(lang, title) {
  return lang + '|' + title.trim().replace(/\s+/g, '_');
}

async function wikiSearchTitle(lang, query) {
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.query?.search?.[0]?.title || null;
  } catch (e) {
    return null;
  }
}

async function fetchSummary(lang, title) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { status: res.status, data: null };
    const json = await res.json();
    if (json.type === 'disambiguation') return { status: 200, data: null, disamb: true, title: json.title };
    const data = {
      desc: json.extract || null,
      image: json.thumbnail?.source || json.originalimage?.source || null,
      title: json.title || title
    };
    if (data.desc || data.image) return { status: 200, data, title: json.title };
    return { status: 200, data: null };
  } catch (e) {
    clearTimeout(timer);
    return { status: 0, data: null, error: e?.message || String(e) };
  }
}

async function fetchWiki(lang, title) {
  const normalized = title.trim().replace(/\s+/g, '_');
  const key = wikiCacheKey(lang, normalized);
  const cached = wikiCache.get(key);
  if (cached && (Date.now() - cached.time) < WIKI_TTL) return cached.data;

  const languages = lang === 'en' ? ['en'] : [lang, 'en'];
  for (const l of languages) {
    // direct variants
    for (const v of [normalized, normalized.replace(/_/g, ' ')]) {
      let result = await fetchSummary(l, v);
      if (result.status === 429) {
        await new Promise((r) => setTimeout(r, 800));
        result = await fetchSummary(l, v);
      }
      if (result.data) {
        wikiCache.set(key, { data: result.data, time: Date.now() });
        return result.data;
      }
      // search fallback for missing/disambiguation
      const found = await wikiSearchTitle(l, title);
      if (found && found.toLowerCase() !== v.toLowerCase()) {
        const searched = await fetchSummary(l, found);
        if (searched.data) {
          wikiCache.set(key, { data: searched.data, time: Date.now() });
          return searched.data;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return null;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(state.lang, el.dataset.i18n);
  });
  const sel = document.getElementById('lang-select');
  if (sel) sel.value = state.lang;
  document.documentElement.lang = state.lang;
  document.title = `${t(state.lang, 'appTitle')} — 3D`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', t(state.lang, 'appTitle') + ' — интерактивная 3D-модель Земли / interactive 3D Earth / Terre 3D / 3D地球');
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.placeholder = t(state.lang, 'searchPlaceholder');
  const closeBtn = document.getElementById('card-close');
  if (closeBtn) closeBtn.setAttribute('aria-label', t(state.lang, 'close'));
}

// ---------- three.js setup ----------
const canvas = document.getElementById('globe-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.5;
controls.maxDistance = 6;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.8;
controls.enablePan = false;
controls.enableKeys = true;

scene.add(new THREE.AmbientLight(0x6677aa, 1.05));
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x1a3020, 0.8);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffffff, 1.85);
sunLight.position.set(6, 4, 5);
scene.add(sunLight);
const fill = new THREE.DirectionalLight(0x9bbcff, 0.55);
fill.position.set(-5, -1, -4);
scene.add(fill);

const loaderEl = document.getElementById('loader');
const manager = new THREE.LoadingManager();
manager.onLoad = () => { if (loaderEl) loaderEl.classList.add('hidden'); };
manager.onError = (url) => {
  console.warn('Texture failed to load:', url);
  if (loaderEl) loaderEl.classList.add('hidden');
};

const texLoader = new THREE.TextureLoader(manager);
texLoader.crossOrigin = 'anonymous';

const dayTex = texLoader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg');
const nightTex = texLoader.load('https://unpkg.com/three-globe/example/img/earth-night.jpg');
const normalTex = texLoader.load('https://threejs.org/examples/textures/planets/earth_normal_2048.jpg');
const specularTex = texLoader.load('https://threejs.org/examples/textures/planets/earth_specular_2048.jpg');
const cloudsTex = texLoader.load('https://threejs.org/examples/textures/planets/earth_clouds_1024.png');

dayTex.colorSpace = THREE.SRGBColorSpace;
cloudsTex.colorSpace = THREE.SRGBColorSpace;

// stars
const starCount = 2500;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const r = 30 + Math.random() * 50;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPos[i*3] = r * Math.sin(phi) * Math.cos(theta);
  starPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
  starPos[i*3+2] = r * Math.cos(phi);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, sizeAttenuation: true, transparent: true, opacity: 0.8 });
scene.add(new THREE.Points(starGeo, starMat));

const earthGeo = new THREE.SphereGeometry(1, 96, 48);
const earthMat = new THREE.MeshPhongMaterial({
  map: dayTex,
  normalMap: normalTex,
  specularMap: specularTex,
  specular: new THREE.Color(0x333333),
  shininess: 15
});
const earth = new THREE.Mesh(earthGeo, earthMat);
scene.add(earth);

// day/night city lights: separate night mesh with sun-direction masking
const nightUniforms = { map: { value: nightTex }, sunDir: { value: sunLight.position.clone().normalize() } };
const nightMat = new THREE.ShaderMaterial({
  uniforms: nightUniforms,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform vec3 sunDir;
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vec3 c = texture2D(map, vUv).rgb;
      float lum = dot(c, vec3(0.299,0.587,0.114));
      vec3 wn = normalize((modelMatrix * vec4(vNormal, 0.0)).xyz);
      float ndotsun = dot(wn, normalize(sunDir));
      float night = smoothstep(0.15, -0.3, ndotsun);
      gl_FragColor = vec4(c, lum * night * 1.6);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const nightMesh = new THREE.Mesh(new THREE.SphereGeometry(1.001, 96, 48), nightMat);
earth.add(nightMesh);

const cloudGeo = new THREE.SphereGeometry(1.012, 64, 32);
const cloudMat = new THREE.MeshPhongMaterial({
  map: cloudsTex,
  transparent: true,
  opacity: 0.3,
  depthWrite: false
});
const clouds = new THREE.Mesh(cloudGeo, cloudMat);
scene.add(clouds);

const atmGeo = new THREE.SphereGeometry(1.08, 64, 32);
const atmMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    void main() {
      float i = pow(0.62 - dot(vNormal, vec3(0.0,0.0,1.0)), 2.0);
      gl_FragColor = vec4(0.35, 0.65, 1.0, 1.0) * i * 0.9;
    }
  `,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  transparent: true,
  depthWrite: false
});
scene.add(new THREE.Mesh(atmGeo, atmMat));

const R = 1.015;
function latLonToVec3(lat, lon, radius = R) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

// shared marker resources
const cityMat = new THREE.MeshBasicMaterial({ color: 0x7bdcff });
const landmarkMat = new THREE.MeshBasicMaterial({ color: 0xff9f43 });
const cityRingMat = new THREE.MeshBasicMaterial({ color: 0x7bdcff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
const landmarkRingMat = new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
const markerGeoCity = new THREE.SphereGeometry(0.012, 12, 8);
const markerGeoLand = new THREE.SphereGeometry(0.015, 12, 8);
const ringGeo = new THREE.RingGeometry(0.016, 0.022, 16);

const markerMeshes = [];
const seenCoord = new Map();

for (const place of PLACES) {
  const geo = place.type === 'landmark' ? markerGeoLand : markerGeoCity;
  const mat = place.type === 'landmark' ? landmarkMat : cityMat;
  const rmat = place.type === 'landmark' ? landmarkRingMat : cityRingMat;

  // tiny offset for duplicate-ish coordinates to reduce z-fighting
  let lat = place.lat, lon = place.lon;
  const key = lat.toFixed(3) + ',' + lon.toFixed(3);
  const n = seenCoord.get(key) || 0;
  seenCoord.set(key, n + 1);
  if (n > 0) { lat += 0.018 * n; lon += 0.018 * n; }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(latLonToVec3(lat, lon));
  mesh.userData = { place };
  earth.add(mesh);

  const ring = new THREE.Mesh(ringGeo, rmat);
  ring.position.copy(mesh.position);
  ring.userData = { place };
  earth.add(ring);

  markerMeshes.push({ mesh, ring, place });
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pick(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const markerHits = raycaster.intersectObjects(markerMeshes.map(m => m.mesh), false);
  if (markerHits.length === 0) return null;
  const mHit = markerHits[0];
  const earthHits = raycaster.intersectObject(earth, false);
  if (earthHits.length && earthHits[0].distance < mHit.distance - 0.001) return null;
  return mHit.object.userData.place || null;
}

function handleHover(e) {
  const place = pick(e);
  if (place) {
    canvas.style.cursor = 'pointer';
    state.hovered = place;
    const cached = wikiCache.get(wikiCacheKey(state.lang, placeName(place, state.lang)))?.data;
    tooltip.textContent = cached?.title || placeName(place, state.lang);
    let left = e.clientX + 14;
    let top = e.clientY + 14;
    if (left + 240 > window.innerWidth) left = e.clientX - 240;
    if (top + 40 > window.innerHeight) top = e.clientY - 40;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.display = 'block';
  } else {
    canvas.style.cursor = 'grab';
    state.hovered = null;
    tooltip.style.display = 'none';
  }
}

// tooltip
const tooltip = document.createElement('div');
tooltip.className = 'tooltip';
tooltip.setAttribute('role', 'tooltip');
document.body.appendChild(tooltip);

// input tracking
canvas.addEventListener('pointerdown', (e) => {
  state.pointerDown = { x: e.clientX, y: e.clientY };
  state.moved = false;
});

canvas.addEventListener('pointermove', (e) => {
  if (state.pointerDown) {
    if (Math.hypot(e.clientX - state.pointerDown.x, e.clientY - state.pointerDown.y) > 6) {
      state.moved = true;
    }
  }
  state.lastHoverEvent = e;
  if (!state.hoverScheduled) {
    state.hoverScheduled = true;
    requestAnimationFrame(() => {
      state.hoverScheduled = false;
      if (state.lastHoverEvent) handleHover(state.lastHoverEvent);
    });
  }
});

canvas.addEventListener('pointerup', () => {
  // keep moved flag for the imminent click
});

// card logic
const card = document.getElementById('card');
const cardImage = document.getElementById('card-image');
const cardTitle = document.getElementById('card-title');
const cardMeta = document.getElementById('card-meta');
const cardDesc = document.getElementById('card-desc');
const cardType = document.getElementById('card-type');
const cardClose = document.getElementById('card-close');
const cardMaps = document.getElementById('card-maps');

function hideCard() {
  card.classList.add('hidden');
  state.selectedPlace = null;
  tooltip.style.display = 'none';
  try { canvas.focus(); } catch {}
}

function openMaps(place) {
  const url = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;
  window.open(url, '_blank', 'noopener');
}

function showCard(place) {
  state.selectedPlace = place;
  state.imageFallbackUsed = false;
  const name = placeName(place, state.lang);
  cardTitle.textContent = name;
  cardType.textContent = place.type === 'landmark' ? t(state.lang, 'landmarkType') : t(state.lang, 'cityType');
  cardMeta.textContent = `${t(state.lang, 'metaCoords')}: ${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`;
  cardDesc.textContent = t(state.lang, 'loading');
  cardImage.alt = name;
  cardImage.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  card.classList.remove('hidden');
  try { cardClose.focus(); } catch {}

  (async () => {
    const title = placeName(place, state.lang);
    const data = await fetchWiki(state.lang, title);
    if (state.selectedPlace !== place) return;
    if (data?.desc) cardDesc.textContent = data.desc;
    else cardDesc.textContent = t(state.lang, 'noDesc');
    if (data?.title) cardTitle.textContent = data.title;

    cardImage.onerror = () => {
      if (state.imageFallbackUsed) return;
      state.imageFallbackUsed = true;
      cardImage.onerror = null;
      cardImage.src = `https://picsum.photos/seed/${place.id}/640/360`;
    };
    if (data?.image) {
      cardImage.src = data.image;
    } else {
      cardImage.src = `https://picsum.photos/seed/${place.id}/640/360`;
    }
  })();
}

cardClose.addEventListener('click', hideCard);
cardMaps.addEventListener('click', () => {
  if (state.selectedPlace) openMaps(state.selectedPlace);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideCard();
});

canvas.addEventListener('click', (e) => {
  if (state.moved) {
    state.moved = false;
    state.pointerDown = null;
    return;
  }
  state.moved = false;
  const place = pick(e);
  if (!place) {
    state.pointerDown = null;
    return;
  }
  if (state.pendingClickTimer && state.pendingClickPlace === place) {
    clearTimeout(state.pendingClickTimer);
    state.pendingClickTimer = null;
    state.pendingClickPlace = null;
    openMaps(place);
  } else {
    if (state.pendingClickTimer) {
      clearTimeout(state.pendingClickTimer);
      state.pendingClickTimer = null;
      state.pendingClickPlace = null;
    }
    state.pendingClickPlace = place;
    state.pendingClickTimer = setTimeout(() => {
      const p = state.pendingClickPlace;
      state.pendingClickTimer = null;
      state.pendingClickPlace = null;
      if (p) showCard(p);
    }, 280);
  }
  state.pointerDown = null;
});

// language
const langSelect = document.getElementById('lang-select');
langSelect.value = state.lang;
langSelect.addEventListener('change', (e) => {
  state.lang = e.target.value;
  try { localStorage.setItem('lang', state.lang); } catch {}
  applyI18n();
  if (state.selectedPlace) {
    const p = state.selectedPlace;
    hideCard();
    showCard(p);
  }
  runSearch();
});

applyI18n();

// search
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

function runSearch() {
  if (!searchInput || !searchResults) return;
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { searchResults.classList.add('hidden'); return; }
  const matches = PLACES.filter(p => placeName(p, state.lang).toLowerCase().includes(q)).slice(0, 10);
  if (matches.length === 0) {
    searchResults.innerHTML = `<div class="search-item muted">${t(state.lang, 'noDesc').replace('.', '')}</div>`;
    searchResults.classList.remove('hidden');
    return;
  }
  searchResults.innerHTML = matches.map(p => `
    <button class="search-item" data-id="${p.id}">${placeName(p, state.lang)}
      <span class="search-type">${p.type === 'landmark' ? t(state.lang, 'landmarkType') : t(state.lang, 'cityType')}</span>
    </button>
  `).join('');
  searchResults.classList.remove('hidden');
  searchResults.querySelectorAll('.search-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const place = PLACES.find(x => x.id === id);
      if (place) showCard(place);
      searchResults.classList.add('hidden');
      searchInput.value = '';
    });
  });
}
if (searchInput) {
  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('focus', runSearch);
  document.addEventListener('click', (e) => {
    if (!searchResults.contains(e.target) && e.target !== searchInput) searchResults.classList.add('hidden');
  });
}

// resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// animate
function updateMarkerVisibility() {
  const camLocal = earth.worldToLocal(camera.position.clone()).normalize();
  for (const { mesh, ring } of markerMeshes) {
    const dir = mesh.position.clone().normalize();
    const visible = dir.dot(camLocal) > -0.05;
    mesh.visible = visible;
    ring.visible = visible;
  }
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  clouds.rotation.y += document.documentElement.dataset.reduceMotion === '1' ? 0 : 0.0006;
  earth.rotation.y += document.documentElement.dataset.reduceMotion === '1' ? 0 : 0.0002;
  for (const { ring } of markerMeshes) {
    ring.lookAt(camera.position);
  }
  updateMarkerVisibility();
  renderer.render(scene, camera);
}
animate();

// Background pre-warming disabled to avoid Wikipedia rate limits.
// Card data is fetched on demand with retries.