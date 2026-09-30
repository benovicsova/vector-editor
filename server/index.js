import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

app.use(cors());

app.get("/", (req, res) => {
  res.send("Vector editor backend beží.");
});

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

function generateRoomId() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function getRoom(roomId) {
  return rooms.get(String(roomId || "").trim());
}

function getLockedShapes(room) {
  return Array.from(room.locks.entries()).map(([shapeId, lock]) => ({
    shapeId,
    userName: lock.userName
  }));
}

function releaseSocketLocks(socket) {
  for (const [roomId, room] of rooms.entries()) {
    if (!room?.locks) continue;

    const releasedShapeIds = [];

    for (const [shapeId, lock] of room.locks.entries()) {
      if (lock.socketId === socket.id) {
        room.locks.delete(shapeId);
        releasedShapeIds.push(shapeId);
      }
    }

    for (const shapeId of releasedShapeIds) {
      socket.to(roomId).emit("shape-unlocked", {
        shapeId
      });
    }
  }
}

io.on("connection", (socket) => {
  console.log("Používateľ pripojený:", socket.id);

  socket.on("create-room", ({ shapes, userName }, callback) => {
    let roomId = generateRoomId();

    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }

    const normalizedUserName = String(userName || "Používateľ").trim();

    rooms.set(roomId, {
      shapes: Array.isArray(shapes) ? shapes : [],
      locks: new Map(),
      users: new Map([[socket.id, normalizedUserName]])
    });

    socket.join(roomId);

    callback({
      success: true,
      roomId,
      shapes: rooms.get(roomId).shapes,
      lockedShapes: []
    });

    console.log(`Miestnosť vytvorená: ${roomId}`);
  });

  socket.on("join-room", ({ roomId, userName }, callback) => {
    const normalizedRoomId = String(roomId || "").trim();
    const normalizedUserName = String(userName || "Používateľ").trim();

    if (!/^\d{4}$/.test(normalizedRoomId)) {
      callback({
        success: false,
        message: "ID miestnosti musí byť 4-ciferné číslo."
      });
      return;
    }

    const room = getRoom(normalizedRoomId);

    if (!room) {
      callback({
        success: false,
        message: "Miestnosť neexistuje."
      });
      return;
    }

    room.users.set(socket.id, normalizedUserName);
    socket.join(normalizedRoomId);

    callback({
      success: true,
      roomId: normalizedRoomId,
      shapes: room.shapes,
      lockedShapes: getLockedShapes(room)
    });

    console.log(
      `Používateľ ${socket.id} (${normalizedUserName}) sa pripojil do miestnosti ${normalizedRoomId}`
    );
  });

  socket.on("canvas-update", ({ roomId, shapes }) => {
    const normalizedRoomId = String(roomId || "").trim();
    const room = getRoom(normalizedRoomId);

    if (!room) return;
    if (!Array.isArray(shapes)) return;

    room.shapes = shapes;

    socket.to(normalizedRoomId).emit("canvas-update", {
      shapes
    });
  });

  socket.on("shape-lock", ({ roomId, shapeId, userName }, callback) => {
    const normalizedRoomId = String(roomId || "").trim();
    const normalizedShapeId = String(shapeId || "").trim();
    const normalizedUserName =
      String(userName || "").trim() ||
      getRoom(normalizedRoomId)?.users?.get(socket.id) ||
      "Používateľ";

    const room = getRoom(normalizedRoomId);

    if (!room || !normalizedShapeId) {
      callback?.({
        success: false,
        message: "Tvar sa nepodarilo zamknúť."
      });
      return;
    }

    const currentLock = room.locks.get(normalizedShapeId);

    if (currentLock && currentLock.socketId !== socket.id) {
      callback?.({
        success: false,
        message: `Tento tvar práve upravuje ${currentLock.userName}.`
      });
      return;
    }

    room.locks.set(normalizedShapeId, {
      socketId: socket.id,
      userName: normalizedUserName
    });

    socket.to(normalizedRoomId).emit("shape-locked", {
      shapeId: normalizedShapeId,
      userName: normalizedUserName
    });

    callback?.({
      success: true,
      shapeId: normalizedShapeId
    });
  });

  socket.on("shape-unlock", ({ roomId, shapeId }) => {
    const normalizedRoomId = String(roomId || "").trim();
    const normalizedShapeId = String(shapeId || "").trim();
    const room = getRoom(normalizedRoomId);

    if (!room || !normalizedShapeId) return;

    const currentLock = room.locks.get(normalizedShapeId);

    if (!currentLock || currentLock.socketId !== socket.id) return;

    room.locks.delete(normalizedShapeId);

    socket.to(normalizedRoomId).emit("shape-unlocked", {
      shapeId: normalizedShapeId
    });
  });

  socket.on("disconnect", () => {
    releaseSocketLocks(socket);

    for (const room of rooms.values()) {
      room.users?.delete(socket.id);
    }

    console.log("Používateľ odpojený:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server beží na porte ${PORT}`);
});