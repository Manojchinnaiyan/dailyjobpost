// Google AdSense configuration.
// The loader script (in Base.astro) + ads.txt are enough for review and for
// Auto Ads (Google auto-places ads after approval).
//
// Manual ad placements only render once you paste real ad-unit slot IDs below.
// Create ad units at adsense.google.com → Ads → By ad unit, then fill these in.
export const AD_CLIENT = 'ca-pub-3177564979156582';

export const AD_SLOTS = {
  banner: '',   // homepage banner (above listings)
  footer: '',   // homepage banner (above footer)
  infeed: '',   // in-feed unit (between job cards)
};
