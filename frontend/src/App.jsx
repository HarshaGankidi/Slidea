import React, { useState } from 'react';
import Header from './components/Header';
import PresentationGenerator from './components/PresentationGenerator';
import History from './components/History';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('generator');
  const [presentationGenerated, setPresentationGenerated] = useState(false);

  const handlePresentationGenerated = (data) => {
    setPresentationGenerated(true);
    // Optionally switch to history tab after generation
    setTimeout(() => {
      setActiveTab('history');
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Header />
      
      {/* Navigation Tabs */}
      <div className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center space-x-8">
            <button
              onClick={() => setActiveTab('generator')}
              className={`py-4 px-6 font-semibold transition-all border-b-4 ${
                activeTab === 'generator'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              🚀 Create Presentation
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-6 font-semibold transition-all border-b-4 ${
                activeTab === 'history'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              📚 My Presentations
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main>
        {activeTab === 'generator' && (
          <PresentationGenerator onPresentationGenerated={handlePresentationGenerated} />
        )}
        {activeTab === 'history' && <History />}
      </main>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-indigo-900 to-pink-900 text-white py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-300">© 2024 Slidea - AI Presentation Generator</p>
          <p className="text-gray-400 text-sm mt-2">
            Create beautiful presentations with the power of AI
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
