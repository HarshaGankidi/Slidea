const PptxGenJS = require('pptxgenjs');

try {
  const pres = new PptxGenJS();
  
  // Simulate our fallback content structure
  const content = {
    title: 'Test Presentation',
    slides: [
      {
        title: 'Overview',
        bulletPoints: ['Point 1', 'Point 2', 'Point 3'],
        imagePath: undefined
      }
    ]
  };

  // Test with our actual code structure
  console.log('Creating presentation...');
  
  const titleSlide = pres.addSlide();
  titleSlide.background = '#111827';
  titleSlide.addText(content.title, {
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
  
  console.log('Title slide created');

  content.slides.forEach((slide, index) => {
    console.log(`Processing slide ${index + 1}...`);
    
    const slideObj = pres.addSlide();
    slideObj.background = '#f8fafc';

    slideObj.addShape(pres.ShapeType.rect, {
      x: 0,
      y: 0,
      w: '100%',
      h: 0.65,
      fill: '#4f46e5'
    });

    slideObj.addText(slide.title, {
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
    const bodyWidth = hasImage ? 4.5 : 9.0;
    
    console.log(`Adding text to slide ${index + 1}, bulletPoints:`, slide.bulletPoints);
    
    const textContent = slide.bulletPoints.map((item) => `• ${item}`).join('\n');
    console.log(`Text content: "${textContent}"`);
    
    slideObj.addText(textContent, {
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
    
    console.log(`✓ Slide ${index + 1} completed`);
  });

  console.log('Writing file...');
  pres.writeFile({ fileName: 'c:\\Users\\harsh\\OneDrive\\Desktop\\Slidea\\backend\\test_realistic.pptx' });
  console.log('✓ All tests passed!');

} catch (error) {
  console.error('ERROR:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
