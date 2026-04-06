const fs = require('fs');
const path = require('path');
const axios = require('axios');
const PptxGenJS = require('pptxgenjs');
const { OpenAI } = require('openai');
require('dotenv').config();

const presentationsDir = path.join(__dirname, '../presentations');
const imagesDir = path.join(presentationsDir, 'images');
if (!fs.existsSync(presentationsDir)) {
  fs.mkdirSync(presentationsDir, { recursive: true });
}
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_API_MODEL || 'gpt-3.5-turbo';
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const cleanText = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
};

const parseOpenAIResponse = (rawText) => {
  const text = rawText?.toString().trim() || '';
  if (!text) throw new Error('OpenAI returned empty response');

  const tryParse = (candidate) => {
    const trimmed = candidate.trim();
    if (!trimmed) throw new Error('No JSON content available');
    return JSON.parse(trimmed);
  };

  try {
    return tryParse(text);
  } catch {
    const arrayStart = text.indexOf('[');
    const arrayEnd = text.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      return tryParse(text.slice(arrayStart, arrayEnd + 1));
    }

    const objectStart = text.indexOf('{');
    const objectEnd = text.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
      const payload = tryParse(text.slice(objectStart, objectEnd + 1));
      return payload.slides && Array.isArray(payload.slides) ? payload.slides : payload;
    }

    throw new Error('Unable to locate JSON inside OpenAI response');
  }
};

const fetchSlideImage = async (keyword, index) => {
  if (!keyword) return null;
  const imageUrl = `https://source.unsplash.com/1600x900/?${encodeURIComponent(keyword)}`;

  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      maxRedirects: 5,
      timeout: 20000
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    const extension = contentType.includes('png') ? 'png' : 'jpg';
    const filename = `slide_image_${Date.now()}_${index}.${extension}`;
    const filepath = path.join(imagesDir, filename);

    fs.writeFileSync(filepath, response.data);
    return filepath;
  } catch (error) {
    console.error(`Image fetch failed for keyword "${keyword}":`, error.message || error);
    return null;
  }
};

const generateFallbackContent = (prompt) => {
  const title = prompt ? `Presentation: ${cleanText(prompt)}` : 'AI Presentation';
  return {
    title,
    slides: [
      {
        title: 'Overview',
        bulletPoints: [
          `Introducing: ${cleanText(prompt)}`,
          'What this presentation will cover',
          'Why this topic matters',
          'How the audience will benefit'
        ],
        imageSearchKeyword: 'presentation outline'
      },
      {
        title: 'The Challenge',
        bulletPoints: [
          'Current challenges or gaps',
          'Why improvement is required',
          'Who is affected',
          'What success looks like'
        ],
        imageSearchKeyword: 'problem solving'
      },
      {
        title: 'The Solution',
        bulletPoints: [
          'What the solution is',
          'How it works',
          'Key advantages',
          'Why it is better than alternatives'
        ],
        imageSearchKeyword: 'innovative solution'
      },
      {
        title: 'How It Works',
        bulletPoints: [
          'Step-by-step workflow',
          'Core components',
          'User experience highlights',
          'Results expected'
        ],
        imageSearchKeyword: 'workflow diagram'
      },
      {
        title: 'Benefits',
        bulletPoints: [
          'Top benefit 1',
          'Top benefit 2',
          'Why stakeholders care',
          'Expected impact'
        ],
        imageSearchKeyword: 'business benefits'
      },
      {
        title: 'Implementation',
        bulletPoints: [
          'Next steps',
          'Timeline overview',
          'Key milestones',
          'Resources needed'
        ],
        imageSearchKeyword: 'roadmap'
      },
      {
        title: 'Results',
        bulletPoints: [
          'Measurable outcomes',
          'Success indicators',
          'Expected timeline',
          'Future opportunities'
        ],
        imageSearchKeyword: 'successful project'
      },
      {
        title: 'Conclusion',
        bulletPoints: [
          'Summary of the presentation',
          'Final thoughts',
          'Call to action',
          'Next steps for the audience'
        ],
        imageSearchKeyword: 'conclusion slide'
      }
    ]
  };
};

const generateSlidesFromOpenAI = async (prompt) => {
  if (!openai) {
    throw new Error('OpenAI API key is not configured. Set OPENAI_API_KEY in backend/.env');
  }

  const systemPrompt = `You are an expert presentation creator. Return only valid JSON with exactly 8 to 10 slide objects. Each slide object must have the keys: title, bulletPoints, imageSearchKeyword. Example format: [{"title":"Slide title","bulletPoints":["Point 1","Point 2"],"imageSearchKeyword":"keyword"}]`;
  const userPrompt = `Create a professional presentation outline for the topic: ${prompt}`;

  const response = await openai.chat.completions.create({
    model: openaiModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.6,
    max_tokens: 1100
  });

  const raw = response?.choices?.[0]?.message?.content;
  const parsed = parseOpenAIResponse(raw);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && parsed.slides && Array.isArray(parsed.slides)) {
    return parsed.slides;
  }

  throw new Error('OpenAI response did not contain a valid slide array');
};

const normalizeSlide = async (slide, index) => {
  const title = cleanText(slide.title) || `Slide ${index + 1}`;
  const bulletPoints = Array.isArray(slide.bulletPoints)
    ? slide.bulletPoints.slice(0, 5).map((point) => cleanText(point)).filter(Boolean)
    : [];
  const imageSearchKeyword = cleanText(slide.imageSearchKeyword) || title;
  const imagePath = await fetchSlideImage(imageSearchKeyword, index + 1);

  return {
    title,
    bulletPoints: bulletPoints.length > 0 ? bulletPoints : ['Key point 1', 'Key point 2', 'Key point 3'],
    imageSearchKeyword,
    imagePath
  };
};

const generatePresentationContent = async (prompt) => {
  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt is required');
  }

  try {
    const slides = await generateSlidesFromOpenAI(prompt);
    if (!Array.isArray(slides) || slides.length < 8 || slides.length > 10) {
      throw new Error('OpenAI returned invalid slide count');
    }

    const normalizedSlides = await Promise.all(slides.map(normalizeSlide));
    return {
      title: `Presentation: ${cleanText(prompt)}`,
      slides: normalizedSlides
    };
  } catch (error) {
    console.error('AI generation failed, using fallback content:', error.message || error);
    return generateFallbackContent(prompt);
  }
};

const createPowerPoint = async (content, filename) => {
  const pres = new PptxGenJS();

  console.log('Creating PowerPoint for:', { title: content.title, slideCount: content.slides.length });
  
  // Validate slide content types
  content.slides.forEach((slide, i) => {
    if (typeof slide.title !== 'string') console.warn(`Slide ${i} title not string:`, typeof slide.title);
    if (Array.isArray(slide.bulletPoints)) {
      slide.bulletPoints.forEach((point, j) => {
        if (typeof point !== 'string') console.warn(`Slide ${i} point ${j} not string:`, typeof point);
      });
    }
  });

  const titleSlide = pres.addSlide();
  titleSlide.background = '#111827';
  titleSlide.addText(content.title || 'AI Generated Presentation', {
    x: 0.5,
    y: 1.5,
    w: 9,
    h: 1.5,
    fontSize: 44,
    bold: true,
    color: '#ffffff',
    align: 'center',
    fontFace: 'Arial'
  });
  titleSlide.addText('Created from your prompt', {
    x: 0.5,
    y: 3.2,
    w: 9,
    h: 0.7,
    fontSize: 22,
    color: '#ec4899',
    align: 'center',
    fontFace: 'Arial'
  });

  content.slides.forEach((slide, index) => {
    try {
      console.log(`Processing slide ${index + 1}:`, { title: slide.title, bulletPoints: slide.bulletPoints?.length, imagePath: slide.imagePath });
      
      const slideObj = pres.addSlide();
      slideObj.background = '#f8fafc';

      slideObj.addShape(pres.ShapeType.rect, {
        x: 0,
        y: 0,
        w: '100%',
        h: 0.65,
        fill: '#4f46e5'
      });

      slideObj.addText(slide.title || `Slide ${index + 1}`, {
        x: 0.5,
        y: 0.1,
        w: 9,
        h: 0.6,
        fontSize: 30,
        bold: true,
        color: '#ffffff',
        fontFace: 'Arial'
      });

      const hasImage = Boolean(slide.imagePath);
      if (hasImage) {
        try {
          slideObj.addImage({
            path: slide.imagePath,
            x: 5.0,
            y: 1.0,
            w: 4.0,
            h: 3.0
          });
        } catch (imageError) {
          console.error(`Unable to add image to slide ${index + 1}:`, imageError.message || imageError);
        }
      }

      const bodyWidth = hasImage ? 4.5 : 9.0;
      slideObj.addText(slide.bulletPoints.map((item) => `• ${item}`).join('\n'), {
        x: 0.5,
        y: 1.1,
        w: bodyWidth,
        h: 4.8,
        fontSize: 18,
        color: '#111827',
        fontFace: 'Arial'
      });

      slideObj.addShape(pres.ShapeType.rect, {
        x: 0,
        y: 6.8,
        w: '100%',
        h: 0.1,
        fill: '#ec4899'
      });

      slideObj.addText(`Slide ${index + 1}`, {
        x: 9.2,
        y: 6.85,
        w: 0.6,
        h: 0.3,
        fontSize: 12,
        color: '#4f46e5',
        align: 'right',
        fontFace: 'Arial'
      });
    } catch (slideError) {
      console.error(`Error processing slide ${index + 1}:`, slideError.message);
      throw slideError;
    }
  });

  await pres.writeFile({ fileName: filename });
  return filename;
};

module.exports = {
  generatePresentationContent,
  createPowerPoint,
  generateFallbackContent
};
