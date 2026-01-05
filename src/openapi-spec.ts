/**
 * OpenAPI/Swagger documentation for VLCord API
 */

export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'VLCord API',
    description: 'Discord Rich Presence integration for VLC Media Player with automatic metadata detection',
    version: '1.0.0',
    contact: {
      name: 'VLCord Support',
      url: 'https://github.com/canna-dev/vlcord',
      email: 'admin@cannaman.xyz'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local development server'
    },
    {
      url: 'http://localhost:5000',
      description: 'Production server'
    }
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Health Check',
        description: 'Returns the health status of all services',
        tags: ['System'],
        responses: {
          '200': {
            description: 'System is healthy or degraded',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HealthCheck'
                }
              }
            }
          },
          '503': {
            description: 'System is unhealthy'
          }
        }
      }
    },
    '/api/status': {
      get: {
        summary: 'Get Current VLC Status',
        description: 'Returns the current status of the VLC player',
        tags: ['VLC'],
        responses: {
          '200': {
            description: 'Current VLC status',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/VLCStatus'
                }
              }
            }
          }
        }
      }
    },
    '/api/monitor/pause': {
      post: {
        summary: 'Pause Monitoring',
        description: 'Pause Discord presence updates',
        tags: ['Monitor'],
        security: [
          {
            bearerAuth: []
          }
        ],
        responses: {
          '200': {
            description: 'Monitoring paused successfully'
          },
          '401': {
            description: 'Unauthorized'
          }
        }
      }
    },
    '/api/monitor/resume': {
      post: {
        summary: 'Resume Monitoring',
        description: 'Resume Discord presence updates',
        tags: ['Monitor'],
        security: [
          {
            bearerAuth: []
          }
        ],
        responses: {
          '200': {
            description: 'Monitoring resumed successfully'
          },
          '401': {
            description: 'Unauthorized'
          }
        }
      }
    },
    '/api/discord/activity-history': {
      get: {
        summary: 'Get Activity History',
        description: 'Retrieve the history of Discord presence updates',
        tags: ['Discord'],
        parameters: [
          {
            name: 'count',
            in: 'query',
            description: 'Number of recent activities to return',
            schema: {
              type: 'integer',
              default: 10,
              minimum: 1,
              maximum: 100
            }
          },
          {
            name: 'status',
            in: 'query',
            description: 'Filter by activity status',
            schema: {
              type: 'string',
              enum: ['success', 'failed', 'pending']
            }
          }
        ],
        responses: {
          '200': {
            description: 'Activity history retrieved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    history: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/ActivityHistoryEntry'
                      }
                    },
                    stats: {
                      $ref: '#/components/schemas/ActivityStats'
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/metadata/overrides': {
      get: {
        summary: 'Get All Metadata Overrides',
        description: 'Retrieve all custom metadata overrides',
        tags: ['Metadata'],
        responses: {
          '200': {
            description: 'List of metadata overrides',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/MetadataOverride'
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Create/Update Metadata Override',
        description: 'Add or update a custom metadata override',
        tags: ['Metadata'],
        security: [
          {
            bearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/MetadataOverride'
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Override created/updated'
          },
          '400': {
            description: 'Invalid request body'
          },
          '401': {
            description: 'Unauthorized'
          }
        }
      },
      delete: {
        summary: 'Delete Metadata Override',
        description: 'Remove a custom metadata override',
        tags: ['Metadata'],
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: 'id',
            in: 'query',
            required: true,
            description: 'Override ID to delete',
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Override deleted'
          },
          '401': {
            description: 'Unauthorized'
          },
          '404': {
            description: 'Override not found'
          }
        }
      }
    },
    '/api/system/circuit-breakers': {
      get: {
        summary: 'Get Circuit Breaker Status',
        description: 'Retrieve status of all circuit breakers',
        tags: ['System'],
        responses: {
          '200': {
            description: 'Circuit breaker statuses',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    $ref: '#/components/schemas/CircuitBreakerStatus'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/metrics': {
      get: {
        summary: 'Prometheus Metrics',
        description: 'Prometheus-compatible metrics endpoint',
        tags: ['Metrics'],
        responses: {
          '200': {
            description: 'Prometheus metrics in text format'
          }
        }
      }
    }
  },
  components: {
    schemas: {
      VLCStatus: {
        type: 'object',
        properties: {
          isRunning: {
            type: 'boolean',
            description: 'VLC player is running'
          },
          isPlaying: {
            type: 'boolean',
            description: 'Content is currently playing'
          },
          filename: {
            type: 'string',
            nullable: true,
            description: 'Current file being played'
          },
          title: {
            type: 'string',
            nullable: true,
            description: 'Parsed title of current content'
          },
          time: {
            type: 'integer',
            description: 'Current playback time in seconds'
          },
          duration: {
            type: 'integer',
            description: 'Total duration in seconds'
          },
          percentage: {
            type: 'number',
            description: 'Playback percentage'
          },
          state: {
            type: 'string',
            enum: ['playing', 'paused', 'stopped'],
            description: 'Current playback state'
          }
        },
        required: [
          'isRunning',
          'isPlaying',
          'time',
          'duration',
          'percentage',
          'state'
        ]
      },
      HealthCheck: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'degraded', 'unhealthy'],
            description: 'Overall health status'
          },
          uptime: {
            type: 'integer',
            description: 'Uptime in milliseconds'
          },
          connections: {
            type: 'object',
            properties: {
              discord: {
                type: 'boolean',
                description: 'Discord connection status'
              },
              vlc: {
                type: 'boolean',
                description: 'VLC connection status'
              },
              circuitBreakers: {
                type: 'object',
                additionalProperties: {
                  $ref: '#/components/schemas/CircuitBreakerStatus'
                }
              }
            }
          },
          metrics: {
            type: 'object',
            properties: {
              averageUpdateTime: {
                type: 'number'
              },
              totalUpdates: {
                type: 'integer'
              },
              failureRate: {
                type: 'number'
              }
            }
          }
        },
        required: ['status', 'uptime', 'connections']
      },
      ActivityHistoryEntry: {
        type: 'object',
        properties: {
          id: {
            type: 'string'
          },
          timestamp: {
            type: 'integer',
            description: 'Unix timestamp'
          },
          activity: {
            type: 'object',
            properties: {
              state: {
                type: 'string'
              },
              details: {
                type: 'string'
              }
            }
          },
          status: {
            type: 'string',
            enum: ['success', 'failed', 'pending']
          },
          error: {
            type: 'string',
            nullable: true
          }
        }
      },
      ActivityStats: {
        type: 'object',
        properties: {
          totalUpdates: {
            type: 'integer'
          },
          successfulUpdates: {
            type: 'integer'
          },
          failedUpdates: {
            type: 'integer'
          },
          averageUpdateTime: {
            type: 'number'
          },
          lastUpdate: {
            type: 'integer',
            nullable: true
          }
        }
      },
      MetadataOverride: {
        type: 'object',
        properties: {
          id: {
            type: 'string'
          },
          category: {
            type: 'string',
            enum: ['movie', 'show', 'custom']
          },
          title: {
            type: 'string'
          },
          override: {
            type: 'object',
            description: 'Custom Discord presence data'
          },
          createdAt: {
            type: 'integer'
          },
          updatedAt: {
            type: 'integer'
          }
        }
      },
      CircuitBreakerStatus: {
        type: 'object',
        properties: {
          service: {
            type: 'string'
          },
          state: {
            type: 'string',
            enum: ['CLOSED', 'OPEN', 'HALF_OPEN']
          },
          failureCount: {
            type: 'integer'
          },
          successCount: {
            type: 'integer'
          },
          lastFailure: {
            type: 'integer',
            nullable: true
          },
          nextRetry: {
            type: 'integer',
            nullable: true
          }
        }
      }
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Token',
        description: 'Enter your admin token'
      }
    }
  },
  tags: [
    {
      name: 'System',
      description: 'System health and status endpoints'
    },
    {
      name: 'VLC',
      description: 'VLC player integration endpoints'
    },
    {
      name: 'Discord',
      description: 'Discord presence and activity endpoints'
    },
    {
      name: 'Monitor',
      description: 'Monitoring control endpoints'
    },
    {
      name: 'Metadata',
      description: 'Metadata override management'
    },
    {
      name: 'Metrics',
      description: 'Prometheus metrics and monitoring'
    }
  ]
};

export default openApiSpec;
