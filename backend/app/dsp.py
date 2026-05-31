import numpy as np
import pandas as pd
from scipy.signal import butter, filtfilt, find_peaks
from typing import Dict, List, Any, Tuple

def butter_bandpass(lowcut: float, highcut: float, fs: float, order: int = 3) -> Tuple[np.ndarray, np.ndarray]:
    """Generates butterworth bandpass filter coefficients."""
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(order, [low, high], btype='band')
    return b, a

def filter_ecg(ecg_data: np.ndarray, fs: float) -> np.ndarray:
    """
    Applies a zero-phase Butterworth bandpass filter (0.5 Hz - 40 Hz) 
    to remove baseline wander, breathing movement, and high-frequency muscle noise.
    """
    b, a = butter_bandpass(0.5, 40.0, fs, order=3)
    # Use zero-phase filtering to prevent phase/time shifts
    return filtfilt(b, a, ecg_data)

def detect_r_peaks(filtered_ecg: np.ndarray, fs: float) -> np.ndarray:
    """
    Detects QRS complexes (R-peaks) using a modified Pan-Tompkins derivative & squaring algorithm.
    """
    # 1. Take first derivative to highlight the QRS slope
    diff = np.diff(filtered_ecg)
    
    # 2. Square the signal to make all peaks positive and accentuate QRS complexes
    squared = diff ** 2
    
    # 3. Apply moving integration window (~150ms wide) to group QRS waves
    window_size = int(0.15 * fs)
    integrated = np.convolve(squared, np.ones(window_size) / window_size, mode='same')
    
    # 4. Find peaks on integrated signal
    min_dist = int(0.3 * fs)  # Max heart rate ~200 BPM
    threshold = np.percentile(integrated, 70) * 1.5  # Dynamic thresholding
    
    peaks_int, _ = find_peaks(integrated, distance=min_dist, height=threshold)
    
    # 5. Map peaks back to exact R-peaks in original filtered signal
    r_peaks = []
    search_window = int(0.08 * fs)  # 80ms window around peak
    
    for pk in peaks_int:
        start = max(0, pk - search_window)
        end = min(len(filtered_ecg), pk + search_window)
        local_window = filtered_ecg[start:end]
        if len(local_window) > 0:
            # R-peak is the local maximum absolute voltage
            r_idx = start + np.argmax(np.abs(local_window))
            r_peaks.append(int(r_idx))
            
    return np.array(r_peaks)

def calculate_qrs_width_ms(filtered_ecg: np.ndarray, r_peak_idx: int, fs: float) -> float:
    """
    Measures the width of the QRS complex in milliseconds by finding
    the local minimums (Q and S points) around the R peak.
    """
    search_points = int(0.08 * fs) # 80ms search window
    start_q = max(0, r_peak_idx - search_points)
    end_s = min(len(filtered_ecg), r_peak_idx + search_points)
    
    # Find Q (minimum before R)
    q_segment = filtered_ecg[start_q:r_peak_idx]
    q_idx = start_q + np.argmin(q_segment) if len(q_segment) > 0 else r_peak_idx
    
    # Find S (minimum after R)
    s_segment = filtered_ecg[r_peak_idx:end_s]
    s_idx = r_peak_idx + np.argmin(s_segment) if len(s_segment) > 0 else r_peak_idx
    
    # Calculate width in ms
    width_samples = s_idx - q_idx
    width_ms = (width_samples / fs) * 1000.0
    return float(width_ms)

def analyze_cardiac_irregularities(
    timestamps: np.ndarray, 
    raw_ecg: np.ndarray, 
    filtered_ecg: np.ndarray, 
    r_peaks: np.ndarray, 
    fs: float
) -> Dict[str, Any]:
    """
    Analyzes timing and morphology anomalies on R-peaks.
    Flags PVCs, PACs, and long pauses.
    """
    if len(r_peaks) < 5:
        return {"anomalies": [], "hrv_metrics": {}}

    r_times = timestamps[r_peaks]
    rr_intervals = np.diff(r_times) # in milliseconds
    
    # Add dummy first interval to align arrays
    rr_intervals = np.insert(rr_intervals, 0, np.median(rr_intervals))
    
    anomalies = []
    rolling_len = 10
    
    for i in range(2, len(r_peaks) - 1):
        r_idx = r_peaks[i]
        curr_rr = rr_intervals[i]
        
        # Calculate local running average RR (excluding current beat to prevent bias)
        start_idx = max(0, i - rolling_len)
        local_avg_rr = np.median(rr_intervals[start_idx:i])
        
        # 1. Anomaly: Premature Beat (RR interval shortened by > 20%)
        if curr_rr < 0.80 * local_avg_rr:
            # Check for compensatory pause (next RR interval is lengthened)
            next_rr = rr_intervals[i+1]
            qrs_width = calculate_qrs_width_ms(filtered_ecg, r_idx, fs)
            
            anomaly_type = "Ectopic Beat"
            description = "Premature heartbeat detected."
            
            if qrs_width > 120.0:
                anomaly_type = "PVC"
                description = f"Premature Ventricular Contraction (Wide QRS: {qrs_width:.1f}ms)."
            elif qrs_width < 100.0:
                anomaly_type = "PAC"
                description = f"Premature Atrial Contraction (Narrow QRS: {qrs_width:.1f}ms)."
                
            anomalies.append({
                "timestamp": float(r_times[i]),
                "index": int(r_idx),
                "type": anomaly_type,
                "description": description,
                "qrs_width_ms": qrs_width,
                "rr_interval_ms": float(curr_rr),
                "local_avg_rr_ms": float(local_avg_rr)
            })
            
        # 2. Anomaly: Long Pause (RR interval > 2.0 seconds or > 1.8x average)
        elif curr_rr > max(2000.0, 1.8 * local_avg_rr):
            anomalies.append({
                "timestamp": float(r_times[i]),
                "index": int(r_idx),
                "type": "Pause",
                "description": f"Extended pause of {curr_rr/1000.0:.2f}s detected.",
                "qrs_width_ms": 0.0,
                "rr_interval_ms": float(curr_rr),
                "local_avg_rr_ms": float(local_avg_rr)
            })

    # Calculate global Heart Rate Variability (HRV) metrics
    # RMSSD (Root Mean Square of Successive Differences)
    diff_rr = np.diff(rr_intervals)
    rmssd = np.sqrt(np.mean(diff_rr ** 2)) if len(diff_rr) > 0 else 0.0
    
    # SDNN (Standard Deviation of NN intervals)
    sdnn = np.std(rr_intervals)
    
    # Mean HR
    mean_rr = np.mean(rr_intervals)
    mean_hr = 60000.0 / mean_rr if mean_rr > 0 else 0.0

    return {
        "anomalies": anomalies,
        "hrv_metrics": {
            "rmssd_ms": float(rmssd),
            "sdnn_ms": float(sdnn),
            "mean_hr_bpm": float(mean_hr),
            "min_hr_bpm": float(60000.0 / np.max(rr_intervals)) if len(rr_intervals) > 0 else 0.0,
            "max_hr_bpm": float(60000.0 / np.min(rr_intervals)) if len(rr_intervals) > 0 else 0.0
        }
    }

def align_timelines(garmin_records: List[Dict[str, Any]], ecg_timestamps: np.ndarray, ecg_r_peaks: np.ndarray, fs: float) -> float:
    """
    Computes clock lag (drift) between Garmin watch activity time and phone app (ECGLogger) time
    using cross-correlation of calculated Heart Rate profiles.
    
    It automatically compensates for gross timezone discrepancies (e.g. UTC vs local time epoch shifts)
    rounded to the nearest 30-minute interval before running fine cross-correlation.
    
    Returns:
        float: The offset in milliseconds to ADD to the ECG timestamps.
    """
    if not garmin_records or len(ecg_r_peaks) < 30:
        return 0.0
        
    # 0. Automatically compute and compensate for timezone differences (gross offset)
    g_start_ms = garmin_records[0]['timestamp']
    ecg_start_ms = ecg_timestamps[0]
    gross_diff_ms = g_start_ms - ecg_start_ms
    
    # Round to the nearest 30 minutes to support fractional timezones like India Standard Time (IST)
    half_hour_ms = 1800.0 * 1000.0
    gross_offset_ms = round(gross_diff_ms / half_hour_ms) * half_hour_ms
    
    # 1. Build second-by-second ECG Heart Rate profile
    ecg_r_times_sec = ecg_timestamps[ecg_r_peaks] / 1000.0 # convert to relative seconds
    r_diffs_ms = np.diff(ecg_timestamps[ecg_r_peaks])
    
    # Heart rate at each R-peak
    hr_at_peaks = 60000.0 / r_diffs_ms
    hr_at_peaks = np.insert(hr_at_peaks, 0, hr_at_peaks[0] if len(hr_at_peaks) > 0 else 70.0)
    
    # Interpolate ECG heart rate to uniform 1Hz grid starting at min ECG time to max ECG time
    ecg_start_sec = int(np.floor(ecg_r_times_sec[0]))
    ecg_end_sec = int(np.ceil(ecg_r_times_sec[-1]))
    ecg_time_grid = np.arange(ecg_start_sec, ecg_end_sec)
    
    if len(ecg_time_grid) < 10:
        return 0.0
        
    ecg_hr_profile = np.interp(ecg_time_grid, ecg_r_times_sec, hr_at_peaks)
    
    # 2. Build Garmin Heart Rate profile, shifting temporarily to local ECG timezone using gross offset
    g_times_sec = np.array([(r['timestamp'] - gross_offset_ms) / 1000.0 for r in garmin_records])
    g_hr = np.array([r['heart_rate'] for r in garmin_records])
    
    g_start_sec = int(np.floor(g_times_sec[0]))
    g_end_sec = int(np.ceil(g_times_sec[-1]))
    g_time_grid = np.arange(g_start_sec, g_end_sec)
    
    if len(g_time_grid) < 10:
        return float(gross_offset_ms) # Fallback to gross timezone shift if fine alignment profile is too short
        
    garmin_hr_profile = np.interp(g_time_grid, g_times_sec, g_hr)
    
    # 3. Cross-Correlate to find best fine-grain lag
    # We will search lags from -30 seconds to +30 seconds
    max_lag = 30
    best_lag = 0
    max_corr = -1.0
    
    # Zero-center profiles for normalized cross-correlation
    ecg_norm = ecg_hr_profile - np.mean(ecg_hr_profile)
    g_norm = garmin_hr_profile - np.mean(garmin_hr_profile)
    
    # If standard deviations are zero, return gross timezone shift directly
    if np.std(ecg_norm) == 0 or np.std(g_norm) == 0:
        return float(gross_offset_ms)
        
    for lag in range(-max_lag, max_lag + 1):
        # Shift Garmin profile relative to ECG profile
        if lag < 0:
            # Shift Garmin left (lag is negative)
            g_shifted = g_norm[-lag:]
            e_cut = ecg_norm[:len(g_shifted)]
        elif lag > 0:
            # Shift Garmin right
            g_shifted = g_norm[:-lag]
            e_cut = ecg_norm[lag:lag+len(g_shifted)]
        else:
            g_shifted = g_norm
            e_cut = ecg_norm
            
        # Truncate to matching sizes
        min_len = min(len(g_shifted), len(e_cut))
        if min_len < 10:
            continue
            
        corr = np.corrcoef(e_cut[:min_len], g_shifted[:min_len])[0, 1]
        if not np.isnan(corr) and corr > max_corr:
            max_corr = corr
            best_lag = lag
            
    # Calculate total offset in milliseconds
    # ECG aligned = ECG original + gross_offset + fine_lag
    total_offset_ms = gross_offset_ms + (best_lag * 1000.0)
    return float(total_offset_ms)
