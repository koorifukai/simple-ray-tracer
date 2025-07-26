# Surface Geometry Tests

This test suite verifies that optical surface transformations maintain proper geometric relationships according to EUREKA methodology and optical engineering principles.

## Test Categories

### 1. Corner-Normal Consistency
Tests that origin-to-corner vectors maintain perpendicularity with surface normal:
- **Plano Rectangular**: 4 actual corners at height/width boundaries
- **Spherical**: 4 corners of tangential square encircling sphere at origin
- **Cylindrical**: 4 corners of bounding rectangle
- Verifies: `(Origin → Corner) ⊥ Normal` for all surface types
- Accounts for dial rotation effects on corner positions

### 2. Dial Edge Alignment
Tests dial rotation at cardinal angles (0°, 90°, 180°, 270°):
- **Rule**: Exactly 2 edges must be parallel to XY plane at these angles
- **Independence**: Applies regardless of normal direction
- **Coverage**: Tests all normal directions with cardinal dial angles
- **Purpose**: Ensures proper optical alignment in mounting systems

### 3. Normal Invariance with Dial Effects
Tests separation of normal direction from dial rotation:
- **Normal Preservation**: Normal vector unchanged by dial rotation
- **Corner Transformation**: Origin-to-corner vectors affected by dial
- **Relationship Maintenance**: Perpendicularity preserved through rotation
- **Angular Coverage**: Tests multiple dial angles (0°, 30°, 45°, 90°, 180°)

## Test Geometry

### Surface Corners (C1-C4) Definition

**Plano Rectangular Surfaces:**
- 4 actual corners defined by height and width dimensions
- Corners form the physical boundary of the rectangular surface

**Spherical Surfaces:**
- 4 corners of the smallest square that encircles the sphere
- When viewed from normal direction: sphere appears as circle, square encircles it
- When viewed from side: all 4 corners and origin lie on the same plane
- Square is positioned at the origin (surface center)

**Cylindrical Surfaces:**
- 4 corners form the rectangle connecting the cylinder's extremities
- Rectangle defines the tangential boundary of the cylindrical surface

```
C4 -------- C3  (Top edge)
|            |
|   Surface  |  <- Origin at center
|   Center   |
|            |
C1 -------- C2  (Bottom edge)
```

### Key Relationships Tested

1. **Corner-Normal Perpendicularity**: `(Origin → Ci) ⊥ Normal` for all corners
   - Origin-to-corner vectors must be perpendicular to surface normal
   - This relationship affected by dial rotation (corners rotate, normal doesn't)

2. **Dial Edge Alignment**: At dial = 0°, 90°, 180°, 270°
   - Exactly 2 edges must be parallel to XY plane
   - Applies regardless of normal direction
   - Critical for proper optical alignment

3. **Normal Invariance**: Dial rotation preserves normal direction
   - Normal vector unchanged by dial rotation
   - Only corner positions affected by dial rotation

## Running Tests

### From Code
```typescript
import { runSurfaceTests } from './optical/SurfaceGeometryTests';
const results = runSurfaceTests();
```

### From Browser Console
```javascript
// After loading the application
runSurfaceTests();
```

### From Test Runner
```typescript
import './runTests'; // Automatically runs tests
```

## Test Results

Each test returns:
- `name`: Descriptive test name
- `passed`: Boolean pass/fail status
- `message`: Human-readable result
- `tolerance`: Numerical tolerance used
- `actual`/`expected`: Numerical values for debugging

## Tolerance

All tests use tolerance `1e-6` for floating-point comparisons.

## Future Test Additions

The test framework is designed to be extensible. Planned additions:
- Assembly surface tests
- Complex dial + normal combinations
- Stress tests with extreme angles
- Performance benchmarks
- Ray-surface intersection validation
