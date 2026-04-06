const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// AI-powered presentation content generation
const generateAIContent = async (prompt) => {
  try {
    const systemPrompt = `You are an expert presentation designer. Create a structured presentation outline based on the user's request.
    Return a JSON object with this exact structure:
    {
      "title": "Presentation Title",
      "slides": [
        {
          "title": "Slide Title",
          "content": ["Point 1", "Point 2", "Point 3"],
          "layout": "content",
          "imagePrompt": "Description of image for this slide (optional)"
        }
      ]
    }

    Guidelines:
    - Create 8-12 slides maximum
    - Include introduction, main content, and conclusion
    - Make content engaging and professional
    - Use bullet points for key information
    - Add relevant image prompts for visual slides
    - Keep slide titles concise but descriptive`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const content = response.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error('AI Content Generation Error:', error);
    // Fallback to mock content
    return generateMockContent(prompt);
  }
};

// Generate images using AI (DALL-E or similar)
const generateImage = async (prompt) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return null; // No API key, skip image generation
    }

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: `Professional presentation slide image: ${prompt}. High quality, clean design, suitable for business presentation.`,
      size: "1024x1024",
      quality: "standard",
      n: 1,
    });

    return response.data[0].url;
  } catch (error) {
    console.error('Image Generation Error:', error);
    return null;
  }
};

// Download and save image locally
const downloadImage = async (imageUrl, filename) => {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');

    const imagesDir = path.join(__dirname, '../images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const filepath = path.join(imagesDir, filename);
    fs.writeFileSync(filepath, buffer);
    return filepath;
  } catch (error) {
    console.error('Image Download Error:', error);
    return null;
  }
};

// Mock content generator (fallback)
const generateMockContent = (prompt) => {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes('pitch deck') || lowerPrompt.includes('startup')) {
    return {
      title: 'Startup Pitch Deck',
      slides: [
        {
          title: 'Executive Summary',
          content: [
            'Welcome to our innovative startup',
            'Solving real-world problems with technology',
            'Strong market potential and growth opportunity',
            'Experienced founding team'
          ],
          layout: 'content',
          imagePrompt: 'Modern startup office with diverse team collaborating'
        },
        {
          title: 'The Problem',
          content: [
            'Current solutions are inadequate',
            'Market gap in [industry]',
            'Pain points for customers',
            'Growing demand for better solutions'
          ],
          layout: 'content',
          imagePrompt: 'Person looking frustrated at current solution'
        },
        {
          title: 'Our Solution',
          content: [
            'Innovative technology platform',
            'User-friendly interface',
            'Scalable and reliable',
            'Differentiating features'
          ],
          layout: 'content',
          imagePrompt: 'Clean, modern software interface'
        },
        {
          title: 'Market Opportunity',
          content: [
            'Large and growing market',
            '$X billion total addressable market',
            'Strong growth projections',
            'Competitive advantages'
          ],
          layout: 'content',
          imagePrompt: 'Growing chart and market analysis graphs'
        },
        {
          title: 'Business Model',
          content: [
            'Revenue streams identified',
            'Pricing strategy',
            'Customer acquisition plan',
            'Path to profitability'
          ],
          layout: 'content',
          imagePrompt: 'Business model canvas or revenue model diagram'
        },
        {
          title: 'Team',
          content: [
            'Experienced founding team',
            'Technical expertise',
            'Domain knowledge',
            'Advisory board'
          ],
          layout: 'content',
          imagePrompt: 'Professional team photo'
        },
        {
          title: 'Financial Projections',
          content: [
            'Revenue growth projections',
            'Path to profitability',
            'Key financial metrics',
            'Funding requirements'
          ],
          layout: 'content',
          imagePrompt: 'Financial charts and growth projections'
        },
        {
          title: 'Call to Action',
          content: [
            'Join us in revolutionizing [industry]',
            'Contact us to learn more',
            'Investment opportunity',
            'Thank you for your time'
          ],
          layout: 'content',
          imagePrompt: 'Handshake or partnership imagery'
        }
      ]
    };
  }

  if (lowerPrompt.includes('edtech') || lowerPrompt.includes('education')) {
    return {
      title: 'EdTech Platform Presentation',
      slides: [
        {
          title: 'Transforming Education',
          content: [
            'Revolutionizing learning experiences',
            'Personalized education for all',
            'Technology-driven solutions',
            'Measurable learning outcomes'
          ],
          layout: 'content',
          imagePrompt: 'Students engaged in digital learning'
        },
        {
          title: 'Current Challenges',
          content: [
            'Traditional education limitations',
            'Lack of personalization',
            'Access barriers',
            'Engagement issues'
          ],
          layout: 'content',
          imagePrompt: 'Traditional classroom vs modern learning'
        },
        {
          title: 'Our Platform',
          content: [
            'Adaptive learning technology',
            'Interactive content delivery',
            'Progress tracking and analytics',
            'Mobile and web accessibility'
          ],
          layout: 'content',
          imagePrompt: 'Modern educational technology interface'
        },
        {
          title: 'Key Features',
          content: [
            '✓ Personalized learning paths',
            '✓ Real-time progress monitoring',
            '✓ Interactive multimedia content',
            '✓ Collaborative learning tools',
            '✓ Assessment and feedback systems'
          ],
          layout: 'content',
          imagePrompt: 'Feature showcase with icons and graphics'
        },
        {
          title: 'Impact & Results',
          content: [
            'Improved learning outcomes',
            'Higher student engagement',
            'Better retention rates',
            'Positive feedback from educators'
          ],
          layout: 'content',
          imagePrompt: 'Charts showing improvement metrics'
        },
        {
          title: 'Market Potential',
          content: [
            'Growing EdTech market',
            'Global education needs',
            'Digital transformation trends',
            'Investment opportunities'
          ],
          layout: 'content',
          imagePrompt: 'World map with education statistics'
        }
      ]
    };
  }

  // Default presentation
  return {
    title: 'AI-Generated Presentation',
    slides: [
      {
        title: 'Welcome',
        content: [
          'AI-powered presentation generation',
          'Professional slide design',
          'Custom content based on your prompt',
          'Ready to download and customize'
        ],
        layout: 'content',
        imagePrompt: 'Modern presentation with technology elements'
      },
      {
        title: 'Key Points',
        content: [
          'Automated content generation',
          'Professional slide layouts',
          'Visual enhancements',
          'Easy customization'
        ],
        layout: 'content',
        imagePrompt: 'Bullet points and key information graphics'
      },
      {
        title: 'Benefits',
        content: [
          'Save time on presentation creation',
          'Consistent professional design',
          'AI-enhanced content',
          'Multiple format support'
        ],
        layout: 'content',
        imagePrompt: 'Benefits and advantages visualization'
      },
      {
        title: 'Next Steps',
        content: [
          'Download your presentation',
          'Customize as needed',
          'Share with your audience',
          'Create more presentations'
        ],
        layout: 'content',
        imagePrompt: 'Action items and next steps graphics'
      }
    ]
  };
};

module.exports = {
  generateAIContent,
  generateImage,
  downloadImage
};