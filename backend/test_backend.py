import sys
import os

# Add root folder to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.parsers import parse_polar_csv
from app.dsp import filter_ecg, detect_r_peaks
from app.main import get_demo_data
import asyncio

async def test_all():
    print("Testing backend modules import...")
    import numpy as np
    
    # 1. Test demo data generation
    print("Testing Demo Generator...")
    demo_result = await get_demo_data()
    
    if demo_result["success"]:
        print("✓ Demo generation successful!")
        print(f"  Duration: {demo_result['duration_sec']} seconds")
        print(f"  ECG samples generated: {demo_result['total_samples']}")
        print(f"  HRV Metrics: {demo_result['hrv_metrics']}")
        print(f"  Anomalies detected: {len(demo_result['anomalies'])}")
        for a in demo_result["anomalies"]:
            print(f"    - [{a['type']}] at timestamp {a['timestamp']}: {a['description']}")
            
        assert len(demo_result["anomalies"]) > 0, "No anomalies generated!"
        assert demo_result["has_garmin"], "Garmin data missing from demo!"
        print("✓ Anomaly detection verified successfully!")
    else:
        print("✗ Demo generation failed!")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_all())
