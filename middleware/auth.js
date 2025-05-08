// middleware/auth.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Lấy token từ header "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Access token required', requireLogin: true });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Payload:', payload); // In ra payload để kiểm tra
        req.user = payload; // Lưu thông tin user vào request
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Access token has expired', requireLogin: true });
        }
        return res.status(403).json({ error: 'Invalid access token', requireLogin: true });
    }
};

module.exports = authenticateToken;