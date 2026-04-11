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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      
      {/* Navigation Tabs */}
      <div className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center space-x-4 sm:space-x-12">
            <button
              onClick={() => setActiveTab('generator')}
              className={`py-5 px-4 sm:px-8 font-black uppercase tracking-widest text-sm transition-all border-b-4 ${
                activeTab === 'generator'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-400 hover:text-gray-900'
              }`}
            >
              🚀 Generator
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-5 px-4 sm:px-8 font-black uppercase tracking-widest text-sm transition-all border-b-4 ${
                activeTab === 'history'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-400 hover:text-gray-900'
              }`}
            >
              📚 Library
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <main className="flex-grow">
        <div className="animate-in fade-in duration-700">
          {activeTab === 'generator' && (
            <PresentationGenerator onPresentationGenerated={handlePresentationGenerated} />
          )}
          {activeTab === 'history' && <History />}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center items-center space-x-2 mb-4">
            <span className="text-2xl font-black bg-clip-text bg-gradient-to-r from-indigo-400 to-pink-400 text-transparent">Slidea</span>
          </div>
          <p className="text-gray-400 max-w-md mx-auto leading-relaxed">
            The world's most advanced AI presentation generator. Researching, designing, and delivering your vision in seconds.
          </p>
          <div className="mt-8 pt-8 border-t border-slate-800 text-gray-500 text-sm">
            © 2024 Slidea AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
