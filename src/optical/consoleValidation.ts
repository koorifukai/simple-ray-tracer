/**
 * Console Ground Truth Validation Runner
 * Runs validation tests from the terminal without browser interaction
 */

import { GroundTruthValidator } from '../utils/GroundTruthValidator';
import { ConvergenceValidator } from '../utils/ConvergenceValidator';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test data directories
const POSITION_TESTS_DIR = join(__dirname, '../tests/position');
const INTERACTION_TESTS_DIR = join(__dirname, '../tests/interaction');

/**
 * Discover position test file pairs (YAML + TXT)
 */
function discoverPositionTests(): Array<{name: string, yamlPath: string, expectedPath: string}> {
  try {
    const files = readdirSync(POSITION_TESTS_DIR);
    const testFiles: Array<{name: string, yamlPath: string, expectedPath: string}> = [];
    
    // Find all .yml files and their corresponding .txt files
    const yamlFiles = files.filter(f => f.endsWith('.yml'));
    
    for (const yamlFile of yamlFiles) {
      const baseName = yamlFile.replace('.yml', '');
      const txtFile = baseName + '.txt';
      
      if (files.includes(txtFile)) {
        testFiles.push({
          name: baseName,
          yamlPath: join(POSITION_TESTS_DIR, yamlFile),
          expectedPath: join(POSITION_TESTS_DIR, txtFile)
        });
      } else {
        console.warn(`⚠️ Warning: Found ${yamlFile} but no corresponding ${txtFile}`);
      }
    }
    
    return testFiles;
  } catch (error) {
    console.error(`❌ Error discovering position test files in ${POSITION_TESTS_DIR}:`, error);
    return [];
  }
}

/**
 * Discover interaction test files (YAML only - test ray convergence)
 */
function discoverInteractionTests(): Array<{name: string, yamlPath: string}> {
  try {
    const files = readdirSync(INTERACTION_TESTS_DIR);
    const testFiles: Array<{name: string, yamlPath: string}> = [];
    
    // Find all .yml files for convergence testing
    const yamlFiles = files.filter(f => f.endsWith('.yml'));
    
    for (const yamlFile of yamlFiles) {
      const baseName = yamlFile.replace('.yml', '');
      testFiles.push({
        name: baseName,
        yamlPath: join(INTERACTION_TESTS_DIR, yamlFile)
      });
    }
    
    return testFiles;
  } catch (error) {
    console.error(`❌ Error discovering interaction test files in ${INTERACTION_TESTS_DIR}:`, error);
    return [];
  }
}

/**
 * Run ground truth validation from console
 */
async function runConsoleValidation() {
  console.log('🚀 Optical System Validation Console Runner');
  console.log('==========================================\n');
  
  try {
    // Discover both types of test files
    console.log('📂 Discovering test files...');
    const positionTests = discoverPositionTests();
    const interactionTests = discoverInteractionTests();
    
    const totalTests = positionTests.length + interactionTests.length;
    
    if (totalTests === 0) {
      console.error('❌ No test files found in test directories');
      process.exit(1);
    }
    
    console.log(`✅ Found ${positionTests.length} position test(s) and ${interactionTests.length} interaction test(s):`);
    positionTests.forEach((test: any) => console.log(`   - Position: ${test.name}`));
    interactionTests.forEach((test: any) => console.log(`   - Interaction: ${test.name}`));
    console.log('');
    
    // Run validation for each test file
    let allTestsPassed = true;
    let totalPassedTests = 0;
    
    // Run position tests (ground truth validation)
    console.log('🎯 Running Position Tests (Ground Truth Validation)');
    console.log('='.repeat(60));
    
    for (const testFile of positionTests) {
      console.log(`🔍 Running position test: ${testFile.name}`);
      console.log('-'.repeat(40));
      
      // Read test files
      const yamlContent = readFileSync(testFile.yamlPath, 'utf8');
      const expectedContent = readFileSync(testFile.expectedPath, 'utf8');
      
      // Run validation
      const results = await GroundTruthValidator.validateSystem(yamlContent, expectedContent);
      
      if (!results.passed) {
        allTestsPassed = false;
        console.log(`❌ ${testFile.name}: ${results.passedSurfaces}/${results.totalSurfaces} surfaces passed`);
        
        // Show detailed failures for this test
        const failedTests = results.results.filter(r => !r.passed);
        failedTests.forEach(result => {
          console.log(`   ❌ Surface ${result.surfaceId}: ${result.issues.join(', ')}`);
        });
      } else {
        console.log(`✅ ${testFile.name}: All ${results.totalSurfaces} surfaces passed`);
        totalPassedTests++;
      }
      console.log('');
    }
    
    // Run interaction tests (ray convergence validation)
    console.log('🎯 Running Interaction Tests (Ray Convergence Validation)');
    console.log('='.repeat(60));
    
    for (const testFile of interactionTests) {
      console.log(`🔍 Running interaction test: ${testFile.name}`);
      console.log('-'.repeat(40));
      
      // Read test file
      const yamlContent = readFileSync(testFile.yamlPath, 'utf8');
      
      // Run convergence validation
      const results = await ConvergenceValidator.validateConvergence(yamlContent);
      
      if (!results.passed) {
        allTestsPassed = false;
        console.log(`❌ ${testFile.name}: Ray convergence failed`);
        console.log(`   Spot size: ${results.spotSize.width.toFixed(4)} x ${results.spotSize.height.toFixed(4)} (max: ${results.maxAllowedSize})`);
        console.log(`   Rays: ${results.convergedRays}/${results.totalRays} reached target`);
        
        // Show detailed issues
        results.issues.forEach(issue => {
          console.log(`   ❌ ${issue}`);
        });
      } else {
        console.log(`✅ ${testFile.name}: Ray convergence passed`);
        console.log(`   Spot size: ${results.spotSize.width.toFixed(4)} x ${results.spotSize.height.toFixed(4)} (max: ${results.maxAllowedSize})`);
        console.log(`   Rays: ${results.convergedRays}/${results.totalRays} converged successfully`);
        totalPassedTests++;
      }
      console.log('');
    }
    
    // Print overall summary
    console.log('='.repeat(70));
    if (allTestsPassed) {
      console.log('🎉 ALL TESTS PASSED! ');
      console.log(`✅ ${totalPassedTests}/${totalTests} test(s) validated successfully`);
      console.log(`   - ${positionTests.length} position test(s)`);
      console.log(`   - ${interactionTests.length} interaction test(s)`);
    } else {
      console.log('❌ SOME TESTS FAILED!');
      console.log(`⚠️  ${totalPassedTests}/${totalTests} test(s) passed`);
      console.log(`❌ ${totalTests - totalPassedTests} test(s) failed validation`);
    }
    console.log('='.repeat(70) + '\n');
    
    // Exit with appropriate code
    process.exit(allTestsPassed ? 0 : 1);
    
  } catch (error) {
    console.error('💥 VALIDATION RUNNER FAILED:');
    console.error(error);
    process.exit(2);
  }
}

// Run if called directly
runConsoleValidation();
