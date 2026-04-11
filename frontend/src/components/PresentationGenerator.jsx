import React, { useCallback, useRef, useState } from 'react';
import { exportPresentationBlob, streamGeneratePresentation } from '../services/api';

const stripImageData = (slides) => (slides || []).map(({ imageData, ...rest }) => rest);

const previewImageSrc = (imageData) => {
  if (typeof imageData !== 'string' || !imageData) return null;
  if (imageData.startsWith('data:')) return imageData;
  if (imageData.startsWith('http://') || imageData.startsWith('https://')) return imageData;
  return `data:image/jpeg;base64,${imageData}`;
};

const SlidePreviewCard = ({ slide, index, accent }) => {
  const layout = slide.layoutType || 'split';
  const imgSrc = previewImageSrc(slide.imageData);

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col bg-white shadow-lg shadow-slate-900/5 ring-1 ring-slate-200/80 hover:ring-slate-300 hover:shadow-xl transition-all duration-300">
      <div
        className="h-1 w-full shrink-0"
        style={{ background: `linear-gradient(90deg, ${accent || '#6366f1'}, #0f172a)` }}
      />
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-slate-950 to-slate-900 text-white">
        <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">Slide {index + 1}</span>
        <span
          className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-white/10 text-white border border-white/10"
          style={{ color: accent || '#a5b4fc' }}
        >
          {layout}
        </span>
      </div>

      {imgSrc ? (
        <div className="px-5 pt-3">
          <img src={imgSrc} alt="slide preview" className="w-full h-48 object-cover rounded-md mb-4" />
        </div>
      ) : null}

      <div className={`p-5 flex flex-col gap-3 flex-1 ${imgSrc ? 'pt-0' : ''}`}>
        <h3 className="text-lg font-black text-slate-900 leading-tight tracking-tight">{slide.title || 'Untitled'}</h3>
        {slide.bodyText ? (
          <p className="text-sm text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">{slide.bodyText}</p>
        ) : null}

        {layout === 'metrics' && Array.isArray(slide.metrics) && (
          <div className="flex flex-wrap gap-2 mt-1">
            {slide.metrics.slice(0, 3).map((m, i) => (
              <div
                key={i}
                className="rounded-xl bg-slate-50 px-3 py-2 border border-slate-100/80 shadow-sm"
                style={{ borderLeftWidth: 3, borderLeftColor: accent || '#6366f1' }}
              >
                <div className="text-xl font-black tabular-nums" style={{ color: accent || '#4f46e5' }}>
                  {m.number}
                </div>
                <div className="text-xs text-slate-500 font-semibold">{m.label}</div>
              </div>
            ))}
          </div>
        )}

        {layout === 'grid' && Array.isArray(slide.quadrants) && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {slide.quadrants.slice(0, 4).map((q, i) => (
              <div key={i} className="rounded-lg bg-slate-50/90 p-2.5 border border-slate-100">
                <div className="font-bold text-slate-800">{q.title}</div>
                <div className="text-slate-600 mt-0.5 leading-snug">{q.body}</div>
              </div>
            ))}
          </div>
        )}

        {layout === 'agenda' && Array.isArray(slide.agendaItems) && (
          <ol className="list-decimal list-inside text-sm text-slate-700 space-y-1.5 font-medium">
            {slide.agendaItems.map((it, i) => (
              <li key={i}>
                <span className="font-bold text-slate-900">{it.title}</span>
                {it.detail ? <span className="text-slate-500"> — {it.detail}</span> : null}
              </li>
            ))}
          </ol>
        )}

        {!imgSrc && (
          <div className="mt-auto pt-3 border-t border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Visual</p>
            <div className="h-28 rounded-xl bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 border border-dashed border-slate-200 flex flex-col items-center justify-center px-3">
              <p className="text-xs font-semibold text-slate-500">No image — accent in export</p>
              {slide.imageKeyword ? (
                <p className="text-[10px] text-slate-400 mt-1 font-mono truncate max-w-full">{slide.imageKeyword}</p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PresentationGenerator = ({ onPresentationGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [statusLines, setStatusLines] = useState([]);
  const [previewData, setPreviewData] = useState(null);
  const [refineText, setRefineText] = useState('');
  const fileInputRef = useRef(null);

  const appendStatus = useCallback((line) => {
    setStatusLines((prev) => [...prev, { t: Date.now(), line }]);
  }, []);

  const onPdfSelected = useCallback((file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name?.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.');
      return;
    }
    setError('');
    setPdfFile(file);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer?.files?.[0];
      onPdfSelected(f);
    },
    [onPdfSelected]
  );

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const runStreamGenerate = async ({ streamPrompt, streamTitle, streamPdf, clearPdfAfter, clearPromptTitleOnSuccess }) => {
    setError('');
    setSuccess('');
    setStatusLines([]);
    setLoading(true);

    try {
      let completed = false;

      await streamGeneratePresentation({
        prompt: streamPrompt,
        title: streamTitle,
        pdfFile: streamPdf,
        onEvent: (payload) => {
          if (payload.type === 'status' && payload.message) {
            appendStatus(payload.message);
          }
          if (payload.type === 'complete' && payload.success && payload.data) {
            completed = true;
            setPreviewData(payload.data);
            setSuccess('Deck ready — review below, then export to PowerPoint.');
            if (clearPdfAfter) setPdfFile(null);
            if (clearPromptTitleOnSuccess) {
              setPrompt('');
              setTitle('');
            }
          }
        }
      });

      if (!completed) {
        setError('Generation finished without a result. Please try again.');
      }
    } catch (err) {
      const msg = typeof err?.message === 'string' ? err.message : 'An error occurred while generating the presentation';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setError('Please enter a presentation topic or description');
      return;
    }
    await runStreamGenerate({
      streamPrompt: prompt.trim(),
      streamTitle: title.trim() || 'Untitled Presentation',
      streamPdf: pdfFile,
      clearPdfAfter: true,
      clearPromptTitleOnSuccess: true
    });
  };

  const handleRefine = async () => {
    if (!previewData?.originalPrompt) {
      setError('Nothing to refine yet.');
      return;
    }
    const note = refineText.trim();
    if (!note) {
      setError('Add refinement instructions before updating.');
      return;
    }

    const slidesLite = stripImageData(previewData.slides);
    const streamPrompt = `${previewData.originalPrompt}\n\n--- User refinement ---\n${note}\n\nCurrent slide deck (keep layoutType values where sensible; revise content to satisfy the refinement):\n${JSON.stringify(slidesLite)}`;

    setRefineText('');
    await runStreamGenerate({
      streamPrompt,
      streamTitle: previewData.title || 'Untitled Presentation',
      streamPdf: null,
      clearPdfAfter: false,
      clearPromptTitleOnSuccess: false
    });
  };

  const handleExport = async () => {
    if (!previewData?.slides?.length) {
      setError('No slides to export.');
      return;
    }
    setExportLoading(true);
    setError('');
    try {
      const blob = await exportPresentationBlob({
        title: previewData.title,
        slides: previewData.slides,
        theme: previewData.theme,
        prompt: previewData.originalPrompt || ''
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safe = (previewData.title || 'presentation').replace(/[^\w\s\-]+/g, '').replace(/\s+/g, '-') || 'presentation';
      link.href = url;
      link.download = `${safe}.pptx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setSuccess('PowerPoint downloaded.');
      onPresentationGenerated?.({
        title: previewData.title,
        prompt: previewData.originalPrompt
      });
    } catch (err) {
      setError(typeof err?.message === 'string' ? err.message : 'Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  const clearPreview = () => {
    setPreviewData(null);
    setSuccess('');
    setError('');
    setStatusLines([]);
    setRefineText('');
  };

  const accent = previewData?.theme?.accent || '#6366f1';

  return (
    <div className="bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className={previewData ? 'max-w-6xl mx-auto' : 'max-w-4xl mx-auto'}>
        <div className="text-center mb-12">
          <h2 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-6 leading-tight">
            Create Presentations <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-pink-600">Instantly</span>
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Generate with live status, preview every slide here, refine with natural language, then export a polished .pptx.
          </p>
        </div>

        {!previewData && (
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden mb-12">
            <div className="p-8 sm:p-10">
              <form onSubmit={handleSubmit} className="space-y-8">
                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-2 uppercase tracking-wider">Presentation Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., The Future of Personalized Learning"
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-indigo-500 focus:bg-white transition-all text-gray-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-2 uppercase tracking-wider">Describe Your Vision</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your startup, idea, or topic. Optional PDF adds research context."
                    className="w-full h-48 px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none text-gray-900 font-medium leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-2 uppercase tracking-wider">Source PDF (optional)</label>
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                    }}
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-2xl px-6 py-10 text-center cursor-pointer transition-all ${
                      pdfFile ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-200 bg-gray-50/80 hover:border-indigo-300 hover:bg-indigo-50/30'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => onPdfSelected(e.target.files?.[0])}
                    />
                    <p className="text-gray-700 font-semibold">
                      {pdfFile ? (
                        <>
                          <span className="text-emerald-700">{pdfFile.name}</span>
                          <span className="block text-sm font-normal text-gray-500 mt-1">Click to replace</span>
                        </>
                      ) : (
                        <>
                          Drag & drop a PDF here, or <span className="text-indigo-600">browse</span>
                        </>
                      )}
                    </p>
                  </div>
                  {pdfFile && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPdfFile(null);
                      }}
                      className="mt-2 text-sm font-bold text-red-600 hover:text-red-800"
                    >
                      Remove PDF
                    </button>
                  )}
                </div>

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

                {(loading || statusLines.length > 0) && (
                  <div className="rounded-2xl overflow-hidden border border-gray-800 bg-[#0d1117] shadow-inner">
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border-b border-gray-800">
                      <span className="h-3 w-3 rounded-full bg-red-500/90" />
                      <span className="h-3 w-3 rounded-full bg-amber-400/90" />
                      <span className="h-3 w-3 rounded-full bg-emerald-500/90" />
                      <span className="ml-2 text-[11px] font-mono text-gray-500 uppercase tracking-widest">slidea — live build</span>
                    </div>
                    <div className="p-4 font-mono text-sm min-h-[120px] max-h-56 overflow-y-auto text-left">
                      {statusLines.length === 0 && loading && (
                        <p className="text-gray-500">
                          <span className="text-emerald-400">➜</span> Connecting…
                        </p>
                      )}
                      {statusLines.map((row) => (
                        <p key={row.t + row.line} className="text-gray-200 mb-1.5 leading-relaxed">
                          <span className="text-cyan-400 select-none">❯</span>{' '}
                          <span className="text-emerald-300/95">{row.line}</span>
                        </p>
                      ))}
                      {loading && (
                        <p className="text-gray-500 mt-2">
                          <span className="inline-block w-2 h-4 bg-emerald-400/90 animate-pulse align-middle mr-1" />
                          working…
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-800 font-medium flex items-center">
                    <span className="mr-3 text-xl">⚠️</span> {error}
                  </div>
                )}

                {success && (
                  <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded-r-lg text-green-800 font-medium flex items-center">
                    <span className="mr-3 text-xl">✅</span> {success}
                  </div>
                )}

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
                      <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin mr-4" />
                      Building deck…
                    </div>
                  ) : (
                    <span>Generate preview</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {previewData && (
          <div className="space-y-8 mb-12">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-gray-900">Preview deck</h3>
                <p className="text-gray-500 font-medium mt-1">
                  Theme: <span style={{ color: accent }}>{previewData.themeName || 'Custom'}</span>
                  {previewData.title ? ` · ${previewData.title}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={clearPreview}
                className="self-start px-5 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors"
              >
                ← New deck
              </button>
            </div>

            {(loading || statusLines.length > 0) && (
              <div className="rounded-2xl overflow-hidden border border-gray-800 bg-[#0d1117] shadow-inner">
                <div className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border-b border-gray-800">
                  <span className="ml-2 text-[11px] font-mono text-gray-500 uppercase tracking-widest">slidea — live build</span>
                </div>
                <div className="p-4 font-mono text-sm max-h-40 overflow-y-auto text-left">
                  {statusLines.map((row) => (
                    <p key={row.t + row.line} className="text-gray-200 mb-1">
                      <span className="text-cyan-400">❯</span> <span className="text-emerald-300/95">{row.line}</span>
                    </p>
                  ))}
                  {loading && <p className="text-gray-500 text-xs mt-1 animate-pulse">working…</p>}
                </div>
              </div>
            )}

            <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {previewData.slides.map((slide, idx) => (
                  <SlidePreviewCard key={idx} slide={slide} index={idx} accent={accent} />
                ))}
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-800 font-medium">{error}</div>
            )}
            {success && !error && (
              <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded-r-lg text-green-800 font-medium">{success}</div>
            )}

            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-end bg-white rounded-3xl border border-gray-200 shadow-lg p-6 sm:p-8">
              <button
                type="button"
                disabled={exportLoading || loading}
                onClick={handleExport}
                className="flex-1 py-5 px-6 rounded-2xl font-black text-white text-lg uppercase tracking-widest shadow-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {exportLoading ? 'Preparing file…' : 'Download PowerPoint'}
              </button>
              <div className="flex-[1.2] flex flex-col sm:flex-row gap-3 w-full">
                <input
                  type="text"
                  value={refineText}
                  onChange={(e) => setRefineText(e.target.value)}
                  placeholder="Want changes? Type them here…"
                  className="flex-1 px-4 py-4 rounded-2xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none text-gray-900 font-medium"
                  disabled={loading}
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleRefine}
                  className="px-8 py-4 rounded-2xl font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        )}

        {!previewData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: '👁️',
                title: 'Preview first',
                desc: 'Review every slide and image before anything hits your disk as a .pptx.'
              },
              {
                icon: '✏️',
                title: 'Refine with AI',
                desc: 'Iterate with natural language; we resend context so Gemini reshapes the deck.'
              },
              {
                icon: '📥',
                title: 'Export on demand',
                desc: 'One click builds the PowerPoint from your preview JSON — theme and layouts preserved.'
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
        )}
      </div>
    </div>
  );
};

export default PresentationGenerator;
