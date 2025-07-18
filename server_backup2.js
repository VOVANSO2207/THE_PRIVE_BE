// Original file: pasted_content.txt (server.js)
// Updated by Manus to support multi-party video calls (mesh architecture)

const express = require('express');
const cors = require('cors');
const apartmentRoutes = require('./routes/apartmentRoutes'); // Assuming these routes exist and are correct
const authRoutes = require('./routes/authRoutes'); // Assuming these routes exist and are correct
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const app = express();

// Danh sách các nguồn gốc được phép
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:3000',
  'http://localhost',
  'https://3dtourvietnam.store:3001',
  'https://3dtourvietnam.store'
  // Add any other origins if necessary, or use a more flexible approach for development
];

// Cấu hình CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Bị chặn bởi CORS:', origin);
      callback(new Error('Bị chặn bởi CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ file tĩnh
app.use('/upload', express.static('upload'));

// Routes
app.use('/api/apartments', apartmentRoutes);
app.use('/api/auth', authRoutes);

// Middleware xử lý lỗi
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Có lỗi xảy ra!', error: err.message });
});

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to 360 Tour API - Updated for Multi-Party Video' });
});

// Tạo server HTTP và gắn Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true }
});

// --- Updated WebRTC Signaling Logic for Multi-Party ---
const users = {}; // { socketId: userName }
const roomParticipants = {}; // { roomId: Set<socketId> }

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join', ({ roomId, userName }) => {
    console.log(`Join request: ${userName} (${socket.id}) to room ${roomId}`);
    users[socket.id] = userName;

    if (!roomParticipants[roomId]) {
      roomParticipants[roomId] = new Set();
    }

    const existingPeersInRoom = [];
    if (roomParticipants[roomId].size > 0) {
      roomParticipants[roomId].forEach(participantId => {
        if (users[participantId]) { // Ensure user data exists
          existingPeersInRoom.push({ userId: participantId, userName: users[participantId] });
        }
      });
    }
    socket.emit('existing-room-peers', { peers: existingPeersInRoom });

    roomParticipants[roomId].forEach(participantId => {
      io.to(participantId).emit('new-user-joined', { userId: socket.id, userName: userName });
    });

    socket.join(roomId);
    roomParticipants[roomId].add(socket.id);

    console.log(`User ${userName} (${socket.id}) joined room ${roomId}. Participants:`, Array.from(roomParticipants[roomId]).map(id => `${users[id]} (${id})`));
  });

  socket.on('offer', ({ targetUserId, offer, userName }) => { // userName is the sender's name
    console.log(`Offer from ${userName} (${socket.id}) to ${targetUserId}`);
    io.to(targetUserId).emit('offer', { offer, senderUserId: socket.id, senderUserName: userName });
  });

  socket.on('answer', ({ targetUserId, answer, userName }) => { // userName is the sender's name
    console.log(`Answer from ${userName} (${socket.id}) to ${targetUserId}`);
    io.to(targetUserId).emit('answer', { answer, senderUserId: socket.id, senderUserName: userName });
  });

  socket.on('ice-candidate', ({ targetUserId, candidate, userName }) => { // userName is the sender's name
    // console.log(`ICE candidate from ${userName} (${socket.id}) to ${targetUserId}`);
    if (candidate) {
      io.to(targetUserId).emit('ice-candidate', { candidate, senderUserId: socket.id, senderUserName: userName });
    }
  });

  socket.on('leave', ({ roomId }) => {
    const leavingUserName = users[socket.id];
    console.log(`User ${leavingUserName} (${socket.id}) leaving room ${roomId}`);
    
    if (roomParticipants[roomId]) {
      socket.leave(roomId);
      roomParticipants[roomId].delete(socket.id);
      delete users[socket.id];

      roomParticipants[roomId].forEach(participantId => {
        io.to(participantId).emit('user-left', { userId: socket.id, userName: leavingUserName });
      });

      if (roomParticipants[roomId].size === 0) {
        delete roomParticipants[roomId];
        console.log(`Room ${roomId} deleted as it's empty.`);
      }
      console.log(`Room ${roomId} participants after leave:`, Array.from(roomParticipants[roomId] || []).map(id => `${users[id]} (${id})`));
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const disconnectedUserName = users[socket.id];
    if (disconnectedUserName) {
      for (const roomId in roomParticipants) {
        if (roomParticipants[roomId].has(socket.id)) {
          roomParticipants[roomId].delete(socket.id);
          
          roomParticipants[roomId].forEach(participantId => {
            io.to(participantId).emit('user-left', { userId: socket.id, userName: disconnectedUserName });
          });

          if (roomParticipants[roomId].size === 0) {
            delete roomParticipants[roomId];
            console.log(`Room ${roomId} deleted due to disconnect, was empty.`);
          }
          console.log(`Room ${roomId} participants after disconnect:`, Array.from(roomParticipants[roomId] || []).map(id => `${users[id]} (${id})`));
          break; 
        }
      }
    }
    delete users[socket.id];
  });

  // Handle screen sharing state propagation if needed, current client logic might handle it via WebRTC track replacement
  socket.on('screen-sharing', ({ roomId, isSharing, userName }) => {
    console.log(`User ${userName} in room ${roomId} screen sharing state: ${isSharing}`);
    // Broadcast this to other users in the room if UI needs to reflect this explicitly
    // For example, to show an icon next to the user's name
    socket.to(roomId).emit('screen-sharing-update', { userId: socket.id, userName, isSharing });
  });

});

// Khởi động server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng ${PORT}`);
});

// Xử lý lỗi server
server.on('error', (err) => {
  console.error('Server error:', err);
});


