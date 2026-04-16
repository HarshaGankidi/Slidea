import React from 'react';

const ACCENT = '#4ade80';

const Header = ({ activeTab, onNavigate }) => {
  return (
    <header className="relative z-10">
      <div className="bg-black/25 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between gap-6">
            <button
              type="button"
              onClick={() => onNavigate?.('home')}
              className="flex items-center gap-4 min-w-0 text-left"
            >
              <div className="h-10 w-10 rounded-2xl bg-white/10 border border-white/15 grid place-items-center shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                <span className="text-white font-black">S</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="text-2xl sm:text-3xl font-black tracking-tight text-white truncate">
                    Slidea
                  </span>
                  <span className="hidden sm:inline text-sm text-gray-200/70 truncate">
                    AI Presentation Generator
                  </span>
                </div>
              </div>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate?.('generator')}
                className={`rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-[0.25em] transition-all border ${
                  activeTab === 'generator'
                    ? 'bg-white/10 text-white border-white/25'
                    : 'bg-white/5 text-gray-200/75 border-white/10 hover:text-white hover:bg-white/10'
                }`}
              >
                Generator
              </button>
              <button
                type="button"
                onClick={() => onNavigate?.('history')}
                className={`rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-[0.25em] transition-all border ${
                  activeTab === 'history'
                    ? 'bg-white/10 text-white border-white/25'
                    : 'bg-white/5 text-gray-200/75 border-white/10 hover:text-white hover:bg-white/10'
                }`}
              >
                Library
              </button>
              <span
                className="hidden lg:inline ml-3 text-[10px] font-black uppercase tracking-[0.35em]"
                style={{ color: ACCENT }}
              >
                12‑COL GRID
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
