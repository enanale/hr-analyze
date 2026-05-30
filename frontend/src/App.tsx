import { useState, useRef } from 'react';
import { Heart, Upload, AlertTriangle, Sparkles, TrendingUp, Check, Info, FileSpreadsheet, ShieldAlert, RefreshCw } from 'lucide-react';
import { OnboardingWizard } from './components/OnboardingWizard';
import { EcgCanvas } from './components/EcgCanvas';
import { MacroTimeline } from './components/MacroTimeline';
import './App.css';

interface GarminRecord {
  timestamp: number;
  heart_rate: number;
  speed: number;
  altitude: number;
  distance: number;
  lat: number;
  lon: number;
}

interface Anomaly {
  timestamp: number;
  index: number;
  type: string;
  description: string;
  qrs_width_ms: number;
  rr_interval_ms: number;
  local_avg_rr_ms: number;
}

interface HrvMetrics {
  rmssd_ms: number;
  sdnn_ms: number;
  mean_hr_bpm: number;
  min_hr_bpm: number;
  max_hr_bpm: number;
}

function App() {
  // App States
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // Parsed Session States
  const [ecgTimestamps, setEcgTimestamps] = useState<number[]>([]);
  const [ecgValues, setEcgValues] = useState<number[]>([]);
  const [samplingRate, setSamplingRate] = useState<number>(130.0);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [totalSamples, setTotalSamples] = useState<number>(0);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [hrvMetrics, setHrvMetrics] = useState<HrvMetrics | null>(null);
  const [garminActivity, setGarminActivity] = useState<GarminRecord[] | null>(null);
  const [ecgHeartRate, setEcgHeartRate] = useState<{ timestamp: number; heart_rate: number; }[]>([]);
  const [focusedTimestamp, setFocusedTimestamp] = useState<number>(0);
  const [hasGarmin, setHasGarmin] = useState<boolean>(false);
  const [syncOffsetMs, setSyncOffsetMs] = useState<number>(0.0);

  // File Upload states
  const [ecgFile, setEcgFile] = useState<File | null>(null);
  const [garminFile, setGarminFile] = useState<File | null>(null);
  
  // Drag and drop states
  const [isDragOverEcg, setIsDragOverEcg] = useState<boolean>(false);
  const [isDragOverGarmin, setIsDragOverGarmin] = useState<boolean>(false);

  const ecgInputRef = useRef<HTMLInputElement | null>(null);
  const garminInputRef = useRef<HTMLInputElement | null>(null);

  // API Local Host URL (FastAPI)
  const API_BASE = "http://localhost:8000";

  // Trigger File Upload to API
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ecgFile) {
      setError("Please select at least the Polar H10 ECG CSV file.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.append("ecg_file", ecgFile);
    if (garminFile) {
      formData.append("garmin_file", garminFile);
    }

    try {
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errDetail = await response.json();
        throw new Error(errDetail.detail || "Failed to process files.");
      }

      const data = await response.json();
      loadSessionData(data);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "An error occurred while uploading.");
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger Demo Mode Loading
  const handleLoadDemo = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`${API_BASE}/api/demo`);
      if (!response.ok) {
        throw new Error("Failed to load demo session from server.");
      }

      const data = await response.json();
      loadSessionData(data);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Could not launch demo.");
    } finally {
      setIsLoading(false);
    }
  };

  // Populate States with API Response
  const loadSessionData = (data: any) => {
    setSamplingRate(data.sampling_rate);
    setDurationSec(data.duration_sec);
    setTotalSamples(data.total_samples);
    setHrvMetrics(data.hrv_metrics);
    setAnomalies(data.anomalies);
    setGarminActivity(data.garmin_activity);
    setEcgHeartRate(data.ecg_heart_rate || []);
    setHasGarmin(data.has_garmin);
    setSyncOffsetMs(data.sync_offset_ms);
    
    // Set active high-res plot points
    const ts = data.raw_ecg_full.timestamps;
    const vals = data.raw_ecg_full.values;
    setEcgTimestamps(ts);
    setEcgValues(vals);

    // Initial focus on middle of the run
    if (ts.length > 0) {
      const middleIdx = Math.floor(ts.length / 2);
      setFocusedTimestamp(ts[middleIdx]);
    }
  };

  // Drop Handlers
  const handleDropEcg = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverEcg(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setEcgFile(e.dataTransfer.files[0]);
    }
  };

  const handleDropGarmin = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverGarmin(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setGarminFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-[#080a0c] text-gray-100 flex flex-col font-sans">
      {/* 1. Header Area */}
      <header className="border-b border-white/5 py-4 px-6 md:px-12 flex justify-between items-center bg-[#0c0e14]/75 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00f2fe] to-[#4facfe] flex items-center justify-center shadow-[0_0_15px_rgba(0,242,254,0.3)] animate-pulse">
            <Heart size={20} className="text-[#080a0c]" fill="#080a0c" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold font-display tracking-tight text-white m-0 flex items-center gap-1.5">
              HR-Analyze <span className="text-[10px] font-mono font-medium px-2 py-0.5 bg-cyan-500/10 border border-cyan-400/20 text-cyan-300 rounded-full">Rehab Beta</span>
            </h1>
            <p className="text-[10px] text-secondary m-0">
              Cardiac Rehabilitation Telemetry & Waveform Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-secondary font-mono bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          Local Core Connected
        </div>
      </header>

      {/* Main Workspace Frame */}
      <main className="flex-1 py-8 px-6 md:px-12 max-w-7xl mx-auto w-full">
        {/* Onboarding Stepper Walkthrough */}
        <OnboardingWizard onLoadDemo={handleLoadDemo} isLoading={isLoading} />

        {/* 2. File Upload Form Section */}
        <div className="glass-card p-6 mb-8">
          <h3 className="text-lg font-bold font-display text-white flex items-center gap-2 mb-2">
            <Upload size={18} className="text-[#00f2fe]" />
            Upload Activity Session Records
          </h3>
          <p className="text-xs text-secondary mb-5">
            Load your Polar H10 ECG logs and optional Garmin watch FIT tracks to sync running metrics and cardiac telemetry.
          </p>

          <form onSubmit={handleUploadSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Polar File Box */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOverEcg(true); }}
                onDragLeave={() => setIsDragOverEcg(false)}
                onDrop={handleDropEcg}
                onClick={() => ecgInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ${
                  isDragOverEcg 
                    ? 'border-cyan-400 bg-cyan-400/[0.02]' 
                    : ecgFile 
                      ? 'border-emerald-500/40 bg-emerald-500/[0.01]' 
                      : 'border-white/10 hover:border-white/20 bg-white/[0.01]'
                }`}
              >
                <input
                  type="file"
                  ref={ecgInputRef}
                  onChange={(e) => e.target.files && setEcgFile(e.target.files[0])}
                  accept=".csv"
                  className="hidden"
                />
                <FileSpreadsheet size={32} className={ecgFile ? 'text-emerald-400' : 'text-secondary'} />
                <span className="text-sm font-semibold text-white mt-3">
                  {ecgFile ? ecgFile.name : "Polar ECG Log (.csv)"}
                </span>
                <span className="text-xs text-secondary mt-1 max-w-[200px]">
                  {ecgFile ? `${(ecgFile.size / 1024 / 1024).toFixed(2)} MB` : "Drag and drop raw 130Hz ECG CSV from ECGLogger here"}
                </span>
                {ecgFile && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full mt-3 animate-fadeIn">
                    <Check size={10} /> Selected
                  </span>
                )}
              </div>

              {/* Garmin File Box */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOverGarmin(true); }}
                onDragLeave={() => setIsDragOverGarmin(false)}
                onDrop={handleDropGarmin}
                onClick={() => garminInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ${
                  isDragOverGarmin 
                    ? 'border-cyan-400 bg-cyan-400/[0.02]' 
                    : garminFile 
                      ? 'border-emerald-500/40 bg-emerald-500/[0.01]' 
                      : 'border-white/10 hover:border-white/20 bg-white/[0.01]'
                }`}
              >
                <input
                  type="file"
                  ref={garminInputRef}
                  onChange={(e) => e.target.files && setGarminFile(e.target.files[0])}
                  accept=".fit"
                  className="hidden"
                />
                <TrendingUp size={32} className={garminFile ? 'text-emerald-400' : 'text-secondary'} />
                <span className="text-sm font-semibold text-white mt-3">
                  {garminFile ? garminFile.name : "Garmin Activity File (.fit)"}
                </span>
                <span className="text-xs text-secondary mt-1 max-w-[200px]">
                  {garminFile ? `${(garminFile.size / 1024).toFixed(1)} KB` : "Drag and drop watch binary FIT activity file (Optional)"}
                </span>
                {garminFile && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full mt-3 animate-fadeIn">
                    <Check size={10} /> Selected
                  </span>
                )}
              </div>
            </div>

            {/* Error Indicators */}
            {error && (
              <div className="flex gap-2 items-center p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-xs font-semibold">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Bar */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isLoading || !ecgFile}
                className="px-6 py-2.5 bg-gradient-to-r from-[#00f2fe] to-[#4facfe] text-[#080a0c] font-bold rounded-lg hover:opacity-95 disabled:opacity-40 transition-all text-sm flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Analyzing Signal...
                  </>
                ) : (
                  "Execute Rehab Telemetry Analysis"
                )}
              </button>
            </div>
          </form>
        </div>

        {/* 3. CORE ANALYTICS DASHBOARD (Visible only upon successful parsing/demo loading) */}
        {success && (
          <div className="space-y-8 animate-fadeIn">
            {/* Stat Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-card p-4">
                <span className="text-[10px] font-bold text-secondary font-mono tracking-wider block mb-1">
                  MEAN HEART RATE
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold font-display text-white">
                    {hrvMetrics ? Math.round(hrvMetrics.mean_hr_bpm) : "--"}
                  </span>
                  <span className="text-xs text-secondary font-semibold">BPM</span>
                </div>
                <div className="text-[9px] text-secondary mt-1 border-t border-white/5 pt-1.5 flex justify-between">
                  <span>Min: {hrvMetrics ? Math.round(hrvMetrics.min_hr_bpm) : "--"}</span>
                  <span>Max: {hrvMetrics ? Math.round(hrvMetrics.max_hr_bpm) : "--"}</span>
                </div>
              </div>

              <div className="glass-card p-4">
                <span className="text-[10px] font-bold text-secondary font-mono tracking-wider block mb-1">
                  RMSSD (HRV)
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold font-display text-gradient">
                    {hrvMetrics ? hrvMetrics.rmssd_ms.toFixed(1) : "--"}
                  </span>
                  <span className="text-xs text-secondary font-semibold">ms</span>
                </div>
                <div className="text-[9px] text-secondary mt-1 border-t border-white/5 pt-1.5 flex items-center gap-1.5">
                  <Sparkles size={10} className="text-cyan-400" />
                  Gold recovery index metric
                </div>
              </div>

              <div className="glass-card p-4">
                <span className="text-[10px] font-bold text-secondary font-mono tracking-wider block mb-1">
                  SDNN (TOTAL HRV)
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold font-display text-gradient">
                    {hrvMetrics ? hrvMetrics.sdnn_ms.toFixed(1) : "--"}
                  </span>
                  <span className="text-xs text-secondary font-semibold">ms</span>
                </div>
                <div className="text-[9px] text-secondary mt-1 border-t border-white/5 pt-1.5 flex items-center gap-1">
                  <Info size={10} className="text-secondary" />
                  Overall autonomic health indicator
                </div>
              </div>

              <div className="glass-card p-4 border border-red-500/10">
                <span className="text-[10px] font-bold text-[#ff5e62] font-mono tracking-wider block mb-1">
                  FLAGGED ANOMALIES
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold font-display text-gradient-coral">
                    {anomalies.length}
                  </span>
                  <span className="text-xs text-[#ff5e62] font-semibold">Irregularities</span>
                </div>
                <div className="text-[9px] text-secondary mt-1 border-t border-white/5 pt-1.5 flex items-center gap-1.5">
                  <ShieldAlert size={10} className="text-[#ff5e62]" />
                  PVCs / PACs / extended pauses
                </div>
              </div>
            </div>

            {/* Session Metadata Bar */}
            <div className="flex flex-wrap gap-4 justify-between items-center bg-white/[0.02] border border-white/5 px-4 py-2.5 rounded-xl text-xs text-secondary font-mono">
              <span className="flex items-center gap-1.5"><Info size={13} className="text-cyan-400" /> Sampling Rate: <span className="text-white font-bold">{samplingRate} Hz</span></span>
              <span>Duration: <span className="text-white font-bold">{Math.round(durationSec)} seconds</span></span>
              <span>Total Telemetry Samples: <span className="text-white font-bold">{totalSamples.toLocaleString()} points</span></span>
            </div>

            {/* Sync metrics strip if Garmin sync occurred */}
            {hasGarmin && syncOffsetMs !== 0 && (
              <div className="flex justify-between items-center px-4 py-2 border border-emerald-500/15 bg-emerald-500/5 text-emerald-400 text-xs font-semibold rounded-lg">
                <span>✓ Successfully synchronized smartwatch and chest strap timelines via cross-correlation.</span>
                <span className="font-mono text-[10px]">Applied alignment lag: {syncOffsetMs > 0 ? "+" : ""}{(syncOffsetMs / 1000).toFixed(2)}s</span>
              </div>
            )}

            {/* A. Macro Timeline View */}
            <MacroTimeline
              ecgTimestamps={ecgTimestamps}
              heartRateData={
                hasGarmin && garminActivity 
                  ? garminActivity.map(r => ({ timestamp: r.timestamp, heart_rate: r.heart_rate })) 
                  : ecgHeartRate
              }
              speedData={
                hasGarmin && garminActivity 
                  ? garminActivity.map(r => ({ timestamp: r.timestamp, speed: r.speed })) 
                  : null
              }
              anomalies={anomalies}
              focusedTimestamp={focusedTimestamp}
              onFocusChange={setFocusedTimestamp}
            />

            {/* B. Micro Waveform View */}
            <EcgCanvas
              timestamps={ecgTimestamps}
              values={ecgValues}
              anomalies={anomalies}
              focusedTimestamp={focusedTimestamp}
              onScrub={setFocusedTimestamp}
            />

            {/* C. Arrhythmia & Irregularity Logs */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-bold font-display text-white flex items-center gap-2 mb-2">
                <ShieldAlert size={18} className="text-[#ff5e62]" />
                Irregularity Telemetry Log
              </h3>
              <p className="text-xs text-secondary mb-4">
                Automated DSP morphology detections. Click any anomaly row to snap the ECG micro-view immediately to that peak.
              </p>

              {anomalies.length === 0 ? (
                <div className="text-center py-6 text-xs text-secondary bg-[#0e1116] border border-white/5 rounded-xl font-mono">
                  No arrhythmias or irregularities detected in this telemetry frame. Excellent!
                </div>
              ) : (
                <div className="border border-white/5 rounded-xl overflow-hidden bg-[#0e1116] divide-y divide-white/5 max-h-60 overflow-y-auto">
                  {anomalies.map((a, i) => {
                    const relativeSec = (a.timestamp - ecgTimestamps[0]) / 1000.0;
                    return (
                      <div
                        key={i}
                        onClick={() => setFocusedTimestamp(a.timestamp)}
                        className="flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-white/[0.02] active:bg-white/[0.04] transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full shadow-[0_0_8px_#ff5e62] bg-[#ff5e62]`} />
                          <div>
                            <span className="text-sm font-semibold text-white font-display">
                              {a.type}
                            </span>
                            <span className="text-xs text-secondary block mt-0.5 font-sans leading-relaxed">
                              {a.description}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-cyan-400 font-bold font-mono">
                            {relativeSec.toFixed(2)}s
                          </span>
                          <span className="text-[10px] text-secondary block font-mono mt-0.5">
                            QRS: {Math.round(a.qrs_width_ms)}ms | RR: {Math.round(a.rr_interval_ms)}ms
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer copyright */}
      <footer className="border-t border-white/5 py-6 px-6 text-center text-xs text-secondary bg-[#07090c]">
        HR-Analyze Cardiac Telemetry Rehab Tool. Built for Ed Nanale. local-first execution.
      </footer>
    </div>
  );
}

export default App;
