const axios = require('axios');

const testGeneratePresentation = async () => {
  try {
    console.log('Testing generate endpoint...');
    const response = await axios.post('http://localhost:5000/api/presentations/generate', {
      prompt: 'Create a presentation on machine learning and AI',
      title: 'Test Presentation'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('SUCCESS:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('ERROR:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Message:', error.message);
      console.error('Full error:', error);
    }
  }
};

testGeneratePresentation();
