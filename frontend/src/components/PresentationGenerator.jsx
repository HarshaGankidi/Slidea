import React, { useCallback, useEffect, useRef, useState } from 'react';
import { exportPresentationBlob, getPresentationJobStatus, startPresentationJob } from '../services/api';

const JOB_POLL_MS = 2000;

const stripImageData = (slides) => (slides || []).map(({ imageData, ...rest }) => rest);

/** Bulletproof slide hero image: primary URL with instant Picsum fallback on error (CORS/malformed URL). */
const SlidePreviewImage = ({ slide, index }) => {
  const primary =
    (typeof slide.imageData === 'string' && slide.imageData.trim()) ||
    `https://picsum.photos/seed/${index}/800/450`;
  const fallback = `https://picsum.photos/seed/${(slide.title || `slide${index}`).replace(/\s+/g, '')}/800/450`;

  return (
    <img
      src={primary}
      alt="Slide Preview"
      className="absolute inset-0 h-full w-full object-cover"
      referrerPolicy="no-referrer"
      onError={(e) => {
        const el = e.currentTarget;
        el.onerror = null;
        el.src = fallback;
      }}
    />
  );
};

const CHART_HUES = [265, 200, 45, 330, 160, 25, 310, 190];

const SlideMiniChart = ({ layout, chartData, accent }) => {
  const labels = Array.isArray(chartData?.labels) ? chartData.labels : [];
  const values = Array.isArray(chartData?.values) ? chartData.values.map((v) => Number(v) || 0) : [];
  if (!labels.length || !values.length) return null;
  const n = Math.min(labels.length, values.length, 8);
  const L = labels.slice(0, n);
  const V = values.slice(0, n);
  const max = Math.max(...V, 1);

  if (layout === 'chart_pie') {
    const total = V.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    const stops = V.map((v, i) => {
      const pct = (v / total) * 100;
      const start = acc;
      acc += pct;
      const hue = CHART_HUES[i % CHART_HUES.length];
      return `hsl(${hue} 72% 52%) ${start}% ${acc}%`;
    }).join(', ');
    return (
      <div
        className="mx-auto mt-2 h-20 w-20 shrink-0 rounded-full border border-white/25 shadow-inner ring-2 ring-white/10"
        style={{ background: `conic-gradient(${stops})` }}
        title={chartData?.chartTitle || 'Distribution'}
      />
    );
  }

  return (
    <div className="mt-2 flex h-14 items-end justify-center gap-1.5 px-1">
      {V.map((v, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
          <div
            className="w-full max-w-[12px] rounded-t-sm opacity-95 shadow-sm"
            style={{
              height: `${Math.max(6, Math.round((v / max) * 52))}px`,
              backgroundColor: accent || '#818cf8',
              filter: `hue-rotate(${i * 28}deg)`
            }}
          />
          <span className="max-w-full truncate text-[6px] font-mono uppercase tracking-wider text-slate-400">
            {String(L[i]).slice(0, 3)}
          </span>
        </div>
      ))}
    </div>
  );
};

const SlidePreviewCard = ({ slide, index, accent, primaryText }) => {
  const layout = slide.layoutType || 'classic_rich';
  const isChart = layout === 'chart_pie' || layout === 'chart_bar';
  const isMasterclass = layout === 'classic_rich' || layout === 'split_rich' || isChart;
  const takeaways = Array.isArray(slide.keyTakeaways) ? slide.keyTakeaways.filter(Boolean).slice(0, 5) : [];
  const titleColor = primaryText || '#f8fafc';
  const fallbackBg = `linear-gradient(135deg, ${accent || '#4f46e5'}33 0%, #0f172a 50%, #020617 100%)`;

  return (
    <div className="group rounded-2xl p-[1px] shadow-xl shadow-indigo-950/20 ring-1 ring-white/10 transition-all duration-500 hover:shadow-[0_0_32px_rgba(99,102,241,0.25)] hover:ring-indigo-400/30">
      <div className="overflow-hidden rounded-2xl bg-slate-950">
        <div className="flex items-center justify-between border-b border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500">Slide {index + 1}</span>
          <span
            className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white"
            style={{ color: accent || '#a5b4fc' }}
          >
            {layout}
          </span>
        </div>

        <div className="relative aspect-video w-full overflow-hidden">
          <div className="absolute inset-0" style={{ background: fallbackBg }} aria-hidden />
          <SlidePreviewImage slide={slide} index={index} />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-950/35" />
          <div className="absolute inset-0 border border-white/5 bg-white/5 backdrop-blur-[3px]" />

          <div className="relative flex h-full flex-col p-4 sm:p-5">
            <h3
              className="text-sm font-black leading-tight tracking-wide drop-shadow sm:text-base"
              style={{ color: titleColor }}
            >
              {slide.title || 'Untitled'}
            </h3>
            {slide.subtitle ? (
              <p
                className="mt-1 text-[11px] font-bold tracking-wide text-white/90 sm:text-xs"
                style={{ color: accent || '#c4b5fd' }}
              >
                {slide.subtitle}
              </p>
            ) : null}

            {isChart ? (
              <div className="mt-3 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="min-h-0 overflow-hidden rounded-lg border border-white/10 bg-black/25 p-2 backdrop-blur-sm">
                  {slide.detailedParagraph ? (
                    <p className="text-[10px] leading-relaxed tracking-wide text-slate-200/95 sm:text-[11px]">
                      {slide.detailedParagraph}
                    </p>
                  ) : null}
                </div>
                <div className="flex min-h-[5rem] flex-col items-center justify-center rounded-lg border border-white/10 bg-black/30 p-2 backdrop-blur-sm">
                  {slide.chartData ? (
                    <SlideMiniChart layout={layout} chartData={slide.chartData} accent={accent} />
                  ) : (
                    <p className="text-[10px] tracking-wide text-slate-500">Chart data</p>
                  )}
                  {slide.chartData?.chartTitle ? (
                    <p className="mt-1 text-center text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                      {slide.chartData.chartTitle}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {isMasterclass && !isChart ? (
              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
                {slide.detailedParagraph ? (
                  <p className="text-[10px] leading-relaxed tracking-wide text-slate-200/95 sm:text-[11px]">
                    {slide.detailedParagraph}
                  </p>
                ) : null}
                {takeaways.length > 0 ? (
                  <ul className="space-y-1 text-[10px] font-medium tracking-wide text-slate-300/95 sm:text-[11px]">
                    {takeaways.map((t, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-indigo-400">▸</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {!isMasterclass && slide.bodyText ? (
              <p className="mt-2 text-[10px] tracking-wide text-slate-300">{slide.bodyText}</p>
            ) : null}

            {slide.speakerNotes ? (
              <div className="mt-auto border-t border-amber-500/20 pt-2">
                <p className="text-[8px] font-bold uppercase tracking-widest text-amber-200/80">Notes</p>
                <p className="line-clamp-2 text-[9px] leading-snug tracking-wide text-amber-100/90">{slide.speakerNotes}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const JobStatusTerminal = ({ loading, statusLines }) => {
  if (!loading && statusLines.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 p-1 shadow-[0_0_24px_rgba(99,102,241,0.35)] backdrop-blur-md">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#070b14]/90">
        <div className="flex items-center gap-2 border-b border-white/10 bg-black/50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
          <span className="ml-2 bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-[10px] font-mono font-bold uppercase tracking-[0.35em] text-transparent">
            Slidea · neural build
          </span>
        </div>
        {loading ? (
          <div className="px-4 pt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-indigo-500/20">
              <div className="h-full w-full animate-pulse bg-gradient-to-r from-indigo-600/40 via-fuchsia-500/60 to-cyan-500/40" />
            </div>
            <p className="mt-1.5 text-[9px] font-mono uppercase tracking-widest text-indigo-300/70">Processing pipeline</p>
          </div>
        ) : null}
        <div className="max-h-52 min-h-[100px] overflow-y-auto p-4 font-mono text-left text-sm">
          {statusLines.length === 0 && loading && (
            <p className="text-slate-500">
              <span className="text-cyan-400">➜</span> Handshake complete — polling job…
            </p>
          )}
          {statusLines.map((row, i) => {
            const isLatest = i === statusLines.length - 1;
            return (
              <p
                key={row.t + row.line}
                className={`mb-2 leading-relaxed text-slate-200 ${loading && isLatest ? 'animate-pulse' : ''}`}
              >
                <span className="select-none text-fuchsia-400">❯</span>{' '}
                <span className="text-emerald-300/95">{row.line}</span>
              </p>
            );
          })}
        </div>
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
  const pollIntervalRef = useRef(null);
  const lastPolledStatusRef = useRef('');

  const clearPollInterval = useCallback(() => {
    if (pollIntervalRef.current != null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPollInterval(), [clearPollInterval]);

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

  const runJobGenerate = async ({
    streamPrompt,
    streamTitle,
    streamPdf,
    clearPdfAfter,
    clearPromptTitleOnSuccess
  }) => {
    setError('');
    setSuccess('');
    setStatusLines([]);
    setLoading(true);
    clearPollInterval();
    lastPolledStatusRef.current = '';

    let terminal = false;

    try {
      const { jobId } = await startPresentationJob({
        prompt: streamPrompt,
        title: streamTitle,
        pdfFile: streamPdf
      });

      const pollOnce = async () => {
        let state;
        try {
          state = await getPresentationJobStatus(jobId);
        } catch (e) {
          terminal = true;
          clearPollInterval();
          setLoading(false);
          setError(typeof e?.message === 'string' ? e.message : 'Status check failed');
          return;
        }

        if (state.status && state.status !== lastPolledStatusRef.current) {
          lastPolledStatusRef.current = state.status;
          appendStatus(state.status);
        }

        if (state.error) {
          terminal = true;
          clearPollInterval();
          setLoading(false);
          setError(state.error);
          return;
        }

        if (state.isComplete && state.data) {
          terminal = true;
          clearPollInterval();
          setLoading(false);
          setPreviewData(state.data);
          setSuccess('Deck ready — review below, then export to PowerPoint.');
          if (clearPdfAfter) setPdfFile(null);
          if (clearPromptTitleOnSuccess) {
            setPrompt('');
            setTitle('');
          }
          return;
        }

        if (state.isComplete) {
          terminal = true;
          clearPollInterval();
          setLoading(false);
          setError('Generation finished without a result. Please try again.');
        }
      };

      await pollOnce();
      if (!terminal) {
        pollIntervalRef.current = setInterval(pollOnce, JOB_POLL_MS);
      }
    } catch (err) {
      terminal = true;
      clearPollInterval();
      const msg =
        typeof err?.message === 'string' ? err.message : 'An error occurred while generating the presentation';
      setError(msg);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setError('Please enter a presentation topic or description');
      return;
    }
    await runJobGenerate({
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
    const streamPrompt = `${previewData.originalPrompt}\n\n--- User refinement ---\n${note}\n\nReturn JSON with "theme" (name, bgColor, primaryText, accentColor, fontFace hex 6-digit without # where colors) and "slides" array. Current slides only (revise to satisfy refinement):\n${JSON.stringify(slidesLite)}`;

    setRefineText('');
    await runJobGenerate({
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
    clearPollInterval();
    setPreviewData(null);
    setSuccess('');
    setError('');
    setStatusLines([]);
    setRefineText('');
  };

  const accent = previewData?.theme?.accent || '#6366f1';

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.35), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(236,72,153,0.12), transparent)'
        }}
      />
      <div className={`relative z-10 mx-auto ${previewData ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            Create presentations{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">
              at studio scale
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-400 sm:text-xl">
            Job-based generation, live status, slide-accurate preview with charts — then export a polished .pptx.
          </p>
        </div>

        {!previewData && (
          <div className="mb-12 overflow-hidden rounded-3xl border border-white/10 bg-white/95 shadow-2xl shadow-indigo-950/50 backdrop-blur-xl">
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

                <JobStatusTerminal loading={loading} statusLines={statusLines} />

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
          <div className="mb-12 space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-white">Deck preview</h3>
                <p className="mt-1 font-medium text-slate-400">
                  Theme{' '}
                  <span className="tracking-wide" style={{ color: accent }}>
                    {previewData.themeName || 'Custom'}
                  </span>
                  {previewData.title ? ` · ${previewData.title}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={clearPreview}
                className="self-start rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/10"
              >
                ← New deck
              </button>
            </div>

            <JobStatusTerminal loading={loading} statusLines={statusLines} />

            <div className="max-h-[72vh] space-y-6 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {previewData.slides.map((slide, idx) => (
                  <SlidePreviewCard
                    key={idx}
                    slide={slide}
                    index={idx}
                    accent={accent}
                    primaryText={previewData.theme?.primaryText}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/40 bg-red-950/50 p-4 font-medium text-red-200 backdrop-blur-sm">
                {error}
              </div>
            )}
            {success && !error && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-4 font-medium text-emerald-200 backdrop-blur-sm">
                {success}
              </div>
            )}

            <div className="flex flex-col items-stretch gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-md sm:p-8 lg:flex-row lg:items-end">
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
                  className="flex-1 rounded-2xl border border-white/15 bg-slate-950/70 px-4 py-4 font-medium text-white placeholder:text-slate-500 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
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
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                icon: '👁️',
                title: 'Preview first',
                desc: '16:9 slide frames, charts, and glass layouts before export.'
              },
              {
                icon: '✏️',
                title: 'Refine with AI',
                desc: 'Natural-language passes; schema-safe slides including chart data.'
              },
              {
                icon: '📥',
                title: 'Export on demand',
                desc: 'Native PPTX with pptxgenjs charts, auto-fit text, and your theme.'
              }
            ].map((feature, idx) => (
              <div
                key={idx}
                className="group rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-lg backdrop-blur-md transition-all hover:border-indigo-500/30 hover:shadow-indigo-500/10"
              >
                <div className="mb-4 text-5xl transition-transform group-hover:scale-110">{feature.icon}</div>
                <h3 className="mb-3 text-xl font-black uppercase tracking-wide text-white">{feature.title}</h3>
                <p className="font-medium leading-relaxed text-slate-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PresentationGenerator;
