# Simple Ray Tracer

A TypeScript/React optical design application for **optical engineering ray tracing** (lens design, optical systems). This tool implements classical ray tracing methodology for professional optical design workflows.

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

## Chapter 2: How to Use - Three Optical System Tutorials

### **Tutorial 1: Cassegrain Telescope - Basic System Structure**

![Cassegrain Telescope Ray Tracing](Cassegrain%20tutorial.png)

The Cassegrain telescope example (`examples/cassegrain.yml`) demonstrates fundamental optical system structure with assemblies, surfaces, light sources, and optical trains.

**Key Learning Points:**
- **Assembly Structure**: How to group related surfaces (primary/secondary mirrors)
- **Surface Parameters**: Understanding radius, semidia, and optical modes
- **Beam Splitting**: Creating dual-path optical systems
- **Global Positioning**: Placing assemblies in 3D space
- **Basic YAML Structure**: Complete system definition format

**Key Components:**
```yaml
assemblies:
  - aid: 0  # Cassegrain telescope
    m1: {relative: 0, normal: [-1,0,0], shape: spherical, radius: -834.78, semidia: 100, mode: reflection}
    m2: {relative: -300, normal: [1,0,0], shape: spherical, radius: 317.65, semidia: 30, mode: reflection}
  - aid: 1  # Beam splitter  
    s1: {relative: 0, normal: [-1,0,0], shape: plano, height: 30, width: 30, mode: partial, transmission: 0.5, n2: 1.5}

light_sources:
  - l1: {lid: 0, position: [0,5,0], vector: [1,0,0], number: 25, wavelength: 488, type: ring, param: 80}

optical_trains:
  - light: {lid: 0}
    cassegrain: {aid: 0, position: [350,0,0], normal: [-1,0,0]}
    beam_spliter: {aid: 1, position: [400,0,0], normal: [-1,0,1]}
    detector_1: {sid: 0, position: [475,0,0], normal: [-1,0,0]}
    detector_2: {sid: 1, position: [400,0,75], normal: [0,0,-1]}
```

This example teaches basic system architecture: how assemblies group surfaces, how optical trains define light paths, and how beam splitters create multiple detection paths.

### **Tutorial 2: Light Sources - Multiple Ray Patterns**

![Light Sources Tutorial](Lights%20tutorial.png)

The light sources example (`examples/light_sources.yml`) demonstrates the four different ray pattern types available in Simple Ray Tracer. This tutorial shows how to create and position multiple light sources with different characteristics.

**Key Learning Points:**
- **Multiple Light Sources**: How to define several light sources in one system
- **Ray Pattern Types**: Ring, linear, uniform, and point source patterns
- **Direction Specification**: Using both `vector: [x,y,z]` and `angles: [azimuth,elevation]` formats
- **Wavelength Control**: Different colors (488nm blue, 532nm green, 589nm yellow, 633nm red)
- **Ray Density**: Controlling the number of rays per source for performance vs quality

**Example Setup:**
```yaml
light_sources:
  - ring:      # Circular ring pattern at 488nm (blue). Param contains radius, aspect ratio, rotation
      {lid: 0, position: [0,-5,-5], vector: [1,0,0], number: 25, wavelength: 488, type: ring, param: [10,0.5,30]}
  - linear:    # Linear array at 532nm (green) using angles. Param contains width, rotation
      {lid: 1, position: [0,-5,5], angles: [90,-45], number: 5, wavelength: 532, type: linear, param: [10,45]}
  - uniform:   # Uniform circular distribution at 589nm (yellow). Param contains radius
      {lid: 2, position: [0,15,-5], vector: [1,1,1], number: 25, wavelength: 589, type: uniform, param: 5}
  - point:     # Point source with divergence at 633nm (red). Param contains half-angle divergence (radian)
      {lid: 3, position: [-10,5,5], vector: [-1,0,1], number: 25, wavelength: 633, type: point, param: 0.2}
```

This example is perfect for understanding how different light sources create distinct ray patterns and how wavelength affects visualization with color-coded rays.

### **Tutorial 3: Amici Prism - Relative Positioning & Dial Rotation**

![Amici Prism Tutorial](Amici%20tutorial.png)

The Amici prism example (`examples/amici.yml`) demonstrates advanced surface positioning using relative coordinates and dial rotation. This tutorial showcases how to build complex optical assemblies where surfaces are positioned relative to each other.

**Key Learning Points:**
- **Relative Positioning**: Using `relative: [x,y,z]` for surface placement within assemblies
- **Dial Rotation**: Using `dial: angle` to rotate surfaces around their normal vectors
- **Complex Surface Normals**: Non-axis-aligned surface orientations like `[-0.7071,-1,-0.7071]`
- **Assembly Coordination**: How multiple surfaces work together in a single assembly
- **Prism Optics**: Total internal reflection and refraction through angled surfaces

**Key Surface Definitions:**
```yaml
assemblies:
  - aid: 0
    s1:  # Entrance surface
      {relative: [0,0,5], shape: plano, height: 60, width: 50, mode: refraction, n2: 1.517}
    s2:  # First reflection surface with dial rotation
      {relative: [24.99999,12.5,-5], shape: plano, height: 70.71068, width: 35.35534, 
       mode: reflection, normal: [-0.7071,-1,-0.7071], dial: 35.25}
    s3:  # Second reflection surface with opposite dial
      {relative: [0, -25,0], shape: plano, height: 70.71068, width: 35.35534, 
       mode: reflection, normal: [-0.7071,1,-0.7071], dial: -35.25}
```

**Assembly Positioning with Dial:**
```yaml
optical_trains:
  - a: {lid: 0}    # Light source
    b: {aid: 0, position: [20,0,0], angles: [0,0], dial: 30}  # Rotated assembly
```

This example demonstrates how `dial` rotation affects the entire assembly orientation, and how `relative` positioning creates precise geometric relationships between surfaces within the assembly.

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
