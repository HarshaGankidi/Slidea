import React, { useState } from 'react';
import Header from './components/Header';
import PresentationGenerator from './components/PresentationGenerator';
import History from './components/History';
import './index.css';

const CHALKBOARD_BG = "/ui-background.png";
const MINT = '#4ade80';

const LandingHero = ({ onPrimaryCta }) => {
  return (
    <section className="w-full">
      <div className="grid grid-cols-12 gap-12 max-w-7xl mx-auto pt-20 px-8">
        {/* LEFT (col-span-8): Value Proposition */}
        <div className="col-span-12 lg:col-span-8">
          <div
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black tracking-[0.28em] text-wrap break-words"
            style={{ borderColor: `${MINT}66`, color: MINT }}
          >
            GENERATIVE AI ENGINE
          </div>

          <h1 className="text-6xl font-bold mt-6 mb-6 text-wrap break-words max-w-4xl">
            Infinite layouts. Instantly generated.
          </h1>

          <p className="text-xl text-gray-300 mb-12 max-w-2xl text-wrap break-words">
            Slidea drops rigid templates and writes custom HTML/Tailwind CSS for every slide. Generate agency-grade
            decks with real images and zero overlapping text in seconds.
          </p>

          <div className="grid grid-cols-2 gap-8 max-w-4xl">
            {[
              {
                title: 'Generative UI',
                body: 'The AI writes custom code for every slide — no templates, no repetition.',
                icon: '✦'
              },
              {
                title: 'Base64 Image Injection',
                body: 'Reliable exports with server-side fetching and embedded images that bypass CORS.',
                icon: '⬡'
              },
              {
                title: 'Parametric Layouts',
                body: 'Mathematical constraints keep typography inside safe zones and prevent collisions.',
                icon: '⟡'
              },
              {
                title: 'Export-Ready',
                body: 'Pixel-accurate rendering via html2canvas for clean, high-fidelity PDF/PowerPoint output.',
                icon: '⬢'
              }
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
                <div className="flex items-start gap-4">
                  <div
                    className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 grid place-items-center text-lg font-black"
                    style={{ color: MINT }}
                    aria-hidden="true"
                  >
                    {f.icon}
                  </div>
                  <div>
                    <p className="font-bold text-wrap break-words" style={{ color: MINT }}>
                      {f.title}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-gray-300/80 text-wrap break-words">
                      {f.body}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT (col-span-4): Metrics Card */}
        <div className="col-span-12 lg:col-span-4">
          <div className="relative lg:-translate-y-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
              <p className="text-sm font-bold tracking-[0.28em] text-wrap break-words" style={{ color: MINT }}>
                GENERATOR PREVIEW
              </p>
              <p className="text-gray-300 mt-3 text-wrap break-words">
                Live metrics from the Slidea rendering engine.
              </p>

              <div className="grid grid-cols-2 gap-6 mt-8">
                {[
                  { label: 'Layout Variance', value: 'Infinite' },
                  { label: 'Render Speed', value: '< 8s' },
                  { label: 'CSS Grid Types', value: '12+' },
                  { label: 'Export Quality', value: '4K PDF' }
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs text-gray-400 text-wrap break-words">{m.label}</p>
                    <p className="text-2xl font-bold mt-2 text-wrap break-words" style={{ color: MINT }}>
                      {m.value}
                    </p>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={onPrimaryCta}
                className="w-full bg-white text-black font-bold py-4 rounded-lg mt-8 hover:bg-gray-200 transition"
              >
                Launch Generator
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [presentationGenerated, setPresentationGenerated] = useState(false);

  const handlePresentationGenerated = (data) => {
    setPresentationGenerated(true);
    // Optionally switch to history tab after generation
    setTimeout(() => {
      setActiveTab('history');
    }, 2000);
  };

  return (
    <div
      className="min-h-screen w-full bg-cover bg-center bg-fixed text-white relative flex flex-col"
      style={{ backgroundImage: `url('${CHALKBOARD_BG}')` }}
    >
      <div className="absolute inset-0 bg-black/40 z-0"></div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <Header activeTab={activeTab} onNavigate={setActiveTab} />

        {/* Content Area */}
        <main className="flex-grow">
          <div className="animate-in fade-in duration-700">
            {activeTab === 'home' && (
              <LandingHero onPrimaryCta={() => setActiveTab('generator')} />
            )}
            {activeTab === 'generator' && (
              <PresentationGenerator onPresentationGenerated={handlePresentationGenerated} />
            )}
            {activeTab === 'history' && <History />}
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-black/25 backdrop-blur-xl border-t border-white/10 text-white py-12 mt-24">
          <div className="max-w-7xl mx-auto px-8 text-center">
            <div className="flex justify-center items-center space-x-2 mb-4">
              <span className="text-2xl font-black text-white">Slidea</span>
            </div>
            <p className="text-gray-200/80 max-w-md mx-auto leading-relaxed text-wrap break-words">
              AI-generated presentations with strict layout safety and export-grade rendering.
            </p>
            <div className="mt-8 pt-8 border-t border-white/10 text-gray-200/60 text-sm">
              © 2024 Slidea. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
