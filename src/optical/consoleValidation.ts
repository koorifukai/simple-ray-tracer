/**
 * Console Ground Truth Validation Runner
 * Runs validation tests from the terminal without browser interaction
 */

import { GroundTruthValidator } from '../utils/GroundTruthValidator';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test data directory
const TESTS_DIR = join(__dirname, '../tests');

/**
 * Discover all test file pairs in the tests directory
 */
function discoverTestFiles(): Array<{name: string, yamlPath: string, expectedPath: string}> {
  try {
    const files = readdirSync(TESTS_DIR);
    const testFiles: Array<{name: string, yamlPath: string, expectedPath: string}> = [];
    
    // Find all .yml files and their corresponding .txt files
    const yamlFiles = files.filter(f => f.endsWith('.yml'));
    
    for (const yamlFile of yamlFiles) {
      const baseName = yamlFile.replace('.yml', '');
      const txtFile = baseName + '.txt';
      
      if (files.includes(txtFile)) {
        testFiles.push({
          name: baseName,
          yamlPath: join(TESTS_DIR, yamlFile),
          expectedPath: join(TESTS_DIR, txtFile)
        });
      } else {
        console.warn(`⚠️ Warning: Found ${yamlFile} but no corresponding ${txtFile}`);
      }
    }
    
    return testFiles;
  } catch (error) {
    console.error(`❌ Error discovering test files in ${TESTS_DIR}:`, error);
    return [];
  }
}

/**
 * Run ground truth validation from console
 */
async function runConsoleValidation() {
  console.log('🚀 Ground Truth Validation Console Runner');
  console.log('==========================================\n');
  
  try {
    // Discover test files
    console.log('📂 Discovering test files...');
    const testFiles = discoverTestFiles();
    
    if (testFiles.length === 0) {
      console.error('❌ No test files found in tests directory');
      process.exit(1);
    }
    
    console.log(`✅ Found ${testFiles.length} test file pair(s):`);
    testFiles.forEach(test => console.log(`   - ${test.name}`));
    console.log('');
    
    // Run validation for each test file
    let allTestsPassed = true;
    let totalPassedSurfaces = 0;
    let totalSurfaces = 0;
    
    for (const testFile of testFiles) {
      console.log(`🔍 Running test: ${testFile.name}`);
      console.log('-'.repeat(40));
      
      // Read test files
      const yamlContent = readFileSync(testFile.yamlPath, 'utf8');
      const expectedContent = readFileSync(testFile.expectedPath, 'utf8');
      
      // Run validation
      const results = await GroundTruthValidator.validateSystem(yamlContent, expectedContent);
      
      // Track overall results
      totalPassedSurfaces += results.passedSurfaces;
      totalSurfaces += results.totalSurfaces;
      
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
      }
      console.log('');
    }
    
    // Print overall summary
    console.log('='.repeat(50));
    if (allTestsPassed) {
      console.log('🎉 ALL TESTS PASSED! ');
      console.log(`✅ ${totalPassedSurfaces}/${totalSurfaces} surfaces validated successfully across ${testFiles.length} test file(s)`);
    } else {
      console.log('❌ SOME TESTS FAILED!');
      console.log(`⚠️  ${totalPassedSurfaces}/${totalSurfaces} surfaces passed across ${testFiles.length} test file(s)`);
      console.log(`❌ ${totalSurfaces - totalPassedSurfaces} surfaces failed validation`);
    }
    console.log('='.repeat(50) + '\n');
    
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
