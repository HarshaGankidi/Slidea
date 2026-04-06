const express = require('express');
const router = express.Router();
const presentationController = require('../controllers/presentationController');

// Route to generate a presentation
router.post('/generate', presentationController.generatePresentation);

// Route to get presentation history
router.get('/history', presentationController.getPresentationHistory);

// Route to download a presentation
router.get('/download/:id', presentationController.downloadPresentation);

module.exports = router;
