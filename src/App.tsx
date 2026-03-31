import React, { useState, useEffect, useRef } from 'react';
import { Shield, AlertTriangle, CheckCircle, Search, Globe, Mail, Info, ChevronRight, Loader2, Camera, X, History, Home, Zap, Activity, Lock, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeContent, extractUrlFeatures, AnalysisResult } from './services/analysis';
import { generateLogo } from './services/logo';

export default function App() {
  const [input, setInput] = useState('');
  const [activeMode, setActiveMode] = useState<'phishing' | 'logo'>('phishing');
  const [showIntro, setShowIntro] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlHeuristics, setUrlHeuristics] = useState<any>(null);
  const [history, setHistory] = useState<{ id: string; input: string; result: AnalysisResult; heuristics: any; timestamp: number }[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [reportStatus, setReportStatus] = useState<'idle' | 'reporting' | 'success'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchLogo = async () => {
      const url = await generateLogo();
      setLogoUrl(url);
    };
    fetchLogo();

    // Load history from localStorage
    const savedHistory = localStorage.getItem('phishguard_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('phishguard_history', JSON.stringify(history));
  }, [history]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!input.trim() && !selectedImage) return;
    setIsAnalyzing(true);
    setResult(null);
    setError(null);
    setUrlHeuristics(null);
    setReportStatus('idle');

    try {
      // Check if input looks like a URL
      const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
      const isUrl = urlPattern.test(input) && activeMode === 'phishing';

      let finalResult: AnalysisResult;
      let safeBrowsingResult = null;
      
      if (isUrl) {
        // Parallel check: Safe Browsing API + AI Analysis
        const [heuristics, sbResponse] = await Promise.all([
          extractUrlFeatures(input),
          fetch('/api/check-safe-browsing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: input })
          }).then(res => res.json()).catch(() => ({ isFlagged: false }))
        ]);

        setUrlHeuristics(heuristics);
        safeBrowsingResult = sbResponse;

        // AI Analysis
        finalResult = await analyzeContent(`Analyze this URL for phishing: ${input}`, selectedImage || undefined);
        
        // Blend heuristic score if it's a URL
        if (heuristics) {
          let blendedScore = Math.round((finalResult.score + heuristics.heuristicScore) / 2);
          
          // If Safe Browsing flags it, it's a major risk
          if (safeBrowsingResult?.isFlagged) {
            blendedScore = Math.max(blendedScore, 95);
            finalResult.reasoning.unshift("CRITICAL: URL is explicitly flagged by Google Safe Browsing as malicious.");
          }

          finalResult.score = blendedScore;
          if (finalResult.score > 70) finalResult.verdict = "Malicious";
          else if (finalResult.score > 40) finalResult.verdict = "Suspicious";
          else finalResult.verdict = "Safe";
        }
      } else {
        const prompt = activeMode === 'logo' 
          ? "Analyze this image for brand logo authenticity. Is it a spoofed or legitimate logo? Look for subtle inconsistencies."
          : input;
        finalResult = await analyzeContent(prompt, selectedImage || undefined);
      }

      setResult(finalResult);
      
      // Add to history
      const historyItem = {
        id: Date.now().toString(),
        input: input.trim() || 'Image Analysis',
        result: finalResult,
        heuristics: urlHeuristics,
        timestamp: Date.now()
      };
      setHistory(prev => [historyItem, ...prev].slice(0, 10)); // Keep last 10
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED')) {
        setError("API Quota Exceeded. Please try again in a few minutes.");
      } else {
        setError("Analysis failed. Please check your connection and try again.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReportMiss = async () => {
    if (!result) return;
    setReportStatus('reporting');
    try {
      const response = await fetch('/api/report-miss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          result,
          feedbackType: result.verdict === 'Safe' ? 'False Negative' : 'False Positive'
        })
      });
      if (response.ok) {
        setReportStatus('success');
        setTimeout(() => setReportStatus('idle'), 3000);
      }
    } catch (error) {
      console.error("Failed to report miss", error);
      setReportStatus('idle');
    }
  };

  const loadFromHistory = (item: any) => {
    setInput(item.input === 'Image Analysis' ? '' : item.input);
    setResult(item.result);
    setUrlHeuristics(item.heuristics);
    setReportStatus('idle');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('phishguard_history');
  };

  const scrollToHistory = () => {
    historyRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const goToIntro = () => {
    setShowIntro(true);
    window.scrollTo({ top: 0 });
  };

  const LogoPlaceholder = ({ size = 'large' }: { size?: 'small' | 'large' }) => {
    const isLarge = size === 'large';
    return (
      <div className={`${isLarge ? 'w-24 h-24 border-2' : 'w-16 h-16 border'} border-sky-200 flex flex-col items-center justify-center bg-white rounded-xl shadow-[${isLarge ? '8px_8px' : '4px_4px'}_0px_0px_rgba(14,165,233,0.1)] relative overflow-hidden group`}>
        <div className="absolute inset-0 bg-sky-50/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        <motion.div 
          animate={{ top: ['-10%', '110%'] }} 
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute left-0 w-full h-[2px] bg-sky-400/20 z-20 shadow-[0_0_8px_rgba(14,165,233,0.5)]" 
        />
        <Shield className={`${isLarge ? 'w-10 h-10' : 'w-7 h-7'} text-sky-500 mb-1 relative z-10`} />
        {isLarge && (
          <span className="text-[8px] font-mono font-bold text-sky-400 uppercase tracking-tighter relative z-10">
            Shield Active
          </span>
        )}
      </div>
    );
  };

  if (showIntro) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background Grid Effect */}
        <div className="absolute inset-0 opacity-[0.1] pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(var(--accent) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl w-full space-y-12 relative z-10"
        >
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt="PhishGuard Logo" 
                  className="w-24 h-24 border border-sky-200 shadow-[8px_8px_0px_0px_rgba(14,165,233,0.1)] rounded-xl object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <LogoPlaceholder size="large" />
              )}
              <div className="absolute -top-2 -right-2 px-2 py-1 bg-sky-500 text-white text-[10px] font-mono font-bold uppercase tracking-tighter">
                v2.4.0
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-6xl md:text-8xl font-bold tracking-tighter uppercase italic font-serif leading-none text-sky-900">
                PhishGuard <span className="text-sky-500/20">AI</span>
              </h1>
              <p className="text-sm md:text-base font-mono text-sky-600/60 uppercase tracking-[0.2em]">
                Advanced Threat Intelligence & Scam Detection
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: <Activity className="w-5 h-5" />, title: "Real-time Analysis", desc: "Instant heuristic scanning and AI-driven threat assessment." },
              { icon: <Target className="w-5 h-5" />, title: "Logo Verification", desc: "Deep visual audit for spoofed brand assets and fraudulent UI." },
              { icon: <Lock className="w-5 h-5" />, title: "Safe Browsing", desc: "Direct integration with Google's global malicious URL database." }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * (i + 1) }}
                className="p-6 border border-sky-100 bg-white hover:bg-sky-50 transition-colors group shadow-sm"
              >
                <div className="mb-4 text-sky-400 group-hover:text-sky-600 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-xs font-mono uppercase font-bold mb-2 tracking-wider text-sky-900">{feature.title}</h3>
                <p className="text-[11px] font-mono text-sky-600/60 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="flex flex-col items-center space-y-8">
            <div className="flex flex-col md:flex-row gap-4 w-full max-w-2xl">
              <button
                onClick={() => {
                  setActiveMode('phishing');
                  setShowIntro(false);
                }}
                className="flex-1 group relative px-8 py-6 bg-sky-500 text-white font-bold uppercase tracking-[0.2em] hover:bg-sky-600 transition-all overflow-hidden shadow-lg flex flex-col items-center gap-3"
              >
                <Zap className="w-6 h-6 fill-white" />
                <span className="relative z-10">Phishing Detector</span>
                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform" />
              </button>

              <button
                onClick={() => {
                  setActiveMode('logo');
                  setShowIntro(false);
                }}
                className="flex-1 group relative px-8 py-6 bg-white text-sky-500 border-2 border-sky-500 font-bold uppercase tracking-[0.2em] hover:bg-sky-50 transition-all overflow-hidden shadow-lg flex flex-col items-center gap-3"
              >
                <Camera className="w-6 h-6" />
                <span className="relative z-10">Logo Detector</span>
                <div className="absolute inset-0 bg-sky-500/5 translate-y-full group-hover:translate-y-0 transition-transform" />
              </button>
            </div>
            
            <div className="flex items-center gap-8 text-[10px] font-mono text-sky-900/30 uppercase tracking-widest">
              <span>Secure Connection: Established</span>
              <span className="w-1 h-1 bg-sky-200 rounded-full" />
              <span>Encryption: AES-256</span>
              <span className="w-1 h-1 bg-sky-200 rounded-full" />
              <span>Uptime: 99.9%</span>
            </div>
          </div>
        </motion.div>

        {/* Decorative Lines */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-32 bg-gradient-to-b from-sky-200 to-transparent" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1px] h-32 bg-gradient-to-t from-sky-200 to-transparent" />
      </div>
    );
  }

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'Safe': return 'text-green-600';
      case 'Suspicious': return 'text-yellow-600';
      case 'Malicious': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case 'Safe': return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'Suspicious': return <AlertTriangle className="w-6 h-6 text-yellow-600" />;
      case 'Malicious': return <Shield className="w-6 h-6 text-red-600" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto bg-[var(--bg)] text-[var(--ink)]">
      {/* Header */}
      <header className="mb-12 border-b border-sky-100 pb-6 flex justify-between items-end">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt="PhishGuard Logo" 
              className="w-16 h-16 border border-sky-100 shadow-[2px_2px_0px_0px_rgba(14,165,233,0.1)] rounded-lg object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <LogoPlaceholder size="small" />
          )}
          <div>
            <h1 className="text-4xl font-bold tracking-tighter uppercase italic font-serif text-sky-900">PhishGuard AI</h1>
            <p className="text-xs font-mono text-sky-600/50 uppercase mt-1">Advanced Threat Intelligence & Scam Detection</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 mr-6">
            <button
              onClick={goToIntro}
              className="flex items-center gap-2 px-3 py-1.5 border border-sky-100 text-[10px] font-mono uppercase transition-all hover:bg-sky-50 opacity-100 cursor-pointer text-sky-900"
            >
              <Home className="w-3 h-3" />
              Home
            </button>
            <button
              onClick={scrollToHistory}
              disabled={history.length === 0}
              className={`flex items-center gap-2 px-3 py-1.5 border border-sky-100 text-[10px] font-mono uppercase transition-all ${
                history.length > 0 ? 'hover:bg-sky-50 opacity-100 cursor-pointer text-sky-900' : 'opacity-20 cursor-not-allowed'
              }`}
            >
              <History className="w-3 h-3" />
              History ({history.length})
            </button>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-[10px] font-mono text-sky-600/50 uppercase">System Status: Operational</p>
            <p className="text-[10px] font-mono text-sky-600/50 uppercase">Database: v2.4.0-Stable</p>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Input Section */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-sky-100 p-4 shadow-[4px_4px_0px_0px_rgba(14,165,233,0.1)]">
            <div className="flex items-center justify-between mb-6 border-b border-sky-100 pb-4">
              <div className="flex items-center gap-2">
                {activeMode === 'phishing' ? <Zap className="w-5 h-5 text-sky-500" /> : <Camera className="w-5 h-5 text-sky-500" />}
                <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-sky-900">
                  {activeMode === 'phishing' ? 'Phishing Analysis' : 'Logo Verification'}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-sky-500" />
              <span className="col-header">
                {activeMode === 'phishing' ? 'Threat Analysis' : 'Visual Audit'}
              </span>
            </div>

            {activeMode === 'phishing' ? (
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste URL, Email content, or SMS message here..."
                className="w-full h-24 p-4 font-mono text-sm border border-sky-100 focus:outline-none focus:ring-1 focus:ring-sky-200 resize-none bg-sky-50/30 text-sky-900"
              />
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-24 border-2 border-dashed border-sky-100 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-sky-50 transition-colors bg-sky-50/30"
              >
                <Camera className="w-6 h-6 text-sky-500 opacity-30" />
                <span className="text-[10px] font-mono uppercase text-sky-900/50">Upload Brand Image / Screenshot</span>
              </div>
            )}
            
            <div className="mt-4 flex items-center gap-4">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                ref={fileInputRef}
              />
              {activeMode === 'phishing' && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 border border-sky-100 text-xs font-mono uppercase hover:bg-sky-50 transition-colors text-sky-900"
                >
                  <Camera className="w-4 h-4" />
                  Attach Evidence
                </button>
              )}
              
              {selectedImage && (
                <div className="relative group">
                  <img 
                    src={selectedImage} 
                    alt="Selected" 
                    className="w-10 h-10 object-cover border border-sky-100" 
                  />
                  <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || (activeMode === 'phishing' ? !input.trim() : !selectedImage)}
              className="w-full mt-4 bg-sky-500 text-white py-3 font-bold uppercase tracking-widest hover:bg-sky-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                'Run Diagnostics'
              )}
            </button>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 flex items-center gap-2 text-red-600 text-[10px] font-mono uppercase">
                <AlertTriangle className="w-3 h-3" />
                {error}
              </div>
            )}
          </div>

          <div className="bg-white border border-sky-100 p-6 shadow-[4px_4px_0px_0px_rgba(14,165,233,0.1)]">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-sky-500" />
              <span className="col-header">{activeMode === 'phishing' ? 'Phishing Methodology' : 'Logo Verification Methodology'}</span>
            </div>
            <ul className="space-y-3 text-xs font-mono text-sky-900/70">
              {activeMode === 'phishing' ? (
                <>
                  <li className="flex gap-2">
                    <span className="text-sky-400">01</span>
                    <span>Lexical Heuristics (URL structure analysis)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-sky-400">02</span>
                    <span>NLP Sentiment & Urgency Detection</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-sky-400">03</span>
                    <span>Social Engineering Pattern Matching</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-sky-400">04</span>
                    <span>Gemini Pro Inference Engine</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex gap-2">
                    <span className="text-sky-400">01</span>
                    <span>Visual Brand Consistency Audit</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-sky-400">02</span>
                    <span>Pixel-level Anomaly Detection</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-sky-400">03</span>
                    <span>Spoofing Pattern Recognition</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-sky-400">04</span>
                    <span>Authenticity Verification Engine</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* History Section */}
          {history.length > 0 && (
            <div ref={historyRef} className="bg-white border border-sky-100 p-6 shadow-[4px_4px_0px_0px_rgba(14,165,233,0.1)]">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-sky-500 opacity-50" />
                  <span className="col-header">Recent Assessments</span>
                </div>
                <button 
                  onClick={clearHistory}
                  className="text-[9px] font-mono uppercase text-sky-600/30 hover:text-sky-600 transition-opacity"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadFromHistory(item)}
                    className="w-full text-left p-3 border border-sky-100 hover:bg-sky-50 transition-colors group flex justify-between items-center"
                  >
                    <div className="truncate pr-4">
                      <p className="text-[10px] font-mono text-sky-600/50 uppercase mb-1">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-xs font-mono truncate text-sky-900">{item.input}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        item.result.verdict === 'Safe' ? 'bg-green-500' : 
                        item.result.verdict === 'Suspicious' ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <ChevronRight className="w-3 h-3 text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results Section */}
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {!result && !isAnalyzing ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full border border-dashed border-sky-100 flex flex-col items-center justify-center p-12 text-center opacity-30"
              >
                <Shield className="w-16 h-16 mb-4 text-sky-900" />
                <p className="font-serif italic text-sky-900">Awaiting input for threat assessment...</p>
              </motion.div>
            ) : isAnalyzing ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full border border-sky-100 bg-sky-50 p-12 flex flex-col items-center justify-center"
              >
                <Loader2 className="w-12 h-12 animate-spin mb-4 text-sky-500" />
                <p className="font-mono text-xs uppercase tracking-widest animate-pulse text-sky-900">Scanning for malicious signatures...</p>
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Verdict Card */}
                <div className="bg-white border border-sky-100 p-8 shadow-[8px_8px_0px_0px_rgba(14,165,233,0.1)]">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <span className="col-header">Assessment Verdict</span>
                      <div className="flex items-center gap-3 mt-2">
                        {getVerdictIcon(result.verdict)}
                        <h2 className={`text-4xl font-bold uppercase tracking-tighter ${getVerdictColor(result.verdict)}`}>
                          {result.verdict}
                        </h2>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="col-header">Risk Score</span>
                      <p className="text-5xl font-bold font-mono mt-1 text-sky-900">{result.score}<span className="text-sm opacity-30">/100</span></p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4 border-y border-sky-100 py-6 mb-6">
                    <div className="text-center">
                      <span className="col-header block mb-1">Urgency</span>
                      <span className={`font-mono font-bold ${result.features.urgency === 'High' ? 'text-red-500' : 'text-sky-900'}`}>
                        {result.features.urgency}
                      </span>
                    </div>
                    <div className="text-center border-x border-sky-100">
                      <span className="col-header block mb-1">SocEng</span>
                      <span className="font-mono font-bold text-sky-900">
                        {result.features.socialEngineering ? 'DETECTED' : 'NOT FOUND'}
                      </span>
                    </div>
                    <div className="text-center border-r border-sky-100">
                      <span className="col-header block mb-1 text-[9px]">Logo Spoof</span>
                      <span className={`font-mono font-bold ${result.features.logoSpoofing ? 'text-red-500' : 'text-green-500'}`}>
                        {result.features.logoSpoofing ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="col-header block mb-1">Intent</span>
                      <span className="font-mono font-bold text-[10px] uppercase text-sky-900">
                        {result.features.intent}
                      </span>
                    </div>
                  </div>

                  {result.verdict !== 'Safe' && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-100">
                      <span className="col-header text-red-500 mb-3 block">Primary Risk Factors</span>
                      <div className="flex flex-wrap gap-2">
                        {result.reasoning.some(r => r.includes('Safe Browsing')) && (
                          <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-mono border border-red-200">FLAGGED BY GOOGLE SAFE BROWSING</span>
                        )}
                        {result.features.urgency === 'High' && (
                          <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-mono border border-red-200">CRITICAL URGENCY</span>
                        )}
                        {result.features.socialEngineering && (
                          <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-mono border border-red-200">SOCIAL ENGINEERING</span>
                        )}
                        {result.features.logoSpoofing && (
                          <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-mono border border-red-200">LOGO SPOOFING DETECTED</span>
                        )}
                        {urlHeuristics?.features.isIp && (
                          <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-mono border border-red-200">MALICIOUS IP HOSTNAME</span>
                        )}
                        {urlHeuristics?.features.hasSpecialChars && (
                          <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-mono border border-red-200">SUSPICIOUS CHARACTERS</span>
                        )}
                        {urlHeuristics?.features.excessiveSubdomains && (
                          <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-mono border border-red-200">EXCESSIVE SUBDOMAINS</span>
                        )}
                        {urlHeuristics?.features.isPunycode && (
                          <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-mono border border-red-200">HOMOGRAPH ATTACK (PUNYCODE)</span>
                        )}
                        {urlHeuristics?.features.suspiciousTld && (
                          <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-mono border border-red-200">SUSPICIOUS TLD</span>
                        )}
                        {urlHeuristics?.features.hasSensitiveKeywords && (
                          <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-mono border border-red-200">SENSITIVE KEYWORDS IN URL</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="col-header block mb-3">Analysis Reasoning</span>
                    <ul className="space-y-2">
                      {result.reasoning.map((reason, i) => (
                        <li key={i} className={`flex gap-3 text-sm ${result.verdict === 'Malicious' ? 'text-red-600/80' : 'text-sky-900'}`}>
                          <ChevronRight className={`w-4 h-4 mt-0.5 flex-shrink-0 ${result.verdict === 'Malicious' ? 'text-red-500' : 'text-sky-500'}`} />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex justify-between items-center mt-8 pt-6 border-t border-sky-100">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-sky-600/50 uppercase">
                      <Info className="w-3 h-3" />
                      <span>Not accurate? Help us improve.</span>
                    </div>
                    <button
                      onClick={handleReportMiss}
                      disabled={reportStatus !== 'idle'}
                      className={`px-4 py-2 border border-sky-100 text-[10px] font-mono uppercase transition-all flex items-center gap-2 ${
                        reportStatus === 'success' ? 'bg-green-50 text-green-600 border-green-200' : 'hover:bg-sky-50 text-sky-900'
                      }`}
                    >
                      {reportStatus === 'reporting' ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Reporting...
                        </>
                      ) : reportStatus === 'success' ? (
                        <>
                          <CheckCircle className="w-3 h-3" />
                          Reported
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3" />
                          Report Miss
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Heuristics Table (Only for URLs) */}
                {urlHeuristics && (
                  <div className="bg-white border border-sky-100 overflow-hidden shadow-[4px_4px_0px_0px_rgba(14,165,233,0.1)]">
                    <div className="p-4 border-b border-sky-100 bg-sky-50 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-sky-500" />
                      <span className="col-header">Lexical Heuristics</span>
                    </div>
                    <div className="data-row bg-sky-50">
                      <div className="col-header">#</div>
                      <div className="col-header">Feature</div>
                      <div className="col-header">Value</div>
                      <div className="col-header">Risk</div>
                    </div>
                    <div className="data-row">
                      <div className="data-value opacity-30 text-sky-900">01</div>
                      <div className="text-sm text-sky-900">Google Safe Browsing</div>
                      <div className="data-value text-sky-900">{result.reasoning.some(r => r.includes('Safe Browsing')) ? 'FLAGGED' : 'CLEAN'}</div>
                      <div className={`data-value ${result.reasoning.some(r => r.includes('Safe Browsing')) ? 'text-red-500' : 'text-green-500'}`}>
                        {result.reasoning.some(r => r.includes('Safe Browsing')) ? 'CRITICAL' : 'SAFE'}
                      </div>
                    </div>
                    <div className="data-row">
                      <div className="data-value opacity-30 text-sky-900">02</div>
                      <div className="text-sm text-sky-900">URL Length</div>
                      <div className="data-value text-sky-900">{urlHeuristics.features.length}</div>
                      <div className={`data-value ${urlHeuristics.features.length > 75 ? 'text-red-500' : 'text-green-500'}`}>
                        {urlHeuristics.features.length > 75 ? 'HIGH' : 'LOW'}
                      </div>
                    </div>
                    <div className="data-row">
                      <div className="data-value opacity-30 text-sky-900">03</div>
                      <div className="text-sm text-sky-900">Subdomains</div>
                      <div className="data-value text-sky-900">{urlHeuristics.features.subdomains}</div>
                      <div className={`data-value ${urlHeuristics.features.excessiveSubdomains ? 'text-red-500' : urlHeuristics.features.subdomains > 2 ? 'text-yellow-500' : 'text-green-500'}`}>
                        {urlHeuristics.features.excessiveSubdomains ? 'EXCESSIVE' : urlHeuristics.features.subdomains > 2 ? 'HIGH' : 'LOW'}
                      </div>
                    </div>
                    <div className="data-row">
                      <div className="data-value opacity-30 text-sky-900">04</div>
                      <div className="text-sm text-sky-900">IP Address Host</div>
                      <div className="data-value text-sky-900">{urlHeuristics.features.isIp ? 'YES' : 'NO'}</div>
                      <div className={`data-value ${urlHeuristics.features.isIp ? 'text-red-500' : 'text-green-500'}`}>
                        {urlHeuristics.features.isIp ? 'CRITICAL' : 'SAFE'}
                      </div>
                    </div>
                    <div className="data-row">
                      <div className="data-value opacity-30 text-sky-900">05</div>
                      <div className="text-sm text-sky-900">Special Characters</div>
                      <div className="data-value text-sky-900">{urlHeuristics.features.hasSpecialChars ? 'YES' : 'NO'}</div>
                      <div className={`data-value ${urlHeuristics.features.hasSpecialChars ? 'text-red-500' : 'text-green-500'}`}>
                        {urlHeuristics.features.hasSpecialChars ? 'MALICIOUS' : 'SAFE'}
                      </div>
                    </div>
                    <div className="data-row">
                      <div className="data-value opacity-30 text-sky-900">06</div>
                      <div className="text-sm text-sky-900">Punycode (Homograph)</div>
                      <div className="data-value text-sky-900">{urlHeuristics.features.isPunycode ? 'YES' : 'NO'}</div>
                      <div className={`data-value ${urlHeuristics.features.isPunycode ? 'text-red-500' : 'text-green-500'}`}>
                        {urlHeuristics.features.isPunycode ? 'CRITICAL' : 'SAFE'}
                      </div>
                    </div>
                    <div className="data-row">
                      <div className="data-value opacity-30 text-sky-900">07</div>
                      <div className="text-sm text-sky-900">Suspicious TLD</div>
                      <div className="data-value text-sky-900">{urlHeuristics.features.suspiciousTld ? 'YES' : 'NO'}</div>
                      <div className={`data-value ${urlHeuristics.features.suspiciousTld ? 'text-yellow-500' : 'text-green-500'}`}>
                        {urlHeuristics.features.suspiciousTld ? 'SUSP' : 'SAFE'}
                      </div>
                    </div>
                    <div className="data-row">
                      <div className="data-value opacity-30 text-sky-900">08</div>
                      <div className="text-sm text-sky-900">Sensitive Keywords</div>
                      <div className="data-value text-sky-900">{urlHeuristics.features.hasSensitiveKeywords ? 'YES' : 'NO'}</div>
                      <div className={`data-value ${urlHeuristics.features.hasSensitiveKeywords ? 'text-yellow-500' : 'text-green-500'}`}>
                        {urlHeuristics.features.hasSensitiveKeywords ? 'SUSP' : 'SAFE'}
                      </div>
                    </div>
                    <div className="data-row">
                      <div className="data-value opacity-30 text-sky-900">09</div>
                      <div className="text-sm text-sky-900">Shortened URL</div>
                      <div className="data-value text-sky-900">{urlHeuristics.features.isShortened ? 'YES' : 'NO'}</div>
                      <div className={`data-value ${urlHeuristics.features.isShortened ? 'text-yellow-500' : 'text-green-500'}`}>
                        {urlHeuristics.features.isShortened ? 'SUSP' : 'SAFE'}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 pt-8 border-t border-sky-100 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-mono opacity-50 uppercase text-sky-900">
        <div className="flex gap-6">
          <span>© 2026 PhishGuard Intelligence</span>
          <span>Privacy Protocol</span>
          <span>Terms of Engagement</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span>Real-time scanning active</span>
        </div>
      </footer>

    </div>
  );
}
