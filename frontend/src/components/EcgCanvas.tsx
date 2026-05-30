import React, { useRef, useEffect, useState } from 'react';
import { ZoomIn, ZoomOut, Zap } from 'lucide-react';

interface Anomaly {
  timestamp: number;
  index: number;
  type: string;
  description: string;
  qrs_width_ms: number;
  rr_interval_ms: number;
  local_avg_rr_ms: number;
}

interface EcgCanvasProps {
  timestamps: number[];
  values: number[];
  anomalies: Anomaly[];
  focusedTimestamp: number;
  onScrub: (newTimestamp: number) => void;
}

export const EcgCanvas: React.FC<EcgCanvasProps> = ({
  timestamps,
  values,
  anomalies,
  focusedTimestamp,
  onScrub
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // View states
  const [viewDurationSec, setViewDurationSec] = useState<number>(5.0); // Show 5 seconds by default
  const [voltageGain, setVoltageGain] = useState<number>(1.0); // Zoom vertically (gain)
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragStartTimestamp, setDragStartTimestamp] = useState<number>(0);

  // Mouse hover state for coordinate tooltip
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number; val: number; ms: number } | null>(null);

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !timestamps.length || !values.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI retina screens
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Calculate time bounds of the current frame
    // Center the view on focusedTimestamp
    const halfDuration = viewDurationSec / 2.0;
    const tStart = focusedTimestamp - (halfDuration * 1000.0);
    const tEnd = focusedTimestamp + (halfDuration * 1000.0);
    
    // Pixel mapping functions
    const getX = (tMs: number) => {
      return ((tMs - tStart) / (tEnd - tStart)) * width;
    };
    
    const getY = (valUv: number) => {
      // Standard scale: baseline at center of height
      // Polar ECG records voltage in microvolts (uV), standard range is ~ -500 to +1500 uV.
      // We invert the Y coordinate (canvas starts 0 at top, ECG goes up at top)
      const centerY = height / 2.0;
      const verticalScale = (height / 2000.0) * voltageGain; // Map 2000uV window to card height
      return centerY - (valUv * verticalScale);
    };
    // ==========================================
    // DRAW NEUTRAL STANDARD ECG GRID LINES
    // ==========================================
    // On standard ECG paper:
    // Minor grid lines (1mm): 0.04s (40ms) wide, 0.1mV (100uV) high.
    // Major grid lines (5mm): 0.20s (200ms) wide, 0.5mV (500uV) high.
    
    const ecgGridMinor = '#f1f3f4';
    const ecgGridMajor = '#e2e8f0';

    // 1. Draw Vertical Time Grid Lines (40ms and 200ms)
    // Find first minor grid line timestamp aligned to 40ms
    const gridSpacingMs = 40.0;
    const firstGridMs = Math.ceil(tStart / gridSpacingMs) * gridSpacingMs;
    
    for (let tGrid = firstGridMs; tGrid <= tEnd; tGrid += gridSpacingMs) {
      const isMajor = Math.round(tGrid) % 200 === 0;
      ctx.lineWidth = isMajor ? 1.0 : 0.5;
      ctx.strokeStyle = isMajor ? ecgGridMajor : ecgGridMinor;
      
      const gx = getX(tGrid);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    }

    // 2. Draw Horizontal Voltage Grid Lines (100uV and 500uV)
    const gridSpacingUv = 100.0;
    // Map bounds to uV
    const uvMin = -1500.0;
    const uvMax = 1500.0;
    
    for (let uGrid = uvMin; uGrid <= uvMax; uGrid += gridSpacingUv) {
      const isMajor = Math.round(uGrid) % 500 === 0;
      ctx.lineWidth = isMajor ? 1.0 : 0.5;
      ctx.strokeStyle = isMajor ? ecgGridMajor : ecgGridMinor;
      
      const gy = getY(uGrid);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }

    // ==========================================
    // FIND AND DRAW RAW ECG SIGNAL
    // ==========================================
    // Find index range of data to plot to avoid sweeping whole massive array
    // Binary search to find start index
    let startIdx = 0;
    let endIdx = timestamps.length - 1;
    
    // Quick binary search
    let low = 0;
    let high = timestamps.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (timestamps[mid] < tStart) {
        startIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    
    low = 0;
    high = timestamps.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (timestamps[mid] > tEnd) {
        endIdx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    
    // Expand indexes slightly for clean borders
    startIdx = Math.max(0, startIdx - 5);
    endIdx = Math.min(timestamps.length - 1, endIdx + 5);

    // Plot ECG Waveform Segment
    if (startIdx < endIdx) {
      ctx.beginPath();
      ctx.lineWidth = 2.0;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1a73e8'; // Clean Google Blue
      
      let isFirst = true;
      for (let i = startIdx; i <= endIdx; i++) {
        const x = getX(timestamps[i]);
        const y = getY(values[i]);
        
        if (isFirst) {
          ctx.moveTo(x, y);
          isFirst = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // ==========================================
    // OVERLAY FLAGGED ARRHYTHMIAS (ANOMALIES)
    // ==========================================
    anomalies.forEach((anomaly) => {
      if (anomaly.timestamp >= tStart && anomaly.timestamp <= tEnd) {
        const ax = getX(anomaly.timestamp);
        
        // Find index of anomaly in ECG array to find its vertical peak
        const nearIdx = anomaly.index;
        const ay = getY(values[nearIdx] || 0);

        // Draw electrical highlight circle
        ctx.beginPath();
        ctx.arc(ax, ay, 10, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(217, 48, 37, 0.12)'; 
        ctx.fill();
        ctx.strokeStyle = '#d93025';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label annotation box (clinical M3 capsule)
        ctx.fillStyle = '#fce8e6';
        ctx.strokeStyle = '#d93025';
        ctx.lineWidth = 1.0;
        ctx.font = '9px "JetBrains Mono", monospace';
        
        const labelText = `${anomaly.type} (${Math.round(anomaly.qrs_width_ms)}ms QRS)`;
        const labelWidth = ctx.measureText(labelText).width + 12;
        
        // Render bubble above the peak
        ctx.beginPath();
        ctx.roundRect(ax - labelWidth / 2, ay - 32, labelWidth, 16, 4);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#d93025';
        ctx.fillText(labelText, ax - labelWidth / 2 + 6, ay - 20);
        
        // Draw downward connecting dash
        ctx.beginPath();
        ctx.moveTo(ax, ay - 16);
        ctx.lineTo(ax, ay - 10);
        ctx.strokeStyle = '#d93025';
        ctx.stroke();
      }
    });

    // ==========================================
    // DRAW COORDINATE CROSSHAIR / HOVER TOOLTIP
    // ==========================================
    if (hoverPos && !isDragging) {
      const hx = hoverPos.x;
      const hy = hoverPos.y;
      
      // Draw crosshair lines
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.setLineDash([4, 4]);
      
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, height);
      ctx.moveTo(0, hy);
      ctx.lineTo(width, hy);
      ctx.stroke();
      ctx.setLineDash([]); // clear dash

      // Tooltip label bubble
      const relativeSec = (hoverPos.ms - timestamps[0]) / 1000.0;
      const tooltipText = `${relativeSec.toFixed(2)}s | ${Math.round(hoverPos.val)} uV`;
      
      ctx.font = '10px "JetBrains Mono", monospace';
      const tw = ctx.measureText(tooltipText).width + 12;
      
      const tpx = hx + 12 + tw > width ? hx - 12 - tw : hx + 12;
      const tpy = hy - 12 < 0 ? hy + 12 : hy - 12;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.roundRect(tpx, tpy - 8, tw, 20, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#202124';
      ctx.fillText(tooltipText, tpx + 6, tpy + 5);
    }

    // Draw central alignment line
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.beginPath();
    ctx.moveTo(width / 2.0, 0);
    ctx.lineTo(width / 2.0, height);
    ctx.stroke();

    // Center focal label
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.font = '9px "Inter", sans-serif';
    ctx.fillText("CENTER FOCUS", width / 2.0 - 32, 12);

  }, [timestamps, values, anomalies, focusedTimestamp, viewDurationSec, voltageGain, hoverPos, isDragging]);

  // Handle Drag-to-Scrub Events
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartTimestamp(focusedTimestamp);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const xPix = e.clientX - rect.left;
    const yPix = e.clientY - rect.top;

    // Center view bounds calculation
    const halfDuration = viewDurationSec / 2.0;
    const tStart = focusedTimestamp - (halfDuration * 1000.0);
    const tEnd = focusedTimestamp + (halfDuration * 1000.0);

    const ms = tStart + (xPix / rect.width) * (tEnd - tStart);
    const centerY = rect.height / 2.0;
    const verticalScale = (rect.height / 2000.0) * voltageGain;
    const uv = (centerY - yPix) / verticalScale;

    if (isDragging) {
      const deltaX = e.clientX - dragStartX;
      // Calculate milliseconds shifted per pixel
      const msPerPixel = (viewDurationSec * 1000.0) / rect.width;
      const targetTs = dragStartTimestamp - (deltaX * msPerPixel);
      
      // Clamp bounds
      const minTs = timestamps[0];
      const maxTs = timestamps[timestamps.length - 1];
      const clampedTs = Math.max(minTs, Math.min(maxTs, targetTs));
      onScrub(clampedTs);
    } else {
      setHoverPos({ x: xPix, y: yPix, ms, val: uv });
    }
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
    setHoverPos(null);
  };

  return (
    <div className="glass-card p-5 mb-8" ref={containerRef}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div>
          <h3 className="text-lg font-bold font-display text-white flex items-center gap-2 m-0">
            <Zap size={16} className="text-[#1a73e8]" />
            ECG Waveform Micro View
          </h3>
          <p className="text-xs text-secondary mt-0.5">
            130Hz high-frequency cardiac waveform. Drag standard grid to scrub. Click macro points to focus.
          </p>
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-3">
          <div className="flex bg-[#0e1116] border border-white/5 rounded-lg p-0.5">
            <button
              onClick={() => setViewDurationSec(prev => Math.min(15.0, prev + 1.5))}
              className="p-1.5 text-secondary hover:text-white transition-all hover:bg-white/5 rounded-md"
              title="Zoom Out Time (Show more seconds)"
            >
              <ZoomOut size={15} />
            </button>
            <span className="text-[10px] font-semibold text-secondary font-mono px-2 self-center">
              {viewDurationSec.toFixed(1)}s Width
            </span>
            <button
              onClick={() => setViewDurationSec(prev => Math.max(1.5, prev - 1.5))}
              className="p-1.5 text-secondary hover:text-white transition-all hover:bg-white/5 rounded-md"
              title="Zoom In Time (Finer detail)"
            >
              <ZoomIn size={15} />
            </button>
          </div>

          <div className="flex bg-[#0e1116] border border-white/5 rounded-lg p-0.5">
            <button
              onClick={() => setVoltageGain(prev => Math.max(0.4, prev - 0.2))}
              className="p-1.5 text-secondary hover:text-white transition-all hover:bg-white/5 rounded-md"
              title="Decrease Voltage Gain (Flatten graph)"
            >
              <ZoomOut size={15} className="rotate-90" />
            </button>
            <span className="text-[10px] font-semibold text-secondary font-mono px-2 self-center">
              {voltageGain.toFixed(1)}x Gain
            </span>
            <button
              onClick={() => setVoltageGain(prev => Math.min(3.0, prev + 0.2))}
              className="p-1.5 text-secondary hover:text-white transition-all hover:bg-white/5 rounded-md"
              title="Increase Voltage Gain (Exaggerate peaks)"
            >
              <ZoomIn size={15} className="rotate-90" />
            </button>
          </div>
        </div>
      </div>

      {/* HTML5 Canvas Render Port */}
      <div className="relative border border-white/5 rounded-xl overflow-hidden shadow-inner bg-[#ffffff]">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          className="w-full h-80 block cursor-grab active:cursor-grabbing"
        />
        
        {/* Subtle grid specs helper in top-left */}
        <div className="absolute top-2 left-2 bg-[#0e1116]/80 backdrop-blur-sm border border-white/5 px-2 py-1 rounded text-[9px] font-mono text-secondary pointer-events-none select-none">
          Grid: 1mm box = 40ms | 0.1mV (100uV)
        </div>
      </div>
    </div>
  );
};
