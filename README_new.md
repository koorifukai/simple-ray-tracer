# Simple Ray Tracer

A TypeScript/React optical design application for **optical engineering ray tracing** (lens design, optical systems). This tool implements classical ray tracing methodology for professional optical design workflows.

![Cassegrain Telescope Ray Tracing](Cassegrain%20tutorial.png)

---

## Chapter 1: Quick Start

### 🌐 **Try Online (Recommended)**
Visit the live application: **[simple-ray-tracer.github.io](https://simple-ray-tracer.github.io)**

### 💻 **Local Development**
```bash
# Clone and install
git clone https://github.com/koorifukai/simple_ray_tracer.github.io.git
cd simple_ray_tracer
npm install

# Interactive menu (Windows)
npm start            # Uses run.bat for interactive menu

# Interactive menu (Cross-platform)  
npm run start:node   # Uses run.mjs for interactive menu

# Direct commands
npm run dev          # Start development server at http://localhost:5174
npm run test         # Run ground truth validation tests from console
```

---

## Chapter 2: How to Use - Cassegrain Telescope Tutorial

This tutorial walks through the complete Cassegrain telescope example (`examples/cassegrain.yml`), explaining every line and parameter.

### **Complete Example File**

```yaml
display_settings:
  fill_with_grey: False
  show_grid: True
assemblies:
  - aid: 0
    #1600 mm cassegrain
    m1: 
      {relative: 0, normal: [-1,0,0], shape: spherical, radius: -834.78, semidia: 100, mode: reflection}
    m2:
      {relative: -300, normal: [1,0,0],  shape: spherical, radius: 317.65,  semidia: 30,  mode: reflection}

  - aid: 1
    #beam splitter
    s1: 
      {relative: 0, normal: [-1,0,0], shape: plano, height: 30, width: 30, mode: partial, transmission: 0.5, n2: 1.5}
    s2:
      {relative: 3, normal: [-1,0,0], shape: plano, height: 30, width: 30, mode: refraction, n1: 1.5}
surfaces:
  - s1:
      {sid: 0, shape: plano, height: 20, width: 20, mode: absorption}
  - s2:
      {sid: 1, shape: plano, height: 20, width: 20, mode: absorption}    
light_sources:
  - l1:
      {lid: 0, position: [0,5,0], vector: [1,0,0], number: 25, wavelength: 488, type: ring, param: 80}
optical_trains:
  - light: 
     {lid: 0}
    cassegrain: 
     {aid: 0, position: [350,0,0], normal: [-1,0,0]}
    beam_spliter: 
     {aid: 1, position: [400,0,0], normal: [-1,0,1]}
    detector_1:
     {sid: 0, position: [475,0,0], normal: [-1,0,0]}
    detector_2:
     {sid: 1, position: [400,0,75], normal: [0,0,-1]}
```

### **Line-by-Line Explanation**

#### **Display Settings Section**
```yaml
display_settings:
  fill_with_grey: False          # Don't fill surface interiors with grey color
  show_grid: True                # Show 3D coordinate grid for reference
```
Controls the 3D visualization appearance. These settings affect only the visual display, not the ray tracing calculations.

#### **Assemblies Section - Cassegrain Telescope**
```yaml
assemblies:
  - aid: 0                       # Assembly ID 0 for the Cassegrain telescope
    #1600 mm cassegrain          # Comment: This is a 1600mm focal length telescope
    m1:                          # Primary mirror (M1) - the large concave mirror
      {relative: 0, normal: [-1,0,0], shape: spherical, radius: -834.78, semidia: 100, mode: reflection}
```
**Primary Mirror (m1) Parameters:**
- `relative: 0` - Position at assembly origin (0mm from assembly center)
- `normal: [-1,0,0]` - Surface normal points in -X direction (left)
- `shape: spherical` - Standard spherical mirror surface
- `radius: -834.78` - Radius of curvature in mm (negative = concave surface)
- `semidia: 100` - Semi-diameter in mm (aperture radius = 100mm, diameter = 200mm)
- `mode: reflection` - Mirror surface (reflects light)

```yaml
    m2:                          # Secondary mirror (M2) - the small convex mirror
      {relative: -300, normal: [1,0,0],  shape: spherical, radius: 317.65,  semidia: 30,  mode: reflection}
```
**Secondary Mirror (m2) Parameters:**
- `relative: -300` - Position 300mm in front of primary mirror (-300mm along assembly X-axis)
- `normal: [1,0,0]` - Surface normal points in +X direction (right, towards primary)
- `shape: spherical` - Standard spherical mirror surface
- `radius: 317.65` - Radius of curvature in mm (positive = convex surface)
- `semidia: 30` - Semi-diameter in mm (aperture radius = 30mm, diameter = 60mm)
- `mode: reflection` - Mirror surface (reflects light)

#### **Assemblies Section - Beam Splitter**
```yaml
  - aid: 1                       # Assembly ID 1 for the beam splitter
    #beam splitter               # Comment: Optical beam splitter for dual detection
    s1:                          # First surface of beam splitter (entrance)
      {relative: 0, normal: [-1,0,0], shape: plano, height: 30, width: 30, mode: partial, transmission: 0.5, n2: 1.5}
```
**Beam Splitter Surface 1 (s1) Parameters:**
- `relative: 0` - Position at assembly origin
- `normal: [-1,0,0]` - Surface normal points in -X direction (towards incoming light)
- `shape: plano` - Flat surface (not curved)
- `height: 30, width: 30` - Surface dimensions 30mm × 30mm
- `mode: partial` - Partially reflecting surface (beam splitter)
- `transmission: 0.5` - 50% of light transmits through, 50% reflects
- `n2: 1.5` - Refractive index of glass material

```yaml
    s2:                          # Second surface of beam splitter (exit)
      {relative: 3, normal: [-1,0,0], shape: plano, height: 30, width: 30, mode: refraction, n1: 1.5}
```
**Beam Splitter Surface 2 (s2) Parameters:**
- `relative: 3` - Position 3mm behind first surface (glass thickness)
- `normal: [-1,0,0]` - Surface normal points in -X direction
- `shape: plano` - Flat surface
- `height: 30, width: 30` - Surface dimensions 30mm × 30mm
- `mode: refraction` - Pure refraction (no reflection)
- `n1: 1.5` - Refractive index of glass (light exiting from glass to air)

#### **Individual Surfaces Section - Detectors**
```yaml
surfaces:
  - s1:                          # Detector surface 1
      {sid: 0, shape: plano, height: 20, width: 20, mode: absorption}
```
**Detector 1 (s1) Parameters:**
- `sid: 0` - Surface ID 0 for reference in optical trains
- `shape: plano` - Flat detector surface
- `height: 20, width: 20` - Detector area 20mm × 20mm
- `mode: absorption` - Light-absorbing surface (detector)

```yaml
  - s2:                          # Detector surface 2
      {sid: 1, shape: plano, height: 20, width: 20, mode: absorption}
```
**Detector 2 (s2) Parameters:**
- `sid: 1` - Surface ID 1 for reference in optical trains
- Same parameters as detector 1

#### **Light Sources Section**
```yaml
light_sources:
  - l1:                          # Light source definition
      {lid: 0, position: [0,5,0], vector: [1,0,0], number: 25, wavelength: 488, type: ring, param: 80}
```
**Light Source (l1) Parameters:**
- `lid: 0` - Light source ID 0 for reference in optical trains
- `position: [0,5,0]` - Source position at [X=0, Y=5, Z=0] mm (slightly off-axis)
- `vector: [1,0,0]` - Light travels in +X direction (left to right)
- `number: 25` - Generate 25 rays for tracing
- `wavelength: 488` - Blue light at 488 nanometers
- `type: ring` - Ring pattern of rays (circular distribution)
- `param: 80` - Ring radius parameter (80mm radius)

#### **Optical Trains Section - Light Path Definition**
```yaml
optical_trains:
  - light:                       # Start of optical path
     {lid: 0}                    # Begin with light source ID 0
```
**Path Element 1:** Start with light source l1

```yaml
    cassegrain:                  # Cassegrain telescope assembly
     {aid: 0, position: [350,0,0], normal: [-1,0,0]}
```
**Path Element 2:** Cassegrain telescope
- `aid: 0` - Use assembly ID 0 (the Cassegrain telescope)
- `position: [350,0,0]` - Place assembly at global position [350, 0, 0] mm
- `normal: [-1,0,0]` - Assembly orientation (facing -X direction)

```yaml
    beam_spliter:                # Beam splitter assembly
     {aid: 1, position: [400,0,0], normal: [-1,0,1]}
```
**Path Element 3:** Beam splitter
- `aid: 1` - Use assembly ID 1 (the beam splitter)
- `position: [400,0,0]` - Place assembly at global position [400, 0, 0] mm
- `normal: [-1,0,1]` - Assembly orientation (angled for beam splitting)

```yaml
    detector_1:                  # Primary detector (transmitted beam)
     {sid: 0, position: [475,0,0], normal: [-1,0,0]}
```
**Path Element 4:** First detector
- `sid: 0` - Use surface ID 0 (detector 1)
- `position: [475,0,0]` - Place detector at global position [475, 0, 0] mm
- `normal: [-1,0,0]` - Detector facing -X direction (towards incoming light)

```yaml
    detector_2:                  # Secondary detector (reflected beam)
     {sid: 1, position: [400,0,75], normal: [0,0,-1]}
```
**Path Element 5:** Second detector
- `sid: 1` - Use surface ID 1 (detector 2)
- `position: [400,0,75]` - Place detector at global position [400, 0, 75] mm
- `normal: [0,0,-1]` - Detector facing -Z direction (looking down at reflected beam)

### **Parameter Reference Guide**

#### **Position and Orientation**
- **`position: [X,Y,Z]`** - 3D coordinates in millimeters, global coordinate system
- **`normal: [X,Y,Z]`** - Unit vector defining surface orientation
- **`relative: distance`** - Position within assembly relative to assembly origin
- **`dial: angle`** - Rotation around surface normal in degrees (optional)

#### **Surface Geometry**
- **`shape: spherical`** - Curved surface with radius of curvature
- **`shape: plano`** - Flat surface
- **`radius: value`** - Radius of curvature in mm (negative=concave, positive=convex)
- **`semidia: value`** - Semi-diameter (aperture radius) for circular surfaces
- **`height: value, width: value`** - Dimensions for rectangular surfaces

#### **Optical Properties**
- **`mode: reflection`** - Mirror surface (reflects light)
- **`mode: refraction`** - Lens surface (refracts light using Snell's law)
- **`mode: partial`** - Beam splitter (both reflects and transmits)
- **`mode: absorption`** - Detector surface (absorbs light)
- **`transmission: value`** - Fraction of light transmitted (0.0 to 1.0)
- **`n1: value, n2: value`** - Refractive indices for material interfaces

#### **Light Source Parameters**
- **`type: ring`** - Circular ring pattern of rays
- **`type: linear`** - Linear array of rays
- **`type: point`** - Point source with optional divergence
- **`param: value`** - Pattern-specific parameter (radius, width, etc.)
- **`number: count`** - Number of rays to generate
- **`wavelength: value`** - Wavelength in nanometers

#### **Assembly and Train Structure**
- **`aid: number`** - Assembly identifier for grouping surfaces
- **`sid: number`** - Surface identifier for individual surfaces
- **`lid: number`** - Light source identifier
- **Optical trains define the complete light path through the system**

---

## Chapter 3: Technical Summary

### **🔬 Core Ray Tracing Engine**
Implements **classical 1960s optical design methodology** using transform-to-local approach:

1. **Transform ray to surface local coordinates** using precomputed 4x4 matrices
2. **Calculate intersection** in standardized local space 
3. **Apply optical physics** (Snell's law, reflection laws)
4. **Transform result back to global coordinates**

**Performance**: ~3000 rays/second with Float64Array precision and 1e-10 tolerance.

### **⚙️ Surface Mathematics**
**EUREKA upright rotation methodology** for surface positioning:
- Two-step rotation process for proper normal alignment
- Rodrigues rotation formula for dial rotations
- Matrix precomputation eliminates expensive inverse() calls during ray tracing

### **🎨 3D Visualization**
**Plotly.js integration** with mesh generation:
- Triangulated surfaces using same mathematics as ray tracing
- Real-time updates responding to YAML changes
- Camera persistence across system updates

### **📝 YAML System Definition**
Professional optical design format supporting:
- **Assemblies**: Complex optical components with local coordinate systems
- **Individual Surfaces**: Standalone optical elements (detectors, mirrors)
- **Light Sources**: Multiple ray pattern types (ring, linear, point)
- **Optical Trains**: Complete light path definitions through the system

### **🧮 Mathematical Foundation**
- **4x4 Homogeneous Coordinates**: Points `[x,y,z,1]`, vectors `[x,y,z,0]`
- **Float64Array Precision**: Double precision for optical accuracy
- **Matrix Operations**: Proper multiplication, inversion, and transforms
- **Coordinate Systems**: Global → Assembly → Surface → Local transformation chain

### **🧪 Validation Framework**
Ground truth validation against reference optical design software:
- Corner position validation with 1e-6 tolerance
- 16/16 surfaces passing validation across multiple test systems
- Matrix mathematics verified against analytical solutions

### **Key Technologies**
- **React + TypeScript** for type-safe optical component definitions
- **Vite** for fast development and building
- **Monaco Editor** for professional YAML editing experience
- **Plotly.js** for interactive 3D optical system visualization
- **Custom mathematics** optimized for optical engineering precision

### **Optical Engineering Focus**
Designed specifically for **optical engineering ray tracing**:
- Lens design and analysis workflows
- Professional optical system specifications
- Snell's law and proper refractive optics
- Manufacturing-compatible precision and tolerances
- Industry-standard YAML format for system definition

**Not suitable for**: Computer graphics ray tracing, game rendering, or artistic visualization.

---

## Chapter 4: Future Roadmap

### **📊 Sequential Design Enhancements**
**Professional optical design table interface** (similar to ZEMAX/Code V):
- Excel-like surface parameter editing with real-time validation
- Direct YAML synchronization for seamless workflow integration
- Standard optical surface types and glass catalog integration
- Optimization variable definition for design refinement

### **📈 Analysis Tools**
**Spot diagram analysis** for optical performance evaluation:
- Geometric ray intercept patterns on detector surfaces
- RMS spot size calculations across field of view
- Multi-wavelength analysis for chromatic aberration assessment
- Statistical analysis with centroid and geometric radius calculations

**Basic aberration analysis** suite:
- Transverse ray aberration plots (ray displacement vs pupil position)
- Longitudinal aberration analysis (focus shift vs wavelength)
- Simple wavefront error visualization for image quality assessment

### **📚 Glass Catalog Integration**
**Professional optical glass database** support:
- Schott, Ohara, and CDGM catalog integration
- Refractive index and dispersion data (nd, vd values)
- Temperature coefficients and transmission data
- Custom material definition capabilities

### **🔄 Enhanced File Support**
**Improved import/export capabilities**:
- Enhanced YAML format with extended optical parameters
- CSV export for ray intercept data and system specifications
- JSON format support for web API compatibility
- PDF report generation with system diagrams and specifications

### **⚡ Basic Optimization**
**Simple optimization tools** for design improvement:
- Parameter variable definition within YAML system
- Focus optimization and spot size minimization targets
- Interactive parameter adjustment with real-time feedback
- Manual optimization with performance tracking and history

### **📐 Enhanced Ray Tracing**
**Improvements to sequential ray tracing system**:
- Multiple wavelength support (3-5 wavelengths for chromatic analysis)
- Field point analysis for off-axis optical performance
- Ray fan patterns (tangential and sagittal) for aberration studies
- Enhanced surface types: cylindrical and basic toroidal surfaces

### **💻 User Interface Enhancements**
**Modern UI/UX improvements**:
- Responsive design for mobile and tablet compatibility
- Keyboard shortcuts for common optical design operations
- Improved error messages with optical engineering context
- Progress indicators for computational ray tracing operations

**Advanced visualization features**:
- Simple ray propagation animation through optical systems
- 2D cross-sectional views alongside 3D visualization
- Interactive measurement tools for distances and angles
- Export capabilities for 3D visualizations and ray diagrams

### **🚀 Performance Optimizations**
**Computational improvements**:
- Smart ray density optimization based on surface complexity
- Enhanced caching for surface meshes and transformation matrices
- Batch ray processing for improved throughput
- Memory optimization for large optical system handling

**Data management enhancements**:
- YAML template library (doublet, triplet, telescope configurations)
- System comparison tools for design trade studies
- Simple undo/redo functionality for YAML editing
- Curated example library with validated optical systems

### **Development Priorities**
1. **Sequential design table** - Professional surface parameter editing interface
2. **Spot diagram analysis** - Essential optical performance evaluation tool
3. **Glass catalog integration** - Professional material property database
4. **Basic optimization** - Simple design improvement workflows
5. **Enhanced file support** - Improved data exchange capabilities

This roadmap focuses on **realistic sequential ray tracing enhancements** suitable for practical optical design workflows, avoiding advanced physical optics features that would require significant computational resources and complex implementation.

### **Performance Considerations**
All enhancements maintain the current system's:
- **High precision mathematics** (Float64Array throughout)
- **Real-time performance** (~3000 rays/second sustained)
- **Professional accuracy** (manufacturing-compatible tolerances)
- **Validation framework** (ground truth testing for all new features)

The goal is to evolve toward a comprehensive **sequential optical design platform** while preserving the mathematical rigor and precision that makes this tool suitable for professional optical engineering applications.
