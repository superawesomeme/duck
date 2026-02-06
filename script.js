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
    0xE65100, // Orange (Darker)
    0xF0F136, // Yellow
    0x50C878, // Green
    0x0033FF, // Blue
    0x6A2FA0, // Purple
    0x37474F, // Grey (Darker)
    0xF3F5F7  // White
];

// App State
let storedRaces = [];
let currentRaceIndex = 0;

// -- STORAGE LOGIC --
function loadRaceData() {
    const data = localStorage.getItem('duckRaceData_v2');
    if (data) {
        storedRaces = JSON.parse(data);
    } else {
        storedRaces = JSON.parse(JSON.stringify(DEFAULT_RACES));
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

const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x080820, 1.1 );
scene.add( hemiLight );

const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(50, 150, 50);
dirLight.castShadow = true;
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
        color += vec3(1.0) * specular * 0.2;
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

// Banks
const landscapeGroup = new THREE.Group();
scene.add(landscapeGroup);
const grassMat = new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 1, flatShading: true });
const bankGeo = new THREE.PlaneGeometry(500, 4000, 20, 100);
const posAttribute = bankGeo.attributes.position;
for (let i = 0; i < posAttribute.count; i++) posAttribute.setZ(i, posAttribute.getZ(i) + Math.random() * 3);
bankGeo.computeVertexNormals();

const leftBank = new THREE.Mesh(bankGeo, grassMat);
leftBank.rotation.x = -Math.PI / 2;
leftBank.position.set(-330, -1.5, CONFIG.raceDistance / 2);
leftBank.receiveShadow = true;
landscapeGroup.add(leftBank);

const rightBank = new THREE.Mesh(bankGeo.clone(), grassMat);
rightBank.rotation.x = -Math.PI / 2;
rightBank.position.set(330, -1.5, CONFIG.raceDistance / 2);
rightBank.receiveShadow = true;
landscapeGroup.add(rightBank);

/**
 * OBJECT GENERATION
 */
const trunkGeo = new THREE.CylinderGeometry(1.5, 2, 6, 8);
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, flatShading: true });
const folGeo = new THREE.IcosahedronGeometry(7, 0);
const folMat = new THREE.MeshStandardMaterial({ color: 0x388E3C, flatShading: true });

function createCartoonTree(x, z) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3; trunk.castShadow = true; tree.add(trunk);
    
    const f1 = new THREE.Mesh(folGeo, folMat); f1.position.y = 9; f1.castShadow = true; tree.add(f1);
    const f2 = new THREE.Mesh(folGeo, folMat); f2.position.set(3, 7, 0); f2.scale.set(0.7,0.7,0.7); f2.castShadow = true; tree.add(f2);
    const f3 = new THREE.Mesh(folGeo, folMat); f3.position.set(-3, 8, 2); f3.scale.set(0.8,0.8,0.8); f3.castShadow = true; tree.add(f3);
    
    tree.position.set(x, 0, z);
    const s = 2.5 + Math.random() * 1.5; 
    tree.scale.set(s,s,s);
    tree.rotation.y = Math.random() * Math.PI;
    return tree;
}

// Track Siding Logic
const textureLoader = new THREE.TextureLoader();

function createTrackSiding(imagePath, x, z, side) {
    const group = new THREE.Group();
    
    // Concrete Base
    const length = 55; 
    const height = 10; 
    const depth = 2;
    
    const baseGeo = new THREE.BoxGeometry(depth, height, length);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x999999 }); 
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = height / 2 - 1; 
    base.castShadow = true;
    group.add(base);

    // Ad Face
    const tex = textureLoader.load(imagePath); // Load image from path
    const faceGeo = new THREE.PlaneGeometry(length - 2, height - 2);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const face = new THREE.Mesh(faceGeo, faceMat);
    
    const xOffset = (side === -1) ? (depth/2 + 0.1) : -(depth/2 + 0.1);
    const yRot = (side === -1) ? Math.PI / 2 : -Math.PI / 2;
    
    face.position.set(xOffset, height/2 - 1, 0);
    face.rotation.y = yRot;
    
    group.add(face);
    group.position.set(x, 0, z);
    return group;
}

// POPULATE WORLD
const adImages = [
    "images/sidings/1.jpg", 
    "images/sidings/2.jpg", 
    "images/sidings/3.jpg", 
    "images/sidings/4.jpg"
];
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
const p1 = new THREE.Mesh(new THREE.BoxGeometry(2, 25, 2), new THREE.MeshStandardMaterial({color: 0x5D4037})); p1.position.set(-35, 12.5, CONFIG.raceDistance);
const p2 = p1.clone(); p2.position.set(35, 12.5, CONFIG.raceDistance);
finishGroup.add(p1, p2, fBanner); scene.add(finishGroup);

// Buoys
const buoyGeo = new THREE.SphereGeometry(1.5, 16, 16);
const buoyMat = new THREE.MeshStandardMaterial({color: 0xFF3D00});
for(let i=0; i<CONFIG.raceDistance; i+=50) {
    const b1 = new THREE.Mesh(buoyGeo, buoyMat); b1.position.set(-35, 0, i); scene.add(b1);
    const b2 = new THREE.Mesh(buoyGeo, buoyMat); b2.position.set(35, 0, i); scene.add(b2);
}

/**
 * WAKE EFFECT
 */
const wakeGroup = new THREE.Group();
scene.add(wakeGroup);
const wakeGeo = new THREE.RingGeometry(0.5, 1.2, 8);
const wakeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
let wakes = [];

function spawnWake(x, z, scale) {
    const wake = new THREE.Mesh(wakeGeo, wakeMat.clone());
    wake.position.set(x, 0.05, z);
    wake.rotation.x = -Math.PI / 2;
    wake.scale.set(scale, scale, 1);
    wakeGroup.add(wake);
    wakes.push({ mesh: wake, age: 0 });
}

function updateWakes(delta) {
    for (let i = wakes.length - 1; i >= 0; i--) {
        const w = wakes[i];
        w.age += delta;
        const s = w.mesh.scale.x + delta * 2.0;
        w.mesh.scale.set(s, s, 1);
        w.mesh.material.opacity = 0.5 - (w.age * 0.5); 
        if (w.age > 1.0) {
            wakeGroup.remove(w.mesh);
            w.mesh.geometry.dispose(); 
            wakes.splice(i, 1);
        }
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
        this.mesh.add(sprite);
    }

    buildModel() {
        if(loadedDuckModel) {
            const m = loadedDuckModel.clone();
            m.traverse(n => {
                if(n.isMesh) {
                    n.material = n.material.clone();
                    n.material.color.setHex(this.color);
                    n.material.map = null; 
                    n.material.roughness = 0.1;
                }
            });
            this.mesh.add(m);
        } else {
            const mat = new THREE.MeshStandardMaterial({color: this.color, roughness: 0.2});
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
        if (this.finished) {
            this.mesh.position.y = Math.sin(time * 3 + this.wobblePhase) * 0.2;
            return;
        }
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

        this.mesh.position.copy(this.position);
        this.mesh.position.y = Math.sin(time * 5 + this.wobblePhase) * 0.2; 
        this.mesh.rotation.z = Math.sin(time * 8 + this.wobblePhase) * 0.15; 
        this.mesh.rotation.y = Math.sin(time * 2 + this.wobblePhase) * 0.1;
        
        // Spawn Wake
        this.wakeTimer += delta;
        if(this.wakeTimer > 0.15) { // Spawn every 0.15s
            spawnWake(this.position.x, this.position.z - 1.5, 0.5 + Math.random()*0.5);
            this.wakeTimer = 0;
        }
    }
}

/**
 * GAME STATE
 */
let ducks = [];
let isRacing = false;
let raceStartTime = 0;
let raceEnded = false;

function initDucks() {
    ducks.forEach(d => scene.remove(d.mesh));
    ducks = [];
    wakes.forEach(w => { wakeGroup.remove(w.mesh); });
    wakes = [];
    
    const raceConfig = storedRaces[currentRaceIndex] || DEFAULT_RACES[0];
    const names = raceConfig.ducks;
    
    const headerTitle = document.getElementById('header-race-name');
    if(headerTitle) headerTitle.innerText = raceConfig.name.toUpperCase();

    const spacing = 5;
    const leftBound = -(CONFIG.duckCount * spacing) / 2;

    for (let i = 0; i < CONFIG.duckCount; i++) {
        const x = leftBound + (i * spacing) + (Math.random() * 2);
        ducks.push(new Duck(i, names[i % names.length], x));
    }
}

/**
 * UI & INTERACTION
 */
const startScreen = document.getElementById('start-screen');
const endScreen = document.getElementById('end-screen');
const lbContent = document.getElementById('lb-content');
const winnerText = document.getElementById('winner-text');
const progressFill = document.getElementById('progress-fill');
const speedEl = document.getElementById('speed-stat');
const raceSelect = document.getElementById('race-select');
const duckPreview = document.getElementById('duck-preview');

// NEW: Button Elements
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
    const raceConfig = storedRaces[currentRaceIndex] || DEFAULT_RACES[0];
    const names = raceConfig.ducks;
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

// ABOUT BUTTON LOGIC
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

document.getElementById('start-btn').addEventListener('click', () => {
    startScreen.classList.add('hidden');
    isRacing = true;
    raceStartTime = performance.now();
    raceEnded = false;
});

document.getElementById('restart-btn').addEventListener('click', () => {
    endScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    currentRaceIndex = (currentRaceIndex + 1) % storedRaces.length;
    populateRaceSelector(); 
    updateDuckPreview(); 
    isRacing = false;
    raceEnded = false;
    progressFill.style.width = "0%";
    if (speedEl) speedEl.innerText = "0";
    camera.position.set(0, 15, -30);
    camera.lookAt(0, 0, 50);
    document.querySelectorAll('.confetti').forEach(e => e.remove());
    initDucks();
});

// LOAD DATA ON INIT
loadRaceData();
loadAboutInfo();

/**
 * MAIN LOOP
 */
const clock = new THREE.Clock();
let camAngle = 0, camTimer = 0;

function updateCamera(time, leadDuck, packCenterZ) {
    if (time > camTimer + 10) { camTimer = time; camAngle = (camAngle + 1) % 3; }
    let target = new THREE.Vector3(), look = new THREE.Vector3();
    
    if (raceEnded) {
        const winner = ducks.find(d => d.finishTime > 0) || leadDuck;
        const a = time * 0.4;
        target.set(winner.position.x + Math.sin(a)*12, 6, winner.position.z + Math.cos(a)*12);
        look.copy(winner.position);
    } else if (!isRacing) {
        target.set(0, 20, -35); look.set(0, 0, 10);
    } else {
        if (camAngle === 0) { target.set(leadDuck.position.x, 8, leadDuck.position.z - 15); look.set(leadDuck.position.x, 2, leadDuck.position.z + 20); } 
        else if (camAngle === 1) { target.set(25, 20, packCenterZ - 15); look.set(0, 0, packCenterZ + 40); } 
        else { target.set(-28, 8, leadDuck.position.z + 5); look.set(leadDuck.position.x, 2, leadDuck.position.z + 10); }
    }
    camera.position.lerp(target, 0.04); camera.lookAt(look);
}

function updateUI(leadDuck, sortedDucks) {
    if(isRacing && !raceEnded && speedEl) {
        speedEl.innerText = Math.floor(leadDuck.baseSpeed * 2 + (Math.sin(performance.now() * 0.01) * 5));
    }
    let html = '';
    for(let i=0; i<sortedDucks.length; i++) {
        const d = sortedDucks[i];
        const distText = d.finished ? `<span style="color:#ED0778">FINISHED</span>` : (i === 0 ? 'LEADER' : `+${Math.floor(leadDuck.position.z - d.position.z)}m`);
        const rowClass = i === 0 ? 'lb-row leader' : 'lb-row';
        const hexColor = '#' + d.color.toString(16).padStart(6,'0');
        const r=(d.color>>16)&255, g=(d.color>>8)&255, b=d.color&255;
        const txtCol = (((r*299)+(g*587)+(b*114))/1000) >= 128 ? '#000' : '#fff';
        
        // OVERRIDE FOR LEADERBOARD NAME TEXT ONLY
        // We do not change hexColor (used for the box), but we use a lighter color for the text name.
        let nameTextColor = hexColor;
        if(d.id === 5) nameTextColor = '#D69EFC'; // Lighter Purple for readability
        if(d.id === 6) nameTextColor = '#B0BEC5'; // Lighter Grey for readability

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
    const delta = clock.getDelta(), time = clock.getElapsedTime();
    water.material.uniforms.time.value = time;
    
    // Update Wakes
    if(isRacing) updateWakes(delta);

    let leadDuck = ducks[0], totalZ = 0;
    if (isRacing) {
        ducks.forEach(d => {
            d.update(delta, time); totalZ += d.position.z;
            if (!d.finished && d.position.z >= CONFIG.raceDistance) { d.finished = true; d.finishTime = time; }
        });
        
        for(let i=0;i<ducks.length;i++) for(let j=i+1;j<ducks.length;j++) {
             const d1=ducks[i], d2=ducks[j];
             if(d1.finished||d2.finished) continue;
             const dx=d1.position.x-d2.position.x, dz=d1.position.z-d2.position.z;
             const distSq=dx*dx+dz*dz;
             if(distSq < 10.24) {
                 const dist=Math.sqrt(distSq), push=(3.2-dist)*0.5;
                 const nx=dx/dist, nz=dz/dist;
                 d1.position.x+=nx*push; d1.position.z+=nz*push;
                 d2.position.x-=nx*push; d2.position.z-=nz*push;
             }
        }

        ducks.sort((a,b) => (a.finished&&b.finished)?a.finishTime-b.finishTime : (a.finished?-1 : (b.finished?1 : b.position.z-a.position.z)));
        leadDuck = ducks[0];

        if (ducks.some(d => d.finished) && !raceEnded) {
            raceEnded = true;
            winnerText.innerText = `WINNER: #${leadDuck.id + 1} ${leadDuck.name.toUpperCase()}!`;
            winnerText.style.color = '#' + leadDuck.color.toString(16).padStart(6,'0');
            setTimeout(() => { endScreen.classList.remove('hidden'); spawnConfetti(); }, 2000);
        }
    }
    
    if(leadDuck) {
        updateCamera(time, leadDuck, (ducks.length>0 ? totalZ/ducks.length : 0));
        updateUI(leadDuck, ducks);
    }
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();