# FSOC Track Lab

**Development of an AI-Based Virtual Camera Tracking System for Coarse Alignment of Mobile Free Space Optical Communication (FSOC) Terminals**

FSOC Track Lab is a software-only virtual testing environment for simulating beacon detection, camera tracking, coarse alignment, disturbance modeling, gimbal control, algorithm comparison, performance analysis, and external video-based beacon tracking for mobile FSOC terminals. It enables rapid iteration on tracking algorithms and control strategies before hardware deployment.

---

## Key Features

- Configurable virtual simulation environment with real-time telemetry
- Moving beacon target with 8 trajectory types
- Virtual camera with configurable horizontal/vertical FOV and pan/tilt gimbal
- Beacon detection and centroid estimation
- Continuous computer-vision tracking with acquisition/lock/loss states
- Three tracking algorithms: AI Centroid, Kalman Predictive, Enhanced Beacon
- PID-based pan/tilt gimbal control
- Configurable target size, shape, and initial location
- Disturbance simulation: sensor noise, camera jitter, platform motion, vibration, atmospheric conditions
- Image noise models: salt-and-pepper, Gaussian, Poisson
- Atmospheric conditions: clear, haze, fog, rain, low light
- Real-time 3D world visualization (Canvas 2D)
- Real-time camera view visualization
- Algorithm benchmarking with 18 standardized scenarios and deterministic random seed
- Algorithm comparison with recommended algorithm selection
- Performance analysis with per-algorithm telemetry comparison
- External MP4 video input with real pixel-based beacon detection
- Boresight offset measurement for external video
- CSV and PDF export for logs and performance reports

---

## System Architecture

### Simulation Pipeline

```
Target Generator
    |
    v
Virtual Camera / Sensor Model
    |
    v
Beacon Detection
    |
    v
Tracking Algorithm (AI Centroid / Kalman Predictive / Enhanced Beacon)
    |
    v
PID Controller
    |
    v
Pan/Tilt Gimbal
    |
    v
Telemetry & Performance Metrics
    |
    v
Feedback to Camera Orientation
```

**Disturbance inputs** feed into the Sensor Model stage: image noise, camera jitter, platform motion, platform vibration, and atmospheric conditions.

### External Video Pipeline

```
MP4 File
    |
    v
HTMLVideoElement
    |
    v
Canvas Frame Extraction (ImageData)
    |
    v
Pixel Preprocessing (grayscale, threshold)
    |
    v
Connected-Component Blob Detection
    |
    v
Intensity-Weighted Centroid
    |
    v
Boresight Offset Calculation
    |
    v
Tracking State Machine (SEARCHING / ACQUIRING / LOCKED / LOST)
    |
    v
Pan/Tilt Command Generation
```

External video mode bypasses the simulated virtual camera entirely and operates directly on video frame pixels.

---

## Tracking Algorithms

### AI Centroid

Centroid-based beacon detection with direct control response. Computes the intensity-weighted centroid of the detected beacon region and generates pan/tilt commands proportional to the boresight offset.

### Kalman Predictive

Extends AI Centroid with a 4-state Kalman filter tracking azimuth, elevation, and their angular velocities. Provides prediction during measurement dropout and smoothing of noisy detections.

### Enhanced Beacon

Enhanced centroid detection with confidence weighting, temporal smoothing, and hold behavior. Improves robustness during temporary detection loss by maintaining the last known good estimate with decay. This is a signal-processing algorithm, not a trained neural network model.

---

## Simulation Configuration

### Camera Parameters

| Parameter | Description |
|---|---|
| Horizontal FOV | Configurable (default: 4 degrees) |
| Vertical FOV | Configurable (default: 3 degrees) |
| Camera resolution | 2000 x 2000 pixels (internal) |
| Pan/Tilt speed limit | Configurable (default: 5 deg/s) |

### Target Parameters

| Parameter | Description |
|---|---|
| Target count | 1 - 20 |
| Designated beacon index | 1 - 8 or all |
| Target shape | Square or circle |
| Target size | 5 - 20 pixels |
| Target speed | 0.1 - 10.0 Mach |
| Initial location | Random or user-defined azimuth/elevation |

### Trajectories

| Trajectory | Description |
|---|---|
| Straight Line | Constant velocity from initial position |
| Circular | Circular path in XZ plane (r=30m) |
| Figure of 8 | Lissajous figure-8 (A=30, B=40) |
| Random | Deterministic multi-sine (physically untrackable) |
| Linear Escape | High-speed linear departure |
| Orbital Pattern | Elliptical orbital motion |
| Evasive Maneuvers | Alternating direction changes |
| Sinusoidal Drift | Sinusoidal oscillation |

### Disturbances

| Category | Parameters |
|---|---|
| Image noise | Salt-and-pepper (probability), Gaussian (stdDev px), Poisson (strength) |
| Camera jitter | Max pixels per frame |
| Platform motion | Type (linear/circular/random/spiral/figure8), max pixels per frame |
| Platform vibration | Boolean enable |
| Atmospheric | Clear, haze, fog, rain, low light |

### General

| Parameter | Description |
|---|---|
| Duration | 5 - 600 seconds |
| Time step | 0.001 - 0.1 seconds |
| Random seed | Configurable for deterministic replay |
| Pan/Tilt speed | 5 - 10 deg/s |

---

## Performance Metrics

### Simulation Mode

| Metric | Description |
|---|---|
| Angular tracking error | Azimuth and elevation error between camera and target |
| Total error | Combined angular error |
| Acquisition time | Time from SEARCHING to LOCKED |
| Lock retention | Percentage of time in LOCKED state |
| Confidence | Detection confidence (0 - 100%) |
| FPS | Simulation frames per second |
| RMSE | Root mean square error over the run |

### External Video Mode

| Metric | Description |
|---|---|
| Average boresight offset | Mean distance (px) between detected beacon centroid and image center |
| Maximum boresight offset | Peak boresight offset during the run |
| RMSE boresight offset | Root mean square of boresight offset |
| Acquisition time | Time from SEARCHING to LOCKED |
| Lock retention | Percentage of time in LOCKED state |
| Reacquisition time | Time to re-acquire after lock loss |
| Average processing FPS | Measured video processing throughput |
| Average processing time | Mean time per frame (ms) |

Boresight offset is the pixel distance between the detected beacon centroid and the image center (boresight). It is not a ground-truth error.

---

## Benchmarking

### Standardized Scenarios

18 benchmark scenarios organized into baseline and stress categories:

| ID | Name | Category |
|---|---|---|
| S01 | Clean Baseline | Baseline |
| S02 | Circular Motion | Baseline |
| S03 | Figure-8 | Baseline |
| S04 | Random Target | Stress |
| S05 | Salt & Pepper | Baseline |
| S06 | Gaussian Noise | Baseline |
| S06-MAX | Gaussian Noise MAX | Baseline |
| S07 | Poisson Noise | Baseline |
| S08 | Atmospheric Haze | Baseline |
| S09 | Atmospheric Fog | Baseline |
| S10 | Atmospheric Rain | Baseline |
| S11 | Low Light | Baseline |
| S12 | Camera Jitter | Baseline |
| S13 | Max Camera Jitter | Baseline |
| S14 | Platform Linear | Baseline |
| S15 | Platform Max | Baseline |
| S16 | Combined Stress | Stress |
| S17 | Maximum Stress | Stress |

### Benchmark Workflow

1. Select preset scenario or configure custom parameters
2. Run benchmark across all three algorithms with the same deterministic seed
3. Compare algorithm performance metrics
4. View recommended algorithm based on weighted scoring
5. Run the recommended or any other algorithm in the live simulation
6. Performance results persist across navigation within the same session

---

## External Video Input

1. Load an MP4 video file containing a bright beacon spot
2. View the video feed with real-time beacon detection overlay
3. Observe centroid position, boresight offset, and tracking state
4. Inspect pan/tilt commands generated by the tracking pipeline
5. Review computed performance metrics (acquisition time, lock retention, processing FPS)
6. Export results as CSV

The external video pipeline uses no simulation ground truth. All detection is based on actual video pixel processing.

---

## Technology Stack

| Component | Technology |
|---|---|
| Framework | React 19 |
| Language | TypeScript 5.8 |
| Build tool | Vite 6 |
| Styling | Tailwind CSS 4 |
| 3D Visualization | HTML5 Canvas 2D |
| Video Processing | Browser-native HTMLVideoElement + Canvas |
| Animation | Motion (Framer Motion successor) |

---

## Project Structure

```
src/
  App.tsx                          # Application shell, state management, routing
  types.ts                         # Core type definitions
  main.tsx                         # Entry point
  index.css                        # Global styles
  components/
    LandingPage.tsx                # Landing page
    DashboardView.tsx              # System overview dashboard
    Navigation.tsx                 # Sidebar navigation
    NewSimulationModal.tsx         # New simulation configuration
    CameraView.tsx                 # Camera/sensor visualization
    World3DView.tsx                # 3D world visualization (Canvas 2D)
    ScenariosLogsView.tsx          # Performance log / telemetry feed
    BenchmarkView.tsx              # Algorithm benchmarking
    PerformanceView.tsx            # Performance analysis / comparison
    VideoInputView.tsx             # External MP4 video input
    SettingsView.tsx               # Application settings
    BottomTelemetry.tsx            # Global bottom telemetry bar
    ReportModal.tsx                # PDF report generation
    AboutModal.tsx                 # About dialog
    DocumentationModal.tsx         # Documentation viewer
    SupportModal.tsx               # Support dialog
    TeamModal.tsx                  # Team information
  services/
    simulationEngine.ts            # Core simulation loop, target trajectories, telemetry
    sensorModel.ts                 # Virtual camera sensor, geometric projection, noise
    beaconDetector.ts              # Beacon detection and centroid estimation
    pidController.ts               # PID controller for pan/tilt gimbal
    kalmanFilter.ts                # 4-state Kalman filter (az, el, dAz, dEl)
    videoTracker.ts                # External video tracking pipeline
    videoBeaconDetector.ts         # Real image-based beacon detector (MP4 pixels)
    videoSource.ts                 # MP4 video frame extraction
    benchmarkRunner.ts             # Benchmark execution engine
    benchmarkScenarios.ts          # 18 standardized benchmark scenarios
    benchmarkMetrics.ts            # Benchmark scoring and comparison
    csvSanitize.ts                 # CSV export sanitization
    __tests__/
      algorithmValidation.ts       # Algorithm validation
      benchmarkValidation.ts       # Benchmark validation
      disturbanceValidation.ts     # Disturbance model validation
      securityValidation.ts        # Input validation and security checks
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone <repository-url>
cd fsoc-track-lab-ps
npm install
```

### Development

```bash
npm run dev
```

The application starts at `http://localhost:3000`.

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | TypeScript type checking (no emit) |
| `npm run clean` | Remove build artifacts |

---

## Production Build

```bash
npm run build
```

Output is written to the `dist/` directory. The build uses Vite with React and Tailwind CSS plugins.

---

## Validation

The project includes the following validation:

- **TypeScript type checking** (`npm run lint`) -- passes with zero errors
- **Vite production build** (`npm run build`) -- completes successfully
- **Algorithm validation** (`src/services/__tests__/algorithmValidation.ts`) -- verifies tracking algorithm correctness
- **Benchmark validation** (`src/services/__tests__/benchmarkValidation.ts`) -- verifies benchmark execution and scoring
- **Disturbance validation** (`src/services/__tests__/disturbanceValidation.ts`) -- verifies disturbance model behavior
- **Security validation** (`src/services/__tests__/securityValidation.ts`) -- verifies input sanitization

---

## Project Scope

FSOC Track Lab is a software-only virtual simulation and external video processing environment. It does not control physical PTZ hardware. The 3D world visualization uses Canvas 2D rendering in the browser. The Enhanced Beacon algorithm is a signal-processing algorithm with confidence weighting and temporal smoothing, not a trained neural network model. Benchmark results are maintained in application state during the session.

---

## License

License not yet specified.
