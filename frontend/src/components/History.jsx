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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-gray-600 font-semibold">Loading presentation history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-gray-900 mb-8">
          Your Presentations
        </h2>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {presentations.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <p className="text-2xl text-gray-600">📭 No presentations yet</p>
            <p className="text-gray-500 mt-2">Create your first presentation to see it here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {presentations.map((pres) => (
              <div
                key={pres.id}
                className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all transform hover:scale-105"
              >
                <div className="bg-gradient-to-r from-indigo-500 to-pink-500 h-24 flex items-center justify-center">
                  <span className="text-5xl">📊</span>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2 truncate">{pres.title}</h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">{pres.prompt}</p>
                  <p className="text-xs text-gray-500 mb-4">
                    {new Date(pres.created_at).toLocaleDateString()}
                  </p>
                  <button
                    onClick={() => handleDownload(pres.id, pres.title)}
                    className="w-full py-2 px-4 bg-gradient-to-r from-indigo-600 to-pink-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all"
                  >
                    ⬇️ Download
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
