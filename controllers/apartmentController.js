const Apartment = require('../models/Apartment');

const apartmentController = {
  getApartment: async (req, res) => {
    try {
      const apartments = await Apartment.getAll();
      res.json(apartments);
    } catch (error) {
      console.error('Error getting apartments:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getApartmentById: async (req, res) => {
    try {
      const { id } = req.params;
      const apartments = await Apartment.getById(id);
      if (!apartments) {
        return res.status(404).json({ error: 'Apartment not found' });
      }
      res.json(apartments);
    } catch (error) {
      console.error('Error getting room by ID:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
  updateApartment: async (req, res) => {
    try {
      console.log('req.body:', req.body); 
      console.log('req.file:', req.file);
      const { id } = req.params;
      const { building_id, apartment_id, title, wall_area, usable_area, image } = req.body;

      // Kiểm tra dữ liệu đầu vào
      if (!building_id || !apartment_id || !title || wall_area == null || usable_area == null) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      const data = {
        building_id,
        apartment_id,
        title,
        wall_area,
        usable_area,
      };

      // Nếu có file ảnh mới, thêm tên file vào data
      if (req.file) {
        data.image = req.file.filename;
      }
      const updatedApartment = await Apartment.update(id, data);
   
      if (!updatedApartment) {
        return res.status(404).json({ error: 'Apartment not found' });
      }

      res.json(updatedApartment);
    } catch (error) {
      console.error('Error updating apartment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = apartmentController;