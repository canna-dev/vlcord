# VLC Setup Guide

Instructions for setting up VLC to work with VLCord.

## Automatic Setup

1. Open http://localhost:7100
2. Click "Setup Instructions"
3. Follow the automated setup wizard

## Manual Setup

### Enable VLC HTTP Interface

VLCord communicates with VLC through its HTTP interface. You can enable it in several ways:

#### Option 1: Command Line (Windows)
```bash
"C:\Program Files\VideoLAN\VLC\vlc.exe" ^
  --intf http ^
  --http-host localhost ^
  --http-port 8080 ^
  --http-password vlcpassword
```

#### Option 2: Command Line (macOS/Linux)
```bash
vlc \
  --intf http \
  --http-host localhost \
  --http-port 8080 \
  --http-password vlcpassword
```

#### Option 3: VLC GUI (All Platforms)
1. Open VLC Media Player
2. Go to **Tools** → **Preferences** (or **VLC** → **Preferences** on macOS)
3. Click **Show All** in the bottom left
4. Go to **Interface** → **Main interfaces**
5. Enable **Web interface**
6. Go to **Interface** → **Web**
7. Configure the host, port, and password
8. Click **Save**
9. Restart VLC

## Configuration in VLCord

Once VLC is running with the HTTP interface enabled, configure VLCord:

1. Open http://localhost:7100
2. Go to **Settings**
3. Enter VLC connection details:
   - **Host**: localhost (or your VLC server IP)
   - **Port**: 8080 (or configured port)
   - **Password**: vlcpassword (or configured password)
4. Click **Test Connection** to verify
5. Click **Save**

## Docker Networking

If running VLC outside Docker while VLCord is in a container:

```yaml
# docker-compose.yml
vlcord:
  environment:
    - VLC_HOST=host.docker.internal  # macOS/Windows Docker Desktop
    # Or use your machine's IP: VLC_HOST=192.168.1.100
    - VLC_PORT=8080
```

For Linux, use the host's IP address instead of `host.docker.internal`.

## Troubleshooting

### Connection Test Failed
1. Verify VLC is running with HTTP interface enabled
2. Check the host and port settings in VLCord
3. Try accessing VLC's web interface directly: `http://localhost:8080`
4. Check firewall settings

### Web Interface Not Responding
```bash
# Verify VLC HTTP interface is running
# Windows
netstat -ano | findstr :8080

# macOS/Linux
lsof -i :8080
```

### Authentication Error
- Verify the password matches what's set in VLC
- Try resetting VLC preferences
- Restart VLC with the correct parameters

## Advanced Configuration

### External VLC Server
To use a VLC server on a remote machine:

```env
VLC_HOST=192.168.1.100
VLC_PORT=8080
VLC_PASSWORD=securepassword
```

### Multiple VLC Instances
VLCord monitors one VLC instance at a time. To use multiple VLC windows:
1. Each window must be a separate VLC process
2. Configure VLCord to connect to the instance you want to monitor

### Port Conflict
If port 8080 is already in use:
1. Change the port in VLC preferences
2. Update `VLC_PORT` in VLCord settings
3. Restart both applications

## API Endpoint

VLCord communicates with VLC via the HTTP interface at:
```
http://{host}:{port}/status.json
```

This endpoint provides:
- Current playing file information
- Playback position
- Play/pause state
- Playlist information

See [API.md](API.md) for VLCord's REST API documentation.

## Support

For issues with VLC setup:
- [VLC Documentation](https://www.videolan.org/doc/streamer/)
- [VLC HTTP Interface](https://wiki.videolan.org/HttpInterface/)
- GitHub Issues: [canna-dev/vlcord](https://github.com/canna-dev/vlcord/issues)
