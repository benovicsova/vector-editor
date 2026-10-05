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

const USER_COLORS = [
  "#ef4444",
  "#f97316",
  "#22c55e",
  "#3b82f6",
  "#855cd6",
  "#ec4899",
  "#14b8a6",
  "#eab308"
];

function generateRoomId() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function getRoom(roomId) {
  return rooms.get(String(roomId || "").trim());
}

function getUserColor(room) {
  const usedColors = new Set(
    Array.from(room.users.values()).map((user) => user.userColor)
  );

  return USER_COLORS.find((color) => !usedColors.has(color)) || USER_COLORS[0];
}

function getLockedShapes(room) {
  return Array.from(room.locks.entries()).map(([shapeId, lock]) => ({
    shapeId,
    socketId: lock.socketId,
    userName: lock.userName,
    userColor: lock.userColor
  }));
}

function getFocusedShapes(room) {
  return Array.from(room.focuses?.entries() || []).map(([shapeId, focus]) => ({
    shapeId,
    socketId: focus.socketId,
    userName: focus.userName,
    userColor: focus.userColor
  }));
}

function releaseSocketFocuses(socket) {
  for (const [roomId, room] of rooms.entries()) {
    if (!room?.focuses) continue;

    const releasedShapeIds = [];

    for (const [shapeId, focus] of room.focuses.entries()) {
      if (focus.socketId === socket.id) {
        room.focuses.delete(shapeId);
        releasedShapeIds.push(shapeId);
      }
    }

    for (const shapeId of releasedShapeIds) {
      socket.to(roomId).emit("shape-blurred", {
        shapeId
      });
    }
  }
}

function getUsers(room) {
  return Array.from(room.users.entries()).map(([socketId, user]) => ({
    socketId,
    userName: user.userName,
    userColor: user.userColor
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

function leaveAllRooms(socket) {
  for (const [roomId, room] of rooms.entries()) {
    if (!room?.users?.has(socket.id)) continue;

    const user = room.users.get(socket.id);

    room.users.delete(socket.id);

    socket.to(roomId).emit("user-left", {
      socketId: socket.id,
      userName: user?.userName || "Používateľ",
      userColor: user?.userColor || "#ef4444",
      users: getUsers(room)
    });

    if (room.users.size === 0) {
      rooms.delete(roomId);
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

    const normalizedUserName =
      String(userName || "").trim() || "Používateľ";

    const room = {
      shapes: Array.isArray(shapes) ? shapes : [],
      locks: new Map(),
      focuses: new Map(),
      users: new Map()
    };

    const userColor = getUserColor(room);

    room.users.set(socket.id, {
      userName: normalizedUserName,
      userColor
    });

    rooms.set(roomId, room);

    socket.join(roomId);

    callback?.({
      success: true,
      roomId,
      shapes: room.shapes,
      lockedShapes: [],
      focusedShapes: [],
      users: getUsers(room),
      userColor
    });

    console.log(`Miestnosť vytvorená: ${roomId}`);
  });

  socket.on("join-room", ({ roomId, userName }, callback) => {
    const normalizedRoomId = String(roomId || "").trim();
    const normalizedUserName =
      String(userName || "").trim() || "Používateľ";

    if (!/^\d{4}$/.test(normalizedRoomId)) {
      callback?.({
        success: false,
        message: "ID miestnosti musí byť 4-ciferné číslo."
      });
      return;
    }

    const room = getRoom(normalizedRoomId);

    if (!room) {
      callback?.({
        success: false,
        message: "Miestnosť neexistuje."
      });
      return;
    }

    const userColor = getUserColor(room);

    room.users.set(socket.id, {
      userName: normalizedUserName,
      userColor
    });

    socket.join(normalizedRoomId);

    callback?.({
      success: true,
      roomId: normalizedRoomId,
      shapes: room.shapes,
      lockedShapes: getLockedShapes(room),
      focusedShapes: getFocusedShapes(room),
      users: getUsers(room),
      userColor
    });

    socket.to(normalizedRoomId).emit("user-joined", {
      socketId: socket.id,
      userName: normalizedUserName,
      userColor,
      users: getUsers(room)
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

    const room = getRoom(normalizedRoomId);

    if (!room || !normalizedShapeId) {
      callback?.({
        success: false,
        message: "Tvar sa nepodarilo zamknúť."
      });
      return;
    }

    const currentUser = room.users?.get(socket.id);

    const normalizedUserName =
      String(userName || "").trim() ||
      currentUser?.userName ||
      "Používateľ";

    const userColor = currentUser?.userColor || "#ef4444";

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
      userName: normalizedUserName,
      userColor
    });

    socket.to(normalizedRoomId).emit("shape-locked", {
      shapeId: normalizedShapeId,
      socketId: socket.id,
      userName: normalizedUserName,
      userColor
    });

    callback?.({
      success: true,
      shapeId: normalizedShapeId,
      socketId: socket.id,
      userName: normalizedUserName,
      userColor
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

  socket.on("shape-focus", ({ roomId, shapeId, userName }) => {
    const normalizedRoomId = String(roomId || "").trim();
    const normalizedShapeId = String(shapeId || "").trim();
    const room = getRoom(normalizedRoomId);

    if (!room || !normalizedShapeId) return;

    if (!room.focuses) {
      room.focuses = new Map();
    }

    const currentUser = room.users?.get(socket.id);
    const normalizedUserName =
      String(userName || "").trim() ||
      currentUser?.userName ||
      "Používateľ";
    const userColor = currentUser?.userColor || "#3b82f6";

    for (const [focusedShapeId, focus] of room.focuses.entries()) {
      if (focus.socketId === socket.id && focusedShapeId !== normalizedShapeId) {
        room.focuses.delete(focusedShapeId);
        socket.to(normalizedRoomId).emit("shape-blurred", {
          shapeId: focusedShapeId
        });
      }
    }

    room.focuses.set(normalizedShapeId, {
      socketId: socket.id,
      userName: normalizedUserName,
      userColor
    });

    socket.to(normalizedRoomId).emit("shape-focused", {
      shapeId: normalizedShapeId,
      socketId: socket.id,
      userName: normalizedUserName,
      userColor
    });
  });

  socket.on("shape-blur", ({ roomId, shapeId }) => {
    const normalizedRoomId = String(roomId || "").trim();
    const normalizedShapeId = String(shapeId || "").trim();
    const room = getRoom(normalizedRoomId);

    if (!room || !normalizedShapeId || !room.focuses) return;

    const currentFocus = room.focuses.get(normalizedShapeId);

    if (!currentFocus || currentFocus.socketId !== socket.id) return;

    room.focuses.delete(normalizedShapeId);

    socket.to(normalizedRoomId).emit("shape-blurred", {
      shapeId: normalizedShapeId
    });
  });

  socket.on("disconnect", () => {
    releaseSocketLocks(socket);
    releaseSocketFocuses(socket);
    leaveAllRooms(socket);

    console.log("Používateľ odpojený:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server beží na porte ${PORT}`);
});
