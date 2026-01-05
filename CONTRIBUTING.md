# Contributing to VLCord

Thank you for your interest in contributing to VLCord! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- VLC Media Player 3.0+
- Git
- A Discord account for testing

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/canna-dev/vlcord.git
   cd vlcord
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

## 🛠️ Development Guidelines

### Code Style

- Use ES6+ features and modules
- Follow existing code formatting
- Add comments for complex logic
- Use meaningful variable and function names

### Project Structure

```
src/
├── main.js              # Main server entry point
├── vlc-monitor.js       # VLC HTTP interface integration
├── discord-presence.js  # Discord RPC client
├── title-cleaner.js     # Filename parsing logic
├── tmdb-client.js       # TMDb API integration
└── config-manager.js    # Configuration management
```

### Testing

- Test all changes with actual VLC playback
- Verify Discord Rich Presence updates correctly
- Test the web interface functionality
- Check both movies and TV shows

## 📝 How to Contribute

### Reporting Bugs

1. Check existing [issues](https://github.com/canna-dev/vlcord/issues)
2. Create a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Your environment (OS, Node.js version, VLC version)
   - Screenshots if applicable

### Suggesting Features

1. Check existing issues and discussions
2. Create a feature request issue with:
   - Clear description of the feature
   - Use case and benefits
   - Possible implementation ideas

### Submitting Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the coding standards
   - Add tests if applicable
   - Update documentation as needed

3. **Commit your changes**
   ```bash
   git commit -m "Add: your feature description"
   ```

4. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create a Pull Request**
   - Use a clear, descriptive title
   - Describe what changes you made and why
   - Reference any related issues

### Commit Message Guidelines

Use clear, descriptive commit messages:

- `Add: new feature or functionality`
- `Fix: bug fix`
- `Update: changes to existing functionality`
- `Docs: documentation changes`
- `Style: formatting, missing semi-colons, etc.`
- `Refactor: code changes that neither fix bugs nor add features`

## 🎯 Areas for Contribution

### High Priority

- **Media Detection**: Improve filename parsing for edge cases
- **Error Handling**: Better error messages and recovery
- **Performance**: Optimize polling and memory usage
- **Testing**: Add automated tests

### Medium Priority

- **UI/UX**: Improve web interface design
- **Customization**: More configuration options
- **Platforms**: Linux/macOS specific improvements
- **Anime Detection**: Better anime title parsing

### Low Priority

- **Themes**: Dark/light mode toggle
- **Statistics**: Usage analytics and insights
- **Plugins**: Extensible architecture
- **Mobile**: Mobile-friendly web interface

## 🧪 Testing Your Changes

### Manual Testing Checklist

- [ ] VLC connection works
- [ ] Discord Rich Presence updates
- [ ] Web interface loads and functions
- [ ] Settings can be saved
- [ ] Movies are detected correctly
- [ ] TV shows are detected correctly
- [ ] Progress tracking works
- [ ] TMDb integration works
- [ ] No console errors

### Test Cases

1. **Movie Testing**
   - Play a movie file
   - Verify Discord shows correct title and metadata
   - Test different filename formats

2. **TV Show Testing**
   - Play a TV episode
   - Verify season/episode detection
   - Test different naming conventions

3. **Edge Cases**
   - Very long filenames
   - Special characters in titles
   - Files without metadata
   - Network interruptions

## 📋 Pull Request Checklist

Before submitting a pull request, ensure:

- [ ] Code follows project conventions
- [ ] Changes have been tested manually
- [ ] Documentation is updated if needed
- [ ] No new console errors or warnings
- [ ] Existing functionality still works
- [ ] Git history is clean (squash commits if needed)

## 🤝 Community Guidelines

- Be respectful and constructive
- Help others learn and grow
- Focus on what's best for the project
- Ask questions if you're unsure
- Have fun building something awesome!

## 📞 Getting Help

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas
- Check existing documentation first
- Be patient and respectful when asking for help

## 📄 License

By contributing to VLCord, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing to VLCord! 🚀
