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
  numericalId?: number;    // Sequential numerical ID assigned during system build
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
  transform: Matrix4;     // Unified transform for both ray tracing and visualization
  
  // Precomputed transformation matrices for efficient ray tracing (EUREKA methodology)
  forwardTransform: Matrix4;  // World → Local transform (EUREKA "move" matrix)
  inverseTransform: Matrix4;  // Local → World transform (EUREKA "inverse" matrix)
  
  // Aperture properties
  aperture?: number;      // Circular aperture radius
  semidia?: number;       // Semi-diameter (aperture radius)
  height?: number;        // Height for rectangular apertures
  width?: number;         // Width for rectangular apertures
  
  // Optical properties
  n1?: number;           // Refractive index before surface
  n2?: number;           // Refractive index after surface
  
  // Partial surface properties (for mode: 'partial')
  transmission?: number; // Transmission coefficient (0-1) for partial surfaces
  
  // Wavelength selection properties
  sel?: string;          // Wavelength selection: 'o532' (only 532nm), 'x633' (exclude 633nm)
  
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
   * Following EUREKA calc_mat methodology
   */
  static createSurface(
    id: string, 
    surfaceData: any, 
    position: Vector3 = new Vector3(0, 0, 0),
    numericalId?: number
  ): OpticalSurface {
    
    const surface: OpticalSurface = {
      id,
      numericalId,
      shape: surfaceData.shape || 'spherical',
      mode: surfaceData.mode || 'refraction',
      position: position.clone(),
      transform: Matrix4.translation(position.x, position.y, position.z), // Will be updated below
      forwardTransform: new Matrix4().identity(), // Will be computed below
      inverseTransform: new Matrix4().identity(), // Will be computed below
      opacity: 0.3 // Default transparent white
    };

    // Debug log for numerical ID assignment
    if (numericalId !== undefined) {
      console.log(`  Surface ${id} assigned numerical ID: ${numericalId}`);
    }

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
    
    // Partial surface properties
    if (surfaceData.transmission !== undefined) {
      surface.transmission = Math.max(0, Math.min(1, surfaceData.transmission)); // Clamp to 0-1
    }
    
    // Wavelength selection properties
    if (surfaceData.sel !== undefined) {
      surface.sel = surfaceData.sel;
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

    // Apply transformation hierarchy following EUREKA calc_mat methodology
    // Step 1: Calculate rotation matrix (r) from default normal to target normal
    const defaultNormal = new Vector3(-1, 0, 0);
    let rotationMatrix = new Matrix4().identity();
    
    // Apply local surface orientation if specified
    if (surface.normal) {
      const targetNormal = surface.normal.normalize();
      const normalDiff = Math.abs(targetNormal.x + 1) + Math.abs(targetNormal.y) + Math.abs(targetNormal.z);
      if (normalDiff > 0.001) {
        rotationMatrix = this.createUprightRotationTransform(defaultNormal, targetNormal);
      }
    }
    
    // Step 2: Apply surface dial rotation to the rotation matrix (EUREKA: r = np.dot(rhr, r))
    if (surfaceData.dial !== undefined) {
      const dialAngleRad = surfaceData.dial * Math.PI / 180;
      // Get current normal direction after orientation transform
      const currentNormal = surface.normal || defaultNormal;
      const dialRotation = this.createRotationMatrix(currentNormal, dialAngleRad);
      rotationMatrix = dialRotation.multiply(rotationMatrix);
    }
    
    // Step 3: Calculate translation vector (EUREKA: t = self.vertex - self.normal * self.radius)
    const currentNormal = surface.normal || defaultNormal;
    const radius = surface.radius || 0;
    const translationVector = new Vector3(
      position.x - currentNormal.x * radius,
      position.y - currentNormal.y * radius,
      position.z - currentNormal.z * radius
    );
    
    // Step 4: Build 4x4 transformation matrix (EUREKA inverse matrix format)
    const transform = new Matrix4();
    // Copy rotation part (3x3)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        transform.set(i, j, rotationMatrix.get(i, j));
      }
    }
    // Set translation part
    transform.set(0, 3, translationVector.x);
    transform.set(1, 3, translationVector.y);
    transform.set(2, 3, translationVector.z);
    transform.set(3, 3, 1);
    
    // Store single transform for both ray tracing and visualization
    surface.transform = transform;
    this.finalizeTransformationMatrices(surface);

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
    assemblyDial?: number,
    surfaceCounterStart?: number
  ): OpticalSurface[] {
    
    // Build assembly in local coordinates, then place globally
    const localSurfaces = this.buildLocalAssembly(assemblyData, assemblyId, surfaceCounterStart);
    const globalSurfaces = this.placeAssemblyGlobally(localSurfaces, assemblyOffset, assemblyNormal, assemblyDial);

    return globalSurfaces;
  }

  /**
   * STAGE 1: Build assembly in local coordinates with relative positioning
   * This creates the internal structure of the assembly without any global transformations
   * Following EUREKA methodology: store relative positions and normals for later transformation
   */
  private static buildLocalAssembly(assemblyData: any, assemblyId?: string, surfaceCounterStart?: number): OpticalSurface[] {
    const surfaces: OpticalSurface[] = [];
    let currentPosition = new Vector3(0, 0, 0); // Start at local origin
    let surfaceCounter = surfaceCounterStart || 0; // Start from provided counter or 0

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

      // Create surface with EUREKA methodology for LOCAL assembly coordinates
      // Following EUREKA calc_mat 4-step process but in assembly-local space
      
      // Step 1: Calculate relative normal direction (EUREKA ang2vec equivalent)
      let relativeNormal = new Vector3(-1, 0, 0); // Default backward normal
      
      if (surfaceData.normal && Array.isArray(surfaceData.normal)) {
        relativeNormal = new Vector3(
          surfaceData.normal[0] || 0,
          surfaceData.normal[1] || 0,
          surfaceData.normal[2] || 0
        ).normalize();
      } else if (surfaceData.angles && Array.isArray(surfaceData.angles)) {
        const azimuthRad = (surfaceData.angles[0] || 0) * Math.PI / 180;
        const elevationRad = (surfaceData.angles[1] || 0) * Math.PI / 180;
        relativeNormal = new Vector3(
          -Math.cos(elevationRad) * Math.cos(azimuthRad),
          -Math.cos(elevationRad) * Math.sin(azimuthRad),
          Math.sin(elevationRad)
        ).normalize();
      }
      
      // Step 2: Calculate rotation matrix from default normal to target normal
      const defaultNormal = new Vector3(-1, 0, 0);
      let rotationMatrix = new Matrix4().identity();
      const normalDiff = Math.abs(relativeNormal.x + 1) + Math.abs(relativeNormal.y) + Math.abs(relativeNormal.z);
      if (normalDiff > 0.001) {
        rotationMatrix = this.createUprightRotationTransform(defaultNormal, relativeNormal);
      }
      
      // Step 3: Apply intra-assembly dial rotation (if specified)
      if (surfaceData.dial !== undefined) {
        const dialAngleRad = surfaceData.dial * Math.PI / 180;
        const dialRotation = this.createRotationMatrix(relativeNormal, dialAngleRad);
        rotationMatrix = dialRotation.multiply(rotationMatrix);
        console.log(`Surface ${key} dial rotation: ${surfaceData.dial}° around normal:`, relativeNormal);
      }
      
      // Step 4: Calculate translation (EUREKA: t = vertex - normal * radius)
      const radius = surfaceData.radius || 0;
      const translationVector = new Vector3(
        currentPosition.x - relativeNormal.x * radius,
        currentPosition.y - relativeNormal.y * radius,
        currentPosition.z - relativeNormal.z * radius
      );
      
      // Step 5: Build 4x4 transformation matrix (EUREKA inverse matrix format)
      const localTransform = new Matrix4();
      // Copy rotation part (3x3)
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          localTransform.set(i, j, rotationMatrix.get(i, j));
        }
      }
      // Set translation part
      localTransform.set(0, 3, translationVector.x);
      localTransform.set(1, 3, translationVector.y);
      localTransform.set(2, 3, translationVector.z);
      localTransform.set(3, 3, 1);
      
      // Create surface with basic properties (no redundant transformation)
      const surface: OpticalSurface = {
        id: key,
        numericalId: surfaceCounter++, // Assign numerical ID and increment
        shape: surfaceData.shape || 'spherical',
        mode: surfaceData.mode || 'refraction',
        position: currentPosition.clone(),
        normal: relativeNormal,
        radius: surfaceData.radius,
        semidia: surfaceData.semidia,
        height: surfaceData.height,
        width: surfaceData.width,
        n1: surfaceData.n1,
        n2: surfaceData.n2,
        transform: localTransform,
        forwardTransform: new Matrix4().identity(), // Will be computed later
        inverseTransform: new Matrix4().identity(), // Will be computed later
        opacity: 0.3
      };

      // Store assembly information
      if (assemblyId) {
        surface.assemblyId = assemblyId;
        surface.elementIndex = elementIndex + 1;
        
        // Debug log for numerical ID assignment
        console.log(`  Surface ${key} assigned numerical ID: ${surface.numericalId}`);
      }
      
      // Store relative normal for global placement
      (surface as any).relativeNormal = relativeNormal;
      // Set material and visual properties (EUREKA surface classification)
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
      
      surfaces.push(surface);
    });

    return surfaces;
  }

  /**
   * Apply global assembly transformations uniformly to all surfaces
   */
  private static placeAssemblyGlobally(
    localSurfaces: OpticalSurface[], 
    assemblyOffset: Vector3, 
    assemblyNormal?: Vector3,
    assemblyDial?: number
  ): OpticalSurface[] {
    
    // Create assembly transformation matrix
    const assemblyAxis = new Vector3(-1, 0, 0);
    const targetNormal = assemblyNormal ? assemblyNormal.normalize() : assemblyAxis;
    
    let R_align = new Matrix4();
    const axisNormalDiff = Math.abs(targetNormal.x + 1) + Math.abs(targetNormal.y) + Math.abs(targetNormal.z);
    if (axisNormalDiff > 0.001) {
      R_align = this.createUprightRotationTransform(assemblyAxis, targetNormal);
    }
    
    // Apply assembly-level dial rotation
    let R_total = R_align;
    if (assemblyDial !== undefined) {
      const dialAngleRad = assemblyDial * Math.PI / 180;
      const R_dial = this.createRotationMatrix(targetNormal, dialAngleRad);
      R_total = R_dial.multiply(R_align);
    }
    
    // Create final assembly transformation matrix
    let assemblyTransform = R_total.clone();
    const translationMatrix = Matrix4.translation(assemblyOffset.x, assemblyOffset.y, assemblyOffset.z);
    assemblyTransform = translationMatrix.multiply(assemblyTransform);
    // Apply assembly transformation to each surface
    const globalSurfaces: OpticalSurface[] = localSurfaces.map(localSurface => {
      const globalSurface: OpticalSurface = {
        ...localSurface,
        position: localSurface.position.clone(),
        transform: localSurface.transform.clone()
      };
      
      const rel_pos = localSurface.position;
      const rel_norm = (localSurface as any).relativeNormal || new Vector3(-1, 0, 0);
      
      // Transform position
      const [globalX, globalY, globalZ] = assemblyTransform.transformPoint(
        rel_pos.x, rel_pos.y, rel_pos.z
      );
      globalSurface.position = new Vector3(globalX, globalY, globalZ);
      
      // Transform normal
      const [transformedNormX, transformedNormY, transformedNormZ] = R_total.transformVector(
        rel_norm.x, rel_norm.y, rel_norm.z
      );
      const transformedNormal = new Vector3(transformedNormX, transformedNormY, transformedNormZ).normalize();
      globalSurface.normal = transformedNormal;
      
      // Apply global assembly transformation to local surface transform
      // Local transform already includes surface orientation and dial rotation (EUREKA methodology)
      globalSurface.transform = assemblyTransform.multiply(localSurface.transform);
      
      return globalSurface;
    });

    // Finalize transformation matrices for all surfaces
    globalSurfaces.forEach(surface => {
      this.finalizeTransformationMatrices(surface);
    });

    return globalSurfaces;
  }

  /**
   * Finalize transformation matrices once surface placement is complete
   * Following EUREKA methodology: inverse = Local→World, move = World→Local
   */
  static finalizeTransformationMatrices(surface: OpticalSurface): void {
    // EUREKA approach: inverse is Local→World transform
    surface.inverseTransform = surface.transform.clone();
    
    // EUREKA approach: move is World→Local transform (inverse of inverse)
    surface.forwardTransform = surface.inverseTransform.inverse();
  }

  /**
   * Transform local point to world coordinates
   */
  static transformLocalToWorld(surface: OpticalSurface, localX: number, localY: number, localZ: number): { x: number; y: number; z: number } {
    const [worldX, worldY, worldZ] = surface.inverseTransform.transformPoint(localX, localY, localZ);
    return { x: worldX, y: worldY, z: worldZ };
  }

  /**
   * Transform world point to local coordinates
   */
  static transformWorldToLocal(surface: OpticalSurface, worldX: number, worldY: number, worldZ: number): { x: number; y: number; z: number } {
    const [localX, localY, localZ] = surface.forwardTransform.transformPoint(worldX, worldY, worldZ);
    return { x: localX, y: localY, z: localZ };
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
   * DEPRECATED: This function is replaced by unified matrix calculation
   * All surfaces now use the same transformation logic regardless of shape
   */
  static computeForwardTransform(surface: OpticalSurface): Matrix4 {
    // Simply return the precomputed forward transform
    return surface.forwardTransform || surface.transform.inverse();
  }

  /**
   * Create rotation matrix that rotates 'from' vector to 'to' vector
   * Uses Rodrigues' rotation formula for arbitrary axis rotation
   */
  static createRotationMatrixFromNormals(from: Vector3, to: Vector3): Matrix4 {
    const fromNorm = from.normalize();
    const toNorm = to.normalize();
    
    // Check if vectors are already aligned
    const dot = fromNorm.dot(toNorm);
    if (Math.abs(dot - 1.0) < 1e-6) {
      // Already aligned, return identity
      return new Matrix4().identity();
    }
    
    if (Math.abs(dot + 1.0) < 1e-6) {
      // Vectors are opposite, rotate 180° around any perpendicular axis
      let perpendicular: Vector3;
      if (Math.abs(fromNorm.x) < 0.9) {
        perpendicular = new Vector3(1, 0, 0).cross(fromNorm).normalize();
      } else {
        perpendicular = new Vector3(0, 1, 0).cross(fromNorm).normalize();  
      }
      return Matrix4.rotationFromAxisAngle(perpendicular, Math.PI);
    }
    
    // General case: use Rodrigues' formula
    const axis = fromNorm.cross(toNorm).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    
    return Matrix4.rotationFromAxisAngle(axis, angle);
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
    }
    // REMOVED: Special case for opposite vectors (dot ≈ -1) to ensure consistent behavior
    // Now -180 and -179 degrees use the same upright rotation procedure
    
    // STEP 1: Project vectors onto XY plane and align those projections
    const fv1_mag = Math.sqrt(a.x * a.x + a.y * a.y);
    const fv2_mag = Math.sqrt(b.x * b.x + b.y * b.y);
    
    // Handle case where one or both vectors are purely in Z direction
    if (fv1_mag < 1e-6 || fv2_mag < 1e-6) {
      // One or both vectors have no XY component - use direct rotation
      return this.createRotationMatrixFromNormals(a, b);
    }
    
    // Normalize XY projections (safe now since magnitudes are non-zero)
    const fv1 = new Vector3(a.x / fv1_mag, a.y / fv1_mag, 0);
    const fv2 = new Vector3(b.x / fv2_mag, b.y / fv2_mag, 0);
    
    // Calculate Z-rotation angle
    const dot_xy = fv1.x * fv2.x + fv1.y * fv2.y;
    let theta = -Math.acos(Math.max(-1, Math.min(1, dot_xy)));
    
    // Handle sign correctly (EUREKA logic: if b[1] < 0, adjust theta)
    // Special handling for opposite vectors to ensure consistent rotation direction
    const cross_z = fv1.x * fv2.y - fv1.y * fv2.x; // Z component of cross product
    if (cross_z < 0) {
      theta = -theta; // Adjust direction based on cross product sign
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
 * 
 * CRITICAL EUREKA METHODOLOGY DISTINCTION:
 * - Transformation matrices position surfaces at center of curvature for ray tracing math
 * - Mesh visualization must show surfaces at their vertices (where rays intersect)
 * - Local coordinate origin (0,0,0) represents the surface vertex
 * - Surface curvature extends into negative X direction from vertex
 */
export class SurfaceRenderer {
  
  /**
   * Generate spherical surface mesh
   * EUREKA methodology: Transform positions surfaces at center of curvature for ray tracing,
   * but mesh visualization must show surface at the vertex (where rays actually intersect).
   * Local coordinate system origin (0,0,0) represents the surface vertex.
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

    const r = Math.abs(radius);
    const effectiveSemidia = Math.min(semidia, r);
    const rad = Math.asin(effectiveSemidia / r);
    
    const thetaSteps = Math.max(6, Math.floor(resolution / 4));
    const phiSteps = Math.max(8, Math.floor(resolution * 1.5));

    // Add vertex at theta=0 (surface apex)
    const vertexLocalZ = 0;
    const vertexLocalY = 0;
    const vertexLocalX = 0; // Vertex is at local origin in surface coordinate system
    
    const [vertexWorldX, vertexWorldY, vertexWorldZ] = surface.inverseTransform.transformPoint(vertexLocalX, vertexLocalY, vertexLocalZ);
    vertices.push({ x: vertexWorldX, y: vertexWorldY, z: vertexWorldZ });

    // Generate sphere coordinates relative to vertex position
    for (let ti = 1; ti <= thetaSteps; ti++) {
      const theta = (ti / thetaSteps) * rad;
      
      for (let pi = 0; pi < phiSteps; pi++) {
        const phi = (pi / phiSteps) * 2 * Math.PI;
        
        const localZ = r * Math.sin(theta) * Math.cos(phi);
        const localY = r * Math.sin(theta) * Math.sin(phi);
        
        // CRITICAL: Handle positive vs negative radius for concave/convex surfaces
        // Positive radius: convex toward +X, surface curves into -X from vertex
        // Negative radius: concave toward +X, surface curves into +X from vertex
        const radiusSign = Math.sign(radius);
        const localX = - 1 * radiusSign * r * (Math.cos(theta) - 1); // Proper concave/convex handling
        const [worldX, worldY, worldZ] = surface.inverseTransform.transformPoint(localX, localY, localZ);
        vertices.push({ x: worldX, y: worldY, z: worldZ });
      }
    }

    // Apply surface normal * radius shift to position all vertices correctly in world system
    // NOTE: This shift is also needed for normal vectors and corner markers for consistent positioning
    const surfaceNormal = surface.normal || new Vector3(-1, 0, 0);
    const radiusShift = new Vector3(
      surfaceNormal.x * radius,
      surfaceNormal.y * radius,
      surfaceNormal.z * radius
    );
    
    // Shift all vertices by normal * radius to position faces correctly
    for (let i = 0; i < vertices.length; i++) {
      vertices[i].x += radiusShift.x;
      vertices[i].y += radiusShift.y;
      vertices[i].z += radiusShift.z;
    }

    // Generate triangular faces
    for (let ti = 0; ti < thetaSteps; ti++) {
      for (let pi = 0; pi < phiSteps; pi++) {
        if (ti === 0) {
          const firstRingCurrent = 1 + pi;
          const firstRingNext = 1 + ((pi + 1) % phiSteps);
          
          faces.push({
            i: 0,
            j: firstRingCurrent,
            k: firstRingNext
          });
        } else {
          const prevRingBase = 1 + (ti - 1) * phiSteps;
          const currentRingBase = 1 + ti * phiSteps;
          
          const prevCurrent = prevRingBase + pi;
          const prevNext = prevRingBase + ((pi + 1) % phiSteps);
          const currentCurrent = currentRingBase + pi;
          const currentNext = currentRingBase + ((pi + 1) % phiSteps);
          
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
   * Generate planar surface mesh
   * For planar surfaces, the vertex and center coincide at local origin (0,0,0).
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
    corners?: { x: number[]; y: number[]; z: number[] };
  } {
    const semidia = surface.semidia || 25;
    const height = surface.height || semidia * 2;
    const width = surface.width || semidia * 2;
    
    const vertices: { x: number; y: number; z: number }[] = [];
    const faces: { i: number; j: number; k: number }[] = [];

    // For circular aperture, create donut shape for aperture mode
    if (surface.semidia) {
      const angularSteps = Math.max(12, Math.floor(resolution * 1.2));
      
      const transformLocalPoint = (x: number, y: number, z: number) => {
        return OpticalSurfaceFactory.transformLocalToWorld(surface, x, y, z);
      };
      
      if (surface.mode === 'aperture') {
        // DONUT SHAPE for aperture surfaces
        // Inner radius (hole) = semidia, outer radius = semidia + donut width
        const innerRadius = semidia; // Hollow center
        const donutWidth = semidia / 2; // Width of donut rim = half of semidia
        const outerRadius = innerRadius + donutWidth;
        
        // Add inner rim vertices (hole edge)
        for (let i = 0; i < angularSteps; i++) {
          const theta = (i / angularSteps) * 2 * Math.PI;
          const localY = innerRadius * Math.cos(theta);
          const localZ = innerRadius * Math.sin(theta);
          
          const vertex = transformLocalPoint(0, localY, localZ);
          vertices.push(vertex);
        }
        
        // Add outer rim vertices (outside edge)
        for (let i = 0; i < angularSteps; i++) {
          const theta = (i / angularSteps) * 2 * Math.PI;
          const localY = outerRadius * Math.cos(theta);
          const localZ = outerRadius * Math.sin(theta);
          
          const vertex = transformLocalPoint(0, localY, localZ);
          vertices.push(vertex);
        }
        
        // Generate donut faces (connect inner and outer rims)
        for (let i = 0; i < angularSteps; i++) {
          const next = (i + 1) % angularSteps;
          
          // Inner rim indices: 0 to angularSteps-1
          // Outer rim indices: angularSteps to 2*angularSteps-1
          const innerCurrent = i;
          const innerNext = next;
          const outerCurrent = angularSteps + i;
          const outerNext = angularSteps + next;
          
          // Create two triangles for each donut segment
          faces.push({
            i: innerCurrent,
            j: outerCurrent,
            k: innerNext
          });
          
          faces.push({
            i: innerNext,
            j: outerCurrent,
            k: outerNext
          });
        }

        const donutColor = 'rgba(0, 0, 0, 0.9)'; // Black with 90% opacity for aperture blocking rim

        const result = {
          type: 'mesh3d',
          x: vertices.map(v => v.x),
          y: vertices.map(v => v.y),
          z: vertices.map(v => v.z),
          i: faces.map(f => f.i),
          j: faces.map(f => f.j),
          k: faces.map(f => f.k),
          opacity: surface.opacity || 0.9,
          color: donutColor,
          flatshading: true
        };

        return result;
      } else {
        // SOLID DISC for non-aperture circular surfaces
        // Add center vertex
        const centerVertex = transformLocalPoint(0, 0, 0);
        vertices.push(centerVertex);
        
        // Add rim vertices
        for (let i = 0; i < angularSteps; i++) {
          const theta = (i / angularSteps) * 2 * Math.PI;
          const localY = semidia * Math.cos(theta);
          const localZ = semidia * Math.sin(theta);
          
          const vertex = transformLocalPoint(0, localY, localZ);
          vertices.push(vertex);
        }
        
        // Generate pizza slice triangles
        for (let i = 0; i < angularSteps; i++) {
          const next = (i + 1) % angularSteps;
          faces.push({
            i: 0,
            j: 1 + i,
            k: 1 + next
          });
        }

        const circularColor = 'rgba(255,255,255,0.8)';

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
      }
    } else {
      // Rectangular aperture
      const halfHeight = height / 2;
      const halfWidth = width / 2;
      
      if (surface.mode === 'aperture') {
        // FRAME SHAPE for rectangular apertures
        // Create a frame with hollow center and blocking rim around the OUTSIDE
        const frameWidth = Math.min(halfWidth, halfHeight) / 2; // Frame thickness = half of smaller dimension
        
        // Define frame vertices: outer blocking rim + inner opening
        const outerCorners = [
          [0, -halfWidth - frameWidth, -halfHeight - frameWidth],  // Outer bottom-left (expanded outward)
          [0, halfWidth + frameWidth, -halfHeight - frameWidth],   // Outer bottom-right (expanded outward)
          [0, halfWidth + frameWidth, halfHeight + frameWidth],    // Outer top-right (expanded outward)
          [0, -halfWidth - frameWidth, halfHeight + frameWidth]    // Outer top-left (expanded outward)
        ];
        
        const innerCorners = [
          [0, -halfWidth, -halfHeight],          // Inner bottom-left (aperture opening)
          [0, halfWidth, -halfHeight],           // Inner bottom-right (aperture opening)
          [0, halfWidth, halfHeight],            // Inner top-right (aperture opening)
          [0, -halfWidth, halfHeight]            // Inner top-left (aperture opening)
        ];
        
        const transformLocalPoint = (x: number, y: number, z: number) => {
          return OpticalSurfaceFactory.transformLocalToWorld(surface, x, y, z);
        };
        
        // Add outer corners (blocking frame)
        outerCorners.forEach(([x, y, z]) => {
          const corner = transformLocalPoint(x, y, z);
          vertices.push(corner);
        });
        
        // Add inner corners (aperture opening)
        innerCorners.forEach(([x, y, z]) => {
          const corner = transformLocalPoint(x, y, z);
          vertices.push(corner);
        });
        
        // Create frame faces (connect outer blocking rim to inner opening)
        // Bottom frame strip (blocking area)
        faces.push({ i: 0, j: 1, k: 4 });  // Outer bottom to inner bottom-left
        faces.push({ i: 1, j: 5, k: 4 });  // Complete bottom strip
        
        // Right frame strip (blocking area)
        faces.push({ i: 1, j: 2, k: 5 });  // Outer right to inner right-bottom
        faces.push({ i: 2, j: 6, k: 5 });  // Complete right strip
        
        // Top frame strip (blocking area)
        faces.push({ i: 2, j: 3, k: 6 });  // Outer top to inner top-right
        faces.push({ i: 3, j: 7, k: 6 });  // Complete top strip
        
        // Left frame strip (blocking area)
        faces.push({ i: 3, j: 0, k: 7 });  // Outer left to inner left-top
        faces.push({ i: 0, j: 4, k: 7 });  // Complete left strip

        const frameColor = 'rgba(0, 0, 0, 0.3)'; // Black with 30% opacity for blocking frame

        const result = {
          type: 'mesh3d',
          x: vertices.map(v => v.x),
          y: vertices.map(v => v.y),
          z: vertices.map(v => v.z),
          i: faces.map(f => f.i),
          j: faces.map(f => f.j),
          k: faces.map(f => f.k),
          opacity: surface.opacity || 0.9,
          color: frameColor,
          flatshading: true,
          corners: {
            x: vertices.slice(4, 8).map(v => v.x), // Use inner corners for corner markers (aperture opening)
            y: vertices.slice(4, 8).map(v => v.y),
            z: vertices.slice(4, 8).map(v => v.z)
          }
        };

        return result;
      } else {
        // SOLID RECTANGLE for non-aperture rectangular surfaces
        const localCorners = [
          [0, -halfWidth, -halfHeight],
          [0, halfWidth, -halfHeight],
          [0, halfWidth, halfHeight],
          [0, -halfWidth, halfHeight]
        ];
        
        const worldCorners: { x: number; y: number; z: number }[] = [];
        
        const transformLocalPoint = (x: number, y: number, z: number) => {
          return OpticalSurfaceFactory.transformLocalToWorld(surface, x, y, z);
        };
        
        localCorners.forEach(([x, y, z]) => {
          const corner = transformLocalPoint(x, y, z);
          vertices.push(corner);
          worldCorners.push(corner);
        });
        
        faces.push({ i: 0, j: 1, k: 3 });
        faces.push({ i: 1, j: 2, k: 3 });

        const color = 'rgba(255,255,255,0.8)';

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
  }

  /**
   * Generate cylindrical surface mesh
   * EUREKA methodology: Mesh positioned at surface vertex (local origin),
   * with curvature extending into negative X direction.
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
    corners?: { x: number[]; y: number[]; z: number[] };
  } {
    const radius = surface.radius || 50;
    const height = surface.height || (surface.semidia ? surface.semidia * 2 : 50);
    const width = surface.width || (surface.semidia ? surface.semidia * 2 : 50);
    
    const vertices: { x: number; y: number; z: number }[] = [];
    const faces: { i: number; j: number; k: number }[] = [];

    const r = Math.abs(radius);
    const rad = Math.asin(0.5 * width / r);
    const thetaSteps = Math.max(8, Math.floor(resolution * 0.8));
    const zSteps = Math.max(4, Math.floor(resolution * 0.4));

    const transformLocalPoint = (x: number, y: number, z: number) => {
      return OpticalSurfaceFactory.transformLocalToWorld(surface, x, y, z);
    };

    // Generate vertices in grid pattern: theta × z
    for (let zi = 0; zi <= zSteps; zi++) {
      const z = ((zi / zSteps) - 0.5) * height;
      
      for (let ti = 0; ti <= thetaSteps; ti++) {
        const theta = -rad + (ti / thetaSteps) * (2 * rad);
        
        const localY = r * Math.sin(theta);
        let localX = 0;
        
        if (Math.abs(localY) <= r) {
          const radiusSign = radius >= 0 ? 1 : -1;
          localX = radiusSign * (r - Math.sqrt(r * r - localY * localY));
        } else {
          localX = 0;
        }
        
        const localZ = z;
        
        const vertex = transformLocalPoint(localX, localY, localZ);
        vertices.push(vertex);
      }
    }

    // Apply surface normal * radius shift to position all vertices correctly in world system
    // NOTE: This shift is also needed for normal vectors and corner markers for consistent positioning
    const surfaceNormal = surface.normal || new Vector3(-1, 0, 0);
    const radiusShift = new Vector3(
      surfaceNormal.x * radius,
      surfaceNormal.y * radius,
      surfaceNormal.z * radius
    );
    
    // Shift all vertices by normal * radius to position faces correctly
    for (let i = 0; i < vertices.length; i++) {
      vertices[i].x += radiusShift.x;
      vertices[i].y += radiusShift.y;
      vertices[i].z += radiusShift.z;
    }

    // Generate triangular faces
    for (let zi = 0; zi < zSteps; zi++) {
      for (let ti = 0; ti < thetaSteps; ti++) {
        const current = zi * (thetaSteps + 1) + ti;
        const right = current + 1;
        const below = (zi + 1) * (thetaSteps + 1) + ti;
        const belowRight = below + 1;
        
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

    // Apply surface normal * radius shift to corner markers for consistent positioning
    // NOTE: Same shift applied to mesh vertices and normal vectors
    for (let i = 0; i < worldCorners.length; i++) {
      worldCorners[i].x += radiusShift.x;
      worldCorners[i].y += radiusShift.y;
      worldCorners[i].z += radiusShift.z;
    }

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
    const apexWorld = OpticalSurfaceFactory.transformLocalToWorld(surface, apexLocal.x, apexLocal.y, apexLocal.z);
    let [apexX, apexY, apexZ] = [apexWorld.x, apexWorld.y, apexWorld.z];

    // Apply surface normal * radius shift for consistent positioning with mesh
    // NOTE: Same shift applied to mesh vertices to ensure normal aligns with visible surface
    const radius = surface.radius || 0;
    const surfaceNormal = surface.normal || new Vector3(-1, 0, 0);
    const radiusShift = new Vector3(
      surfaceNormal.x * radius,
      surfaceNormal.y * radius,
      surfaceNormal.z * radius
    );
    apexX += radiusShift.x;
    apexY += radiusShift.y;
    apexZ += radiusShift.z;

    let normalVec: Vector3;

    // CRITICAL: Use surface.transform (includes dial) to match visible mesh orientation
    // This ensures the displayed normal is perpendicular to what the user sees
    // Normal must be consistent with the mesh visualization for visual clarity
    const normalLocal = new Vector3(-1, 0, 0); // Default local normal direction
    const [normalX, normalY, normalZ] = surface.transform.transformVector(normalLocal.x, normalLocal.y, normalLocal.z);
    normalVec = new Vector3(normalX, normalY, normalZ).normalize();
    
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
