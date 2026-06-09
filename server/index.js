import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

app.use(cors());

const httpServer = createServer(app);

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

io.on("connection", (socket) => {
  console.log("Používateľ pripojený:", socket.id);

  socket.on("create-room", ({ shapes }, callback) => {
    let roomId = generateRoomId();

    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }

    rooms.set(roomId, {
      shapes: Array.isArray(shapes) ? shapes : []
    });

    socket.join(roomId);

    callback({
      success: true,
      roomId,
      shapes: rooms.get(roomId).shapes
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

    if (!rooms.has(normalizedRoomId)) {
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
      shapes: rooms.get(normalizedRoomId).shapes
    });

    console.log(
      `Používateľ ${socket.id} sa pripojil do miestnosti ${normalizedRoomId}`
    );
  });

  socket.on("canvas-update", ({ roomId, shapes }) => {
    const normalizedRoomId = String(roomId || "").trim();

    if (!rooms.has(normalizedRoomId)) return;
    if (!Array.isArray(shapes)) return;

    rooms.set(normalizedRoomId, { shapes });

    socket.to(normalizedRoomId).emit("canvas-update", {
      shapes
    });
  });

  socket.on("disconnect", () => {
    console.log("Používateľ odpojený:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server beží na porte ${PORT}`);
});