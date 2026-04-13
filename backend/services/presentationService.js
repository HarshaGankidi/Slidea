require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const PptxGenJS = require('pptxgenjs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Failsafe check
if (!process.env.GEMINI_API_KEY) {
  console.error("FATAL ERROR: GEMINI_API_KEY is missing from the environment variables.");
}

// Initialize the global instance for the service
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
      "layoutStyle": "cinematic_cover" | "split_left" | "split_right" | "metrics_row" | "timeline" | "chart_donut" | "chart_bar" | "massive_quote",
      "title": "string",
      "subtitle": "string",
      "detailedParagraph": "string",
      "keyTakeaways": ["string", "string", "string"],
      "speakerNotes": "string",
      "bgKeyword": "string",
      "metrics": [{ "label": "string", "value": "string" }, { "label": "string", "value": "string" }, { "label": "string", "value": "string" }],
      "timeline": [{ "year": "string", "event": "string" }, { "year": "string", "event": "string" }, { "year": "string", "event": "string" }],
      "chartData": { "chartTitle": "string", "labels": ["A", "B", "C", "D"], "values": [10, 20, 30, 40] }
    }
  ]
}
Rules:
- You are an Elite Art Director. You MUST heavily vary the layoutStyle. Never use the same layout twice in a row.
- Produce EXACTLY between 10 and 14 slides in "slides".
- Adapt layouts to the user's prompt: growth/KPIs → favor metrics_row and chart_bar or chart_donut; history/future/roadmap → favor timeline; narrative/story/vision → use split_left/split_right and cinematic_cover; emphasis/credibility → massive_quote.
- For chart_bar or chart_donut: chartData REQUIRED (4–8 labels, matching values). Invent highly specific, realistic data based on the prompt.
- For metrics_row: metrics REQUIRED (exactly 3 objects).
- For timeline: timeline REQUIRED (exactly 3 objects).
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
  const styleRaw = slide.layoutStyle || slide.layoutType || 'split_left';
  const style = String(styleRaw).trim();

  // Back-compat mapping for older schema names.
  const mapped =
    style === 'classic_rich'
      ? 'split_left'
      : style === 'split_rich'
        ? 'split_left'
        : style === 'chart_pie'
          ? 'chart_donut'
          : style;

  const bgFill = cleanHex(theme.bgColor || theme.bg);
  const primary = cleanHex(theme.primaryText);
  const accent = cleanHex(theme.accentColor || theme.accent);
  const ff = theme.fontFace || FONT_TITLE;

  const addGlass = (x, y, w, h, transparency = 25) => {
    slideObj.addShape('rect', {
      x,
      y,
      w,
      h,
      fill: { color: bgFill, transparency },
      line: { color: primary, pt: 0.75 },
      rectRadius: 0.2
    });
  };

  const addTitle = (text, opts) => {
    slideObj.addText(text || '', textOpts({ fontFace: ff, ...opts }));
  };

  const addBody = (text, opts) => {
    slideObj.addText(text || '', textOpts({ fontFace: ff, ...opts }));
  };

  const addBullets = (items, opts) => {
    const bullets = (Array.isArray(items) ? items : [])
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((t) => ({
        text: t,
        options: { bullet: true, indentLevel: 0, breakLine: true, autoFit: true }
      }));
    if (bullets.length) {
      slideObj.addText(bullets, textOpts({ fontFace: ff, ...opts, bullet: true }));
    }
  };

  const renderSafeFallbackLayout = () => {
    addGlass(0.7, 0.9, 8.6, 3.9, 20);
    addTitle(slide?.title || 'Slide', {
      x: 0.9,
      y: 1.1,
      w: 8.2,
      h: 0.6,
      fontSize: 28,
      color: primary,
      bold: true
    });
    addBody(slide?.subtitle || '', {
      x: 0.9,
      y: 1.7,
      w: 8.2,
      h: 0.4,
      fontSize: 14,
      color: accent,
      bold: true
    });
    addBody(slide?.detailedParagraph || '', {
      x: 0.9,
      y: 2.15,
      w: 8.2,
      h: 2.4,
      fontSize: 14,
      color: primary,
      align: 'left',
      autoFit: true,
      breakLine: true
    });
    applySpeakerNotes(slideObj, slide);
  };

  if (mapped === 'cinematic_cover' || mapped === 'massive_quote') {
    addGlass(1.0, 1.5, 8.0, 2.6, 25);
    const quoteText =
      mapped === 'massive_quote'
        ? slide.title || slide.subtitle || slide.detailedParagraph || 'A bold point.'
        : slide.title || 'Company Name';
    addTitle(quoteText, {
      x: 1.2,
      y: 1.8,
      w: 7.6,
      h: 2.0,
      color: primary,
      fontSize: 44,
      bold: true,
      align: 'center',
      autoFit: true,
      breakLine: true
    });

    if (mapped === 'cinematic_cover') {
      addBody(slide.subtitle || '', {
        x: 1.2,
        y: 3.55,
        w: 7.6,
        h: 0.45,
        color: accent,
        fontSize: 18,
        bold: true,
        align: 'center',
        autoFit: true,
        breakLine: true
      });
    }
    applySpeakerNotes(slideObj, slide);
    return;
  }

  if (mapped === 'split_left' || mapped === 'split_right') {
    const glassX = mapped === 'split_left' ? 0.5 : 5.0;
    addGlass(glassX, 0.6, 4.5, 4.5, 25);
    const pad = 0.25;
    const tx = glassX + pad;
    const tw = 4.5 - pad * 2;
    addTitle(slide.title || 'Deep dive', {
      x: tx,
      y: 0.85,
      w: tw,
      h: 0.6,
      fontSize: 26,
      color: primary,
      bold: true
    });
    addBody(slide.subtitle || '', {
      x: tx,
      y: 1.45,
      w: tw,
      h: 0.4,
      fontSize: 15,
      color: accent,
      bold: true
    });
    addBody(slide.detailedParagraph || '', {
      x: tx,
      y: 1.9,
      w: tw,
      h: 2.0,
      fontSize: 14,
      color: primary,
      align: 'left',
      autoFit: true,
      breakLine: true
    });
    addBullets(normalizeTakeaways(slide), {
      x: tx,
      y: 3.95,
      w: tw,
      h: 1.05,
      fontSize: 12,
      color: cleanHex(theme.textMuted || primary)
    });
    applySpeakerNotes(slideObj, slide);
    return;
  }

  if (mapped === 'metrics_row') {
    addTitle(slide.title || 'Key metrics', {
      x: 0.7,
      y: 0.65,
      w: 8.6,
      h: 0.5,
      fontSize: 28,
      color: primary,
      bold: true
    });
    addBody(slide.subtitle || '', {
      x: 0.7,
      y: 1.12,
      w: 8.6,
      h: 0.35,
      fontSize: 14,
      color: accent,
      bold: true
    });

    let metrics = [];
    if (slide?.metrics && Array.isArray(slide.metrics)) {
      metrics = slide.metrics.slice(0, 3);
    }
    for (let i = 0; i < 3; i++) {
      const metric = metrics[i] || { value: '', label: '' };
      const baseX = 0.8 + i * 3.0;
      slideObj.addShape('rect', {
        x: baseX,
        y: 2.0,
        w: 2.4,
        h: 2.0,
        fill: { color: bgFill, transparency: 15 },
        line: { color: primary, pt: 0.75 },
        rectRadius: 0.2
      });
      slideObj.addText(
        String(metric.value || ''),
        textOpts({
          x: 0.9 + i * 3.0,
          y: 2.2,
          w: 2.2,
          h: 0.8,
          fontSize: 48,
          bold: true,
          color: accent,
          align: 'center',
          autoFit: true,
          breakLine: true,
          fontFace: ff
        })
      );
      slideObj.addText(
        String(metric.label || ''),
        textOpts({
          x: 0.9 + i * 3.0,
          y: 3.0,
          w: 2.2,
          h: 0.5,
          fontSize: 16,
          color: primary,
          align: 'center',
          autoFit: true,
          breakLine: true,
          fontFace: ff
        })
      );
    }
    applySpeakerNotes(slideObj, slide);
    return;
  }

  if (mapped === 'timeline') {
    addTitle(slide.title || 'Roadmap', {
      x: 0.7,
      y: 0.65,
      w: 8.6,
      h: 0.5,
      fontSize: 28,
      color: primary,
      bold: true
    });
    addBody(slide.subtitle || '', {
      x: 0.7,
      y: 1.12,
      w: 8.6,
      h: 0.35,
      fontSize: 14,
      color: accent,
      bold: true
    });

    // Connector line (exact instruction form).
    slideObj.addShape(pres.ShapeType.line, {
      x: 1.0,
      y: 3.0,
      w: 8.0,
      h: 0,
      line: { color: accent, width: 2 }
    });

    let steps = [];
    if (slide?.timeline && Array.isArray(slide.timeline)) {
      steps = slide.timeline.slice(0, 3);
    }
    for (let i = 0; i < 3; i++) {
      const step = steps[i] || { year: '', event: '' };
      const bx = 1.2 + i * 2.8;
      slideObj.addShape('rect', {
        x: bx,
        y: 2.0,
        w: 2.0,
        h: 0.8,
        fill: { color: bgFill, transparency: 15 },
        line: { color: primary, pt: 0.75 },
        rectRadius: 0.15
      });
      slideObj.addText(
        String(step.year || ''),
        textOpts({
          x: bx,
          y: 2.08,
          w: 2.0,
          h: 0.32,
          fontSize: 18,
          bold: true,
          color: accent,
          align: 'center',
          fontFace: ff
        })
      );
      slideObj.addText(
        String(step.event || ''),
        textOpts({
          x: bx,
          y: 2.42,
          w: 2.0,
          h: 0.55,
          fontSize: 12,
          color: primary,
          align: 'center',
          autoFit: true,
          breakLine: true,
          fontFace: ff
        })
      );
    }
    applySpeakerNotes(slideObj, slide);
    return;
  }

  if (mapped === 'chart_donut' || mapped === 'chart_bar') {
    addTitle(slide.title || 'Insight', {
      x: 0.5,
      y: 0.55,
      w: 9.0,
      h: 0.55,
      fontSize: 26,
      color: primary,
      bold: true
    });
    addBody(slide.subtitle || '', {
      x: 0.5,
      y: 1.05,
      w: 9.0,
      h: 0.35,
      fontSize: 14,
      color: accent,
      bold: true
    });
    addBody(slide.detailedParagraph || '', {
      x: 0.5,
      y: 1.5,
      w: 4.0,
      h: 3.5,
      fontSize: 14,
      color: primary,
      align: 'left',
      autoFit: true,
      breakLine: true
    });

    const cd = normalizeChartData(slide);
    if (cd) {
      const series = [
        {
          name: cd.chartTitle,
          labels: cd.labels,
          values: cd.values
        }
      ];
      const chartType =
        mapped === 'chart_bar'
          ? pres.ChartType?.bar || pres.charts?.BAR
          : pres.ChartType?.doughnut || pres.charts?.DOUGHNUT || pres.charts?.PIE;
      const chartOpts = {
        x: 5.0,
        y: 1.0,
        w: 4.5,
        h: 4.0,
        showLegend: true,
        legendPos: 'b',
        showTitle: false,
        chartColors: [accent, 'FFFFFF', 'AAAAAA', primary],
        plotArea: { fill: { color: bgFill, transparency: 35 } }
      };
      slideObj.addChart(chartType, series, chartOpts);
    }
    applySpeakerNotes(slideObj, slide);
    return;
  }

  // Fallback: keep rendering safe even if model deviates.
  try {
    renderSplitRichSlide(slideObj, slide, theme);
  } catch (e) {
    console.error('[LAYOUT ERROR] Fallback layout failed:', e?.message);
    renderSafeFallbackLayout();
  }
};

async function generateSlidesWithGemini(promptText) {
  const MAX_RETRIES = 4;
  let lastError;

  console.log('🚀 [API] Starting Gemini Generation with 2.5-flash...');

  // PHASE 1: Primary Model Loop (gemini-2.5-flash)
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        systemInstruction: "You are an Elite Art Director and Masterclass Educator. You must generate a highly comprehensive, deeply detailed presentation containing EXACTLY 10 to 14 slides. Leave no stone unturned. You MUST output raw, valid JSON containing an array of slide objects. Schema: [{ 'layoutStyle': 'cinematic_cover' | 'split_left' | 'split_right' | 'metrics_row' | 'timeline' | 'chart_donut' | 'chart_bar' | 'massive_quote', 'title': '...', 'subtitle': '...', 'detailedParagraph': '...', 'keyTakeaways': ['...'], 'speakerNotes': '...', 'bgKeyword': '...', 'theme': { 'bgColor': 'HEX', 'primaryText': 'HEX', 'accentColor': 'HEX' }, 'metrics': [{'label': '...', 'value': '...'}], 'timeline': [{'year': '...', 'event': '...'}] }]"
      });

      const result = await model.generateContent(promptText);
      const text = result.response.text();
      
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr);

    } catch (error) {
      lastError = error;
      const isOverloaded = error.message.includes('503') || error.message.includes('high demand') || error.message.includes('429') || error.message.includes('overloaded');
      
      if (isOverloaded) {
        if (attempt < MAX_RETRIES) {
          console.warn(`⚠️ [API] 2.5-flash Overloaded (Attempt ${attempt}). Waiting ${attempt * 4}s...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 4000));
        } else {
          console.warn(`⚠️ [API] 2.5-flash exhausted all ${MAX_RETRIES} retries.`);
        }
      } else {
        // If it's a JSON parsing error or 400 Bad Request, throw immediately
        console.error('❌ [API] Non-503 Error encountered:', error.message);
        throw error; 
      }
    }
  }

  // PHASE 2: Fallback to Backup Model (gemini-2.5-flash-lite)
  console.log('🔄 [API] Routing to highly-available backup model (gemini-2.5-flash-lite)...');
  try {
    const backupModel = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-lite",
      systemInstruction: "You are an Elite Art Director and Masterclass Educator. You must generate a highly comprehensive, deeply detailed presentation containing EXACTLY 10 to 14 slides. Leave no stone unturned. You MUST output raw, valid JSON containing an array of slide objects. Schema: [{ 'layoutStyle': 'cinematic_cover' | 'split_left' | 'split_right' | 'metrics_row' | 'timeline' | 'chart_donut' | 'chart_bar' | 'massive_quote', 'title': '...', 'subtitle': '...', 'detailedParagraph': '...', 'keyTakeaways': ['...'], 'speakerNotes': '...', 'bgKeyword': '...', 'theme': { 'bgColor': 'HEX', 'primaryText': 'HEX', 'accentColor': 'HEX' }, 'metrics': [{'label': '...', 'value': '...'}], 'timeline': [{'year': '...', 'event': '...'}] }]"
    });

    const backupResult = await backupModel.generateContent(promptText);
    const backupText = backupResult.response.text();
    
    const backupJsonStr = backupText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(backupJsonStr);

  } catch (fallbackError) {
    console.error('❌ [API] Backup model also failed:', fallbackError.message);
    throw new Error('Gemini API Error: All Google AI servers are currently at maximum capacity. Please try again in 60 seconds.');
  }
}

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
  const promptText = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Research Context (PDF excerpt, wiki, or none):\n${research || '(none)'}\n\nUser topic / instructions:\n${prompt}\n\nReturn ONLY raw, valid JSON. No markdown.`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 8192
    }
  };

  const aiPayload = await generateSlidesWithGemini(promptText);
  const normalized = (() => {
    if (Array.isArray(aiPayload)) return { slides: aiPayload, theme: null };
    if (aiPayload && typeof aiPayload === 'object' && Array.isArray(aiPayload.slides)) {
      return { slides: aiPayload.slides, theme: aiPayload.theme || null };
    }
    // Some model outputs embed theme per-slide; extract first theme if present.
    if (aiPayload && typeof aiPayload === 'object' && Array.isArray(aiPayload) === false) {
      // fall through
    }
    throw new Error('Gemini API Error: Invalid JSON shape from AI');
  })();

  const slidesData = normalized.slides;
  const aiThemePayload = normalized.theme;
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
    try {
      renderSlideByLayout(pres, slideObj, slideForRender, theme);
    } catch (e) {
      console.error(`[LAYOUT ERROR] Slide ${i} failed:`, e?.message);
      // Safe fallback layout for this slide so the overall export survives.
      const bgFill = cleanHex(theme.bgColor || theme.bg);
      const primary = cleanHex(theme.primaryText);
      const ff = theme.fontFace || FONT_TITLE;
      slideObj.addShape('rect', {
        x: 0.7,
        y: 0.9,
        w: 8.6,
        h: 3.9,
        fill: { color: bgFill, transparency: 20 },
        line: { color: primary, pt: 0.75 },
        rectRadius: 0.2
      });
      slideObj.addText(String(slideForRender?.title || 'Slide'), textOpts({
        x: 0.9,
        y: 1.1,
        w: 8.2,
        h: 0.6,
        fontSize: 28,
        color: primary,
        bold: true,
        fontFace: ff
      }));
      slideObj.addText(String(slideForRender?.detailedParagraph || slideForRender?.subtitle || ''), textOpts({
        x: 0.9,
        y: 1.75,
        w: 8.2,
        h: 2.9,
        fontSize: 14,
        color: primary,
        fontFace: ff,
        align: 'left',
        autoFit: true,
        breakLine: true
      }));
      applySpeakerNotes(slideObj, slideForRender);
    }
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
