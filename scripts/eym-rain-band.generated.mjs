// Written by tools/generate-eym-energy.mjs from the land as it is (data/eym/energy.json): do not edit by hand.
// The tropical rain band's mean latitude over open ocean (degrees north): the hemispheres' balance gives -0.18°; not yet in use (dial energy.bandFollowsBalance).
export const RAIN_BAND_MEAN_LAT = 4;
// The latitude the ocean model's wind belts stand about in the tropics (the band's mean once it follows the balance).
export const WIND_BELTS_MEAN_LAT = 0;
// How far the wind and pressure belts follow the Sun, as a share of its declination: the mean over Eym's longitudes.
export const BELT_SWING_MEAN = 0.423;
// The westerlies' strength in each hemisphere (1 = the two hemispheres' mean), from the land in their path.
export const WESTERLIES = Object.freeze({ north: 0.991, south: 1.009 });
