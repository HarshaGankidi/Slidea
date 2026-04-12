const express = require('express');
const multer = require('multer');
const router = express.Router();
const presentationController = require('../controllers/presentationController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok = file.mimetype === 'application/pdf' || name.endsWith('.pdf');
    if (ok) cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  }
});

const generateUpload = (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: err.message });
      }
      return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
    }
    next();
  });
};

router.post('/generate', generateUpload, presentationController.generatePresentation);

router.get('/status/:jobId', presentationController.getGenerationStatus);

router.post('/export', presentationController.exportPresentation);

router.get('/history', presentationController.getPresentationHistory);

router.get('/download/:id', presentationController.downloadPresentation);

module.exports = router;
