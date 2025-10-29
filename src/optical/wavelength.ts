/**
 * Optical wavelength utilities for ray tracing visualization
 */

/**
 * RGB color representation
 */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Convert wavelength in nanometers to RGB color values
 * Based on the visible spectrum approximation
 * 
 * @param wavelength Wavelength in nanometers (380-750nm typical visible range)
 * @param gamma Gamma correction factor (default 0.8)
 * @returns RGB color values in range [0, 1]
 */
export function wavelengthToRGB(wavelength: number, gamma: number = 0.8): RGB {
  const wl = parseFloat(wavelength.toString());
  let r = 0.0;
  let g = 0.0;
  let b = 0.0;

  if (wl >= 380 && wl <= 440) {
    const attenuation = 0.3 + 0.7 * (wl - 380) / (440 - 380);
    r = Math.pow((-(wl - 440) / (440 - 380)) * attenuation, gamma);
    g = 0.0;
    b = Math.pow(1.0 * attenuation, gamma);
  } else if (wl >= 440 && wl <= 490) {
    r = 0.0;
    g = Math.pow((wl - 440) / (490 - 440), gamma);
    b = 1.0;
  } else if (wl >= 490 && wl <= 510) {
    r = 0.0;
    g = 1.0;
    b = Math.pow(-(wl - 510) / (510 - 490), gamma);
  } else if (wl >= 510 && wl <= 580) {
    r = Math.pow((wl - 510) / (580 - 510), gamma);
    g = 1.0;
    b = 0.0;
  } else if (wl >= 580 && wl <= 645) {
    r = 1.0;
    g = Math.pow(-(wl - 645) / (645 - 580), gamma);
    b = 0.0;
  } else if (wl >= 645 && wl <= 750) {
    const attenuation = 0.3 + 0.7 * (750 - wl) / (750 - 645);
    r = Math.pow(1.0 * attenuation, gamma);
    g = 0.0;
    b = 0.0;
  } else {
    // Outside visible spectrum - show as white for visualization of invisible rays (UV/IR)
    r = 1.0;
    g = 1.0;
    b = 1.0;
  }

  return { r, g, b };
}

/**
 * Convert RGB values to CSS color string
 * 
 * @param rgb RGB color values in range [0, 1]
 * @returns CSS color string in format "rgb(r, g, b)"
 */
export function rgbToCSSColor(rgb: RGB): string {
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Convert RGB values to hex color string
 * 
 * @param rgb RGB color values in range [0, 1]
 * @returns Hex color string in format "#RRGGBB"
 */
export function rgbToHex(rgb: RGB): string {
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Get wavelength color for Plotly.js visualization
 * 
 * @param wavelength Wavelength in nanometers
 * @param gamma Gamma correction factor
 * @returns CSS color string suitable for Plotly.js
 */
export function getWavelengthColor(wavelength: number, gamma: number = 0.8): string {
  const rgb = wavelengthToRGB(wavelength, gamma);
  return rgbToCSSColor(rgb);
}

/**
 * Common visible wavelengths for optical design
 */
export const COMMON_WAVELENGTHS = {
  // Mercury lines
  MERCURY_E: 546.1,    // Green mercury line
  MERCURY_D: 587.6,    // Sodium D-line (yellow)
  MERCURY_C: 656.3,    // Hydrogen C-line (red)
  MERCURY_F: 486.1,    // Hydrogen F-line (blue)
  
  // LED wavelengths
  VIOLET_LED: 405,
  BLUE_LED: 470,
  GREEN_LED: 530,
  YELLOW_LED: 590,
  RED_LED: 660,
  
  // Laser wavelengths
  HELIUM_NEON: 632.8,  // HeNe laser
  ARGON_BLUE: 488.0,   // Argon laser
  ARGON_GREEN: 514.5,  // Argon laser
} as const;
