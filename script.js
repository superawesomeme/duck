/**
 * CONFIGURATION & DATA MANAGEMENT
 */
const CONFIG = {
    duckCount: 8,
    raceDistance: 800,
    targetDuration: 58,
    waterColor: 0x01579B,
    waterHighlight: 0x29B6F6,
};

// Colors for the 8 lanes
const COLORS = [
    0xF42941, // Red
    0xE9862A, // Orange
    0xF0F136, // Yellow
    0x50C878, // Green
    0x0033FF, // Blue
    0x6A2FA0, // Purple
    0x37474F, // Grey
    0xF3F5F7  // White
];

// App State
let storedRaces = [];
let currentRaceIndex = 0;
let gameSpeed = 1.0; 

// Flags for race progression
let isRacing = false;
let isCountingDown = false; // New state for countdown
let raceEnded = false;
let firstFinishTriggered = false; 
let winnerFinishTime = 0; // Timer for cinematic camera

// -- AUDIO SETUP --
const sfxRiver = new Audio('audio/river_looped.mp3');
sfxRiver.loop = true;
sfxRiver.volume = 0.6; 

const sfxStart = new Audio('audio/start.mp3');
sfxStart.volume = 1.0;

const sfxWinner = new Audio('audio/winner.mp3');
sfxWinner.volume = 1.0;

// --- GENERATED RACE AUDIO ENGINE (Countdown Synth) ---
class RaceAudio {
    constructor() {
        this.ctx = null;
        this.gain = null;
    }

    init() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AC();
            this.gain = this.ctx.createGain();
            this.gain.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    playTone(freq, type, duration, startTime = 0) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.value = freq;
        osc.connect(env);
        env.connect(this.gain);
        
        const now = this.ctx.currentTime + startTime;
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.2, now + 0.05);
        env.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        osc.start(now);
        osc.stop(now + duration + 0.1);
    }

    playCountdown(step) {
        this.init();
        if (step > 0) {
            this.playTone(440, 'triangle', 0.3); // Low Beep for 3, 2, 1
        }
    }
}
const raceAudio = new RaceAudio();

// Audio Fade Logic
let fadeInterval = null; 

function fadeOutAudio(audio, duration) {
    if(fadeInterval) clearInterval(fadeInterval);
    
    const startVolume = audio.volume;
    const stepTime = 50; 
    const steps = duration / stepTime;
    const stepAmount = startVolume / steps;
    
    fadeInterval = setInterval(() => {
        if (audio.volume > stepAmount) {
            audio.volume -= stepAmount;
        } else {
            audio.volume = 0;
            audio.pause();
            clearInterval(fadeInterval);
            fadeInterval = null;
        }
    }, stepTime);
}

// -- STORAGE LOGIC --
function loadRaceData() {
    const data = localStorage.getItem('duckRaceData_v2');
    if (data) {
        storedRaces = JSON.parse(data);
    } else {
        // Fallback to DEFAULT_RACES from data.js
        if (typeof DEFAULT_RACES !== 'undefined') {
            storedRaces = JSON.parse(JSON.stringify(DEFAULT_RACES));
        } else {
            console.error("DEFAULT_RACES not found. Check data.js loading.");
            storedRaces = [];
        }
    }
    populateRaceSelector();
    updateDuckPreview();
}

function saveRaceData() {
    localStorage.setItem('duckRaceData_v2', JSON.stringify(storedRaces));
}

function resetData() {
    if(confirm("Delete all custom races and reset to defaults?")) {
        localStorage.removeItem('duckRaceData_v2');
        loadRaceData();
        alert("Data reset.");
    }
}

// -- ABOUT INFO LOGIC --
function loadAboutInfo() {
    const container = document.getElementById('about-content-container');
    if (container && typeof APP_INFO !== 'undefined') {
        container.innerHTML = `
            <p><strong>${APP_INFO.title}</strong></p>
            <p>${APP_INFO.version}</p>
            <br>
            <p>${APP_INFO.description}</p>
            <br>
            <p style="color:#666; font-size: 0.9rem;">${APP_INFO.copyright}</p>
        `;
    }
}

/**
 * THREE.JS SETUP
 */
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// CARTOON SKY
scene.background = new THREE.Color(0x4FC3F7); 
scene.fog = new THREE.Fog(0x4FC3F7, 40, 300);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Lighting for Richness & Depth
const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x445566, 1.15 );
scene.add( hemiLight );

const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(50, 150, 50);
dirLight.castShadow = true;
dirLight.shadow.radius = 4; // Soft Shadows
dirLight.shadow.mapSize.width = 4096;
dirLight.shadow.mapSize.height = 4096;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 600;
dirLight.shadow.camera.left = -200;
dirLight.shadow.camera.right = 200;
dirLight.shadow.camera.top = 200;
dirLight.shadow.camera.bottom = -200;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// --- SUN FLARE (FAKE BLOOM) ---
const flareCanvas = document.createElement('canvas');
flareCanvas.width = 64; flareCanvas.height = 64;
const fCtx = flareCanvas.getContext('2d');
const grd = fCtx.createRadialGradient(32,32,0,32,32,32);
grd.addColorStop(0, 'rgba(255, 255, 255, 1)');
grd.addColorStop(0.2, 'rgba(255, 255, 200, 0.4)');
grd.addColorStop(1, 'rgba(255, 255, 255, 0)');
fCtx.fillStyle = grd; fCtx.fillRect(0,0,64,64);
const flareTex = new THREE.CanvasTexture(flareCanvas);
const flareMat = new THREE.SpriteMaterial({ map: flareTex, transparent: true, blending: THREE.AdditiveBlending });
const sunFlare = new THREE.Sprite(flareMat);
sunFlare.scale.set(80, 80, 1);
sunFlare.position.set(50, 150, 50); // Match DirLight pos
scene.add(sunFlare);

// GLOBAL TEXTURE LOADER
const textureLoader = new THREE.TextureLoader();

/**
 * SHADERS & MATERIALS
 */
const waterVertexShader = `
    uniform float time;
    varying vec2 vUv;
    varying float vElevation;
    #include <fog_pars_vertex>
    void main() {
        vUv = uv;
        vec3 newPos = position;
        float wave1 = sin(position.x * 0.1 + time * 0.5) * 0.5;
        float wave2 = sin(position.y * 0.15 + time * 0.7) * 0.5;
        float wave3 = sin(position.x * 0.4 + position.y * 0.2 + time * 2.0) * 0.15;
        float totalElevation = wave1 + wave2 + wave3;
        newPos.z += totalElevation;
        vElevation = totalElevation;
        vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
    }
`;

const waterFragmentShader = `
    uniform vec3 colorDeep;
    uniform vec3 colorSurface;
    varying float vElevation;
    #include <fog_pars_fragment>
    void main() {
        float mixStrength = (vElevation + 1.0) * 0.4;
        vec3 color = mix(colorDeep, colorSurface, mixStrength);
        float glitter = sin(vElevation * 20.0) * cos(vElevation * 15.0);
        float specular = step(0.9, glitter); 
        color += vec3(1.0) * specular * 0.4; // Increased glitter for Bloom look
        gl_FragColor = vec4(color, 0.95);
        #include <fog_fragment>
    }
`;

const waterMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib['fog'],
        {
            time: { value: 0 },
            colorDeep: { value: new THREE.Color(CONFIG.waterColor) },
            colorSurface: { value: new THREE.Color(CONFIG.waterHighlight) }
        }
    ]),
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    fog: true
});

const water = new THREE.Mesh(new THREE.PlaneGeometry(160, 4000, 100, 400), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.set(0, -0.5, CONFIG.raceDistance / 2);
scene.add(water);

// --- HELPER: Procedural Gradient Material (Robust Injection) ---
function setupGradientMaterial(material, colorBottomHex, colorTopHex, minY, maxY) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.cBottom = { value: new THREE.Color(colorBottomHex) };
        shader.uniforms.cTop = { value: new THREE.Color(colorTopHex) };
        
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
            varying float vLocalY;`
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vLocalY = position.y;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
            uniform vec3 cBottom;
            uniform vec3 cTop;
            varying float vLocalY;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            float gradientT = smoothstep(${minY.toFixed(1)}, ${maxY.toFixed(1)}, vLocalY);
            vec3 gradientColor = mix(cBottom, cTop, gradientT);
            diffuseColor.rgb *= gradientColor;`
        );
    };
    material.needsUpdate = true;
}

// --- HELPER: Procedural Concrete Texture ---
const concreteCanvas = document.createElement('canvas');
concreteCanvas.width = 128; concreteCanvas.height = 128;
const cCtx = concreteCanvas.getContext('2d');
cCtx.fillStyle = '#999999'; cCtx.fillRect(0,0,128,128);
for(let i=0; i<1000; i++) {
    cCtx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    cCtx.fillRect(Math.random()*128, Math.random()*128, 2, 2);
}
const concreteTex = new THREE.CanvasTexture(concreteCanvas);
concreteTex.wrapS = THREE.RepeatWrapping; concreteTex.wrapT = THREE.RepeatWrapping;

// -- BANKS (BLOCK STYLE) --
const landscapeGroup = new THREE.Group();
scene.add(landscapeGroup);

const mudTex = textureLoader.load('models/texture/mud.jpg');
mudTex.wrapS = THREE.RepeatWrapping; mudTex.wrapT = THREE.RepeatWrapping; mudTex.repeat.set(50, 1); 
const barkTex = textureLoader.load('models/texture/bark.jpg');

// Gradient Grass
const matTop = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.8, flatShading: false });
setupGradientMaterial(matTop, 0x7CB342, 0xDCEDC8, -15, 15);

const matSide = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, map: mudTex, roughness: 0.9, flatShading: false });
const bankMaterials = [ matSide, matSide, matTop, matSide, matSide, matSide ];

const bankHeight = 30; const surfaceLevel = 1; const centerY = surfaceLevel - (bankHeight / 2); 
const bankGeo = new THREE.BoxGeometry(320, bankHeight, CONFIG.raceDistance + 800); 

const leftBank = new THREE.Mesh(bankGeo, bankMaterials);
leftBank.position.set(-240, centerY, CONFIG.raceDistance / 2); leftBank.receiveShadow = true; landscapeGroup.add(leftBank);
const rightBank = new THREE.Mesh(bankGeo, bankMaterials);
rightBank.position.set(240, centerY, CONFIG.raceDistance / 2); rightBank.receiveShadow = true; landscapeGroup.add(rightBank);

/**
 * OBJECT GENERATION
 */
const trunkGeo = new THREE.CylinderGeometry(1.5, 2, 6, 8);
const trunkMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, map: barkTex, flatShading: true, roughness: 0.8 });

// Rounder Trees (Detail 1) with Gradient
const folGeo = new THREE.IcosahedronGeometry(7, 1);
const folMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, flatShading: false, roughness: 0.8 });
setupGradientMaterial(folMat, 0x43A047, 0xCDDC39, -4, 6);

function createCartoonTree(x, z) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3; trunk.castShadow = true; tree.add(trunk);
    const f1 = new THREE.Mesh(folGeo, folMat); f1.position.y = 9; f1.castShadow = true; tree.add(f1);
    const f2 = new THREE.Mesh(folGeo, folMat); f2.position.set(3, 7, 0); f2.scale.set(0.7,0.7,0.7); f2.castShadow = true; tree.add(f2);
    const f3 = new THREE.Mesh(folGeo, folMat); f3.position.set(-3, 8, 2); f3.scale.set(0.8,0.8,0.8); f3.castShadow = true; tree.add(f3);
    tree.position.set(x, 1, z);
    const s = 2.5 + Math.random() * 1.5; tree.scale.set(s,s,s); tree.rotation.y = Math.random() * Math.PI;
    return tree;
}

// Track Siding Logic (Textured Concrete)
function createTrackSiding(imagePath, x, z, side) {
    const group = new THREE.Group();
    const length = 55; height = 10; depth = 2;
    const baseGeo = new THREE.BoxGeometry(depth, height, length);
    
    // Concrete Texture
    const baseMat = new THREE.MeshStandardMaterial({ 
        map: concreteTex,
        roughness: 0.9,
        color: 0xAAAAAA 
    }); 
    
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = height / 2 - 1; base.castShadow = true; group.add(base);

    const tex = textureLoader.load(imagePath);
    const faceGeo = new THREE.PlaneGeometry(length - 2, height - 2);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const face = new THREE.Mesh(faceGeo, faceMat);
    
    const xOffset = (side === -1) ? (depth/2 + 0.1) : -(depth/2 + 0.1);
    const yRot = (side === -1) ? Math.PI / 2 : -Math.PI / 2;
    face.position.set(xOffset, height/2 - 1, 0); face.rotation.y = yRot;
    group.add(face);
    group.position.set(x, 2, z);
    return group;
}

// POPULATE WORLD
const adImages = ["images/sidings/1.jpg", "images/sidings/2.jpg", "images/sidings/3.jpg", "images/sidings/4.jpg"];
const sidingInterval = 60; 

for(let z = -105; z < CONFIG.raceDistance + 300; z += 15) {
    if (z > -50 && Math.abs(z % sidingInterval) < 0.1) {
        const img = adImages[Math.floor(Math.random() * adImages.length)];
        landscapeGroup.add(createTrackSiding(img, -85, z, -1));
        const img2 = adImages[Math.floor(Math.random() * adImages.length)];
        landscapeGroup.add(createTrackSiding(img2, 85, z, 1));
        continue; 
    }
    if(Math.random() > 0.2) landscapeGroup.add(createCartoonTree(-110 - Math.random()*150, z));
    if(Math.random() > 0.2) landscapeGroup.add(createCartoonTree(110 + Math.random()*150, z));
}

// Finish Line
const finishGroup = new THREE.Group();
const checkCanvas = document.createElement('canvas'); checkCanvas.width = 576; checkCanvas.height = 64;
const checkCtx = checkCanvas.getContext('2d');
checkCtx.fillStyle = '#111'; checkCtx.fillRect(0,0,576,64); checkCtx.fillStyle = '#fff';
for(let y=0; y<2; y++) for(let x=0; x<18; x++) if((x+y)%2 === 0) checkCtx.fillRect(x*32, y*32, 32, 32);
const checkTex = new THREE.CanvasTexture(checkCanvas); checkTex.magFilter = THREE.NearestFilter;
const fBanner = new THREE.Mesh(new THREE.BoxGeometry(72, 8, 2), new THREE.MeshStandardMaterial({map: checkTex}));
fBanner.position.set(0, 22, CONFIG.raceDistance); fBanner.castShadow = true;

// Bark Texture for Finish poles
const poleMat = new THREE.MeshStandardMaterial({ map: barkTex, color: 0xFFFFFF });
const p1 = new THREE.Mesh(new THREE.BoxGeometry(2, 25, 2), poleMat);
p1.position.set(-35, 12.5, CONFIG.raceDistance);
const p2 = p1.clone(); 
p2.position.set(35, 12.5, CONFIG.raceDistance);
finishGroup.add(p1, p2, fBanner); 
scene.add(finishGroup);

// Water Finish Line Strip
const finishLineGeo = new THREE.PlaneGeometry(160, 4);
const finishLineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
const finishLineStrip = new THREE.Mesh(finishLineGeo, finishLineMat);
finishLineStrip.rotation.x = -Math.PI / 2;
finishLineStrip.position.set(0, 0.05, CONFIG.raceDistance);
scene.add(finishLineStrip);

// Buoys
const buoyGeo = new THREE.SphereGeometry(1.5, 16, 16);
const buoyMat = new THREE.MeshStandardMaterial({ color: 0xFFA726, emissive: 0xFF6D00, emissiveIntensity: 0.8 });
for(let i=0; i<CONFIG.raceDistance; i+=50) {
    const b1 = new THREE.Mesh(buoyGeo, buoyMat); b1.position.set(-35, 0, i); scene.add(b1);
    const b2 = new THREE.Mesh(buoyGeo, buoyMat); b2.position.set(35, 0, i); scene.add(b2);
}

/**
 * WAKE EFFECT
 */
const wakeGroup = new THREE.Group();
scene.add(wakeGroup);
// FIX: depthWrite: false prevents the ring from "punching a hole" in the water
const wakeGeo = new THREE.RingGeometry(0.5, 1.2, 8);
const wakeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
let wakes = [];

function spawnWake(x, z, scale) {
    const wake = new THREE.Mesh(wakeGeo, wakeMat.clone());
    wake.position.set(x, 0.05, z); wake.rotation.x = -Math.PI / 2; wake.scale.set(scale, scale, 1);
    wakeGroup.add(wake); wakes.push({ mesh: wake, age: 0 });
}

function updateWakes(delta) {
    for (let i = wakes.length - 1; i >= 0; i--) {
        const w = wakes[i]; w.age += delta;
        const s = w.mesh.scale.x + delta * 2.0; w.mesh.scale.set(s, s, 1);
        w.mesh.material.opacity = 0.5 - (w.age * 0.5); 
        if (w.age > 1.0) { wakeGroup.remove(w.mesh); w.mesh.geometry.dispose(); wakes.splice(i, 1); }
    }
}

/**
 * DUCK MODEL & LOGIC
 */
let loadedDuckModel = null;
const loader = new THREE.GLTFLoader();
const dracoLoader = new THREE.DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
loader.setDRACOLoader(dracoLoader);

loader.load('models/duck.glb', (gltf) => {
    loadedDuckModel = gltf.scene;
    loadedDuckModel.scale.set(20, 20, 20);
    loadedDuckModel.traverse(n => { if(n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    activateStartButton();
}, undefined, () => activateStartButton());

function activateStartButton() {
    document.getElementById('start-btn').disabled = false;
    document.getElementById('start-btn').style.cursor = "pointer";
    initDucks(); 
}

class Duck {
    constructor(id, name, startX) {
        this.id = id;
        this.name = name;
        this.color = COLORS[id % COLORS.length];
        this.mesh = new THREE.Group();
        this.position = new THREE.Vector3(startX, 0, 0);
        this.baseSpeed = (CONFIG.raceDistance / CONFIG.targetDuration);
        this.wobblePhase = Math.random() * Math.PI * 2;
        this.finished = false;
        this.finishTime = 0;
        this.aggressiveness = Math.random(); 
        this.energyCycle = Math.random() * 10;
        this.wakeTimer = 0;
        
        this.buildModel();
        this.addNameLabel();
        
        // Update mesh position immediately for countdown visibility
        this.mesh.position.copy(this.position);
        
        scene.add(this.mesh);
    }

    addNameLabel() {
        const w = 512, h = 128;
        const cvs = document.createElement('canvas'); cvs.width = w; cvs.height = h;
        const ctx = cvs.getContext('2d');
        const mainColor = '#' + this.color.toString(16).padStart(6, '0');

        ctx.beginPath(); ctx.moveTo(30,0); ctx.lineTo(w,0); ctx.lineTo(w-30,h); ctx.lineTo(0,h);
        ctx.fillStyle = "rgba(10, 14, 23, 0.85)"; ctx.fill();
        ctx.beginPath(); ctx.moveTo(30,0); ctx.lineTo(60,0); ctx.lineTo(30,h); ctx.lineTo(0,h);
        ctx.fillStyle = mainColor; ctx.fill();

        ctx.fillStyle = "#ffffff"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.shadowColor="rgba(0,0,0,0.8)"; ctx.shadowBlur=4;
        ctx.font = "bold 70px 'Rajdhani'";
        ctx.fillText(`#${this.id + 1}`, 80, h/2);
        
        const nameStr = this.name.toUpperCase();
        let fontSize = 60;
        ctx.font = `${fontSize}px 'Rajdhani'`;
        const maxTextW = 290;
        while (ctx.measureText(nameStr).width > maxTextW && fontSize > 20) {
            fontSize -= 2;
            ctx.font = `${fontSize}px 'Rajdhani'`;
        }
        ctx.fillText(nameStr, 190, h/2);

        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(cvs), depthWrite: false, depthTest: true}));
        sprite.position.set(0, 7.5, 0); sprite.scale.set(10, 2.5, 1);
        sprite.frustumCulled = false; 
        sprite.renderOrder = 100;     
        this.mesh.add(sprite);
    }

    buildModel() {
        const textureFiles = ["red.png", "orange.png", "yellow.png", "green.png", "blue.png", "purple.png", "grey.png", "white.png"];
        if(loadedDuckModel) {
            const m = loadedDuckModel.clone();
            m.traverse(n => {
                if(n.isMesh) {
                    n.material = n.material.clone();
                    const texName = textureFiles[this.id];
                    const tex = textureLoader.load(`models/texture/${texName}`);
                    tex.flipY = false; 
                    n.material.map = tex;
                    n.material.color.setHex(0xFFFFFF); 
                    n.material.roughness = 0.1;
                }
            });
            this.mesh.add(m);
        } else {
            const texName = textureFiles[this.id];
            const mat = new THREE.MeshStandardMaterial({
                color: 0xFFFFFF, roughness: 0.2, map: textureLoader.load(`models/texture/${texName}`)
            });
            const body = new THREE.Mesh(new THREE.SphereGeometry(1.1,16,16), mat);
            body.scale.set(1, 0.7, 1.4); body.position.y = 0.7; body.castShadow = true;
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.75,16,16), mat);
            head.position.set(0, 1.8, 0.7); head.castShadow = true;
            const beak = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5), new THREE.MeshStandardMaterial({color:0xFFAA00}));
            beak.rotation.x = 1.5; beak.position.set(0, 1.7, 1.4);
            this.mesh.add(body, head, beak);
        }
    }

    update(delta, time) {
        if (!this.finished) {
            const energy = Math.sin(time * 0.5 + this.energyCycle); 
            let targetSpeed = this.baseSpeed;
            if (energy > 0.5) targetSpeed *= 1.2 + (this.aggressiveness * 0.2); 
            else if (energy < -0.5) targetSpeed *= 0.85; 
            targetSpeed += (Math.random() - 0.5) * 2.0;

            const distRemaining = CONFIG.raceDistance - this.position.z;
            if (distRemaining < 100 && distRemaining > 0) targetSpeed *= 1.1;

            this.position.z += targetSpeed * delta;

            if (this.position.x > 25) this.position.x -= 5 * delta;
            else if (this.position.x < -25) this.position.x += 5 * delta;
            else this.position.x += Math.sin(time + this.id * 10) * 2 * delta;
        }

        this.mesh.position.x = this.position.x;
        this.mesh.position.z = this.position.z;
        
        if (this.finished) {
            this.mesh.position.y = Math.sin(time * 3 + this.wobblePhase) * 0.2;
            this.mesh.rotation.x = 0;
            this.mesh.rotation.z = Math.sin(time * 3 + this.wobblePhase) * 0.05; 
        } else {
            this.mesh.position.y = Math.sin(time * 5 + this.wobblePhase) * 0.2; 
            this.mesh.rotation.z = Math.sin(time * 8 + this.wobblePhase) * 0.15; 
            this.mesh.rotation.y = Math.sin(time * 2 + this.wobblePhase) * 0.1;
            
            this.wakeTimer += delta;
            if(this.wakeTimer > 0.15) { 
                spawnWake(this.position.x, this.position.z - 1.5, 0.5 + Math.random()*0.5);
                this.wakeTimer = 0;
            }
        }
    }
}

/**
 * GAME STATE
 */
let ducks = [];

function initDucks() {
    ducks.forEach(d => scene.remove(d.mesh));
    ducks = [];
    wakes.forEach(w => { wakeGroup.remove(w.mesh); });
    wakes = [];
    
    const raceConfig = storedRaces[currentRaceIndex] || (typeof DEFAULT_RACES !== 'undefined' ? DEFAULT_RACES[0] : null);
    if (!raceConfig) return;

    const names = raceConfig.ducks || [];
    const headerTitle = document.getElementById('header-race-name');
    if(headerTitle) headerTitle.innerText = raceConfig.name.toUpperCase();

    const spacing = 5;
    const leftBound = -(CONFIG.duckCount * spacing) / 2;

    for (let i = 0; i < CONFIG.duckCount; i++) {
        const x = leftBound + (i * spacing) + (Math.random() * 2);
        const name = names[i % names.length] || `Duck ${i+1}`;
        ducks.push(new Duck(i, name, x));
    }
}

/**
 * FIREWORKS SYSTEM
 */
const fxCanvas = document.getElementById('fireworks-canvas');
const fxCtx = fxCanvas ? fxCanvas.getContext('2d') : null;
if (fxCanvas) {
    fxCanvas.style.zIndex = "9999"; 
}

let fireworks = [];
let particles = [];
let doFireworks = false;
let winnerColor = '#ffffff';

function resizeCanvas() {
    if(fxCanvas) {
        fxCanvas.width = window.innerWidth;
        fxCanvas.height = window.innerHeight;
    }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

class Firework {
    constructor(targetY, color) {
        this.x = Math.random() * fxCanvas.width;
        this.y = fxCanvas.height;
        this.targetY = targetY;
        this.color = color;
        this.speed = 10 + Math.random() * 5;
        this.angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
        this.dead = false;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.05; 
        if(this.vy >= 0 || this.y <= this.targetY) {
            this.dead = true;
            explode(this.x, this.y, this.color);
        }
    }
    draw() {
        fxCtx.beginPath();
        fxCtx.arc(this.x, this.y, 3, 0, Math.PI*2);
        fxCtx.fillStyle = this.color;
        fxCtx.fill();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.alpha = 1;
        this.decay = 0.01 + Math.random() * 0.02;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1; 
        this.alpha -= this.decay;
    }
    draw() {
        fxCtx.save();
        fxCtx.globalAlpha = this.alpha;
        fxCtx.beginPath();
        fxCtx.arc(this.x, this.y, 2, 0, Math.PI*2);
        fxCtx.fillStyle = this.color;
        fxCtx.fill();
        fxCtx.restore();
    }
}

function explode(x, y, color) {
    for(let i=0; i<80; i++) particles.push(new Particle(x, y, color));
    for(let i=0; i<20; i++) particles.push(new Particle(x, y, '#ffffff')); 
}

function updateFireworks() {
    if(!fxCtx) return;
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

    if (doFireworks && Math.random() < 0.25) { 
        fireworks.push(new Firework(100 + Math.random() * (fxCanvas.height/2), winnerColor));
    }

    for (let i = fireworks.length - 1; i >= 0; i--) {
        fireworks[i].update();
        fireworks[i].draw();
        if (fireworks[i].dead) fireworks.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].alpha <= 0) particles.splice(i, 1);
    }
}

function startFireworks(hexColor) {
    winnerColor = '#' + hexColor.toString(16).padStart(6,'0');
    doFireworks = true;
}

function stopFireworks() {
    doFireworks = false;
    fireworks = [];
    particles = [];
    if(fxCtx) fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
}

/**
 * UI & INTERACTION
 */
// COUNTDOWN OVERLAY
const cdDiv = document.createElement('div');
cdDiv.id = 'countdown-overlay';
cdDiv.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    display: none; align-items: center; justify-content: center;
    z-index: 9000; pointer-events: none;
`;
document.body.appendChild(cdDiv);

const startScreen = document.getElementById('start-screen');
const endScreen = document.getElementById('end-screen');
const lbContent = document.getElementById('lb-content');
const winnerText = document.getElementById('winner-text');
const progressFill = document.getElementById('progress-fill');
const speedEl = document.getElementById('speed-stat');
const raceSelect = document.getElementById('race-select');
const duckPreview = document.getElementById('duck-preview');

const aboutBtn = document.getElementById('about-btn');
const aboutModal = document.getElementById('about-modal');
const closeAboutBtn = document.getElementById('close-about-btn');

const manageBtn = document.getElementById('manage-btn');
const configModal = document.getElementById('config-modal');
const cancelConfigBtn = document.getElementById('cancel-config-btn');
const saveConfigBtn = document.getElementById('save-config-btn');
const resetDataBtn = document.getElementById('reset-data-btn');

function populateRaceSelector() {
    raceSelect.innerHTML = '';
    storedRaces.forEach((race, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.innerText = race.name;
        if(index === currentRaceIndex) opt.selected = true;
        raceSelect.appendChild(opt);
    });
}

function updateDuckPreview() {
    const raceConfig = storedRaces[currentRaceIndex] || (typeof DEFAULT_RACES !== 'undefined' ? DEFAULT_RACES[0] : null);
    if (!raceConfig) return;
    
    const names = raceConfig.ducks || [];
    let html = '';
    for(let i=0; i<8; i++) {
        const color = COLORS[i];
        const r=(color>>16)&255, g=(color>>8)&255, b=color&255;
        const txtCol = (((r*299)+(g*587)+(b*114))/1000) >= 128 ? '#000' : '#fff';
        const hex = '#' + color.toString(16).padStart(6,'0');
        const name = names[i] || `Duck ${i+1}`;
        html += `<div class="preview-item"><div class="preview-num" style="background:${hex}; color:${txtCol};">${i+1}</div><div class="preview-name">${name}</div></div>`;
    }
    duckPreview.innerHTML = html;
}

raceSelect.addEventListener('change', (e) => {
    currentRaceIndex = parseInt(e.target.value);
    updateDuckPreview();
    initDucks();
});

if(aboutBtn && aboutModal && closeAboutBtn) {
    aboutBtn.addEventListener('click', () => {
        aboutModal.classList.remove('hidden');
    });

    closeAboutBtn.addEventListener('click', () => {
        aboutModal.classList.add('hidden');
    });
}

manageBtn.addEventListener('click', () => {
    configModal.classList.remove('hidden');
    for(let i=0; i<8; i++) document.getElementById(`p-name-${i}`).value = "";
    document.getElementById('new-race-name').value = "";
});

cancelConfigBtn.addEventListener('click', () => configModal.classList.add('hidden'));

saveConfigBtn.addEventListener('click', () => {
    const rName = document.getElementById('new-race-name').value.trim() || "Untitled Race";
    const dNames = [];
    for(let i=0; i<8; i++) {
        const val = document.getElementById(`p-name-${i}`).value.trim();
        dNames.push(val || `Duck ${i+1}`);
    }
    const newRace = { id: "custom_" + Date.now(), name: rName, ducks: dNames };
    storedRaces.push(newRace);
    saveRaceData();
    currentRaceIndex = storedRaces.length - 1; 
    populateRaceSelector();
    updateDuckPreview();
    initDucks();
    configModal.classList.add('hidden');
});

resetDataBtn.addEventListener('click', () => {
    resetData();
    configModal.classList.add('hidden');
});

// START BUTTON - Updated for Countdown
document.getElementById('start-btn').addEventListener('click', () => {
    startScreen.classList.add('hidden');
    
    // Position Camera for Start
    camera.position.set(0, 15, -30);
    camera.lookAt(0, 0, 50);
    
    firstFinishTriggered = false; 
    raceEnded = false;
    isRacing = false;
    isCountingDown = true;

    raceAudio.init();
    
    if(fadeInterval) clearInterval(fadeInterval);
    sfxRiver.currentTime = 0;
    sfxRiver.volume = 0.6; 
    sfxRiver.play().catch(e => console.warn("River sound failed:", e));
    
    runCountdownSequence();
});

function runCountdownSequence() {
    const cd = document.getElementById('countdown-overlay');
    cd.innerHTML = '';
    cd.style.display = 'flex';
    
    let count = 3;
    
    const showNum = (num, color) => {
        cd.innerHTML = `<div style="
            background: rgba(0, 14, 23, 0.7);
            padding: 20px 60px;
            transform: skewX(-15deg);
            border-left: 8px solid ${color};
            display: inline-block;
            box-shadow: 0 5px 25px rgba(0,0,0,0.5);
        ">
            <span style="
                font-family: 'Rajdhani', sans-serif;
                font-weight: 800;
                font-size: 200px;
                font-style: italic;
                color: ${color};
                display: block;
                transform: skewX(15deg);
            ">${num}</span>
        </div>`;
    };

    const timer = setInterval(() => {
        if(count > 0) {
            showNum(count, '#ED0778'); // hot pink
            raceAudio.playCountdown(count);
            count--;
        } else {
            clearInterval(timer);
            // On GO: No visual word, start the original sound
            cd.innerHTML = "";
            cd.style.display = 'none';
            
            sfxStart.currentTime = 0;
            sfxStart.play().catch(e => console.warn(e));
            
            isCountingDown = false;
            isRacing = true;
        }
    }, 1000);
}

document.getElementById('restart-btn').addEventListener('click', () => {
    endScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    
    if(fadeInterval) {
        clearInterval(fadeInterval);
        fadeInterval = null;
    }
    sfxRiver.pause(); sfxRiver.currentTime = 0; sfxRiver.volume = 0.6; 
    sfxWinner.pause(); sfxWinner.currentTime = 0;
    
    stopFireworks();

    currentRaceIndex = (currentRaceIndex + 1) % storedRaces.length;
    populateRaceSelector(); 
    updateDuckPreview(); 
    isRacing = false;
    raceEnded = false;
    isCountingDown = false;
    firstFinishTriggered = false; 
    
    progressFill.style.width = "0%";
    if (speedEl) speedEl.innerText = "0";
    camera.position.set(0, 15, -30);
    camera.lookAt(0, 0, 50);
    initDucks();
});

loadRaceData();
loadAboutInfo();

/**
 * MAIN LOOP
 */
const clock = new THREE.Clock();
let camAngle = 0, camTimer = 0;
let cameraLookAt = new THREE.Vector3(0,0,50); 
let cinematicTarget = new THREE.Vector3();
let cinematicLook = new THREE.Vector3();

function updateCamera(time, delta, leadDuck, packCenterZ) {
    if (time > camTimer + 10) { camTimer = time; camAngle = (camAngle + 1) % 3; }
    let target = cinematicTarget, look = cinematicLook; 
    
    if (firstFinishTriggered) {
        const winner = ducks[0]; // Leader is winner
        const t = time - winnerFinishTime;

        // Cinematic movement
        const dist = 15 + (t * 5.0); 
        const height = 6 + (t * 3.0);
        const angle = -0.2 + (t * 0.2);

        target.set(
            winner.position.x + Math.sin(angle) * dist,
            height,
            winner.position.z + Math.cos(angle) * dist
        );
        
        look.copy(winner.position).add(new THREE.Vector3(0, 2, 0));

    } else if (!isRacing) {
        // Countdown / Pre-race position
        target.set(0, 20, -35); look.set(0, 0, 10);
    } else {
        // Normal race cam
        if (camAngle === 0) { target.set(leadDuck.position.x, 8, leadDuck.position.z - 15); look.set(leadDuck.position.x, 2, leadDuck.position.z + 20); } 
        else if (camAngle === 1) { target.set(25, 20, packCenterZ - 15); look.set(0, 0, packCenterZ + 40); } 
        else { target.set(-28, 8, leadDuck.position.z + 5); look.set(leadDuck.position.x, 2, leadDuck.position.z + 10); }
    }
    
    camera.position.lerp(target, 4.0 * delta); 
    cameraLookAt.lerp(look, 4.0 * delta);
    camera.lookAt(cameraLookAt);
}

function updateUI(leadDuck, sortedDucks, time) {
    if(isRacing && !raceEnded && speedEl) {
        speedEl.innerText = Math.floor(leadDuck.baseSpeed * 2 + (Math.sin(time * 10) * 5));
    }
    let html = '';
    for(let i=0; i<sortedDucks.length; i++) {
        const d = sortedDucks[i];
        const distText = d.finished ? `<span style="color:#ED0778">FINISHED</span>` : (i === 0 ? 'LEADER' : `+${Math.floor(leadDuck.position.z - d.position.z)}m`);
        const rowClass = i === 0 ? 'lb-row leader' : 'lb-row';
        const hexColor = '#' + d.color.toString(16).padStart(6,'0');
        const r=(d.color>>16)&255, g=(d.color>>8)&255, b=d.color&255;
        const txtCol = (((r*299)+(g*587)+(b*114))/1000) >= 128 ? '#000' : '#fff';
        
        let nameTextColor = hexColor;
        if(d.id === 5) nameTextColor = '#D69EFC'; 
        if(d.id === 6) nameTextColor = '#B0BEC5'; 

        html += `
        <div class="${rowClass}">
            <div class="lb-rank" style="background: ${hexColor}; color: ${txtCol}">${d.id + 1}</div>
            <div class="lb-info-container">
                <span class="lb-name" style="color: ${nameTextColor}">${d.name}</span>
                <span class="lb-dist">${distText}</span>
            </div>
        </div>`;
    }
    lbContent.innerHTML = html;
    progressFill.style.width = Math.min((leadDuck.position.z / CONFIG.raceDistance) * 100, 100) + '%';
}

function animate() {
    requestAnimationFrame(animate);
    const deltaReal = clock.getDelta();
    const delta = deltaReal * gameSpeed;
    const time = clock.getElapsedTime();
    
    water.material.uniforms.time.value = time;
    
    const flashIntensity = (Math.sin(time * 3) + 1) * 0.5; 
    buoyMat.emissiveIntensity = 0.2 + (flashIntensity * 0.8);

    if(isRacing) updateWakes(delta);
    
    updateFireworks();

    let leadDuck = ducks[0], totalZ = 0;
    if (isRacing) {
        
        ducks.forEach(d => {
            d.update(delta, time); totalZ += d.position.z;
            if (!d.finished && d.position.z >= CONFIG.raceDistance) { d.finished = true; d.finishTime = time; }
        });
        
        for(let i=0;i<ducks.length;i++) for(let j=i+1;j<ducks.length;j++) {
             const d1=ducks[i], d2=ducks[j];
             const dx=d1.position.x-d2.position.x, dz=d1.position.z-d2.position.z;
             const distSq=dx*dx+dz*dz;
             if(distSq < 23.0) {
                 const dist=Math.sqrt(distSq);
                 if(dist < 0.001) { d1.position.x += 0.1; continue; }
                 const overlap = 4.8 - dist;
                 const push = overlap * 0.6; 
                 const nx=dx/dist, nz=dz/dist;
                 d1.position.x+=nx*push; d1.position.z+=nz*push;
                 d2.position.x-=nx*push; d2.position.z-=nz*push;
             }
        }

        ducks.sort((a,b) => (a.finished&&b.finished)?a.finishTime-b.finishTime : (a.finished?-1 : (b.finished?1 : b.position.z-a.position.z)));
        leadDuck = ducks[0];

        // --- 1. FIRST FINISH LOGIC (Cinematic Trigger) ---
        if (!firstFinishTriggered && ducks.some(d => d.finished)) {
            firstFinishTriggered = true;
            winnerFinishTime = time;
            
            sfxWinner.currentTime = 0;
            sfxWinner.play().catch(e => console.warn(e));
            
            startFireworks(leadDuck.color);
        }

        // --- 2. LAST FINISH LOGIC (Trigger Menu) ---
        if (ducks.every(d => d.finished) && !raceEnded) {
            raceEnded = true;
            
            const trueWinner = ducks.reduce((prev, curr) => (prev.finishTime < curr.finishTime) ? prev : curr);
            
            winnerText.innerText = `WINNER: #${trueWinner.id + 1} ${trueWinner.name.toUpperCase()}!`;
            
            let winnerTextColor = '#' + trueWinner.color.toString(16).padStart(6,'0');
            if (trueWinner.id === 5) winnerTextColor = '#D69EFC'; 
            if (trueWinner.id === 6) winnerTextColor = '#B0BEC5'; 
            
            winnerText.style.color = winnerTextColor;
            setTimeout(() => { endScreen.classList.remove('hidden'); }, 2000);
            
            fadeOutAudio(sfxRiver, 4000); 
        }
    }
    
    if(leadDuck) {
        updateCamera(time, deltaReal, leadDuck, (ducks.length>0 ? totalZ/ducks.length : 0));
        updateUI(leadDuck, ducks, time);
    }
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeCanvas(); 
});

animate();
