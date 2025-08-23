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
- Hot update is enabled, so no need to ask me run dev or build every time.

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
- When interacting with terminal commands, do not connect multiple commands with `&&` or `;`. Instead, run each command separately to ensure clarity and avoid confusion. When you plan to run multiple commands, tell me in advance so I can run them one by one.
-Once the browser is alive, hot reload should be working, so dont worry about npm run dev or npm run build unless you have a good reason (e.g. you are adding a new dependency or changing the build config or suspect some changes may result in build error.).

## Git
- You do no have the permission to interact with Git commands.

## Optical Design Concepts
- **Surfaces**: Spherical, aspherical, plane surfaces with curvature and position
- **Materials**: Glass types with refractive index and Abbe number
- **Ray tracing**: Snell's law, paraxial calculations, real ray tracing
- **System definition**: YAML format for lens prescriptions
- **Analysis**: Spot diagrams, ray fans, aberration analysis

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
