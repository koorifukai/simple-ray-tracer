/**
 * Geometry debugging utilities for optical ray tracing
 * Provides detailed logging and validation for matrix transformations
 */

import { Matrix4, Vector3 } from '../math/Matrix4';

export class GeometryDebugger {
  private static verbose = false;

  /**
   * Enable/disable verbose debugging output
   */
  static setVerbose(enabled: boolean): void {
    this.verbose = enabled;
  }

  /**
   * Format vector for display
   */
  private static formatVector(vec: Vector3, precision: number = 3): string {
    return `[${vec.x.toFixed(precision)}, ${vec.y.toFixed(precision)}, ${vec.z.toFixed(precision)}]`;
  }

  /**
   * Log matrix transformation details
   */
  static logTransformation(
    name: string, 
    matrix: Matrix4, 
    inputVector?: Vector3, 
    outputVector?: Vector3
  ): void {
    if (!this.verbose) return;

    console.log(`\n=== ${name} Transformation ===`);
    console.log(matrix.toString(4));
    
    if (inputVector && outputVector) {
      console.log(`Input:  ${this.formatVector(inputVector, 4)}`);
      console.log(`Output: ${this.formatVector(outputVector, 4)}`);
      console.log(`Length change: ${inputVector.length().toFixed(4)} → ${outputVector.length().toFixed(4)}`);
    }
    
    console.log(`Determinant: ${matrix.determinant().toFixed(6)}`);
    console.log('===================================\n');
  }

  /**
   * Validate matrix properties for optical transformations
   */
  static validateTransformationMatrix(name: string, matrix: Matrix4): boolean {
    const det = matrix.determinant();
    const translation = matrix.getTranslation();
    const rotation = matrix.getRotationMatrix();
    
    console.log(`\n--- Validating ${name} Matrix ---`);
    
    // Check determinant (should be close to ±1 for proper transformations)
    if (Math.abs(Math.abs(det) - 1.0) > 1e-6) {
      console.warn(`⚠️  Determinant ${det.toFixed(6)} is not ±1, matrix may not preserve distances`);
      return false;
    }
    
    // Check if rotation part is orthogonal
    const rotTranspose = this.transposeRotation(rotation);
    const shouldBeIdentity = rotation.multiply(rotTranspose);
    const identity = new Matrix4();
    
    if (!shouldBeIdentity.equals(identity, 1e-6)) {
      console.warn(`⚠️  Rotation matrix is not orthogonal`);
      return false;
    }
    
    console.log(`✅ ${name} matrix is valid`);
    console.log(`   Translation: ${this.formatVector(translation, 3)}`);
    console.log(`   Determinant: ${det.toFixed(6)}`);
    console.log('-----------------------------\n');
    
    return true;
  }

  /**
   * Transpose the rotation part of a 4x4 matrix
   */
  private static transposeRotation(matrix: Matrix4): Matrix4 {
    const result = new Matrix4();
    const e = matrix.elements;
    
    // Transpose upper-left 3x3
    result.elements[0] = e[0];   // m00
    result.elements[1] = e[4];   // m10
    result.elements[2] = e[8];   // m20
    result.elements[4] = e[1];   // m01
    result.elements[5] = e[5];   // m11
    result.elements[6] = e[9];   // m21
    result.elements[8] = e[2];   // m02
    result.elements[9] = e[6];   // m12
    result.elements[10] = e[10]; // m22
    
    // Bottom row and right column remain identity
    return result;
  }

  /**
   * Compare expected vs actual results with detailed error analysis
   */
  static compareResults(
    name: string,
    expected: Vector3,
    actual: Vector3,
    tolerance: number = 1e-6
  ): boolean {
    const diff = actual.subtract(expected);
    const error = diff.length();
    
    console.log(`\n--- Comparing ${name} ---`);
    console.log(`Expected: ${this.formatVector(expected, 6)}`);
    console.log(`Actual:   ${this.formatVector(actual, 6)}`);
    console.log(`Diff:     ${this.formatVector(diff, 6)}`);
    console.log(`Error:    ${error.toExponential(3)}`);
    console.log(`Tolerance: ${tolerance.toExponential(3)}`);
    
    if (error <= tolerance) {
      console.log(`✅ ${name} PASS`);
      return true;
    } else {
      console.log(`❌ ${name} FAIL (error ${error.toExponential(3)} > ${tolerance.toExponential(3)})`);
      return false;
    }
  }

  /**
   * Log assembly transformation pipeline
   */
  static logAssemblyPipeline(
    assemblyId: string,
    localPosition: Vector3,
    assemblyMatrix: Matrix4,
    finalPosition: Vector3,
    relativeNormal: Vector3,
    finalNormal: Vector3
  ): void {
    if (!this.verbose) return;

    console.log(`\n🔧 Assembly ${assemblyId} Transformation Pipeline`);
    console.log(`┌─ Local Position: ${this.formatVector(localPosition, 3)}`);
    console.log(`├─ Assembly Matrix:`);
    
    // Log matrix in readable format
    const e = assemblyMatrix.elements;
    console.log(`├─ [${e[0].toFixed(3)}, ${e[1].toFixed(3)}, ${e[2].toFixed(3)}, ${e[3].toFixed(3)}]`);
    console.log(`├─ [${e[4].toFixed(3)}, ${e[5].toFixed(3)}, ${e[6].toFixed(3)}, ${e[7].toFixed(3)}]`);
    console.log(`├─ [${e[8].toFixed(3)}, ${e[9].toFixed(3)}, ${e[10].toFixed(3)}, ${e[11].toFixed(3)}]`);
    console.log(`├─ [${e[12].toFixed(3)}, ${e[13].toFixed(3)}, ${e[14].toFixed(3)}, ${e[15].toFixed(3)}]`);
    
    console.log(`├─ Final Position: ${this.formatVector(finalPosition, 3)}`);
    console.log(`├─ Relative Normal: ${this.formatVector(relativeNormal, 3)}`);
    console.log(`└─ Final Normal: ${this.formatVector(finalNormal, 3)}`);
    console.log(`🔧 End Pipeline\n`);
  }

  /**
   * Log coordinate system transformation details
   */
  static logCoordinateSystem(
    name: string,
    forward: Vector3,
    right: Vector3,
    up: Vector3
  ): void {
    if (!this.verbose) return;

    console.log(`\n📐 ${name} Coordinate System:`);
    console.log(`   Forward: ${this.formatVector(forward, 3)} (length: ${forward.length().toFixed(3)})`);
    console.log(`   Right:   ${this.formatVector(right, 3)} (length: ${right.length().toFixed(3)})`);
    console.log(`   Up:      ${this.formatVector(up, 3)} (length: ${up.length().toFixed(3)})`);
    
    // Verify orthogonality
    const forwardRightDot = forward.dot(right);
    const forwardUpDot = forward.dot(up);
    const rightUpDot = right.dot(up);
    
    console.log(`   Orthogonality check:`);
    console.log(`     Forward·Right: ${forwardRightDot.toFixed(6)} (should be ~0)`);
    console.log(`     Forward·Up:    ${forwardUpDot.toFixed(6)} (should be ~0)`);
    console.log(`     Right·Up:      ${rightUpDot.toFixed(6)} (should be ~0)`);
    
    const isOrthogonal = Math.abs(forwardRightDot) < 1e-6 && 
                        Math.abs(forwardUpDot) < 1e-6 && 
                        Math.abs(rightUpDot) < 1e-6;
    
    console.log(`   ${isOrthogonal ? '✅' : '❌'} Coordinate system is ${isOrthogonal ? 'orthogonal' : 'NOT orthogonal'}`);
    console.log(`📐 End Coordinate System\n`);
  }

  /**
   * Performance timing utilities
   */
  private static timers: Map<string, number> = new Map();

  static startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }

  static endTimer(name: string): number {
    const start = this.timers.get(name);
    if (!start) {
      console.warn(`Timer '${name}' was not started`);
      return 0;
    }
    
    const elapsed = performance.now() - start;
    this.timers.delete(name);
    
    if (this.verbose) {
      console.log(`⏱️  ${name}: ${elapsed.toFixed(3)}ms`);
    }
    
    return elapsed;
  }
}
