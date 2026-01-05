# VLCord REST API Documentation

Complete API reference for VLCord's REST endpoints.

## Base URL

```
http://localhost:7100/api
```

## Authentication

Protected endpoints require an `Authorization` header with a bearer token:

```
Authorization: Bearer YOUR_ADMIN_TOKEN
```

Set `ADMIN_TOKEN` environment variable to enable protected endpoints.

## Endpoints

### Status

#### Get Current Status

```
GET /status
```

Returns the current VLC playback status and media information.

**Response:**
```json
{
  "connected": true,
  "playing": true,
  "paused": false,
  "title": "The Matrix",
  "originalTitle": "The.Matrix.1999.1080p.BluRay.x264.mkv",
  "mediaType": "movie",
  "position": 0.45,
  "percentage": 45,
  "length": 8400,
  "elapsed": 3780,
  "remaining": 4620,
  "season": null,
  "episode": null,
  "metadata": {
    "title": "The Matrix",
    "overview": "A hacker discovers...",
    "poster_path": "/path/to/poster.jpg",
    "backdrop_path": "/path/to/backdrop.jpg",
    "vote_average": 8.7,
    "genres": ["Sci-Fi", "Action"],
    "imdbUrl": "https://www.imdb.com/title/tt0133093/"
  },
  "lastUpdated": 1701234567890
}
```

**Status Codes:**
- `200` - Success
- `503` - VLC not connected

---

### Configuration

#### Get Configuration

```
GET /config
```

Returns current application configuration.

**Response:**
```json
{
  "vlc": {
    "host": "localhost",
    "port": 8080,
    "password": "vlcpassword"
  },
  "discord": {
    "clientId": "1234567890123456789"
  },
  "tmdb": {
    "apiKey": "your_api_key_here"
  },
  "polling": {
    "interval": 1000
  }
}
```

---

#### Update Configuration

```
POST /config
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json
```

Update application configuration. All fields are optional.

**Request Body:**
```json
{
  "vlc": {
    "host": "192.168.1.100",
    "port": 8080,
    "password": "newpassword"
  },
  "discord": {
    "clientId": "new_client_id"
  },
  "tmdb": {
    "apiKey": "new_api_key"
  },
  "polling": {
    "interval": 2000
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration updated successfully"
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid configuration
- `401` - Missing or invalid admin token
- `500` - Failed to save configuration

---

### Discord

#### Connect Discord

```
POST /discord/connect
Authorization: Bearer YOUR_ADMIN_TOKEN
```

Manually trigger Discord connection.

**Response:**
```json
{
  "success": true,
  "message": "Discord connected successfully"
}
```

---

#### Disconnect Discord

```
POST /discord/disconnect
Authorization: Bearer YOUR_ADMIN_TOKEN
```

Disconnect from Discord.

**Response:**
```json
{
  "success": true,
  "message": "Discord disconnected"
}
```

---

#### Get Discord Status

```
GET /discord/status
Authorization: Bearer YOUR_ADMIN_TOKEN
```

Get current Discord connection status.

**Response:**
```json
{
  "connected": true,
  "clientId": "1234567890123456789",
  "userId": "9876543210987654321"
}
```

---

#### Check Discord Client Info

```
GET /discord/client-info
```

Get information about the Discord client type and environment. Useful for diagnosing client type issues.

**Response:**
```json
{
  "hasDesktop": true,
  "hasWeb": true,
  "runningOnWindows": true,
  "runningOnMac": false,
  "runningOnLinux": false,
  "canUseDesktop": true,
  "recommendedDownloadUrl": "https://discord.com/download"
}
```

**Field Descriptions:**
- `hasDesktop` - Discord Desktop application is installed
- `hasWeb` - (Info) User may be using Discord web version
- `runningOnWindows/Mac/Linux` - Operating system platform
- `canUseDesktop` - Desktop app is available on this platform
- `recommendedDownloadUrl` - URL to download Discord Desktop

**Note:** VLCord requires Discord Desktop, not the web version. If you're having connection issues, ensure you have Discord Desktop installed and running.

---

### Health & Monitoring

#### Liveness Check

```
GET /health
```

Simple liveness probe for container orchestration.

**Response:**
```json
{
  "status": "ok"
}
```

**Status Codes:**
- `200` - Service running
- `503` - Service unhealthy

---

#### Readiness Check

```
GET /ready
```

Readiness probe indicating if the service is ready to handle requests.

**Response:**
```json
{
  "ready": true,
  "vlc": true,
  "discord": true
}
```

**Status Codes:**
- `200` - Service ready
- `503` - Service not ready

---

#### Prometheus Metrics

```
GET /metrics
```

Prometheus-compatible metrics endpoint.

**Sample Response:**
```
# HELP nodejs_memory_usage_bytes Node.js memory usage
# TYPE nodejs_memory_usage_bytes gauge
nodejs_memory_usage_bytes{kind="external"} 123456
nodejs_memory_usage_bytes{kind="rss"} 78910111
...
```

**Metrics Included:**
- Node.js process metrics (memory, CPU, uptime)
- VLC connection status
- Discord connection status
- API request counts and durations

---

## Error Handling

All error responses follow this format:

```json
{
  "error": true,
  "message": "Description of the error",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_CONFIG` | 400 | Configuration validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid admin token |
| `VLC_DISCONNECTED` | 503 | VLC is not connected |
| `DISCORD_ERROR` | 500 | Discord connection error |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Rate Limiting

### TMDb API

- **Shared key**: 25 requests/10 seconds (shared quota)
- **Personal key**: No limits (uses your own TMDb quota)

### VLC Polling

- **Frequency**: Configurable via `POLLING_INTERVAL` (default: 1000ms)
- **Timeout**: 3000ms per request
- **Retries**: 2 with exponential backoff (300ms base)

---

## WebSocket Events

VLCord also provides real-time updates via Socket.IO:

### Connect
```javascript
const socket = io('http://localhost:7100');
```

### Events

#### `statusUpdate`
Emitted whenever VLC status changes.

```javascript
socket.on('statusUpdate', (status) => {
  console.log('Now playing:', status.title);
  console.log('Progress:', status.percentage + '%');
});
```

#### `configUpdate`
Emitted when configuration changes.

```javascript
socket.on('configUpdate', (config) => {
  console.log('Config updated');
});
```

#### `connectionStatusUpdate`
Emitted when VLC or Discord connection status changes.

```javascript
socket.on('connectionStatusUpdate', (status) => {
  console.log('VLC connected:', status.vlc.connected);
  console.log('Discord connected:', status.discord.connected);
});
```

---

## Examples

### Using cURL

Get current status:
```bash
curl http://localhost:7100/api/status
```

Update configuration:
```bash
curl -X POST http://localhost:7100/api/config \
  -H "Authorization: Bearer your_admin_token" \
  -H "Content-Type: application/json" \
  -d '{
    "polling": {
      "interval": 2000
    }
  }'
```

### Using JavaScript

```javascript
// Fetch status
const response = await fetch('http://localhost:7100/api/status');
const status = await response.json();
console.log(`Playing: ${status.title}`);

// Update configuration
const updateResponse = await fetch('http://localhost:7100/api/config', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your_admin_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tmdb: {
      apiKey: 'your_new_api_key'
    }
  })
});
```

### Using Python

```python
import requests

# Get status
response = requests.get('http://localhost:7100/api/status')
status = response.json()
print(f"Playing: {status['title']}")

# Update configuration
headers = {
    'Authorization': 'Bearer your_admin_token',
    'Content-Type': 'application/json'
}
payload = {
    'polling': {
        'interval': 2000
    }
}
response = requests.post(
    'http://localhost:7100/api/config',
    headers=headers,
    json=payload
)
```

---

## Deployment Examples

### Docker Compose with Monitoring

```yaml
version: '3.8'
services:
  vlcord:
    image: vlcord:latest
    ports:
      - "7100:7100"
    environment:
      ADMIN_TOKEN: "your_secret_token"
      DISCORD_CLIENT_ID: "your_client_id"
    volumes:
      - ./config.env:/app/.env

  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
```

### Kubernetes Health Checks

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 7100
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 7100
  initialDelaySeconds: 10
  periodSeconds: 5
```

---

## Support

For issues or feature requests, visit [GitHub Issues](https://github.com/canna-dev/vlcord/issues).
