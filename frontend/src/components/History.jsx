import React, { useState, useEffect } from 'react';
import { presentationAPI } from '../services/api';

const History = () => {
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await presentationAPI.getPresentationHistory();
      if (response.success) {
        setPresentations(response.data);
      }
    } catch (err) {
      setError('Error loading presentation history');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (id, title) => {
    try {
      const blob = await presentationAPI.downloadPresentation(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title}.pptx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-gray-200/80 font-semibold">Loading presentation history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.35em] text-emerald-200/80">Library</p>
            <h2 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-white">Your presentations</h2>
          </div>
          <button
            type="button"
            onClick={fetchHistory}
            className="rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-white bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:bg-black/40 transition-all"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-2xl text-white">
            <div className="text-red-200 font-bold">Error</div>
            {error}
          </div>
        )}

        {presentations.length === 0 ? (
          <div className="bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-2xl text-white p-12 text-center">
            <p className="text-2xl font-black text-white">No presentations yet</p>
            <p className="text-gray-200/70 mt-2">Generate your first deck to see it here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {presentations.map((pres) => (
              <div
                key={pres.id}
                className="bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-2xl text-white overflow-hidden transition-all hover:bg-black/40"
              >
                <div className="h-24 flex items-center justify-between px-6 border-b border-white/10">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-200/80">Deck</p>
                    <p className="mt-1 text-xs text-gray-200/70">{new Date(pres.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="h-10 w-10 rounded-2xl bg-white/10 border border-white/15 grid place-items-center">
                    <span className="text-white font-black">P</span>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-black text-white mb-2 truncate">{pres.title}</h3>
                  <p className="text-gray-200/75 text-sm mb-5 line-clamp-2 leading-relaxed">{pres.prompt}</p>
                  <button
                    onClick={() => handleDownload(pres.id, pres.title)}
                    className="w-full py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-[0.28em] text-white bg-emerald-500/15 border border-emerald-300/25 hover:bg-emerald-500/20 transition-all shadow-[0_10px_30px_rgba(16,185,129,0.12)]"
                  >
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default History;
