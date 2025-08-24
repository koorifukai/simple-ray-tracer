/**
 * 🧪 Simple Material Testing Script (CommonJS)
 * Run with: node src/tests/simple-material-test.cjs
 */

const fs = require('fs');
const path = require('path');

class SimpleMaterialTest {
  constructor() {
    this.glasses = new Map();
  }

  /**
   * Calculate refractive index using appropriate dispersion formula
   */
  calculateRefractiveIndex(glass, wavelength) {
    const λ = wavelength / 1000; // Convert nm to μm
    
    try {
      if (glass.manufacturer === 'SCHOTT') {
        // Schott Sellmeier formula: n² = 1 + B1λ²/(λ²-C1) + B2λ²/(λ²-C2) + B3λ²/(λ²-C3)
        const λ2 = λ * λ;
        const { b1, b2, b3, c1, c2, c3 } = glass.sellmeier;
        
        const n2 = 1 + 
          (b1 * λ2) / (λ2 - c1) +
          (b2 * λ2) / (λ2 - c2) +
          (b3 * λ2) / (λ2 - c3);
          
        return Math.sqrt(Math.max(n2, 1.0));
      } else if (glass.manufacturer === 'OHARA') {
        // Ohara uses same Sellmeier formula as Schott: n² - 1 = {A1 λ²/(λ² - B1)} + {A2 λ²/(λ² - B2)} + {A3 λ²/(λ² - B3)}
        // We store A1,A2,A3 in b1,b2,b3 and B1,B2,B3 in c1,c2,c3
        const λ2 = λ * λ;
        const { b1, b2, b3, c1, c2, c3 } = glass.sellmeier;
        
        const n2 = 1 + 
          (b1 * λ2) / (λ2 - c1) +
          (b2 * λ2) / (λ2 - c2) +
          (b3 * λ2) / (λ2 - c3);
          
        return Math.sqrt(Math.max(n2, 1.0));
      } else {
        return glass.nd; // Fallback
      }
    } catch (error) {
      console.log(`      ⚠️  ${glass.manufacturer} calculation error: ${error}`);
      return glass.nd; // Fallback to nd line
    }
  }

  /**
   * Parse Ohara CSV format  
   */
  /**
   * Parse Schott CSV
   */
  parseSchottCSV(csvData) {
    const lines = csvData.split('\n');
    let glassCount = 0;

    console.log('📋 Parsing Schott CSV...');
    console.log(`   Total lines: ${lines.length}`);
    
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(',');
      if (columns.length < 12) continue;

      try {
        const glassName = columns[0].trim();
        if (!glassName) continue;

        const nd = parseFloat(columns[1]);
        const b1 = parseFloat(columns[6]);
        const b2 = parseFloat(columns[7]);
        const b3 = parseFloat(columns[8]);
        const c1 = parseFloat(columns[9]);
        const c2 = parseFloat(columns[10]);
        const c3 = parseFloat(columns[11]);

        if (isNaN(nd) || nd < 1.0 || nd > 3.0) continue;

        const glass = {
          name: glassName,
          manufacturer: 'SCHOTT',
          nd: nd,
          sellmeier: { b1, b2, b3, c1, c2, c3 }
        };

        this.glasses.set(glassName.toUpperCase(), glass);
        glassCount++;
        
        if (glassName.toUpperCase().includes('SF11')) {
          console.log(`   🔍 Found SF11 variant: "${glassName}" (nd=${nd.toFixed(4)})`);
        }
      } catch (error) {
        continue;
      }
    }

    return glassCount;
  }

  /**
   * Parse Ohara CSV format  
   */
  parseOharaCSV(csvData) {
    const lines = csvData.split('\n');
    let glassCount = 0;

    console.log('📋 Parsing Ohara CSV...');
    console.log(`   Total lines: ${lines.length}`);

    // Skip header rows (first 2 lines)  
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(',');
      if (columns.length < 62) continue;

      try {
        const glassName = columns[1].trim(); // Column 2 in 1-based indexing
        if (!glassName) continue;

        const nd = parseFloat(columns[15]);  // Column 16: nd
        
        // Ohara Sellmeier coefficients A1,A2,A3,B1,B2,B3 in columns 60-65
        const a1 = parseFloat(columns[60]);  // A1
        const a2 = parseFloat(columns[61]);  // A2
        const a3 = parseFloat(columns[62]);  // A3
        const b1 = parseFloat(columns[63]);  // B1
        const b2 = parseFloat(columns[64]);  // B2
        const b3 = parseFloat(columns[65]);  // B3

        if (isNaN(nd) || nd < 1.0 || nd > 3.0) continue;

        const glass = {
          name: glassName,
          manufacturer: 'OHARA',
          nd: nd,
          sellmeier: { 
            // Store Ohara Sellmeier coefficients in same format as Schott
            b1: a1, b2: a2, b3: a3, 
            c1: b1, c2: b2, c3: b3 
          }
        };

        this.glasses.set(glassName.toUpperCase(), glass);
        glassCount++;
        
        if (glassName.toUpperCase().includes('FPL53') || glassName.toUpperCase().includes('SF11')) {
          console.log(`   🔍 Found Ohara material: "${glassName}" (nd=${nd.toFixed(4)})`);
          // Show the correct Sellmeier coefficients A1,A2,A3,B1,B2,B3
          console.log(`      Sellmeier: A1=${a1.toFixed(6)}, A2=${a2.toFixed(6)}, A3=${a3.toFixed(6)}`);
          console.log(`                 B1=${b1.toFixed(6)}, B2=${b2.toFixed(6)}, B3=${b3.toFixed(6)}`);
        }
      } catch (error) {
        continue;
      }
    }

    return glassCount;
  }

  /**
   * Run the test
   */
  async runTest() {
    console.log('🧪 ========== BOTH CATALOGS MATERIAL TEST ==========\n');
    
    try {
      // Load both Schott and Ohara catalogs
      const publicDir = path.join(process.cwd(), 'public', 'data', 'glass_catalogs');
      const schottFile = path.join(publicDir, 'schott-optical-glass-20250521.csv');
      const oharaFile = path.join(publicDir, 'OHARA_20250312_5.csv');
      
      console.log(`📂 Looking for files in: ${publicDir}`);
      
      if (!fs.existsSync(schottFile)) {
        console.error(`❌ Schott file not found: ${schottFile}`);
        return;
      }
      
      if (!fs.existsSync(oharaFile)) {
        console.error(`❌ Ohara file not found: ${oharaFile}`);
        return;
      }
      
      console.log('✅ Loading both catalogs...');
      const schottData = fs.readFileSync(schottFile, 'utf-8');
      const oharaData = fs.readFileSync(oharaFile, 'utf-8');
      
      console.log(`   Schott size: ${schottData.length} bytes`);
      console.log(`   Ohara size: ${oharaData.length} bytes\n`);
      
      const schottCount = this.parseSchottCSV(schottData);
      const oharaCount = this.parseOharaCSV(oharaData);
      
      console.log(`\n✅ Total glasses loaded: ${this.glasses.size}`);
      console.log(`   Schott: ${schottCount}`);
      console.log(`   Ohara: ${oharaCount}\n`);
      
      // Test specific materials including S-FPL53
      console.log('🔍 Testing specific materials...\n');
      
      const testMaterials = ['N-SF11', 'S-FPL53', 'S-FPL 53', 'SFPL53', 'N-BK7'];
      const wavelengths = [488, 532, 633];
      
      for (const material of testMaterials) {
        console.log(`🧪 Material: "${material}"`);
        
        const glass = this.glasses.get(material.toUpperCase());
        if (glass) {
          console.log(`   ✅ Found: ${glass.name} (${glass.manufacturer})`);
          console.log(`   📋 nd = ${glass.nd.toFixed(6)}`);
          console.log(`   📈 Refractive indices:`);
          
          for (const wl of wavelengths) {
            const n = this.calculateRefractiveIndex(glass, wl);
            const color = wl === 488 ? '🔵' : wl === 532 ? '🟢' : '🔴';
            console.log(`      ${color} ${wl}nm: n=${n.toFixed(6)}`);
          }
        } else {
          console.log(`   ❌ Not found in catalog`);
        }
        console.log('');
      }
      
      // Search for FPL53 variants
      console.log('🔍 Materials containing "FPL53":');
      let foundFPL = false;
      for (const [key, glass] of this.glasses.entries()) {
        if (key.includes('FPL53') || key.includes('FPL-53') || key.includes('FPL 53')) {
          console.log(`   ${glass.name} (${glass.manufacturer}) (nd=${glass.nd.toFixed(4)})`);
          foundFPL = true;
        }
      }
      if (!foundFPL) {
        console.log('   ❌ No FPL53 materials found');
      }
      
      // Show materials containing SF11
      console.log('\n🔍 Materials containing "SF11":');
      let foundSF11 = false;
      for (const [key, glass] of this.glasses.entries()) {
        if (key.includes('SF11')) {
          console.log(`   ${glass.name} (${glass.manufacturer}) (nd=${glass.nd.toFixed(4)})`);
          foundSF11 = true;
        }
      }
      if (!foundSF11) {
        console.log('   ❌ No SF11 materials found');
      }
      
      console.log('\n🎉 Test complete!');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  }
}

// Run the test
const tester = new SimpleMaterialTest();
tester.runTest();
