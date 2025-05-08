const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const Apartment = require('../models/Apartment'); 

const resizeImage = async (req, res, next) => {
  if (!req.file) {
    console.log('Không có file ảnh mới được upload');
    return next();
  }
  
  try {
    const originalFilePath = path.join('upload', req.file.filename);
    const thumbnailFilePath = path.join('thumbnail', req.file.filename);

    // Xóa ảnh cũ trong cả thumbnail và upload nếu có apartment_id
    if (req.body.apartment_id) {
      try {
        const apartment = await Apartment.getById(req.body.apartment_id);
        if (apartment && apartment.image) {
          const oldThumbnailPath = path.join('thumbnail', apartment.image);
          const oldUploadPath = path.join('upload', apartment.image);

          // Xóa ảnh trong thumbnail
          try {
            await fs.access(oldThumbnailPath);
            await fs.unlink(oldThumbnailPath);
            console.log('Đã xóa ảnh resize cũ trong thumbnail');
          } catch (err) {
            if (err.code !== 'ENOENT') {
              console.error('Lỗi khi xóa ảnh resize cũ trong thumbnail:', err);
            }
          }

          // Xóa ảnh trong upload
          try {
            await fs.access(oldUploadPath);
            await fs.unlink(oldUploadPath);
            console.log('Đã xóa ảnh gốc cũ trong upload');
          } catch (err) {
            if (err.code !== 'ENOENT') {
              console.error('Lỗi khi xóa ảnh gốc cũ trong upload:', err);
            }
          }
        }
      } catch (err) {
        console.error('Lỗi khi lấy thông tin căn hộ:', err);
      }
    }

    // Resize và lưu vào thumbnail
    await sharp(originalFilePath)
      .resize(200, 200, {
        fit: 'contain',
        position: 'center',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .toFormat('jpeg', { quality: 100 })
      .toFile(thumbnailFilePath);

    next();
  } catch (error) {
    console.error('Lỗi khi resize ảnh:', error);
    next(error);
  }
};

module.exports = resizeImage;