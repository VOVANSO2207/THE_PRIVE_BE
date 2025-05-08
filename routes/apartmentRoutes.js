const express = require('express');
const router = express.Router();
const apartmentController = require('../controllers/apartmentController');
const upload = require('../config/multer');
const resizeImage = require('../middleware/imageResize');
const authenticateToken = require('../middleware/auth');
// Routes
router.get('/', apartmentController.getApartment);
router.get('/:id', apartmentController.getApartmentById);
router.put('/:id', upload.single('image'), resizeImage, apartmentController.updateApartment);

module.exports = router;