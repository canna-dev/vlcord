# Security Policy

## Supported Versions

We provide security updates for the following versions of VLCord:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of VLCord seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Where to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via:

1. **Email**: Send details to `admin@cannaman.xyz`
2. **Private GitHub issue**: Use the private vulnerability reporting feature
3. **GitHub Security Advisories**: Create a security advisory

### What to Include

Please include the following information in your report:

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### Response Timeline

- **Initial Response**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: 24-48 hours
  - High: 7 days
  - Medium: 30 days
  - Low: 90 days

### Disclosure Policy

- We will acknowledge receipt of your vulnerability report within 48 hours
- We will provide an estimated timeline for addressing the vulnerability
- We will notify you when the vulnerability has been fixed
- We will publicly disclose the vulnerability in a responsible manner

## Security Considerations

### Data Handling

VLCord handles the following types of data:

- **Local Media Information**: File names, metadata from VLC
- **TMDb API Data**: Movie/TV show information (public data)
- **Discord Integration**: User presence status
- **Configuration Data**: API keys, connection settings

### Network Communications

- **VLC HTTP Interface**: Local connection to VLC (localhost:8080)
- **Discord RPC**: Local IPC connection to Discord client
- **TMDb API**: HTTPS requests to external API
- **Web Interface**: Local HTTP server (localhost:7100)

### Known Security Considerations

1. **API Keys**: Store TMDb API keys securely in environment variables
2. **Local Access**: Web interface is accessible on localhost only
3. **VLC Password**: Uses VLC's built-in HTTP password protection
4. **File Access**: Only reads metadata, doesn't access file contents

### Best Practices for Users

- Keep VLCord updated to the latest version
- Use strong passwords for VLC HTTP interface
- Don't share your TMDb API key publicly
- Run VLCord on trusted networks only
- Regularly review and rotate API keys

## Third-Party Dependencies

VLCord relies on several third-party packages. We:

- Regularly audit dependencies for security vulnerabilities
- Keep dependencies updated to their latest secure versions
- Use `npm audit` to check for known vulnerabilities
- Follow security advisories for our dependencies

## Contact

For security-related questions or concerns that are not vulnerabilities, please contact:

- Email: `security@vlcord.site`
- GitHub Discussions: Use the Security category

Thank you for helping keep VLCord and our users safe!