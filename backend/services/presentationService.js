require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const PptxGenJS = require('pptxgenjs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const THEME = {
  dark: '#050A1F',
  light: '#F4F4F5',
  pink: '#FF0055',
  white: '#FFFFFF',
  gray: '#8892B0'
};

const presentationsDir = path.join(__dirname, '../presentations');
if (!fs.existsSync(presentationsDir)) fs.mkdirSync(presentationsDir, { recursive: true });

const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const stripHtml = (s) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim() : '');

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

const parseSlidesJson = (text) => {
  if (!text || typeof text !== 'string') throw new Error('Empty OpenAI/Gemini response');
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
  const q = `${keyword || 'modern business skyline'} modern professional highly detailed`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=800&height=800&nologo=true`;
};

const fetchSlideImage = async (keyword) => {
  if (!keyword) return null;
  try {
    const url = buildPollinationsUrl(keyword);
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    const base64 = Buffer.from(response.data).toString('base64');
    return 'image/jpeg;base64,' + base64;
  } catch (error) {
    console.error(`Image fetch failed for "${keyword}":`, error.message);
    return null;
  }
};

const renderCoverSlide = (slideObj, slideData, imageData) => {
  slideObj.background = THEME.dark;

  if (imageData) {
    slideObj.addImage({ data: imageData, x: '50%', y: '0%', w: '50%', h: '100%' });
  } else {
    slideObj.addShape('rect', { x: '50%', y: '0%', w: '50%', h: '100%', fill: THEME.pink });
  }

  slideObj.addText(slideData.title || "Untitled Presentation", {
    x: '5%', y: '30%', w: '40%',
    fontSize: 44, color: THEME.white, bold: true, wrap: true, fontFace: 'Arial'
  });

  slideObj.addText(slideData.bodyText || "", {
    x: '5%', y: '60%', w: '40%',
    fontSize: 18, color: THEME.gray, wrap: true, fontFace: 'Arial'
  });
};

const renderMetricsSlide = (slideObj, slideData) => {
  slideObj.background = THEME.dark;

  slideObj.addText(slideData.title || "Key Metrics", {
    x: '10%', y: '10%', w: '80%',
    fontSize: 36, color: THEME.white, bold: true, align: 'center', wrap: true, fontFace: 'Arial'
  });

  const metrics = slideData.metrics || [];
  const xCoords = ['10%', '40%', '70%'];

  metrics.slice(0, 3).forEach((metric, idx) => {
    const x = xCoords[idx];
    slideObj.addText(metric.number || "0", {
      x: x, y: '40%', w: '25%',
      fontSize: 64, color: THEME.pink, bold: true, align: 'center', wrap: true, fontFace: 'Arial'
    });
    slideObj.addText(metric.label || "Value", {
      x: x, y: '65%', w: '25%',
      fontSize: 16, color: THEME.gray, wrap: true, align: 'center', valign: 'top', fontFace: 'Arial'
    });
  });
};

const renderSplitSlide = (slideObj, slideData, imageData) => {
  slideObj.addShape('rect', { x: '0%', y: '0%', w: '50%', h: '100%', fill: THEME.light });

  if (imageData) {
    slideObj.addImage({ data: imageData, x: '50%', y: '0%', w: '50%', h: '100%' });
  } else {
    slideObj.addShape('rect', { x: '50%', y: '0%', w: '50%', h: '100%', fill: THEME.dark });
  }

  slideObj.addText(slideData.title || "Analysis", {
    x: '5%', y: '20%', w: '40%',
    fontSize: 32, color: THEME.dark, bold: true, wrap: true, fontFace: 'Arial'
  });

  slideObj.addText(slideData.bodyText || "", {
    x: '5%', y: '40%', w: '40%', h: '50%',
    fontSize: 16, color: THEME.dark, wrap: true, valign: 'top', align: 'left', fontFace: 'Arial'
  });
};

const generateSlidesWithGemini = async (prompt, research) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("CRITICAL ENV FAILURE: API key is undefined.");
    throw new Error("Gemini API Error: Missing GEMINI_API_KEY");
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: geminiModel,
      systemInstruction:
        'You are an elite VC Pitch Deck designer. Based on the Research Context, generate EXACTLY 8-10 slides. You must return a raw JSON array containing objects with this exact schema: [{ "layoutType": "cover" | "metrics" | "split", "title": "...", "bodyText": "...", "metrics": [{"number": "...", "label": "..."}], "imageKeyword": "..." }]'
    });
    const userText = `Research Context: ${research || '(none)'}\nPrompt: ${prompt}\nReturn ONLY a raw JSON array; no markdown fences.`;
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
      console.error('[ai] gemini_error_status:', status, err?.message);
      throw new Error('Gemini API Error: Check your API key and quota');
    }
    console.error('[ai] gemini_request_error:', err?.message || err);
    const msg = typeof err?.message === 'string' ? err.message : 'Unknown error';
    throw new Error('Gemini API Error: ' + msg);
  }
};

const generatePresentationContent = async (prompt) => {
  if (!prompt || !prompt.trim()) throw new Error('A prompt is required for generation.');

  const research = await fetchResearch(prompt);

  const slidesData = await generateSlidesWithGemini(prompt, research);

  const enrichedSlides = await Promise.all(
    slidesData.map(async (slide) => {
      let imageData = null;
      try {
        imageData = await fetchSlideImage(slide.imageKeyword);
      } catch (e) {
        console.error('[service] image_enrichment_error:', e.message);
        imageData = null;
      }
      return { ...slide, imageData };
    })
  );

  return { title: prompt, slides: enrichedSlides };
};

const createPowerPoint = async (content, fullPath) => {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';

  if (!content || !Array.isArray(content.slides)) {
    throw new Error('Presentation content must contain a valid slides array.');
  }

  content.slides.forEach((slide) => {
    const slideObj = pres.addSlide();
    switch (slide.layoutType) {
      case 'cover':
        renderCoverSlide(slideObj, slide, slide.imageData);
        break;
      case 'metrics':
        renderMetricsSlide(slideObj, slide);
        break;
      case 'split':
        renderSplitSlide(slideObj, slide, slide.imageData);
        break;
      default:
        renderSplitSlide(slideObj, slide, slide.imageData);
        break;
    }
  });

  await pres.writeFile({ fileName: fullPath });
  return fullPath;
};

const generateFallbackContent = () => {
  throw new Error('Fallback disabled');
};

module.exports = {
  generatePresentationContent,
  createPowerPoint,
  generateFallbackContent
};