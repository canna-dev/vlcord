/**
 * Custom activity template system
 * Allows users to define custom Discord presence formats
 */

export const DEFAULT_TEMPLATES = {
  movie: '{title} • {year}',
  tv: '{title} • S{season}E{episode} • {episodeTitle}',
  basic: '{title}'
};

export class ActivityTemplate {
  constructor(template = DEFAULT_TEMPLATES.basic) {
    this.template = template;
  }

  /**
   * Render template with data
   */
  render(data = {}) {
    let result = this.template;

    const replacements = {
      '{title}': data.title || 'Media',
      '{year}': data.year || 'Unknown',
      '{season}': String(data.season || 0).padStart(2, '0'),
      '{episode}': String(data.episode || 0).padStart(2, '0'),
      '{episodeTitle}': data.episodeTitle || '',
      '{director}': data.director || '',
      '{duration}': this.formatDuration(data.duration),
      '{position}': this.formatDuration(data.position),
      '{remaining}': this.formatDuration(data.remaining),
      '{percentage}': data.percentage ? `${Math.round(data.percentage)}%` : '',
      '{genre}': data.genre || '',
      '{rating}': data.rating ? `⭐ ${data.rating}/10` : '',
    };

    // Replace all placeholders
    for (const [placeholder, value] of Object.entries(replacements)) {
      result = result.replaceAll(placeholder, value);
    }

    // Clean up extra spaces and separators
    result = result
      .replace(/\s*•\s*\s+•\s*/g, ' • ') // Fix double separators
      .replace(/\s+$/g, '') // Trim trailing spaces
      .substring(0, 128); // Discord limit

    return result;
  }

  /**
   * Format seconds as HH:MM:SS or MM:SS
   */
  formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0:00';

    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Validate template (check for unrecognized placeholders)
   */
  validate() {
    const validPlaceholders = new Set([
      'title', 'year', 'season', 'episode', 'episodeTitle',
      'director', 'duration', 'position', 'remaining', 'percentage',
      'genre', 'rating'
    ]);

    const placeholderRegex = /\{(\w+)\}/g;
    const matches = this.template.matchAll(placeholderRegex);

    for (const match of matches) {
      if (!validPlaceholders.has(match[1])) {
        throw new Error(`Invalid placeholder: {${match[1]}}`);
      }
    }

    return true;
  }
}

/**
 * Template factory
 */
export class TemplateFactory {
  constructor() {
    this.templates = { ...DEFAULT_TEMPLATES };
  }

  /**
   * Register custom template
   */
  register(name, template) {
    const t = new ActivityTemplate(template);
    t.validate();
    this.templates[name] = template;
  }

  /**
   * Get template
   */
  get(name) {
    return new ActivityTemplate(this.templates[name] || DEFAULT_TEMPLATES.basic);
  }

  /**
   * Get all templates
   */
  getAll() {
    return { ...this.templates };
  }
}

// Global factory
export const templateFactory = new TemplateFactory();
