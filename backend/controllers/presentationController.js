require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const { generatePresentationContent, createPowerPoint, generateFallbackContent } = require('../services/presentationService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create presentations directory if it doesn't exist
const presentationsDir = path.join(__dirname, '../presentations');
if (!fs.existsSync(presentationsDir)) {
  fs.mkdirSync(presentationsDir, { recursive: true });
}

const presentationController = {
  // Generate a new presentation
  generatePresentation: async (req, res) => {
    try {
      const { prompt, title } = req.body;

      if (!prompt) {
        return res.status(400).json({
          success: false,
          message: 'Prompt is required'
        });
      }

      // Generate presentation content
      const content = await generatePresentationContent(prompt);
      const generatedTitle = content.title || title || 'Untitled Presentation';

      // Create PowerPoint file
      const presentationId = require('crypto').randomBytes(8).toString('hex');
      const filename = path.join(presentationsDir, `presentation_${presentationId}.pptx`);
      try {
        await createPowerPoint(content, filename);
      } catch (pptxError) {
        console.error('PowerPoint generation failed, retrying with fallback content:', pptxError);
        const fallbackContent = generateFallbackContent(prompt);
        await createPowerPoint(fallbackContent, filename);
      }

      // Save to database (optional)
      try {
        const query = `
          INSERT INTO presentations (id, title, prompt, filename, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          RETURNING *;
        `;
        
        await pool.query(query, [
          presentationId,
          generatedTitle,
          prompt,
          `presentation_${presentationId}.pptx`
        ]);
        console.log('Presentation saved to database');
      } catch (dbError) {
        console.log('Database not available, presentation saved locally only:', dbError.message);
      }

      res.status(201).json({
        success: true,
        message: 'Presentation generated successfully',
        data: {
          id: presentationId,
          title: generatedTitle,
          prompt: prompt,
          downloadUrl: `/api/presentations/download/${presentationId}`
        }
      });
    } catch (error) {
      console.error('Error generating presentation:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating presentation',
        error: error.message
      });
    }
  },

  // Get presentation history
  getPresentationHistory: async (req, res) => {
    try {
      const query = `
        SELECT id, title, prompt, created_at, filename
        FROM presentations
        ORDER BY created_at DESC
        LIMIT 50;
      `;

      try {
        const result = await pool.query(query);
        res.json({
          success: true,
          data: result.rows || []
        });
      } catch (dbError) {
        console.log('Database not available, returning empty history:', dbError.message);
        // Return empty array if database is not available
        res.json({
          success: true,
          data: []
        });
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching presentation history',
        error: error.message
      });
    }
  },

  // Download a presentation
  downloadPresentation: async (req, res) => {
    try {
      const { id } = req.params;

      const filename = path.join(presentationsDir, `presentation_${id}.pptx`);

      // Check if file exists
      if (!fs.existsSync(filename)) {
        return res.status(404).json({
          success: false,
          message: 'Presentation not found'
        });
      }

      // Send file
      res.download(filename, `presentation_${id}.pptx`, (err) => {
        if (err) {
          console.error('Error downloading file:', err);
        }
      });
    } catch (error) {
      console.error('Error downloading presentation:', error);
      res.status(500).json({
        success: false,
        message: 'Error downloading presentation',
        error: error.message
      });
    }
  }
};

module.exports = presentationController;
