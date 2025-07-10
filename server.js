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
    res.json({ message: 'Welcome to 360 Tour API FOR VIDEO CALL' });
});

// Tạo server HTTP và gắn Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true }
});

// Signaling 
const users = {}; // { socketId: { userName, isVideoOff, isAudioMuted } }
const roomParticipants = {}; // { roomId: Set<socketId> }
const roomCreators = {}; // { roomId: socketId }    

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join', ({ roomId, userName, isVideoOff, isAudioMuted }) => {
        console.log(`Join request: ${userName} (${socket.id}) to room ${roomId} with video: ${isVideoOff}, audio: ${isAudioMuted}`);
        
        // SỬA LỖI: Lưu trạng thái media một cách chính xác khi người dùng tham gia
        users[socket.id] = { 
            userName, 
            isVideoOff: typeof isVideoOff === 'boolean' ? isVideoOff : false, 
            isAudioMuted: typeof isAudioMuted === 'boolean' ? isAudioMuted : false 
        };

        if (!roomParticipants[roomId]) {
            roomParticipants[roomId] = new Set();
            roomCreators[roomId] = socket.id; // Lưu người tạo phòng
        }

        const existingPeersInRoom = [];
        if (roomParticipants[roomId].size > 0) {
            roomParticipants[roomId].forEach(participantId => {
                if (users[participantId]) {
                    existingPeersInRoom.push({
                        userId: participantId,
                        userName: users[participantId].userName,
                        // SỬA LỖI: Gửi đi trạng thái media chính xác của những người đã ở trong phòng
                        isVideoOff: users[participantId].isVideoOff,
                        isAudioMuted: users[participantId].isAudioMuted
                    });
                }
            });
        }
        socket.emit('existing-room-peers', { peers: existingPeersInRoom });

        roomParticipants[roomId].forEach(participantId => {
            io.to(participantId).emit('new-user-joined', { 
                userId: socket.id, 
                userName,
                // SỹA LỖI: Gửi kèm trạng thái ban đầu của người mới
                isVideoOff: users[socket.id].isVideoOff,
                isAudioMuted: users[socket.id].isAudioMuted
            });
        });

        socket.join(roomId);
        roomParticipants[roomId].add(socket.id);

        console.log(`User ${userName} (${socket.id}) joined room ${roomId}. Participants:`, Array.from(roomParticipants[roomId]).map(id => `${users[id]?.userName || 'N/A'} (${id})`));
    });

    socket.on('view-update', ({ roomId, userName, view }) => {
        // Chỉ cho phép người tạo phòng gửi cập nhật view
        if (socket.id === roomCreators[roomId]) {
            socket.to(roomId).emit('view-update', { view, userName });
        } else {
            console.log(`View update from ${userName} (${socket.id}) rejected: Not room creator.`);
        }
    });

    // Thêm sự kiện mới cho đồng bộ scene
    socket.on('scene-update', ({ roomId, userName, scene }) => {
        // Chỉ cho phép người tạo phòng gửi cập nhật scene
        if (socket.id === roomCreators[roomId]) {
            console.log(`Scene update from ${userName} (${socket.id}) to room ${roomId}: ${scene}`);
            socket.to(roomId).emit('scene-update', { scene, userName });
        } else {
            console.log(`Scene update from ${userName} (${socket.id}) rejected: Not room creator.`);
        }
    });

    socket.on('request-room-creator-info', ({ roomId }) => {
        const creatorId = roomCreators[roomId];
        const creatorName = users[creatorId]?.userName || 'Unknown';
        socket.emit('room-creator-info', { creatorId, creatorName });
    });

    socket.on('offer', ({ targetUserId, offer, userName }) => {
        console.log(`Offer from ${userName} (${socket.id}) to ${targetUserId}`);
        io.to(targetUserId).emit('offer', { offer, senderUserId: socket.id, senderUserName: userName });
    });

    socket.on('answer', ({ targetUserId, answer, userName }) => {
        console.log(`Answer from ${userName} (${socket.id}) to ${targetUserId}`);
        io.to(targetUserId).emit('answer', { answer, senderUserId: socket.id, senderUserName: userName });
    });

    socket.on('ice-candidate', ({ targetUserId, candidate, userName }) => {
        if (candidate) {
            io.to(targetUserId).emit('ice-candidate', { candidate, senderUserId: socket.id, senderUserName: userName });
        }
    });

    // SỬA LỖI: Đảm bảo server vẫn nhận và phát tán trạng thái isVideoOff và isAudioMuted
    socket.on('video-status-update', (data) => {
        console.log(`Broadcasting video-status-update from ${data.userName} (${socket.id}) to room ${data.roomId}`);
        // Cập nhật trạng thái trong bộ nhớ server
        if (users[socket.id]) users[socket.id].isVideoOff = data.isVideoOff;
        
        // Phát tán cho tất cả client khác trong phòng
        socket.to(data.roomId).emit('video-status-update', {
            userId: socket.id,
            userName: data.userName,
            isVideoOff: data.isVideoOff
        });
        console.log(`Recipients in room ${data.roomId}:`, Array.from(roomParticipants[data.roomId] || []).map(id => `${users[id]?.userName || 'N/A'} (${id})`));
    });

    socket.on('audio-status-update', (data) => {
        console.log(`Broadcasting audio-status-update from ${data.userName} (${socket.id}) to room ${data.roomId}`);
        // Cập nhật trạng thái trong bộ nhớ server
        if (users[socket.id]) users[socket.id].isAudioMuted = data.isAudioMuted;
        
        // Phát tán cho tất cả client khác trong phòng
        socket.to(data.roomId).emit('audio-status-update', {
            userId: socket.id,
            userName: data.userName,
            isAudioMuted: data.isAudioMuted
        });
        console.log(`Recipients in room ${data.roomId}:`, Array.from(roomParticipants[data.roomId] || []).map(id => `${users[id]?.userName || 'N/A'} (${id})`));
    });
    
    socket.on('screen-sharing-update', ({ roomId, userName, isSharing }) => {
        console.log(`User ${userName} in room ${roomId} screen sharing state: ${isSharing}`);
        socket.to(roomId).emit('screen-sharing-update', { userId: socket.id, userName, isSharing });
    });

    socket.on('action-perform', ({ roomId, userName, type, position, target, deltaX, deltaY }) => {
        socket.to(roomId).emit('action-perform', { type, position, target, deltaX, deltaY, userName });
    });

    socket.on('speaking-status-update', ({ roomId, userId, isSpeaking }) => {
        socket.to(roomId).emit('speaking-status-update', { userId, isSpeaking });
    });
    
    socket.on('url-change', ({ roomId, userName, url }) => {
        socket.to(roomId).emit('url-change', { url, userName });
    });

    socket.on('remote-tour-state-update', ({ roomId, userName, state }) => {
        console.log(`remote-tour-state-update from ${userName} in room ${roomId}:`, state);
        socket.to(roomId).emit('remote-tour-state-update', { state, userName });
    });

    socket.on('remote-control-toggle', ({ roomId, userName, isActive }) => {
        socket.to(roomId).emit('remote-control-toggle', { userId: socket.id, userName, isActive });
    });

    socket.on('cursor-move', ({ roomId, userName, x, y }) => {
        // Gửi cho tất cả client khác trong phòng (trừ người gửi)
        socket.to(roomId).emit('cursor-move', { userId: socket.id, userName, x, y });
    });

    socket.on('clear-remote-cursor', ({ roomId }) => {
        socket.to(roomId).emit('clear-remote-cursor');
    });

    socket.on('leave', ({ roomId }) => {
        const leavingUserName = users[socket.id]?.userName;
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
                delete roomCreators[roomId];
                console.log(`Room ${roomId} deleted as it's empty.`);
            }
            console.log(`Room ${roomId} participants after leave:`, Array.from(roomParticipants[roomId] || []).map(id => `${users[id]?.userName || 'N/A'} (${id})`));
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        const disconnectedUserName = users[socket.id]?.userName;
        if (disconnectedUserName) {
            for (const roomId in roomParticipants) {
                if (roomParticipants[roomId].has(socket.id)) {
                    roomParticipants[roomId].delete(socket.id);

                    roomParticipants[roomId].forEach(participantId => {
                        io.to(participantId).emit('user-left', { userId: socket.id, userName: disconnectedUserName });
                    });

                    if (roomParticipants[roomId].size === 0) {
                        delete roomParticipants[roomId];
                        delete roomCreators[roomId];
                        console.log(`Room ${roomId} deleted due to disconnect, was empty.`);
                    }
                    console.log(`Room ${roomId} participants after disconnect:`, Array.from(roomParticipants[roomId] || []).map(id => `${users[id]?.userName || 'N/A'} (${id})`));
                    break;
                }
            }
        }
        delete users[socket.id];
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

