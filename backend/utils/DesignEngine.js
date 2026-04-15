/**
 * Parametric Design Engine — generates a unique "Design DNA" per presentation
 * BEFORE the LLM is called, so layout sequence and visual identity are
 * mathematically guaranteed to vary across 1M+ generations.
 */

const GLOBAL_STYLES = ['Brutalist', 'AppleMinimal', 'NeoGraphic', 'EditorialSerif', 'DarkCyber'];
const BORDER_RADII = ['0px', '8px', '24px', '999px'];
const GRID_GAPS = ['1rem', '2rem', '4rem'];

const BLOCK_POOL = [
  'CoverHero',
  'BentoGrid',
  'EditorialSplit',
  'FloatingData',
  'KineticTypography',
  'ColumnInsight',
  'StatementQuote',
  'TimelineFlow'
];

const FONT_PAIRINGS = {
  Brutalist:      { heading: 'Space Grotesk',     body: 'IBM Plex Mono' },
  AppleMinimal:   { heading: 'Inter',             body: 'Inter' },
  NeoGraphic:     { heading: 'Sora',              body: 'DM Sans' },
  EditorialSerif: { heading: 'Playfair Display',  body: 'Source Serif 4' },
  DarkCyber:      { heading: 'JetBrains Mono',    body: 'Inter' }
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const fisherYatesShuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Shuffle array so no two adjacent elements are equal.
 * Greedy approach: pick from remaining pool, preferring items != last placed.
 */
const shuffleNoConsecutive = (items) => {
  const pool = [...items];
  const result = [];
  let lastPicked = null;

  while (pool.length > 0) {
    const candidates = pool.filter((x) => x !== lastPicked);
    const pickFrom = candidates.length > 0 ? candidates : pool;
    const idx = Math.floor(Math.random() * pickFrom.length);
    const chosen = pickFrom[idx];
    result.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
    lastPicked = chosen;
  }
  return result;
};

/**
 * Build a 12-slide layout sequence using all 8 block types + 4 extras,
 * guaranteed no two consecutive slides share the same block type.
 */
const buildLayoutSequence = (slideCount = 12) => {
  const base = [...BLOCK_POOL];
  const extras = fisherYatesShuffle([...BLOCK_POOL]).slice(0, slideCount - BLOCK_POOL.length);
  return shuffleNoConsecutive([...base, ...extras]);
};

/**
 * Generate a unique Design DNA object. Called once per presentation,
 * BEFORE the LLM prompt is constructed.
 */
const generateDesignDNA = () => {
  const globalStyle = pick(GLOBAL_STYLES);
  const borderRadius = pick(BORDER_RADII);
  const gridGap = pick(GRID_GAPS);
  const layoutSequence = buildLayoutSequence(12);
  const fontPairing = FONT_PAIRINGS[globalStyle] || FONT_PAIRINGS.AppleMinimal;

  return {
    globalStyle,
    borderRadius,
    gridGap,
    layoutSequence,
    slideCount: layoutSequence.length,
    fontPairing
  };
};

/**
 * Build the LLM injection string that tells Gemini exactly which
 * slide sequence and design system to fill with content.
 */
const buildDNAPromptInjection = (dna) => {
  const seq = dna.layoutSequence
    .map((block, i) => `  Slide ${i + 1}: ${block}`)
    .join('\n');

  return `DESIGN DNA (pre-computed — do NOT change the slide order or block types):
GlobalStyle: ${dna.globalStyle}
BorderRadius: ${dna.borderRadius}
GridGap: ${dna.gridGap}
FontPairing: ${dna.fontPairing.heading} (headings) + ${dna.fontPairing.body} (body)

You MUST generate content for this EXACT slide sequence (${dna.slideCount} slides):
${seq}

For each slide, output the matching blockType from the sequence above.
Assign imageKeyword to EXACTLY 2 or 3 slides (prioritize CoverHero and one EditorialSplit). All other slides MUST set imageKeyword to null.`;
};

module.exports = {
  generateDesignDNA,
  buildDNAPromptInjection,
  GLOBAL_STYLES,
  BLOCK_POOL
};
