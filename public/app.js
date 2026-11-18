import * as THREE from "three";

const socket = io();

const sceneWrapEl = document.getElementById("scene");
const onlineEl = document.getElementById("online");
const connectionEl = document.getElementById("connection");
const myProfileEl = document.getElementById("my-profile");

const messagesEl = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

const longBtn = document.getElementById("long");
const shortBtn = document.getElementById("short");
const longBarEl = document.getElementById("longbar");
const longPctEl = document.getElementById("longpct");
const shortPctEl = document.getElementById("shortpct");

const assetsEl = document.getElementById("assets");

const profileModal = document.getElementById("profile-modal");
const renameBtn = document.getElementById("rename");
const nicknameInput = document.getElementById("nickname");
const animalGridEl = document.getElementById("animal-grid");
const selectedAnimalNameEl = document.getElementById("selected-animal-name");
const enterBtn = document.getElementById("enter-lounge");
const cancelProfileBtn = document.getElementById("cancel-profile");
const profileErrorEl = document.getElementById("profile-error");
const animalPreviewEl = document.getElementById("animal-preview");

const detailModal = document.getElementById("detail");
const detailCloseBtn = document.getElementById("close");
const detailNameEl = document.getElementById("detail-name");
const detailPriceEl = document.getElementById("detail-price");
const detailCanvas = document.getElementById("detail-chart");
const detailCtx = detailCanvas.getContext("2d");
const chartStatusEl = document.getElementById("chart-status");
const rangeButtons = [...document.querySelectorAll(".chart-toolbar button")];

const mobileButtons = [...document.querySelectorAll(".move-btn")];

const ANIMALS = [
  { id: "babySeal", name: "아기물개", emoji: "🦭", color: 0xd7c0ae, ear: "none", snout: "round" },
  { id: "bear", name: "곰", emoji: "🐻", color: 0x8d5d3f, ear: "round", snout: "round" },
  { id: "rabbit", name: "토끼", emoji: "🐰", color: 0xd8d0da, ear: "long", snout: "round" },
  { id: "cat", name: "고양이", emoji: "🐱", color: 0xf2c37f, ear: "point", snout: "small" },
  { id: "dog", name: "강아지", emoji: "🐶", color: 0xca9b72, ear: "drop", snout: "round" },
  { id: "fox", name: "여우", emoji: "🦊", color: 0xd47638, ear: "point", snout: "small" },
  { id: "pig", name: "돼지", emoji: "🐷", color: 0xe4a7b8, ear: "small", snout: "pig" },
  { id: "cow", name: "소", emoji: "🐮", color: 0xd5cbc2, ear: "horn", snout: "round" },
  { id: "tiger", name: "호랑이", emoji: "🐯", color: 0xe19944, ear: "round", snout: "small" },
  { id: "panda", name: "판다", emoji: "🐼", color: 0xe8e8e8, ear: "roundBlack", snout: "round" },
  { id: "penguin", name: "펭귄", emoji: "🐧", color: 0x262626, ear: "none", snout: "small" },
  { id: "chick", name: "병아리", emoji: "🐥", color: 0xf4d565, ear: "none", snout: "small" },
  { id: "frog", name: "개구리", emoji: "🐸", color: 0x59c66c, ear: "frog", snout: "small" },
  { id: "monkey", name: "원숭이", emoji: "🐵", color: 0x8b5d43, ear: "round", snout: "monkey" },
  { id: "hamster", name: "햄스터", emoji: "🐹", color: 0xd4b08b, ear: "round", snout: "round" }
];

const MARKET_SYMBOLS = [
  { key: "BTC", product: "BTC-USD", label: "BTC / USD", precision: 2 },
  { key: "ETH", product: "ETH-USD", label: "ETH / USD", precision: 2 },
  { key: "SOL", product: "SOL-USD", label: "SOL / USD", precision: 2 }
];

const RANGE_CONFIG = {
  "1h": { granularity: 300, limit: 12 },
  "1d": { granularity: 1800, limit: 48 },
  "1w": { granularity: 21600, limit: 56 }
};

const marketStore = {};
let currentDetailSymbol = "BTC";
let currentDetailRange = "1d";

let joined = false;
let myId = null;
let myProfile = {
  nickname: "",
  animal: "babySeal"
};

const remoteAvatars = new Map();
const avatarSprites = new Map();

const keys = {};
let canToggleSit = true;
let dragActive = false;
let dragLastX = 0;
let cameraYawOffset = 0;
let sendMoveCooldown = 0;

const playerState = {
  x: 0,
  z: 12,
  dir: Math.PI,
  sitting: false,
  jumping: false,
  jumpY: 0,
  jumpV: 0
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x061321);
scene.fog = new THREE.Fog(0x061321, 18, 55);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
camera.position.set(0, 5.4, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneWrapEl.prepend(renderer.domElement);

const clock = new THREE.Clock();

const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xa8d8ff, 2.0);
dirLight.position.set(6, 12, 8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
scene.add(dirLight);

const pointLight = new THREE.PointLight(0x34e1ff, 22, 60, 2);
pointLight.position.set(0, 5, 4);
scene.add(pointLight);

const boardLight = new THREE.PointLight(0x4de0bc, 26, 45, 2);
boardLight.position.set(0, 7, -18);
scene.add(boardLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(52, 80, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x04121f, roughness: 0.98, metalness: 0.1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
floor.position.z = 5;
scene.add(floor);

const grid = new THREE.GridHelper(52, 52, 0x1c7ba0, 0x134764);
grid.position.y = 0.01;
grid.position.z = 5;
scene.add(grid);

const leftColumn = new THREE.Mesh(
  new THREE.BoxGeometry(1.2, 10, 1.2),
  new THREE.MeshStandardMaterial({ color: 0x10354a, emissive: 0x07202d })
);
leftColumn.position.set(-12, 4.8, -4);
leftColumn.rotation.z = 0.18;
scene.add(leftColumn);

const deco1 = new THREE.Mesh(
  new THREE.ConeGeometry(1.7, 4, 5),
  new THREE.MeshStandardMaterial({ color: 0x1d9a97, roughness: 0.5, metalness: 0.2 })
);
deco1.position.set(-17, 2.1, 9);
scene.add(deco1);

const deco2 = new THREE.Mesh(
  new THREE.BoxGeometry(2.3, 1, 2.3),
  new THREE.MeshStandardMaterial({ color: 0x0f413d, roughness: 0.7 })
);
deco2.position.set(-17, 0.5, 10.4);
scene.add(deco2);

const billboardCanvas = document.createElement("canvas");
billboardCanvas.width = 2048;
billboardCanvas.height = 960;
const billboardCtx = billboardCanvas.getContext("2d");
const billboardTexture = new THREE.CanvasTexture(billboardCanvas);
billboardTexture.minFilter = THREE.LinearFilter;
billboardTexture.magFilter = THREE.LinearFilter;

const billboardGroup = new THREE.Group();
billboardGroup.position.set(0, 6.8, -24);

const billboardBack = new THREE.Mesh(
  new THREE.BoxGeometry(25, 11.5, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x0a1928, emissive: 0x07121c, metalness: 0.55, roughness: 0.55 })
);
billboardBack.castShadow = true;
billboardBack.receiveShadow = true;
billboardGroup.add(billboardBack);

const billboardFace = new THREE.Mesh(
  new THREE.PlaneGeometry(23.6, 10.2),
  new THREE.MeshBasicMaterial({ map: billboardTexture })
);
billboardFace.position.z = 0.26;
billboardGroup.add(billboardFace);

scene.add(billboardGroup);

const localAvatarRoot = new THREE.Group();
scene.add(localAvatarRoot);

let previewRenderer, previewScene, previewCamera, previewAvatar;
let selectedAnimal = "babySeal";

function formatDollar(value, precision = 2) {
  if (!Number.isFinite(value)) return "-";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  })}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeTextTexture(text, width = 512, height = 128, type = "bubble") {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, width, height);
  if (type === "bubble") {
    ctx.fillStyle = "rgba(6, 18, 30, 0.92)";
    ctx.strokeStyle = "rgba(241, 216, 160, 0.9)";
    ctx.lineWidth = 4;
    roundRect(ctx, 8, 8, width - 16, height - 26, 26);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width / 2 - 18, height - 26);
    ctx.lineTo(width / 2 + 18, height - 26);
    ctx.lineTo(width / 2, height - 4);
    ctx.closePath();
    ctx.fillStyle = "rgba(6, 18, 30, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(241, 216, 160, 0.9)";
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 38px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width / 2, height / 2 - 8);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, 10, 18, width - 20, height - 36, 18);
    ctx.fill();
    ctx.fillStyle = "#f7ead1";
    ctx.font = "700 36px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width / 2, height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function makeTextSprite(text, type = "bubble") {
  const texture = makeTextTexture(text, 512, type === "bubble" ? 140 : 96, type);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(type === "bubble" ? 3.9 : 2.8, type === "bubble" ? 1.1 : 0.55, 1);
  return sprite;
}

function buildAnimalAvatar(animalId) {
  const data = ANIMALS.find((a) => a.id === animalId) || ANIMALS[0];
  const g = new THREE.Group();
  g.scale.setScalar(0.7);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: data.color,
    roughness: 0.7,
    metalness: 0.08
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x2c1a12,
    roughness: 0.75
  });

  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xf4e7d6,
    roughness: 0.8
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 28), bodyMat);
  body.scale.set(1.0, 1.1, 0.9);
  body.position.y = 1.1;
  body.castShadow = true;
  g.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 24), lightMat);
  belly.scale.set(1, 1.1, 0.5);
  belly.position.set(0, 1.0, 0.55);
  belly.castShadow = true;
  g.add(belly);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 28, 28), bodyMat);
  head.position.set(0, 2.2, 0);
  head.castShadow = true;
  g.add(head);

  const eyeGeo = new THREE.SphereGeometry(0.06, 16, 16);
  const eyeL = new THREE.Mesh(eyeGeo, darkMat);
  const eyeR = new THREE.Mesh(eyeGeo, darkMat);
  eyeL.position.set(-0.18, 2.25, 0.67);
  eyeR.position.set(0.18, 2.25, 0.67);
  g.add(eyeL, eyeR);

  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), darkMat);
  mouth.position.set(0, 2.0, 0.73);
  g.add(mouth);

  const addEar = (x, y, z, sx, sy, sz, color = bodyMat) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 18), color);
    ear.position.set(x, y, z);
    ear.scale.set(sx, sy, sz);
    ear.castShadow = true;
    g.add(ear);
  };

  if (data.ear === "round") {
    addEar(-0.42, 2.75, -0.05, 1, 1, 0.7);
    addEar(0.42, 2.75, -0.05, 1, 1, 0.7);
  }
  if (data.ear === "roundBlack") {
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x191919, roughness: 0.8 });
    addEar(-0.42, 2.75, -0.05, 1, 1, 0.7, blackMat);
    addEar(0.42, 2.75, -0.05, 1, 1, 0.7, blackMat);
    const patch1 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), blackMat);
    const patch2 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), blackMat);
    patch1.position.set(-0.18, 2.25, 0.64);
    patch2.position.set(0.18, 2.25, 0.64);
    patch1.scale.set(1.4, 1, 0.4);
    patch2.scale.set(1.4, 1, 0.4);
    g.add(patch1, patch2);
  }
  if (data.ear === "point") {
    const earGeo = new THREE.ConeGeometry(0.18, 0.48, 4);
    const e1 = new THREE.Mesh(earGeo, bodyMat);
    const e2 = new THREE.Mesh(earGeo, bodyMat);
    e1.position.set(-0.42, 2.84, 0);
    e2.position.set(0.42, 2.84, 0);
    e1.rotation.z = -0.2;
    e2.rotation.z = 0.2;
    e1.castShadow = true;
    e2.castShadow = true;
    g.add(e1, e2);
  }
  if (data.ear === "long") {
    const earGeo = new THREE.CapsuleGeometry(0.12, 0.75, 4, 8);
    const e1 = new THREE.Mesh(earGeo, bodyMat);
    const e2 = new THREE.Mesh(earGeo, bodyMat);
    e1.position.set(-0.28, 3.08, 0);
    e2.position.set(0.28, 3.08, 0);
    e1.rotation.z = 0.08;
    e2.rotation.z = -0.08;
    g.add(e1, e2);
  }
  if (data.ear === "drop") {
    const earGeo = new THREE.CapsuleGeometry(0.12, 0.45, 4, 8);
    const e1 = new THREE.Mesh(earGeo, bodyMat);
    const e2 = new THREE.Mesh(earGeo, bodyMat);
    e1.position.set(-0.44, 2.55, 0.02);
    e2.position.set(0.44, 2.55, 0.02);
    e1.rotation.z = 0.52;
    e2.rotation.z = -0.52;
    g.add(e1, e2);
  }
  if (data.ear === "small") {
    addEar(-0.26, 2.78, 0.05, 0.8, 0.8, 0.6);
    addEar(0.26, 2.78, 0.05, 0.8, 0.8, 0.6);
  }
  if (data.ear === "horn") {
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xa38d78, roughness: 0.8 });
    const hGeo = new THREE.ConeGeometry(0.12, 0.36, 5);
    const h1 = new THREE.Mesh(hGeo, hornMat);
    const h2 = new THREE.Mesh(hGeo, hornMat);
    h1.position.set(-0.28, 2.9, 0);
    h2.position.set(0.28, 2.9, 0);
    h1.rotation.z = 0.6;
    h2.rotation.z = -0.6;
    g.add(h1, h2);
  }
  if (data.ear === "frog") {
    const eyeBallMat = new THREE.MeshStandardMaterial({ color: 0xf9fbfc, roughness: 0.7 });
    const pupMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 18), eyeBallMat);
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 18), eyeBallMat);
    b1.position.set(-0.27, 2.62, 0.4);
    b2.position.set(0.27, 2.62, 0.4);
    g.add(b1, b2);
    const p1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), pupMat);
    const p2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), pupMat);
    p1.position.set(-0.27, 2.62, 0.56);
    p2.position.set(0.27, 2.62, 0.56);
    g.add(p1, p2);
  }

  if (data.snout === "pig") {
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 18), lightMat);
    snout.scale.set(1.3, 0.9, 0.8);
    snout.position.set(0, 2.03, 0.73);
    g.add(snout);
  } else if (data.snout === "monkey") {
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xe6c19d, roughness: 0.7 });
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.37, 18, 18), faceMat);
    face.scale.set(1, 0.8, 0.45);
    face.position.set(0, 2.02, 0.62);
    g.add(face);
  } else if (data.snout === "small") {
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), lightMat);
    snout.scale.set(1.1, 0.75, 0.6);
    snout.position.set(0, 2.02, 0.7);
    g.add(snout);
  } else if (data.snout === "round") {
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), lightMat);
    snout.scale.set(1.25, 0.85, 0.7);
    snout.position.set(0, 2.0, 0.7);
    g.add(snout);
  }

  const armGeo = new THREE.CapsuleGeometry(0.14, 0.55, 3, 6);
  const legGeo = new THREE.CapsuleGeometry(0.16, 0.62, 3, 6);

  const armL = new THREE.Mesh(armGeo, bodyMat);
  const armR = new THREE.Mesh(armGeo, bodyMat);
  armL.position.set(-0.65, 1.28, 0.2);
  armR.position.set(0.65, 1.28, 0.2);
  armL.rotation.z = 0.35;
  armR.rotation.z = -0.35;
  g.add(armL, armR);

  const legL = new THREE.Mesh(legGeo, bodyMat);
  const legR = new THREE.Mesh(legGeo, bodyMat);
  legL.position.set(-0.3, 0.35, 0);
  legR.position.set(0.3, 0.35, 0);
  g.add(legL, legR);

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), bodyMat);
  tail.position.set(0, 1.0, -0.72);
  g.add(tail);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.88, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  g.add(shadow);

  const nameSprite = makeTextSprite("", "name");
  nameSprite.position.set(0, 3.55, 0);
  g.add(nameSprite);

  const bubbleSprite = makeTextSprite("", "bubble");
  bubbleSprite.position.set(0, 4.45, 0);
  bubbleSprite.visible = false;
  g.add(bubbleSprite);

  g.userData = {
    data,
    armL,
    armR,
    legL,
    legR,
    body,
    head,
    nameSprite,
    bubbleSprite,
    shadow,
    baseY: 0
  };

  return g;
}

function setAvatarName(group, text) {
  if (!group?.userData?.nameSprite) return;
  group.userData.nameSprite.material.map.dispose?.();
  group.userData.nameSprite.material.map = makeTextTexture(text, 420, 96, "name");
  group.userData.nameSprite.material.needsUpdate = true;
}

function setAvatarBubble(group, text) {
  if (!group?.userData?.bubbleSprite) return;
  if (!text) {
    group.userData.bubbleSprite.visible = false;
    return;
  }
  group.userData.bubbleSprite.visible = true;
  group.userData.bubbleSprite.material.map.dispose?.();
  group.userData.bubbleSprite.material.map = makeTextTexture(text, 512, 140, "bubble");
  group.userData.bubbleSprite.material.needsUpdate = true;
}

function mountLocalAvatar() {
  localAvatarRoot.clear();
  const avatar = buildAnimalAvatar(myProfile.animal);
  avatar.position.set(playerState.x, playerState.jumpY, playerState.z);
  avatar.rotation.y = playerState.dir;
  setAvatarName(avatar, myProfile.nickname || "나");
  localAvatarRoot.add(avatar);
  localAvatarRoot.userData.avatar = avatar;
}

function ensureRemoteAvatar(id, player) {
  if (id === myId) return;
  let avatar = remoteAvatars.get(id);
  if (!avatar) {
    avatar = buildAnimalAvatar(player.animal);
    setAvatarName(avatar, player.nickname);
    avatar.position.set(player.x, 0, player.z);
    avatar.rotation.y = player.dir || Math.PI;
    scene.add(avatar);
    remoteAvatars.set(id, avatar);
  }
  return avatar;
}

function syncRemotePlayers(players) {
  const seen = new Set();
  for (const [id, p] of Object.entries(players)) {
    seen.add(id);
    if (id === myId) continue;
    let avatar = remoteAvatars.get(id);
    const currentAnimal = avatar?.userData?.data?.id;
    if (!avatar || currentAnimal !== p.animal) {
      if (avatar) {
        scene.remove(avatar);
        remoteAvatars.delete(id);
      }
      avatar = ensureRemoteAvatar(id, p);
    }
    avatar.position.x = p.x;
    avatar.position.z = p.z;
    avatar.rotation.y = p.dir || Math.PI;
    avatar.userData.baseY = p.sitting ? -0.38 : 0;
    avatar.position.y = avatar.userData.baseY;
    avatar.scale.setScalar(0.7);
    setAvatarName(avatar, p.nickname);
    setAvatarBubble(avatar, p.bubble || "");
  }

  for (const [id, avatar] of remoteAvatars.entries()) {
    if (!seen.has(id)) {
      scene.remove(avatar);
      remoteAvatars.delete(id);
    }
  }
}

function buildAnimalSelector() {
  animalGridEl.innerHTML = "";
  ANIMALS.forEach((animal) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "animal-option" + (animal.id === selectedAnimal ? " selected" : "");
    btn.innerHTML = `<span class="animal-emoji">${animal.emoji}</span><span class="animal-name">${animal.name}</span>`;
    btn.addEventListener("click", () => {
      selectedAnimal = animal.id;
      selectedAnimalNameEl.textContent = animal.name;
      [...animalGridEl.children].forEach((node) => node.classList.remove("selected"));
      btn.classList.add("selected");
      refreshPreviewAvatar();
    });
    animalGridEl.appendChild(btn);
  });
  selectedAnimalNameEl.textContent = ANIMALS.find((a) => a.id === selectedAnimal)?.name || "아기물개";
}

function initPreviewScene() {
  previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  previewRenderer.setSize(animalPreviewEl.clientWidth, animalPreviewEl.clientHeight);
  animalPreviewEl.innerHTML = "";
  animalPreviewEl.appendChild(previewRenderer.domElement);

  previewScene = new THREE.Scene();
  previewCamera = new THREE.PerspectiveCamera(45, animalPreviewEl.clientWidth / animalPreviewEl.clientHeight, 0.1, 100);
  previewCamera.position.set(0, 2.1, 7.2);

  previewScene.add(new THREE.AmbientLight(0xffffff, 1.3));
  const l = new THREE.DirectionalLight(0xffffff, 1.5);
  l.position.set(3, 6, 4);
  previewScene.add(l);

  refreshPreviewAvatar();

  let rotating = false;
  let lastX = 0;

  animalPreviewEl.addEventListener("pointerdown", (e) => {
    rotating = true;
    lastX = e.clientX;
  });
  window.addEventListener("pointerup", () => rotating = false);
  window.addEventListener("pointermove", (e) => {
    if (!rotating || !previewAvatar) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    previewAvatar.rotation.y += dx * 0.01;
  });

  function previewLoop() {
    requestAnimationFrame(previewLoop);
    if (previewAvatar) previewAvatar.rotation.y += 0.003;
    previewRenderer.render(previewScene, previewCamera);
  }
  previewLoop();
}

function refreshPreviewAvatar() {
  if (!previewScene) return;
  if (previewAvatar) previewScene.remove(previewAvatar);
  previewAvatar = buildAnimalAvatar(selectedAnimal);
  previewAvatar.position.y = -0.2;
  previewScene.add(previewAvatar);
}

function openProfileModal(isRename = false) {
  profileModal.hidden = false;
  profileModal.style.display = "grid";
  cancelProfileBtn.hidden = !isRename;
  nicknameInput.value = isRename ? myProfile.nickname : "";
  profileErrorEl.textContent = "";
  if (isRename) selectedAnimal = myProfile.animal;
  buildAnimalSelector();
  refreshPreviewAvatar();
}

function closeProfileModal() {
  profileModal.style.display = "none";
}

function addMessage(item) {
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<b>${escapeHtml(item.nickname)}</b> ${escapeHtml(item.text)}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMessages(list) {
  messagesEl.innerHTML = "";
  list.forEach(addMessage);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function updateVoteUI(votes) {
  const total = votes.long + votes.short || 1;
  const longPct = Math.round((votes.long / total) * 100);
  const shortPct = 100 - longPct;
  longBarEl.style.width = `${longPct}%`;
  longPctEl.textContent = `${longPct}% LONG`;
  shortPctEl.textContent = `${shortPct}% SHORT`;
}

async function fetchMarketRange(symbolKey, range = "1d") {
  const meta = MARKET_SYMBOLS.find((s) => s.key === symbolKey);
  if (!meta) return [];
  const conf = RANGE_CONFIG[range] || RANGE_CONFIG["1d"];
  const url = `https://api.exchange.coinbase.com/products/${meta.product}/candles?granularity=${conf.granularity}`;
  const res = await fetch(url);
  const arr = await res.json();
  if (!Array.isArray(arr)) return [];
  const sorted = arr
    .map((x) => ({
      time: x[0],
      low: x[1],
      high: x[2],
      open: x[3],
      close: x[4],
      volume: x[5]
    }))
    .sort((a, b) => a.time - b.time)
    .slice(-conf.limit);
  return sorted;
}

async function fetchMarketAll() {
  await Promise.all(
    MARKET_SYMBOLS.map(async (meta) => {
      try {
        const tickerRes = await fetch(`https://api.exchange.coinbase.com/products/${meta.product}/ticker`);
        const ticker = await tickerRes.json();
        const candles = await fetchMarketRange(meta.key, "1d");

        const price = Number(ticker.price || 0);
        const open = candles.length ? candles[0].open : price;
        const last = candles.length ? candles[candles.length - 1].close : price;
        const changePct = open ? ((last - open) / open) * 100 : 0;

        marketStore[meta.key] = {
          ...meta,
          price,
          candles,
          changePct
        };
      } catch (err) {
        console.error(meta.key, err);
      }
    })
  );

  renderAssetCards();
  drawBillboard();
  if (!detailModal.hidden) {
    openDetail(currentDetailSymbol, currentDetailRange);
  }
}

function drawCandles(ctx, candles, x, y, w, h, opts = {}) {
  if (!candles?.length) return;
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = Math.max(max - min, 0.0001);
  const candleW = w / candles.length;

  ctx.save();
  ctx.strokeStyle = opts.gridColor || "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const gy = y + (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }

  candles.forEach((c, i) => {
    const cx = x + i * candleW + candleW * 0.5;
    const openY = y + h - ((c.open - min) / range) * h;
    const closeY = y + h - ((c.close - min) / range) * h;
    const highY = y + h - ((c.high - min) / range) * h;
    const lowY = y + h - ((c.low - min) / range) * h;

    const up = c.close >= c.open;
    ctx.strokeStyle = up ? "#4de0bc" : "#ff6b84";
    ctx.fillStyle = up ? "#4de0bc" : "#ff6b84";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(cx, highY);
    ctx.lineTo(cx, lowY);
    ctx.stroke();

    const bodyY = Math.min(openY, closeY);
    const bodyH = Math.max(Math.abs(closeY - openY), 3);
    const bodyW = Math.max(candleW * 0.55, 3);
    ctx.fillRect(cx - bodyW / 2, bodyY, bodyW, bodyH);
  });

  ctx.restore();
}

function drawBillboard() {
  const ctx = billboardCtx;
  const w = billboardCanvas.width;
  const h = billboardCanvas.height;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#061426");
  grad.addColorStop(1, "#0c2438");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#d7b87c";
  ctx.font = "700 40px sans-serif";
  ctx.fillText("JMC INVEST LOUNGE", 80, 70);

  ctx.fillStyle = "#7a92a8";
  ctx.font = "600 22px sans-serif";
  ctx.fillText("BTC · ETH · SOL", w - 310, 70);

  const gap = 34;
  const top = 120;
  const panelW = (w - 80 * 2 - gap * 2) / 3;
  const panelH = 690;
  const startX = 80;

  MARKET_SYMBOLS.forEach((meta, idx) => {
    const data = marketStore[meta.key] || {};
    const px = startX + idx * (panelW + gap);
    const py = top;

    ctx.fillStyle = "#10273b";
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 3;
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeRect(px, py, panelW, panelH);

    ctx.fillStyle = "#e9d8ae";
    ctx.font = "700 32px sans-serif";
    ctx.fillText(meta.label, px + 26, py + 48);

    ctx.fillStyle = data.changePct >= 0 ? "#4de0bc" : "#ff6b84";
    ctx.font = "700 48px sans-serif";
    ctx.fillText(formatDollar(data.price || 0, meta.precision), px + 26, py + 108);

    ctx.font = "700 28px sans-serif";
    const ch = Number.isFinite(data.changePct) ? `${data.changePct >= 0 ? "+" : ""}${data.changePct.toFixed(2)}%` : "-";
    ctx.fillText(ch, px + panelW - 160, py + 108);

    drawCandles(ctx, data.candles || [], px + 18, py + 150, panelW - 36, panelH - 190);
  });

  billboardTexture.needsUpdate = true;
}

function renderAssetCards() {
  assetsEl.innerHTML = "";
  MARKET_SYMBOLS.forEach((meta) => {
    const data = marketStore[meta.key];
    const card = document.createElement("div");
    card.className = "asset-card";
    card.addEventListener("click", () => openDetail(meta.key, "1d"));

    card.innerHTML = `
      <div class="asset-head">
        <div>
          <strong>${meta.label}</strong>
          <small>실시간 코인베이스 기준</small>
        </div>
        <div class="asset-price">
          ${formatDollar(data?.price || 0, meta.precision)}
          <span class="change">${data?.changePct >= 0 ? "+" : ""}${(data?.changePct || 0).toFixed(2)}%</span>
        </div>
      </div>
      <canvas class="spark-chart" width="300" height="100"></canvas>
    `;

    assetsEl.appendChild(card);

    const canvas = card.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#081421";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCandles(ctx, data?.candles || [], 10, 10, canvas.width - 20, canvas.height - 20);
  });
}

async function openDetail(symbolKey, range = "1d") {
  currentDetailSymbol = symbolKey;
  currentDetailRange = range;
  detailModal.hidden = false;

  rangeButtons.forEach((btn) => btn.classList.toggle("selected", btn.dataset.range === range));
  const meta = MARKET_SYMBOLS.find((s) => s.key === symbolKey);
  if (!meta) return;
  detailNameEl.textContent = meta.label;

  chartStatusEl.textContent = "차트 불러오는 중...";
  try {
    const candles = await fetchMarketRange(symbolKey, range);
    const tickerRes = await fetch(`https://api.exchange.coinbase.com/products/${meta.product}/ticker`);
    const ticker = await tickerRes.json();
    const price = Number(ticker.price || 0);
    detailPriceEl.textContent = formatDollar(price, meta.precision);

    detailCtx.clearRect(0, 0, detailCanvas.width, detailCanvas.height);
    detailCtx.fillStyle = "#081421";
    detailCtx.fillRect(0, 0, detailCanvas.width, detailCanvas.height);
    drawCandles(detailCtx, candles, 30, 20, detailCanvas.width - 60, detailCanvas.height - 40);

    chartStatusEl.textContent = "업데이트 완료";
  } catch (err) {
    chartStatusEl.textContent = "차트 로드 실패";
  }
}

detailCloseBtn.addEventListener("click", () => {
  detailModal.hidden = true;
});

rangeButtons.forEach((btn) => {
  btn.addEventListener("click", () => openDetail(currentDetailSymbol, btn.dataset.range));
});

function applyPlayerPose(avatar, delta, moving, sitting, jumping, jumpY = 0) {
  if (!avatar?.userData) return;
  avatar.position.y = (sitting ? -0.38 : 0) + jumpY;
  avatar.scale.setScalar(0.7);

  const swing = moving ? Math.sin(performance.now() * 0.01) * 0.5 : 0;
  avatar.userData.armL.rotation.x = swing;
  avatar.userData.armR.rotation.x = -swing;
  avatar.userData.legL.rotation.x = -swing;
  avatar.userData.legR.rotation.x = swing;

  avatar.userData.body.rotation.x = sitting ? 0.28 : 0;
  avatar.userData.head.position.y = sitting ? 2.0 : 2.2;
  avatar.userData.shadow.scale.setScalar(jumping ? 0.88 : 1);
}

function onResize() {
  const w = sceneWrapEl.clientWidth;
  const h = sceneWrapEl.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", onResize);
onResize();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  const localAvatar = localAvatarRoot.userData.avatar;
  if (localAvatar) {
    const movingVec = new THREE.Vector2(
      (keys.a || keys.ArrowLeft ? 1 : 0) + (keys.d || keys.ArrowRight ? -1 : 0),
      (keys.w || keys.ArrowUp ? 1 : 0) + (keys.s || keys.ArrowDown ? -1 : 0)
    );

    let moving = false;
    if (profileModal.style.display !== "grid") {
      if (movingVec.lengthSq() > 0) {
        moving = true;
        movingVec.normalize();
        const speed = 6.8 * dt;
        playerState.x -= movingVec.x * speed;
        playerState.z -= movingVec.y * speed;

        playerState.x = Math.max(-15, Math.min(15, playerState.x));
        playerState.z = Math.max(-2, Math.min(20, playerState.z));

        playerState.dir = Math.atan2(movingVec.x, movingVec.y);
      }

      if ((keys.c || keys.C) && canToggleSit) {
        playerState.sitting = !playerState.sitting;
        if (playerState.sitting) {
          playerState.jumping = false;
          playerState.jumpY = 0;
          playerState.jumpV = 0;
        }
        canToggleSit = false;
      }
      if (!(keys.c || keys.C)) {
        canToggleSit = true;
      }

      if ((keys[" "] || keys.Space) && !playerState.jumping && !playerState.sitting) {
        playerState.jumping = true;
        playerState.jumpV = 5.2;
      }
    }

    if (playerState.jumping) {
      playerState.jumpV -= 12 * dt;
      playerState.jumpY += playerState.jumpV * dt;
      if (playerState.jumpY <= 0) {
        playerState.jumpY = 0;
        playerState.jumpV = 0;
        playerState.jumping = false;
      }
    }

    localAvatar.position.x = playerState.x;
    localAvatar.position.z = playerState.z;
    localAvatar.rotation.y = playerState.dir;
    applyPlayerPose(localAvatar, dt, moving, playerState.sitting, playerState.jumping, playerState.jumpY);

    const closeFactor = THREE.MathUtils.clamp((10 - playerState.z) / 12, 0, 1);
    const desiredYaw = cameraYawOffset;
    const camDistance = 8.6 + closeFactor * 4.5;
    const camHeight = 4.9 + closeFactor * 1.2;
    const targetX = playerState.x + Math.sin(desiredYaw) * 0.5;
    const camX = playerState.x + Math.sin(desiredYaw) * 2.2;
    const camZ = playerState.z + camDistance * Math.cos(desiredYaw);

    camera.position.x += (camX - camera.position.x) * 0.08;
    camera.position.y += (camHeight - camera.position.y) * 0.08;
    camera.position.z += (camZ - camera.position.z) * 0.08;

    const lookX = targetX;
    const lookY = 2.2;
    const lookZ = THREE.MathUtils.lerp(playerState.z - 1.6, -18, 0.55);
    camera.lookAt(lookX, lookY, lookZ);

    sendMoveCooldown += dt;
    if (joined && sendMoveCooldown > 0.05) {
      sendMoveCooldown = 0;
      socket.emit("move", {
        x: playerState.x,
        z: playerState.z,
        dir: playerState.dir,
        sitting: playerState.sitting,
        jumping: playerState.jumping
      });
    }
  }

  for (const avatar of remoteAvatars.values()) {
    applyPlayerPose(avatar, dt, false, avatar.userData.baseY < 0, false, 0);
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

mobileButtons.forEach((btn) => {
  const key = btn.dataset.key;
  const down = (e) => {
    e.preventDefault();
    keys[key] = true;
    btn.classList.add("pressed");
  };
  const up = (e) => {
    e.preventDefault();
    keys[key] = false;
    btn.classList.remove("pressed");
  };
  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("pointerleave", up);
});

sceneWrapEl.addEventListener("pointerdown", (e) => {
  if (e.target.closest("#mobile-controls")) return;
  dragActive = true;
  dragLastX = e.clientX;
});
window.addEventListener("pointerup", () => dragActive = false);
window.addEventListener("pointermove", (e) => {
  if (!dragActive) return;
  const dx = e.clientX - dragLastX;
  dragLastX = e.clientX;
  cameraYawOffset -= dx * 0.004;
  cameraYawOffset = Math.max(-0.55, Math.min(0.55, cameraYawOffset));
});

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chat", text);
  chatInput.value = "";
});

longBtn.addEventListener("click", () => socket.emit("vote", "long"));
shortBtn.addEventListener("click", () => socket.emit("vote", "short"));

renameBtn.addEventListener("click", () => openProfileModal(true));
cancelProfileBtn.addEventListener("click", closeProfileModal);

enterBtn.addEventListener("click", () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    profileErrorEl.textContent = "닉네임을 입력해 주세요.";
    return;
  }

  myProfile.nickname = nickname.slice(0, 16);
  myProfile.animal = selectedAnimal;
  myProfileEl.textContent = `${ANIMALS.find((a) => a.id === myProfile.animal)?.emoji || "🦭"} ${myProfile.nickname}`;

  mountLocalAvatar();

  if (!joined) {
    socket.emit("join", myProfile);
    joined = true;
  } else {
    socket.emit("rename", myProfile);
  }

  closeProfileModal();
});

socket.on("connect", () => {
  connectionEl.textContent = "연결됨";
});
socket.on("disconnect", () => {
  connectionEl.textContent = "연결 끊김";
});

socket.on("bootstrap", (payload) => {
  onlineEl.textContent = payload.online || 0;
  renderMessages(payload.messages || []);
  updateVoteUI(payload.votes || { long: 0, short: 0 });
  syncRemotePlayers(payload.players || {});
  myId = socket.id;
});

socket.on("state", (payload) => {
  onlineEl.textContent = payload.online || 0;
  renderMessages(payload.messages || []);
  updateVoteUI(payload.votes || { long: 0, short: 0 });
  syncRemotePlayers(payload.players || {});
  myId = socket.id;

  const me = payload.players?.[socket.id];
  if (me && joined) {
    playerState.x = me.x;
    playerState.z = me.z;
    playerState.dir = me.dir;
    playerState.sitting = me.sitting;
    mountLocalAvatar();
  }
});

socket.on("players:update", ({ id, x, z, dir, sitting }) => {
  if (id === socket.id) return;
  const avatar = remoteAvatars.get(id);
  if (!avatar) return;
  avatar.position.x = x;
  avatar.position.z = z;
  avatar.rotation.y = dir;
  avatar.userData.baseY = sitting ? -0.38 : 0;
});

socket.on("chat:new", (item) => addMessage(item));

socket.on("bubble:update", ({ id, text }) => {
  if (id === socket.id) {
    const avatar = localAvatarRoot.userData.avatar;
    setAvatarBubble(avatar, text);
  } else {
    const avatar = remoteAvatars.get(id);
    setAvatarBubble(avatar, text);
  }
});

socket.on("messages:clear", () => {
  messagesEl.innerHTML = "";
  const localAvatar = localAvatarRoot.userData.avatar;
  if (localAvatar) setAvatarBubble(localAvatar, "");
  for (const avatar of remoteAvatars.values()) {
    setAvatarBubble(avatar, "");
  }
});

socket.on("vote:update", (votes) => updateVoteUI(votes));

function init() {
  mountLocalAvatar();
  buildAnimalSelector();
  initPreviewScene();
  openProfileModal(false);
  fetchMarketAll();
  setInterval(fetchMarketAll, 10000);
}
init();
