/**
 * TV Show Override Map for TMDb Title Matching
 * 
 * Contains special cases for TV shows that are hard to match automatically
 */

export const tvShowOverrides = {
  // Format: 'normalized title': tmdbId
  
  // Shows with date/year issues
  '24': 76290,                // 24 (TV series)
  'the 100': 48866,           // The 100
  '911': 75219,               // 9-1-1
  '9-1-1': 75219,             // 9-1-1
  
  // Shows with special characters
  'mash': 918,                // M*A*S*H
  'm*a*s*h': 918,             // M*A*S*H
  'shield': 4911,             // The Shield (avoid confusion with Agents of S.H.I.E.L.D.)
  'the shield': 4911,         // The Shield
  'agents of shield': 1403,   // Marvel's Agents of S.H.I.E.L.D.
  'shield agents': 1403,      // Marvel's Agents of S.H.I.E.L.D.
  
  // Shows with ambiguous titles
  'the office': 2316,         // The Office (US)
  'the office us': 2316,      // The Office (US)
  'the office uk': 2996,      // The Office (UK)
  
  // Shows with special naming formats
  'law and order svu': 2734,     // Law & Order: Special Victims Unit
  'law order svu': 2734,          // Law & Order: SVU
  'csi las vegas': 1431,         // CSI: Crime Scene Investigation
  'csi': 1431,                   // CSI: Crime Scene Investigation
  'csi ny': 2458,                // CSI: NY
  'csi miami': 1620,             // CSI: Miami
  'ncis la': 17610,              // NCIS: Los Angeles
  'ncis los angeles': 17610,     // NCIS: Los Angeles
  'ncis new orleans': 61387,     // NCIS: New Orleans
  'game of thrones': 1399,       // Game of Thrones
  'doctor who': 57243,           // Doctor Who (2005)
  'doctor who 2005': 57243,      // Doctor Who (2005)
  'doctor who classic': 424,     // Doctor Who (1963)
  'doctor who 1963': 424,        // Doctor Who (1963)
  
  // Anime shows
  'kimetsu no yaiba': 85937,      // Demon Slayer: Kimetsu no Yaiba
  'demon slayer': 85937,          // Demon Slayer: Kimetsu no Yaiba
  'shingeki no kyojin': 1429,     // Attack on Titan
  'attack on titan': 1429,        // Attack on Titan
  'boku no hero academia': 65930, // My Hero Academia
  'my hero academia': 65930,      // My Hero Academia
  'one piece': 37854,             // One Piece
  'fullmetal alchemist': 31911,   // Fullmetal Alchemist
  'fullmetal alchemist brotherhood': 31911, // Fullmetal Alchemist: Brotherhood
  'naruto': 46260,                // Naruto
  'naruto shippuden': 31910,      // Naruto Shippuden
  'hunter x hunter': 46298,       // Hunter x Hunter
  'jujutsu kaisen': 95479,        // Jujutsu Kaisen
  'spy x family': 120089,         // Spy x Family
  'one punch man': 63926,         // One-Punch Man
  'tokyo ghoul': 61374,           // Tokyo Ghoul
  'death note': 13916,            // Death Note
  
  // Streaming service originals
  'stranger things': 66732,       // Stranger Things
  'the witcher': 71912,           // The Witcher
  'the mandalorian': 82856,       // The Mandalorian
  'the boys': 76479,              // The Boys
  'the last of us': 100088,       // The Last of Us
  'loki': 84958,                  // Loki
  'wandavision': 85271,           // WandaVision
  'wednesday': 119051,            // Wednesday
};

/**
 * Add a new override to the map
 * @param {string} title - The normalized title to override
 * @param {number} tmdbId - The TMDb ID to use
 */
export function addTvShowOverride(title, tmdbId) {
  tvShowOverrides[title.toLowerCase().trim()] = tmdbId;
}
