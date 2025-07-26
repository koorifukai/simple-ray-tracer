<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Optical Design Ray Tracer Project Instructions

This is a TypeScript/React optical design application built with Vite. This is for **optical engineering ray tracing** (lens design, optical systems), not computer graphics ray tracing. When working on this project, please follow these guidelines:

## Project Structure
- `src/math/` - Vector mathematics and linear algebra utilities for optical calculations
- `src/optical/` - Core optical ray tracing engine (surfaces, materials, ray propagation)
- `src/visualization/` - Plotly.js visualization for optical systems and ray diagrams
- `src/components/` - React UI components (YAML editor, controls)
- `src/styles/` - Dark theme CSS for optical design work

## Key Technologies
- React + TypeScript for the frontend
- Vite for build tooling
- Monaco Editor for YAML editing
- YAML for optical system definition
- Plotly.js for 3D optical system visualization
- Custom optical ray tracing mathematics

## UI Layout (T-shaped)
- **Top**: Menu bar with import/export, ray trace controls
- **Left**: YAML editor for optical system definition
- **Right**: Plotly.js 3D visualization of optical system
- **Bottom** (future): Spot diagrams, sequential design tables

## Code Style Guidelines
- Use TypeScript types and interfaces extensively
- Use proper type imports (`import type { }`) for type-only imports
- Dark theme throughout (optical design preference)
- Descriptive variable names for optical concepts (surfaces, rays, materials)

## Optical Design Concepts
- **Surfaces**: Spherical, aspherical, plane surfaces with curvature and position
- **Materials**: Glass types with refractive index and Abbe number
- **Ray tracing**: Snell's law, paraxial calculations, real ray tracing
- **System definition**: YAML format for lens prescriptions
- **Analysis**: Spot diagrams, ray fans, aberration analysis

## YAML System Format
```yaml
name: "System Name"
surfaces:
  - id: "surface1"
    type: "spherical"
    radius: 20.0
    position: [0, 0, 10]
    material: "BK7"
materials:
  BK7:
    nd: 1.5168
    vd: 64.17
```

## Performance Considerations
- Optical ray tracing can be computationally intensive
- Provide user controls for number of rays traced
- Consider numerical precision for optical calculations

## When adding new features:
1. Add proper TypeScript types for optical concepts
2. Include error handling for optical calculations
3. Update the YAML schema as needed
4. Maintain separation between optical engine and UI
5. Focus on optical engineering workflows, not computer graphics
