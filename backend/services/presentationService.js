require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const PptxGenJS = require('pptxgenjs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const presentationsDir = path.join(__dirname, '../presentations');
if (!fs.existsSync(presentationsDir)) fs.mkdirSync(presentationsDir, { recursive: true });

const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/** Accent + fallbacks for typography on glass panels */
const DECK_THEMES = [
  {
    id: 'midnight-pink',
    name: 'Midnight Pink',
    accent: '#FF0055',
    textMuted: '#94A3B8',
    bg: '#050A1F'
  },
  {
    id: 'corporate-blue',
    name: 'Corporate Blue',
    accent: '#3B82F6',
    textMuted: '#94A3B8',
    bg: '#0B1628'
  },
  {
    id: 'forest-gold',
    name: 'Forest & Gold',
    accent: '#D4AF37',
    textMuted: '#A3B5A8',
    bg: '#0D1A14'
  },
  {
    id: 'sunset-coral',
    name: 'Sunset Coral',
    accent: '#FF6B6B',
    textMuted: '#C4A5AD',
    bg: '#1A0A12'
  },
  {
    id: 'royal-violet',
    name: 'Royal Violet',
    accent: '#A855F7',
    textMuted: '#B8A5D6',
    bg: '#12081F'
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
    "layoutType": "classic_rich" | "split_rich",
    "title": "string",
    "subtitle": "string",
    "detailedParagraph": "string",
    "keyTakeaways": ["string", "string", "string"],
    "speakerNotes": "string",
    "bgKeyword": "string"
  }
]
Rules:
- Produce EXACTLY 8–10 slides. Alternate classic_rich (full glass card) and split_rich (left glass, right open background) for visual rhythm.
- detailedParagraph: 3–4 full sentences of deep analysis or teaching — rich, precise, not shallow.
- keyTakeaways: exactly 3 items; each a specific insight. When Research Context includes PDF or wiki text, root takeaways in that evidence.
- speakerNotes: 2–5 sentences the presenter can read aloud; may reference the research context.
- bgKeyword: short phrase for a cinematic 16:9 abstract corporate background (e.g. "deep blue geometry", "gold particle wave").
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

const BG_W = 1280;
const BG_H = 720;

const buildPollinationsBgUrl = (bgKeyword) => {
  const q = `${String(bgKeyword || 'abstract').trim()} classic elegant abstract deep colors corporate background`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=${BG_W}&height=${BG_H}&nologo=true&seed=${Math.random()}`;
};

const buildPicsumBgUrl = (bgKeyword) => {
  const k = encodeURIComponent((bgKeyword || 'presentation').trim());
  return `https://picsum.photos/seed/${k}/${BG_W}/${BG_H}`;
};

const bufferToJpegDataUrl = (buf) => {
  if (!buf) return null;
  const len = typeof buf.byteLength === 'number' ? buf.byteLength : buf.length;
  if (!len) return null;
  return 'image/jpeg;base64,' + Buffer.from(buf).toString('base64');
};

const fetchPollinationsBackground = async (bgKeyword, signal) => {
  const url = buildPollinationsBgUrl(bgKeyword);
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 6000,
    signal,
    validateStatus: () => true
  });
  if (response.status === 429) {
    const err = new Error('POLLINATIONS_429');
    err.code = 'POLLINATIONS_429';
    throw err;
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`POLLINATIONS_HTTP_${response.status}`);
  }
  const dataUrl = bufferToJpegDataUrl(response.data);
  if (!dataUrl) throw new Error('POLLINATIONS_EMPTY');
  return dataUrl;
};

const fetchPicsumBackground = async (bgKeyword, signal) => {
  const url = buildPicsumBgUrl(bgKeyword);
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 6000,
    signal,
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

const fetchSlideBackground = async (bgKeyword, signal) => {
  if (!bgKeyword || !String(bgKeyword).trim()) return null;
  const k = String(bgKeyword).trim();
  try {
    return await fetchPollinationsBackground(k, signal);
  } catch (err) {
    throwIfAborted(signal);
    try {
      return await fetchPicsumBackground(k, signal);
    } catch (backupErr) {
      throwIfAborted(signal);
      console.error('Background image fallback failed:', backupErr.message);
      return null;
    }
  }
};

const throwIfAborted = (signal) => {
  if (signal?.aborted) {
    const err = new Error('Generation aborted: client disconnected');
    err.code = 'CLIENT_ABORT';
    throw err;
  }
};

const FONT_TITLE = 'Helvetica Neue';
const FONT_BODY = 'Helvetica Neue';

const hexNoHash = (c) => String(c || 'FFFFFF').replace(/^#/, '');

const normalizeTakeaways = (slide) => {
  const raw = slide.keyTakeaways;
  const list = Array.isArray(raw) ? raw.map((x) => String(x || '').trim()).filter(Boolean) : [];
  while (list.length < 3) list.push('Add detail from your research or session Q&A.');
  return list.slice(0, 3);
};

const applySpeakerNotes = (slideObj, slide) => {
  const notes = typeof slide.speakerNotes === 'string' ? slide.speakerNotes.trim() : '';
  if (notes) slideObj.addNotes(notes);
};

/** Full-bleed background + glass panel + rich text (fits 16:9 LAYOUT_16x9) */
const renderClassicRichSlide = (slideObj, slide, theme) => {
  const imageData = slide.imageData;
  const accent = hexNoHash(theme.accent);

  if (imageData) {
    slideObj.addImage({ data: imageData, x: '0%', y: '0%', w: '100%', h: '100%' });
  } else {
    slideObj.background = { color: theme.bg };
  }

  slideObj.addShape('rect', {
    x: '5%',
    y: '5%',
    w: '90%',
    h: '90%',
    fill: { color: '050A1F', transparency: 25 },
    line: { color: 'FFFFFF', pt: 0.75 },
    rectRadius: 0.2
  });

  const x = '8%';
  const w = '84%';

  slideObj.addText(slide.title || 'Masterclass', {
    x,
    y: '8%',
    w,
    h: '9%',
    fontSize: 32,
    color: 'FFFFFF',
    bold: true,
    wrap: true,
    valign: 'top',
    fontFace: FONT_TITLE
  });

  slideObj.addText(slide.subtitle || '', {
    x,
    y: '17%',
    w,
    h: '6%',
    fontSize: 18,
    color: accent,
    bold: true,
    wrap: true,
    valign: 'top',
    fontFace: FONT_TITLE
  });

  slideObj.addText(slide.detailedParagraph || '', {
    x,
    y: '24%',
    w,
    h: '38%',
    fontSize: 14,
    color: 'F1F5F9',
    wrap: true,
    valign: 'top',
    align: 'left',
    fontFace: FONT_BODY
  });

  const bullets = normalizeTakeaways(slide).map((t) => ({
    text: t,
    options: { bullet: true, indentLevel: 0 }
  }));

  slideObj.addText(bullets, {
    x,
    y: '64%',
    w,
    h: '28%',
    fontSize: 12,
    color: 'E2E8F0',
    wrap: true,
    valign: 'top',
    fontFace: FONT_BODY
  });

  applySpeakerNotes(slideObj, slide);
};

/** Left glass column; right side shows open cinematic background */
const renderSplitRichSlide = (slideObj, slide, theme) => {
  const imageData = slide.imageData;
  const accent = hexNoHash(theme.accent);

  if (imageData) {
    slideObj.addImage({ data: imageData, x: '0%', y: '0%', w: '100%', h: '100%' });
  } else {
    slideObj.background = { color: theme.bg };
  }

  slideObj.addShape('rect', {
    x: '5%',
    y: '6%',
    w: '44%',
    h: '88%',
    fill: { color: '050A1F', transparency: 25 },
    line: { color: 'FFFFFF', pt: 0.75 },
    rectRadius: 0.15
  });

  const x = '7%';
  const w = '40%';

  slideObj.addText(slide.title || 'Deep dive', {
    x,
    y: '9%',
    w,
    h: '10%',
    fontSize: 28,
    color: 'FFFFFF',
    bold: true,
    wrap: true,
    valign: 'top',
    fontFace: FONT_TITLE
  });

  slideObj.addText(slide.subtitle || '', {
    x,
    y: '19%',
    w,
    h: '7%',
    fontSize: 16,
    color: accent,
    bold: true,
    wrap: true,
    valign: 'top',
    fontFace: FONT_TITLE
  });

  slideObj.addText(slide.detailedParagraph || '', {
    x,
    y: '27%',
    w,
    h: '40%',
    fontSize: 13,
    color: 'F1F5F9',
    wrap: true,
    valign: 'top',
    align: 'left',
    fontFace: FONT_BODY
  });

  const bullets = normalizeTakeaways(slide).map((t) => ({
    text: t,
    options: { bullet: true, indentLevel: 0 }
  }));

  slideObj.addText(bullets, {
    x,
    y: '68%',
    w,
    h: '22%',
    fontSize: 11,
    color: 'E2E8F0',
    wrap: true,
    valign: 'top',
    fontFace: FONT_BODY
  });

  applySpeakerNotes(slideObj, slide);
};

const renderSlideByLayout = (slideObj, slide, theme) => {
  const layout = slide.layoutType;
  if (layout === 'split_rich') {
    renderSplitRichSlide(slideObj, slide, theme);
  } else {
    renderClassicRichSlide(slideObj, slide, theme);
  }
};

const generateSlidesWithGemini = async (prompt, research, signal) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API Error: Missing GEMINI_API_KEY');
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: geminiModel,
      systemInstruction: `You are a Masterclass Educator and Analyst. You design premium "deep-dive" presentation decks for discerning professionals.

Your job: teach with depth, evidence, and clarity. Use the Research Context (including any PDF-derived text) as primary material when present. Ground keyTakeaways and detailedParagraph in that context.

Output must match this JSON schema exactly (types and field names):
${GEMINI_SLIDE_SCHEMA}`
    });
    throwIfAborted(signal);
    const userText = `Research Context (PDF excerpt, wiki, or none):\n${research || '(none)'}\n\nUser topic / instructions:\n${prompt}\n\nReturn ONLY a raw JSON array.`;
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });
    throwIfAborted(signal);
    const response = await result.response;
    const raw = response.text();
    return parseSlidesJson(raw);
  } catch (err) {
    if (err?.code === 'CLIENT_ABORT') throw err;
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
 * @param {{ researchFromPdf?: string|null, onStatus?: (msg: string) => void, signal?: AbortSignal }} [options]
 */
const generatePresentationContent = async (prompt, options = {}) => {
  const { researchFromPdf = null, onStatus, signal } = options;
  if (!prompt || !prompt.trim()) throw new Error('A prompt is required for generation.');

  const theme = pickRandomTheme();

  let research = '';
  if (researchFromPdf && String(researchFromPdf).trim().length > 0) {
    research = String(researchFromPdf).trim();
  } else {
    research = await fetchResearch(prompt);
  }

  onStatus?.('Gemini is designing the presentation...');
  const slidesData = await generateSlidesWithGemini(prompt, research, signal);

  onStatus?.('Fetching 720p 16:9 backgrounds...');
  const enrichedSlides = [];
  for (const slide of slidesData) {
    throwIfAborted(signal);
    let imageData = null;
    const kw = slide.bgKeyword;
    if (kw && String(kw).trim()) {
      imageData = await fetchSlideBackground(String(kw).trim(), signal);
    }
    enrichedSlides.push({ ...slide, imageData });
    await new Promise((r) => setTimeout(r, 1000));
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
