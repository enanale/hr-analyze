import io
import os
import zipfile
from pathlib import Path
from typing import List, Dict, Any, Optional
from garminconnect import Garmin



def get_garmin_client(email: str, password: str) -> Garmin:
    """
    Initializes and authenticates a Garmin Connect client.
    Uses automatic local token caching to minimize Cloudflare and rate limit flags.
    """
    if not email or not password:
        raise ValueError("Garmin email and password must be provided.")

    # Initialize API. In v0.3.2, token store is automatically managed at ~/.garminconnect/garmin_tokens.json
    api = Garmin(email, password)
    
    # login() automatically attempts to load and reuse cached session tokens.
    # If they are invalid or expired, it performs a clean credential authentication.
    api.login()
    return api

def get_recent_activities(email: str, password: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Fetches the last N activities of any type from Garmin Connect.
    """
    api = get_garmin_client(email, password)
    
    # Fetch activities with start index 0 and count limit
    raw_activities = api.get_activities(0, limit)
    
    activities = []
    for act in raw_activities:
        # Extract and format relevant fields
        activity_type_dict = act.get("activityType", {})
        type_key = activity_type_dict.get("typeKey", "unknown")
        
        activities.append({
            "activityId": str(act.get("activityId")),
            "activityName": act.get("activityName", "Unnamed Activity"),
            "startTimeLocal": act.get("startTimeLocal", "Unknown Date"),
            "duration_sec": float(act.get("duration", 0.0)),
            "distance_m": float(act.get("distance", 0.0)),
            "activityType": type_key
        })
        
    return activities

def download_garmin_fit_file(email: str, password: str, activity_id: str) -> bytes:
    """
    Downloads the original workout file from Garmin Connect for a specific activity ID.
    Unzips the file in-memory if Garmin Connect returned a compressed archive, and
    returns the raw .fit bytes.
    """
    api = get_garmin_client(email, password)
    
    # Download in original recorded format (which corresponds to raw binary .fit)
    # The SDK exposes ActivityDownloadFormat.ORIGINAL
    try:
        dl_format = api.ActivityDownloadFormat.ORIGINAL
    except AttributeError:
        # Fallback to standard string format if SDK changes
        dl_format = "ORIGINAL"

    data = api.download_activity(activity_id, dl_fmt=dl_format)
    
    # Garmin original downloads are returned as a ZIP archive if exported directly.
    # We unzip in-memory to grab the raw .fit file bytes.
    if zipfile.is_zipfile(io.BytesIO(data)):
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            fit_filenames = [name for name in zf.namelist() if name.lower().endswith('.fit')]
            if fit_filenames:
                return zf.read(fit_filenames[0])
            else:
                raise ValueError("The downloaded Garmin Connect ZIP does not contain a .fit file.")
    else:
        # If it returned raw .fit bytes directly
        return data
