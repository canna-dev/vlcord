/**
 * Override map for TMDb title matching
 * Contains special cases that are hard to match automatically
 */

export const titleOverrides = {
  // Format: 'normalized title': tmdbId
  
  // Movies with special characters in titles
  'rec': 10664,             // [REC] (2007)
  '[rec]': 10664,           // [REC] (2007)
  'rec 2007': 10664,        // [REC] (2007) - with year
  '[rec] 2007': 10664,      // [REC] (2007) - with brackets and year
  'rec]': 10664,            // [REC] (2007) - handles case where opening bracket is removed in cleaning
  '[rec': 10664,            // [REC] (2007) - handles case where closing bracket is removed in cleaning
  'bdrip': 10664,           // [REC] (2007) - special case for broken title cleaning
  'rec1': 45157,            // [REC] 1 (2007) - first movie in some filenames
  'rec 2': 40236,           // [REC] 2 (2009)
  '[rec] 2': 40236,         // [REC] 2 (2009) - with brackets
  
  // Documentaries that might get confused
  'three identical strangers': 489466, // Three Identical Strangers (2018)
  
  // Movies that share titles with other media
  'the thing': 1091,        // The Thing (1982) - John Carpenter's version
  'the thing 1982': 1091,   // The Thing (1982) - with year
  'the thing 2011': 76655,  // The Thing (2011) - prequel
  
  // Commonly confused movies
  'alien': 348,             // Alien (1979) - Original Ridley Scott film
  'aliens': 679,            // Aliens (1986) - James Cameron sequel
  'the matrix': 603,        // The Matrix (1999) - Original film
  
  // Movies with numbers in titles that might cause issues
  '2001': 62,               // 2001: A Space Odyssey (1968)
  '2001 a space odyssey': 62, // 2001: A Space Odyssey (1968)
  
  // Movies with very generic titles
  'heat': 40,               // Heat (1995) - De Niro/Pacino crime film
  'heat 1995': 40,          // Heat (1995) - with year
  
  // Files with language/quality tags in title
  'deadstream': 886083,     // Deadstream (2022) - Horror/Comedy
  'deadstream ita': 886083, // Deadstream (Italian version)
  'deadstream webdl': 886083, // Deadstream (WEBDL version)
  'deadstream ita webdl': 886083, // Deadstream (Italian WEBDL version)
  
  // Add more problematic cases here
};

/**
 * Add a new override to the map
 * @param {string} title - The normalized title to override
 * @param {number} tmdbId - The TMDb ID to use
 */
export function addTitleOverride(title, tmdbId) {
  titleOverrides[title.toLowerCase().trim()] = tmdbId;
}
