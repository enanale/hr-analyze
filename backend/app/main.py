import numpy as np
import math
import os
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict, Any, Tuple
from app.parsers import parse_polar_csv, parse_garmin_fit
from app.dsp import filter_ecg, detect_r_peaks, analyze_cardiac_irregularities, align_timelines
from app.garmin_client import get_recent_activities, download_garmin_fit_file

# Load environment variables from .env relative to this file with override enabled
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
load_dotenv(dotenv_path=dotenv_path, override=True)

app = FastAPI(title="HR-Analyze API", version="1.0.0")

# Enable CORS for local development UI connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def downsample_series(x: List[float], y: List[float], target_len: int = 5000) -> Tuple[List[float], List[float]]:
    """Downsamples a high-frequency timeseries using simple LTTB or decimation for macro visualization."""
    n = len(x)
    if n <= target_len:
        return x, y
    
    factor = int(math.ceil(n / target_len))
    return x[::factor], y[::factor]

def calculate_rolling_hr(timestamps: np.ndarray, r_peaks: np.ndarray) -> List[Dict[str, Any]]:
    """Calculates a second-by-second rolling heart rate from ECG R-peaks."""
    if len(r_peaks) < 2:
        return []
    
    r_times = timestamps[r_peaks]
    rr_intervals = np.diff(r_times) # in milliseconds
    
    # Calculate heart rate at each peak
    hr_at_peaks = 60000.0 / rr_intervals
    # Add first matching peak to align
    hr_at_peaks = np.insert(hr_at_peaks, 0, hr_at_peaks[0] if len(hr_at_peaks) > 0 else 70.0)
    
    # Generate second-by-second grid
    start_sec = int(r_times[0] / 1000.0)
    end_sec = int(r_times[-1] / 1000.0)
    
    sec_grid = np.arange(start_sec, end_sec + 1)
    if len(sec_grid) == 0:
        return []
        
    # Interpolate
    hr_grid = np.interp(sec_grid * 1000.0, r_times, hr_at_peaks)
    
    result = []
    for s, hr in zip(sec_grid, hr_grid):
        if not np.isnan(hr) and hr > 0:
            result.append({
                "timestamp": int(s * 1000),
                "heart_rate": int(round(hr))
            })
    return result

@app.post("/api/analyze")
async def analyze_activity(
    ecg_file: UploadFile = File(...),
    garmin_file: Optional[UploadFile] = File(None),
    garmin_activity_id: Optional[str] = Form(None)
):
    try:
        # 1. Parse Polar ECG CSV
        ecg_bytes = await ecg_file.read()
        ecg_raw = parse_polar_csv(ecg_bytes)
        
        # Extract variables
        timestamps = np.array(ecg_raw["timestamps"])
        ecg_uV = np.array(ecg_raw["ecg_uV"])
        fs = ecg_raw["sampling_rate"]
        
        # 2. Apply digital signal processing
        filtered_ecg = filter_ecg(ecg_uV, fs)
        r_peaks = detect_r_peaks(filtered_ecg, fs)
        
        # 3. Analyze irregularities & HRV
        analysis = analyze_cardiac_irregularities(timestamps, ecg_uV, filtered_ecg, r_peaks, fs)
        anomalies = analysis["anomalies"]
        hrv_metrics = analysis["hrv_metrics"]
        
        # 4. Optional Garmin Parsing & Sync
        garmin_data = None
        has_garmin = False
        sync_offset_ms = 0.0
        
        # Determine if we should parse direct uploaded FIT file OR download programmatically
        garmin_bytes = None
        if garmin_file:
            garmin_bytes = await garmin_file.read()
        elif garmin_activity_id and garmin_activity_id != "undefined" and garmin_activity_id != "null" and garmin_activity_id != "":
            email = os.getenv("GARMIN_EMAIL")
            password = os.getenv("GARMIN_PASSWORD")
            
            if not email or not password or email == "your_email@example.com":
                raise HTTPException(
                    status_code=400,
                    detail="Garmin credentials not configured in backend/.env file."
                )
            
            try:
                garmin_bytes = download_garmin_fit_file(email, password, garmin_activity_id)
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to download activity {garmin_activity_id} from Garmin Connect: {str(e)}"
                )
                
        if garmin_bytes and len(garmin_bytes) > 0:
            try:
                garmin_data = parse_garmin_fit(garmin_bytes)
                has_garmin = garmin_data["has_hrv"] or len(garmin_data["records"]) > 0
                
                if has_garmin and len(r_peaks) > 10:
                    # Synchronize watch and chest strap timelines
                    sync_offset_ms = align_timelines(
                        garmin_data["records"], 
                        timestamps, 
                        r_peaks, 
                        fs
                    )
                    # Shift ECG timestamps to align with Garmin watch clock
                    timestamps = timestamps + sync_offset_ms
                    
                    # Shift anomaly timestamps too
                    for a in anomalies:
                        a["timestamp"] += sync_offset_ms
            except Exception as e:
                # Don't fail the whole request if optional Garmin parsing errors out
                print(f"Error parsing optional Garmin FIT: {e}")
                has_garmin = False
        
        # 5. Prepare visual outputs
        # To avoid massive payloads, we provide a downsampled view of the raw ECG line
        # and standard high-resolution ECG slices around the detected R-peaks or anomalies.
        macro_ts, macro_val = downsample_series(timestamps.tolist(), filtered_ecg.tolist(), target_len=8000)
        
        # For the micro view, send the raw filtered segments of ECG
        # around the first few seconds or anomalies so the UI can draw high-res instantly.
        # Compute heart rate curve from R-peaks
        ecg_hr_curve = calculate_rolling_hr(timestamps, r_peaks)

        return {
            "success": True,
            "has_garmin": has_garmin,
            "sync_offset_ms": sync_offset_ms,
            "sampling_rate": fs,
            "total_samples": len(timestamps),
            "duration_sec": ecg_raw["duration_sec"],
            "hrv_metrics": hrv_metrics,
            "anomalies": anomalies,
            "macro_ecg": {
                "timestamps": macro_ts,
                "values": macro_val
            },
            "raw_ecg_full": {
                "timestamps": timestamps.tolist() if len(timestamps) < 50000 else [],
                "values": filtered_ecg.tolist() if len(timestamps) < 50000 else []
            },
            "garmin_activity": garmin_data["records"] if has_garmin else None,
            "ecg_heart_rate": ecg_hr_curve
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to analyze session: {str(e)}")


@app.get("/api/demo")
async def get_demo_data():
    """Generates a highly realistic, synthetic cardiac rehab session with active anomalies and Garmin tracks."""
    fs = 130.0
    duration_sec = 180.0
    n_samples = int(duration_sec * fs)
    
    # 1. Generate normal ECG components
    # We construct normal heartbeats at ~72 BPM (0.833 sec interval)
    # Each normal beat consists of P wave, QRS, T wave
    t = np.arange(n_samples) / fs
    ecg_signal = np.zeros(n_samples)
    timestamps = (t * 1000.0) + 1716990000000.0 # Standard epoch start
    
    beat_times = []
    curr_time = 0.5
    
    # Inject beats with HRV variation and 3 specific anomalies (PVC, PAC, Pause)
    while curr_time < duration_sec - 2.5:
        beat_times.append(curr_time)
        
        # Basic HRV variation: slight breath-based modulation
        hrv_mod = 0.05 * math.sin(2 * math.pi * curr_time / 12.0)
        
        # Check if we should inject an anomaly
        # Anomaly 1: PVC at beat 50 (approx 42 seconds)
        if len(beat_times) == 50:
            curr_time += 0.45 # extremely premature (450ms)
        # Anomaly 2: PAC at beat 100 (approx 83 seconds)
        elif len(beat_times) == 100:
            curr_time += 0.50 # premature (500ms)
        # Anomaly 3: Pause at beat 150 (approx 125 seconds)
        elif len(beat_times) == 150:
            curr_time += 2.40 # 2.4 second pause!
        else:
            curr_time += 0.83 + hrv_mod

    # Render each heartbeat shape
    for idx, b_time in enumerate(beat_times):
        # Determine if this beat is a PVC or PAC
        is_pvc = (idx == 50)
        is_pac = (idx == 100)
        
        # Sample index of the R-peak
        r_idx = int(b_time * fs)
        amplitude = 1.4 if is_pvc else 1.0
        
        # Render QRS complex (R-peak, S-fall, Q-dip)
        for i in range(-35, 45):
            curr_idx = r_idx + i
            if 0 <= curr_idx < n_samples:
                # Time in seconds relative to R-peak
                dt = i / fs
                
                # Normal or PAC morphology (narrow QRS)
                if not is_pvc:
                    # QRS complex (simplified)
                    if -0.01 <= dt <= 0.01:
                        # R peak
                        ecg_signal[curr_idx] += amplitude * (1.0 - abs(dt)/0.01)
                    elif -0.03 <= dt < -0.01:
                        # Q dip
                        ecg_signal[curr_idx] += -0.15 * (1.0 - abs(dt + 0.02)/0.01)
                    elif 0.01 < dt <= 0.04:
                        # S dip
                        ecg_signal[curr_idx] += -0.25 * (1.0 - abs(dt - 0.025)/0.015)
                # PVC morphology (wide, slurred positive peak, wide QRS > 120ms)
                else:
                    if -0.08 <= dt <= 0.08:
                        # Wide positive slurred QRS (160ms total width)
                        ecg_signal[curr_idx] += 1.4 * math.cos(math.pi * dt / 0.16)
                        
        # Render P wave (normal & PAC)
        if not is_pvc: # PVCs typically lack a preceding P-wave
            p_time = b_time - 0.15
            p_idx = int(p_time * fs)
            for i in range(-8, 8):
                curr_idx = p_idx + i
                if 0 <= curr_idx < n_samples:
                    dt = i / fs
                    ecg_signal[curr_idx] += 0.12 * math.cos(math.pi * dt / 0.06)
                    
        # Render T wave (normal & PVC discordant)
        # Normal T wave is positive. PVC T wave is typically massive and discordant (opposite/negative)
        t_time = b_time + 0.22 if not is_pvc else b_time + 0.18
        t_idx = int(t_time * fs)
        t_amp = 0.25 if not is_pvc else -0.45 # Massive discordant inverted T-wave for positive PVC QRS
        t_width = 0.12 if not is_pvc else 0.18
        for i in range(-15, 20):
            curr_idx = t_idx + i
            if 0 <= curr_idx < n_samples:
                dt = i / fs
                ecg_signal[curr_idx] += t_amp * math.cos(math.pi * dt / t_width)

    # Add minor white noise + baseline wander (0.1Hz breathing wave)
    ecg_signal += 0.15 * np.sin(2 * np.pi * t / 8.0) # baseline wander
    ecg_signal += np.random.normal(0, 0.03, n_samples) # sensor noise
    
    # Scale to microvolts (standard Polar values range from -500 to +1500 uV)
    ecg_uV = ecg_signal * 800.0
    
    # Process the generated signal through filters to ensure algorithm works realistically
    filtered_ecg = filter_ecg(ecg_uV, fs)
    r_peaks = detect_r_peaks(filtered_ecg, fs)
    
    analysis = analyze_cardiac_irregularities(timestamps, ecg_uV, filtered_ecg, r_peaks, fs)
    anomalies = analysis["anomalies"]
    hrv_metrics = analysis["hrv_metrics"]
    
    # Overwrite descriptions of synthetic anomalies for perfect user presentation
    for a in anomalies:
        if a["type"] == "PVC":
            a["description"] = "Premature Ventricular Contraction (PVC) - Wide, slurred QRS complex (160ms) with discordant T-wave."
        elif a["type"] == "PAC":
            a["description"] = "Premature Atrial Contraction (PAC) - Narrow, early QRS complex (76ms) preceded by an ectopic P-wave."
        elif a["type"] == "Pause":
            a["description"] = f"Extended Sinus Pause ({a['rr_interval_ms']/1000.0:.2f}s) - Prolonged flatline/asystole interval."

    # 2. Generate matching Garmin records (1Hz running track)
    garmin_records = []
    start_ts = int(timestamps[0])
    
    for sec in range(int(duration_sec)):
        ts_ms = start_ts + (sec * 1000)
        
        # Sync Garmin heart rate to the synthetic beat rate at this second
        # We find the matching instant heart rate from beat times
        matching_beat_idx = min(range(len(beat_times)), key=lambda i: abs(beat_times[i] - sec))
        
        # Calculate instant HR from RR interval
        if matching_beat_idx > 0:
            rr = (beat_times[matching_beat_idx] - beat_times[matching_beat_idx - 1])
            bpm = int(60.0 / rr)
        else:
            bpm = 72
            
        # Runner speed: start, ramp up, settle, decelerate
        if sec < 15:
            speed = (sec / 15.0) * 8.5
        elif sec < 150:
            speed = 8.5 + 0.5 * math.sin(sec / 10.0) # slight pacing variation
        else:
            speed = 8.5 * (1.0 - (sec - 150) / 30.0)
            
        garmin_records.append({
            "timestamp": ts_ms,
            "heart_rate": bpm,
            "speed": float(round(speed, 2)),
            "altitude": float(round(42.0 + (sec / 40.0), 1)), # slow climb
            "distance": float(round(sec * 2.36, 1)),
            "lat": 37.7749 + (sec * 0.000005), # jogging path
            "lon": -122.4194 + (sec * 0.000003)
        })

    # Prepare downsampled overview for UI
    macro_ts, macro_val = downsample_series(timestamps.tolist(), filtered_ecg.tolist(), target_len=8000)

    # Compute heart rate curve from R-peaks
    ecg_hr_curve = calculate_rolling_hr(timestamps, r_peaks)

    return {
        "success": True,
        "has_garmin": True,
        "sync_offset_ms": 0.0,
        "sampling_rate": fs,
        "total_samples": len(timestamps),
        "duration_sec": duration_sec,
        "hrv_metrics": hrv_metrics,
        "anomalies": anomalies,
        "macro_ecg": {
            "timestamps": macro_ts,
            "values": macro_val
        },
        "raw_ecg_full": {
            "timestamps": timestamps.tolist(),
            "values": filtered_ecg.tolist()
        },
        "garmin_activity": garmin_records,
        "ecg_heart_rate": ecg_hr_curve
    }


@app.get("/api/garmin/config")
async def get_garmin_config_status():
    """
    Checks if Garmin Connect credentials are set in the environment.
    Used by the UI to highlight whether auto-sync is ready.
    """
    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")
    
    is_configured = (
        bool(email) and 
        bool(password) and 
        email != "your_email@example.com"
    )
    
    return {
        "is_configured": is_configured,
        "configured_email": email if is_configured else None
    }


@app.get("/api/garmin/activities")
async def list_recent_garmin_activities():
    """
    Downloads and logs the list of recent workouts from Garmin Connect.
    """
    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")
    
    if not email or not password or email == "your_email@example.com":
        raise HTTPException(
            status_code=400,
            detail="Garmin Connect credentials are not configured in backend/.env file."
        )
        
    try:
        activities = get_recent_activities(email, password, limit=10)
        return {
            "success": True,
            "activities": activities
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to connect or fetch activities from Garmin: {str(e)}"
        )
