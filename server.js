const express = require('express');
const cors = require('cors');
const apartmentRoutes = require('./routes/apartmentRoutes');
const authRoutes = require('./routes/authRoutes');
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
    // Cho phép yêu cầu không có origin (như ứng dụng di động hoặc curl)
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

// Khởi động server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng ${PORT}`);
});