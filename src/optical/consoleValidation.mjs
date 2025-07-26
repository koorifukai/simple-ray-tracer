/**
 * Console Ground Truth Validation Runner
 * Runs validation tests from the terminal without browser interaction
 */

import { GroundTruthValidator } from '../utils/GroundTruthValidator.ts';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test data paths
const SURFACE_TESTS_YAML = join(__dirname, '../tests/SurfaceTests.yml');
const SURFACE_TESTS_EXPECTED = join(__dirname, '../tests/SurfaceTests.txt');

/**
 * Run ground truth validation from console
 */
async function runConsoleValidation() {
  console.log('🚀 Ground Truth Validation Console Runner');
  console.log('==========================================\n');
  
  try {
    // Read test files
    console.log('📂 Loading test files...');
    const yamlContent = readFileSync(SURFACE_TESTS_YAML, 'utf8');
    const expectedContent = readFileSync(SURFACE_TESTS_EXPECTED, 'utf8');
    console.log('✅ Test files loaded successfully\n');
    
    // Run validation
    console.log('🔍 Running ground truth validation...');
    const results = await GroundTruthValidator.validateSystem(yamlContent, expectedContent);
    
    // Print summary
    console.log('\n' + '='.repeat(50));
    if (results.passed) {
      console.log('🎉 ALL TESTS PASSED! ');
      console.log(`✅ ${results.passedSurfaces}/${results.totalSurfaces} surfaces validated successfully`);
    } else {
      console.log('❌ TESTS FAILED!');
      console.log(`⚠️  ${results.passedSurfaces}/${results.totalSurfaces} surfaces passed`);
      console.log(`❌ ${results.totalSurfaces - results.passedSurfaces} surfaces failed validation`);
    }
    console.log('='.repeat(50) + '\n');
    
    // Print detailed results for failures
    const failedTests = results.results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      console.log('🔍 DETAILED FAILURE ANALYSIS:');
      console.log('-'.repeat(30));
      
      failedTests.forEach(result => {
        console.log(`\n❌ Surface ${result.surfaceId} FAILED:`);
        result.issues.forEach(issue => {
          console.log(`   • ${issue}`);
        });
        
        // Show expected vs actual for key values
        if (result.actual) {
          console.log('   Expected vs Actual:');
          console.log(`   Position: [${result.expected.position.join(', ')}] vs [${result.actual.position.join(', ')}]`);
          console.log(`   Normal:   [${result.expected.normal.join(', ')}] vs [${result.actual.normal.join(', ')}]`);
        }
      });
    }
    
    // Exit with appropriate code
    process.exit(results.passed ? 0 : 1);
    
  } catch (error) {
    console.error('💥 VALIDATION RUNNER FAILED:');
    console.error(error);
    process.exit(2);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runConsoleValidation();
}

export { runConsoleValidation };
