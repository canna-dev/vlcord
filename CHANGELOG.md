# Changelog

All notable changes to VLCord will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- GitHub deployment preparation
- Comprehensive documentation (README, CONTRIBUTING, SECURITY)
- GitHub Actions CI/CD pipeline
- Automated dependency vulnerability scanning
- Professional project structure
- Code quality checks and linting

### Changed

- Complete UI redesign with Discord-inspired theme
- Simplified web interface with tabbed navigation
- Improved media status display
- Enhanced error handling and user feedback

### Removed

- Discord Rich Presence preview section (redundant)
- Development and test files from distribution
- Unnecessary dependencies and bloat

### Fixed

- title-cleaner.js export/import compatibility
- Web UI tab functionality
- Socket.io connection handling
- Media status synchronization
- Discord Rich Presence accuracy

## [1.0.0] - Initial Release

### Core Features

- VLC media monitoring via HTTP interface
- Discord Rich Presence integration
- TMDb API integration for movie/TV metadata
- Web-based configuration interface
- Real-time media status updates
- Automatic title cleaning and formatting
- TV show detection and episode handling
- Movie detection with year extraction
- Anime title support
- Configurable override system
- Multi-platform support (Windows, macOS, Linux)

### Implementation Details

#### VLC Integration

- Monitors currently playing media
- Detects play/pause states
- Extracts filename and metadata
- Supports various media formats

#### Discord Rich Presence

- Shows currently playing media
- Displays movie/TV show information
- Shows play/pause status with icons
- Includes timestamps and progress

#### TMDb Integration

- Fetches movie posters and metadata
- Identifies TV shows and episodes
- Provides rich media information
- Handles search and matching

#### Web Interface

- Real-time status monitoring
- Configuration management
- Connection status indicators
- Responsive design

#### Title Processing

- Cleans filenames for display
- Detects TV show episodes
- Extracts movie years
- Handles special cases and overrides

### Technical Stack

- Node.js backend with Express
- Socket.io for real-time communication
- Discord RPC for presence integration
- Axios for HTTP requests
- Parse-torrent-name for filename parsing
- Cross-platform VLC HTTP interface support

### Platform Support

- Windows (with VLCord.bat)
- macOS/Linux (with VLCord.sh)
- Node.js 14+ required

### Known Limitations

- Requires VLC HTTP interface to be enabled
- TMDb API key required for full functionality
- Discord client must be running for Rich Presence
