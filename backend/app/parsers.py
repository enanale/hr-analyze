import io
import pandas as pd
import numpy as np
from fitparse import FitFile
from typing import Dict, List, Any, Optional

def parse_polar_csv(file_bytes: bytes) -> Dict[str, Any]:
    """
    Parses Polar H10 raw ECG CSV files, automatically detecting timestamp and voltage columns.
    Returns:
        Dict containing:
            - timestamps: np.ndarray (milliseconds since epoch)
            - ecg_uV: np.ndarray (raw voltage in microvolts)
            - sampling_rate: float (Hz)
    """
    # Load into Pandas DataFrame
    df = pd.read_csv(io.BytesIO(file_bytes))
    
    # Normalize column names to lowercase for robust matching
    col_map = {col.lower(): col for col in df.columns}
    
    # 1. Detect Timestamp Column
    ts_col = None
    for keyword in ['timestamp', 'time', 'ts', 'epoch', 'millis']:
        for col_lower in col_map:
            if keyword in col_lower:
                ts_col = col_map[col_lower]
                break
        if ts_col:
            break
            
    # 2. Detect ECG Voltage Column
    ecg_col = None
    for keyword in ['ecg', 'uv', 'voltage', 'microvolt', 'value', 'signal']:
        for col_lower in col_map:
            if keyword in col_lower:
                ecg_col = col_map[col_lower]
                break
        if ecg_col:
            break

    if not ts_col or not ecg_col:
        # Fallback to column indices if keywords fail
        if len(df.columns) >= 2:
            ts_col = df.columns[0]
            ecg_col = df.columns[1]
        else:
            raise ValueError(
                f"Invalid Polar CSV format. Must contain at least two columns for timestamp and ECG. Found: {list(df.columns)}"
            )

    # Extract arrays
    timestamps = df[ts_col].values.astype(float)
    ecg_uV = df[ecg_col].values.astype(float)
    
    # Clean up NaNs
    valid_mask = ~np.isnan(timestamps) & ~np.isnan(ecg_uV)
    timestamps = timestamps[valid_mask]
    ecg_uV = ecg_uV[valid_mask]

    if len(timestamps) < 2:
        raise ValueError("ECG file contains insufficient data points.")

    # Auto-detect if unit is millivolts (mV) instead of microvolts (uV).
    # Typically uV values have absolute max > 10.0 (typically 500-2000).
    # mV values have absolute max < 10.0 (typically 0.1 - 2.0).
    if len(ecg_uV) > 0:
        max_abs_val = np.max(np.abs(ecg_uV))
        if max_abs_val < 10.0:
            ecg_uV = ecg_uV * 1000.0

    # Convert timestamps to milliseconds if they appear to be in nanoseconds
    # Standard epoch milliseconds are ~10^12, nanoseconds are ~10^18.
    if timestamps[0] > 1e15:
        timestamps = timestamps / 1e6
    elif timestamps[0] < 1e10:
        # Timestamps might be relative seconds from start
        # Let's convert relative seconds to relative milliseconds
        timestamps = timestamps * 1000.0

    # Calculate actual sampling rate
    duration_sec = (timestamps[-1] - timestamps[0]) / 1000.0
    sampling_rate = len(timestamps) / duration_sec if duration_sec > 0 else 130.0

    return {
        "timestamps": timestamps.tolist(),
        "ecg_uV": ecg_uV.tolist(),
        "sampling_rate": float(sampling_rate),
        "duration_sec": float(duration_sec),
        "total_samples": int(len(timestamps))
    }


def parse_garmin_fit(file_bytes: bytes) -> Dict[str, Any]:
    """
    Parses a Garmin binary .fit activity file to extract Heart Rate, speed,
    altitude, GPS coordinates, and raw RR intervals (HRV).
    
    Returns:
        Dict containing:
            - records: List of dicts (second-by-second activity data)
            - rr_intervals: List of floats (beat-to-beat intervals in ms)
            - has_hrv: bool
    """
    fit_file = FitFile(io.BytesIO(file_bytes))
    
    records = []
    rr_intervals = []
    
    # 1. Parse standard records
    for record in fit_file.get_messages('record'):
        data = {}
        for record_data in record:
            data[record_data.name] = record_data.value
            
        if 'timestamp' in data and 'heart_rate' in data:
            # Convert datetime to unix epoch milliseconds
            ts_ms = int(data['timestamp'].timestamp() * 1000)
            
            records.append({
                "timestamp": ts_ms,
                "heart_rate": int(data['heart_rate']),
                "speed": float(data.get('speed', 0.0) or 0.0) * 3.6, # Convert m/s to km/h
                "altitude": float(data.get('altitude', 0.0) or 0.0), # meters
                "distance": float(data.get('distance', 0.0) or 0.0), # meters
                "lat": float(data.get('position_lat', 0.0) or 0.0) / 11930464.7111, # semicircles to degrees
                "lon": float(data.get('position_long', 0.0) or 0.0) / 11930464.7111
            })
            
    # Sort records by timestamp
    records = sorted(records, key=lambda x: x['timestamp'])

    # 2. Parse HRV / RR intervals
    # HRV messages contain lists of intervals. Let's support standard names:
    # 'time' or 'rr_intervals'
    for hrv in fit_file.get_messages('hrv'):
        for field in hrv:
            if field.name in ['time', 'rr_intervals', 'rr_interval']:
                val = field.value
                if val is not None:
                    if isinstance(val, (list, tuple)):
                        for r in val:
                            if r is not None:
                                # Convert seconds to milliseconds if necessary
                                r_ms = r * 1000.0 if r < 10.0 else r
                                rr_intervals.append(float(r_ms))
                    else:
                        r_ms = val * 1000.0 if val < 10.0 else val
                        rr_intervals.append(float(r_ms))
                        
    return {
        "records": records,
        "rr_intervals": rr_intervals,
        "has_hrv": len(rr_intervals) > 0,
        "total_records": len(records),
        "total_rr_intervals": len(rr_intervals)
    }
