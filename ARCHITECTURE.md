# VLCord Architecture Diagram

## System Architecture (Post-Integration)

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
├─────────────────────────────────────────────────────────────┤
│  Browser (http://localhost:7100)                             │
│  ├─ Dashboard HTML/CSS/JS (Enhanced with search/export)     │
│  ├─ WebSocket connection (real-time updates)                │
│  └─ Admin API calls (with X-VLCORD-ADMIN-TOKEN)             │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                    EXPRESS SERVER                            │
│              (src/main.js - Port 7100)                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              CORE MANAGERS (NEW)                       │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │                                                        │ │
│  │  ┌─────────────────────┐   ┌───────────────────────┐ │ │
│  │  │ HealthCheckManager  │   │ ConfigHotReloadMgr   │ │ │
│  │  │ (health-check-...)  │   │ (config-hot-reload)  │ │ │
│  │  │                     │   │                       │ │ │
│  │  │ • Tracks metrics    │   │ • File watching       │ │ │
│  │  │ • Records success   │   │ • Config validation   │ │ │
│  │  │ • Generates recos   │   │ • Zero-downtime      │ │ │
│  │  └─────────┬───────────┘   └───────────┬───────────┘ │ │
│  │            │                           │             │ │
│  │  ┌─────────▼──────────┐   ┌────────────▼───────────┐ │ │
│  │  │ RedisCacheManager  │   │ CircuitBreakerMgr     │ │ │
│  │  │ (redis-cache.ts)   │   │ (circuit-breaker.js)  │ │ │
│  │  │                    │   │                       │ │ │
│  │  │ • Caching layer    │   │ • Service resilience  │ │ │
│  │  │ • TTL management   │   │ • State tracking      │ │ │
│  │  │ • Cache invalidate │   │ • Recovery control    │ │ │
│  │  └─────────┬──────────┘   └───────────┬───────────┘ │ │
│  │            │                          │             │ │
│  └────────────┼──────────────────────────┼─────────────┘ │
│               │                          │               │
│  ┌────────────▼──────────────────────────▼─────────────┐ │
│  │           MONITORING & METRICS                      │ │
│  ├───────────────────────────────────────────────────┤ │
│  │ • GET /health → Enhanced diagnostics              │ │
│  │ • GET /api/system/health/diagnostics → Details    │ │
│  │ • GET /api/system/logs → System logs              │ │
│  │ • GET /api/system/cache/status → Cache stats      │ │
│  │ • POST /circuit-breakers/:service/reset → Recovery│ │
│  └───────────────────────────────────────────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │         EXISTING SERVICES (Unchanged)              │ │
│  ├────────────────────────────────────────────────────┤ │
│  │                                                    │ │
│  │  ┌─────────────────┐  ┌──────────────────────┐  │ │
│  │  │ VLC Monitor     │  │ Discord Presence     │  │ │
│  │  │ (vlc-monitor)   │  │ (discord-presence)   │  │ │
│  │  │                 │  │                      │  │ │
│  │  │ • Polls VLC     │  │ • RPC connection     │  │ │
│  │  │ • Gets metadata │  │ • Status updates     │  │ │
│  │  │ • Emits updates │  │ • Rich presence      │  │ │
│  │  └────────┬────────┘  └──────────┬───────────┘  │ │
│  │           │                      │              │ │
│  │  ┌────────▼────────────────────────────────┐   │ │
│  │  │  Activity History DB (SQLite)           │   │ │
│  │  │  • Records all updates                  │   │ │
│  │  │  • Provides historical data             │   │ │
│  │  │  • Used by health checks                │   │ │
│  │  └─────────────────────────────────────────┘   │ │
│  │                                                │ │
│  │  ┌────────────────────────────────────────┐   │ │
│  │  │  Config Manager & Validators           │   │ │
│  │  │  • Loads configuration                 │   │ │
│  │  │  • Validates inputs                    │   │ │
│  │  │  • Manages secrets                     │   │ │
│  │  └────────────────────────────────────────┘   │ │
│  │                                                │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  ┌────────────────────────────────────────────────┐ │
│  │         DATA PERSISTENCE LAYER                 │ │
│  ├────────────────────────────────────────────────┤ │
│  │                                                │ │
│  │  ┌──────────────┐        ┌──────────────────┐ │ │
│  │  │ SQLite DB    │        │ Redis Cache      │ │ │
│  │  │ (Local)      │        │ (Optional)       │ │ │
│  │  │              │        │                  │ │ │
│  │  │ • Activity   │        │ • Metadata       │ │ │
│  │  │ • Metadata   │        │ • Session state  │ │ │
│  │  │ • Overrides  │        │ • Rate limits    │ │ │
│  │  └──────────────┘        └──────────────────┘ │ │
│  │                                                │ │
│  │  Config File (JSON)                           │ │
│  │  • VLC settings                               │ │
│  │  • Discord client ID                          │ │
│  │  • TMDb API key                               │ │
│  │  (Watched for hot-reload)                     │ │
│  │                                                │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
└───────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼────────┐ ┌──────▼──────┐ ┌──────▼──────────┐
│  VLC Web API   │ │   Discord   │ │   TMDb API     │
│  (Local/Remote)│ │  (RPC)      │ │                │
│                │ │             │ │ Movie/TV data  │
│ • Playlist     │ │ • Status    │ │                │
│ • Now Playing  │ │ • Activity  │ │ • Metadata     │
│ • Duration     │ │ • Rich Text │ │ • Ratings      │
└────────────────┘ └─────────────┘ └────────────────┘
```

---

## Data Flow Diagram

```
VLC Media Player
       │
       │ (via HTTP Web Interface)
       ▼
  VLC Monitor
  (Polls every 1s)
       │
       ├──► Currently playing
       ├──► Duration/Position
       ├──► Title/Metadata
       │
       ▼
Activity Recorded
       │
       ├──────────────────────┬──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
   SQLite DB         HealthCheckManager      Redis Cache
   (Persistent)      (Metrics/Diagnostics)   (Optional)
       │                      │                    │
       │                      ├─► Recommendations │
       │                      ├─► Recovery times  │
       │                      └─► Service health  │
       │
       ├──────────────────────┐
       │                      │
       ▼                      ▼
Discord RPC              Dashboard/API
   │                          │
   ├─► Status Update     ├─► Health endpoint
   ├─► Rich Presence     ├─► Diagnostics
   └─► Metadata          ├─► Logs
                        ├─► Cache stats
                        └─► Activity history

Config Changes Detected
       │
       ▼
ConfigHotReloadManager
       │
       ├─► Validate
       ├─► Notify Listeners
       │
       ├──────┬──────┬──────┐
       ▼      ▼      ▼      ▼
     VLC  Discord  TMDb  Server
   (Reconnect, Update credentials, Apply settings)
       │
       ▼
Services Continue Without Downtime
```

---

## Request/Response Flow

### Health Check Request
```
GET /health (with admin token)
        │
        ▼
Express Route Handler
        │
        ├─► HealthCheckManager.getHealth()
        │
        ├─► CircuitBreakerManager.getStates()
        │
        ├─► ActivityHistory.getStats()
        │
        ▼
Generate Recommendations
        │
        ├─► High failure rate?
        ├─► Services offline?
        ├─► Slow updates?
        ├─► Resource issues?
        │
        ▼
HTTP 200/503 Response
{
  status: "healthy" | "unhealthy",
  uptime: 3600,
  connections: {...},
  metrics: {...},
  recommendations: [...]
}
```

### Cache Operation Request
```
GET /api/data/:id
        │
        ▼
Check Redis Cache (if enabled)
        │
    ┌───┴───┐
    │       │
 HIT      MISS
    │       │
    │       ▼
    │   Query Database
    │       │
    │       ▼
    │   Store in Redis (TTL)
    │       │
    └───┬───┘
        ▼
Return Data
```

### Config Hot-Reload Flow
```
Edit config.json
        │
        ▼
File system detects change
        │
        ▼
ConfigHotReloadManager (debounce 1s)
        │
        ▼
Read & Parse file
        │
        ▼
Validate config
        │
    ┌───┴────┐
    │        │
 Valid    Invalid
    │        │
    │        ▼
    │    Log error
    │    Keep old config
    │
    ▼
Emit onChange events
        │
        ├─► VLC Monitor (reconnect)
        ├─► Discord Presence (reconnect)
        ├─► TMDb Client (update key)
        └─► Server settings (reload)
        │
        ▼
Services update with new config
        │
        ▼
Continue operation (no downtime)
```

---

## Deployment Architecture

### Local Development
```
Developer Machine
├─ Node.js v24.12.0
├─ npm
├─ VLC Media Player
├─ Discord (running)
└─ (Optional) Redis
```

### Docker Compose (Recommended)
```
Docker Engine
├─ Container 1: VLCord
│  ├─ Node.js
│  ├─ All VLCord code
│  └─ Port 7100
│
├─ Container 2: Redis
│  ├─ Redis server
│  └─ Port 6379
│
└─ Network: vlcord-network
   └─ Containers communicate via network
```

### PM2 Production
```
Linux/Mac Server
├─ Node.js
├─ npm
├─ PM2 Process Manager
│  ├─ Monitors VLCord process
│  ├─ Auto-restarts on crash
│  ├─ Log management
│  └─ Memory limits
│
├─ Redis (separate or docker)
│
├─ Nginx (reverse proxy)
│  └─ HTTPS/SSL termination
│
└─ Firewall
   ├─ Port 443: HTTPS
   ├─ Port 80: HTTP → HTTPS redirect
   └─ Port 7100: Internal only (via Nginx)
```

### Kubernetes (Enterprise)
```
Kubernetes Cluster
├─ VLCord Deployment
│  ├─ 2+ replicas
│  ├─ Auto-scaling
│  └─ Health probes
│
├─ Redis StatefulSet
│  ├─ Persistent volume
│  └─ Auto-failover
│
├─ Ingress Controller
│  └─ HTTPS/TLS
│
└─ ConfigMap
   └─ Configuration management
```

---

## Component Interaction Matrix

```
                    │ Health │ Redis │ Config │ Monitor │ Discord │
────────────────────┼────────┼───────┼────────┼─────────┼─────────┤
HealthCheckManager  │   -    │  Logs │  Read  │  Reads  │  Reads  │
RedisCacheManager   │   -    │   -   │  Read  │  Cache  │  Cache  │
ConfigHotReload     │   -    │ Clear │   -    │ Updates │ Updates │
VLCMonitor          │  Calls │ Store │  Read  │   -     │  Uses   │
DiscordPresence     │  Calls │ Store │  Read  │  Uses   │   -     │
ActivityHistory     │  Reads │ Cache │   -    │ Writes  │   -     │
────────────────────┼────────┼───────┼────────┼─────────┼─────────┘

Legend:
- : No interaction
Calls : Calls methods of
Reads : Reads data from
Writes : Writes data to
Logs : Records logs to
Reads : Gets config from
Updates : Notified of config changes
```

---

## Error Handling Flow

```
Operation Fails
       │
       ▼
CircuitBreaker.recordFailure()
       │
       ├─► Increment failure counter
       ├─► Check failure threshold
       │
       ├─── If threshold exceeded:
       │    │
       │    ├─► Open circuit (stop requests)
       │    ├─► Wait for recovery window
       │    ├─► Gracefully degrade service
       │    └─► Update health status
       │
       └─── If threshold not exceeded:
            │
            └─► Continue normal operation
                │
                ├─► Log failure
                ├─► Record in activity history
                ├─► Update health metrics
                └─► Cache circuit state
```

---

## Performance Optimization Path

```
Request comes in
       │
       ▼
Redis Cache Check (1ms)
       │
   ┌───┴───┐
   │       │
  HIT      MISS
  (0.5ms)  (50ms)
   │       │
   │       ▼
   │   Database Query (40ms)
   │   Database Sorting/Filter (5ms)
   │       │
   │       ▼
   │   Store in Redis (2ms)
   │       │
   └───┬───┘
       ▼
   Response (Total: 2-51ms)

70% of requests hit cache
Average response time: ~3ms
vs without cache: ~50ms
```

---

## Security Layers

```
Incoming Request
       │
       ▼
Firewall
├─ Port filtering
└─ Rate limiting (IP-based)
       │
       ▼
Express Middleware
├─ CORS validation
└─ Request parsing
       │
       ▼
Authentication
├─ X-VLCORD-ADMIN-TOKEN header check
└─ Token validation
       │
       ▼
Validation
├─ Input sanitization
├─ Type checking
└─ Range validation
       │
       ▼
Business Logic
├─ Authorization checks
├─ Database queries
└─ Service updates
       │
       ▼
Response
├─ Error message filtering (no stack traces)
├─ Status codes
└─ JSON response
```

---

## Monitoring Points

```
┌──────────────────────────────────────┐
│        MONITORING DASHBOARD           │
├──────────────────────────────────────┤
│                                       │
│  Real-time Metrics:                  │
│  ├─ /health                          │
│  ├─ /api/system/health/diagnostics   │
│  ├─ /api/system/cache/status         │
│  ├─ /api/system/logs                 │
│  ├─ /api/discord/activity-history    │
│  └─ /metrics (Prometheus)            │
│                                       │
│  Alertable Events:                   │
│  ├─ Circuit breaker trips            │
│  ├─ High failure rates               │
│  ├─ Cache misses                     │
│  ├─ Configuration changes            │
│  └─ Service disconnections           │
│                                       │
│  Performance Metrics:                │
│  ├─ Response times                   │
│  ├─ Cache hit rate                   │
│  ├─ Database query count             │
│  ├─ Memory usage                     │
│  └─ CPU usage                        │
│                                       │
└──────────────────────────────────────┘
```

---

## System State Machine

```
                    ┌─────────────┐
                    │   Startup   │
                    └──────┬──────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ Initialize Managers  │
                │ • HealthCheck        │
                │ • Redis (optional)   │
                │ • ConfigHotReload    │
                └──────────┬───────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │     READY - Monitoring Active     │
        │                                   │
        │  Services:                       │
        │  ├─ VLC connected? polling...    │
        │  ├─ Discord connected?           │
        │  └─ Watching config file         │
        └───┬──────────────────────────────┘
            │
    ┌───────┴────────┬────────────┬──────────────┐
    │                │            │              │
    ▼                ▼            ▼              ▼
 Update         Config      Service       Error
Received       Changed      Failed     Detected
    │                │            │              │
    ├─Record      ├─Reload   ├─Trip breaker   ├─Log
    ├─Cache       ├─Notify   ├─Degrade       ├─Notify
    └─Health      └─Continue ├─Retry         └─Recover
                             └─Update health
                               │
                               ▼
                          Recovery Timer
                               │
                      (Wait & Retry Logic)
                               │
                    ┌──────────┴──────────┐
                    │                     │
                Recovered           Still Failed
                    │                     │
                    ▼                     ▼
              ├─Reset breaker      ├─Continue failing
              ├─Resume service     ├─Log details
              └─Clear cache        └─Wait retry
                    │                   │
                    └─────────┬─────────┘
                              │
                              ▼
                        READY (Loop)
```

---

This architecture provides:
- ✅ **Monitoring**: Health, diagnostics, logs, cache stats
- ✅ **Resilience**: Circuit breakers, failover, graceful degradation
- ✅ **Performance**: Redis caching, connection pooling, optimization
- ✅ **Observability**: Metrics, events, activity history
- ✅ **Flexibility**: Hot-reload, optional components, multiple deployments
- ✅ **Security**: Auth, validation, rate limiting, error handling
