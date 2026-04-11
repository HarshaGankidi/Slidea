require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const { PDFParse } = require('pdf-parse');
const { generatePresentationContent, createPowerPointBuffer } = require('../services/presentationService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const presentationsDir = path.join(__dirname, '../presentations');
if (!fs.existsSync(presentationsDir)) {
  fs.mkdirSync(presentationsDir, { recursive: true });
}

const writeSse = (res, payload) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const presentationController = {
  generatePresentation: async (req, res) => {
    let sseActive = false;
    try {
      const prompt = (req.body?.prompt || '').trim();
      const titleRaw = (req.body?.title || '').trim();

      if (!prompt) {
        return res.status(400).json({
          success: false,
          message: 'Prompt is required'
        });
      }

      sseActive = true;
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      let researchFromPdf = null;
      if (req.file?.buffer) {
        writeSse(res, { type: 'status', message: 'Reading PDF Document...' });
        const parser = new PDFParse({ data: req.file.buffer });
        try {
          await parser.load();
          const textResult = await parser.getText();
          researchFromPdf = (textResult?.text || '').trim().slice(0, 120000);
        } finally {
          await parser.destroy().catch(() => {});
        }
      }

      const content = await generatePresentationContent(prompt, {
        researchFromPdf,
        onStatus: (message) => writeSse(res, { type: 'status', message })
      });

      const generatedTitle = titleRaw || content.title || 'Untitled Presentation';

      writeSse(res, { type: 'status', message: 'Deck ready — preview on the client.' });

      writeSse(res, {
        type: 'complete',
        success: true,
        data: {
          title: generatedTitle,
          slides: content.slides,
          theme: content.theme,
          themeName: content.themeName,
          originalPrompt: content.originalPrompt || prompt
        }
      });
    } catch (error) {
      console.error('GENERATE ERROR:', error);
      console.error(error?.stack);
      if (!sseActive) {
        return res.status(500).json({
          success: false,
          message: error.message || 'Internal Server Error'
        });
      }
      try {
        writeSse(res, {
          type: 'error',
          message: error.message || 'Internal Server Error'
        });
      } catch (writeErr) {
        console.error('SSE error write failed:', writeErr?.message);
      }
    } finally {
      if (sseActive) {
        try {
          res.end();
        } catch (endErr) {
          console.error('SSE end failed:', endErr?.message);
        }
      }
    }
  },

  exportPresentation: async (req, res) => {
    try {
      const { title, slides, theme, prompt: promptBody } = req.body || {};
      const promptForDb = typeof promptBody === 'string' ? promptBody.trim() : '';

      if (!Array.isArray(slides) || slides.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Request body must include a non-empty slides array'
        });
      }

      const displayTitle =
        typeof title === 'string' && title.trim() ? title.trim() : 'Untitled Presentation';

      const content = {
        title: displayTitle,
        slides,
        theme: theme && typeof theme === 'object' ? theme : undefined
      };

      const buffer = await createPowerPointBuffer(content);
      const nodeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

      const presentationId = crypto.randomBytes(8).toString('hex');
      const filename = `presentation_${presentationId}.pptx`;
      const filePath = path.join(presentationsDir, filename);

      await fs.promises.writeFile(filePath, nodeBuf);

      try {
        const query = `
          INSERT INTO presentations (id, title, prompt, filename, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          RETURNING *;
        `;
        await pool.query(query, [
          presentationId,
          displayTitle,
          promptForDb || '(exported deck)',
          filename
        ]);
      } catch (dbError) {
        console.error('Export saved to disk but database insert failed:', dbError.message);
      }

      const rawName = displayTitle;
      const safeName = rawName.replace(/[^\w\s\-]+/g, '').replace(/\s+/g, '-').slice(0, 80) || 'slidea-presentation';

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pptx"`);
      res.send(nodeBuf);
    } catch (error) {
      console.error('EXPORT ERROR:', error);
      console.error(error?.stack);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to export presentation'
        });
      }
    }
  },

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

  downloadPresentation: async (req, res) => {
    try {
      const { id } = req.params;

      const filename = path.join(presentationsDir, `presentation_${id}.pptx`);

      if (!fs.existsSync(filename)) {
        return res.status(404).json({
          success: false,
          message: 'Presentation not found'
        });
      }

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
