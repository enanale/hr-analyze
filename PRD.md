# Product Requirements Document (PRD): HR-Analyze

## 1. Context & Objectives

### 1.1 Context
The user is a runner undergoing cardiac rehabilitation following a Left Anterior Descending (LAD) coronary artery stent procedure. Monitoring cardiovascular response during exercises is critical to ensure safety, analyze recovery, and detect potential irregularities (e.g., arrhythmias, premature ventricular contractions (PVCs), ectopic beats, or sudden rate spikes/drops).

### 1.2 Hardware Ecosystem
- **Polar H10 (Required):** High-accuracy chest strap monitor capable of recording:
  - Real-time standard Heart Rate (HR).
  - Beat-to-beat intervals (RR intervals / HRV data).
  - Raw ECG waveform data (sampled at 130Hz) when connected via Bluetooth to compatible software.
- **Garmin Smartwatch (Optional):** Sport watch (e.g., Forerunner series) used to record outdoor runs/rehab sessions. It can capture GPS, pace, standard HR, and raw RR intervals (if "Log HRV" is enabled) from the paired Polar H10 chest strap, saving them in a binary `.fit` activity file.

### 1.3 Objective
To establish a pipeline that allows the user to download, visualize, and analyze their raw heart rate and raw ECG data from the Polar H10 chest strap, highlighting any cardiac irregularities. If Garmin data is optionally provided, the application will synchronize and overlay spatial and activity metrics (GPS, speed, altitude) onto the cardiac timeline—either via manual `.fit` file upload or direct, automated cloud synchronization from Garmin Connect.

---

## 2. Off-the-Shelf Software Evaluation

For many parts of this workflow, highly mature off-the-shelf software already exists. Leveraging these where appropriate reduces custom engineering work to what is strictly necessary.

### 2.1 Polar H10 Raw ECG Capture & Recording
*   **ECGLogger (iOS, Android, macOS Apple Silicon):**
    *   *Capability:* Streams real-time ECG waveforms from the Polar H10 chest strap on a standard ECG grid.
    *   *Export:* Outputs high-fidelity `.csv` and `.pdf` files.
    *   *Recommendation:* **Adopt.** This is the easiest off-the-shelf way to record raw ECG waveforms during a session without custom Bluetooth programming.
*   **ECG Analysis for Polar H10 (Android):**
    *   *Capability:* Similar to ECGLogger but exports in EDF (European Data Format).

### 2.2 Activity Tracking & HRV Analysis
*   **Runalyze (Web):**
    *   *Capability:* Imports Garmin `.fit` files directly. It extracts beat-to-beat RR interval data, performs basic anomaly correction, and charts HRV indices (RMSSD, SDNN, etc.) over the course of a run.
    *   *Recommendation:* Excellent for high-level athletic training analytics and automatic syncing with Garmin Connect.
*   **Kubios HRV Standard (Desktop - Windows/macOS):**
    *   *Capability:* The gold standard in scientific heart rate variability and autonomic nervous system analysis. It imports `.fit` files directly, performs advanced noise filtering, highlights ectopic/arrhythmic beats, and visualizes RR tachograms.
    *   *Recommendation:* **Adopt for offline deep-dive HRV analysis.**

### 2.3 Proposed Custom Tool Scope
While off-the-shelf tools exist, they are fragmented:
- Kubios analyzes RR intervals but does not visualize the actual *raw ECG waveform* from ECGLogger.
- Custom anomaly detection can flag specific voltage patterns in the 130Hz ECG signal (e.g., PVC detection).
- A unified local web app will allow loading a Polar ECG CSV file as the primary source, visualizing it instantly, and optionally uploading a Garmin FIT file or syncing directly with Garmin Connect to overlay running metrics (GPS, speed, elevation) on the timeline.

---

## 3. Core User Journeys (CUJs)

### CUJ 1: Log & Export
During a run or recovery session, the user runs **ECGLogger** on their phone to capture the raw 130Hz ECG stream from the Polar H10. Optionally, the user also records an activity on their Garmin watch (paired with Polar H10) to capture GPS/pace data.
- **Result:** User obtains a Polar ECG `.csv` file (required) and optionally a Garmin `.fit` file (or registers it to their Garmin Connect account).

### CUJ 2: Flexible Import & Alignment
The user opens the **HR-Analyze** app.
- **Scenario A (ECG Only):** User uploads only the Polar `.csv` file. The app parses it and presents the full interactive ECG visualizer and anomaly dashboard.
- **Scenario B (ECG + Garmin FIT File):** User uploads both files. The application automatically extracts timestamps, cross-correlates the heart rate profiles to align the timelines, and syncs the Garmin activity metrics (speed/GPS) with the raw ECG timeline.
- **Scenario C (ECG + Garmin Connect Cloud Sync):** User enters Garmin credentials (cached securely in local memory). The backend fetches the latest activity lists, downloads the selected `.fit` file in the background, extracts the telemetry, and aligns it with the uploaded Polar ECG CSV file automatically.

### CUJ 3: Multi-Scale Visualization
The user sees an interactive dashboard:
1. **Macro View (The Session):** Shows the full session heart rate profile (and speed/altitude if Garmin data is present) using an interactive, brushable SVG timeline.
2. **Micro View (The Waveform):** An interactive standard ECG grid displaying the raw 130Hz electrical signal. Clicking anywhere on the Macro View scrolls the Micro View to the exact corresponding second.

### CUJ 4: Irregularity Detection Dashboard
The application runs local digital signal processing on the 130Hz ECG signal to automatically flag anomalies:
- Ectopic beats / PVCs (Premature Ventricular Contractions).
- Ectopic beats / PACs (Premature Atrial Contractions).
- Sudden artifact dropouts (sensor movement).
- Unusually long pauses or tachycardic spikes.
The user can jump to these flagged markers instantly with a single click.

---

## 4. Key Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| **F-01** | Support Polar H10 raw ECG `.csv` file import (timestamp, microvolt ECG readings). | P0 |
| **F-02** | Support Garmin `.fit` file import (extracting timestamp, heart rate, and RR intervals). | P1 |
| **F-03** | Auto-align datasets using epoch timestamps and cross-correlation of heart rate profiles (when both FIT and CSV are provided). | P1 |
| **F-04** | Fast rendering of the 130Hz ECG waveform (utilizing a custom high-performance HTML5 Canvas with hardware acceleration). | P0 |
| **F-05** | Timeline scrubbing: clicking on the activity timeline updates the ECG waveform focus area. | P0 |
| **F-06** | Basic irregularity algorithms: flag Premature Ventricular Contractions (PVCs) using QRS width analysis and RR interval outliers. | P1 |
| **F-07** | Fully local-first execution to guarantee health privacy. | P0 |
| **F-08** | Support automated direct cloud integration with Garmin Connect API to pull running activity FIT files on the fly. | P1 |

---

## 5. Non-Functional Requirements

- **Performance:** ECG records contain ~468,000 points per hour. Visualization must render smoothly at 60 FPS without crashing the browser tab. Renders high-performance HTML5 canvas for the Micro view with dynamic scroll limits.
- **Aesthetics:** Sleek warm off-white clinical light theme matching the new Google Health design app (background: `#f8f9fa`, cards: `#ffffff`, high-contrast typography in Google dark charcoal `#202124` and medium gray `#5f6368`), using premium typography, clean slate ECG grid lines (`#f1f3f4` / `#e2e8f0`), and clean solid Material Design 3 components.
- **Ease of Deployment:** Simple local run command (`python backend + fast frontend`).

---

## 6. Step-by-Step Onboarding & Hardware Setup Requirements

To ensure maximum usability, the application MUST include an interactive **Onboarding Wizard** that walks the user through setting up their devices. The onboarding flow will feature clear steps, visual checkpoints, and direct download links.

### Step 1: Pair Polar H10 with Garmin Watch
- **Goal:** Ensure Garmin records heart rate and RR interval signals from the chest strap rather than the optical wrist sensor.
- **Instruction to User:**
  1. Put on your Polar H10 chest strap (moisten the electrodes for best connectivity).
  2. On your Garmin watch, hold the **Up/Menu** button.
  3. Navigate to **Settings > Sensors & Accessories > Add New > Search All**.
  4. Select **Polar H10** once detected and confirm pairing.

### Step 2: Enable HRV Logging on the Garmin Watch
- **Goal:** Save millisecond-accurate beat-to-beat intervals inside the binary activity `.fit` file.
- **Instruction to User:**
  1. On your Garmin watch, go to **Settings**.
  2. Navigate to **System > Data Recording**.
  3. Find **Log HRV** and toggle it **ON**.
  *Note: If your firmware version hides this option, the wizard will provide instructions on using the `enable_hrv.fit` file configuration.*

### Step 3: Install & Configure ECGLogger on Phone
- **Goal:** Enable raw 130Hz ECG voltage capture.
- **Instruction to User:**
  1. Download **ECGLogger** from the App Store (iOS) or Google Play Store (Android).
  2. Open the app and ensure Bluetooth is enabled.
  3. Turn on the Polar H10, select it in the app's device discovery list, and pair it.
  4. Ensure sampling frequency is set to **130Hz** (default) and standard recording layout is selected.

### Step 4: Exporting Data After a Session
- **Goal:** Guide the user on how to retrieve the files.
- **Garmin FIT File (Manual Option):**
  1. Go to [Garmin Connect Web](https://connect.garmin.com/).
  2. Open the recorded activity.
  3. Click the **Gear icon** in the top-right and select **Export Original** (this downloads a `.zip` containing the `.fit` file).
- **Garmin Connect Cloud Sync (Automated Option):**
  1. Enter your Garmin credentials directly in the "Garmin Connect Sync" control panel in the dashboard to automatically synchronize activities without downloading them manually.
- **Polar ECG CSV File:**
  1. In the ECGLogger app, open your recorded log.
  2. Tap **Export** and choose **CSV Format**.
  3. Transfer the CSV to your computer (via AirDrop, email, or local sync folder).
