import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

app.use(cors());

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

function releaseSocketLocks(socket) {
  for (const [roomId, room] of rooms.entries()) {
    if (!room?.locks) continue;

    const releasedShapeIds = [];

    for (const [shapeId, socketId] of room.locks.entries()) {
      if (socketId === socket.id) {
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

  socket.on("create-room", ({ shapes }, callback) => {
    let roomId = generateRoomId();

    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }

    rooms.set(roomId, {
      shapes: Array.isArray(shapes) ? shapes : [],
      locks: new Map()
    });

    socket.join(roomId);

    callback({
      success: true,
      roomId,
      shapes: rooms.get(roomId).shapes,
      lockedShapeIds: []
    });

    console.log(`Miestnosť vytvorená: ${roomId}`);
  });

  socket.on("join-room", ({ roomId }, callback) => {
    const normalizedRoomId = String(roomId || "").trim();

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

    socket.join(normalizedRoomId);

    callback({
      success: true,
      roomId: normalizedRoomId,
      shapes: room.shapes,
      lockedShapeIds: Array.from(room.locks.keys())
    });

    console.log(
      `Používateľ ${socket.id} sa pripojil do miestnosti ${normalizedRoomId}`
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

  socket.on("shape-lock", ({ roomId, shapeId }, callback) => {
    const normalizedRoomId = String(roomId || "").trim();
    const normalizedShapeId = String(shapeId || "").trim();
    const room = getRoom(normalizedRoomId);

    if (!room || !normalizedShapeId) {
      callback?.({
        success: false,
        message: "Tvar sa nepodarilo zamknúť."
      });
      return;
    }

    const currentOwner = room.locks.get(normalizedShapeId);

    if (currentOwner && currentOwner !== socket.id) {
      callback?.({
        success: false,
        message: "Tento tvar práve upravuje iný používateľ."
      });
      return;
    }

    room.locks.set(normalizedShapeId, socket.id);

    socket.to(normalizedRoomId).emit("shape-locked", {
      shapeId: normalizedShapeId
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

    const currentOwner = room.locks.get(normalizedShapeId);

    if (currentOwner !== socket.id) return;

    room.locks.delete(normalizedShapeId);

    socket.to(normalizedRoomId).emit("shape-unlocked", {
      shapeId: normalizedShapeId
    });
  });

  socket.on("disconnect", () => {
    releaseSocketLocks(socket);
    console.log("Používateľ odpojený:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server beží na porte ${PORT}`);
});