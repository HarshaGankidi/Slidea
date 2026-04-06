const PptxGenJS = require('pptxgenjs');

try {
  const pres = new PptxGenJS();
  
  // Test 1: Simple slide with just background
  console.log('Test 1: Adding slide with background...');
  const slide1 = pres.addSlide();
  slide1.background = '#ffffff';  // Simple color
  slide1.addText('Test Slide', {
    x: 1,
    y: 1,
    w: 8,
    h: 1,
    fontSize: 20,
    color: '#000000'
  });
  console.log('✓ Test 1 passed');

  // Test 2: Shape with fill
  console.log('Test 2: Adding shape with fill...');
  const slide2 = pres.addSlide();
  slide2.addShape(pres.ShapeType.rect, {
    x: 1,
    y: 1,
    w: 2,
    h: 2,
    fill: '#4f46e5'  // Simple color string
  });
  console.log('✓ Test 2 passed');

  // Write file
  console.log('Writing PowerPoint file...');
  pres.writeFile({ fileName: 'c:\\Users\\harsh\\OneDrive\\Desktop\\Slidea\\backend\\test_simple.pptx' });
  console.log('✓ File written successfully');

} catch (error) {
  console.error('ERROR:', error.message);
  console.error('Stack:', error.stack);
}
