const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const authController = {
  register: async (req, res) => {
    const { username, email, password } = req.body;

    try {
      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Vui lòng cung cấp username, email và mật khẩu' });
      }

      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'Email đã được sử dụng' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await User.create({
        username,
        email,
        password: hashedPassword,
        role: 'admin',
      });

      const accessToken = jwt.sign(
        { userId: newUser.id, role: newUser.role },
        process.env.JWT_SECRET,
        { expiresIn: '20s' }
      );

      const refreshToken = jwt.sign(
        { userId: newUser.id },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: '7d' }
      );

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await User.saveRefreshToken(newUser.id, refreshToken, expiresAt);

      res.status(201).json({ accessToken, refreshToken });
    } catch (error) {
      console.error('Error in register:', error);
      res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại' });
    }
  },

  login: async (req, res) => {
    const { email, password } = req.body;

    try {
      // Kiểm tra dữ liệu đầu vào
      if (!email || !password) {
        return res.status(400).json({ error: 'Vui lòng cung cấp email và mật khẩu' });
      }

      // Tìm người dùng theo email
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
      }

      // Kiểm tra mật khẩu
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
      }

      // Tạo access token
      const accessToken = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '20s' }
      );

      // Tạo refresh token
      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: '7d' }
      );

      // Lưu refresh token
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await User.saveRefreshToken(user.id, refreshToken, expiresAt);

      // Trả về token
      res.status(200).json({ accessToken, refreshToken });
    } catch (error) {
      console.error('Error in login:', error);
      res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại' });
    }
  },
  refreshToken: async (req, res) => {
    const { refreshToken } = req.body;
    console.log('Refresh Token nhận được:', refreshToken);
    
    if (!refreshToken) return res.status(401).json({ 
      error: 'Refresh token required',
      requireLogin: true 
    });
  
    try {
      // Xác thực refresh token
      console.log('Đang xác thực refresh token...');
      const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
      console.log('Payload từ refresh token:', payload);
      
      // Kiểm tra token trong database
      console.log('Đang kiểm tra token trong database...');
      const token = await User.findRefreshToken(refreshToken);
      console.log('Kết quả tìm token:', token);
      
      if (!token) {
        console.log('Token không tồn tại hoặc đã hết hạn');
        return res.status(403).json({ 
          error: 'Invalid or expired refresh token',
          requireLogin: true 
        });
      }

      // Lấy thông tin user để có role
      console.log('Đang lấy thông tin user...');
      const user = await User.findById(payload.userId);
      console.log('Thông tin user:', user);
      
      if (!user) {
        console.log('Không tìm thấy user');
        return res.status(403).json({ 
          error: 'User not found',
          requireLogin: true 
        });
      }

      // Tạo access token mới
      console.log('Đang tạo access token mới...');
      const accessToken = jwt.sign(
        { userId: payload.userId, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '20s' }
      );
      console.log('Access token mới đã được tạo');

      // Xóa refresh token cũ
      console.log('Đang xóa refresh token cũ...');
      await User.deleteRefreshToken(refreshToken);
      console.log('Refresh token cũ đã được xóa');
  
      res.status(200).json({ 
        accessToken,
        message: 'Token refreshed successfully'
      });
    } catch (error) {
      console.error('Chi tiết lỗi trong refreshToken:', error);
      if (error.name === 'TokenExpiredError') {
        console.log('Refresh token đã hết hạn');
        return res.status(403).json({ 
          error: 'Refresh token has expired',
          requireLogin: true 
        });
      }
      res.status(403).json({ 
        error: 'Invalid refresh token',
        requireLogin: true 
      });
    }
  },
  logout: async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    try {
      const affectedRows = await User.deleteRefreshToken(refreshToken);
      if (affectedRows === 0) {
        return res.status(404).json({ error: 'Refresh token không hợp lệ hoặc đã hết hạn' });
      }
      res.status(200).json({ message: 'Đăng xuất thành công' });
    } catch (error) {
      console.error('Error in logout:', error);
      res.status(500).json({ error: 'Lỗi máy chủ' });
    }
    
  }
};

module.exports = authController;