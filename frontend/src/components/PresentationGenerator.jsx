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
    <div className="bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-6 leading-tight">
            Create Presentations <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-pink-600">Instantly</span>
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Just describe what you need, and our AI will research the topic and design a professional pitch deck for you.
          </p>
        </div>

        {/* Main Form Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden mb-12">
          <div className="p-8 sm:p-10">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Title Input */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2 uppercase tracking-wider">
                  Presentation Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., The Future of Personalized Learning"
                  className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-indigo-500 focus:bg-white transition-all text-gray-900 font-medium"
                />
              </div>

              {/* Prompt Textarea */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2 uppercase tracking-wider">
                  Describe Your Vision
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your startup, business idea, or topic in detail. The AI will research and structure it for you."
                  className="w-full h-56 px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none text-gray-900 font-medium leading-relaxed"
                />
              </div>

              {/* Quick Template Buttons */}
              <div>
                <p className="text-xs font-bold text-gray-500 mb-4 uppercase tracking-widest text-center">Or start with a template</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {[
                    { text: '📊 Startup Pitch', value: 'Create a professional startup pitch deck focusing on problem, solution, and market traction.' },
                    { text: '🎓 EdTech Vision', value: 'A presentation for an EdTech platform covering education challenges and innovative solutions.' },
                    { text: '💼 Business Plan', value: 'A comprehensive business growth strategy with market analysis and financial goals.' }
                  ].map((template, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPrompt(template.value)}
                      className="px-5 py-2.5 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 rounded-full text-sm font-bold transition-all transform hover:scale-105 active:scale-95"
                    >
                      {template.text}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error/Success Messages */}
              {error && (
                <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-800 font-medium flex items-center">
                  <span className="mr-3 text-xl">⚠️</span> {error}
                </div>
              )}

              {success && (
                <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded-r-lg text-green-800 font-medium flex items-center animate-pulse">
                  <span className="mr-3 text-xl">✅</span> {success}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-5 px-8 rounded-2xl font-black text-white text-xl uppercase tracking-widest shadow-xl transition-all transform active:scale-95 ${
                  loading
                    ? 'bg-gray-300 cursor-not-allowed overflow-hidden'
                    : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:shadow-indigo-200 hover:scale-[1.02]'
                }`}
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin mr-4"></div>
                    Researching & Designing...
                  </div>
                ) : (
                  <span>Create My Pitch Deck</span>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: '🌐',
              title: 'Real Research',
              desc: 'Live data fetching from Wikipedia ensures your presentation is factually grounded.'
            },
            {
              icon: '✨',
              title: 'VC Aesthetic',
              desc: 'High-end design language inspired by elite Venture Capital pitch decks.'
            },
            {
              icon: '📥',
              title: 'PowerPoint Ready',
              desc: 'Fully editable .pptx files that you can customize and present anywhere.'
            }
          ].map((feature, idx) => (
            <div
              key={idx}
              className="bg-white p-8 rounded-3xl shadow-lg border border-gray-50 hover:border-indigo-100 transition-all text-center group"
            >
              <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">{feature.icon}</div>
              <h3 className="text-xl font-black text-gray-900 mb-3 uppercase tracking-tight">{feature.title}</h3>
              <p className="text-gray-500 leading-relaxed font-medium">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PresentationGenerator;
