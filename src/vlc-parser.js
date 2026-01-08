import cleanTitle from './title-cleaner.js';
import { isTvShow } from './tv-show-helper.js';

export function parseVLCStatus(vlcData) {
  const status = {
    connected: true,
    playing: vlcData.state === 'playing',
    paused: vlcData.state === 'paused',
    position: Number.isFinite(vlcData.position) ? vlcData.position : 0,
    length: Number.isFinite(vlcData.length) ? vlcData.length : 0,
    elapsed: Number.isFinite(vlcData.time) ? Math.floor(vlcData.time) : 0,
    remaining:
      Number.isFinite(vlcData.length) && Number.isFinite(vlcData.time)
        ? Math.floor(vlcData.length - vlcData.time)
        : 0,
    percentage: Number.isFinite(vlcData.position) ? Math.floor(vlcData.position * 100) : 0,
    lastUpdated: Date.now(),
  };

  // Extract media information
  let mediaTitle = '';
  let filename = '';
  let filePath = '';

  if (vlcData.information && vlcData.information.category && vlcData.information.category.meta) {
    const meta = vlcData.information.category.meta;

    if (meta.title) {
      mediaTitle = meta.title;
    }

    if (meta.filename) {
      filename = meta.filename;
    }

    if (meta.filepath || meta.url) {
      filePath = meta.filepath || meta.url;
    }
  }

  // If no media is playing or title is empty
  if (!mediaTitle || vlcData.state === 'stopped') {
    status.title = null;
    status.originalTitle = null;
    status.mediaType = null;
    status.metadata = null;
    return status;
  }

  // Determine media type
  // Prioritize: mediaTitle > folder names > filename
  const possibleTitles = [mediaTitle];
  
  if (filePath) {
    const pathParts = filePath.split(/[\\/]/);
    // Add parent folder (likely show/movie name)
    if (pathParts.length > 2) {
      possibleTitles.push(pathParts[pathParts.length - 2]);
    }
    // Add grandparent folder if exists (for shows like /ShowName/Season1/)
    if (pathParts.length > 3) {
      possibleTitles.push(pathParts[pathParts.length - 3]);
    }
  }
  
  // Add filename last (often contains episode titles)
  if (filename) possibleTitles.push(filename);
  if (filePath) {
    const fileNameFromPath = filePath.split(/[\\/]/).pop();
    if (fileNameFromPath) possibleTitles.push(fileNameFromPath);
  }

  let mediaType = 'unknown';
  for (const title of possibleTitles) {
    if (isTvShow(title)) {
      mediaType = 'tv';
      break;
    } else if (
      title.toLowerCase().includes('anime') ||
      /\[(?:subsplease|erai-raws|horriblesubs|judas|mtbb)\]/i.test(title)
    ) {
      mediaType = 'anime';
      break;
    }
  }

  if (mediaType === 'unknown') {
    for (const title of possibleTitles) {
      const cleanInfo = cleanTitle(title);
      if (cleanInfo && cleanInfo.type) {
        mediaType = cleanInfo.type;
        break;
      }
    }
  }

  mediaType = mediaType || 'movie';
  status.mediaType = mediaType;
  status.originalTitle = filename || mediaTitle;

  // Clean the title based on media type
  // For TV shows: prioritize titles with season/episode info, skip bare episode titles
  let cleanInfo = null;
  for (const title of possibleTitles) {
    cleanInfo = cleanTitle(title);
    if (cleanInfo && cleanInfo.title && cleanInfo.title !== 'Unknown') {
      // For TV shows, if we found season/episode info, use it
      if (mediaType === 'tv' && cleanInfo.season !== null && cleanInfo.episode !== null) {
        break;
      }
      // For non-TV or if no season/episode info yet, continue looking
      // to see if a later title has better season/episode data
      if (mediaType === 'tv' && (cleanInfo.season !== null || cleanInfo.episode !== null)) {
        // Found at least season or episode, good enough
        break;
      }
      // For non-TV shows, just take the first valid title
      if (mediaType !== 'tv') {
        break;
      }
    }
  }

  if (!cleanInfo || !cleanInfo.title || cleanInfo.title === 'Unknown') {
    cleanInfo = cleanTitle(mediaTitle);
  }

  // Set title info based on media type
  let titleForLookup;
  if (mediaType === 'tv' || cleanInfo.type === 'tv') {
    titleForLookup = cleanInfo.showTitle || cleanInfo.title;
    status.title = titleForLookup;
    if (cleanInfo.season !== null && cleanInfo.episode !== null) {
      status.season = cleanInfo.season;
      status.episode = cleanInfo.episode;
      status.episodeTitle = cleanInfo.episodeTitle;
    }
  } else if (mediaType === 'anime' || cleanInfo.type === 'anime') {
    titleForLookup = cleanInfo.title;
    status.title = titleForLookup;
    if (cleanInfo.season !== null && cleanInfo.episode !== null) {
      status.season = cleanInfo.season;
      status.episode = cleanInfo.episode;
      status.episodeTitle = cleanInfo.episodeTitle;
    }
  } else {
    titleForLookup = cleanInfo.title;
    status.title = titleForLookup;
    if (cleanInfo.year) {
      status.year = cleanInfo.year;
    }
  }

  status.titleForLookup = titleForLookup;
  status.mediaInfo = cleanInfo;
  return status;
}

export function extractMetadataLookupInfo(parsed) {
  if (!parsed || !parsed.mediaInfo) {
    return {
      mediaType: 'unknown',
      title: 'Unknown',
      season: null,
      episode: null,
      year: null,
    };
  }

  const { mediaInfo, mediaType } = parsed;
  return {
    mediaType: mediaType || 'unknown',
    title: mediaInfo.showTitle || mediaInfo.title,
    season: mediaInfo.season || null,
    episode: mediaInfo.episode || null,
    year: mediaInfo.year || null,
  };
}

export default {
  parseVLCStatus,
  extractMetadataLookupInfo,
};
