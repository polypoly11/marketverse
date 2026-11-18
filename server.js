const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const players = {};
let messages = [];
let votes = { long: 0, short: 0 };

function getKSTDateKey() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

let currentKSTDateKey = getKSTDateKey();

function publicPlayers() {
  const out = {};
  for (const [id, p] of Object.entries(players)) {
    out[id] = {
      id,
      nickname: p.nickname,
      animal: p.animal,
      x: p.x,
      z: p.z,
      dir: p.dir,
      sitting: p.sitting,
      jumping: p.jumping,
      bubble: p.bubble || ""
    };
  }
  return out;
}

function emitFullState() {
  io.emit("state", {
    players: publicPlayers(),
    messages,
    votes,
    online: Object.keys(players).length
  });
}

function clearDailyChat() {
  messages = [];
  for (const id of Object.keys(players)) {
    players[id].bubble = "";
  }
  io.emit("messages:clear");
  emitFullState();
}

setInterval(() => {
  const nextKey = getKSTDateKey();
  if (nextKey !== currentKSTDateKey) {
    currentKSTDateKey = nextKey;
    clearDailyChat();
  }
}, 30000);

io.on("connection", (socket) => {
  socket.emit("bootstrap", {
    players: publicPlayers(),
    messages,
    votes,
    online: Object.keys(players).length
  });

  socket.on("join", ({ nickname, animal }) => {
    players[socket.id] = {
      nickname: String(nickname || "익명").slice(0, 16),
      animal: animal || "babySeal",
      x: 0,
      z: 12,
      dir: Math.PI,
      sitting: false,
      jumping: false,
      bubble: ""
    };
    emitFullState();
  });

  socket.on("move", (payload) => {
    const me = players[socket.id];
    if (!me) return;

    me.x = typeof payload.x === "number" ? payload.x : me.x;
    me.z = typeof payload.z === "number" ? payload.z : me.z;
    me.dir = typeof payload.dir === "number" ? payload.dir : me.dir;
    me.sitting = !!payload.sitting;
    me.jumping = !!payload.jumping;

    io.emit("players:update", {
      id: socket.id,
      x: me.x,
      z: me.z,
      dir: me.dir,
      sitting: me.sitting,
      jumping: me.jumping
    });
  });

  socket.on("chat", (text) => {
    const me = players[socket.id];
    if (!me) return;

    const clean = String(text || "").trim().slice(0, 180);
    if (!clean) return;

    const item = {
      id: Date.now() + Math.random(),
      nickname: me.nickname,
      text: clean
    };

    messages.push(item);
    if (messages.length > 80) messages = messages.slice(-80);

    me.bubble = clean;

    io.emit("chat:new", item);
    io.emit("bubble:update", { id: socket.id, text: clean });

    setTimeout(() => {
      if (players[socket.id] && players[socket.id].bubble === clean) {
        players[socket.id].bubble = "";
        io.emit("bubble:update", { id: socket.id, text: "" });
      }
    }, 12000);
  });

  socket.on("vote", (side) => {
    if (side !== "long" && side !== "short") return;
    votes[side] += 1;
    io.emit("vote:update", votes);
  });

  socket.on("rename", ({ nickname, animal }) => {
    const me = players[socket.id];
    if (!me) return;
    me.nickname = String(nickname || me.nickname).slice(0, 16);
    me.animal = animal || me.animal;
    emitFullState();
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    emitFullState();
  });
});

server.listen(PORT, () => {
  console.log(`JMC server running on ${PORT}`);
});
