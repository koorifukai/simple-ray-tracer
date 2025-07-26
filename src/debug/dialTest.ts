// Dial Rotation Analysis - Direct TypeScript Test
import { OpticalSurfaceFactory } from '../optical/surfaces';
import { Vector3 } from '../math/Vector3';

console.log('🔄 DIAL ROTATION DEBUG ANALYSIS\n');

// Create a simple surface with dial rotation
const surface = OpticalSurfaceFactory.createSurface(
  'debug-dial', 
  {
    shape: 'plano',
    normal: [1, 0, 0],  // Forward-pointing normal
    dial: 90,           // 90-degree dial rotation
    width: 10,
    height: 10
  },
  new Vector3(0, 0, 0)
);

console.log('=== SURFACE INFORMATION ===');
console.log(`Normal: [${surface.normal.x.toFixed(6)}, ${surface.normal.y.toFixed(6)}, ${surface.normal.z.toFixed(6)}]`);
console.log(`Position: [${surface.position.x.toFixed(3)}, ${surface.position.y.toFixed(3)}, ${surface.position.z.toFixed(3)}]`);

// Define local corners as used in the validation
const halfWidth = surface.width / 2;  // 5
const halfHeight = surface.height / 2; // 5

const localCorners = [
  new Vector3(0, -halfWidth, -halfHeight),  // [0, -5, -5] 
  new Vector3(0, halfWidth, -halfHeight),   // [0, 5, -5]
  new Vector3(0, halfWidth, halfHeight),    // [0, 5, 5]
  new Vector3(0, -halfWidth, halfHeight)    // [0, -5, 5]
];

console.log('\n=== LOCAL CORNERS (before any transform) ===');
localCorners.forEach((corner, i) => {
  console.log(`C${i}: [${corner.x.toFixed(1)}, ${corner.y.toFixed(1)}, ${corner.z.toFixed(1)}]`);
});

// Transform corners using the dial-affected transform
const worldCorners = localCorners.map(corner => {
  const [x, y, z] = surface.transform.transformPoint(corner.x, corner.y, corner.z);
  return new Vector3(x, y, z);
});

console.log('\n=== WORLD CORNERS (after dial transform) ===');
worldCorners.forEach((corner, i) => {
  console.log(`C${i}: [${corner.x.toFixed(6)}, ${corner.y.toFixed(6)}, ${corner.z.toFixed(6)}]`);
});

// Test perpendicularity to normal
console.log('\n=== PERPENDICULARITY CHECK ===');
console.log('Testing if corners lie in the plane perpendicular to normal...');

const normal = surface.normal;
const position = surface.position;

worldCorners.forEach((corner, i) => {
  // Vector from surface position to corner
  const relativePos = new Vector3(
    corner.x - position.x,
    corner.y - position.y,
    corner.z - position.z
  );
  
  // Dot product with normal (should be 0 for points in the perpendicular plane)
  const dotProduct = relativePos.x * normal.x + relativePos.y * normal.y + relativePos.z * normal.z;
  
  const isPerpendicular = Math.abs(dotProduct) < 1e-6;
  const status = isPerpendicular ? '✅' : '❌';
  
  console.log(`${status} C${i}: dot(rel_pos, normal) = ${dotProduct.toFixed(8)} ${isPerpendicular ? '(perpendicular)' : '(NOT perpendicular!)'}`);
});

// Expected behavior for 90° dial rotation around [1,0,0] axis:
console.log('\n=== EXPECTED vs ACTUAL ANALYSIS ===');
console.log('For 90° rotation around X-axis [1,0,0]:');
console.log('- Point [0,-5,-5] should become [0, 5,-5] (Y and Z swap, Z negated)');
console.log('- Point [0, 5,-5] should become [0, 5, 5] (Y stays, Z negated)');
console.log('- Point [0, 5, 5] should become [0,-5, 5] (Y negated, Z stays)');
console.log('- Point [0,-5, 5] should become [0,-5,-5] (Y stays, Z negated)');

console.log('\nActual transformations:');
localCorners.forEach((local, i) => {
  const world = worldCorners[i];
  console.log(`[${local.x.toFixed(1)}, ${local.y.toFixed(1)}, ${local.z.toFixed(1)}] → [${world.x.toFixed(3)}, ${world.y.toFixed(3)}, ${world.z.toFixed(3)}]`);
});

// Manual calculation check
console.log('\n=== MANUAL RODRIGUES FORMULA CHECK ===');
const axis = new Vector3(1, 0, 0); // Rotation axis
const angle = 90 * Math.PI / 180;  // 90 degrees in radians

console.log(`Rotation: ${90}° around [${axis.x}, ${axis.y}, ${axis.z}]`);

// Apply Rodrigues formula manually to first corner
const corner0 = localCorners[0]; // [0, -5, -5]
const c = Math.cos(angle);
const s = Math.sin(angle);

console.log(`cos(90°) = ${c.toFixed(6)}, sin(90°) = ${s.toFixed(6)}`);

// For rotation around X-axis: [x, y, z] → [x, y*cos - z*sin, y*sin + z*cos]
const manual_x = corner0.x;
const manual_y = corner0.y * c - corner0.z * s;
const manual_z = corner0.y * s + corner0.z * c;

console.log(`Manual calculation for [0, -5, -5]:`);
console.log(`  x = ${corner0.x} → ${manual_x}`);
console.log(`  y = ${corner0.y}*${c.toFixed(3)} - ${corner0.z}*${s.toFixed(3)} = ${manual_y.toFixed(6)}`);
console.log(`  z = ${corner0.y}*${s.toFixed(3)} + ${corner0.z}*${s.toFixed(3)} = ${manual_z.toFixed(6)}`);
console.log(`  Result: [${manual_x}, ${manual_y.toFixed(3)}, ${manual_z.toFixed(3)}]`);

console.log(`\nActual result: [${worldCorners[0].x.toFixed(3)}, ${worldCorners[0].y.toFixed(3)}, ${worldCorners[0].z.toFixed(3)}]`);

const matches = Math.abs(worldCorners[0].x - manual_x) < 1e-6 && 
               Math.abs(worldCorners[0].y - manual_y) < 1e-6 && 
               Math.abs(worldCorners[0].z - manual_z) < 1e-6;

console.log(`Manual vs Actual: ${matches ? '✅ MATCH' : '❌ MISMATCH'}`);

export {};
