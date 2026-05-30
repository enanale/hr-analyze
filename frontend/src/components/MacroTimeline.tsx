import React, { useRef } from 'react';
import { Activity, Clock } from 'lucide-react';

interface HeartRatePoint {
  timestamp: number;
  heart_rate: number;
}

interface SpeedPoint {
  timestamp: number;
  speed: number;
}

interface Anomaly {
  timestamp: number;
  index: number;
  type: string;
  description: string;
}

interface MacroTimelineProps {
  ecgTimestamps: number[];
  heartRateData: HeartRatePoint[];
  speedData: SpeedPoint[] | null;
  anomalies: Anomaly[];
  focusedTimestamp: number;
  onFocusChange: (newTimestamp: number) => void;
}

export const MacroTimeline: React.FC<MacroTimelineProps> = ({
  ecgTimestamps,
  heartRateData,
  speedData,
  anomalies,
  focusedTimestamp,
  onFocusChange
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Time boundaries
  const tMin = ecgTimestamps[0] || 0;
  const tMax = ecgTimestamps[ecgTimestamps.length - 1] || 1;
  const totalDurationMs = tMax - tMin;

  // Percentage utility for click mapping
  const getPercentage = (ts: number) => {
    if (totalDurationMs <= 0) return 0;
    return ((ts - tMin) / totalDurationMs) * 100.0;
  };

  // SVG x-coordinate mapping (0 to 1000 px inside viewBox)
  const getSvgX = (ts: number) => {
    if (totalDurationMs <= 0) return 0;
    return ((ts - tMin) / totalDurationMs) * 1000.0;
  };

  // Heart Rate Y mapping (BPM 40..200 mapped to 90..10px vertically inside 100px viewBox)
  const getHrY = (bpm: number) => {
    const clampedBpm = Math.max(40, Math.min(200, bpm));
    return 90.0 - ((clampedBpm - 40) / 160.0) * 80.0;
  };

  // Speed Y mapping (0..20 km/h mapped to 95..15px vertically)
  const getSpeedY = (speedKmh: number) => {
    const clampedSpeed = Math.max(0, Math.min(20, speedKmh));
    return 95.0 - (clampedSpeed / 20.0) * 80.0;
  };

  // Timeline Click
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = containerRef.current;
    if (!bar) return;
    
    const rect = bar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    
    const targetTimestamp = tMin + (percentage * totalDurationMs);
    onFocusChange(targetTimestamp);
  };

  // Format relative duration (e.g. 02:45)
  const formatTime = (msOffset: number) => {
    const sec = Math.floor(msOffset / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Create SVG path string from coordinates
  const buildSvgPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return '';
    return points.reduce((path, pt, idx) => {
      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${path} L ${pt.x} ${pt.y}`;
    }, '');
  };

  // Generate SVG coordinates lists
  const hrPoints = heartRateData.map(pt => ({
    x: getSvgX(pt.timestamp),
    y: getHrY(pt.heart_rate)
  }));

  const speedPoints = speedData 
    ? speedData.map(pt => ({
        x: getSvgX(pt.timestamp),
        y: getSpeedY(pt.speed)
      }))
    : null;

  return (
    <div className="glass-card p-5 mb-8">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold font-mono tracking-wider text-secondary flex items-center gap-2 m-0">
          <Activity size={15} className="text-[#00f2fe]" />
          SESSION MACRO TIMELINE
        </h3>
        <span className="text-[10px] font-mono text-secondary flex items-center gap-1 bg-white/5 border border-white/5 px-2 py-0.5 rounded">
          <Clock size={11} />
          {formatTime(totalDurationMs)} Session
        </span>
      </div>

      {/* Main Interactive Timeline Scrubber container */}
      <div 
        ref={containerRef}
        onClick={handleTimelineClick}
        className="relative h-28 bg-[#07090d] border border-white/5 rounded-xl overflow-hidden cursor-pointer select-none group"
      >
        {/* SVG Visualization Layer with absolute viewBox */}
        <svg 
          viewBox="0 0 1000 100" 
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {/* A. Reference Grid Mesh Lines (BPM 80, 120, 160) */}
          <line x1={0} y1={getHrY(80)} x2={1000} y2={getHrY(80)} stroke="rgba(255, 255, 255, 0.03)" strokeWidth={1} strokeDasharray="5 5" />
          <line x1={0} y1={getHrY(120)} x2={1000} y2={getHrY(120)} stroke="rgba(255, 255, 255, 0.03)" strokeWidth={1} strokeDasharray="5 5" />
          <line x1={0} y1={getHrY(160)} x2={1000} y2={getHrY(160)} stroke="rgba(255, 255, 255, 0.03)" strokeWidth={1} strokeDasharray="5 5" />
          
          <text x={4} y={getHrY(80) - 2} fill="rgba(255, 255, 255, 0.15)" fontSize="6" fontFamily="var(--font-mono)">80 bpm</text>
          <text x={4} y={getHrY(120) - 2} fill="rgba(255, 255, 255, 0.15)" fontSize="6" fontFamily="var(--font-mono)">120 bpm</text>
          <text x={4} y={getHrY(160) - 2} fill="rgba(255, 255, 255, 0.15)" fontSize="6" fontFamily="var(--font-mono)">160 bpm</text>

          {/* B. Speed Trend Line (If Garmin speed data is present) */}
          {speedPoints && speedPoints.length > 1 && (
            <path
              d={buildSvgPath(speedPoints)}
              fill="none"
              stroke="rgba(16, 185, 129, 0.18)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}

          {/* C. Heart Rate Glowing Trend Line */}
          {hrPoints.length > 1 && (
            <>
              {/* Outer soft glow blur */}
              <path
                d={buildSvgPath(hrPoints)}
                fill="none"
                stroke="rgba(0, 242, 254, 0.12)"
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Inner glowing core line */}
              <path
                d={buildSvgPath(hrPoints)}
                fill="none"
                stroke="#00f2fe"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* D. Vertical Arrhythmia Warning Lines & Badges */}
          {anomalies.map((a, idx) => {
            const ax = getSvgX(a.timestamp);
            
            return (
              <g key={idx}>
                {/* Dotted indicator line */}
                <line
                  x1={ax}
                  y1={0}
                  x2={ax}
                  y2={100}
                  stroke="#ff5e62"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.7}
                />
                
                {/* Glowing alert dot */}
                <circle
                  cx={ax}
                  cy={35}
                  r={3.5}
                  fill="#ff5e62"
                  filter="drop-shadow(0px 0px 4px #ff5e62)"
                />
                
                {/* Text tag badge at top */}
                <rect
                  x={ax - 18}
                  y={4}
                  width={36}
                  height={11}
                  rx={2}
                  fill="rgba(11, 13, 18, 0.9)"
                  stroke="rgba(255, 94, 98, 0.35)"
                  strokeWidth={0.5}
                />
                <text
                  x={ax}
                  y={12}
                  fill="#ff5e62"
                  fontSize="5.5"
                  fontWeight="bold"
                  fontFamily="var(--font-display)"
                  textAnchor="middle"
                >
                  {a.type}
                </text>
              </g>
            );
          })}
        </svg>

        {/* E. Focused Scrubber Slider Overlay */}
        <div 
          className="absolute h-full border-x border-[#00f2fe] bg-cyan-500/[0.03] transform -translate-x-1/2 pointer-events-none transition-all duration-75 shadow-[0_0_20px_rgba(0,242,254,0.1)]"
          style={{
            left: `${getPercentage(focusedTimestamp)}%`,
            width: '5.5%' // Fits standard viewing width
          }}
        />
      </div>

      {/* Interactive Legend with Legend Labels */}
      <div className="flex justify-between items-center mt-3 text-[10px] text-secondary font-mono px-1">
        <span>00:00</span>
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-[#00f2fe]" /> Heart Rate Curve (BPM)
          </span>
          {speedPoints && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 border-t border-dashed border-emerald-500/50" /> Running Speed (km/h)
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-[#ff5e62] rounded-full shadow-[0_0_4px_#ff5e62]" /> Flagged Irregularity
          </span>
        </div>
        <span>{formatTime(totalDurationMs)}</span>
      </div>
    </div>
  );
};
