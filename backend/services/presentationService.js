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

const GEMINI_SLIDE_SCHEMA = `{
  "theme": {
    "name": "string",
    "bgColor": "RRGGBB hex without #",
    "primaryText": "RRGGBB hex without #",
    "accentColor": "RRGGBB hex without #",
    "fontFace": "Helvetica Neue"
  },
  "slides": [
    {
      "layoutType": "classic_rich" | "split_rich" | "chart_pie" | "chart_bar",
      "title": "string",
      "subtitle": "string",
      "detailedParagraph": "string",
      "keyTakeaways": ["string", "string", "string"],
      "speakerNotes": "string",
      "bgKeyword": "string",
      "chartData": { "chartTitle": "string", "labels": ["A", "B", "C", "D"], "values": [10, 20, 30, 40] }
    }
  ]
}
Rules:
- You are also the Art Director: invent a completely custom, visually stunning color palette and font pairing that perfectly matches the mood and industry of the user's prompt. Ensure high contrast (readable primaryText on glass over bgColor). theme.fontFace may be a common system font (e.g. Helvetica Neue, Georgia, Arial).
- Produce EXACTLY between 10 and 14 slides in "slides". **Adapt layouts to the user's prompt:** financials/metrics/KPIs → heavily favor chart_pie and chart_bar; narrative/story/vision → favor classic_rich and split_rich.
- For chart_pie or chart_bar: chartData REQUIRED (4–8 labels, matching values).
- For classic_rich and split_rich: chartData omitted or null; keyTakeaways as before.
- detailedParagraph, speakerNotes, bgKeyword as before.
- Return ONLY valid JSON: one object with "theme" and "slides". No markdown.`;

const parseHex6 = (val) => {
  const h = String(val ?? '')
    .replace(/^#/, '')
    .trim();
  if (/^[0-9A-Fa-f]{6}$/.test(h)) return h.toUpperCase();
  return null;
};

/**
 * @returns {{ slides: object[], theme: object|null }}
 */
const parsePresentationJson = (text) => {
  if (!text || typeof text !== 'string') throw new Error('Empty AI response');
  const normalize = (parsed) => {
    if (Array.isArray(parsed)) return { slides: parsed, theme: null };
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.slides)) {
      return { slides: parsed.slides, theme: parsed.theme || null };
    }
    throw new Error('Invalid shape');
  };
  try {
    return normalize(JSON.parse(text));
  } catch (_) {}
  const o = text.indexOf('{');
  const oEnd = text.lastIndexOf('}');
  if (o !== -1 && oEnd > o) {
    try {
      return normalize(JSON.parse(text.slice(o, oEnd + 1)));
    } catch (_) {}
  }
  const s = text.indexOf('[');
  const e = text.lastIndexOf(']');
  if (s !== -1 && e !== -1 && e > s) {
    const mid = text.slice(s, e + 1);
    const arr = JSON.parse(mid);
    if (Array.isArray(arr)) return { slides: arr, theme: null };
  }
  throw new Error('Invalid JSON format from AI');
};

/** Direct Pollinations URL (no fetch/embed — keeps JSON small and preview valid). */
const buildSlideBackgroundImageUrl = (bgKeyword) => {
  const q = String(bgKeyword || 'abstract').trim() || 'abstract';
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=1280&height=720&nologo=true&seed=${Math.random()}`;
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

/** Merge AI Art Director theme with deck fallback (invalid AI hex → fallback). */
const mergeAiTheme = (aiTheme, fallback) => {
  const fb = fallback || pickRandomTheme();
  if (!aiTheme || typeof aiTheme !== 'object') {
    return {
      id: fb.id,
      name: fb.name,
      accent: fb.accent,
      bg: fb.bg,
      primaryText: '#F8FAFC',
      textMuted: fb.textMuted,
      fontFace: FONT_TITLE
    };
  }
  const name = typeof aiTheme.name === 'string' && aiTheme.name.trim() ? aiTheme.name.trim() : fb.name;
  const bgHex = parseHex6(aiTheme.bgColor) || hexNoHash(fb.bg);
  const accentHex = parseHex6(aiTheme.accentColor) || hexNoHash(fb.accent);
  const primaryHex = parseHex6(aiTheme.primaryText) || 'F8FAFC';
  const fontFace =
    typeof aiTheme.fontFace === 'string' && aiTheme.fontFace.trim()
      ? aiTheme.fontFace.trim()
      : FONT_TITLE;
  return {
    id: 'ai-directed',
    name,
    accent: `#${accentHex}`,
    bg: `#${bgHex}`,
    primaryText: `#${primaryHex}`,
    textMuted: fb.textMuted,
    fontFace
  };
};

/** Shrink-to-fit + wrap; valign top keeps stacked regions from bleeding together. */
const TEXT_FIT = { autoFit: true, breakLine: true, wrap: true, valign: 'top' };

const textOpts = (props) => ({ ...TEXT_FIT, ...props });

const chartColorPalette = (theme) => {
  const a = hexNoHash(theme.accent);
  const p = hexNoHash(theme.primaryText);
  return [a, p, '3B82F6', 'D4AF37', 'A855F7', '14B8A6', 'F97316', 'EC4899'];
};

const normalizeChartData = (slide) => {
  const cd = slide.chartData;
  if (!cd || typeof cd !== 'object') return null;
  let labels = Array.isArray(cd.labels) ? cd.labels.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
  let values = Array.isArray(cd.values)
    ? cd.values.map((v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      })
    : [];
  const n = Math.min(labels.length, values.length);
  labels = labels.slice(0, n);
  values = values.slice(0, n);
  while (labels.length < 4) {
    const i = labels.length + 1;
    labels.push(`Segment ${i}`);
    values.push(Math.round(12 + i * 7));
  }
  const cap = 12;
  if (labels.length > cap) {
    labels = labels.slice(0, cap);
    values = values.slice(0, cap);
  }
  const chartTitle =
    typeof cd.chartTitle === 'string' && cd.chartTitle.trim()
      ? cd.chartTitle.trim()
      : String(slide.title || 'Data').trim() || 'Data';
  return { chartTitle, labels, values };
};

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
  const accent = hexNoHash(theme.accent);

  const ff = theme.fontFace || FONT_TITLE;
  const primary = hexNoHash(theme.primaryText);
  const muted = hexNoHash(theme.textMuted);

  slideObj.addShape('rect', {
    x: '5%',
    y: '5%',
    w: '90%',
    h: '90%',
    fill: { color: hexNoHash(theme.bg), transparency: 25 },
    line: { color: primary, pt: 0.75 },
    rectRadius: 0.2
  });

  slideObj.addText(
    slide.title || 'Masterclass',
    textOpts({
      x: '10%',
      y: '12%',
      w: '80%',
      h: '15%',
      fontSize: 28,
      color: primary,
      bold: true,
      fontFace: ff
    })
  );

  slideObj.addText(
    slide.subtitle || '',
    textOpts({
      x: '10%',
      y: '25%',
      w: '80%',
      h: '8%',
      fontSize: 18,
      color: accent,
      bold: true,
      fontFace: ff
    })
  );

  slideObj.addText(
    slide.detailedParagraph || '',
    textOpts({
      x: '10%',
      y: '35%',
      w: '80%',
      h: '25%',
      fontSize: 17,
      color: primary,
      align: 'left',
      fontFace: ff
    })
  );

  const bullets = normalizeTakeaways(slide).map((t) => ({
    text: t,
    options: { bullet: true, indentLevel: 0, breakLine: true, autoFit: true }
  }));

  slideObj.addText(
    bullets,
    textOpts({
      x: '10%',
      y: '62%',
      w: '80%',
      h: '25%',
      fontSize: 14,
      color: muted,
      bullet: true,
      fontFace: ff
    })
  );

  applySpeakerNotes(slideObj, slide);
};

/** Left glass column; right side shows open cinematic background */
const renderSplitRichSlide = (slideObj, slide, theme) => {
  const accent = hexNoHash(theme.accent);

  const ff = theme.fontFace || FONT_TITLE;
  const primary = hexNoHash(theme.primaryText);
  const muted = hexNoHash(theme.textMuted);

  slideObj.addShape('rect', {
    x: '5%',
    y: '6%',
    w: '44%',
    h: '88%',
    fill: { color: hexNoHash(theme.bg), transparency: 25 },
    line: { color: primary, pt: 0.75 },
    rectRadius: 0.15
  });

  /** Same vertical grid as classic; x/w keep copy inside the left glass (≈5%–49%). */
  const sx = '7%';
  const sw = '40%';

  slideObj.addText(
    slide.title || 'Deep dive',
    textOpts({
      x: sx,
      y: '12%',
      w: sw,
      h: '15%',
      fontSize: 24,
      color: primary,
      bold: true,
      fontFace: ff
    })
  );

  slideObj.addText(
    slide.subtitle || '',
    textOpts({
      x: sx,
      y: '25%',
      w: sw,
      h: '8%',
      fontSize: 16,
      color: accent,
      bold: true,
      fontFace: ff
    })
  );

  slideObj.addText(
    slide.detailedParagraph || '',
    textOpts({
      x: sx,
      y: '35%',
      w: sw,
      h: '25%',
      fontSize: 15,
      color: primary,
      align: 'left',
      fontFace: ff
    })
  );

  const bullets = normalizeTakeaways(slide).map((t) => ({
    text: t,
    options: { bullet: true, indentLevel: 0, breakLine: true, autoFit: true }
  }));

  slideObj.addText(
    bullets,
    textOpts({
      x: sx,
      y: '62%',
      w: sw,
      h: '25%',
      fontSize: 12,
      color: muted,
      bullet: true,
      fontFace: ff
    })
  );

  applySpeakerNotes(slideObj, slide);
};

/**
 * Chart slides: hard-coded inch grid on LAYOUT_16x9 (10" × 5.625") — left column text, right column chart (no % overlap).
 */
const renderChartSlide = (pres, slideObj, slide, theme) => {
  const accent = hexNoHash(theme.accent);
  const layout = slide.layoutType;
  const chartKind = layout === 'chart_bar' ? pres.charts.BAR : pres.charts.PIE;
  const cd = normalizeChartData(slide);
  const palette = chartColorPalette(theme);
  const ff = theme.fontFace || FONT_TITLE;
  const primary = hexNoHash(theme.primaryText);
  const plotFill = hexNoHash(theme.bg);

  const GL = { x: 0.5, y: 0.32, w: 9.0, h: 5.05 };
  const TITLE = { x: 0.55, y: 0.36, w: 8.9, h: 0.48 };
  const SUB = { x: 0.55, y: 0.88, w: 8.9, h: 0.36 };
  const TEXT_COL = { x: 0.55, y: 1.32, w: 4.35, h: 3.85 };
  const CHART_COL = { x: 5.08, y: 1.32, w: 4.37, h: 3.85 };

  slideObj.addShape('rect', {
    x: GL.x,
    y: GL.y,
    w: GL.w,
    h: GL.h,
    fill: { color: hexNoHash(theme.bg), transparency: 25 },
    line: { color: primary, pt: 0.75 },
    rectRadius: 0.2
  });

  slideObj.addText(
    slide.title || 'Insight',
    textOpts({
      x: TITLE.x,
      y: TITLE.y,
      w: TITLE.w,
      h: TITLE.h,
      fontSize: 22,
      color: primary,
      bold: true,
      fontFace: ff
    })
  );

  slideObj.addText(
    slide.subtitle || '',
    textOpts({
      x: SUB.x,
      y: SUB.y,
      w: SUB.w,
      h: SUB.h,
      fontSize: 14,
      color: accent,
      bold: true,
      fontFace: ff
    })
  );

  slideObj.addText(
    slide.detailedParagraph || '',
    textOpts({
      x: TEXT_COL.x,
      y: TEXT_COL.y,
      w: TEXT_COL.w,
      h: TEXT_COL.h,
      fontSize: 14,
      color: primary,
      align: 'left',
      fontFace: ff,
      autoFit: true,
      breakLine: true,
      valign: 'top',
      wrap: true
    })
  );

  if (cd) {
    const series = [
      {
        name: cd.chartTitle,
        labels: cd.labels,
        values: cd.values
      }
    ];
    const chartOpts = {
      x: CHART_COL.x,
      y: CHART_COL.y,
      w: CHART_COL.w,
      h: CHART_COL.h,
      showLegend: true,
      legendPos: 'b',
      showTitle: false,
      chartColors: palette,
      plotArea: { fill: { color: plotFill, transparency: 35 } }
    };
    if (chartKind === pres.charts.BAR) {
      chartOpts.barDir = 'col';
      chartOpts.barGrouping = 'clustered';
    }
    slideObj.addChart(chartKind, series, chartOpts);
  }

  applySpeakerNotes(slideObj, slide);
};

const renderSlideByLayout = (pres, slideObj, slide, theme) => {
  const layout = slide.layoutType;
  if (layout === 'chart_pie' || layout === 'chart_bar') {
    renderChartSlide(pres, slideObj, slide, theme);
  } else if (layout === 'split_rich') {
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
      systemInstruction: `You are a Masterclass Educator, Analyst, and Art Director. You design premium "deep-dive" presentation decks for discerning professionals.

As Art Director: invent a completely custom, visually stunning color palette and font pairing in "theme" that perfectly matches the mood and industry of the user's prompt. Ensure high contrast between bgColor, primaryText, and accentColor.

Your job: teach with depth, evidence, and clarity. Use the Research Context (including any PDF-derived text) as primary material when present. Ground keyTakeaways and detailedParagraph in that context.

Generate a highly comprehensive presentation: EXACTLY 10 to 14 slides in "slides". Leave no stone unturned from the provided context.

Use layoutType classic_rich, split_rich, chart_pie, or chart_bar. Match the user's intent: financial/analytical prompts → mostly chart_pie and chart_bar; story/vision/narrative prompts → mostly classic_rich and split_rich. For chart layouts you MUST include chartData with realistic labels and numeric values.

Output must match this JSON schema (types and field names):
${GEMINI_SLIDE_SCHEMA}`
    });
    throwIfAborted(signal);
    const userText = `Research Context (PDF excerpt, wiki, or none):\n${research || '(none)'}\n\nUser topic / instructions:\n${prompt}\n\nReturn ONLY a JSON object with "theme" and "slides" as specified. No markdown.`;
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 8192
      }
    });
    throwIfAborted(signal);
    const response = await result.response;
    const raw = response.text();
    console.log('[ai] Raw response length:', raw?.length);
    return parsePresentationJson(raw);
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

  const fallbackTheme = pickRandomTheme();

  let research = '';
  if (researchFromPdf && String(researchFromPdf).trim().length > 0) {
    research = String(researchFromPdf).trim();
  } else {
    research = await fetchResearch(prompt);
  }

  onStatus?.('Gemini is designing the presentation...');
  const { slides: slidesData, theme: aiThemePayload } = await generateSlidesWithGemini(
    prompt,
    research,
    signal
  );
  const theme = mergeAiTheme(aiThemePayload, fallbackTheme);

  onStatus?.('Assigning slide background image URLs...');
  const enrichedSlides = slidesData.map((slide) => {
    throwIfAborted(signal);
    const kw = slide.bgKeyword;
    const imageData =
      kw && String(kw).trim() ? buildSlideBackgroundImageUrl(String(kw).trim()) : null;
    return { ...slide, imageData };
  });

  return {
    title: prompt,
    slides: enrichedSlides,
    theme,
    themeName: theme.name,
    originalPrompt: prompt
  };
};

const resolveDeckTheme = (content) => {
  const raw = content?.theme;
  if (raw && typeof raw === 'object' && raw.primaryText && raw.accent && raw.bg) {
    return { ...raw, fontFace: raw.fontFace || FONT_TITLE };
  }
  return mergeAiTheme(null, raw || pickRandomTheme());
};

/** Solid fallback color for slide master (hex without #). */
const cleanHex = (colorVal) => hexNoHash(colorVal || '0B1220');

async function fetchImageAsBase64(url) {
  const toDataUri = (response) => {
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    return `image/jpeg;base64,${base64}`;
  };

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    return toDataUri(response);
  } catch (error) {
    console.error(`❌ [EXPORT ERROR] Failed to fetch image: ${url}`, error.message);
    const fallbackUrl = `https://picsum.photos/seed/${Math.random()}/1280/720`;
    console.log(`🔄 [EXPORT] Retrying with fallback: ${fallbackUrl}`);
    try {
      const response = await axios.get(fallbackUrl, {
        responseType: 'arraybuffer',
        timeout: 8000
      });
      return toDataUri(response);
    } catch (fallbackErr) {
      console.error(`❌ [EXPORT ERROR] Fallback fetch failed: ${fallbackUrl}`, fallbackErr.message);
      return null;
    }
  }
}

/**
 * Sequential HTTP fetches + 750ms spacing to avoid 429; data: URIs skip network.
 * @returns {Promise<Array<{ data?: string, fill: string }>>}
 */
const resolveExportSlideBackgroundsSequential = async (presentationData, theme) => {
  const slides = presentationData.slides;
  const fallbackFill = cleanHex(theme.bgColor || theme.bg);
  const resolvedImages = [];

  console.log('⏳ [EXPORT] Downloading backgrounds sequentially to avoid 429 rate limits...');
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const raw = slide?.imageData && String(slide.imageData).trim();
    if (!raw) {
      resolvedImages.push(null);
      continue;
    }
    if (raw.startsWith('data:')) {
      resolvedImages.push(raw);
      continue;
    }
    if (/^https?:\/\//i.test(raw)) {
      console.log(`⏳ [EXPORT] Fetching image ${i + 1}/${slides.length}...`);
      const base64 = await fetchImageAsBase64(raw);
      resolvedImages.push(base64);
      await new Promise((r) => setTimeout(r, 750));
    } else {
      resolvedImages.push(null);
    }
  }
  console.log('✅ [EXPORT] All backgrounds downloaded safely.');

  return resolvedImages.map((dataUri) =>
    dataUri ? { data: dataUri, fill: fallbackFill } : { fill: fallbackFill }
  );
};

/** Apply prefetched background to pptxgen slide. */
const applyExportSlideBackground = (slideObj, bgSpec) => {
  if (bgSpec.data) slideObj.background = { data: bgSpec.data };
  else slideObj.background = { fill: bgSpec.fill };
};

const buildPresentation = async (content) => {
  console.log('🚀 [EXPORT] buildPresentation: initializing PptxGenJS (16:9)...');
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';

  if (!content || !Array.isArray(content.slides)) {
    throw new Error('Presentation content must contain a valid slides array.');
  }

  console.log(`📋 [EXPORT] Resolving theme for ${content.slides.length} slide(s)...`);
  const theme = resolveDeckTheme(content);
  const ff = theme.fontFace || FONT_TITLE;
  pres.theme = { headFontFace: ff, bodyFontFace: ff };

  const presentationData = { slides: content.slides };
  const bgSpecs = await resolveExportSlideBackgroundsSequential(presentationData, theme);
  console.log('✅ [EXPORT] Background resolution complete. Rendering slide content...');

  for (let i = 0; i < content.slides.length; i++) {
    const slide = content.slides[i];
    console.log(`📄 [EXPORT] Building slide ${i + 1} / ${content.slides.length}...`);
    const slideObj = pres.addSlide();
    applyExportSlideBackground(slideObj, bgSpecs[i]);
    const slideForRender = { ...slide, imageData: null };
    renderSlideByLayout(pres, slideObj, slideForRender, theme);
  }

  console.log('✅ [EXPORT] All slides rendered; finalizing presentation object.');
  return pres;
};

const createPowerPoint = async (content, fullPath) => {
  console.log(`🚀 [EXPORT] createPowerPoint: writing file → ${fullPath}`);
  const pres = await buildPresentation(content);
  console.log('💾 [EXPORT] Writing PPTX to disk...');
  await pres.writeFile({ fileName: fullPath });
  console.log('✅ [EXPORT] PPTX file write complete.');
  return fullPath;
};

const createPowerPointBuffer = async (content) => {
  console.log('🚀 [EXPORT] createPowerPointBuffer: building in-memory PPTX...');
  const pres = await buildPresentation(content);
  console.log('📦 [EXPORT] Serializing PPTX to Node buffer...');
  const buf = await pres.write({ outputType: 'nodebuffer' });
  const bytes = Buffer.isBuffer(buf) ? buf.length : buf?.byteLength ?? 0;
  console.log(`✅ [EXPORT] Buffer ready (${bytes} bytes).`);
  return buf;
};

module.exports = {
  generatePresentationContent,
  createPowerPoint,
  createPowerPointBuffer
};
