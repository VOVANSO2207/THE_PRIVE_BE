const express = require('express');
const cors = require('cors');
const apartmentRoutes = require('./routes/apartmentRoutes');
const authRoutes = require('./routes/authRoutes');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config(); 
const app = express();

// Danh sách các nguồn gốc được phép
const allowedOrigins = [
  'http://192.168.1.38',
  'http://192.168.1.38:3001',
  'http://192.168.1.38:3000',
  'http://localhost:3001',
  'http://localhost:3000',
  'http://localhost',
  'https://3dtourvietnam.store:3001',
  'https://3dtourvietnam.store'
];

// Cấu hình CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Bị chặn bởi CORS:', origin);
      console.log('Các nguồn gốc được phép:', allowedOrigins);
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
  res.json({ message: 'Welcome to 360 Tour API' });
});

// Tạo server HTTP và gắn Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true }
});

// Lưu thông tin về các phòng và người tạo phòng
const rooms = {}; // { roomId: { creatorId: socket.id, creatorName: userName } }

// Xử lý Socket.IO
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join', ({ roomId, userName }) => {
    console.log(`Join request: ${userName} to room ${roomId}`);
    socket.join(roomId);

    // Nếu phòng chưa tồn tại, lưu người này là người tạo phòng
    if (!rooms[roomId]) {
      rooms[roomId] = {
        creatorId: socket.id,
        creatorName: userName
      };
      console.log(`Room ${roomId} created by ${userName}`);
    } else {
      // Nếu phòng đã tồn tại, gửi thông tin người tạo phòng đến người mới tham gia
      socket.emit('room-creator', { creatorName: rooms[roomId].creatorName });
      // Thông báo cho người tạo phòng rằng có người mới tham gia
      socket.to(roomId).emit('user-joined', { userName });
    }
  });

  socket.on('offer', ({ roomId, offer, userName }) => {
    socket.to(roomId).emit('offer', { offer, userName });
  });

  socket.on('answer', ({ roomId, answer }) => {
    socket.to(roomId).emit('answer', { answer });
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('ice-candidate', { candidate });
  });

  socket.on('leave', ({ roomId }) => {
    socket.to(roomId).emit('user-left');
    socket.leave(roomId);
    console.log(`User left room ${roomId}`);
    // Xóa phòng nếu không còn ai
    if (!io.sockets.adapter.rooms.get(roomId)) {
      delete rooms[roomId];
      console.log(`Room ${roomId} deleted`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Xóa phòng nếu người tạo phòng rời đi
    for (const roomId in rooms) {
      if (rooms[roomId].creatorId === socket.id) {
        socket.to(roomId).emit('user-left');
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted due to creator disconnect`);
        break;
      }
    }
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