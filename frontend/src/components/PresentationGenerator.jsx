import React, { useCallback, useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import PptxGenJS from 'pptxgenjs';
import { getPresentationJobStatus, startPresentationJob } from '../services/api';
import PresentationViewer from './PresentationViewer';

const JOB_POLL_MS = 2000;

/** Strip embedded base64 data URIs from slide HTML for refinement payloads. */
const stripBase64ForRefinement = (slides) =>
  (slides || []).map((s) => ({
    ...s,
    html: typeof s.html === 'string'
      ? s.html.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g, '{{IMAGE_1}}')
      : s.html,
    imageKeywords: s.imageKeywords || []
  }));

/** Inject Google Fonts dynamically. Returns cleanup fn. */
const injectGoogleFonts = (headingFont, bodyFont) => {
  const LINK_ID = 'slidea-google-fonts';
  const families = [headingFont, bodyFont]
    .filter(Boolean)
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700;800;900`)
    .join('&');
  if (!families) return () => {};

  let link = document.getElementById(LINK_ID);
  if (!link) {
    link = document.createElement('link');
    link.id = LINK_ID;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;

  return () => {
    const el = document.getElementById(LINK_ID);
    if (el) el.remove();
  };
};

/** Inject Tailwind CDN Play script for runtime class compilation. */
const injectTailwindCDN = () => {
  const SCRIPT_ID = 'slidea-tailwind-cdn';
  if (document.getElementById(SCRIPT_ID)) return () => {};

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = 'https://cdn.tailwindcss.com';
  document.head.appendChild(script);

  return () => {
    const el = document.getElementById(SCRIPT_ID);
    if (el) el.remove();
  };
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
            Slidea · generative ui
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
  const exportRootRef = useRef(null);

  const clearPollInterval = useCallback(() => {
    if (pollIntervalRef.current != null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPollInterval(), [clearPollInterval]);

  // Inject Tailwind CDN once on mount so runtime Tailwind classes compile
  useEffect(() => {
    const cleanup = injectTailwindCDN();
    return cleanup;
  }, []);

  // Inject Google Fonts when the AI theme arrives
  useEffect(() => {
    if (!previewData?.theme) return;
    const cleanup = injectGoogleFonts(previewData.theme.headingFont, previewData.theme.bodyFont);
    return cleanup;
  }, [previewData?.theme?.headingFont, previewData?.theme?.bodyFont]);

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
          const errMsg =
            state.error?.message ||
            (typeof state.error === 'string' ? state.error : '') ||
            'Unknown Server Error';
          setError(errMsg);
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

    const slidesLite = stripBase64ForRefinement(previewData.slides);
    const streamPrompt = `${previewData.originalPrompt}\n\n--- User refinement ---\n${note}\n\nYou are revising an existing presentation. Return JSON with "theme" (name, backgroundColor, accentColor, headingFont, bodyFont) and "slides" array where each slide has "html" (raw Tailwind HTML filling 960x540) and "imageKeywords" (array, use {{IMAGE_1}} placeholder in HTML). Max 3 images. Here are the current slides:\n${JSON.stringify(slidesLite)}`;

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
      const root = exportRootRef.current;
      if (!root) throw new Error('Export staging area not ready.');

      // Allow Tailwind CDN time to compile classes in the export staging area
      await new Promise((r) => setTimeout(r, 500));

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const nodes = root.querySelectorAll('.slide-export-capture');
      if (!nodes.length) throw new Error('No slide frames found to capture.');

      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';

      const exportBg = previewData.theme?.bg || previewData.theme?.backgroundColor || '#0b1220';

      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: exportBg,
          logging: false,
          foreignObjectRendering: false,
          onclone: (clonedDoc) => {
            clonedDoc.querySelectorAll('.slide-export-capture').forEach((node) => {
              node.style.backgroundColor = exportBg;
            });
          }
        });
        const dataUri = canvas.toDataURL('image/png');
        const slideObj = pptx.addSlide();
        slideObj.background = { data: dataUri };
      }

      const safe =
        (previewData.title || 'Presentation').replace(/[^\w\s\-]+/g, '').replace(/\s+/g, '-').slice(0, 80) ||
        'Presentation';
      await pptx.writeFile({ fileName: `${safe}.pptx` });

      setSuccess('PowerPoint downloaded — pixel-perfect from your on-screen design.');
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

  const accent = previewData?.theme?.accent || previewData?.theme?.accentColor || '#34d399';
  const CYBER_GREEN = '#34d399';

  return (
    <div className="relative min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className={`relative z-10 mx-auto ${previewData ? 'max-w-7xl' : 'max-w-7xl'}`}>
        {/* STRICT 12-COLUMN HERO (reference-matched) */}
        {!previewData && (
          <section className="mb-10">
            <div className="grid grid-cols-12 w-full h-full bg-[#070b12]/70 backdrop-blur-xl border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.45)] rounded-[28px] overflow-hidden">
              <div className="col-span-12 p-6 sm:p-8 border-b border-white/10">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.38em] text-emerald-200/85">
                      Support Hub
                    </span>
                    <span className="rounded-full bg-emerald-500/15 border border-emerald-300/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-emerald-200/80">
                      Enterprise Support
                    </span>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-200/60">
                    12‑column grid
                  </span>
                </div>
              </div>

              <div className="col-span-12 p-16 sm:p-20">
                <div className="grid grid-cols-12 gap-10 items-start">
                  {/* LEFT: 8 columns */}
                  <div className="col-span-12 lg:col-span-8">
                    <h1 className="text-[44px] sm:text-[56px] lg:text-[64px] font-black tracking-tight leading-[0.95] text-white max-w-4xl text-wrap break-words">
                      Welcome to <span style={{ color: CYBER_GREEN }}>My Webpage</span>
                    </h1>
                    <p className="mt-6 text-lg sm:text-xl leading-relaxed text-gray-200/75 max-w-3xl text-wrap break-words">
                      A premium workspace where your ideas become export‑ready presentations—built with safe layouts,
                      reliable visuals, and a consistent cyber‑green hierarchy.
                    </p>

                    <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl">
                      {[
                        { title: 'Faster workflow', body: 'Generate a full deck structure in minutes with strict layout safe‑zones.' },
                        { title: 'Secure by design', body: 'Server‑side image injection prevents CORS issues and broken exports.' },
                        { title: 'Live insights', body: 'Metrics and highlights are formatted consistently for executive readability.' },
                        { title: 'Multi‑channel ready', body: 'Export to PowerPoint with pixel‑perfect capture and high‑contrast UI.' }
                      ].map((f) => (
                        <div
                          key={f.title}
                          className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-1 h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-300/20 grid place-items-center">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CYBER_GREEN }} />
                            </div>
                            <div>
                              <p className="text-sm font-black uppercase tracking-[0.22em]" style={{ color: CYBER_GREEN }}>
                                {f.title}
                              </p>
                              <p className="mt-2 text-sm leading-relaxed text-gray-200/70 max-w-xl text-wrap break-words">
                                {f.body}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-10 flex flex-col sm:flex-row gap-4">
                      <button
                        type="button"
                        onClick={() => document.getElementById('generator-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-[0.28em] text-black shadow-[0_18px_40px_rgba(52,211,153,0.18)]"
                        style={{ backgroundColor: CYBER_GREEN }}
                      >
                        Get started
                      </button>
                      <button
                        type="button"
                        className="rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-[0.28em] text-white bg-white/5 border border-white/15 hover:bg-white/10 transition-all"
                      >
                        View examples
                      </button>
                    </div>
                  </div>

                  {/* RIGHT: 4 columns (Side Box) */}
                  <div className="col-span-12 lg:col-start-9 lg:col-span-4">
                    <div className="bg-black/30 backdrop-blur-xl border border-white/15 shadow-[0_20px_70px_rgba(0,0,0,0.55)] rounded-[28px] overflow-hidden">
                      <div className="p-6 border-b border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: CYBER_GREEN }}>
                          Workspace preview
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-gray-200/70 text-wrap break-words max-w-md">
                          A snapshot of the dashboard you’ll use after login. Metrics are generated from prompts and AI suggestions.
                        </p>
                      </div>
                      <div className="p-6 grid grid-cols-2 gap-4">
                        {[
                          { label: 'Decks today', value: '24' },
                          { label: 'Auto‑styled', value: '82%' },
                          { label: 'Export time', value: '9m' },
                          { label: 'Quality score', value: '4.9/5' }
                        ].map((m) => (
                          <div key={m.label} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gray-200/60">
                              {m.label}
                            </p>
                            <p className="mt-3 text-2xl font-black text-white tabular-nums">{m.value}</p>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="col-span-2 mt-2 rounded-2xl px-5 py-4 text-xs font-black uppercase tracking-[0.28em] text-white bg-white/10 border border-white/15 hover:bg-white/15 transition-all"
                        >
                          Get started — Login
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {!previewData && (
          <div id="generator-form" className="mb-12 overflow-hidden bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-2xl text-white">
            <div className="p-8 sm:p-10">
              <form onSubmit={handleSubmit} className="space-y-8">
                <div>
                  <label className="block text-sm font-bold text-gray-200 mb-2 uppercase tracking-wider">Presentation Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., The Future of Personalized Learning"
                    className="w-full px-5 py-4 bg-black/20 border border-white/20 rounded-2xl focus:outline-none focus:border-white/40 transition-all text-white placeholder:text-gray-200/50 font-medium backdrop-blur-xl"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-200 mb-2 uppercase tracking-wider">Describe Your Vision</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your startup, idea, or topic. Optional PDF adds research context."
                    className="w-full h-48 px-5 py-4 bg-black/20 border border-white/20 rounded-2xl focus:outline-none focus:border-white/40 transition-all resize-none text-white placeholder:text-gray-200/50 font-medium leading-relaxed backdrop-blur-xl"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-200 mb-2 uppercase tracking-wider">Source PDF (optional)</label>
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
                    className={`relative border border-dashed rounded-2xl px-6 py-10 text-center cursor-pointer transition-all bg-black/20 backdrop-blur-xl ${
                      pdfFile ? 'border-emerald-300/60' : 'border-white/20 hover:border-white/35'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => onPdfSelected(e.target.files?.[0])}
                    />
                    <p className="text-gray-200 font-semibold">
                      {pdfFile ? (
                        <>
                          <span className="text-emerald-200">{pdfFile.name}</span>
                          <span className="block text-sm font-normal text-gray-200/70 mt-1">Click to replace</span>
                        </>
                      ) : (
                        <>
                          Drag & drop a PDF here, or <span className="text-gray-200 underline underline-offset-4">browse</span>
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
                  <p className="text-xs font-bold text-gray-200/70 mb-4 uppercase tracking-widest text-center">Or start with a template</p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {[
                      { text: 'Startup Pitch', value: 'Create a professional startup pitch deck for a Series A SaaS company. Cover the problem, solution, market size, traction metrics, business model, and team.' },
                      { text: 'AI & Technology', value: 'A cutting-edge presentation about artificial intelligence and its impact on software development, healthcare, and creative industries in 2026.' },
                      { text: 'Corporate Strategy', value: 'A clean, professional quarterly business review for a Fortune 500 company with revenue metrics, market analysis, strategic initiatives, and next-quarter goals.' },
                      { text: 'Healthy Eating', value: 'A warm, inviting presentation about plant-based nutrition, meal planning, and the science behind whole-food diets for everyday wellness.' },
                      { text: 'EdTech Vision', value: 'A presentation for an EdTech platform that uses gamification and AI tutoring to personalize K-12 education and improve student outcomes.' },
                      { text: 'Sustainability', value: 'An earth-toned presentation on corporate sustainability initiatives, carbon footprint reduction, renewable energy adoption, and ESG reporting.' },
                      { text: 'Product Launch', value: 'A sleek product launch deck for a new consumer electronics device. Cover features, design philosophy, pricing tiers, and go-to-market strategy.' },
                      { text: 'Travel & Culture', value: 'A vibrant presentation showcasing the top 10 travel destinations for 2026, with cultural highlights, cuisine, and adventure activities.' }
                    ].map((template, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPrompt(template.value)}
                        className="px-5 py-2.5 bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-2xl text-white text-sm font-bold transition-all transform hover:scale-105 active:scale-95 hover:bg-black/40"
                      >
                        {template.text}
                      </button>
                    ))}
                  </div>
                </div>

                <JobStatusTerminal loading={loading} statusLines={statusLines} />

                {error && (
                  <div className="flex flex-col items-center p-4 bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-2xl text-white">
                    <span className="font-bold text-red-200">Generation Failed</span>
                    <span className="text-sm text-gray-200/80 mt-1">
                      {error?.message || error || 'Unknown Server Error'}
                    </span>
                  </div>
                )}

                {success && (
                  <div className="p-4 bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-2xl text-white font-medium flex items-center">
                    <span className="text-emerald-200">{success}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-5 px-8 rounded-2xl font-black text-white text-xl uppercase tracking-widest transition-all transform active:scale-95 bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] ${
                    loading ? 'opacity-60 cursor-not-allowed' : 'hover:bg-black/40 hover:scale-[1.02]'
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
                  <span className="tracking-wide" style={{ color: accent }}>
                    {previewData.themeName || 'Generative UI'}
                  </span>
                  {previewData.designDNA?.globalStyle ? (
                    <span className="text-slate-500"> · {previewData.designDNA.globalStyle}</span>
                  ) : null}
                  {previewData.theme?.headingFont ? (
                    <span className="text-slate-600 text-xs"> · {previewData.theme.headingFont}</span>
                  ) : null}
                  {previewData.title ? ` · ${previewData.title}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={clearPreview}
                className="self-start bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-2xl text-white px-5 py-2.5 font-bold transition-colors hover:bg-black/40"
              >
                New deck
              </button>
            </div>

            <JobStatusTerminal loading={loading} statusLines={statusLines} />

            <div className="max-h-[72vh] space-y-6 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                {previewData.slides.map((slide, idx) => (
                  <div key={idx} className="bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-2xl text-white p-3">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-200/70">
                        Slide {idx + 1}
                      </span>
                      <span
                        className="rounded-md border border-white/20 bg-black/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
                        style={{ color: accent }}
                      >
                        generative
                      </span>
                    </div>
                    <div
                      className="overflow-hidden rounded-xl border border-white/20"
                      style={{
                        width: 432,
                        height: 243,
                        backgroundColor: previewData.theme?.bg || previewData.theme?.backgroundColor || '#0b1220'
                      }}
                    >
                      <div
                        className="origin-top-left"
                        style={{ transform: 'scale(0.3375)', width: 1280, height: 720 }}
                      >
                        <PresentationViewer slide={slide} animate />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Off-screen export staging — static capture, no animation */}
            <div
              ref={exportRootRef}
              className="pointer-events-none fixed left-[-14000px] top-0 z-0 flex flex-col gap-10 py-8"
              aria-hidden
            >
              {previewData.slides.map((slide, idx) => (
                <div
                  key={`export-${idx}`}
                  className="slide-export-capture"
                  style={{ backgroundColor: previewData.theme?.bg || previewData.theme?.backgroundColor || '#0b1220' }}
                >
                  <PresentationViewer slide={slide} animate={false} />
                </div>
              ))}
            </div>

            {error && (
              <div className="text-red-200 flex flex-col items-center rounded-xl border border-red-500/40 bg-red-950/50 p-4 font-medium backdrop-blur-sm">
                <span className="font-bold">Error</span>
                <span className="text-sm opacity-80 mt-1">
                  {error?.message || error || 'Unknown Server Error'}
                </span>
              </div>
            )}
            {success && !error && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-4 font-medium text-emerald-200 backdrop-blur-sm">
                {success}
              </div>
            )}

            <div className="flex flex-col items-stretch gap-4 bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-2xl text-white p-6 sm:p-8 lg:flex-row lg:items-end">
              <button
                type="button"
                disabled={exportLoading || loading}
                onClick={handleExport}
                className="flex-1 py-5 px-6 rounded-2xl font-black text-white text-lg uppercase tracking-widest bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:bg-black/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {exportLoading ? 'Preparing file…' : 'Download PowerPoint'}
              </button>
              <div className="flex-[1.2] flex flex-col sm:flex-row gap-3 w-full">
                <input
                  type="text"
                  value={refineText}
                  onChange={(e) => setRefineText(e.target.value)}
                  placeholder="Want changes? Type them here…"
                  className="flex-1 rounded-2xl border border-white/20 bg-black/20 px-4 py-4 font-medium text-white placeholder:text-gray-200/50 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/10 backdrop-blur-xl"
                  disabled={loading}
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleRefine}
                  className="px-8 py-4 rounded-2xl font-black uppercase tracking-wider text-white bg-black/30 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:bg-black/40 disabled:opacity-50 whitespace-nowrap"
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
                icon: '🧠',
                title: 'Generative UI Engine',
                desc: 'AI writes raw HTML + Tailwind CSS from scratch for every slide. No static templates — infinite layout variance.'
              },
              {
                icon: '🖼️',
                title: 'Base64 Image Pipeline',
                desc: 'Images fetched server-side and injected as Base64 data URIs. CORS tainting permanently eliminated.'
              },
              {
                icon: '📥',
                title: 'Flawless Export',
                desc: 'html2canvas captures AI-generated DOM with embedded images. Pixel-perfect PowerPoint every time.'
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
