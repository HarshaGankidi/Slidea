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
    <div className="min-h-screen w-full bg-[url('/abstract-fluid-image.png')] bg-cover bg-center bg-no-repeat bg-fixed flex flex-col">
      <Header />
      
      {/* Navigation Tabs */}
      <div className="bg-black/30 backdrop-blur-xl border-b border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center space-x-4 sm:space-x-12">
            <button
              onClick={() => setActiveTab('generator')}
              className={`py-5 px-4 sm:px-8 font-black uppercase tracking-widest text-sm transition-all border-b-4 ${
                activeTab === 'generator'
                  ? 'border-white text-white'
                  : 'border-transparent text-gray-200/70 hover:text-white'
              }`}
            >
              🚀 Generator
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-5 px-4 sm:px-8 font-black uppercase tracking-widest text-sm transition-all border-b-4 ${
                activeTab === 'history'
                  ? 'border-white text-white'
                  : 'border-transparent text-gray-200/70 hover:text-white'
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
      <footer className="bg-black/30 backdrop-blur-xl border-t border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] text-white py-12 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center items-center space-x-2 mb-4">
            <span className="text-2xl font-black bg-clip-text bg-gradient-to-r from-indigo-400 to-pink-400 text-transparent">Slidea</span>
          </div>
          <p className="text-gray-200/80 max-w-md mx-auto leading-relaxed">
            The world's most advanced AI presentation generator. Researching, designing, and delivering your vision in seconds.
          </p>
          <div className="mt-8 pt-8 border-t border-white/10 text-gray-200/60 text-sm">
            © 2024 Slidea AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
