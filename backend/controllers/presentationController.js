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

/** In-memory generation jobs (short-lived; survives long AI work without holding HTTP open). */
const jobs = {};

const runGenerationJob = (jobId, { prompt, titleRaw, pdfBuffer }) => {
  const updateStatus = (msg) => {
    if (jobs[jobId]) jobs[jobId].status = msg;
  };

  const fail = (err) => {
    if (!jobs[jobId]) return;
    jobs[jobId].error = err?.message || 'Internal Server Error';
    jobs[jobId].isComplete = true;
    if (err?.code !== 'CLIENT_ABORT') {
      console.error('GENERATE JOB ERROR:', err);
      console.error(err?.stack);
    }
  };

  const succeed = (content, generatedTitle) => {
    if (!jobs[jobId]) return;
    jobs[jobId].data = {
      title: generatedTitle,
      slides: content.slides,
      theme: content.theme,
      themeName: content.themeName,
      originalPrompt: content.originalPrompt || prompt
    };
    jobs[jobId].isComplete = true;
    jobs[jobId].status = 'Deck ready — preview on the client.';
  };

  (async () => {
    try {
      let researchFromPdf = null;
      if (pdfBuffer && pdfBuffer.length > 0) {
        updateStatus('Reading PDF Document...');
        const parser = new PDFParse({ data: pdfBuffer });
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
        onStatus: updateStatus
      });

      const generatedTitle = titleRaw || content.title || 'Untitled Presentation';
      succeed(content, generatedTitle);
    } catch (err) {
      fail(err);
    }
  })();
};

const presentationController = {
  generatePresentation: async (req, res) => {
    try {
      const prompt = (req.body?.prompt || '').trim();
      const titleRaw = (req.body?.title || '').trim();

      if (!prompt) {
        return res.status(400).json({
          success: false,
          message: 'Prompt is required'
        });
      }

      const jobId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      jobs[jobId] = {
        status: 'Starting generation...',
        data: null,
        error: null,
        isComplete: false
      };

      const pdfBuffer = req.file?.buffer ? Buffer.from(req.file.buffer) : null;

      res.status(202).json({ jobId });

      runGenerationJob(jobId, { prompt, titleRaw, pdfBuffer });
    } catch (error) {
      console.error('GENERATE ACCEPT ERROR:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: error.message || 'Internal Server Error'
        });
      }
    }
  },

  getGenerationStatus: (req, res) => {
    const { jobId } = req.params;
    const job = jobs[jobId];
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    res.json({
      status: job.status,
      data: job.data,
      error: job.error,
      isComplete: job.isComplete
    });
  },

  exportPresentation: async (req, res) => {
    try {
      console.log('🚀 [EXPORT] Starting PowerPoint generation (controller)...');
      const { title, slides, theme, prompt: promptBody } = req.body || {};
      const promptForDb = typeof promptBody === 'string' ? promptBody.trim() : '';

      if (!Array.isArray(slides) || slides.length === 0) {
        console.log('❌ [EXPORT] Rejected: empty or missing slides array.');
        return res.status(400).json({
          success: false,
          message: 'Request body must include a non-empty slides array'
        });
      }

      const displayTitle =
        typeof title === 'string' && title.trim() ? title.trim() : 'Untitled Presentation';

      console.log(
        `📥 [EXPORT] Request OK — title="${displayTitle}", slides=${slides.length}, theme=${theme ? 'yes' : 'no'}`
      );

      const content = {
        title: displayTitle,
        slides,
        theme: theme && typeof theme === 'object' ? theme : undefined
      };

      console.log('⏳ [EXPORT] Invoking createPowerPointBuffer (service)...');
      const buffer = await createPowerPointBuffer(content);
      const nodeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      console.log(`📊 [EXPORT] PPTX buffer received (${nodeBuf.length} bytes).`);

      const presentationId = crypto.randomBytes(8).toString('hex');
      const filename = `presentation_${presentationId}.pptx`;
      const filePath = path.join(presentationsDir, filename);

      console.log(`💾 [EXPORT] Persisting copy to disk: ${filename}`);
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
        console.log(`✅ [EXPORT] Database row saved (id=${presentationId}).`);
      } catch (dbError) {
        console.error('❌ [EXPORT] Saved to disk but database insert failed:', dbError.message);
      }

      const rawName = displayTitle;
      const safeName = rawName.replace(/[^\w\s\-]+/g, '').replace(/\s+/g, '-').slice(0, 80) || 'slidea-presentation';

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pptx"`);
      console.log(`📤 [EXPORT] Sending PPTX to client as "${safeName}.pptx"...`);
      res.send(nodeBuf);
      console.log('✅ [EXPORT] PowerPoint successfully built and sent to client.');
    } catch (error) {
      console.error('❌ [EXPORT] EXPORT ERROR:', error);
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
