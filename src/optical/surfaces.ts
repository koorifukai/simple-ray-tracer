/**
 * Optical surface definitions for ray tracing
 * Handles spherical, aspherical, and planar surfaces with proper transformations
 */

import { Matrix4, Vector3 } from '../math/Matrix4';

/**
 * Surface shape types supported by the ray tracer
 */
export type SurfaceShape = 'spherical' | 'aspherical' | 'plano' | 'cylindrical' | 'flat';

/**
 * Surface interaction modes (matching EUREKA methodology)
 */
export type SurfaceMode = 'inactive' | 'refraction' | 'reflection' | 'partial' | 'absorption' | 'diffuse' | 'aperture' | 'stop' | 'block' | 'reflect' | 'mirror' | 'refract';

/**
 * Basic optical surface definition
 */
export interface OpticalSurface {
  id: string;
  shape: SurfaceShape;
  mode: SurfaceMode;
  
  // Assembly information
  assemblyId?: string;     // Assembly ID (aid)
  elementIndex?: number;   // Element number within assembly
  
  // Geometric properties
  radius?: number;        // Radius of curvature (positive = convex toward +X)
  
  // Position and orientation
  position: Vector3;      // Position in 3D space
  rotation?: Vector3;     // Rotation angles (rx, ry, rz) in radians
  normal?: Vector3;       // Explicit normal direction vector
  transform: Matrix4;     // Local coordinate system transform (includes dial rotation for corners)
  normalTransform?: Matrix4; // Transform for normal calculation (excludes dial rotation)
  
  // Aperture properties
  aperture?: number;      // Circular aperture radius
  semidia?: number;       // Semi-diameter (aperture radius)
  height?: number;        // Height for rectangular apertures
  width?: number;         // Width for rectangular apertures
  
  // Optical properties
  n1?: number;           // Refractive index before surface
  n2?: number;           // Refractive index after surface
  
  // Aspherical coefficients (for aspherical surfaces)
  conic?: number;        // Conic constant (k)
  aspheric?: number[];   // Aspherical coefficients [A4, A6, A8, ...]
  
  // Visual properties for rendering
  material?: string;     // Material name for lookup
  color?: string;        // Override color for visualization
  opacity?: number;      // Transparency (0-1)
}

/**
 * Surface factory for creating optical surfaces from YAML data
 */
export class OpticalSurfaceFactory {
  
  /**
   * Create an optical surface from YAML surface definition
   */
  static createSurface(
    id: string, 
    surfaceData: any, 
    position: Vector3 = new Vector3(0, 0, 0),
    isAssemblyMember: boolean = false
  ): OpticalSurface {
    
    const surface: OpticalSurface = {
      id,
      shape: surfaceData.shape || 'spherical',
      mode: surfaceData.mode || 'refraction',
      position: position.clone(),
      transform: Matrix4.translation(position.x, position.y, position.z), // Will be updated below
      opacity: 0.3 // Default transparent white
    };

    // Geometric properties
    if (surfaceData.radius !== undefined) {
      surface.radius = surfaceData.radius;
    }
    if (surfaceData.semidia !== undefined) {
      surface.semidia = surfaceData.semidia;
    }
    if (surfaceData.height !== undefined) {
      surface.height = surfaceData.height;
    }
    if (surfaceData.width !== undefined) {
      surface.width = surfaceData.width;
    }

    // Optical properties
    if (surfaceData.n1 !== undefined) {
      surface.n1 = surfaceData.n1;
    }
    if (surfaceData.n2 !== undefined) {
      surface.n2 = surfaceData.n2;
    }

    // Normal vector (explicit direction specification or angles)
    if (surfaceData.normal && Array.isArray(surfaceData.normal)) {
      surface.normal = new Vector3(
        surfaceData.normal[0] || 0,
        surfaceData.normal[1] || 0,
        surfaceData.normal[2] || 0
      ).normalize();
    } else if (surfaceData.angles && Array.isArray(surfaceData.angles)) {
      // Convert angles to normal vector (EUREKA ang2vec equivalent)
      // angles[0]: Azimuth (rotation about Z-axis, tilts surface left/right in XY plane)
      // angles[1]: Elevation (tilts surface up/down in elevation plane)
      const azimuthRad = (surfaceData.angles[0] || 0) * Math.PI / 180;    // Rotation about Z-axis
      const elevationRad = (surfaceData.angles[1] || 0) * Math.PI / 180;  // Elevation angle
      
      // Convert spherical coordinates to Cartesian normal vector
      // Starting from default backward normal [-1,0,0]
      surface.normal = new Vector3(
        -Math.cos(elevationRad) * Math.cos(azimuthRad),  // X component
        -Math.cos(elevationRad) * Math.sin(azimuthRad),  // Y component  
        Math.sin(elevationRad)                           // Z component
      ).normalize();
    }

    // Create transformation matrix with proper orientation
    let transform = Matrix4.translation(position.x, position.y, position.z);
    
    // Apply surface orientation if normal is specified (same logic as assembly surfaces)
    if (surface.normal) {
      const targetNormal = surface.normal.normalize();
      
      // Check if we need to apply rotation (compare to default normal [-1,0,0])
      const normalDiff = Math.abs(targetNormal.x + 1) + Math.abs(targetNormal.y) + Math.abs(targetNormal.z);
      if (normalDiff > 0.001) { // Not equal to default normal [-1,0,0]
        // EUREKA upright_rot_transform: robust two-step rotation
        const defaultNormal = new Vector3(-1, 0, 0);
        const orientationMatrix = this.createUprightRotationTransform(defaultNormal, targetNormal);
        transform = transform.multiply(orientationMatrix);
      }
    }
    
    // DIAL ROTATION - Applied LAST (EUREKA methodology: dial comes after all other rotations)
    // IMPORTANT: Dial rotates corners/mesh around the normal, but the normal itself does NOT change
    // NOTE: For assembly members, dial is stored and applied later in the global placement phase
    console.log(`${id}: Checking dial - surfaceData.dial=${surfaceData.dial}, isAssemblyMember=${isAssemblyMember}`);
    
    // Store the pre-dial transform for normal calculation (dial doesn't affect normal)
    const normalTransform = transform.clone();
    
    if (surfaceData.dial !== undefined && !isAssemblyMember) {
      const dialAngleRad = surfaceData.dial * Math.PI / 180;
      
      // Store localDialAngle for GroundTruthValidator to detect dial surfaces
      (surface as any).localDialAngle = dialAngleRad;
      
      // Get the FINAL normal after all transformations (for dial axis calculation)
      // Calculate what the final normal will be using the same transform that positions the surface
      const defaultNormal = new Vector3(-1, 0, 0);
      const [finalNormalX, finalNormalY, finalNormalZ] = normalTransform.transformVector(
        defaultNormal.x, defaultNormal.y, defaultNormal.z
      );
      const finalNormal = new Vector3(finalNormalX, finalNormalY, finalNormalZ).normalize();
      
      console.log(`${id}: APPLYING standalone dial rotation ${surfaceData.dial}° about final normal axis [${finalNormal.x.toFixed(3)}, ${finalNormal.y.toFixed(3)}, ${finalNormal.z.toFixed(3)}]`);
      
      // Log transform matrix elements before dial
      const beforeMatrix = transform.elements;
      console.log(`${id}: Transform BEFORE dial: [${beforeMatrix[0].toFixed(3)}, ${beforeMatrix[1].toFixed(3)}, ${beforeMatrix[2].toFixed(3)}, ${beforeMatrix[3].toFixed(3)}] / [${beforeMatrix[4].toFixed(3)}, ${beforeMatrix[5].toFixed(3)}, ${beforeMatrix[6].toFixed(3)}, ${beforeMatrix[7].toFixed(3)}]`);
      
      // Apply dial rotation ONLY to corner/mesh transform, NOT to normal calculation
      const dialRotation = this.createRotationMatrix(finalNormal, dialAngleRad);
      transform = transform.multiply(dialRotation);
      
      // Log transform matrix elements after dial
      const afterMatrix = transform.elements;
      console.log(`${id}: Transform AFTER dial: [${afterMatrix[0].toFixed(3)}, ${afterMatrix[1].toFixed(3)}, ${afterMatrix[2].toFixed(3)}, ${afterMatrix[3].toFixed(3)}] / [${afterMatrix[4].toFixed(3)}, ${afterMatrix[5].toFixed(3)}, ${afterMatrix[6].toFixed(3)}, ${afterMatrix[7].toFixed(3)}]`);
      console.log(`${id}: Normal preserved - using pre-dial transform for normal calculation`);
    } else if (surfaceData.dial !== undefined) {
      console.log(`${id}: Dial ${surfaceData.dial}° will be applied later in assembly global placement`);
    } else {
      console.log(`${id}: No dial rotation specified`);
    }
    
    // Store BOTH transforms: post-dial for corners, pre-dial for normal
    surface.transform = transform;          // For corner calculations (includes dial)
    surface.normalTransform = normalTransform; // For normal calculations (excludes dial)

    // Aspherical properties
    if (surfaceData.conic !== undefined) {
      surface.conic = surfaceData.conic;
    }
    if (surfaceData.aspheric) {
      surface.aspheric = surfaceData.aspheric;
    }

    // Material and visual properties
    if (surfaceData.material) {
      surface.material = surfaceData.material;
    }
    
    // Set default color based on surface mode if not specified
    if (!surface.color) {
      switch (surface.mode) {
        case 'reflection':
        case 'mirror':
        case 'reflect':
          surface.color = '#C0C0C0'; // Silver for mirrors
          break;
        case 'refraction':
        case 'refract':
          surface.color = '#87CEEB'; // Sky blue for refractive surfaces
          break;
        case 'absorption':
          surface.color = '#2F2F2F'; // Dark gray for absorbers
          break;
        case 'aperture':
        case 'stop':
          surface.color = '#FFD700'; // Gold for apertures
          break;
        default:
          surface.color = '#FFFFFF'; // White for others
      }
    }

    return surface;
  }

  /**
   * Create surfaces from YAML assembly definition using "build locally then place globally" methodology
   */
  static createAssemblySurfaces(
    assemblyData: any, 
    assemblyOffset: Vector3 = new Vector3(0, 0, 0),
    assemblyNormal?: Vector3,
    assemblyId?: string,
    assemblyDial?: number
  ): OpticalSurface[] {
    
    // PLOT VISUALIZATION OPERATIONS - START (Hidden)
    // console.log(`\n=== PLOT VISUALIZATION OPERATIONS START: Assembly ${assemblyId || 'unnamed'} ===`);
    // console.log(`Assembly Configuration:`);
    console.log(`  - assemblyOffset: [${assemblyOffset.x}, ${assemblyOffset.y}, ${assemblyOffset.z}]`);
    console.log(`  - assemblyNormal: [${assemblyNormal?.x.toFixed(6)}, ${assemblyNormal?.y.toFixed(6)}, ${assemblyNormal?.z.toFixed(6)}]`);
    console.log(`  - assemblyDial: ${assemblyDial}°`);
    console.log(`  - assemblyId: ${assemblyId}`);
    
    // console.log('=== ASSEMBLY CONSTRUCTION (Build Locally Then Place Globally) ===');
    // console.log('Stage 1: Building local assembly...');
    
    // STAGE 1: BUILD LOCAL ASSEMBLY (Hidden)
    // Build the assembly in its own local coordinate system with proper relative positioning
    // console.log(`\nSTAGE 1: LOCAL ASSEMBLY BUILDING`);
    const localSurfaces = this.buildLocalAssembly(assemblyData, assemblyId);
    // console.log(`  - Built ${localSurfaces.length} surfaces in local coordinate system`);
    // localSurfaces.forEach(surface => {
    //   console.log(`    ${surface.id}: localPos=[${surface.position.x.toFixed(3)}, ${surface.position.y.toFixed(3)}, ${surface.position.z.toFixed(3)}], localDial=${(surface as any).localDialAngle ? ((surface as any).localDialAngle * 180 / Math.PI).toFixed(2) + '°' : 'none'}`);
    // });
    
    // console.log('Stage 2: Placing assembly globally...');
    
    // STAGE 2: PLACE ASSEMBLY GLOBALLY (Hidden)
    // Apply assembly-level transformations uniformly to all surfaces
    // console.log(`\nSTAGE 2: GLOBAL ASSEMBLY PLACEMENT`);
    const globalSurfaces = this.placeAssemblyGlobally(localSurfaces, assemblyOffset, assemblyNormal, assemblyDial);
    // console.log(`  - Applied global transformations to ${globalSurfaces.length} surfaces`);
    // globalSurfaces.forEach(surface => {
    //   console.log(`    ${surface.id}: globalPos=[${surface.position.x.toFixed(3)}, ${surface.position.y.toFixed(3)}, ${surface.position.z.toFixed(3)}], globalNormal=[${surface.normal?.x.toFixed(6)}, ${surface.normal?.y.toFixed(6)}, ${surface.normal?.z.toFixed(6)}]`);
    // });
    
    // console.log(`\nSTAGE 3: VISUALIZATION MESH CONNECTION PREPARATION`);
    // console.log(`  - Each surface will generate mesh via SurfaceRenderer.generatePlanarMesh()`);
    // console.log(`  - Mesh generation uses normalTransform (excludes local dial) + Rodrigues rotation`);
    // console.log(`  - Corner coordinates will be: transform WITHOUT dial → apply dial via Rodrigues → final world coordinates`);
    // console.log(`=== PLOT VISUALIZATION OPERATIONS END: Assembly ${assemblyId || 'unnamed'} ===\n`);
    // PLOT VISUALIZATION OPERATIONS - END (Hidden)

    // Assembly summary with key optical information
    // console.log('\n=== ASSEMBLY SUMMARY ===');
    // console.log(`Assembly created with ${globalSurfaces.length} surfaces:`);
    // globalSurfaces.forEach(surface => {
    //   // Calculate final world normal direction - use the same logic as normal vector generation
    //   let finalNormal: Vector3;
    //   
    //   if (surface.normal) {
    //     // EXPLICIT NORMAL: Use exactly as specified (world coordinates)
    //     finalNormal = surface.normal.normalize();
    //   } else {
    //     // GEOMETRY-BASED NORMAL: Transform default local normal through surface transform
    //     const normalLocal = new Vector3(-1, 0, 0);
    //     const [normalX, normalY, normalZ] = surface.transform.transformVector(normalLocal.x, normalLocal.y, normalLocal.z);
    //     finalNormal = new Vector3(normalX, normalY, normalZ).normalize();
    //   }
    //   
    //   console.log(`  ${surface.id}: position=(${surface.position.x.toFixed(1)}, ${surface.position.y.toFixed(1)}, ${surface.position.z.toFixed(1)}), normal=[${finalNormal.x.toFixed(3)}, ${finalNormal.y.toFixed(3)}, ${finalNormal.z.toFixed(3)}], radius=${surface.radius || 'flat'}`);
    // });
    // console.log('========================\n');

    return globalSurfaces;
  }

  /**
   * STAGE 1: Build assembly in local coordinates with relative positioning
   * This creates the internal structure of the assembly without any global transformations
   * Following EUREKA methodology: store relative positions and normals for later transformation
   */
  private static buildLocalAssembly(assemblyData: any, assemblyId?: string): OpticalSurface[] {
    const surfaces: OpticalSurface[] = [];
    let currentPosition = new Vector3(0, 0, 0); // Start at local origin

    // Get surface keys in order (s1, s2, s3, etc.) and sort them numerically
    const surfaceKeys = Object.keys(assemblyData)
      .filter(key => key !== 'aid')
      .sort((a, b) => {
        const aNum = parseInt(a.replace('s', ''));
        const bNum = parseInt(b.replace('s', ''));
        return aNum - bNum;
      });

    // console.log(`  Building ${surfaceKeys.length} surfaces in local assembly:`, surfaceKeys);

    // Process each surface in the correct order
    surfaceKeys.forEach((key, elementIndex) => {
      const surfaceData = assemblyData[key];

      // Calculate LOCAL position based on relative spacing from PREVIOUS surface
      if (surfaceData.relative !== undefined) {
        if (Array.isArray(surfaceData.relative)) {
          // 3D relative position [x, y, z] - relative to PREVIOUS surface position
          const [deltaX, deltaY, deltaZ] = surfaceData.relative;
          currentPosition = new Vector3(
            currentPosition.x + deltaX,
            currentPosition.y + deltaY,
            currentPosition.z + deltaZ
          );
        } else {
          // Relative distance along assembly axis from PREVIOUS surface
          currentPosition.x += surfaceData.relative;
        }
      }

      // Create the surface at LOCAL position (in assembly coordinates)
      const surface = OpticalSurfaceFactory.createSurface(
        key, 
        surfaceData, 
        currentPosition.clone(),
        true // isAssemblyMember = true, so dial will be handled in global placement
      );

      // Store assembly information
      if (assemblyId) {
        surface.assemblyId = assemblyId;
        surface.elementIndex = elementIndex + 1; // 1-based indexing for user display
      }

      // EUREKA approach: Calculate relative normal direction for this surface
      // Default relative normal is [-1, 0, 0] (pointing backward along assembly axis)
      let relativeNormal = new Vector3(-1, 0, 0);
      
      // Apply individual surface normal orientation (if specified)
      if (surface.normal) {
        // Explicit normal is LOCAL vector relative to optical axis
        relativeNormal = surface.normal.normalize();
      } else if (surfaceData.angles && Array.isArray(surfaceData.angles)) {
        // Convert angles to normal vector (EUREKA ang2vec equivalent)
        // angles[0]: Azimuth (rotation about Z-axis, tilts surface left/right in XY plane)
        // angles[1]: Elevation (tilts surface up/down in elevation plane)
        const azimuthRad = (surfaceData.angles[0] || 0) * Math.PI / 180;    // Rotation about Z-axis
        const elevationRad = (surfaceData.angles[1] || 0) * Math.PI / 180;  // Elevation angle
        
        // Convert spherical coordinates to Cartesian normal vector
        // Starting from default backward normal [-1,0,0]
        relativeNormal = new Vector3(
          -Math.cos(elevationRad) * Math.cos(azimuthRad),  // X component
          -Math.cos(elevationRad) * Math.sin(azimuthRad),  // Y component  
          Math.sin(elevationRad)                           // Z component
        ).normalize();
        
        // DEBUG: Log the conversion for verification
        // console.log(`angles [${surfaceData.angles[0]}, ${surfaceData.angles[1]}] = normal [${relativeNormal.x.toFixed(3)}, ${relativeNormal.y.toFixed(3)}, ${relativeNormal.z.toFixed(3)}]`);
      }
      
      // Store relative normal for later transformation
      (surface as any).relativeNormal = relativeNormal;
      
      // Create LOCAL transformation matrix (EUREKA local_mat equivalent)
      // This is the surface's coordinate system within the assembly
      let localTransform = Matrix4.translation(currentPosition.x, currentPosition.y, currentPosition.z);
      
      // Apply surface orientation based on relative normal (EUREKA upright_rot_transform)
      const normalDiff = Math.abs(relativeNormal.x + 1) + Math.abs(relativeNormal.y) + Math.abs(relativeNormal.z);
      if (normalDiff > 0.001) { // Not equal to default normal [-1,0,0]
        // EUREKA upright_rot_transform: robust two-step rotation
        const defaultNormal = new Vector3(-1, 0, 0);
        const orientationMatrix = this.createUprightRotationTransform(defaultNormal, relativeNormal);
        localTransform = localTransform.multiply(orientationMatrix);
      }
      
      // SIMPLIFIED APPROACH: Store local dial for later application, build surface with dial = 0
      // Following your methodology: skip local dial initially, apply at very end
      if (surfaceData.dial !== undefined) {
        (surface as any).localDialAngle = surfaceData.dial * Math.PI / 180;
        console.log(`${key}: LOCAL dial ${surfaceData.dial}° stored for final application (dial = 0 during construction)`);
      }
      
      // Store the local transformation WITHOUT any dial rotation
      surface.transform = localTransform;

      surfaces.push(surface);
      // console.log(`    ${key}: local_position=(${currentPosition.x.toFixed(1)}, ${currentPosition.y.toFixed(1)}, ${currentPosition.z.toFixed(1)}), rel_normal=[${relativeNormal.x.toFixed(3)}, ${relativeNormal.y.toFixed(3)}, ${relativeNormal.z.toFixed(3)}]`);
    });

    return surfaces;
  }

  /**
   * STAGE 2: Apply global assembly transformations uniformly to all surfaces
   * This places the entire assembly at the specified global position and orientation
   * Following EUREKA place() method: transforms both position and normal directions
   * IMPLEMENTS TWO-STAGE DIAL ROTATION: local dial + assembly dial
   */
  private static placeAssemblyGlobally(
    localSurfaces: OpticalSurface[], 
    assemblyOffset: Vector3, 
    assemblyNormal?: Vector3,
    assemblyDial?: number
  ): OpticalSurface[] {
    
    // EUREKA approach: Create assembly transformation matrix (equivalent to T matrix in EUREKA)
    // Step 1: R_align - rotation to align assembly axis with target normal (EUREKA upright_rot_transform)
    const assemblyAxis = new Vector3(-1, 0, 0); // Default assembly axis (backward)
    const targetNormal = assemblyNormal ? assemblyNormal.normalize() : assemblyAxis;
    
    // console.log(`Assembly target normal calculation verification:`);
    console.log(`  Target normal: [${targetNormal.x.toFixed(6)}, ${targetNormal.y.toFixed(6)}, ${targetNormal.z.toFixed(6)}]`);
    console.log(`  Expected for angles [45,-30]: [-0.612372, -0.612372, -0.500000]`);
    
    let R_align = new Matrix4(); // Identity by default
    const axisNormalDiff = Math.abs(targetNormal.x + 1) + Math.abs(targetNormal.y) + Math.abs(targetNormal.z);
    if (axisNormalDiff > 0.001) { // Not equal to default assembly axis
      R_align = this.createUprightRotationTransform(assemblyAxis, targetNormal);
    }
    
    // Step 2: R_dial - assembly-level dial rotation around the target normal (EUREKA R_dial)
    // This is the SECOND stage of dial rotation (first stage was local surface dial)
    let R_total = R_align;
    if (assemblyDial !== undefined) {
      const dialAngleRad = assemblyDial * Math.PI / 180; // Use actual dial angle, not negative
      console.log(`Assembly dial rotation: ${assemblyDial}° about target normal [${targetNormal.x.toFixed(3)}, ${targetNormal.y.toFixed(3)}, ${targetNormal.z.toFixed(3)}] (using angle: ${assemblyDial}°)`);
      
      // R_dial: rotation around the target normal (EUREKA axial_rotation)
      const R_dial = this.createRotationMatrix(targetNormal, dialAngleRad);
      
      // EUREKA: R_total = R_dial * R_align (dial applied AFTER alignment)
      R_total = R_dial.multiply(R_align);
      
      // Debug: Show the transformation matrices
      const alignMatrix = R_align.elements;
      const dialMatrix = R_dial.elements;
      const totalMatrix = R_total.elements;
      console.log(`R_align: [${alignMatrix[0].toFixed(3)}, ${alignMatrix[1].toFixed(3)}, ${alignMatrix[2].toFixed(3)}] / [${alignMatrix[4].toFixed(3)}, ${alignMatrix[5].toFixed(3)}, ${alignMatrix[6].toFixed(3)}] / [${alignMatrix[8].toFixed(3)}, ${alignMatrix[9].toFixed(3)}, ${alignMatrix[10].toFixed(3)}]`);
      console.log(`R_dial: [${dialMatrix[0].toFixed(3)}, ${dialMatrix[1].toFixed(3)}, ${dialMatrix[2].toFixed(3)}] / [${dialMatrix[4].toFixed(3)}, ${dialMatrix[5].toFixed(3)}, ${dialMatrix[6].toFixed(3)}] / [${dialMatrix[8].toFixed(3)}, ${dialMatrix[9].toFixed(3)}, ${dialMatrix[10].toFixed(3)}]`);
      console.log(`R_total: [${totalMatrix[0].toFixed(3)}, ${totalMatrix[1].toFixed(3)}, ${totalMatrix[2].toFixed(3)}] / [${totalMatrix[4].toFixed(3)}, ${totalMatrix[5].toFixed(3)}, ${totalMatrix[6].toFixed(3)}] / [${totalMatrix[8].toFixed(3)}, ${totalMatrix[9].toFixed(3)}, ${totalMatrix[10].toFixed(3)}]`);
    }
    
    // Create 4x4 homogeneous transformation matrix (EUREKA T matrix)
    // CORRECTED: Apply rotation first, then translation (R × T order)
    let assemblyTransform = R_total.clone();
    const translationMatrix = Matrix4.translation(assemblyOffset.x, assemblyOffset.y, assemblyOffset.z);
    assemblyTransform = translationMatrix.multiply(assemblyTransform);
    
    // Debug: For 3D offset assemblies, print detailed matrix information
    const hasOffset = Math.abs(assemblyOffset.x) > 0.01 || Math.abs(assemblyOffset.y) > 0.01 || Math.abs(assemblyOffset.z) > 0.01;
    if (hasOffset) {
      // console.log(`\n=== Assembly with 3D offset ${JSON.stringify(assemblyOffset)} Matrix Details ===`);
      console.log('R_total matrix elements:');
      const re = R_total.elements;
      console.log(`[${re[0].toFixed(3)}, ${re[4].toFixed(3)}, ${re[8].toFixed(3)}] / [${re[1].toFixed(3)}, ${re[5].toFixed(3)}, ${re[9].toFixed(3)}] / [${re[2].toFixed(3)}, ${re[6].toFixed(3)}, ${re[10].toFixed(3)}]`);
      console.log('Final assemblyTransform elements:');
      const ae = assemblyTransform.elements;
      console.log(`[${ae[0].toFixed(3)}, ${ae[4].toFixed(3)}, ${ae[8].toFixed(3)}, ${ae[12].toFixed(3)}]`);
      console.log(`[${ae[1].toFixed(3)}, ${ae[5].toFixed(3)}, ${ae[9].toFixed(3)}, ${ae[13].toFixed(3)}]`);
      console.log(`[${ae[2].toFixed(3)}, ${ae[6].toFixed(3)}, ${ae[10].toFixed(3)}, ${ae[14].toFixed(3)}]`);
      console.log(`[${ae[3].toFixed(3)}, ${ae[7].toFixed(3)}, ${ae[11].toFixed(3)}, ${ae[15].toFixed(3)}]`);
    }
    
    if (assemblyNormal) {
      // console.log(`  Assembly normal: [${assemblyNormal.x.toFixed(3)}, ${assemblyNormal.y.toFixed(3)}, ${assemblyNormal.z.toFixed(3)}]`);
    }
    // console.log(`  Assembly offset: (${assemblyOffset.x.toFixed(1)}, ${assemblyOffset.y.toFixed(1)}, ${assemblyOffset.z.toFixed(1)})`);

    // Apply assembly transformation to each surface (following EUREKA loop)
    const globalSurfaces: OpticalSurface[] = localSurfaces.map(localSurface => {
      // Clone the surface to avoid modifying the original
      const globalSurface: OpticalSurface = {
        ...localSurface,
        position: localSurface.position.clone(),
        transform: localSurface.transform.clone()
      };
      
      // Get relative position and normal from local surface (EUREKA rel_pos, rel_norm)
      const rel_pos = localSurface.position; // Local position within assembly
      const rel_norm = (localSurface as any).relativeNormal || new Vector3(-1, 0, 0);
      
      // Transform position: new_pos = T * rel_pos (EUREKA xdot(T, rel_pos))
      const [globalX, globalY, globalZ] = assemblyTransform.transformPoint(
        rel_pos.x, rel_pos.y, rel_pos.z
      );
      
      // Debug the assembly transform matrix for this specific surface
      if (globalSurface.id === 's2' && rel_pos.y !== 0) {
        console.log(`${globalSurface.id}: Debug assembly transform for 3D offset surface`);
        console.log(`${globalSurface.id}: rel_pos input: [${rel_pos.x}, ${rel_pos.y}, ${rel_pos.z}]`);
        console.log(`${globalSurface.id}: transform result: [${globalX}, ${globalY}, ${globalZ}]`);
        const matElems = assemblyTransform.elements;
        console.log(`${globalSurface.id}: Matrix row1: [${matElems[0].toFixed(3)}, ${matElems[1].toFixed(3)}, ${matElems[2].toFixed(3)}, ${matElems[3].toFixed(3)}]`);
        console.log(`${globalSurface.id}: Matrix row2: [${matElems[4].toFixed(3)}, ${matElems[5].toFixed(3)}, ${matElems[6].toFixed(3)}, ${matElems[7].toFixed(3)}]`);
        console.log(`${globalSurface.id}: Matrix row3: [${matElems[8].toFixed(3)}, ${matElems[9].toFixed(3)}, ${matElems[10].toFixed(3)}, ${matElems[11].toFixed(3)}]`);
        console.log(`${globalSurface.id}: Matrix row4: [${matElems[12].toFixed(3)}, ${matElems[13].toFixed(3)}, ${matElems[14].toFixed(3)}, ${matElems[15].toFixed(3)}]`);
      }
      
      // Apply the calculated position
      globalSurface.position = new Vector3(globalX, globalY, globalZ);
      
      console.log(`${globalSurface.id}: Position - Original: [${globalX.toFixed(2)}, ${globalY.toFixed(2)}, ${globalZ.toFixed(2)}]`);
      
      // Transform normal using SINGLE combined matrix: world normal = R_total * relative_normal
      // This is the fundamental A*B calculation where A=R_total and B transforms [-1,0,0] to relative normal
      console.log(`${globalSurface.id}: Applying A*B method - A=R_total, B=rel_norm`);
      
      const [transformedNormX, transformedNormY, transformedNormZ] = R_total.transformVector(
        rel_norm.x, rel_norm.y, rel_norm.z
      );
      
      // Direct A*B result without coordinate swapping
      const transformedNormal = new Vector3(transformedNormX, transformedNormY, transformedNormZ).normalize();
      
      console.log(`${globalSurface.id}: A*B result: [${transformedNormX.toFixed(6)}, ${transformedNormY.toFixed(6)}, ${transformedNormZ.toFixed(6)}]`);
      
      // Update surface normal (equivalent to s.normal = new_norm in EUREKA)
      globalSurface.normal = transformedNormal;
      
      console.log(`${globalSurface.id}: Final assigned normal: [${globalSurface.normal.x.toFixed(6)}, ${globalSurface.normal.y.toFixed(6)}, ${globalSurface.normal.z.toFixed(6)}]`);
      
      // Create local transformation matrix for surface (EUREKA local_mat)
      // This represents the surface's coordinate system relative to its position
      let local_mat = Matrix4.translation(rel_pos.x, rel_pos.y, rel_pos.z);
      
      // Apply surface orientation in local coordinates (EUREKA upright_rot_transform)
      const localNormalDiff = Math.abs(rel_norm.x + 1) + Math.abs(rel_norm.y) + Math.abs(rel_norm.z);
      if (localNormalDiff > 0.001) { // Not equal to default normal [-1,0,0]
        // EUREKA upright_rot_transform: robust two-step rotation
        const defaultNormal = new Vector3(-1, 0, 0);
        const localRotation = this.createUprightRotationTransform(defaultNormal, rel_norm);
        local_mat = local_mat.multiply(localRotation);
      }
      
      // ROBOTICS/CG TRANSFORM HIERARCHY: World → Assembly → Surface
      // 1. World → Assembly: assemblyTransform (includes assembly dial affecting normals)
      // 2. Assembly → Surface: local_mat (surface positioning and orientation)
      globalSurface.transform = assemblyTransform.multiply(local_mat);
      
      // Store local dial for FINAL application (after all surfaces are built)
      if ((localSurface as any).localDialAngle !== undefined) {
        // Store dial angle information if present
        if ('localDialAngle' in localSurface) {
          (globalSurface as any).localDialAngle = (localSurface as any).localDialAngle;
        }
        (globalSurface as any).finalNormal = transformedNormal; // Store final normal for dial rotation
      }
      
      // For normals: use transform hierarchy WITHOUT local dial
      // Normal affected by: World → Assembly (including assembly dial) but NOT local dial
      let localMatForNormal = Matrix4.translation(rel_pos.x, rel_pos.y, rel_pos.z);
      if (localNormalDiff > 0.001) {
        const defaultNormal = new Vector3(-1, 0, 0);
        const localRotation = this.createUprightRotationTransform(defaultNormal, rel_norm);
        localMatForNormal = localMatForNormal.multiply(localRotation);
      }
      
      // Normal transform: World → Assembly only (excludes local dial)
      globalSurface.normalTransform = assemblyTransform.multiply(localMatForNormal);
      
      return globalSurface;
    });

    // FINAL STEP: Apply all local dials at once (your methodology: "apply individual surface dials at the very end")
    globalSurfaces.forEach(surface => {
      if ((surface as any).localDialAngle !== undefined) {
        const localDialAngle = (surface as any).localDialAngle;
        const localDialDegrees = localDialAngle * 180 / Math.PI;
        
        console.log(`${surface.id}: Applying LOCAL dial ${localDialDegrees}° at FINAL step (preserves normal)`);
        
        // CRITICAL FIX: Rotate around local normal axis in world space, not final world normal
        // Local normal is always [-1,0,0], transform it to world space to get correct rotation axis
        const localNormal = new Vector3(-1, 0, 0);
        const normalTransform = surface.normalTransform || surface.transform;
        const [worldAxisX, worldAxisY, worldAxisZ] = normalTransform.transformVector(localNormal.x, localNormal.y, localNormal.z);
        const worldRotationAxis = new Vector3(worldAxisX, worldAxisY, worldAxisZ).normalize();
        
        const localDialRotation = this.createRotationMatrix(worldRotationAxis, localDialAngle);
        surface.transform = surface.transform.multiply(localDialRotation);
      }
    });

    return globalSurfaces;
  }

  /**
   * Create rotation matrix around arbitrary axis (Rodrigues' rotation formula)
   */
  static createRotationMatrix(axis: Vector3, angle: number): Matrix4 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    const x = axis.x, y = axis.y, z = axis.z;

    const matrix = new Matrix4();
    matrix.set(0, 0, t * x * x + c);
    matrix.set(0, 1, t * x * y - s * z);
    matrix.set(0, 2, t * x * z + s * y);
    matrix.set(1, 0, t * x * y + s * z);
    matrix.set(1, 1, t * y * y + c);
    matrix.set(1, 2, t * y * z - s * x);
    matrix.set(2, 0, t * x * z - s * y);
    matrix.set(2, 1, t * y * z + s * x);
    matrix.set(2, 2, t * z * z + c);

    return matrix;
  }

  /**
   * EUREKA upright_rot_transform: Create rotation matrix to align vector 'from' with vector 'to'
   * This is a two-step process: first align XY projections, then complete the full alignment
   */
  private static createUprightRotationTransform(fromVec: Vector3, toVec: Vector3): Matrix4 {
    const a = fromVec.normalize();
    const b = toVec.normalize();
    
    // Check for special cases
    const dot = a.x * b.x + a.y * b.y + a.z * b.z;
    
    if (Math.abs(dot - 1) < 1e-6) {
      // Vectors are already aligned
      return new Matrix4(); // Identity matrix
    } else if (Math.abs(dot + 1) < 1e-6) {
      // Vectors are opposite - return -I (180° rotation)
      const matrix = new Matrix4();
      matrix.set(0, 0, -1); matrix.set(1, 1, -1); matrix.set(2, 2, -1);
      return matrix;
    } 
    
    // STEP 1: Project vectors onto XY plane and align those projections
    const fv1_mag = Math.sqrt(a.x * a.x + a.y * a.y);
    const fv2_mag = Math.sqrt(b.x * b.x + b.y * b.y);
    
    // Normalize XY projections
    const fv1 = new Vector3(a.x / fv1_mag, a.y / fv1_mag, 0);
    const fv2 = new Vector3(b.x / fv2_mag, b.y / fv2_mag, 0);
    
    // Calculate Z-rotation angle
    const dot_xy = fv1.x * fv2.x + fv1.y * fv2.y;
    let theta = -Math.acos(Math.max(-1, Math.min(1, dot_xy)));
    
    // Handle sign correctly (EUREKA logic: if b[1] < 0, adjust theta)
    if (b.y < 0) {
      theta = 2 * Math.PI - theta;
    }
    
    // Create Z-rotation matrix
    const Rz = new Matrix4();
    const cos_theta = Math.cos(theta);
    const sin_theta = Math.sin(theta);
    Rz.set(0, 0, cos_theta); Rz.set(0, 1, -sin_theta);
    Rz.set(1, 0, sin_theta); Rz.set(1, 1, cos_theta);
    // Z and translation components remain identity
    
    // STEP 2: Apply Z-rotation to vector 'a'
    const [a_rot_x, a_rot_y, a_rot_z] = Rz.transformVector(a.x, a.y, a.z);
    const a_rotated = new Vector3(a_rot_x, a_rot_y, a_rot_z);
    
    // Calculate remaining rotation needed
    let effect = a_rotated.x * b.x + a_rotated.y * b.y + a_rotated.z * b.z;
    effect = Math.max(-1, Math.min(1, effect)); // Clamp for numerical stability
    
    const phi = Math.acos(effect);
    
    if (Math.abs(phi) < 1e-6) {
      // Already aligned after Z-rotation
      return Rz;
    }
    
    // Calculate rotation axis (cross product of a_rotated and b)
    const axis = new Vector3(
      a_rotated.y * b.z - a_rotated.z * b.y,
      a_rotated.z * b.x - a_rotated.x * b.z,
      a_rotated.x * b.y - a_rotated.y * b.x
    );
    const axis_norm = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
    if (axis_norm < 1e-6) {
      // Vectors are parallel after first rotation
      return Rz;
    }
    axis.x /= axis_norm;
    axis.y /= axis_norm;
    axis.z /= axis_norm;
    
    // Create R_phi rotation matrix (Rodrigues formula)
    const R_phi = this.createRotationMatrix(axis, phi);
    
    // Combine rotations: final = R_phi * Rz
    return R_phi.multiply(Rz);
  }



}

/**
 * Generate mesh data for surface visualization
 */
export class SurfaceRenderer {
  
  /**
   * Generate spherical surface mesh for Plotly.js using mesh3d
   * Uses vertex-based positioning: vertex (optical axis intersection) at designated position
   * Based on Python lens_vertices and spherical_coords implementation
   */
  static generateSphericalMesh(surface: OpticalSurface, resolution: number = 20): {
    type: string;
    x: number[];
    y: number[];
    z: number[];
    i: number[];
    j: number[];
    k: number[];
    opacity: number;
    color: string;
    flatshading?: boolean;
    lighting?: any;
  } {
    const radius = surface.radius || 50;
    const semidia = surface.semidia || 25;
    
    const vertices: { x: number; y: number; z: number }[] = [];
    const faces: { i: number; j: number; k: number }[] = [];

    // Python approach: lens_vertices + spherical_coords
    const r = Math.abs(radius);
    const effectiveSemidia = Math.min(semidia, r); // Clamp semidia to radius
    const rad = Math.asin(effectiveSemidia / r); // Angular extent (theta_max)
    
    const thetaSteps = Math.max(6, Math.floor(resolution / 4));
    const phiSteps = Math.max(8, Math.floor(resolution * 1.5));

    // Add single vertex point at theta=0 (optical axis intersection)
    const vertexLocalZ = 0; // r * Math.sin(0) * Math.cos(0) = 0
    const vertexLocalY = 0; // r * Math.sin(0) * Math.sin(0) = 0  
    const vertexLocalX = -radius; // -radius * Math.cos(0) = -radius
    const vertexShiftedX = vertexLocalX + radius; // = 0 (vertex at origin)
    
    const [vertexWorldX, vertexWorldY, vertexWorldZ] = surface.transform.transformPoint(vertexShiftedX, vertexLocalY, vertexLocalZ);
    vertices.push({ x: vertexWorldX, y: vertexWorldY, z: vertexWorldZ });

    // Generate sphere coordinates following Python lens_vertices function
    // Skip ti=0 since we already added the single vertex point
    for (let ti = 1; ti <= thetaSteps; ti++) {
      const theta = (ti / thetaSteps) * rad; // From rad/thetaSteps to rad
      
      for (let pi = 0; pi < phiSteps; pi++) {
        const phi = (pi / phiSteps) * 2 * Math.PI; // Full rotation around Y-axis
        
        // Python lens_vertices coordinates:
        // z = r * sin(theta) * cos(phi)  
        // y = r * sin(theta) * sin(phi)
        // x = -radius * cos(theta)
        const localZ = r * Math.sin(theta) * Math.cos(phi);
        const localY = r * Math.sin(theta) * Math.sin(phi);
        const localX = -radius * Math.cos(theta);
        
        // Python spherical_coords: base[:, 0] += sur.radius (shift X to make vertex at origin)
        const shiftedX = localX + radius; // This makes vertex (theta=0) at X=0
        
        // Transform to world coordinates using surface transform
        const [worldX, worldY, worldZ] = surface.transform.transformPoint(shiftedX, localY, localZ);
        vertices.push({ x: worldX, y: worldY, z: worldZ });
      }
    }

    // Generate triangular faces connecting vertex to first ring and rings to each other
    for (let ti = 0; ti < thetaSteps; ti++) {
      for (let pi = 0; pi < phiSteps; pi++) {
        if (ti === 0) {
          // Connect single vertex (index 0) to first ring (indices 1 to phiSteps)
          const firstRingCurrent = 1 + pi;
          const firstRingNext = 1 + ((pi + 1) % phiSteps);
          
          faces.push({
            i: 0, // single vertex point
            j: firstRingCurrent,
            k: firstRingNext
          });
        } else {
          // Connect ring ti-1 to ring ti
          const prevRingBase = 1 + (ti - 1) * phiSteps;
          const currentRingBase = 1 + ti * phiSteps;
          
          const prevCurrent = prevRingBase + pi;
          const prevNext = prevRingBase + ((pi + 1) % phiSteps);
          const currentCurrent = currentRingBase + pi;
          const currentNext = currentRingBase + ((pi + 1) % phiSteps);
          
          // Create two triangles per quad
          faces.push({
            i: prevCurrent,
            j: currentCurrent,
            k: prevNext
          });
          
          faces.push({
            i: prevNext,
            j: currentCurrent,
            k: currentNext
          });
        }
      }
    }

    return {
      type: 'mesh3d',
      x: vertices.map(v => v.x),
      y: vertices.map(v => v.y),
      z: vertices.map(v => v.z),
      i: faces.map(f => f.i),
      j: faces.map(f => f.j),
      k: faces.map(f => f.k),
      opacity: surface.opacity || 0.3,
      color: 'rgba(255,255,255,0.8)',
      flatshading: false,
      lighting: {
        ambient: 0.8,
        diffuse: 0.8,
        specular: 0.1
      }
    };
  }

  /**
   * Generate planar surface mesh for Plotly.js using mesh3d
   */
  static generatePlanarMesh(surface: OpticalSurface, resolution: number = 10): {
    type: string;
    x: number[];
    y: number[];
    z: number[];
    i: number[];
    j: number[];
    k: number[];
    opacity: number;
    color: string;
    flatshading?: boolean;
    corners?: { x: number[]; y: number[]; z: number[] }; // Add corner positions for proper marking
  } {
    const semidia = surface.semidia || 25;
    const height = surface.height || semidia * 2;
    const width = surface.width || semidia * 2;
    
    const vertices: { x: number; y: number; z: number }[] = [];
    const faces: { i: number; j: number; k: number }[] = [];

    // For circular aperture, use efficient "pizza slice" triangulation
    if (surface.semidia) {
      // Generate circular planar surface using pizza slice method
      const angularSteps = Math.max(12, Math.floor(resolution * 1.2)); // More angular divisions for smooth circle
      
      // Helper function to transform a local point using correct dial rotation methodology
      const transformLocalPoint = (x: number, y: number, z: number) => {
        // Use normalTransform (excludes dial) or fallback to transform if no dial
        const transformWithoutDial = (surface as any).normalTransform || surface.transform;
        
        // 1. Transform point to world coordinates WITHOUT dial rotation
        const [baseWorldX, baseWorldY, baseWorldZ] = transformWithoutDial.transformPoint(x, y, z);
        
        // 2. If surface has dial, apply it to the position-to-point vector using Rodrigues rotation
        if ((surface as any).localDialAngle !== undefined) {
          const dialAngle = (surface as any).localDialAngle;
          
          // Vector from surface position to point (before dial)
          const vectorToPoint = new Vector3(
            baseWorldX - surface.position.x,
            baseWorldY - surface.position.y,
            baseWorldZ - surface.position.z
          );
          
          // Apply dial rotation around the surface normal in world space
          const normal = surface.normal?.normalize();
          if (normal) {
            const cosTheta = Math.cos(dialAngle);
            const sinTheta = Math.sin(dialAngle);
            const t = 1 - cosTheta;
            const nx = normal.x, ny = normal.y, nz = normal.z;
            
            // Rodrigues rotation matrix applied to vector
            const rotatedVector = new Vector3(
              (t*nx*nx + cosTheta) * vectorToPoint.x + (t*nx*ny - sinTheta*nz) * vectorToPoint.y + (t*nx*nz + sinTheta*ny) * vectorToPoint.z,
              (t*nx*ny + sinTheta*nz) * vectorToPoint.x + (t*ny*ny + cosTheta) * vectorToPoint.y + (t*ny*nz - sinTheta*nx) * vectorToPoint.z,
              (t*nx*nz - sinTheta*ny) * vectorToPoint.x + (t*ny*nz + sinTheta*nx) * vectorToPoint.y + (t*nz*nz + cosTheta) * vectorToPoint.z
            );
            
            // Final point position = surface position + rotated vector
            return { 
              x: surface.position.x + rotatedVector.x,
              y: surface.position.y + rotatedVector.y,
              z: surface.position.z + rotatedVector.z
            };
          } else {
            // Fallback: use base coordinates if no normal available
            return { x: baseWorldX, y: baseWorldY, z: baseWorldZ };
          }
        } else {
          // No dial rotation - use base world coordinates
          return { x: baseWorldX, y: baseWorldY, z: baseWorldZ };
        }
      };
      
      // Add center vertex (index 0)
      const centerVertex = transformLocalPoint(0, 0, 0);
      vertices.push(centerVertex);
      
      // Add rim vertices at semidia radius (indices 1 to angularSteps)
      for (let i = 0; i < angularSteps; i++) {
        const theta = (i / angularSteps) * 2 * Math.PI;
        const localY = semidia * Math.cos(theta);
        const localZ = semidia * Math.sin(theta);
        
        const vertex = transformLocalPoint(0, localY, localZ);
        vertices.push(vertex);
      }
      
      // Generate pizza slice triangles: center to each edge pair
      for (let i = 0; i < angularSteps; i++) {
        const next = (i + 1) % angularSteps;
        faces.push({
          i: 0,       // center vertex
          j: 1 + i,   // current rim vertex  
          k: 1 + next // next rim vertex (wrapping around)
        });
      }

      // Circular surfaces don't have distinct corners
      // Set color based on surface mode: black with transparency for apertures, normal color otherwise
      const circularColor = surface.mode === 'aperture' ? 
        'rgba(0,0,0,0.8)' : // Almost black with transparency for apertures
        'rgba(255,255,255,0.8)'; // Normal white color for non-aperture disks

      const result = {
        type: 'mesh3d',
        x: vertices.map(v => v.x),
        y: vertices.map(v => v.y),
        z: vertices.map(v => v.z),
        i: faces.map(f => f.i),
        j: faces.map(f => f.j),
        k: faces.map(f => f.k),
        opacity: surface.opacity || 0.3,
        color: circularColor,
        flatshading: true
      };

      return result;
    } else {
      // Rectangular aperture - simple quad with corner marking
      const halfHeight = height / 2;
      const halfWidth = width / 2;
      
      // Local corner coordinates matching test validation approach
      // Width extends along Y-axis, height extends along Z-axis
      const localCorners = [
        [0, -halfWidth, -halfHeight], // [X, Y, Z] = [0, -width/2, -height/2]
        [0, halfWidth, -halfHeight],  // [X, Y, Z] = [0, +width/2, -height/2]
        [0, halfWidth, halfHeight],   // [X, Y, Z] = [0, +width/2, +height/2]
        [0, -halfWidth, halfHeight]   // [X, Y, Z] = [0, -width/2, +height/2]
      ];
      
      // Apply correct dial rotation methodology and store corners
      const worldCorners: { x: number; y: number; z: number }[] = [];
      
      // Helper function for transforming corners (same as above)
      const transformLocalPoint = (x: number, y: number, z: number) => {
        const transformWithoutDial = (surface as any).normalTransform || surface.transform;
        const [baseWorldX, baseWorldY, baseWorldZ] = transformWithoutDial.transformPoint(x, y, z);
        
        if ((surface as any).localDialAngle !== undefined) {
          const dialAngle = (surface as any).localDialAngle;
          const vectorToPoint = new Vector3(
            baseWorldX - surface.position.x,
            baseWorldY - surface.position.y,
            baseWorldZ - surface.position.z
          );
          
          const normal = surface.normal?.normalize();
          if (normal) {
            const cosTheta = Math.cos(dialAngle);
            const sinTheta = Math.sin(dialAngle);
            const t = 1 - cosTheta;
            const nx = normal.x, ny = normal.y, nz = normal.z;
            
            const rotatedVector = new Vector3(
              (t*nx*nx + cosTheta) * vectorToPoint.x + (t*nx*ny - sinTheta*nz) * vectorToPoint.y + (t*nx*nz + sinTheta*ny) * vectorToPoint.z,
              (t*nx*ny + sinTheta*nz) * vectorToPoint.x + (t*ny*ny + cosTheta) * vectorToPoint.y + (t*ny*nz - sinTheta*nx) * vectorToPoint.z,
              (t*nx*nz - sinTheta*ny) * vectorToPoint.x + (t*ny*nz + sinTheta*nx) * vectorToPoint.y + (t*nz*nz + cosTheta) * vectorToPoint.z
            );
            
            return { 
              x: surface.position.x + rotatedVector.x,
              y: surface.position.y + rotatedVector.y,
              z: surface.position.z + rotatedVector.z
            };
          } else {
            return { x: baseWorldX, y: baseWorldY, z: baseWorldZ };
          }
        } else {
          return { x: baseWorldX, y: baseWorldY, z: baseWorldZ };
        }
      };
      
      // Transform all corners and add to vertices
      localCorners.forEach(([x, y, z]) => {
        const corner = transformLocalPoint(x, y, z);
        vertices.push(corner);
        worldCorners.push(corner);
      });
      
      // Two triangles forming a rectangle
      // For a proper rectangle with vertices 0,1,2,3, use correct winding order
      faces.push({ i: 0, j: 1, k: 3 });  // Triangle 1: (0,1,3)
      faces.push({ i: 1, j: 2, k: 3 });  // Triangle 2: (1,2,3)

      // Different color for apertures
      const color = surface.mode === 'aperture' ? 
        'rgba(100,100,255,0.6)' : 'rgba(255,255,255,0.8)';

      const result = {
        type: 'mesh3d',
        x: vertices.map(v => v.x),
        y: vertices.map(v => v.y),
        z: vertices.map(v => v.z),
        i: faces.map(f => f.i),
        j: faces.map(f => f.j),
        k: faces.map(f => f.k),
        opacity: surface.opacity || 0.3,
        color: color,
        flatshading: true,
        corners: {
          x: worldCorners.map(c => c.x),
          y: worldCorners.map(c => c.y),
          z: worldCorners.map(c => c.z)
        }
      };

      return result;
    }
  }

  /**
   * Generate cylindrical surface mesh for Plotly.js using mesh3d
   * Based on Python implementation: curves in Y-direction, flat in Z-direction
   * Uses proper vertex positioning and dial rotation like planar surfaces
   */
  static generateCylindricalMesh(surface: OpticalSurface, resolution: number = 20): {
    type: string;
    x: number[];
    y: number[];
    z: number[];
    i: number[];
    j: number[];
    k: number[];
    opacity: number;
    color: string;
    flatshading?: boolean;
    lighting?: any;
    corners?: { x: number[]; y: number[]; z: number[] }; // Add corner positions for proper marking
  } {
    const radius = surface.radius || 50;
    const height = surface.height || (surface.semidia ? surface.semidia * 2 : 50);
    const width = surface.width || (surface.semidia ? surface.semidia * 2 : 50);
    
    const vertices: { x: number; y: number; z: number }[] = [];
    const faces: { i: number; j: number; k: number }[] = [];

    // Calculate angular range based on width (like Python implementation)
    const r = Math.abs(radius);
    const rad = Math.asin(0.5 * width / r); // Angular extent
    const thetaSteps = Math.max(8, Math.floor(resolution * 0.8));
    const zSteps = Math.max(4, Math.floor(resolution * 0.4));

    // Helper function to transform a local point using correct dial rotation methodology
    // (Same as planar surfaces - rotate around surface normal)
    const transformLocalPoint = (x: number, y: number, z: number) => {
      // Use normalTransform (excludes dial) or fallback to transform if no dial
      const transformWithoutDial = (surface as any).normalTransform || surface.transform;
      
      // 1. Transform point to world coordinates WITHOUT dial rotation
      const [baseWorldX, baseWorldY, baseWorldZ] = transformWithoutDial.transformPoint(x, y, z);
      
      // 2. If surface has dial, apply it to the position-to-point vector using Rodrigues rotation
      if ((surface as any).localDialAngle !== undefined) {
        const dialAngle = (surface as any).localDialAngle;
        
        // Vector from surface position to point (before dial)
        const vectorToPoint = new Vector3(
          baseWorldX - surface.position.x,
          baseWorldY - surface.position.y,
          baseWorldZ - surface.position.z
        );
        
        // Apply dial rotation around the surface normal in world space (like planar surfaces)
        const normal = surface.normal?.normalize();
        if (normal) {
          const cosTheta = Math.cos(dialAngle);
          const sinTheta = Math.sin(dialAngle);
          const t = 1 - cosTheta;
          const nx = normal.x, ny = normal.y, nz = normal.z;
          
          // Rodrigues rotation matrix applied to vector
          const rotatedVector = new Vector3(
            (t*nx*nx + cosTheta) * vectorToPoint.x + (t*nx*ny - sinTheta*nz) * vectorToPoint.y + (t*nx*nz + sinTheta*ny) * vectorToPoint.z,
            (t*nx*ny + sinTheta*nz) * vectorToPoint.x + (t*ny*ny + cosTheta) * vectorToPoint.y + (t*ny*nz - sinTheta*nx) * vectorToPoint.z,
            (t*nx*nz - sinTheta*ny) * vectorToPoint.x + (t*ny*nz + sinTheta*nx) * vectorToPoint.y + (t*nz*nz + cosTheta) * vectorToPoint.z
          );
          
          // Final point position = surface position + rotated vector
          return { 
            x: surface.position.x + rotatedVector.x,
            y: surface.position.y + rotatedVector.y,
            z: surface.position.z + rotatedVector.z
          };
        } else {
          // Fallback: use base coordinates if no normal available
          return { x: baseWorldX, y: baseWorldY, z: baseWorldZ };
        }
      } else {
        // No dial rotation - use base world coordinates
        return { x: baseWorldX, y: baseWorldY, z: baseWorldZ };
      }
    };

    // Generate vertices in a grid pattern: theta (curvature) × z (height)
    for (let zi = 0; zi <= zSteps; zi++) {
      const z = ((zi / zSteps) - 0.5) * height; // From -height/2 to +height/2
      
      for (let ti = 0; ti <= thetaSteps; ti++) {
        const theta = -rad + (ti / thetaSteps) * (2 * rad); // From -rad to +rad
        
        // Calculate cylindrical coordinates (following Python implementation)
        const localY = r * Math.sin(theta);
        let localX = 0;
        
        // Only calculate X curvature if within cylinder radius
        if (Math.abs(localY) <= r) {
          const radiusSign = radius >= 0 ? 1 : -1;
          // FIXED: NO vertex offset - vertex should be at designated position (0,0,0 in local coords)
          // Surface equation: x = R - sqrt(R² - y²) (standard cylinder equation)
          localX = radiusSign * (r - Math.sqrt(r * r - localY * localY));
        } else {
          // Point is outside cylinder radius
          localX = 0; // At vertex position
        }
        
        const localZ = z;
        
        // Transform to world coordinates using dial-aware transformation
        const vertex = transformLocalPoint(localX, localY, localZ);
        vertices.push(vertex);
      }
    }

    // Generate triangular faces connecting the grid
    for (let zi = 0; zi < zSteps; zi++) {
      for (let ti = 0; ti < thetaSteps; ti++) {
        // Current vertex indices in the grid
        const current = zi * (thetaSteps + 1) + ti;
        const right = current + 1;
        const below = (zi + 1) * (thetaSteps + 1) + ti;
        const belowRight = below + 1;
        
        // Create two triangles for each quad
        faces.push({
          i: current,
          j: right,
          k: below
        });
        
        faces.push({
          i: right,
          j: belowRight,
          k: below
        });
      }
    }

    // Calculate the four sharpest corners of the cylindrical surface
    // These are the extremes: [+Y,+Z], [-Y,+Z], [-Y,-Z], [+Y,-Z] at the surface curvature
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    // For cylindrical surfaces, the corners are at the edges of the width and height
    const cornerY = halfWidth;  // Edge of width
    const cornerX = radius >= 0 ? 
      (r - Math.sqrt(r * r - cornerY * cornerY)) :  // Positive radius: surface curves away
      -(r - Math.sqrt(r * r - cornerY * cornerY));  // Negative radius: surface curves toward
    
    const localCorners = [
      [cornerX, halfWidth, halfHeight],    // Top-right corner
      [cornerX, -halfWidth, halfHeight],   // Top-left corner  
      [cornerX, -halfWidth, -halfHeight],  // Bottom-left corner
      [cornerX, halfWidth, -halfHeight]    // Bottom-right corner
    ];
    
    const worldCorners = localCorners.map(([x, y, z]) => transformLocalPoint(x, y, z));

    const result = {
      type: 'mesh3d',
      x: vertices.map(v => v.x),
      y: vertices.map(v => v.y),
      z: vertices.map(v => v.z),
      i: faces.map(f => f.i),
      j: faces.map(f => f.j),
      k: faces.map(f => f.k),
      opacity: surface.opacity || 0.3,
      color: 'rgba(255,255,255,0.8)',
      flatshading: false,
      lighting: {
        ambient: 0.8,
        diffuse: 0.8,
        specular: 0.1
      },
      corners: {
        x: worldCorners.map(c => c.x),
        y: worldCorners.map(c => c.y),
        z: worldCorners.map(c => c.z)
      }
    };

    return result;
  }

  /**
   * Generate surface mesh based on surface type
   */
  static generateMesh(surface: OpticalSurface, resolution: number = 20) {
    switch (surface.shape) {
      case 'spherical':
        return SurfaceRenderer.generateSphericalMesh(surface, resolution);
      case 'cylindrical':
        return SurfaceRenderer.generateCylindricalMesh(surface, resolution);
      case 'plano':
        return SurfaceRenderer.generatePlanarMesh(surface, resolution);
      case 'aspherical':
        // For now, treat as spherical - aspherical rendering can be added later
        return SurfaceRenderer.generateSphericalMesh(surface, resolution);
      default:
        return SurfaceRenderer.generatePlanarMesh(surface, resolution);
    }
  }

  /**
   * Generate normal vector for surface visualization
   * Creates a single line segment showing surface normal at apex/centroid
   */
  static generateNormalVectors(surface: OpticalSurface): {
    type: string;
    x: number[];
    y: number[];
    z: number[];
    mode: string;
    line: any;
    name: string;
    showlegend: boolean;
    hoverinfo: string;
  } {
    // Calculate surface dimensions for normal length
    const height = surface.height || (surface.semidia ? surface.semidia * 2 : 50);
    const width = surface.width || (surface.semidia ? surface.semidia * 2 : 50);
    const diagonal = Math.sqrt(height * height + width * width);
    const normalLength = diagonal / 10; // Normal length = 1/10 of diagonal

    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];

    // Surface apex position (always at center for visualization)
    const apexLocal = new Vector3(0, 0, 0);
    const [apexX, apexY, apexZ] = surface.transform.transformPoint(apexLocal.x, apexLocal.y, apexLocal.z);

    let normalVec: Vector3;

    // CRITICAL: Use the stored surface.normal (which excludes dial rotation) for normal visualization
    // The surface.normal is the true optical normal direction and should NOT be affected by dial rotation
    // Dial rotation only affects the surface corners/mesh for aperture orientation, not the optical normal
    if (surface.normal) {
      // Use the stored normal (calculated correctly without dial effects)
      normalVec = surface.normal.normalize();
    } else {
      // Fallback: derive from normalTransform (which excludes dial) or regular transform if no dial
      const transformToUse = surface.normalTransform || surface.transform;
      const normalLocal = new Vector3(-1, 0, 0); // Default local normal direction
      const [normalX, normalY, normalZ] = transformToUse.transformVector(normalLocal.x, normalLocal.y, normalLocal.z);
      normalVec = new Vector3(normalX, normalY, normalZ).normalize();
    }
    
    const normalEnd = new Vector3(apexX, apexY, apexZ).add(normalVec.multiply(normalLength));
    
    // Create single line segment: apex → apex + normal
    x.push(apexX, normalEnd.x);
    y.push(apexY, normalEnd.y);
    z.push(apexZ, normalEnd.z);

    // Use white color with 30% transparency for normal vectors
    const normalColor = 'rgba(255, 255, 255, 0.3)'; // White with 30% transparency
    
    return {
      type: 'scatter3d',
      x,
      y,
      z,
      mode: 'lines',
      line: {
        color: normalColor, // White with 70% transparency
        width: 4 // Slightly thicker for visibility
      },
      name: `${surface.id} Normal`,
      showlegend: false,
      hoverinfo: 'skip'
    };
  }
}
