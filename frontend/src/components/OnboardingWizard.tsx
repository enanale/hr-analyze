import React, { useState, useEffect } from 'react';
import { Bluetooth, Heart, Activity, CheckCircle, ChevronDown, ChevronUp, Download, Play } from 'lucide-react';

interface OnboardingWizardProps {
  onLoadDemo: () => void;
  isLoading: boolean;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onLoadDemo, isLoading }) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false, false]);
  const [expandedTips, setExpandedTips] = useState<boolean[]>([false, false, false, false]);

  // Load completion state from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('hr_analyze_onboarding_completed');
    if (saved) {
      try {
        setCompletedSteps(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const toggleStepCompleted = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = [...completedSteps];
    updated[index] = !updated[index];
    setCompletedSteps(updated);
    localStorage.setItem('hr_analyze_onboarding_completed', JSON.stringify(updated));
  };

  const toggleTip = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = [...expandedTips];
    updated[index] = !updated[index];
    setExpandedTips(updated);
  };

  const steps = [
    {
      id: 1,
      title: "Pair Polar H10 to Garmin Watch",
      icon: Bluetooth,
      description: "Ensure your Garmin Forerunner 245 records heart rates from the highly accurate H10 chest strap rather than the optical wrist sensor.",
      instructions: [
        "Moisten the plastic electrode area of the Polar H10 strap and wear it firmly around your chest.",
        "On your Garmin watch, hold the Up/Menu button to open the settings.",
        "Navigate to Sensors & Accessories > Add New > Search All.",
        "Select your Polar H10 strap once detected, and confirm the pairing."
      ],
      tip: "ANT+ connection is generally preferred over Bluetooth on Garmin devices for lower power consumption and multiple simultaneous connections."
    },
    {
      id: 2,
      title: "Enable HRV Logging on Garmin [Optional]",
      icon: Heart,
      description: "Log millisecond-accurate beat-to-beat (RR) intervals inside the Garmin binary .fit file.",
      instructions: [
        "On your Garmin watch, go to Settings.",
        "Navigate to System > Data Recording.",
        "Locate Log HRV and toggle it to ON.",
        "This ensures RR data is saved in your FIT activity logs. If you do not see this setting, proceed without it (Garmin sync is optional)."
      ],
      tip: "If the setting is hidden, some older Garmin firmware versions let you enable it by dropping an 'enable_hrv.fit' file in the watch's GARMIN/NEWFILES directory when connected to a computer."
    },
    {
      id: 3,
      title: "Install & Setup ECGLogger on Phone",
      icon: Activity,
      description: "Download the mobile logger to record high-fidelity 130Hz raw ECG streams from the Polar H10.",
      instructions: [
        "Download ECGLogger from the iOS App Store or Google Play Store.",
        "Open the app, ensure phone Bluetooth is ON, and select the Polar H10 from the device list.",
        "Make sure the sampling rate is set to 130Hz (default for Polar H10 raw voltage streams).",
        "Keep the app running in the background during your activity to record raw ECG waveforms."
      ],
      tip: "ECGLogger operates local-only and does not share your health data. Make sure your phone's battery optimization is disabled for the app to prevent background recording dropouts."
    },
    {
      id: 4,
      title: "Export & Load Activity Files",
      icon: Download,
      description: "Retrieve your files and drop them into the dashboard to visualize your cardiac rehabilitation session.",
      instructions: [
        "Polar H10 ECG File: Open your recording in ECGLogger on your phone, tap Export, select CSV Format, and send the file to your computer.",
        "Garmin FIT File [Optional]: Go to connect.garmin.com on your computer, open the activity, click the gear icon in the top-right, and choose Export Original (downloads a ZIP containing the .fit file)."
      ],
      tip: "If you don't have files recorded yet, you can skip this process completely by using our interactive Demo Session below!"
    }
  ];

  return (
    <div className="glass-card p-6 mb-8 relative overflow-hidden pulse-border-cyan">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[rgba(255,255,255,0.06)] pb-4 mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold font-display text-gradient m-0">
            Cardiac Rehab Setup & Onboarding
          </h2>
          <p className="text-sm text-secondary mt-1 max-w-2xl">
            Configure your Polar H10 chest strap and Garmin watch to capture clinical-grade ECG waveform and running logs.
          </p>
        </div>
        
        <button
          onClick={onLoadDemo}
          disabled={isLoading}
          className="mt-4 md:mt-0 flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#00f2fe] to-[#4facfe] text-[#080a0c] font-semibold rounded-lg hover:opacity-90 active:scale-95 transition-all text-sm disabled:opacity-50"
        >
          <Play size={16} fill="#080a0c" />
          {isLoading ? "Generating..." : "Load Demo Activity"}
        </button>
      </div>

      {/* Stepper Header */}
      <div className="flex justify-between items-center mb-6 max-w-4xl mx-auto px-4">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const isActive = s.id === activeStep;
          const isCompleted = completedSteps[idx];
          
          return (
            <React.Fragment key={s.id}>
              <div 
                onClick={() => setActiveStep(s.id)}
                className={`flex flex-col items-center cursor-pointer group relative z-10`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  isCompleted 
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                    : isActive 
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(0,242,254,0.3)]' 
                      : 'bg-[#12151b] border-white/10 text-secondary group-hover:border-white/30'
                }`}>
                  {isCompleted ? <CheckCircle size={18} /> : <Icon size={18} />}
                </div>
                <span className={`text-[10px] md:text-xs font-semibold mt-2 hidden sm:block ${
                  isActive ? 'text-cyan-300 font-bold' : 'text-secondary'
                }`}>
                  Step {s.id}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 md:mx-4 transition-all duration-500 ${
                  completedSteps[idx] ? 'bg-emerald-500/50' : 'bg-white/5'
                }`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Active Step Panel */}
      <div className="bg-[#0e1116] border border-white/5 rounded-xl p-5 md:p-6 transition-all duration-300">
        {steps.map((s, idx) => {
          if (s.id !== activeStep) return null;
          
          return (
            <div key={s.id} className="animate-fadeIn">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                <h3 className="text-lg font-semibold font-display text-white flex items-center gap-2">
                  <span className="text-cyan-400">Step {s.id}:</span> {s.title}
                </h3>
                <button
                  onClick={(e) => toggleStepCompleted(idx, e)}
                  className={`mt-2 sm:mt-0 px-3 py-1 rounded text-xs font-medium border transition-all ${
                    completedSteps[idx] 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-white/5 border-white/10 text-secondary hover:bg-white/10'
                  }`}
                >
                  {completedSteps[idx] ? "✓ Completed" : "Mark as Complete"}
                </button>
              </div>
              
              <p className="text-sm text-secondary mb-4 leading-relaxed">
                {s.description}
              </p>

              <ol className="list-decimal pl-5 space-y-2 mb-4">
                {s.instructions.map((inst, i) => (
                  <li key={i} className="text-sm text-secondary leading-relaxed">
                    {inst}
                  </li>
                ))}
              </ol>

              {/* Troubleshooting dropdown */}
              <div className="border border-white/5 rounded-lg overflow-hidden bg-white/[0.01]">
                <div 
                  onClick={(e) => toggleTip(idx, e)}
                  className="flex justify-between items-center px-4 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-all"
                >
                  <span className="text-xs font-medium text-cyan-400/80 flex items-center gap-1.5">
                    <Heart size={12} />
                    Pro Tip & Troubleshooting
                  </span>
                  {expandedTips[idx] ? <ChevronUp size={14} className="text-secondary" /> : <ChevronDown size={14} className="text-secondary" />}
                </div>
                {expandedTips[idx] && (
                  <div className="px-4 pb-3 text-xs text-secondary leading-relaxed border-t border-white/5 pt-2.5">
                    {s.tip}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
