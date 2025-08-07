# Numerical ID System - Implementation Guide

## Overview

The numerical ID system provides a unified way to identify optical surfaces across the entire ray tracing application. This document explains the implementation and usage patterns.

## System Architecture

### Core Components

1. **Surface Creation** (`OpticalSurfaceFactory`)
   - Assigns sequential numerical IDs (0, 1, 2, 3...) during system build
   - Maintains build order consistency across assemblies and standalone surfaces

2. **Intersection Collection** (`RayIntersectionCollector`)
   - Uses numerical IDs as primary storage keys
   - Provides dual lookup (numerical ID + string ID fallback)
   - Maintains surface insertion order for consistent display

3. **UI Integration** (`OpticalDesignApp`)
   - Uses numerical IDs for surface selection
   - Provides smart monitoring with automatic frequency reduction
   - Resets state properly on YAML changes

4. **Visualization** (`IntersectionPlot`)
   - Handles numerical ID to surface mapping
   - Falls back to YAML lookup when intersection data unavailable

## Usage Patterns

### Surface Identification

```typescript
// Primary: Use numerical ID when available
const surfaceId = surface.numericalId?.toString() || surface.id;

// Lookup: Try numerical ID first, fall back to string ID
const surfaceData = collector.getSurfaceIntersectionData(surfaceId);
```

### State Management

```typescript
// Always reset intersection trigger on YAML changes
setIntersectionDataTrigger(0);

// Clear intersection data
collector.clearData();

// Reset selected surface
setSelectedSurface('');
```

### Monitoring Pattern

```typescript
// Smart monitoring with frequency reduction
useEffect(() => {
  if (analysisType === 'Ray Hit Map' || analysisType === 'Spot Diagram') {
    let checkCount = 0;
    let lastCount = 0;
    
    const checkInterval = setInterval(() => {
      const surfaces = collector.getAvailableSurfaces();
      
      // Only update on actual changes
      if (surfaces.length !== lastCount && surfaces.length > 0) {
        lastCount = surfaces.length;
        setIntersectionDataTrigger(prev => prev + 1);
      }
      
      // Reduce frequency after stabilization
      if (surfaces.length > 0 && checkCount > 3) {
        clearInterval(checkInterval);
        // Switch to slower monitoring...
      }
    }, 500);
    
    return () => clearInterval(checkInterval);
  }
}, [analysisType, refreshTrigger]); // Include refreshTrigger for reset
```

## Performance Considerations

### Caching Strategy

The `RayIntersectionCollector` implements intelligent caching:

```typescript
// Cache surface list to avoid repeated array operations
private cachedSurfaceList: SurfaceList | null = null;

// Only rebuild when data actually changes
if (currentCount === cachedCount && currentIntersections === cachedIntersections) {
  return cachedSurfaceList;
}
```

### Monitoring Optimization

- Start with 500ms intervals for responsive feedback
- Reduce to 2000ms after data stabilizes
- Timeout after 20 attempts (10 seconds) if no data
- Reset completely on YAML changes

## Error Handling

### Surface Lookup Failures

```typescript
// Always check for null results
const surfaceData = collector.getSurfaceIntersectionData(surfaceId);
if (!surfaceData) {
  console.warn(`Surface ${surfaceId} not found`);
  return;
}
```

### YAML State Coordination

```typescript
// Handle transition periods where intersection data is clearing
if (isNumericalId && !intersectionData) {
  // Wait for ray tracing completion instead of failing to YAML
  return [];
}
```

## Best Practices

1. **Always use numerical IDs as primary reference**
2. **Include refreshTrigger in useEffect dependencies**
3. **Reset intersection trigger on all YAML operations**
4. **Cache expensive operations in collectors**
5. **Provide fallback lookup strategies**
6. **Handle timing coordination between async operations**

## Debugging Tips

### Surface Lookup Issues

```typescript
console.log('🔍 Available surface keys:', Array.from(surfaces.keys()));
console.log('🔍 Looking for surface:', surfaceId);
console.log('🔍 Is numerical ID:', /^\d+$/.test(surfaceId));
```

### State Coordination Issues

```typescript
console.log('🔄 Intersection trigger:', intersectionDataTrigger);
console.log('🔄 Refresh trigger:', refreshTrigger);
console.log('🔄 Selected surface:', selectedSurface);
console.log('🔄 Available surfaces count:', availableSurfaces.length);
```

## Future Enhancements

1. **Enhanced error boundaries** for surface lookup failures
2. **Performance metrics** collection and display
3. **Configuration management** for monitoring intervals
4. **Unit testing** for numerical ID system
5. **TypeScript strict mode** compliance
