const fs = require('fs');
const path = require('path');
const axios = require('axios');
const PptxGenJS = require('pptxgenjs');
const { OpenAI } = require('openai');
require('dotenv').config();

const presentationsDir = path.join(__dirname, '../presentations');
if (!fs.existsSync(presentationsDir)) {
  fs.mkdirSync(presentationsDir, { recursive: true });
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const parseJsonArray = (rawText) => {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('Unable to parse JSON from OpenAI response');
  }
};

const fetchSlideImage = async (keyword, index) => {
  const searchUrl = `https://source.unsplash.com/1600x900/?${encodeURIComponent(keyword)}`;
  try {
    const response = await axios.get(searchUrl, {
      responseType: 'arraybuffer',
      maxRedirects: 5,
      timeout: 20000
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    const extension = contentType.includes('png') ? 'png' : 'jpg';
    const filename = `slide_image_${Date.now()}_${index}.${extension}`;
    const filepath = path.join(presentationsDir, filename);
    fs.writeFileSync(filepath, response.data);
    return filepath;
  } catch (error) {
    console.error(`Failed to fetch image for keyword "${keyword}":`, error.message || error);
    return null;
  }
};

const generateFallbackContent = (prompt) => {
  const title = `Presentation: ${prompt}`;
  const fallbackSlides = [
    {
      title: 'Introduction',
      bulletPoints: ['Purpose of the presentation', 'Audience and goals', 'Why this topic matters'],
      imageSearchKeyword: 'presentation'
    },
    {
      title: 'Problem',
      bulletPoints: ['Current challenges', 'Key pain points', 'Why this problem needs solving'],
      imageSearchKeyword: 'problem solving'
    },
    {
      title: 'Solution',
      bulletPoints: ['How the solution works', 'Main benefits', 'What makes it unique'],
      imageSearchKeyword: 'solution'
    },
    {
      title: 'How It Works',
      bulletPoints: ['Core process overview', 'Key features', 'User experience'],
      imageSearchKeyword: 'workflow'
    },
    {
      title: 'Market Opportunity',
      bulletPoints: ['Target audience', 'Market size', 'Growth potential'],
      imageSearchKeyword: 'market research'
    },
    {
      title: 'Benefits',
      bulletPoints: ['Value proposition', 'Why people care', 'Expected impact'],
      imageSearchKeyword: 'business benefits'
    },
    {
      title: 'Implementation',
      bulletPoints: ['Key milestones', 'Timeline', 'Next steps'],
      imageSearchKeyword: 'roadmap'
    },
    {
      title: 'Conclusion',
      bulletPoints: ['Summary of takeaways', 'Final recommendation', 'Call to action'],
      imageSearchKeyword: 'conclusion'
    }
  ];

  return {
    title,
    slides: fallbackSlides
  };
};

const generatePresentationContent = async (prompt) => {
  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt is required to generate presentation content');
  }

  try {
    const systemMessage = `You are a professional presentation designer. Generate a JSON array with exactly 8 to 10 slide objects. Each object must have exactly these keys:\n- title: a short slide title\n- bulletPoints: an array of 3 to 5 concise bullet points\n- imageSearchKeyword: one single keyword or short phrase to search for an image\nReturn only valid JSON, with no markdown, commentary, or extra fields.`;
    const userMessage = `Create a presentation outline for the following prompt:\n${prompt}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.6,
      max_tokens: 1000
    });

    const rawText = response.choices?.[0]?.message?.content || '';
    const slides = parseJsonArray(rawText);

    if (!Array.isArray(slides) || slides.length < 8 || slides.length > 10) {
      throw new Error('OpenAI returned invalid slide output. Expected 8 to 10 items.');
    }

    const normalizedSlides = await Promise.all(slides.map(async (slide, index) => {
      if (!slide || typeof slide !== 'object') {
        throw new Error(`Slide ${index + 1} is not a valid object`);
      }

      const title = typeof slide.title === 'string' && slide.title.trim() ? slide.title.trim() : `Slide ${index + 1}`;
      const bulletPoints = Array.isArray(slide.bulletPoints)
        ? slide.bulletPoints.slice(0, 5).map((point) => String(point).trim()).filter(Boolean)
        : [];
      const imageSearchKeyword = typeof slide.imageSearchKeyword === 'string' && slide.imageSearchKeyword.trim()
        ? slide.imageSearchKeyword.trim()
        : title;

      const imagePath = await fetchSlideImage(imageSearchKeyword, index + 1);

      return {
        title,
        bulletPoints: bulletPoints.length > 0 ? bulletPoints : ['Key point 1', 'Key point 2', 'Key point 3'],
        imageSearchKeyword,
        imagePath
      };
    }));

    return {
      title: `Presentation: ${prompt}`,
      slides: normalizedSlides
    };
  } catch (error) {
    console.error('OpenAI slide generation failed:', error.message || error);
    return generateFallbackContent(prompt);
  }
};

const createPowerPoint = async (content, filename) => {
  const pres = new PptxGenJS();
  const theme = {
    primary: '#6366f1',
    secondary: '#ec4899',
    accent: '#f59e0b',
    darkBg: '#1f2937',
    lightBg: '#f9fafb',
    text: '#111827',
    lightText: '#ffffff'
  };

  const titleSlide = pres.addSlide();
  titleSlide.background = { fill: { type: 'solid', color: theme.darkBg } };
  titleSlide.addText(content.title || 'AI Generated Presentation', {
    x: 0.5, y: 2.0, w: 9, h: 1.5,
    fontSize: 48,
    bold: true,
    color: theme.lightText,
    align: 'center',
    fontFace: 'Arial'
  });
  titleSlide.addText('Generated from your prompt', {
    x: 0.5, y: 3.6, w: 9, h: 0.9,
    fontSize: 24,
    color: theme.secondary,
    align: 'center',
    fontFace: 'Arial'
  });

  content.slides.forEach((slide, index) => {
    const slideObj = pres.addSlide();
    slideObj.background = { fill: theme.lightBg };

    slideObj.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: '100%', h: 0.7,
      fill: { type: 'solid', color: theme.primary },
      line: { type: 'none' }
    });

    slideObj.addText(slide.title || `Slide ${index + 1}`, {
      x: 0.5, y: 0.1, w: 9, h: 0.7,
      fontSize: 32,
      bold: true,
      color: theme.darkBg,
      fontFace: 'Arial'
    });

    const hasImage = Boolean(slide.imagePath);
    if (hasImage) {
      try {
        slideObj.addImage({
          path: slide.imagePath,
          x: 5.0, y: 1.1, w: 4.0, h: 3.0
        });
      } catch (imageError) {
        console.error(`Unable to render image on slide ${index + 1}:`, imageError.message || imageError);
      }
    }

    const contentX = 0.5;
    const contentW = hasImage ? 4.4 : 9.0;
    slideObj.addText(slide.bulletPoints.map((point) => `• ${point}`).join('\n'), {
      x: contentX,
      y: 1.1,
      w: contentW,
      h: 4.8,
      fontSize: 18,
      color: theme.text,
      fontFace: 'Arial',
      bullet: true,
      bulletChar: '\u2022',
      lineSpacing: 20
    });

    slideObj.addShape(pres.ShapeType.rect, {
      x: 0, y: 6.8, w: '100%', h: 0.1,
      fill: { type: 'solid', color: theme.secondary },
      line: { type: 'none' }
    });

    slideObj.addText(`Slide ${index + 1}`, {
      x: 9.2, y: 6.85, w: 0.6, h: 0.3,
      fontSize: 12,
      color: theme.primary,
      align: 'right',
      fontFace: 'Arial'
    });
  });

  await pres.writeFile(filename);
  return filename;
};

module.exports = {
  generatePresentationContent,
  createPowerPoint
};
