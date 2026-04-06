import React, { useState } from 'react';
import { presentationAPI } from '../services/api';

const PresentationGenerator = ({ onPresentationGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!prompt.trim()) {
        setError('Please enter a presentation topic or description');
        setLoading(false);
        return;
      }

      const response = await presentationAPI.generatePresentation(
        prompt,
        title || 'Untitled Presentation'
      );

      if (response.success) {
        setSuccess('Presentation generated successfully! Download link is ready.');
        onPresentationGenerated(response.data);
        
        // Auto-download
        setTimeout(() => {
          downloadPresentation(response.data.id);
        }, 500);

        // Reset form
        setPrompt('');
        setTitle('');
      } else {
        setError(response.message || 'Error generating presentation');
      }
    } catch (err) {
      setError(err.message || 'An error occurred while generating the presentation');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const downloadPresentation = async (id) => {
    try {
      const blob = await presentationAPI.downloadPresentation(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `presentation_${id}.pptx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Error downloading presentation');
      console.error('Download error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-5xl font-bold text-gray-900 mb-4">
            Create Presentations <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-pink-600">Instantly</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Just describe what you need, and our AI will generate a professional presentation for you in seconds.
          </p>
        </div>

        {/* Main Form Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8">
          <form onSubmit={handleSubmit}>
            {/* Title Input */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Presentation Title (Optional)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Product Pitch Deck 2024"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            </div>

            {/* Prompt Textarea */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Describe Your Presentation
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Example: Create a pitch deck for my EdTech startup that focuses on personalized learning. Include sections on the problem, solution, market opportunity, and business model."
                className="w-full h-48 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
              />
            </div>

            {/* Quick Template Buttons */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-3">Quick Templates:</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { text: '📊 Startup Pitch', value: 'Create a pitch deck for my startup. Include executive summary, problem statement, solution, market opportunity, business model, team, and funding requirements.' },
                  { text: '🎓 EdTech Platform', value: 'Create a presentation for my EdTech platform. Cover current education challenges, our vision, key features, impact metrics, and call to action.' },
                  { text: '💼 Business Plan', value: 'Create a comprehensive business plan presentation with company overview, market analysis, financial projections, and growth strategy.' }
                ].map((template, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPrompt(template.value)}
                    className="px-4 py-2 bg-gray-100 hover:bg-indigo-100 text-gray-800 rounded-lg font-medium transition-all transform hover:scale-105"
                  >
                    {template.text}
                  </button>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg text-red-700 font-medium">
                ⚠️ {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg text-green-700 font-medium">
                ✅ {success}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 px-6 rounded-lg font-bold text-white text-lg transition-all transform ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-600 to-pink-600 hover:shadow-lg hover:scale-105'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <span className="animate-spin mr-3">⚙️</span>
                  Generating Your Presentation...
                </span>
              ) : (
                <span>🚀 Generate Presentation</span>
              )}
            </button>
          </form>
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: '⚡',
              title: 'Lightning Fast',
              description: 'Generate stunning presentations in just seconds'
            },
            {
              icon: '🎨',
              title: 'Beautiful Design',
              description: 'Professional templates with elegant color schemes'
            },
            {
              icon: '📥',
              title: 'Easy Download',
              description: 'Download as PowerPoint and customize further'
            }
          ].map((feature, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl shadow-lg p-6 text-center hover:shadow-xl transition-all transform hover:scale-105"
            >
              <div className="text-4xl mb-3">{feature.icon}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PresentationGenerator;
