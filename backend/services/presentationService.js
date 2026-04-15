require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateDesignDNA } = require('../utils/DesignEngine');

const LAYOUT_CONSTRAINTS = [
  "LAYOUT 1: Use CSS Grid with 2 asymmetric columns (col-span-8 and col-span-4).",
  "LAYOUT 2: Use Flexbox 'flex-row-reverse' with a massive image taking 50% width.",
  "LAYOUT 3: Use a minimalist design with 80% whitespace, text aligned strictly bottom-left.",
  "LAYOUT 4: Use a 2x2 Bento Box grid with subtle borders and backdrop-blur.",
  "LAYOUT 5: Use Massive Kinetic Typography (text-8xl or larger) dominating the center.",
  "LAYOUT 6: Use a diagonal split background using a harsh linear-gradient.",
  "LAYOUT 7: Floating overlapping cards using relative/absolute positioning safely within the center.",
  "LAYOUT 8: A strict 3-column metric grid (grid-cols-3) for data points."
];

function generateFallbackSVG(keyword) {
  const cleanText = keyword.substring(0, 30).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#1e293b;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#0f172a;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#grad)"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="sans-serif" font-size="36" font-weight="bold" letter-spacing="4">${cleanText} VISUAL UNAVAILABLE</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

if (!process.env.GEMINI_API_KEY) {
  console.error("FATAL ERROR: GEMINI_API_KEY is missing from the environment variables.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const presentationsDir = path.join(__dirname, '../presentations');
if (!fs.existsSync(presentationsDir)) fs.mkdirSync(presentationsDir, { recursive: true });

/* ── Theme Fallbacks ─────────────────────────────────────────────── */

const DECK_THEMES = [
  { id: 'midnight-pink',  name: 'Midnight Pink',  accent: '#FF0055', textMuted: '#94A3B8', bg: '#050A1F' },
  { id: 'corporate-blue', name: 'Corporate Blue', accent: '#3B82F6', textMuted: '#94A3B8', bg: '#0B1628' },
  { id: 'forest-gold',    name: 'Forest & Gold',  accent: '#D4AF37', textMuted: '#A3B5A8', bg: '#0D1A14' },
  { id: 'sunset-coral',   name: 'Sunset Coral',   accent: '#FF6B6B', textMuted: '#C4A5AD', bg: '#1A0A12' },
  { id: 'royal-violet',   name: 'Royal Violet',   accent: '#A855F7', textMuted: '#B8A5D6', bg: '#12081F' }
];

const pickRandomTheme = () => DECK_THEMES[Math.floor(Math.random() * DECK_THEMES.length)];

/* ── Utilities ───────────────────────────────────────────────────── */

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

async function fetchImageAsBase64(keyword) {
  try {
    const cleanKeyword = keyword.replace(/[^a-zA-Z0-9]/g, ""); // Strip spaces for Picsum seed
    
    try {
      // Provider 1: Pollinations (High Quality)
      const url1 = `https://image.pollinations.ai/prompt/${encodeURIComponent(keyword)}?width=1280&height=720&nologo=true`;
      const res1 = await axios.get(url1, { responseType: 'arraybuffer', timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' }});
      return `data:image/jpeg;base64,${Buffer.from(res1.data, 'binary').toString('base64')}`;
    } catch (err1) {
      try {
        // Provider 2: Picsum Seeded (100% Reliable, never 429s)
        const url2 = `https://picsum.photos/seed/${cleanKeyword || Math.random()}/1280/720`;
        const res2 = await axios.get(url2, { responseType: 'arraybuffer', timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' }});
        return `data:image/jpeg;base64,${Buffer.from(res2.data, 'binary').toString('base64')}`;
      } catch (err2) {
        return generateFallbackSVG(keyword);
      }
    }
  } catch (err1) {
    return generateFallbackSVG(keyword);
  }
}

const throwIfAborted = (signal) => {
  if (signal?.aborted) {
    const err = new Error('Generation aborted: client disconnected');
    err.code = 'CLIENT_ABORT';
    throw err;
  }
};

const parseHexFlexible = (val) => {
  if (val == null || val === '') return null;
  const s = String(val).replace(/^#/, '').trim();
  if (/^[0-9A-Fa-f]{6}$/i.test(s)) return s.toUpperCase();
  return null;
};

/* ── Theme Extraction ────────────────────────────────────────────── */

const mergeAiTheme = (aiTheme, fallback, dna) => {
  const fb = fallback || pickRandomTheme();
  const fp = dna?.fontPairing || { heading: null, body: null };

  if (!aiTheme || typeof aiTheme !== 'object') {
    return {
      name: fb.name, bg: fb.bg, accent: fb.accent,
      headingFont: fp.heading, bodyFont: fp.body
    };
  }

  const name = typeof aiTheme.name === 'string' && aiTheme.name.trim() ? aiTheme.name.trim() : fb.name;
  const bgHex = parseHexFlexible(aiTheme.backgroundColor) || fb.bg.replace('#', '');
  const accentHex = parseHexFlexible(aiTheme.accentColor) || fb.accent.replace('#', '');
  const headingFont = typeof aiTheme.headingFont === 'string' && aiTheme.headingFont.trim()
    ? aiTheme.headingFont.trim() : fp.heading;
  const bodyFont = typeof aiTheme.bodyFont === 'string' && aiTheme.bodyFont.trim()
    ? aiTheme.bodyFont.trim() : fp.body;

  return {
    name, bg: `#${bgHex}`, accent: `#${accentHex}`,
    headingFont, bodyFont
  };
};

/* ── Generative UI — Gemini produces raw HTML + Tailwind per slide ─ */

async function generateSlidesWithGemini(promptText, systemPrompt) {
  const MAX_RETRIES = 4;
  let lastError;

  console.log('🚀 [API] Starting Generative UI generation (gemini-2.5-flash)...');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          maxOutputTokens: 8192, // Maximize output limit to prevent JSON truncation
          temperature: 0.7,
          responseMimeType: 'application/json' // Force the API to return valid JSON
        },
        systemInstruction: systemPrompt
      });
      const result = await model.generateContent(promptText);
      const text = result.response.text();
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (error) {
      lastError = error;
      const isOverloaded = error.message.includes('503') || error.message.includes('high demand') ||
        error.message.includes('429') || error.message.includes('overloaded');
      if (isOverloaded) {
        if (attempt < MAX_RETRIES) {
          console.warn(`⚠️ [API] Overloaded (attempt ${attempt}). Retrying in ${attempt * 4}s...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 4000));
        } else {
          console.warn(`⚠️ [API] Exhausted ${MAX_RETRIES} retries on primary model.`);
        }
      } else {
        console.error('❌ [API] Non-retriable error:', error.message);
        throw error;
      }
    }
  }

  console.log('🔄 [API] Falling back to gemini-2.5-flash-lite...');
  try {
    const backupModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        maxOutputTokens: 8192, // Maximize output limit to prevent JSON truncation
        temperature: 0.7,
        responseMimeType: 'application/json' // Force the API to return valid JSON
      },
      systemInstruction: systemPrompt
    });
    const backupResult = await backupModel.generateContent(promptText);
    const backupText = backupResult.response.text();
    return JSON.parse(backupText.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch (fallbackError) {
    console.error('❌ [API] Backup model failed:', fallbackError.message);
    throw new Error('Gemini API Error: All servers at capacity. Please try again in 60 seconds.');
  }
}

const FALLBACK_SLIDE_HTML = (i) =>
  `<div class='w-full h-full flex items-center justify-center bg-[#0f172a]'><p class='text-4xl font-bold text-white'>Slide ${i + 1}</p></div>`;

/* ── Main Entry Point ────────────────────────────────────────────── */

/**
 * @param {string} prompt
 * @param {{ researchFromPdf?: string|null, onStatus?: (msg: string) => void, signal?: AbortSignal }} [options]
 */
const generatePresentationContent = async (prompt, options = {}) => {
  const { researchFromPdf = null, onStatus, signal } = options;
  if (!prompt || !prompt.trim()) throw new Error('A prompt is required for generation.');

  const fallbackTheme = pickRandomTheme();

  const dna = generateDesignDNA();
  console.log(`🧬 [DNA] Style=${dna.globalStyle} | Fonts=${dna.fontPairing.heading} + ${dna.fontPairing.body}`);

  let research = '';
  if (researchFromPdf && String(researchFromPdf).trim().length > 0) {
    research = String(researchFromPdf).trim();
  } else {
    research = await fetchResearch(prompt);
  }

  const layoutDictation = LAYOUT_CONSTRAINTS
    .map((x, i) => `${i + 1}. ${x}`)
    .join('\n');

  const perSlideRules = Array.from({ length: 10 }, (_, i) => {
    const constraint = LAYOUT_CONSTRAINTS[i % LAYOUT_CONSTRAINTS.length];
    return `Slide ${i + 1}: MUST follow: ${constraint}`;
  }).join('\n');

  const systemPrompt = `You are an elite Frontend Developer and Presentation Designer (v0.dev / Gamma quality).
You generate RAW HTML with Tailwind CSS for each slide. Every slide must have a COMPLETELY UNIQUE layout structure — no two slides may share the same grid/flex/positioning pattern.

DESIGN DIRECTION: ${dna.globalStyle}
FONTS: Use "${dna.fontPairing.heading}" for all headings (via style="font-family: '${dna.fontPairing.heading}', sans-serif") and "${dna.fontPairing.body}" for body text (via style="font-family: '${dna.fontPairing.body}', sans-serif") on the elements directly.

═══════════════════════════════════════════════════
ALGORITHMIC LAYOUT DICTATION (ANTI-MODE-COLLAPSE):
═══════════════════════════════════════════════════
You MUST follow these strict layout constraints and rotate them across slides:
${layoutDictation}

Per-slide enforcement (NON-NEGOTIABLE):
${perSlideRules}

═══════════════════════════════════════════════════
LAYOUT SAFETY RULES (NON-NEGOTIABLE — violations break the renderer):
═══════════════════════════════════════════════════
A. STOP overusing 'absolute' positioning for content. You MUST use CSS Grid ('grid', 'grid-cols-12', 'grid-cols-2', 'grid-cols-3', 'grid-cols-[2fr_1fr]') and Flexbox ('flex', 'flex-col', 'items-center', 'justify-between') as your PRIMARY layout engines. 'absolute' is ONLY allowed for: background images, decorative accents, and gradient overlays. NEVER use 'absolute' on headings, paragraphs, cards, or data content.
B. ENFORCE text safety on ALL text elements. Every heading must include 'max-w-4xl' or 'max-w-3xl'. Every paragraph must include 'max-w-2xl leading-relaxed'. Add 'break-words' to any text block that could overflow. No text may bleed outside its parent container.
C. Every slide root div MUST use 'overflow-hidden' to hard-clip any stray elements.
D. All content must have generous padding: 'p-10' or 'p-12' minimum on the outer content wrapper. No text touching edges.

═══════════════════════════════════════════════════
COLOR PSYCHOLOGY RULES (STOP defaulting to dark mode):
═══════════════════════════════════════════════════
You MUST match the background color palette to the TOPIC'S EMOTION:
- Corporate / Finance / Academic / Professional → LIGHT MODE: bg-[#FFFFFF], bg-[#F8FAFC], bg-[#F1F5F9], text-[#0F172A], text-[#334155]. Use clean whites, soft grays, slate blues. Accent: deep blue or emerald.
- Technology / Cyberpunk / Gaming / AI / Crypto → DARK MODE: bg-[#0A0E27], bg-[#0D1117], bg-[#1A0A22]. Neon accents, vibrant purples/cyans. This is the ONLY category that uses dark backgrounds.
- Food / Lifestyle / Wellness / Travel / Fashion → WARM/PASTEL MODE: bg-[#FFFBF0], bg-[#FFF7ED], bg-[#F0FDF4]. Creams, soft oranges, sage greens, warm terracotta. Text: warm browns/charcoals.
- Education / Children / Creative → BRIGHT MODE: bg-[#EFF6FF], bg-[#FDF4FF], bg-[#ECFDF5]. Soft pastels with bold, playful accents.
- Nature / Environment / Sustainability → EARTH MODE: bg-[#F0FDF4], bg-[#ECFDF5], bg-[#F5F5F4]. Deep greens, warm stones, sky blues.
If the topic does NOT clearly fit Technology/Cyberpunk/Gaming, you MUST NOT use dark backgrounds.

STRICT RULES:
1. Generate EXACTLY 10 slides.
2. Each slide "html" MUST be a single root <div class='w-full h-full relative overflow-hidden'> with the appropriate background color from the palette rules above.
3. Use SINGLE QUOTES for all HTML attributes inside the JSON string.
4. MINIMUM CONTENT DENSITY: Every slide must contain at least:
   - 1 headline (>= 6 words)
   - 1 supporting line (>= 10 words)
   - 1 body paragraph (>= 2 sentences) OR 3 bullet points (each >= 6 words)
   - If the layout is metrics/data/timeline: include 4–6 real-looking data points (numbers, %s, timeframes).
5. HTML QUALITY: No sloppy nesting. No unclosed tags. Avoid empty divs. No duplicate IDs. Ensure all text containers include max-w + break-words per safety rules.
4. EVERY slide must use a DIFFERENT layout — use Grid and Flexbox as primary engines:
   - Cinematic cover: Grid-based, title in grid cell at bottom, full-bleed gradient bg
   - Asymmetric split: grid-cols-[2fr_1fr] or grid-cols-[1fr_3fr], image cell + text cell
   - Massive typography: flex items-center justify-center, text-[80px] max-w-4xl
   - Bento metrics: grid grid-cols-2 gap-6, glassmorphism cards with large numbers
   - Three-column: grid grid-cols-3 gap-8 with accent top-borders on each column
   - Statement quote: flex flex-col items-center justify-center, italic text-4xl max-w-3xl
   - Timeline: flex flex-col gap-6 with connected dots via border-left
   - Data showcase: grid grid-cols-3, oversized stat numbers (text-[72px]) with tiny labels
   - Feature grid: grid grid-cols-2 grid-rows-2, icon + title + description per cell
   - Full-bleed image: image as absolute bg only, text content in relative grid overlay
5. TYPOGRAPHY: Vary dramatically — text-[80px] tracking-tighter for heroes, text-4xl italic for quotes, text-xs uppercase tracking-[0.4em] for labels, text-lg leading-relaxed for body. Always include max-w constraints.
6. GLASSMORPHISM for cards: bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl (dark themes) OR bg-white/80 backdrop-blur-xl border border-gray-200 rounded-2xl shadow-lg (light themes).
7. IMAGES: MAX 3 slides. Use exactly: <img src='{{IMAGE_1}}' class='absolute inset-0 w-full h-full object-cover' />. Put the keyword in imageKeywords. All other slides: imageKeywords: [].
8. Content must be real, compelling text — never lorem ipsum.
9. Every content wrapper must have p-10 or p-12 for breathing room. No cramped layouts.
10. If you are unsure, write MORE content rather than less. These slides must feel like a premium agency deck, not a sparse template.

OUTPUT (valid JSON only — no markdown, no explanation):
{
  "theme": {
    "name": "evocative deck name",
    "backgroundColor": "#hex (the primary bg used)",
    "accentColor": "#hex (the most vibrant accent used)",
    "headingFont": "${dna.fontPairing.heading}",
    "bodyFont": "${dna.fontPairing.body}"
  },
  "slides": [
    {
      "html": "<div class='w-full h-full relative overflow-hidden bg-[#hex]'>...complete slide HTML...</div>",
      "imageKeywords": ["highly specific, vivid image search phrase"] // or []
    }
  ]
}`;

  onStatus?.(`Generating ${dna.globalStyle} presentation...`);

  const promptText = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Research context:\n${research || '(none)'}\n\nUser topic / instructions:\n${prompt}\n\nGenerate the full presentation now. Return ONLY valid JSON — no markdown.`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 16384
    }
  };

  const aiPayload = await generateSlidesWithGemini(promptText, systemPrompt);

  const rawSlides = Array.isArray(aiPayload?.slides)
    ? aiPayload.slides
    : Array.isArray(aiPayload) ? aiPayload : [];

  const slides = rawSlides.map((s, i) => ({
    html: typeof s?.html === 'string' && s.html.trim() ? s.html : FALLBACK_SLIDE_HTML(i),
    imageKeywords: Array.isArray(s?.imageKeywords)
      ? s.imageKeywords.filter((k) => typeof k === 'string' && k.trim())
      : []
  }));

  onStatus?.('Downloading images (server-side Base64 for CORS-safe export)...');
  const presentationData = { slides };

  // Loop through slides with an index
  for (let i = 0; i < presentationData.slides.length; i++) {
    throwIfAborted(signal);
    let slide = presentationData.slides[i];

    // 1. FORCE A KEYWORD FOR SLIDE 1: If the AI forgot to assign an image to the Cover Slide, invent one.
    if ((!slide.imageKeywords || (Array.isArray(slide.imageKeywords) && slide.imageKeywords.length === 0)) && i === 0) {
      const titleGuess = typeof slide.title === 'string' ? slide.title : '';
      slide.imageKeywords = titleGuess ? `${titleGuess} modern professional` : 'modern abstract corporate background';
    }

    if (slide.imageKeywords) {
      const kw =
        Array.isArray(slide.imageKeywords) ? String(slide.imageKeywords[0] || '').trim() : String(slide.imageKeywords || '').trim();

      if (kw) {
        console.log(`🖼️ [IMAGE] Fetching: ${kw}`);
        slide.imageUrl = await fetchImageAsBase64(kw);

        // 2. BRUTE FORCE HTML INJECTION
        if (slide.imageUrl && typeof slide.html === 'string') {
          if (slide.html.includes('<img')) {
            // The AI actually wrote an img tag -> Overwrite it safely
            slide.html = slide.html.replace(
              /<img[^>]+src=["'][^"']*["'][^>]*>/i,
              `<img src="${slide.imageUrl}" class="w-full h-full object-cover rounded-xl shadow-lg" />`
            );
          } else {
            // The AI forgot the img tag entirely -> Force it as a massive background layer!
            slide.html = `
          <div class="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <img src="${slide.imageUrl}" class="w-full h-full object-cover opacity-40 mix-blend-overlay" />
          </div>
          <div class="relative z-10 w-full h-full flex flex-col justify-center">
            ${slide.html}
          </div>
        `;
          }
        }

        // Hard wait to prevent API blocks
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }

  const theme = mergeAiTheme(aiPayload?.theme, fallbackTheme, dna);

  return {
    title: prompt,
    slides,
    theme,
    designDNA: { globalStyle: dna.globalStyle, fontPairing: dna.fontPairing },
    themeName: theme.name,
    originalPrompt: prompt
  };
};

module.exports = {
  generatePresentationContent
};
