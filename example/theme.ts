/**
 * A small dark palette for the example — brand-like surface, vivid accents, not the default gray:
 * a near-black base (#101022) and an accent set (indigo / purple / pink / green).
 */
export const T = {
  // Surfaces
  bg: '#0E0E1A', // app background — deep brand navy-black
  surface: '#17172A', // card
  surfaceAlt: '#1F1F38', // raised / input
  border: '#2A2A47',

  // Brand accents
  accent: '#5753EA', // indigo — primary action
  accentPurple: '#AD53EA',
  pink: '#FF407F',
  green: '#3CC65E',
  blue: '#0878FF',
  teal: '#57C9F9',

  // Text
  text: '#FFFFFF',
  textDim: '#A0A0C0',
  textFaint: '#6D6D8A',

  // On-accent
  onAccent: '#FFFFFF',
} as const;

export const radius = {sm: 10, md: 14, lg: 20, pill: 999} as const;
