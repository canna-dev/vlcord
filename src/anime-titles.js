/**
 * Anime Title Handler
 * 
 * Special handling for anime shows to properly display Japanese/English titles
 */

import logger from './logger.js';

// Map of anime titles with both Japanese and English names
// Format: 'normalized title': { english: 'English Title', japanese: 'Japanese Title', displayFormat: 'format' }
// Display formats: 'english-primary', 'japanese-primary', 'both'
export const animeMap = {
  // Popular anime with dual titles
  'kimetsu no yaiba': { 
    english: 'Demon Slayer', 
    japanese: 'Kimetsu no Yaiba', 
    displayFormat: 'both',
    specialSeasons: {
      2: 'Entertainment District Arc',
      3: 'Swordsmith Village Arc',
      4: 'Hashira Training Arc'
    }
  },
  'demon slayer': { 
    english: 'Demon Slayer', 
    japanese: 'Kimetsu no Yaiba', 
    displayFormat: 'both',
    specialSeasons: {
      2: 'Entertainment District Arc',
      3: 'Swordsmith Village Arc',
      4: 'Hashira Training Arc'
    }
  },
  'shingeki no kyojin': { 
    english: 'Attack on Titan', 
    japanese: 'Shingeki no Kyojin', 
    displayFormat: 'english-primary',
    specialSeasons: {
      4: 'The Final Season'
    }
  },
  'attack on titan': { 
    english: 'Attack on Titan', 
    japanese: 'Shingeki no Kyojin', 
    displayFormat: 'english-primary',
    specialSeasons: {
      4: 'The Final Season'
    }
  },
  'boku no hero academia': { 
    english: 'My Hero Academia', 
    japanese: 'Boku no Hero Academia', 
    displayFormat: 'english-primary' 
  },
  'my hero academia': { 
    english: 'My Hero Academia', 
    japanese: 'Boku no Hero Academia', 
    displayFormat: 'english-primary' 
  },
  'fullmetal alchemist': { 
    english: 'Fullmetal Alchemist', 
    displayFormat: 'english-primary',
    variants: {
      'brotherhood': 'Fullmetal Alchemist: Brotherhood'
    }
  },
  'jujutsu kaisen': { 
    english: 'Jujutsu Kaisen', 
    displayFormat: 'english-primary',
    specialSeasons: {
      2: 'Shibuya Incident Arc'
    }
  },
  'one piece': { 
    english: 'One Piece', 
    displayFormat: 'english-primary',
    noSeasonDisplay: true // Use episode numbers only, no seasons
  },
  'death note': { 
    english: 'Death Note', 
    displayFormat: 'english-primary' 
  },
  'naruto': { 
    english: 'Naruto', 
    displayFormat: 'english-primary',
    variants: {
      'shippuden': 'Naruto Shippuden'
    }
  },
  'naruto shippuden': { 
    english: 'Naruto Shippuden', 
    displayFormat: 'english-primary' 
  },
  'hunter x hunter': { 
    english: 'Hunter × Hunter', 
    displayFormat: 'english-primary' 
  },
  'spy x family': { 
    english: 'Spy × Family', 
    displayFormat: 'english-primary' 
  },
  'one punch man': { 
    english: 'One-Punch Man', 
    japanese: 'Wanpanman', 
    displayFormat: 'english-primary' 
  },
  'tokyo ghoul': { 
    english: 'Tokyo Ghoul', 
    displayFormat: 'english-primary' 
  },
  'steins gate': { 
    english: 'Steins;Gate', 
    displayFormat: 'english-primary' 
  },
  'sword art online': { 
    english: 'Sword Art Online', 
    displayFormat: 'english-primary' 
  },
  'mob psycho 100': { 
    english: 'Mob Psycho 100', 
    displayFormat: 'english-primary' 
  },
  'made in abyss': { 
    english: 'Made in Abyss', 
    displayFormat: 'english-primary' 
  },
  'cowboy bebop': { 
    english: 'Cowboy Bebop', 
    displayFormat: 'english-primary' 
  },
  'evangelion': { 
    english: 'Neon Genesis Evangelion', 
    japanese: 'Shin Seiki Evangelion', 
    displayFormat: 'english-primary' 
  },
  'neon genesis evangelion': { 
    english: 'Neon Genesis Evangelion', 
    japanese: 'Shin Seiki Evangelion', 
    displayFormat: 'english-primary' 
  },
  'dragon ball': { 
    english: 'Dragon Ball', 
    displayFormat: 'english-primary',
    variants: {
      'z': 'Dragon Ball Z',
      'gt': 'Dragon Ball GT',
      'super': 'Dragon Ball Super'
    }
  },
  'dragon ball z': { 
    english: 'Dragon Ball Z', 
    displayFormat: 'english-primary' 
  },
  'dragon ball super': { 
    english: 'Dragon Ball Super', 
    displayFormat: 'english-primary' 
  },
  'bleach': { 
    english: 'Bleach', 
    displayFormat: 'english-primary',
    specialSeasons: {
      17: 'Thousand-Year Blood War'
    }
  },
  'jojo': { 
    english: "JoJo's Bizarre Adventure", 
    displayFormat: 'english-primary' 
  },
  'jojos bizarre adventure': { 
    english: "JoJo's Bizarre Adventure", 
    displayFormat: 'english-primary' 
  },
  'vinland saga': { 
    english: 'Vinland Saga', 
    displayFormat: 'english-primary' 
  },
  'chainsaw man': { 
    english: 'Chainsaw Man', 
    japanese: 'Chensō Man', 
    displayFormat: 'english-primary' 
  },
  'mushoku tensei': { 
    english: 'Mushoku Tensei: Jobless Reincarnation', 
    japanese: 'Mushoku Tensei: Isekai Ittara Honki Dasu', 
    displayFormat: 'english-primary' 
  }
};

/**
 * Check if a title is likely to be an anime
 * @param {string} title - The show title
 * @param {string} filename - Original filename for additional context
 * @returns {boolean} Whether the show appears to be an anime
 */
export function isAnime(title, filename = '') {
  if (!title) return false;
  
  // Normalize the title for comparison
  const normalizedTitle = title.toLowerCase().trim();
  
  // Check if it's in our anime map
  if (animeMap[normalizedTitle]) return true;
  
  // Check for partial matches in our anime map
  for (const key of Object.keys(animeMap)) {
    if (normalizedTitle.includes(key) || key.includes(normalizedTitle)) {
      return true;
    }
  }
  
  // Check if the title contains Japanese characters
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(title)) {
    return true;
  }
  
  // Check for common anime patterns
  const animePatterns = [
    /anime/i,
    /\b(subbed|dubbed)\b/i,
    /\b(s\d+|season \d+)[\s\.\-_]+(ep?|episode)[\s\.\-_]+\d+/i,
    /\[(.*?)\]/i,  // Common in anime filenames
    /\b(ova|oad|special)\b/i,
    /\b(slice[\s\-_]of[\s\-_]life|shounen|shoujo|seinen|josei|isekai|mecha|magical[\s\-_]girl)\b/i,
  ];
  
  for (const pattern of animePatterns) {
    if (pattern.test(normalizedTitle) || (filename && pattern.test(filename))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Format an anime title for display
 * @param {object} showData - Show data with title, season, episode info
 * @returns {object} Formatted title information
 */
export function formatAnimeTitle(showData) {
  if (!showData || !showData.title) {
    return showData;
  }
  
  const normalizedTitle = showData.title.toLowerCase().trim();
  const formattedShowData = { ...showData };
  
  // Find the anime in our map (by exact match or partial match)
  let animeInfo = animeMap[normalizedTitle];
  if (!animeInfo) {
    // Try to find partial matches
    for (const key of Object.keys(animeMap)) {
      if (normalizedTitle.includes(key) || key.includes(normalizedTitle)) {
        animeInfo = animeMap[key];
        break;
      }
    }
  }
  
  if (!animeInfo) {
    // If we have an original title that appears to be Japanese, format it specially
    if (showData.originalTitle && 
        /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(showData.originalTitle)) {
      // Use the format: "English Title (Japanese Title)" or just the title we have
      if (showData.title && showData.originalTitle && 
          showData.title.toLowerCase() !== showData.originalTitle.toLowerCase()) {
        formattedShowData.title = `${showData.title} (${showData.originalTitle})`;
      }
      return formattedShowData;
    }
    
    return formattedShowData; // Not in our map, return original
  }
  
  // Check for variants like "Naruto Shippuden" or "Fullmetal Alchemist: Brotherhood"
  if (animeInfo.variants) {
    for (const [variant, title] of Object.entries(animeInfo.variants)) {
      if (normalizedTitle.includes(variant)) {
        formattedShowData.title = title;
        return formattedShowData;
      }
    }
  }
  
  // Format according to the display preference
  if (animeInfo.displayFormat === 'both') {
    // Both names with English primary: "English (Japanese)"
    formattedShowData.title = `${animeInfo.english} (${animeInfo.japanese})`;
  } else if (animeInfo.displayFormat === 'japanese-primary') {
    // Both names with Japanese primary: "Japanese (English)"
    formattedShowData.title = `${animeInfo.japanese} (${animeInfo.english})`;
  } else {
    // English only
    formattedShowData.title = animeInfo.english;
  }
  
  // Handle special season naming (like "Entertainment District Arc")
  if (showData.seasonNumber && animeInfo.specialSeasons && animeInfo.specialSeasons[showData.seasonNumber]) {
    formattedShowData.seasonName = animeInfo.specialSeasons[showData.seasonNumber];
  }
  
  // For anime that don't use seasons (like One Piece)
  formattedShowData.noSeasonDisplay = !!animeInfo.noSeasonDisplay;
  
  // Handle fallbacks if title is missing
  if (showData.originalTitle && !formattedShowData.title) {
    formattedShowData.title = showData.originalTitle;
  }
  
  logger.debug('Formatted anime data:', formattedShowData);
  
  return formattedShowData;
}
