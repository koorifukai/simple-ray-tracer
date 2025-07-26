# Optical Design Ray Tracer

A TypeScript/React optical design application for **optical engineering ray tracing** (lens design, optical systems), not computer graphics ray tracing.

**Status**: ✅ **All Ground Truth Validation Tests Passing** (16/16 surfaces validated)

## Quick Start

```bash
npm install

# Interactive menu (Windows)
npm start            # Uses run.bat for interactive menu

# Interactive menu (Cross-platform)  
npm run start:node   # Uses run.mjs for interactive menu

# Direct commands
npm run dev          # Start development server at http://localhost:5174
npm run test         # Run ground truth validation tests from console
```

## Project Overview

This is a professional optical design tool for creating and analyzing optical systems using proper ray tracing mathematics. The application follows optical engineering conventions and provides precise numerical calculations for lens design and optical system analysis.

## Project Structure

```
src/
├── math/           - Vector mathematics and linear algebra for optical calculations
├── optical/        - Core optical ray tracing engine 
│   ├── surfaces.ts         - Surface factory and transform mathematics
│   ├── OpticalSystem.ts    - YAML system parser and rendering
│   ├── RayTracer.ts        - Ray propagation and intersection algorithms  
│   └── consoleValidation.ts - Ground truth validation runner
├── visualization/ - Plotly.js 3D visualization for optical systems
├── components/    - React UI components (YAML editor, controls)
├── utils/         - Ground truth validation and testing utilities
├── tests/         - Reference test data and expected outputs
└── styles/        - Dark theme CSS optimized for optical design
```

## Key Technologies

- **Frontend**: React + TypeScript + Vite
- **Math Engine**: Custom optical mathematics with proper 3D transforms
- **Editor**: Monaco Editor for YAML system definition  
- **Visualization**: Plotly.js for 3D optical system rendering
- **Testing**: Ground truth validation against reference implementation
- **Format**: YAML for optical system specifications

## UI Layout (T-shaped Design)

- **Top**: Menu bar with import/export and ray trace controls
- **Left**: YAML editor for optical system definition
- **Right**: Plotly.js 3D visualization of the optical system
- **Bottom** *(future)*: Spot diagrams and sequential design tables

## Testing Methodology

This project uses **Ground Truth Validation** - comparing implementation output against a proven reference program:

### Console Testing (Primary)
```bash
npm run test                 # Full ground truth validation
npm run test:ground-truth    # Same as above
```

Console tests are the **primary validation method**. They:
- Parse test cases from `src/tests/SurfaceTests.yml`
- Compare output against expected results in `src/tests/SurfaceTests.txt`
- Use ±1e-4 numerical tolerance for all comparisons
- Provide detailed failure analysis with exact mismatch values
- **Strict One-to-One Corner Matching**: Requires exactly 4 calculated corners to match exactly 4 expected corners (no partial matches allowed)
- **Enhanced Plane Geometry Validation**: Verifies that all 6 edge vectors connecting 4 corners are perpendicular to surface normal AND that all corners lie on the same plane (coplanarity test)

### Browser Testing (Secondary)
```bash
npm run test:browser        # Opens browser for visual inspection
```

Browser tests are only used **after console tests pass** for visual verification.

### Test Cases

The ground truth validation covers 8 test surfaces with:
- Surface definitions using both `normal: [x,y,z]` and `angles: [azimuth,elevation]`
- Dial rotations combined with surface orientations
- Assembly positioning with complex coordinate transforms
- Various optical train configurations

## YAML System Format

```yaml
name: "Optical System Name"

materials:
  BK7:
    nd: 1.5168      # Refractive index at d-line
    vd: 64.17       # Abbe number for dispersion

surfaces:
  - sid: 0
    type: "spherical"
    radius: 20.0        # Radius of curvature
    width: 25.0         # Surface dimensions
    height: 25.0

assemblies:
  - aid: 0
    components:
      - sid: 0
        position: [0, 0, 10]

optical_trains:
  - surface_position:
      position: [0, 0, 0]
      sid: 0
      normal: [0, 1, 0]     # Surface normal vector
      # OR
      angles: [30, 45]      # [azimuth, elevation] in degrees
      dial: 90              # Optional dial rotation
```

## Optical Design Concepts

### Surface Types
- **Spherical**: Standard spherical surfaces with radius of curvature
- **Aspherical**: Complex aspherical surfaces with conic constants
- **Plane**: Flat surfaces for mirrors and beam splitters

### Materials
- **Glass Types**: Defined by refractive index (nd) and Abbe number (vd)
- **Dispersion**: Chromatic behavior across wavelengths
- **Custom Materials**: User-definable optical properties

### Ray Tracing
- **Snell's Law**: Proper refraction calculations at interfaces
- **Paraxial**: First-order optical calculations
- **Real Ray Tracing**: Exact ray paths through optical systems
- **Numerical Precision**: High-precision mathematics for optical accuracy

### System Analysis
- **Surface Normal Validation**: Ensures correct surface orientations
- **Transform Mathematics**: 4x4 homogeneous coordinate transforms
- **Position Accuracy**: Sub-micron positioning precision
- **Angular Precision**: Arc-second level angular accuracy

## Development Workflow

### Interactive Runner (Recommended)
```bash
npm start           # Interactive menu with options
```

The interactive runner provides:
- **🧪 Ground Truth Tests**: Run console validation tests
- **🌐 Development Server**: Start the browser-based application  
- **🏗️ Build**: Create production build
- **🔍 Lint**: Check code quality
- Easy switching between modes without retyping commands

### Manual Commands
1. **Write/Modify Code**: Make changes to optical system implementation
2. **Run Console Tests**: `npm run test` to validate against ground truth
3. **Fix Issues**: Use detailed console output to identify and fix problems
4. **Verify in Browser**: Only after console tests pass, check browser for visual confirmation
5. **Iterate**: Repeat until all tests pass with required precision

## Performance Considerations

- **Ray Tracing**: Computationally intensive - user controls limit ray count
- **Numerical Precision**: Double-precision mathematics throughout
- **Transform Caching**: Efficient matrix calculations for real-time rendering
- **Memory Management**: Optimized for large optical systems

## Code Style Guidelines

- **TypeScript**: Extensive use of types and interfaces for optical concepts
- **Type Imports**: Use `import type { }` for type-only imports
- **Naming**: Descriptive variable names reflecting optical terminology
- **Comments**: Document optical engineering concepts and mathematics
- **Dark Theme**: Consistent dark UI optimized for extended design work

## Contributing

When adding new features:

1. **Add TypeScript Types**: Proper interfaces for all optical concepts
2. **Include Error Handling**: Robust error handling for optical calculations  
3. **Update YAML Schema**: Extend system definition format as needed
4. **Maintain Separation**: Keep optical engine separate from UI components
5. **Focus on Optical Engineering**: Prioritize optical workflows over graphics
6. **Validate with Ground Truth**: Ensure new features pass console validation

## Optical Engineering Focus

This is specifically designed for **optical engineering** applications:
- Lens design and optimization
- Optical system analysis and tolerancing  
- Ray fan analysis and aberration studies
- Sequential and non-sequential ray tracing
- Precision optical component positioning
- Professional optical design workflows

**Not suitable for**: Computer graphics ray tracing, game rendering, or artistic visualization.

## Current Development Status

✅ **Ground Truth Validation Complete**: All 16 surfaces across 2 test suites pass validation with ±1e-4 numerical precision.

✅ **Visualization Corner Accuracy Fixed**: Surface mesh generation now uses identical dial rotation methodology as test validation, ensuring rendered surfaces exactly match calculated corners.

**Recent Achievement**: Successfully resolved dial rotation coordinate system bug through systematic investigation:
- **Problem**: Dial rotation worked only for surface normal [-1,0,0], failed for other orientations
- **Root Cause**: Incorrect application of dial rotation to coordinate transformation matrix instead of position-to-corner vectors  
- **Solution**: Implemented proper Rodrigues rotation methodology - transform corners without dial, then rotate position-to-corner vectors around world normal
- **Validation**: Mathematical verification confirmed Rodrigues formula correctness; issue was coordinate system application
- **Lesson**: Demonstrates importance of systematic investigation over rushed conclusions

**Visualization Enhancement**: Fixed mesh generation to match test validation corner calculation:
- **Problem**: Visualization used post-dial transform matrix while test validation correctly separated dial rotation
- **Root Cause**: `SurfaceRenderer.generatePlanarMesh` applied dial rotation via transform matrix instead of Rodrigues rotation
- **Solution**: Updated both circular and rectangular mesh generation to use same Rodrigues rotation methodology as test validation
- **Verification**: Debug script confirmed perfect corner correspondence (0.000e+0 difference) between mesh generation and test validation
- **Impact**: Rendered optical surfaces now accurately represent the mathematically correct corner positions

**Test Coverage**: 
- Surface positioning and normal calculations: ✅ 100% accuracy
- Dial rotation mechanics: ✅ 100% accuracy  
- Assembly coordinate transforms: ✅ 100% accuracy
- Corner generation geometry: ✅ 100% accuracy

The project demonstrates robust optical engineering mathematics with comprehensive validation against reference implementation.

## 🔧 Debugging Guide: Browser vs Terminal Coordinate Mismatch

### Problem Identification
If you encounter a situation where:
- ✅ Terminal validation tests pass perfectly
- ❌ Browser visualization shows incorrect surface positions/rotations
- 🔍 Console shows coordinates that don't match terminal calculations

### Root Cause Analysis Framework

**Step 1: Check for Old Compiled JavaScript Files**
```bash
# Look for stale .js files that might be shadowing .ts files
find src/ -name "*.js" -type f
```

**Critical Files to Check:**
- `src/optical/surfaces.js` (shadows `surfaces.ts`)
- `src/math/Matrix4.js` (shadows `Matrix4.ts`) 
- `src/math/Vector3.js` (shadows `Vector3.ts`)

**Step 2: Enable Comprehensive Debug Logging**
The codebase includes detailed PLOT VISUALIZATION OPERATIONS logging:

```typescript
// In surfaces.ts - Assembly processing pipeline
console.log('=== PLOT VISUALIZATION OPERATIONS START ===');
// ... detailed assembly transformation logging

// In SurfaceRenderer.generatePlanarMesh - Mesh generation
console.log('--- PLOT VISUALIZATION OPERATIONS: Corner X Mesh Generation ---');
// ... step-by-step coordinate transformation logging
```

**Step 3: Compare Browser vs Terminal Coordinates**
Use the debug scripts to validate terminal calculations:
```bash
node debug-dial-comparison.ts  # Terminal coordinate validation
```

Then check browser console for PLOT VISUALIZATION OPERATIONS logs to compare.

### Solution: Remove Stale JavaScript Files

**Problem**: Vite can load old compiled `.js` files instead of updated `.ts` files, causing the browser to use outdated coordinate calculation logic.

**Solution**:
```bash
# Remove old compiled JavaScript files to force Vite to use TypeScript
Remove-Item "src\optical\surfaces.js" -Force
Remove-Item "src\math\Matrix4.js" -Force  
Remove-Item "src\math\Vector3.js" -Force
```

**Verification**: After removal, refresh browser and check that:
1. PLOT VISUALIZATION OPERATIONS logs appear in console
2. Calculated coordinates match terminal validation exactly
3. Visualization displays correctly

### 📋 Recent Case Study (December 2024)

**Issue**: Browser showed s2 corner 1 at `[34.724391, -4.891644, -58.190121]` while terminal validation calculated `[5.761732, 25.325679, -57.019363]`

**Investigation Process**:
1. ✅ Added comprehensive assembly operation logging
2. ✅ Enhanced mesh generation step-by-step debugging  
3. ✅ Confirmed terminal validation was correct
4. 🔍 Discovered browser was using `surfaces.js` instead of `surfaces.ts`
5. ✅ Removed stale JavaScript files
6. ✅ Browser coordinates immediately matched terminal: `[5.761732, 25.325679, -57.019363]`

**Key Lesson**: Always check for stale compiled files when browser behavior doesn't match terminal validation, especially after significant TypeScript updates.

**Prevention**: The debug logging infrastructure now provides immediate visibility into coordinate calculation discrepancies, making future issues easier to diagnose.
