const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost",
    methods: ["GET", "POST"],
    credentials: true
  }
});

let leaderId = null;

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Assign leader role to the first client
  if (!leaderId) {
    leaderId = socket.id;
    socket.emit('role', 'leader');
  } else {
    socket.emit('role', 'follower');
  }

  // Handle krpano actions from the leader
  socket.on('krpano_action', (action) => {
    if (socket.id === leaderId) {
      // Broadcast view or mouse actions to followers
      socket.broadcast.emit('krpano_action', action);
    }
  });

  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socket.id === leaderId) {
      leaderId = null; // Reset leader
    }
  });
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});