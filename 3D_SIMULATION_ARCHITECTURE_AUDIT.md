# FSOC TRACK LAB — 3D SPATIAL SIMULATION ARCHITECTURE AUDIT

**Date:** 2026-09-05
**Scope:** World 3D visualization layer architecture assessment
**Status:** READ-ONLY AUDIT — no code modified

---

## 1. Current World 3D Implementation

### Rendering Technology

**Canvas 2D with manual 3D-to-2D perspective projection.** No Three.js, no WebGL, no external 3D libraries.

- File: `src/components/World3DView.tsx` (497 lines)
- Single `<canvas>` element rendered via `useEffect` + `requestAnimationFrame`
- All 3D math is hand-rolled in a local `project(x, y, z)` closure

### What the `project()` function does

```typescript
const project = (x: number, y: number, z: number) => {
  // 1. Rotate around Y axis (orbit horizontal)
  // 2. Rotate around X axis (orbit vertical)
  // 3. Perspective divide: scale = fovDepth / (z2 + 1300)
  // 4. Return screen coords {px, py, scale, visible}
};
```

This is a **orbit-camera perspective projection** with:
- Two Euler angle rotations (orbitAngleX, orbitAngleY) for user camera control
- Fixed perspective depth: `fovDepth = 900 * zoomScale`
- Fixed camera distance offset: `z2 + 1300`
- No camera position vectors, no matrix multiplication, no quaternions

### What is actually rendered

| Element | Rendering Method | Real 3D? |
|---------|-----------------|----------|
| Perspective grid | `project(gx, 0, gz)` line pairs | Partially — Y=0 plane only |
| Gimbal tower | Two `project()` calls for top/bottom | Yes — real 3D positions |
| Turret head | Canvas ellipse with pan/tilt rotation | **Approximated** — 2D ellipse, not 3D geometry |
| Pan direction arrow | `project()` from pan angle | Yes — derived from real pan |
| Optical axis line | `project()` from pan/tilt angles | Yes — uses `sin/cos` from real camera state |
| FOV frustum | 4 corners rotated by pan/tilt, then `project()` | **Approximated** — frustum corners in 3D, but no proper near/far planes |
| Tracking line | `project(beacon.x, beacon.y, beacon.z)` | **Yes — real simulation state** |
| Target markers | `project(t.x, t.y, t.z)` | **Yes — real simulation state** |
| Trajectory trails | `project(pt.x, pt.y, pt.z)` per trail point | **Yes — real simulation state** |
| HUD overlays | React DOM elements | N/A — 2D overlay |

### Summary

The current implementation already visualizes **real simulation state** for target positions, trails, optical axis direction, and approximate FOV. It does NOT use a proper 3D engine — it uses manual Euler rotation + perspective divide on a 2D canvas.

---

## 2. Current Simulation State

### Data Flow

```
App.tsx (state owner)
  ├── targets: Target[]          → World3DView, CameraView
  ├── camera: CameraGimbalState  → World3DView, CameraView
  ├── telemetry: TelemetryPoint  → World3DView, CameraView, BottomTelemetry
  └── config: SimulationConfig   → World3DView, CameraView
```

World3DView receives these props (from `App.tsx:523-531`):

```typescript
interface World3DViewProps {
  targets: Target[];
  camera: CameraGimbalState;
  telemetry: TelemetryPoint;
  config: SimulationConfig;
  onSwitchView: (view: NavScreen) => void;
  isSimRunning: boolean;
}
```

### State Inventory

| Quantity | Exists? | Source | Units | Used by World3DView? |
|----------|---------|--------|-------|---------------------|
| target X | ✅ | `Target.x` | meters | ✅ `project(t.x, t.y, t.z)` |
| target Y | ✅ | `Target.y` | meters | ✅ |
| target Z | ✅ | `Target.z` | meters | ✅ |
| target trail X,Y,Z | ✅ | `Target.trail[]` | meters | ✅ trail rendering |
| range | ✅ | `Target.range` | meters | ✅ HUD label only |
| azimuth | ✅ | `Target.azimuth` | degrees | ✅ HUD label only |
| elevation | ✅ | `Target.elevation` | degrees | ✅ HUD label only |
| pan | ✅ | `CameraGimbalState.pan` | degrees | ✅ turret rotation + optical axis + FOV |
| tilt | ✅ | `CameraGimbalState.tilt` | degrees | ✅ turret rotation + optical axis + FOV |
| pan velocity | ✅ | `CameraGimbalState.panVelocity` | deg/s | ❌ Not visualized |
| tilt velocity | ✅ | `CameraGimbalState.tiltVelocity` | deg/s | ❌ Not visualized |
| FOV | ✅ | `config.cameraFov` | degrees | ✅ FOV cone geometry |
| target velocity | ✅ | `Target.vx/vy/vz` | m/s | ❌ Not visualized directly |
| tracking error | ✅ | `TelemetryPoint.totalError` | degrees | ✅ HUD label only |
| confidence | ✅ | `TelemetryPoint.confidence` | % | ✅ Status color |
| lock state | ✅ | `TelemetryPoint.status` | enum | ✅ tracking line color |
| vibration | ✅ | Applied to pan/tilt in `runTrackingPipeline` | degrees | ✅ (visible in gimbal motion) |
| turbulence | ✅ | Applied in `sensorModel` | pixel offset | ❌ Not visible in 3D |
| camera jitter | ✅ | `motionJitter` config flag | meters | ❌ Not visible in 3D |
| timestamp | ✅ | `TelemetryPoint.timeSec` | seconds | ✅ HUD time display |
| groundTruthAz/El | ✅ | `TelemetryPoint` | degrees | ❌ Not visualized separately |
| measuredAz/El | ✅ | `TelemetryPoint` | degrees | ❌ Not visualized separately |
| estimatedAz/El | ✅ | `TelemetryPoint` | degrees | ❌ Not visualized separately |
| gimbal limits | ✅ | `config.panSpeedLimit/tiltSpeedLimit` | deg/s | ❌ Not visualized |
| gimbal saturation | ⚠️ Computed implicitly | PID clamp in `runTrackingPipeline` | boolean | ❌ Not visualized |

---

## 3. Coordinate System

### World Frame (Simulation)

| Axis | Direction | Units | Range |
|------|-----------|-------|-------|
| **X** | Lateral (right = positive) | meters | roughly -400 to +400 |
| **Y** | Vertical (up = positive) | meters | roughly 200-400 |
| **Z** | Downrange (forward = positive) | meters | roughly 800-1400 |

**Origin:** Sensor/telescope position (0, 0, 0)
**Handedness:** Right-handed (X cross Y = Z checks out: right cross up = forward)

### Angle Conventions

| Angle | Definition | Unit | Sign |
|-------|-----------|------|------|
| Azimuth | `atan2(x, z)` | degrees | Positive = right of boresight |
| Elevation | `atan2(y, sqrt(x²+z²))` | degrees | Positive = above horizontal |
| Pan | Gimbal horizontal pointing | degrees | Positive = right (matches azimuth) |
| Tilt | Gimbal vertical pointing | degrees | Positive = up (matches elevation) |

### Sensor Model Projection

```
relAz = target.azimuth - camera.pan     (degrees)
relEl = target.elevation - camera.tilt  (degrees)

normalizedAz = tan(relAz_rad) / tan(halfFov_rad)
normalizedEl = tan(relEl_rad) / tan(halfFov_rad)

pixelX = (normalizedAz + 1) / 2 * 640
pixelY = (-normalizedEl + 1) / 2 * 480    ← Y-flip
```

This is a **gnomonic (tangent) projection** — correct for pinhole camera model.

### World3DView Projection

The World3DView uses a **completely different** projection:
- User-controlled orbit angles (Euler)
- Fixed perspective depth
- Not aligned to the simulation's coordinate frame

**This is acceptable** — the World3DView is an external observer camera, not the simulated sensor. The orbit angles are for user inspection, not simulation.

### Potential Inconsistencies

1. **No inconsistency in simulation data** — azimuth, elevation, pan, tilt all use the same sign convention
2. **World3DView FOV cone** uses pan/tilt rotation but approximates with Euler angles — the cone corners are rotated by `sin(pan)/cos(pan)` and `sin(tilt)/cos(tilt)` independently, which is correct for a pan-tilt gimbal (not a roll-pitch-yaw camera)
3. **The optical axis direction** in World3DView uses: `axEndX = sin(pan) * cos(tilt) * axisLen`, `axEndY = 100 + sin(tilt) * axisLen`, `axEndZ = cos(pan) * cos(tilt) * axisLen` — this correctly represents the gimbal pointing direction in 3D

---

## 4. Camera / Gimbal Geometry

### Current Gimbal Model

The gimbal is a **two-axis pan-tilt** mount:
- **Pan** rotates around the Y-axis (vertical axis)
- **Tilt** rotates around the local X-axis (after pan rotation)

This is modeled in `simulationEngine.ts:376-380`:
```
vibration → distPan (pan perturbation)
          → distTilt (tilt perturbation)
```

And in `sensorModel.ts:58-59`:
```
relAz = target.azimuth - camera.pan
relEl = target.elevation - camera.tilt
```

### How to Represent in 3D

The terminal/gimbal/camera hierarchy should be:

```
Terminal (fixed at origin)
  └── Pan rotation (around Y-axis)
        └── Tilt rotation (around local X-axis)
              └── Camera body
                    └── Optical axis (forward direction)
                    └── FOV frustum (symmetric cone/pyramid)
```

The optical axis direction in world coordinates:
```
axisX = sin(pan) * cos(tilt)
axisY = sin(tilt)
axisZ = cos(pan) * cos(tilt)
```

This is **already correctly computed** in World3DView.tsx (line ~220-224).

### What the current 3D view already provides

- ✅ Gimbal position at origin (tower)
- ✅ Turret head rotation (visual approximation)
- ✅ Pan direction arrow
- ✅ Optical axis line (dashed)
- ✅ FOV cone wireframe
- ✅ Tracking line to beacon

---

## 5. FOV Geometry

### Current FOV Definition

From `sensorModel.ts:40`:
```typescript
const effectiveFov = config.cameraFov / camera.zoom;
```

- `config.cameraFov` is the **full horizontal FOV in degrees** (e.g., 20°)
- `camera.zoom` divides it (e.g., 2x zoom → 10° effective FOV)
- The FOV is **symmetric** around the boresight
- It is interpreted as **horizontal FOV** (applied to azimuth axis)

### FOV in 3D Visualization

World3DView.tsx (lines 233-286):
```typescript
const fovRad = (config.cameraFov * Math.PI) / 180;
const coneRange = 1200;
const coneHW = Math.tan(fovRad / 2) * coneRange;
```

This creates a **rectangular frustum** (not a cone) with:
- Half-width = `tan(FOV/2) * range`
- Aspect ratio hardcoded at 4:3 (based on 0.75 factor for Y)
- Rotated by pan/tilt

### Issues / Notes

1. The FOV frustum uses `config.cameraFov` directly, **not accounting for zoom** — this means the 3D FOV cone doesn't reflect the effective FOV after zoom
2. The frustum is rectangular (4 corners), which is correct for a rectangular sensor
3. The aspect ratio is approximated (0.75 factor), not derived from actual sensor dimensions (640x480 → 4:3)
4. There is no near-plane clipping — the frustum extends from the turret to `coneRange=1200`

---

## 6. Target / Trajectory Model

### Trajectory Types

All trajectories produce **true 3D positions** (x, y, z in meters):

| Trajectory | Mathematical Model | 3D? | Deterministic under seed? |
|------------|-------------------|-----|--------------------------|
| Random | `x = sin(t*0.7)*250 + sin(t*1.7)*70`, `y = 230 + cos(t*0.5)*90`, `z = 1200 + cos(t*0.3)*180` | ✅ | Partially (no RNG used per-step) |
| Linear Escape | `x += vx + sin(t*0.2)*10`, `y += vy + cos(t*0.1)*3`, `z += 150*speed*dt` | ✅ | Partially |
| Evasive Maneuvers | `x += sin(t*0.8)*80 + jitter`, `y = 240 + heave + wiggle`, `z = 1200 + cos(t*0.4)*200` | ✅ | Partially (jitter uses RNG) |
| Orbital Pattern | `x = sin(angle)*radius`, `y = 250 + sin(angle*2)*50`, `z = 1100 + cos(angle)*radius*0.6` | ✅ | Yes (deterministic) |
| Sinusoidal Drift | `x = sin(t*0.4)*350`, `y = 220 + cos(t*0.3)*80`, `z = 1250 + sin(t*0.2)*150` | ✅ | Yes (deterministic) |

### Trail Buffer

Each target maintains a rolling buffer of last 30 `{x, y, z}` positions, updated every tick.

### Key Finding

**All trajectory state is already 3D.** The target `x, y, z` positions are the source of truth. The azimuth/elevation values are **derived** from these 3D positions. The 3D visualization can use the positions directly without any reconstruction.

---

## 7. Disturbance Model

| Disturbance | Where Applied | Effect | Spatially Visualizable? |
|-------------|--------------|--------|------------------------|
| **Platform vibration** | `simulationEngine.ts:377-379` | Adds sinusoidal offsets to pan/tilt (physical gimbal jitter) | ✅ Already visible — gimbal orientation changes |
| **Atmospheric turbulence** | `sensorModel.ts:93-101` | Pixel-domain offsets + scintillation + dropout | ⚠️ Partially — dropout is visible (beacon disappears), but pixel offsets aren't visible in 3D |
| **Sensor noise** | `sensorModel.ts:86-89` | Increases noise level in sensor frame | ❌ Not visible in 3D (affects detection accuracy only) |
| **Camera motion jitter** | `simulationEngine.ts:301-309` | Adds random offsets to target X/Y position | ✅ Already visible — target position jitters |

### Disturbance Visualization Notes

- **Vibration** is already spatially visible because it physically perturbs the gimbal orientation
- **Turbulence** dropout is visible (beacon disappears from 3D view when `detected=false`)
- **Turbulence** pixel offsets could be visualized as a "shimmer" or "distortion" effect on the tracking line, but this would be decorative, not simulation-driven
- **Sensor noise** has no spatial manifestation — it only affects detection accuracy
- The recommendation is to NOT add fake visual shake for disturbances that don't affect spatial position

---

## 8. Current Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     App.tsx (State Owner)                     │
│                                                              │
│  useEffect (50Hz setInterval)                                │
│    ├── updateTargetPositions() → targets state               │
│    ├── runTrackingPipeline()   → camera + telemetry state    │
│    └── trackingPipelineRef     → pipeline state (ref)        │
│                                                              │
│  Props passed to views:                                      │
│    targets, camera, telemetry, config                        │
└──────────┬────────────────────────────┬──────────────────────┘
           │                            │
           ▼                            ▼
   ┌───────────────┐          ┌──────────────────┐
   │  CameraView   │          │   World3DView    │
   │  (2D canvas)  │          │  (2D canvas)     │
   │               │          │                  │
   │ Uses:         │          │ Uses:            │
   │ - target.az/el│          │ - target.x/y/z   │
   │ - camera.pan  │          │ - camera.pan     │
   │ - camera.tilt │          │ - camera.tilt    │
   │ - config.fov  │          │ - config.fov     │
   │ - telemetry.* │          │ - telemetry.*    │
   └───────────────┘          └──────────────────┘

   Both views receive the SAME state from App.tsx.
   Both views are READ-ONLY consumers.
   Neither view modifies simulation state.
```

### Key Architecture Property

**There is exactly one simulation source of truth** — the state in `App.tsx`. Both CameraView and World3DView are passive consumers of the same `targets`, `camera`, `telemetry`, and `config` state. The 3D view does NOT run its own simulation.

---

## 9. Problems / Limitations

### Current Limitations

1. **No zoom-aware FOV cone** — The 3D FOV frustum uses `config.cameraFov` directly, ignoring `camera.zoom`
2. **No estimated direction visualization** — The Kalman/deep-beacon estimated direction (`telemetry.estimatedAz/El`) is not shown in 3D
3. **No ground-truth vs estimated comparison** — The 3D view doesn't show where the algorithm thinks the target is vs where it actually is
4. **No gimbal limit visualization** — Pan/tilt speed limits are not represented spatially
5. **No gimbal saturation indicator** — When the PID output is clamped, it's not visually obvious
6. **No target trajectory prediction** — The Kalman filter predicts target motion, but this isn't shown in 3D
7. **No reacquisition visualization** — When the target re-enters FOV after dropout, there's no special visual treatment
8. **Approximate turret geometry** — The turret head is a 2D ellipse, not proper 3D geometry
9. **No near-plane for FOV frustum** — The frustum starts at the turret, not at a configurable near distance
10. **Hardcoded scene dimensions** — Grid size, tower height, cone range are all hardcoded constants

### What is NOT a Problem

- ✅ The simulation state is correctly shared (single source of truth)
- ✅ Target 3D positions are real simulation data
- ✅ Gimbal state is real simulation data
- ✅ The coordinate system is consistent
- ✅ The rendering is read-only (no simulation interference)
- ✅ The existing algorithm tests (266/266) are unaffected

---

## 10. Three.js vs Canvas Assessment

### Current State: Canvas 2D

| Aspect | Assessment |
|--------|-----------|
| Implementation complexity | Low — all math is hand-rolled |
| Performance | Adequate for current scene complexity |
| Bundle size | Zero additional dependencies |
| Maintainability | Moderate — manual 3D math is error-prone |
| Mathematical correctness | Approximate — no matrix stack, no proper transforms |
| Camera/frustum support | Manual approximation |
| Vector/quaternion support | None — all inline math |
| React/Vite compatibility | Excellent |
| Offline/client-only | Yes |

### Option B: Three.js

| Aspect | Assessment |
|--------|-----------|
| Implementation complexity | Moderate — need to learn Three.js API, but it provides correct primitives |
| Performance | Better — WebGL hardware acceleration, scene graph optimization |
| Bundle size | ~150KB gzipped (three core) — acceptable for this project |
| Maintainability | Better — standard 3D engine with documentation |
| Mathematical correctness | Excellent — proper matrix stack, quaternions, frustum math |
| Camera/frustum support | Built-in `PerspectiveCamera`, `CameraHelper`, `FrustumGeometry` |
| Vector/quaternion support | Full `Vector3`, `Quaternion`, `Euler`, `Matrix4` |
| React/Vite compatibility | Good — `@react-three/fiber` available but optional |
| Offline/client-only | Yes — bundled via npm |

### Recommendation

**Use Three.js.** The理由:

1. **Correctness** — Three.js provides proper perspective projection, frustum math, and rotation handling. The current hand-rolled projection has approximations that will become problems as the scene grows.

2. **Maintainability** — Future contributors can use standard Three.js documentation rather than deciphering hand-rolled Euler rotation math.

3. **Feature support** — FOV frustum visualization, camera helpers, orbit controls, and raycasting are all built-in. Reimplementing these in Canvas 2D would be more work than adopting Three.js.

4. **Bundle size** — ~150KB gzipped is acceptable. The project already ships React (~40KB), Vite runtime, and Tailwind CSS. Three.js adds modest overhead.

5. **Risk** — The risk is LOW because:
   - Three.js would ONLY be used in `World3DView.tsx`
   - CameraView.tsx remains Canvas 2D (it simulates a sensor feed, not a 3D scene)
   - No simulation logic changes
   - No algorithm changes
   - Existing tests remain unaffected

**Do NOT use `@react-three/fiber`** — it adds another layer of abstraction. A direct Three.js integration with a `useRef` + `useEffect` pattern (same as the current Canvas 2D approach) is simpler and more predictable.

---

## 11. Recommended Architecture

```
                    Simulation Engine
                           │
                           ▼
                    Simulation State
                    (App.tsx)
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
        Camera View     World 3D     Telemetry
        (Canvas 2D)    (Three.js)    (DOM)
                           │
                           ▼
                     3D Scene Graph
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
     Target             Gimbal             FOV
     Meshes             Group              Frustum
        │                  │                  │
        ▼                  ▼                  ▼
   Trajectory         Camera Pose       Optical Axis
   Trail              Pan/Tilt          Line + Cone
```

### Key Design Principle

**World3DView receives the SAME props as CameraView.** No additional simulation state is needed for basic 3D visualization. The 3D view is a pure visualization layer.

### Optional Enhancement: SpatialSimulationState

For cleanliness, a derived type could be introduced:

```typescript
interface SpatialSimulationState {
  targets: Target[];
  camera: CameraGimbalState;
  telemetry: TelemetryPoint;
  config: SimulationConfig;
}
```

This is just a convenience grouping — no new data. The existing props already contain everything needed.

---

## 12. Required State Changes

### For Basic 3D Enhancement (Phase 1)

**None.** The existing `targets`, `camera`, `telemetry`, and `config` props contain all necessary state.

### For Advanced Features (Phase 2+)

| Feature | New State Required? | Source |
|---------|-------------------|--------|
| Estimated direction visualization | No | `telemetry.estimatedAz/El` already exists |
| Ground-truth direction visualization | No | `telemetry.groundTruthAz/El` already exists |
| Gimbal limit visualization | No | `config.panSpeedLimit/tiltSpeedLimit` already exist |
| Gimbal saturation indicator | Derived | Compute from `camera.panVelocity` vs `config.panSpeedLimit` |
| FOV zoom correction | No | `config.cameraFov / camera.zoom` already computed in CameraView |
| Target velocity vectors | No | `Target.vx/vy/vz` already exist |
| Reacquisition event | Derived | `telemetry.status` transitions already tracked |

### What is NOT needed

- No new simulation state
- No new trajectory models
- No new sensor models
- No new detection algorithms
- No new coordinate frames

---

## 13. Proposed Component / File Structure

```
src/
├── components/
│   ├── World3DView.tsx              ← REWRITE (Three.js)
│   └── world3d/                     ← NEW directory
│       ├── SceneSetup.tsx           ← NEW: Three.js scene, camera, renderer, lights
│       ├── GimbalModel.tsx          ← NEW: Terminal + gimbal + camera geometry
│       ├── TargetMarkers.tsx        ← NEW: Target meshes + trail lines
│       ├── FOVFrustum.tsx           ← NEW: FOV cone/frustum geometry
│       ├── OpticalAxis.tsx          ← NEW: Optical axis line
│       ├── TrackingLine.tsx         ← NEW: Line from gimbal to beacon
│       ├── EstimatedDirection.tsx   ← NEW: Kalman estimate visualization
│       ├── GroundTruthDirection.tsx ← NEW: True target direction visualization
│       ├── SceneGrid.tsx            ← NEW: Ground plane grid
│       └── SceneHUD.tsx             ← NEW: 3D HUD overlays (optional)
├── services/
│   └── simulationEngine.ts          ← UNCHANGED
│   └── sensorModel.ts               ← UNCHANGED
│   └── beaconDetector.ts            ← UNCHANGED
│   └── kalmanFilter.ts              ← UNCHANGED
│   └── pidController.ts             ← UNCHANGED
└── types.ts                         ← UNCHANGED (or minor additions for 3D types)
```

### File Responsibilities

| File | Purpose | Dependencies |
|------|---------|-------------|
| `World3DView.tsx` | Container: Three.js canvas, orbit controls, animation loop | `world3d/*` |
| `SceneSetup.tsx` | Scene, camera, renderer, lighting, resize handling | `three` |
| `GimbalModel.tsx` | Terminal base, tower, turret head with pan/tilt rotation | `three`, `CameraGimbalState` |
| `TargetMarkers.tsx` | Beacon glow, distractor markers, trail lines | `three`, `Target[]` |
| `FOVFrustum.tsx` | Frustum wireframe from camera FOV + pan/tilt | `three`, `SimulationConfig`, `CameraGimbalState` |
| `OpticalAxis.tsx` | Dashed line from camera in pointing direction | `three`, `CameraGimbalState` |
| `TrackingLine.tsx` | Line from gimbal to beacon target | `three`, `Target`, `TelemetryPoint` |
| `EstimatedDirection.tsx` | Cone/sphere showing Kalman estimate direction | `three`, `TelemetryPoint` |
| `GroundTruthDirection.tsx` | Line showing true target direction | `three`, `TelemetryPoint` |
| `SceneGrid.tsx` | Ground plane reference grid | `three` |

---

## 14. Rendering Strategy

### Three.js Setup

```typescript
// In World3DView.tsx
const canvasRef = useRef<HTMLCanvasElement>(null);
const sceneRef = useRef<THREE.Scene | null>(null);
const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

useEffect(() => {
  // 1. Create scene, camera, renderer
  // 2. Add orbit controls (OrbitControls from three/addons)
  // 3. Add lights (ambient + directional)
  // 4. Create gimbal model group
  // 5. Create target meshes
  // 6. Create FOV frustum
  // 7. Start animation loop

  return () => {
    // Cleanup: dispose renderer, remove event listeners
  };
}, []);

// Update scene when props change
useEffect(() => {
  // Update gimbal rotation from camera.pan/camera.tilt
  // Update target positions from targets[]
  // Update FOV frustum from config.cameraFov / camera.zoom
  // Update tracking line from beacon position
  // DO NOT modify simulation state
}, [targets, camera, telemetry, config]);
```

### Animation Loop

```typescript
const animate = () => {
  requestAnimationFrame(animate);
  // Orbit controls update
  rendererRef.current.render(sceneRef.current, cameraRef.current);
};
```

### Key Rendering Decisions

1. **Scene scale:** 1 unit = 1 meter (matches simulation)
2. **Camera:** PerspectiveCamera with configurable FOV for orbit view
3. **Orbit controls:** `OrbitControls` from `three/addons/controls/OrbitControls.js`
4. **Lighting:** Ambient (0.4) + Directional (0.6) from above-right
5. **Gimbal model:** Simple box/cylinder geometry, rotated by pan/tilt
6. **Target markers:** Sphere geometry for beacon, smaller spheres for distractors
7. **FOV frustum:** `PyramidGeometry` or custom `BufferGeometry` with wireframe material
8. **Trails:** `Line` with `LineBasicMaterial`, updating positions from `Target.trail[]`
9. **Grid:** `GridHelper` on the XZ plane at Y=0

---

## 15. Determinism Considerations

### Current Determinism Properties

- Simulation runs on a fixed `setInterval` at ~50Hz (16ms)
- `updateTargetPositions` uses `elapsedSec` (continuous time, not tick-based)
- Disturbance RNG is optional (via `SimulationNoise` parameter)
- Benchmark runner uses seeded PRNG streams for reproducibility

### World3DView MUST NOT:

1. ❌ Consume seeded RNG — rendering must not use `Math.random()` or any PRNG
2. ❌ Modify simulation state — no `setTargets`, `setCamera`, `setTelemetry` from within World3DView
3. ❌ Affect timing — no `setInterval` or `setTimeout` that influences simulation step
4. ❌ Run physics — no position interpolation, no velocity integration
5. ❌ Generate targets — all target positions come from props

### Safe Rendering Practices

- Use `requestAnimationFrame` for rendering (does not affect simulation timing)
- Read-only access to all simulation state via props
- Three.js scene updates happen in `useEffect` (React commit phase, not during simulation)
- Orbit controls are user-controlled, not simulation-driven

---

## 16. Performance Considerations

### Current Performance Profile

- **Simulation:** 50Hz physics update via `setInterval`
- **Rendering:** `requestAnimationFrame` (typically 60Hz)
- **Canvas 2D:** Manual clearing + redrawing every frame
- **Scene objects:** ~20 draw calls per frame (grid lines, gimbal, targets, FOV, HUD)

### Three.js Performance

- **WebGL:** Hardware-accelerated, can handle 1000+ objects at 60fps
- **Scene complexity:** ~15-20 meshes (gimbal parts, targets, FOV, grid) — trivial for WebGL
- **Trail updates:** 30 points per target × up to 8 targets = 240 line vertices — trivial
- **FOV frustum:** 8 vertices, updated on pan/tilt/zoom change — trivial
- **No texture uploads:** All geometry is solid color or wireframe

### Performance Risks

1. **React re-renders:** Each prop change triggers a React re-render of World3DView. This is fine because the Three.js scene is updated in `useEffect`, not during render.
2. **OrbitControls:** Standard library, well-optimized. No risk.
3. **Resize handling:** Canvas resize should debounce to avoid layout thrashing.

### Recommendation

Performance is NOT a concern for this scene complexity. Three.js will be faster than the current Canvas 2D implementation due to hardware acceleration.

---

## 17. Security Considerations

### Maintained Properties

- ✅ No backend — Three.js is an npm dependency bundled at build time
- ✅ No database
- ✅ No external API calls — Three.js is fully local
- ✅ No dynamic code execution — standard Three.js scene graph
- ✅ No `eval()`, `innerHTML`, `dangerouslySetInnerHTML`
- ✅ No CDN — bundled via Vite
- ✅ No network calls in core simulation

### New Dependencies

| Package | Purpose | Security Impact |
|---------|---------|----------------|
| `three` | 3D rendering engine | Low — well-maintained, no known vulnerabilities, client-side only |

### What NOT to Do

- ❌ Do not use Three.js remote modules or CDN imports
- ❌ Do not load GLTF/GLB models from external URLs
- ❌ Do not use `FontLoader` with remote fonts
- ❌ Do not enable Three.js statistics/debug overlays in production

---

## 18. Testing Strategy

### Existing Tests (Must Remain Passing)

- 266/266 algorithm correctness tests — `algorithmValidation.ts`
- 101/101 security validation tests — `securityValidation.ts`
- TypeScript lint — `tsc --noEmit`
- Vite build — `vite build`

### New Tests for 3D Layer

| Test | Type | Purpose |
|------|------|---------|
| Coordinate origin test | Unit | Verify gimbal at (0,0,0), target at correct position |
| Forward target test | Unit | Target at (0, 200, 1000) appears centered in scene |
| Left/right target test | Unit | Target at (100, 200, 1000) appears to the right |
| Up/down target test | Unit | Target at (0, 400, 1000) appears above |
| Pan rotation test | Unit | Pan=45° rotates gimbal model 45° around Y-axis |
| Tilt rotation test | Unit | Tilt=20° tilts camera model upward |
| FOV geometry test | Unit | FOV=10° produces narrower cone than FOV=20° |
| FOV boundary test | Unit | Target at FOV edge is at frustum boundary |
| Optical axis test | Unit | Axis points in pan/tilt direction |
| Target trajectory consistency | Integration | 3D positions match simulation `Target.x/y/z` |
| Ground-truth vs estimate | Integration | Both directions visible and distinct |
| Gimbal saturation | Integration | Visual indicator when PID output is clamped |
| Lock/lost state | Integration | Visual state changes with tracking status |
| Reacquisition | Integration | Visual feedback when target re-enters FOV |
| Seed determinism | Regression | Same seed → same target positions → same 3D positions |
| Benchmark invariance | Regression | 3D rendering ON/OFF produces identical benchmark scores |
| 30-second simulation | End-to-end | Full simulation renders correctly in 3D |

### Benchmark Invariance Test

This is the most critical test:

```typescript
// 1. Run benchmark with World3DView mounted (rendering active)
// 2. Run benchmark with World3DView unmounted (no rendering)
// 3. Compare telemetryHistory arrays — must be identical
// 4. Compare benchmark scores — must be identical
```

---

## 19. Phased Implementation Plan

### Phase A — Foundation / Coordinate System

**Purpose:** Set up Three.js infrastructure and verify coordinate system alignment.

**Files modified:** `World3DView.tsx`
**New files:** `world3d/SceneSetup.tsx`, `world3d/SceneGrid.tsx`
**Dependencies:** `three`, `@types/three`
**Risk:** Low — isolated to World3DView
**Validation:** Scene renders with correct scale, grid aligns with simulation origin

### Phase B — 3D World and Terminal

**Purpose:** Render the FSOC terminal geometry at the origin.

**Files modified:** `World3DView.tsx`
**New files:** `world3d/GimbalModel.tsx`
**Dependencies:** Phase A
**Risk:** Low
**Validation:** Terminal visible at origin, tower height matches simulation

### Phase C — Target and Trajectory

**Purpose:** Render target markers and trajectory trails from real simulation state.

**Files modified:** `World3DView.tsx`
**New files:** `world3d/TargetMarkers.tsx`
**Dependencies:** Phase A
**Risk:** Low
**Validation:** Beacon marker at `project(t.x, t.y, t.z)` matches current Canvas 2D positions

### Phase D — Camera + Pan/Tilt Gimbal

**Purpose:** Gimbal model rotates with real pan/tilt values.

**Files modified:** `world3d/GimbalModel.tsx`
**Dependencies:** Phase B
**Risk:** Low
**Validation:** Pan=45° rotates turret 45° right; Tilt=20° tilts upward

### Phase E — FOV Frustum

**Purpose:** Render FOV cone/frustum that responds to FOV config and zoom.

**Files modified:** `world3D/World3DView.tsx`
**New files:** `world3d/FOVFrustum.tsx`
**Dependencies:** Phase D
**Risk:** Medium — frustum geometry must match sensor model projection
**Validation:** FOV=10° cone is narrower than FOV=20°; zoom=2x halves effective FOV

### Phase F — Optical Axis + Target Line

**Purpose:** Visualize camera pointing direction and line-of-sight to target.

**Files modified:** `world3d/World3DView.tsx`
**New files:** `world3d/OpticalAxis.tsx`, `world3d/TrackingLine.tsx`
**Dependencies:** Phase D
**Risk:** Low
**Validation:** Optical axis aligns with pan/tilt direction; tracking line connects gimbal to beacon

### Phase G — Truth vs Estimated Direction

**Purpose:** Show ground-truth target direction and algorithm's estimated direction in 3D.

**Files modified:** `world3d/World3DView.tsx`
**New files:** `world3d/EstimatedDirection.tsx`, `world3d/GroundTruthDirection.tsx`
**Dependencies:** Phase F
**Risk:** Low — uses existing `telemetry.groundTruthAz/El` and `telemetry.estimatedAz/El`
**Validation:** Two distinct direction indicators visible; they diverge during tracking errors

### Phase H — Disturbance Visualization

**Purpose:** Visualize disturbances that have spatial effects.

**Files modified:** Various `world3d/*.tsx`
**Dependencies:** Phase D
**Risk:** Low
**Validation:** Vibration visible as gimbal oscillation; dropout visible as beacon disappearance

### Phase I — HUD / Telemetry Integration

**Purpose:** Add 3D-positioned labels or overlay panels.

**Files modified:** `World3DView.tsx`
**New files:** `world3d/SceneHUD.tsx` (optional)
**Dependencies:** Phase A
**Risk:** Low
**Validation:** HUD shows pan, tilt, error, status in sync with simulation

### Phase J — Performance Optimization

**Purpose:** Optimize rendering for smooth 60fps.

**Files modified:** Various `world3d/*.tsx`
**Dependencies:** All previous phases
**Risk:** Low
**Validation:** 60fps sustained during 30-second simulation with 8 targets

### Phase K — Testing

**Purpose:** Write comprehensive test suite.

**New files:** `src/services/__tests__/world3dValidation.ts`
**Dependencies:** All previous phases
**Risk:** Low
**Validation:** All 17 tests pass; existing 266+101 tests unaffected

---

## 20. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Three.js bundle size increase | Certain | Low | ~150KB gzipped. Acceptable for this project. |
| React re-render performance | Low | Medium | Use `useRef` for Three.js objects, `useEffect` for updates. Standard pattern. |
| Coordinate system mismatch | Medium | High | Phase A explicitly validates alignment before proceeding. |
| FOV geometry incorrect | Medium | Medium | Phase E includes boundary tests. Compare with sensor model. |
| Breaking existing tests | Low | High | No simulation logic changes. Run full test suite after each phase. |
| OrbitControls conflict with React | Low | Low | Standard Three.js + React integration pattern. Well-documented. |
| Gimbal rotation math wrong | Medium | Medium | Use Three.js `Euler` and `Quaternion` instead of manual rotation. |
| Scene not updating on prop change | Medium | Medium | Use `useEffect` with proper dependency array. Test each phase. |
| Performance regression | Low | Low | Scene is trivially small. Profile after Phase J. |

---

## RECOMMENDATION

**BUILD**

The project has a strong foundation:
- Single source of truth (App.tsx state)
- Read-only rendering in World3DView
- Real 3D simulation state already available
- Correct coordinate system
- No algorithm changes needed

The current Canvas 2D implementation already visualizes real simulation data. Upgrading to Three.js will improve correctness, maintainability, and feature capability without altering simulation behavior.

---

## MINIMUM FILES TO CHANGE

| File | Change |
|------|--------|
| `src/components/World3DView.tsx` | Rewrite to use Three.js (same props, same interface) |
| `package.json` | Add `three` and `@types/three` dependencies |

---

## NEW FILES

| File | Purpose |
|------|---------|
| `src/components/world3d/SceneSetup.tsx` | Three.js scene, camera, renderer, controls |
| `src/components/world3d/GimbalModel.tsx` | Terminal + gimbal + camera geometry |
| `src/components/world3d/TargetMarkers.tsx` | Target meshes + trail lines |
| `src/components/world3d/FOVFrustum.tsx` | FOV frustum wireframe |
| `src/components/world3d/OpticalAxis.tsx` | Optical axis line |
| `src/components/world3d/TrackingLine.tsx` | Line from gimbal to beacon |
| `src/components/world3d/EstimatedDirection.tsx` | Kalman estimate direction |
| `src/components/world3d/GroundTruthDirection.tsx` | True target direction |
| `src/components/world3d/SceneGrid.tsx` | Ground plane grid |
| `src/services/__tests__/world3dValidation.ts` | 3D visualization tests |

---

## PACKAGES TO ADD

| Package | Version | Purpose |
|---------|---------|---------|
| `three` | `^0.172.0` | 3D rendering engine |
| `@types/three` | `^0.172.0` | TypeScript types |

---

## EXPECTED REGRESSION RISK

**LOW**

- No simulation logic changes
- No algorithm changes
- No coordinate system changes
- No state management changes
- World3DView interface (props) remains identical
- All existing tests are unaffected
- New tests validate 3D correctness independently

---

*End of 3D Spatial Simulation Architecture Audit*
