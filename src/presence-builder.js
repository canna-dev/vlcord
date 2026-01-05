import * as animeHandler from './anime-titles.js';

export function extractCleanTitle(title, filename = '') {
  if (!title) return 'Unknown';
  let cleanTitle = title.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|mpg|mpeg|ts)$/i, '');
  const patternsToRemove = [
    /\b(720p|1080p|2160p|4K|UHD|HD|HDTV|Full\s*HD)\b/gi,
    /\b(BluRay|Blu-Ray|BRRip|BDRip|WEB-?DL|WebRip|HDRip|DVDRip|DVD-Rip|DVDScr|WEBCap|WEB)\b/gi,
    /\b(NF|AMZN|HMAX|DSNP|HULU|iPlayer|IPLAYER)\b/gi,
    /\b(AAC|MP3|AC3|DTS|DD5\.1|DDP5\.1|H\.?264|H\.?265|x\.?264|x\.?265|HEVC|XVID|DivX|Atmos)\b/gi,
    /\b(mkv|mp4|avi|mov|wmv|flv|webm|m4v)\b/gi,
    /-([A-Za-z0-9._]+)$/i,
    /\b(YIFY|YTS|RARBG|EZTV|ETTV|TGx|ION10|NTG|EtHD|CMRG|FLUX)\b/gi,
    /\s\(?(\d{4})\)?$/i,
    /\b(PROPER|REPACK|EXTENDED|Directors\.?Cut|Unrated|DC)\b/gi,
    /\[[^\]]+\]/g,
    /\([^)]+\)/g,
    /\{[^}]+\}/g,
    /\s-\s.*$/,
    /\./g,
  ];

  patternsToRemove.forEach((p) => {
    cleanTitle = cleanTitle.replace(p, ' ');
  });

  cleanTitle = cleanTitle.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\s{2,}/g, ' ').trim();

  if (/^\d+$/.test(cleanTitle)) {
    const possible = filename.split('.')[0].replace(/[._-]/g, ' ').trim();
    if (possible && possible.length > cleanTitle.length) cleanTitle = possible;
  }

  return cleanTitle;
}

export function createMovieActivity(movie, vlcStatus, startTimestamp, endTimestamp) {
  const isPlaying = vlcStatus.playing;
  const details = movie.title ? (movie.year ? `${movie.title} (${movie.year})` : movie.title) : 'Movie';
  const state = movie.overview ? (movie.overview.length > 125 ? movie.overview.substring(0, 122) + '...' : movie.overview) : (movie.genres ? movie.genres.slice(0, 3).join(', ') : 'No description available');

  return {
    details,
    state,
    largeImageKey: movie.posterUrl || 'vlc',
    largeImageText: movie.title || 'Movie',
    smallImageKey: isPlaying ? 'play' : 'pause',
    smallImageText: isPlaying ? 'Watching' : 'Paused',
    startTimestamp: isPlaying ? startTimestamp : undefined,
    endTimestamp: isPlaying ? endTimestamp : undefined,
    buttons: movie.tmdbUrl ? [{ label: 'View on TMDb', url: movie.tmdbUrl }] : undefined,
  };
}

export function createTvShowActivity(show, vlcStatus, startTimestamp, endTimestamp) {
  const isPlaying = vlcStatus.playing;
  const hasEpisode = show.episodeNumber !== undefined;
  const hasSeason = show.seasonNumber !== undefined;
  const isAnimeShow = animeHandler.isAnime(show.title || '', vlcStatus.filename || '');
  let formattedShow = { ...show };
  if (isAnimeShow) formattedShow = animeHandler.formatAnimeTitle(show);

  let seasonEpText = '';
  if (hasEpisode) {
    if (isAnimeShow && formattedShow.noSeasonDisplay) seasonEpText = `E${formattedShow.episodeNumber}`;
    else if (isAnimeShow && formattedShow.seasonName) seasonEpText = `${formattedShow.seasonName} E${formattedShow.episodeNumber}`;
    else if (hasSeason) seasonEpText = `S${String(formattedShow.seasonNumber).padStart(2, '0')}E${String(formattedShow.episodeNumber).padStart(2, '0')}`;
    else seasonEpText = `E${formattedShow.episodeNumber}`;
  }

  const details = hasEpisode ? `${formattedShow.title} - ${seasonEpText}` : (formattedShow.title ? `${formattedShow.title}${formattedShow.year ? ` (${formattedShow.year})` : ''}` : 'TV Show');
  const episodeTitle = formattedShow.episodeTitle || (hasEpisode ? `Episode ${formattedShow.episodeNumber}` : '');
  const description = formattedShow.overview ? (formattedShow.overview.length > 80 ? formattedShow.overview.substring(0, 77) + '...' : formattedShow.overview) : '';

  let stateLine = episodeTitle ? (description ? `${episodeTitle} (${description.length > 60 ? description.substring(0, 57) + '...' : description})` : episodeTitle) : (description || (show.genres ? show.genres.slice(0, 3).join(', ') : 'No description available'));
  if (stateLine.length > 125) stateLine = stateLine.substring(0, 122) + '...';

  return {
    details,
    state: stateLine,
    largeImageKey: show.posterUrl || 'vlc',
    largeImageText: show.title || episodeTitle || 'TV Show',
    smallImageKey: isPlaying ? 'play' : 'pause',
    smallImageText: isPlaying ? 'Watching' : 'Paused',
    startTimestamp: isPlaying ? startTimestamp : undefined,
    endTimestamp: isPlaying ? endTimestamp : undefined,
    buttons: show.tmdbUrl ? [{ label: 'View on TMDb', url: show.tmdbUrl }] : undefined,
  };
}

export function createBasicActivity(vlcStatus, startTimestamp, endTimestamp) {
  const isPlaying = vlcStatus.playing;
  const title = vlcStatus.title || 'Unknown';
  const filename = vlcStatus.filename || title;
  const cleanTitle = extractCleanTitle(title, filename);
  vlcStatus.cleanTitle = cleanTitle;

  return {
    details: cleanTitle,
    state: vlcStatus.mediaType || 'Media file',
    largeImageKey: 'vlc',
    largeImageText: cleanTitle || 'VLC Media Player',
    smallImageKey: isPlaying ? 'play' : 'pause',
    smallImageText: isPlaying ? 'Watching' : 'Paused',
    startTimestamp: isPlaying ? startTimestamp : undefined,
    endTimestamp: isPlaying ? endTimestamp : undefined,
    buttons: vlcStatus.metadata?.tmdbUrl ? [{ label: 'View on TMDb', url: vlcStatus.metadata.tmdbUrl }] : undefined,
  };
}

export default {
  extractCleanTitle,
  createMovieActivity,
  createTvShowActivity,
  createBasicActivity,
};
