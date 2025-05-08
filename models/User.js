const { pool } = require('../config/db');

class User {
  // Tìm người dùng theo email
  static async findByEmail(email) {
    try {
      const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
      return rows[0] || null;
    } catch (error) {
      console.error('Error in User.findByEmail:', error);
      throw error;
    }
  }

  // Tạo người dùng mới
  static async create({ username, email, password, role }) {
    try {
      const [result] = await pool.execute(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        [username, email, password, role]
      );
      const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
      return rows[0];
    } catch (error) {
      console.error('Error in User.create:', error);
      throw error;
    }
  }

  // Lưu refresh token
  static async saveRefreshToken(userId, token, expiresAt) {
    try {
      await pool.execute(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        [userId, token, expiresAt]
      );
    } catch (error) {
      console.error('Error in User.saveRefreshToken:', error);
      throw error;
    }
  }
  static async deleteRefreshToken(refreshToken) {
    try {
      const [result] = await pool.execute('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
      return result.affectedRows;
    } catch (error) {
      throw new Error(`Lỗi khi xóa refresh token: ${error.message}`);
    }
  }

  // Tìm refresh token
  static async findRefreshToken(token) {
    try {
      const [rows] = await pool.execute(
        'SELECT rt.*, u.role FROM refresh_tokens rt ' +
        'JOIN users u ON rt.user_id = u.id ' +
        'WHERE rt.token = ? AND rt.expires_at > NOW()',
        [token]
      );
      return rows[0] || null;
    } catch (error) {
      console.error('Error in User.findRefreshToken:', error);
      throw error;
    }
  }
}

module.exports = User;