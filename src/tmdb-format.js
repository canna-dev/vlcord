export function formatMovieData(movie, imageBaseUrl = 'https://image.tmdb.org/t/p') {
  return {
    type: 'movie',
    id: movie.id,
    title: movie.title,
    originalTitle: movie.original_title,
    year: movie.release_date ? movie.release_date.substring(0, 4) : null,
    overview: movie.overview,
    genres: movie.genres ? movie.genres.map(g => g.name) : [],
    runtime: movie.runtime,
    formattedRuntime: formatRuntime(movie.runtime),
    posterPath: movie.poster_path,
    backdropPath: movie.backdrop_path,
    posterUrl: movie.poster_path ? `${imageBaseUrl}/w500${movie.poster_path}` : null,
    backdropUrl: movie.backdrop_path ? `${imageBaseUrl}/w1280${movie.backdrop_path}` : null,
    tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`,
    imdbUrl: movie.imdb_id ? `https://www.imdb.com/title/${movie.imdb_id}` : null,
  };
}

export function formatTvShowData(show, episode = null, seasonNumber = null, episodeNumber = null, imageBaseUrl = 'https://image.tmdb.org/t/p') {
  const baseData = {
    type: 'tv',
    id: show.id,
    title: show.name,
    originalTitle: show.original_name,
    year: show.first_air_date ? show.first_air_date.substring(0, 4) : null,
    overview: show.overview,
    genres: show.genres ? show.genres.map(g => g.name) : [],
    posterPath: show.poster_path,
    backdropPath: show.backdrop_path,
    posterUrl: show.poster_path ? `${imageBaseUrl}/w500${show.poster_path}` : null,
    backdropUrl: show.backdrop_path ? `${imageBaseUrl}/w1280${show.backdrop_path}` : null,
    tmdbUrl: `https://www.themoviedb.org/tv/${show.id}`,
    imdbUrl: show.external_ids && show.external_ids.imdb_id ? `https://www.imdb.com/title/${show.external_ids.imdb_id}` : null,
    numberOfSeasons: show.number_of_seasons || null,
    numberOfEpisodes: show.number_of_episodes || null,
    status: show.status || null,
    networks: show.networks ? show.networks.map(n => n.name).join(', ') : null,
    inProduction: show.in_production || false,
  };

  if (episode) {
    return {
      ...baseData,
      episodeTitle: episode.name,
      episodeNumber: episode.episode_number,
      seasonNumber: episode.season_number,
      episodeOverview: episode.overview,
      episodeAirDate: episode.air_date,
      episodeStillPath: episode.still_path,
      episodeStillUrl: episode.still_path ? `${imageBaseUrl}/w300${episode.still_path}` : null,
      episodeRuntime: episode.runtime || null,
      episodeVoteAverage: episode.vote_average || null,
      episodeVoteCount: episode.vote_count || null,
      episodeCrew: episode.crew ? episode.crew.slice(0, 3).map(c => ({ name: c.name, job: c.job })) : null,
      episodeGuestStars: episode.guest_stars ? episode.guest_stars.slice(0, 3).map(g => g.name).join(', ') : null,
      formattedEpisode: `S${episode.season_number.toString().padStart(2, '0')}E${episode.episode_number.toString().padStart(2, '0')}`,
      fullEpisodeInfo: `${show.name} ${formatEpisodeNumber(episode.season_number, episode.episode_number)} - ${episode.name}`,
    };
  } else if (seasonNumber !== null && episodeNumber !== null) {
    return {
      ...baseData,
      seasonNumber,
      episodeNumber,
      formattedEpisode: `S${seasonNumber.toString().padStart(2, '0')}E${episodeNumber.toString().padStart(2, '0')}`,
      fullEpisodeInfo: `${show.name} ${formatEpisodeNumber(seasonNumber, episodeNumber)}`,
    };
  }

  return baseData;
}

export function formatEpisodeNumber(season, episode) {
  return `S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`;
}

export function formatRuntime(minutes) {
  if (!minutes) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export default { formatMovieData, formatTvShowData, formatEpisodeNumber, formatRuntime };
