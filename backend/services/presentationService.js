require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const PptxGenJS = require('pptxgenjs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const presentationsDir = path.join(__dirname, '../presentations');
if (!fs.existsSync(presentationsDir)) fs.mkdirSync(presentationsDir, { recursive: true });

const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/** VC-style palettes — one deck uses one theme end-to-end */
const DECK_THEMES = [
  {
    id: 'midnight-pink',
    name: 'Midnight Pink',
    isDark: true,
    bg: '#050A1F',
    surface: '#0F1428',
    accent: '#FF0055',
    text: '#FFFFFF',
    textMuted: '#8892B0',
    panel: '#F4F4F5',
    panelText: '#0B1020'
  },
  {
    id: 'corporate-blue',
    name: 'Corporate Blue',
    isDark: true,
    bg: '#0B1628',
    surface: '#132238',
    accent: '#3B82F6',
    text: '#FFFFFF',
    textMuted: '#94A3B8',
    panel: '#EEF4FF',
    panelText: '#0F172A'
  },
  {
    id: 'minimal-light',
    name: 'Minimalist Light',
    isDark: false,
    bg: '#FAFAFA',
    surface: '#FFFFFF',
    accent: '#0F172A',
    text: '#0F172A',
    textMuted: '#64748B',
    panel: '#F1F5F9',
    panelText: '#0F172A'
  },
  {
    id: 'forest-gold',
    name: 'Forest & Gold',
    isDark: true,
    bg: '#0D1A14',
    surface: '#152A22',
    accent: '#C9A227',
    text: '#F5F5F0',
    textMuted: '#A3B5A8',
    panel: '#EEF2EA',
    panelText: '#0D1A14'
  },
  {
    id: 'sunset-coral',
    name: 'Sunset Coral',
    isDark: true,
    bg: '#1A0A12',
    surface: '#24101C',
    accent: '#FF6B6B',
    text: '#FFF8F8',
    textMuted: '#C4A5AD',
    panel: '#FFF0ED',
    panelText: '#1A0A12'
  },
  {
    id: 'royal-violet',
    name: 'Royal Violet',
    isDark: true,
    bg: '#12081F',
    surface: '#1C0F2E',
    accent: '#A855F7',
    text: '#FFFFFF',
    textMuted: '#B8A5D6',
    panel: '#F3E8FF',
    panelText: '#12081F'
  }
];

const pickRandomTheme = () => DECK_THEMES[Math.floor(Math.random() * DECK_THEMES.length)];

const stripHtml = (s) =>
  typeof s === 'string' ? s.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim() : '';

const fetchResearch = async (topic) => {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    topic
  )}&utf8=&format=json&srlimit=1&origin=*`;
  try {
    const response = await axios.get(url, {
      timeout: 12000,
      headers: { 'User-Agent': 'Slidea/1.0 (+contact@example.com)' }
    });
    const snippet = response.data?.query?.search?.[0]?.snippet || '';
    return stripHtml(snippet);
  } catch (error) {
    console.error('Wiki fetch failed:', error.message);
    return '';
  }
};

const GEMINI_SLIDE_SCHEMA = `[
  {
    "layoutType": "cover" | "split" | "metrics" | "grid" | "quote" | "agenda",
    "title": "string",
    "bodyText": "string — one punchy line (max ~15 words); quote layout = the quote itself, still brief)",
    "metrics": [{ "number": "string", "label": "string" }],
    "imageKeyword": "short English phrase for a professional stock-style image",
    "quadrants": [{ "title": "string", "body": "string" }],
    "quoteAttribution": "optional string, speaker or source under the quote",
    "agendaItems": [{ "title": "string", "detail": "string" }]
  }
]
Rules:
- Produce EXACTLY 8–10 slides with varied layouts (use each layout type at least once where sensible).
- "metrics": exactly 3 items when layoutType is "metrics".
- "quadrants": exactly 4 items when layoutType is "grid" (TL, TR, BL, BR).
- "agendaItems": 4–6 items when layoutType is "agenda".
- DO NOT write paragraphs. Write punchy, VC-style highlights (maximum 10–15 words per text field: title, bodyText, metric labels, quadrant bodies, agenda details). Use short, powerful phrases. The deck must feel like a premium Apple keynote, not a textbook.
- Return ONLY a raw JSON array, no markdown.`;

const parseSlidesJson = (text) => {
  if (!text || typeof text !== 'string') throw new Error('Empty AI response');
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.slides)) return parsed.slides;
  } catch (_) {}
  const s = text.indexOf('[');
  const e = text.lastIndexOf(']');
  if (s !== -1 && e !== -1 && e > s) {
    const mid = text.slice(s, e + 1);
    const arr = JSON.parse(mid);
    if (Array.isArray(arr)) return arr;
  }
  throw new Error('Invalid JSON format from AI');
};

const buildPollinationsUrl = (keyword) => {
  const k = encodeURIComponent((keyword || 'modern business').trim());
  return `https://image.pollinations.ai/prompt/${k}?width=800&height=800&nologo=true&seed=${Math.random()}`;
};

const buildPicsumUrl = (keyword) => {
  const k = encodeURIComponent((keyword || 'presentation').trim());
  return `https://picsum.photos/seed/${k}/800/800`;
};

const bufferToJpegDataUrl = (buf) => {
  if (!buf) return null;
  const len = typeof buf.byteLength === 'number' ? buf.byteLength : buf.length;
  if (!len) return null;
  return 'image/jpeg;base64,' + Buffer.from(buf).toString('base64');
};

const fetchPollinationsImage = async (keyword) => {
  const url = buildPollinationsUrl(keyword);
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    validateStatus: () => true
  });
  if (response.status === 429) {
    const err = new Error('POLLINATIONS_429');
    err.code = 'POLLINATIONS_429';
    throw err;
  }
  if (response.status < 200 || response.status >= 300) {
    const err = new Error(`POLLINATIONS_HTTP_${response.status}`);
    err.code = 'POLLINATIONS_HTTP';
    throw err;
  }
  const dataUrl = bufferToJpegDataUrl(response.data);
  if (!dataUrl) {
    throw new Error('POLLINATIONS_EMPTY');
  }
  return dataUrl;
};

const fetchPicsumImage = async (keyword) => {
  const url = buildPicsumUrl(keyword);
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: { 'User-Agent': 'Slidea/1.0 (+https://example.com)' }
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`PICSUM_HTTP_${response.status}`);
  }
  const dataUrl = bufferToJpegDataUrl(response.data);
  if (!dataUrl) throw new Error('PICSUM_EMPTY');
  return dataUrl;
};

/**
 * Primary: Pollinations. On any failure: Picsum seeded by keyword. Never throws.
 */
const fetchSlideImage = async (keyword) => {
  if (!keyword || !String(keyword).trim()) return null;
  const k = String(keyword).trim();
  try {
    return await fetchPollinationsImage(k);
  } catch {
    try {
      return await fetchPicsumImage(k);
    } catch (backupErr) {
      console.error('Slide image fallback failed:', backupErr.message);
      return null;
    }
  }
};

const normalizeQuadrants = (slide) => {
  const q = slide.quadrants;
  if (!Array.isArray(q)) return [{ title: 'Q1', body: '' }, { title: 'Q2', body: '' }, { title: 'Q3', body: '' }, { title: 'Q4', body: '' }];
  const pad = (i) => q[i] || { title: `Area ${i + 1}`, body: '' };
  return [pad(0), pad(1), pad(2), pad(3)];
};

const normalizeAgenda = (slide) => {
  const items = slide.agendaItems;
  if (!Array.isArray(items) || items.length === 0) {
    return [
      { title: slide.title || 'Agenda', detail: slide.bodyText || '' },
      { title: 'Next', detail: '' },
      { title: 'Next', detail: '' }
    ];
  }
  return items.slice(0, 5);
};

const FONT_TITLE = 'Helvetica Neue';
const FONT_BODY = 'Helvetica Neue';

const renderCoverSlide = (slideObj, slideData, imageData, theme) => {
  slideObj.background = theme.bg;

  if (imageData) {
    slideObj.addImage({ data: imageData, x: '48%', y: '0%', w: '52%', h: '100%' });
    slideObj.addShape('rect', {
      x: '48%',
      y: '0%',
      w: '52%',
      h: '100%',
      fill: { color: '000000', transparency: 55 }
    });
  } else {
    slideObj.addShape('rect', { x: '48%', y: '0%', w: '52%', h: '100%', fill: theme.accent });
  }

  slideObj.addText(slideData.title || 'Untitled Presentation', {
    x: '5%',
    y: '22%',
    w: '40%',
    fontSize: 48,
    color: theme.isDark ? 'FFFFFF' : theme.text,
    bold: true,
    wrap: true,
    fontFace: FONT_TITLE
  });

  slideObj.addText(slideData.bodyText || '', {
    x: '5%',
    y: '52%',
    w: '40%',
    fontSize: 17,
    color: theme.textMuted,
    wrap: true,
    fontFace: FONT_BODY
  });
};

const renderMetricsSlide = (slideObj, slideData, theme) => {
  slideObj.background = theme.bg;

  slideObj.addText(slideData.title || 'Key Metrics', {
    x: '8%',
    y: '8%',
    w: '84%',
    fontSize: 38,
    color: theme.isDark ? 'FFFFFF' : theme.text,
    bold: true,
    align: 'center',
    wrap: true,
    fontFace: FONT_TITLE
  });

  const metrics = slideData.metrics || [];
  const cards = [
    { x: '7%', y: '36%', w: '26%', h: '48%' },
    { x: '37%', y: '36%', w: '26%', h: '48%' },
    { x: '67%', y: '36%', w: '26%', h: '48%' }
  ];

  const cardFill = theme.surface || '1E293B';
  const cardLine = theme.accent;

  metrics.slice(0, 3).forEach((metric, idx) => {
    const c = cards[idx];
    slideObj.addShape('roundRect', {
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      fill: { color: cardFill.replace(/^#/, '') },
      line: { color: cardLine.replace(/^#/, ''), pt: 1 }
    });
    slideObj.addText(metric.number || '0', {
      x: c.x,
      y: `${parseFloat(c.y) + 8}%`,
      w: c.w,
      h: '22%',
      fontSize: 44,
      color: theme.accent,
      bold: true,
      align: 'center',
      valign: 'middle',
      wrap: true,
      fontFace: FONT_TITLE
    });
    slideObj.addText(metric.label || 'Value', {
      x: c.x,
      y: `${parseFloat(c.y) + 30}%`,
      w: c.w,
      h: '14%',
      fontSize: 14,
      color: theme.textMuted,
      wrap: true,
      align: 'center',
      valign: 'top',
      fontFace: FONT_BODY
    });
  });
};

const SPLIT_LEFT_BG = '#050A1F';

const renderSplitSlide = (slideObj, slideData, imageData, theme) => {
  slideObj.background = SPLIT_LEFT_BG;

  slideObj.addShape('rect', { x: '0%', y: '0%', w: '50%', h: '100%', fill: SPLIT_LEFT_BG });
  slideObj.addShape('rect', { x: '49%', y: '0%', w: '1%', h: '100%', fill: theme.accent });

  if (imageData) {
    slideObj.addImage({ data: imageData, x: '50%', y: '0%', w: '50%', h: '100%' });
    slideObj.addShape('rect', {
      x: '50%',
      y: '0%',
      w: '50%',
      h: '100%',
      fill: { color: '000000', transparency: 55 }
    });
  } else {
    slideObj.addShape('rect', { x: '50%', y: '0%', w: '50%', h: '100%', fill: theme.accent });
  }

  slideObj.addText(slideData.title || 'Analysis', {
    x: '6%',
    y: '16%',
    w: '38%',
    fontSize: 34,
    color: 'FFFFFF',
    bold: true,
    wrap: true,
    fontFace: FONT_TITLE
  });

  slideObj.addText(slideData.bodyText || '', {
    x: '6%',
    y: '32%',
    w: '38%',
    h: '58%',
    fontSize: 15,
    color: theme.textMuted,
    wrap: true,
    valign: 'top',
    align: 'left',
    fontFace: FONT_BODY
  });
};

const renderGridSlide = (slideObj, slideData, theme) => {
  slideObj.background = theme.bg;
  const quads = normalizeQuadrants(slideData);
  const positions = [
    { x: '5%', y: '20%', w: '44%', h: '34%' },
    { x: '51%', y: '20%', w: '44%', h: '34%' },
    { x: '5%', y: '56%', w: '44%', h: '38%' },
    { x: '51%', y: '56%', w: '44%', h: '38%' }
  ];

  slideObj.addText(slideData.title || 'Framework', {
    x: '5%',
    y: '6%',
    w: '90%',
    fontSize: 28,
    color: theme.text,
    bold: true,
    wrap: true,
    fontFace: 'Arial'
  });

  quads.forEach((cell, i) => {
    const p = positions[i];
    slideObj.addShape('rect', {
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      fill: theme.surface,
      line: { color: theme.accent, pt: 0.75 }
    });
    slideObj.addText(cell.title || `Area ${i + 1}`, {
      x: p.x,
      y: p.y,
      w: p.w,
      h: '12%',
      fontSize: 15,
      color: theme.accent,
      bold: true,
      wrap: true,
      align: 'center',
      valign: 'middle',
      fontFace: 'Arial'
    });
    slideObj.addText(cell.body || '', {
      x: p.x,
      y: `${parseFloat(p.y) + 10}%`,
      w: p.w,
      h: `${Math.max(12, parseFloat(p.h) - 12)}%`,
      fontSize: 12,
      color: theme.textMuted,
      wrap: true,
      valign: 'top',
      align: 'center',
      fontFace: 'Arial'
    });
  });
};

const renderQuoteSlide = (slideObj, slideData, theme) => {
  slideObj.background = theme.bg;
  const quote = slideData.bodyText || slideData.title || '"Your story here."';
  const attr = slideData.quoteAttribution || slideData.title || '';

  slideObj.addText(quote, {
    x: '10%',
    y: '28%',
    w: '80%',
    fontSize: 36,
    color: theme.text,
    italic: true,
    align: 'center',
    wrap: true,
    valign: 'middle',
    fontFace: 'Georgia'
  });

  if (attr && attr !== quote) {
    slideObj.addText(`— ${attr}`, {
      x: '10%',
      y: '68%',
      w: '80%',
      fontSize: 18,
      color: theme.accent,
      align: 'center',
      wrap: true,
      fontFace: 'Arial'
    });
  }
};

const renderAgendaSlide = (slideObj, slideData, theme) => {
  slideObj.background = theme.bg;
  const items = normalizeAgenda(slideData);

  slideObj.addText(slideData.title || 'Agenda', {
    x: '8%',
    y: '8%',
    w: '84%',
    fontSize: 34,
    color: theme.text,
    bold: true,
    wrap: true,
    fontFace: 'Arial'
  });

  let y = 22;
  items.forEach((item, idx) => {
    const num = String(idx + 1);
    slideObj.addText(num, {
      x: '8%',
      y: `${y}%`,
      w: '6%',
      fontSize: 28,
      color: theme.accent,
      bold: true,
      fontFace: 'Arial'
    });
    slideObj.addText(item.title || `Item ${num}`, {
      x: '16%',
      y: `${y}%`,
      w: '76%',
      fontSize: 22,
      color: theme.text,
      bold: true,
      wrap: true,
      fontFace: 'Arial'
    });
    slideObj.addText(item.detail || '', {
      x: '16%',
      y: `${y + 7}%`,
      w: '76%',
      h: '8%',
      fontSize: 14,
      color: theme.textMuted,
      wrap: true,
      valign: 'top',
      fontFace: 'Arial'
    });
    y += 16;
  });
};

const generateSlidesWithGemini = async (prompt, research) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API Error: Missing GEMINI_API_KEY');
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: geminiModel,
      systemInstruction: `You are an elite VC Pitch Deck designer. Use the Research Context and the user's Prompt.

Copy discipline (non-negotiable):
- DO NOT write paragraphs. Write punchy, VC-style highlights (maximum 10–15 words per text block).
- Use short, powerful phrases only. The layout must feel like a premium Apple keynote, not a textbook.

${GEMINI_SLIDE_SCHEMA}`
    });
    const userText = `Research Context:\n${research || '(none)'}\n\nPrompt:\n${prompt}\n\nReturn ONLY a raw JSON array.`;
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });
    const response = await result.response;
    const raw = response.text();
    const slides = parseSlidesJson(raw);
    return slides;
  } catch (err) {
    const status = err?.status || err?.response?.status || err?.statusCode;
    if (status === 401 || status === 429) {
      throw new Error('Gemini API Error: Check your API key and quota');
    }
    const msg = typeof err?.message === 'string' ? err.message : 'Unknown error';
    console.error('Gemini generation failed:', msg);
    throw new Error('Gemini API Error: ' + msg);
  }
};

/**
 * @param {string} prompt
 * @param {{ researchFromPdf?: string|null, onStatus?: (msg: string) => void }} [options]
 */
const generatePresentationContent = async (prompt, options = {}) => {
  const { researchFromPdf = null, onStatus } = options;
  if (!prompt || !prompt.trim()) throw new Error('A prompt is required for generation.');

  const theme = pickRandomTheme();

  let research = '';
  if (researchFromPdf && String(researchFromPdf).trim().length > 0) {
    research = String(researchFromPdf).trim();
  } else {
    research = await fetchResearch(prompt);
  }

  onStatus?.('Gemini is designing the presentation...');
  const slidesData = await generateSlidesWithGemini(prompt, research);

  onStatus?.('Fetching high-res background images...');
  const enrichedSlides = [];
  for (const slide of slidesData) {
    let imageData = null;
    const kw = slide.imageKeyword;
    if (kw && String(kw).trim()) {
      imageData = await fetchSlideImage(String(kw).trim());
    }
    enrichedSlides.push({ ...slide, imageData });
    await new Promise((r) => setTimeout(r, 2000));
  }

  return {
    title: prompt,
    slides: enrichedSlides,
    theme,
    themeName: theme.name,
    originalPrompt: prompt
  };
};

const buildPresentation = (content) => {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';

  if (!content || !Array.isArray(content.slides)) {
    throw new Error('Presentation content must contain a valid slides array.');
  }

  const theme = content.theme || pickRandomTheme();

  content.slides.forEach((slide) => {
    const slideObj = pres.addSlide();
    renderSlideByLayout(slideObj, slide, theme);
  });

  return pres;
};

const renderSlideByLayout = (slideObj, slide, theme) => {
  const layout = slide.layoutType;
  const imageData = slide.imageData;

  switch (layout) {
    case 'cover':
      renderCoverSlide(slideObj, slide, imageData, theme);
      break;
    case 'metrics':
      renderMetricsSlide(slideObj, slide, theme);
      break;
    case 'grid':
      renderGridSlide(slideObj, slide, theme);
      break;
    case 'quote':
      renderQuoteSlide(slideObj, slide, theme);
      break;
    case 'agenda':
      renderAgendaSlide(slideObj, slide, theme);
      break;
    case 'split':
    default:
      renderSplitSlide(slideObj, slide, imageData, theme);
      break;
  }
};

const createPowerPoint = async (content, fullPath) => {
  const pres = buildPresentation(content);
  await pres.writeFile({ fileName: fullPath });
  return fullPath;
};

const createPowerPointBuffer = async (content) => {
  const pres = buildPresentation(content);
  return pres.write({ outputType: 'nodebuffer' });
};

module.exports = {
  generatePresentationContent,
  createPowerPoint,
  createPowerPointBuffer
};
