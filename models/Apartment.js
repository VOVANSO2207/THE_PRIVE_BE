const { pool } = require('../config/db');

class Apartment {
  // Get all rooms
  static async getAll() {
    try {
      const [rows] = await pool.execute('SELECT * FROM apartment');
      return rows;
    } catch (error) {
      console.error('Error in Room.getAll:', error);
      throw error;
    }
  }

  // Get room by ID
  static async getById(id) {
    try {
      const [rows] = await pool.execute('SELECT * FROM apartment WHERE apartment_id = ?', [id]);
      return rows[0] || null;
    } catch (error) {
      console.error('Error in Room.getById:', error);
      throw error;
    }
  }
  static async update(id, data) {
    try {
      // Chỉ cập nhật các trường được cung cấp
      const fields = [];
      const values = [];
      
      if (data.building_id) {
        fields.push('building_id = ?');
        values.push(data.building_id);
      }
      if (data.apartment_id) {
        fields.push('apartment_id = ?');
        values.push(data.apartment_id);
      }
      if (data.title) {
        fields.push('title = ?');
        values.push(data.title);
      }
      if (data.wall_area != null) {
        fields.push('wall_area = ?');
        values.push(data.wall_area);
      }
      if (data.usable_area != null) {
        fields.push('usable_area = ?');
        values.push(data.usable_area);
      }
      if (data.image) {
        fields.push('image = ?');
        values.push(data.image);
      }

      if (fields.length === 0) {
        throw new Error('Không có trường nào để cập nhật');
      }

      const query = `UPDATE apartment SET ${fields.join(', ')} WHERE apartment_id = ?`;
      values.push(id);

      const [result] = await pool.execute(query, values);
      if (result.affectedRows === 0) {
        return null; // Không tìm thấy căn hộ để cập nhật
      }

      // Lấy thông tin căn hộ sau khi cập nhật
      const updatedApartment = await this.getById(id);
      return updatedApartment;
    } catch (error) {
      console.error('Error in Apartment.update:', error);
      throw error;
    }
  }
 
}

module.exports = Apartment;