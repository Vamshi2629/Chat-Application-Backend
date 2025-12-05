const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const cloudinary = require('../config/cloudinary');

// Upload file endpoint
router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'chat-app',
            resource_type: 'auto'
        });

        // Return Cloudinary URL
        res.json({
            url: result.secure_url,
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'File upload failed', error: error.message });
    }
});

// Handle multer errors
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File size exceeds 10MB limit' });
        }
        return res.status(400).json({ message: error.message });
    }
    next(error);
});

module.exports = router;
