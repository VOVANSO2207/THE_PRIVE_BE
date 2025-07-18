const express = require('express');
const cors = require('cors');
const apartmentRoutes = require('./routes/apartmentRoutes');
const authRoutes = require('./routes/authRoutes');
const slackRoutes = require('./routes/slackRoutes');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const app = express();

// Danh sách các nguồn gốc được phép
const allowedOrigins = [
    'http://localhost',
    'http://localhost:3000',
    'http://localhost:3001',
    'https://moonwebhub.online',
    'https://apivideo.moonwebhub.online',
    'https://3dtourvietnam.store',
    'https://3dtourvietnam.store:3001'
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
app.use('/api/slack', slackRoutes);
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
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Signaling 
const users = {}; // { socketId: { userName, isVideoOff, isAudioMuted } }
const roomParticipants = {}; // { roomId: Set<socketId> }
const roomCreators = {}; // { roomId: socketId }    
const screenShareRequests = {}; // { roomId: { requesterId, requesterName, timestamp } }
const roomScreenControllers = {}; // { roomId: socketId } - Người đang điều khiển màn hình
const userScreenShareApprovals = {}; // { userId: boolean } - Trạng thái đã được duyệt của user

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
        socket.emit('existing-room-peers', { peers: existingPeersInRoom, creatorId: roomCreators[roomId] });

        roomParticipants[roomId].forEach(participantId => {
            io.to(participantId).emit('new-user-joined', { 
                userId: socket.id,      
                userName,
                isVideoOff: users[socket.id].isVideoOff,
                isAudioMuted: users[socket.id].isAudioMuted,
                creatorId: roomCreators[roomId]
            });
        });

        socket.join(roomId);
        roomParticipants[roomId].add(socket.id);

        // Gửi thông tin về người đang điều khiển màn hình (nếu có)
        if (roomScreenControllers[roomId]) {
            const controllerId = roomScreenControllers[roomId];
            const controllerName = users[controllerId]?.userName || 'Unknown';
            socket.emit('screen-sharing-update', {
                userId: controllerId,
                userName: controllerName,
                isSharing: true
            });
        }

        console.log(`User ${userName} (${socket.id}) joined room ${roomId}. Participants:`, Array.from(roomParticipants[roomId]).map(id => `${users[id]?.userName || 'N/A'} (${id})`));
    });

    socket.on('view-update', ({ roomId, userName, view }) => {
        // Chỉ cho phép người đang điều khiển màn hình gửi cập nhật view
        if (socket.id === roomScreenControllers[roomId]) {
            socket.to(roomId).emit('view-update', { view, userName });
        } else {
            console.log(`View update from ${userName} (${socket.id}) rejected: Not screen controller.`);
        }
    });

    // Thêm sự kiện mới cho đồng bộ scene
    socket.on('scene-update', ({ roomId, userName, scene }) => {
        // Chỉ cho phép người đang điều khiển màn hình gửi cập nhật scene
        if (socket.id === roomScreenControllers[roomId]) {
            console.log(`Scene update from ${userName} (${socket.id}) to room ${roomId}: ${scene}`);
            socket.to(roomId).emit('scene-update', { scene, userName });
        } else {
            console.log(`Scene update from ${userName} (${socket.id}) rejected: Not screen controller.`);
        }
    });

    socket.on('request-room-creator-info', ({ roomId }) => {
        const creatorId = roomCreators[roomId];
        const creatorName = users[creatorId]?.userName || 'Unknown';
        socket.emit('room-creator-info', { creatorId, creatorName });
    });

    // Xử lý yêu cầu chia sẻ màn hình nâng cao
    socket.on('screen-share-request', ({ roomId, requesterId, requesterName }) => {
        console.log(`Screen share request from ${requesterName} (${requesterId}) in room ${roomId}`);
        
        const creatorId = roomCreators[roomId];
        if (!creatorId || !users[creatorId]) {
            console.log(`No room creator found for room ${roomId}`);
            io.to(requesterId).emit('screen-share-approval-response', {
                approved: false,
                approverName: 'System',
                error: 'Không tìm thấy người tạo phòng'
            });
            return;
        }

        // Kiểm tra xem có ai đang điều khiển màn hình không
        if (roomScreenControllers[roomId] && roomScreenControllers[roomId] !== requesterId) {
            const currentControllerName = users[roomScreenControllers[roomId]]?.userName || 'Người dùng khác';
            io.to(requesterId).emit('screen-sharing-conflict', {
                currentControllerName
            });
            return;
        }

        // Lưu yêu cầu vào bộ nhớ
        screenShareRequests[roomId] = {
            requesterId,
            requesterName,
            timestamp: Date.now()
        };
        
        // Gửi yêu cầu đến người tạo phòng
        io.to(creatorId).emit('screen-share-request', {
            requesterId,
            requesterName
        });
        
        console.log(`Screen share request sent to room creator ${users[creatorId].userName} (${creatorId})`);
    });

    // Xử lý phản hồi duyệt chia sẻ màn hình
    socket.on('screen-share-approval-response', ({ roomId, requesterId, approved, approverName }) => {
        console.log(`Screen share approval response: ${approved ? 'APPROVED' : 'REJECTED'} by ${approverName} for requester ${requesterId} in room ${roomId}`);
        
        // Gửi phản hồi đến người yêu cầu
        if (users[requesterId]) {
            io.to(requesterId).emit('screen-share-approval-response', {
                approved,
                approverName
            });
            
            // Nếu được duyệt
            if (approved) {
                // Đánh dấu user này đã được duyệt
                userScreenShareApprovals[requesterId] = true;
                
                // Thiết lập người điều khiển màn hình
                roomScreenControllers[roomId] = requesterId;
                
                const requesterName = users[requesterId]?.userName || 'Unknown';
                
                // Thông báo cho tất cả người trong phòng (trừ người yêu cầu)
                socket.to(roomId).emit('screen-sharing-update', {
                    userId: requesterId,
                    userName: requesterName,
                    isSharing: true
                });
                
                console.log(`Screen sharing approved and activated for ${requesterName} (${requesterId}) in room ${roomId}`);
            }
        }
        
        // Xóa yêu cầu khỏi bộ nhớ
        if (screenShareRequests[roomId] && screenShareRequests[roomId].requesterId === requesterId) {
            delete screenShareRequests[roomId];
        }
    });

    // Xử lý cập nhật trạng thái chia sẻ màn hình
    socket.on('screen-sharing-update', ({ roomId, userName, isSharing }) => {
        console.log(`User ${userName} (${socket.id}) in room ${roomId} screen sharing state: ${isSharing}`);
        
        if (isSharing) {
            // Kiểm tra xem có ai đang điều khiển màn hình không
            if (roomScreenControllers[roomId] && roomScreenControllers[roomId] !== socket.id) {
                const currentControllerName = users[roomScreenControllers[roomId]]?.userName || 'Người dùng khác';
                io.to(socket.id).emit('screen-sharing-conflict', {
                    currentControllerName
                });
                return;
            }

            // Nếu không phải người tạo phòng, kiểm tra xem đã được duyệt chưa
            if (socket.id !== roomCreators[roomId] && !userScreenShareApprovals[socket.id]) {
                console.log(`Screen sharing rejected for ${userName} (${socket.id}): Not approved yet`);
                return;
            }

            // Thiết lập người điều khiển màn hình
            roomScreenControllers[roomId] = socket.id;
        } else {
            // Tắt điều khiển màn hình
            if (roomScreenControllers[roomId] === socket.id) {
                delete roomScreenControllers[roomId];
            }
        }

        // Phát tán cho tất cả người dùng khác trong phòng
        socket.to(roomId).emit('screen-sharing-update', { 
            userId: socket.id, 
            userName, 
            isSharing 
        });
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

            // Xóa yêu cầu chia sẻ màn hình nếu người rời đi là người yêu cầu
            if (screenShareRequests[roomId] && screenShareRequests[roomId].requesterId === socket.id) {
                delete screenShareRequests[roomId];
                console.log(`Removed screen share request from leaving user ${leavingUserName}`);
            }

            // Xóa trạng thái điều khiển màn hình nếu người rời đi đang điều khiển
            if (roomScreenControllers[roomId] === socket.id) {
                delete roomScreenControllers[roomId];
                console.log(`Removed screen controller ${leavingUserName} from room ${roomId}`);
                
                // Thông báo cho tất cả người còn lại
                roomParticipants[roomId].forEach(participantId => {
                    io.to(participantId).emit('screen-sharing-update', { 
                        userId: socket.id, 
                        userName: leavingUserName, 
                        isSharing: false 
                    });
                });
            }

            // Xóa trạng thái duyệt chia sẻ màn hình
            if (userScreenShareApprovals[socket.id]) {
                delete userScreenShareApprovals[socket.id];
            }

            roomParticipants[roomId].forEach(participantId => {
                io.to(participantId).emit('user-left', { userId: socket.id, userName: leavingUserName });
            });

            if (roomParticipants[roomId].size === 0) {
                delete roomParticipants[roomId];
                delete roomCreators[roomId];
                delete screenShareRequests[roomId]; // Xóa yêu cầu chia sẻ màn hình khi phòng trống
                delete roomScreenControllers[roomId]; // Xóa trạng thái điều khiển màn hình
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

                    // Xóa yêu cầu chia sẻ màn hình nếu người disconnect là người yêu cầu
                    if (screenShareRequests[roomId] && screenShareRequests[roomId].requesterId === socket.id) {
                        delete screenShareRequests[roomId];
                        console.log(`Removed screen share request from disconnected user ${disconnectedUserName}`);
                    }

                    // Xóa trạng thái điều khiển màn hình nếu người disconnect đang điều khiển
                    if (roomScreenControllers[roomId] === socket.id) {
                        delete roomScreenControllers[roomId];
                        console.log(`Removed screen controller ${disconnectedUserName} from room ${roomId}`);
                        
                        // Thông báo cho tất cả người còn lại
                        roomParticipants[roomId].forEach(participantId => {
                            io.to(participantId).emit('screen-sharing-update', { 
                                userId: socket.id, 
                                userName: disconnectedUserName, 
                                isSharing: false 
                            });
                        });
                    }

                    // Xóa trạng thái duyệt chia sẻ màn hình
                    if (userScreenShareApprovals[socket.id]) {
                        delete userScreenShareApprovals[socket.id];
                    }

                    roomParticipants[roomId].forEach(participantId => {
                        io.to(participantId).emit('user-left', { userId: socket.id, userName: disconnectedUserName });
                    });

                    if (roomParticipants[roomId].size === 0) {
                        delete roomParticipants[roomId];
                        delete roomCreators[roomId];
                        delete screenShareRequests[roomId]; // Xóa yêu cầu chia sẻ màn hình khi phòng trống
                        delete roomScreenControllers[roomId]; // Xóa trạng thái điều khiển màn hình
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

