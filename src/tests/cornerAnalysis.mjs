#!/usr/bin/env node
/**
 * Corner Analysis Test - Standalone Investigation
 * 
 * This script systematically investigates corner generation accuracy
 * by comparing our implementation against ground truth data.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadGroundTruthData() {
  const testDataPath = join(__dirname, 'SurfaceTests.txt');
  const testData = readFileSync(testDataPath, 'utf-8');
  
  const surfaces = [];
  const lines = testData.split('\n');
  let currentSurface = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (trimmed.startsWith('Surface ')) {
      if (currentSurface.name) {
        surfaces.push(currentSurface);
      }
      currentSurface = { name: trimmed, corners: [] };
    } else if (trimmed.startsWith('Position:')) {
      const coords = trimmed.substring(9).trim().split(/\s+/).map(Number);
      currentSurface.position = coords;
    } else if (trimmed.startsWith('Normal:')) {
      const coords = trimmed.substring(7).trim().split(/\s+/).map(Number);
      currentSurface.normal = coords;
    } else if (trimmed.startsWith('Corner ')) {
      const coords = trimmed.split(':')[1].trim().split(/\s+/).map(Number);
      currentSurface.corners.push(coords);
    }
  }
  
  if (currentSurface.name) {
    surfaces.push(currentSurface);
  }
  
  return surfaces;
}

async function parseYamlSurfaces() {
  const yamlPath = join(__dirname, 'SurfaceTests.yml');
  const yamlContent = readFileSync(yamlPath, 'utf-8');
  
  // Simple YAML parser for our specific format
  const surfaces = [];
  const lines = yamlContent.split('\n');
  let currentSurface = {};
  let inSurfaces = false;
  let inOpticalTrains = false;
  let inAssemblies = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('surfaces:')) {
      inSurfaces = true;
      inOpticalTrains = false;
      inAssemblies = false;
      continue;
    } else if (trimmed.startsWith('optical_trains:')) {
      inOpticalTrains = true;
      inSurfaces = false;
      inAssemblies = false;
      continue;
    } else if (trimmed.startsWith('assemblies:')) {
      inAssemblies = true;
      inSurfaces = false;
      inOpticalTrains = false;
      continue;
    }
    
    if (inSurfaces && trimmed.startsWith('- sid:')) {
      if (Object.keys(currentSurface).length > 0) {
        surfaces.push(currentSurface);
      }
      currentSurface = {};
      const sid = parseInt(trimmed.split(':')[1].trim());
      currentSurface.sid = sid;
    } else if (inSurfaces && trimmed.includes(':') && !trimmed.startsWith('-')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();
      
      if (value && !value.startsWith('-')) {
        // Parse different types
        if (value.startsWith('"') && value.endsWith('"')) {
          currentSurface[key] = value.slice(1, -1);
        } else if (!isNaN(Number(value))) {
          currentSurface[key] = Number(value);
        } else if (value.startsWith('[') && value.endsWith(']')) {
          // Parse array
          const arrayStr = value.slice(1, -1);
          currentSurface[key] = arrayStr.split(',').map(s => Number(s.trim()));
        } else {
          currentSurface[key] = value;
        }
      }
    }
  }
  
  if (Object.keys(currentSurface).length > 0) {
    surfaces.push(currentSurface);
  }
  
  return surfaces;
}

function calculateCornerError(actual, expected) {
  if (actual.length !== expected.length) {
    return {
      maxError: Infinity,
      details: `Corner count mismatch: ${actual.length} vs ${expected.length}`
    };
  }
  
  // Find best matching between actual and expected corners
  const used = new Array(expected.length).fill(false);
  let maxError = 0;
  const errors = [];
  
  for (let i = 0; i < actual.length; i++) {
    let bestMatch = -1;
    let bestDistance = Infinity;
    
    for (let j = 0; j < expected.length; j++) {
      if (used[j]) continue;
      
      const distance = Math.sqrt(
        Math.pow(actual[i][0] - expected[j][0], 2) +
        Math.pow(actual[i][1] - expected[j][1], 2) +
        Math.pow(actual[i][2] - expected[j][2], 2)
      );
      
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = j;
      }
    }
    
    if (bestMatch !== -1) {
      used[bestMatch] = true;
      maxError = Math.max(maxError, bestDistance);
      
      if (bestDistance > 1e-4) {
        errors.push(`Corner ${i} error: ${bestDistance.toFixed(6)}`);
      }
    }
  }
  
  return {
    maxError: maxError,
    details: errors.length > 0 ? errors.join('; ') : 'PASS'
  };
}

async function analyzeCornerGeneration() {
  console.log('\n=== CORNER GENERATION ANALYSIS ===\n');
  
  try {
    // Load data
    const groundTruthData = await loadGroundTruthData();
    const yamlSurfaces = await parseYamlSurfaces();
    
    console.log(`Loaded ${groundTruthData.length} ground truth surfaces`);
    console.log(`Loaded ${yamlSurfaces.length} YAML surface definitions`);
    console.log('');
    
    // Import dynamic modules
    const { OpticalSurfaceFactory } = await import('../optical/surfaces.js');
    const { GroundTruthValidator } = await import('../utils/GroundTruthValidator.js');
    
    const factory = new OpticalSurfaceFactory();
    const results = [];
    
    let totalSurfaces = 0;
    let passingCorners = 0;
    let failingCorners = 0;
    let dialSurfaces = 0;
    let nonDialSurfaces = 0;
    
    // Process each surface
    for (const yamlSurface of yamlSurfaces) {
      totalSurfaces++;
      
      // Find corresponding ground truth
      const groundTruth = groundTruthData.find(gt => 
        gt.name.includes(`Surface ${yamlSurface.sid}`) || 
        gt.name.includes(`s${yamlSurface.sid}`)
      );
      
      if (!groundTruth) {
        console.log(`⚠️  No ground truth found for surface ${yamlSurface.sid}`);
        continue;
      }
      
      try {
        // Create surface
        const surface = factory.createSurface(yamlSurface);
        
        // Check for dial
        const hasDial = surface.localDialAngle !== undefined || yamlSurface.dial !== undefined;
        if (hasDial) {
          dialSurfaces++;
        } else {
          nonDialSurfaces++;
        }
        
        // Generate corners
        const actualCorners = GroundTruthValidator.getSurfaceCorners(surface);
        
        // Compare corners
        const { maxError, details } = calculateCornerError(actualCorners, groundTruth.corners);
        const cornersMatch = maxError <= 1e-4;
        
        if (cornersMatch) {
          passingCorners++;
        } else {
          failingCorners++;
        }
        
        results.push({
          name: `Surface ${yamlSurface.sid}`,
          hasDial: hasDial,
          cornersMatch: cornersMatch,
          maxError: maxError,
          details: details
        });
        
        // Detailed output
        console.log(`Surface ${yamlSurface.sid}:`);
        console.log(`  Dial: ${hasDial ? 'YES' : 'NO'} ${yamlSurface.dial ? `(${yamlSurface.dial}°)` : ''}`);
        console.log(`  Match: ${cornersMatch ? 'PASS' : 'FAIL'}`);
        console.log(`  Max Error: ${maxError.toFixed(6)}`);
        if (!cornersMatch && maxError !== Infinity) {
          console.log(`  Details: ${details}`);
        }
        if (!cornersMatch) {
          console.log(`  Expected: ${JSON.stringify(groundTruth.corners.map(c => c.map(n => Number(n.toFixed(3)))))}`);
          console.log(`  Actual:   ${JSON.stringify(actualCorners.map(c => c.map(n => Number(n.toFixed(3)))))}`);
        }
        console.log('');
        
      } catch (error) {
        console.error(`❌ Error processing Surface ${yamlSurface.sid}:`, error);
        failingCorners++;
        results.push({
          name: `Surface ${yamlSurface.sid}`,
          hasDial: false,
          cornersMatch: false,
          maxError: Infinity,
          details: `Error: ${error}`
        });
      }
    }
    
    // Summary analysis
    console.log('=== SUMMARY ANALYSIS ===');
    console.log(`Total surfaces: ${totalSurfaces}`);
    console.log(`Passing corners: ${passingCorners}`);
    console.log(`Failing corners: ${failingCorners}`);
    console.log(`Surfaces with dial: ${dialSurfaces}`);
    console.log(`Surfaces without dial: ${nonDialSurfaces}`);
    console.log('');
    
    // Pattern analysis
    const dialPassing = results.filter(r => r.hasDial && r.cornersMatch).length;
    const dialFailing = results.filter(r => r.hasDial && !r.cornersMatch).length;
    const nonDialPassing = results.filter(r => !r.hasDial && r.cornersMatch).length;
    const nonDialFailing = results.filter(r => !r.hasDial && !r.cornersMatch).length;
    
    console.log('=== PATTERN ANALYSIS ===');
    console.log(`Dial surfaces - Passing: ${dialPassing}, Failing: ${dialFailing}`);
    console.log(`Non-dial surfaces - Passing: ${nonDialPassing}, Failing: ${nonDialFailing}`);
    
    if (dialFailing > 0 && nonDialPassing >= nonDialFailing) {
      console.log('');
      console.log('🔍 PATTERN DETECTED: Dial surfaces are failing disproportionately');
      console.log('   This suggests the issue is specifically with dial rotation implementation');
      
      // Analyze dial error patterns
      const dialErrors = results.filter(r => r.hasDial && !r.cornersMatch && r.maxError !== Infinity);
      if (dialErrors.length > 0) {
        const avgError = dialErrors.reduce((sum, r) => sum + r.maxError, 0) / dialErrors.length;
        const minError = Math.min(...dialErrors.map(r => r.maxError));
        const maxErrorVal = Math.max(...dialErrors.map(r => r.maxError));
        
        console.log(`   Dial error range: ${minError.toFixed(6)} to ${maxErrorVal.toFixed(6)}`);
        console.log(`   Average dial error: ${avgError.toFixed(6)}`);
      }
    }
    
    if (nonDialFailing > 0) {
      console.log('');
      console.log('⚠️  WARNING: Some non-dial surfaces are also failing');
      console.log('   This suggests the issue may be broader than just dial rotation');
    }
    
    return {
      totalSurfaces,
      passingCorners,
      failingCorners,
      dialSurfaces,
      nonDialSurfaces,
      results
    };
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    throw error;
  }
}

// Run the analysis
analyzeCornerGeneration()
  .then((results) => {
    console.log('\n🎯 Analysis completed successfully!');
    process.exit(results.failingCorners === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n💥 Analysis failed:', error);
    process.exit(1);
  });
