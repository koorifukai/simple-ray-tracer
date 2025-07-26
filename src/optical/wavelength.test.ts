/**
 * Test and demonstration of wavelength-to-RGB conversion
 * This file can be used to verify the optical wavelength color calculations
 */

import { wavelengthToRGB, rgbToCSSColor, getWavelengthColor, COMMON_WAVELENGTHS } from './wavelength';

/**
 * Test the wavelength conversion function with known values
 */
function testWavelengthConversion() {
  console.log('=== Wavelength to RGB Conversion Test ===');
  
  // Test common optical wavelengths
  const testWavelengths = [
    380,  // Violet edge
    400,  // Deep violet
    450,  // Blue
    500,  // Cyan
    550,  // Green
    600,  // Orange
    650,  // Red
    700,  // Deep red
    750,  // Red edge
    800   // Near IR (should be black)
  ];

  testWavelengths.forEach(wl => {
    const rgb = wavelengthToRGB(wl);
    const cssColor = rgbToCSSColor(rgb);
    console.log(`${wl}nm: RGB(${rgb.r.toFixed(3)}, ${rgb.g.toFixed(3)}, ${rgb.b.toFixed(3)}) -> ${cssColor}`);
  });

  console.log('\n=== Common Optical Design Wavelengths ===');
  Object.entries(COMMON_WAVELENGTHS).forEach(([name, wl]) => {
    const color = getWavelengthColor(wl);
    console.log(`${name}: ${wl}nm -> ${color}`);
  });
}

/**
 * Generate a wavelength spectrum for visualization
 */
function generateSpectrumData(startWl = 380, endWl = 750, steps = 50) {
  const data = [];
  const stepSize = (endWl - startWl) / steps;
  
  for (let i = 0; i <= steps; i++) {
    const wavelength = startWl + i * stepSize;
    const rgb = wavelengthToRGB(wavelength);
    const cssColor = rgbToCSSColor(rgb);
    
    data.push({
      wavelength,
      rgb,
      cssColor,
      intensity: rgb.r + rgb.g + rgb.b // Simple intensity measure
    });
  }
  
  return data;
}

/**
 * Validate that the function produces reasonable results
 */
function validateWavelengthFunction() {
  console.log('\n=== Wavelength Function Validation ===');
  
  // Test edge cases
  const edgeCases = [0, 350, 380, 750, 800, 1000];
  edgeCases.forEach(wl => {
    const rgb = wavelengthToRGB(wl);
    const isValid = rgb.r >= 0 && rgb.r <= 1 && 
                   rgb.g >= 0 && rgb.g <= 1 && 
                   rgb.b >= 0 && rgb.b <= 1;
    console.log(`${wl}nm: Valid RGB range: ${isValid}`);
  });

  // Test that visible spectrum produces non-zero colors
  const visibleRange = [400, 500, 600, 700];
  const hasColor = visibleRange.every(wl => {
    const rgb = wavelengthToRGB(wl);
    return (rgb.r + rgb.g + rgb.b) > 0;
  });
  console.log(`Visible spectrum produces colors: ${hasColor}`);

  // Test that IR/UV produce black
  const invisible = [300, 800];
  const isBlack = invisible.every(wl => {
    const rgb = wavelengthToRGB(wl);
    return (rgb.r + rgb.g + rgb.b) === 0;
  });
  console.log(`IR/UV wavelengths produce black: ${isBlack}`);
}

// Export test functions for use in development
export {
  testWavelengthConversion,
  generateSpectrumData,
  validateWavelengthFunction
};

// Run tests if this file is executed directly (for Node.js testing)
if (typeof window === 'undefined') {
  testWavelengthConversion();
  validateWavelengthFunction();
}
