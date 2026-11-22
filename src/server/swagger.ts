export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Home Sight Spatial Security API',
    version: '1.0.0',
    description:
      'REST & External Ingest API for Home Sight. App endpoints use user-based JWT Bearer authentication. External system ingest endpoints (/api/ingest/*) are strictly separated and authenticated via X-API-Key.',
  },
  servers: [
    {
      url: '/',
      description: 'Current Home Sight instance',
    },
  ],
  tags: [
    { name: 'Auth', description: 'User-based application authentication (JWT Bearer)' },
    { name: 'API Keys', description: 'Manage external ingest API keys (Admin/Member)' },
    { name: 'Dashboard', description: 'Property state, events, notes, and security actions' },
    {
      name: 'External Ingest',
      description:
        'External system integration API (API Key auth only) — broadcasts real-time Socket.IO updates after persisting to PostgreSQL',
    },
    { name: 'WebRTC & Streams', description: 'FFmpeg 5 FPS WebRTC signaling & stream status' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'User session JWT returned by /api/auth/login or /api/auth/register',
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'Ingest API key for external camera/AI/sensor pipelines',
      },
    },
    schemas: {
      TrajectoryPointInput: {
        type: 'object',
        required: ['x', 'z'],
        properties: {
          x: { type: 'number', example: -2.45 },
          y: { type: 'number', example: 0.14 },
          z: { type: 'number', example: 2.1 },
          recordedAt: { type: 'string', format: 'date-time', example: '2026-11-22T23:39:30Z' },
          label: { type: 'string', nullable: true, example: 'Side gate opened' },
          cameraDetected: { type: 'boolean', example: true },
        },
      },
      IngestEventInput: {
        type: 'object',
        required: ['propertySlug', 'title', 'personLabel', 'enteredAt'],
        properties: {
          externalEventId: { type: 'string', example: 'evt_alder_20261122_2338' },
          propertySlug: { type: 'string', example: '27-alder-road' },
          cameraSlug: { type: 'string', example: 'side_passage' },
          title: { type: 'string', example: 'Unknown person in the side passage' },
          personLabel: { type: 'string', example: 'Unknown person' },
          recognitionStatus: {
            type: 'string',
            enum: ['not_recognised', 'recognised', 'cleared'],
            example: 'not_recognised',
          },
          matchConfidence: { type: 'integer', minimum: 0, maximum: 100, example: 94 },
          enteredAt: { type: 'string', format: 'date-time', example: '2026-11-22T23:38:00Z' },
          snapshotUrl: { type: 'string', example: '/src/assets/images/cam_side_person_1795348556430.jpg' },
          autoAlertSeconds: { type: 'integer', example: 45 },
          gateOpenedAt: { type: 'string', format: 'date-time', nullable: true },
          gateLabel: { type: 'string', nullable: true, example: 'Side gate opened' },
          trajectory: {
            type: 'array',
            items: { $ref: '#/components/schemas/TrajectoryPointInput' },
          },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        tags: ['Dashboard'],
        summary: 'Service, PostgreSQL, and FFmpeg 5 FPS stream health check',
        responses: {
          '200': { description: 'Health payload' },
        },
      },
    },
    '/api/auth/bootstrap-status': {
      get: {
        tags: ['Auth'],
        summary: 'Check whether the first admin account has been registered',
        responses: { '200': { description: 'Bootstrap status' } },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new dashboard user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'Daniel Novak' },
                  email: { type: 'string', format: 'email', example: 'daniel@homesight.local' },
                  password: { type: 'string', minLength: 8, example: 'SecurePass123!' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Registered user and JWT Bearer token' },
          '409': { description: 'Email already registered' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Authenticate dashboard user and receive JWT Bearer token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Authenticated user and JWT token' },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        security: [{ BearerAuth: [] }],
        summary: 'Get currently signed-in user profile',
        responses: { '200': { description: 'Current user' } },
      },
    },
    '/api/api-keys': {
      get: {
        tags: ['API Keys'],
        security: [{ BearerAuth: [] }],
        summary: 'List created external ingest API keys (prefix + metadata)',
        responses: { '200': { description: 'List of API keys' } },
      },
      post: {
        tags: ['API Keys'],
        security: [{ BearerAuth: [] }],
        summary: 'Generate a new X-API-Key for external ingest integration',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', example: 'Frigate NVR Edge' } },
              },
            },
          },
        },
        responses: { '201': { description: 'Newly generated API key (shown once)' } },
      },
    },
    '/api/api-keys/{id}': {
      delete: {
        tags: ['API Keys'],
        security: [{ BearerAuth: [] }],
        summary: 'Revoke an ingest API key',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Key revoked' } },
      },
    },
    '/api/properties': {
      get: {
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        summary: 'List monitored properties',
        responses: { '200': { description: 'Properties list' } },
      },
    },
    '/api/properties/{id}/state': {
      get: {
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        summary: 'Get complete real-time state for a property (cameras, residents, active event, trajectory, notes, histogram)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Full property state' } },
      },
    },
    '/api/properties/{id}/mode': {
      patch: {
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        summary: 'Change property security mode (armed_night, armed_away, disarmed)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['securityMode'],
                properties: {
                  securityMode: { type: 'string', enum: ['armed_night', 'armed_away', 'disarmed'] },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Updated property' } },
      },
    },
    '/api/events/{id}/mark-safe': {
      post: {
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        summary: 'Mark active security event as safe and clear active camera alerts',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Event marked safe' } },
      },
    },
    '/api/events/{id}/alert': {
      post: {
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        summary: 'Dispatch immediate alert to monitoring centre',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Alert dispatched' } },
      },
    },
    '/api/events/{id}/notes': {
      post: {
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        summary: 'Add an operator note to a security event',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['note'],
                properties: { note: { type: 'string', example: 'Confirmed delivery courier left parcel by gate.' } },
              },
            },
          },
        },
        responses: { '201': { description: 'Note created' } },
      },
    },
    '/api/cameras/{slug}/frame': {
      get: {
        tags: ['WebRTC & Streams'],
        security: [{ BearerAuth: [] }],
        summary: 'Fetch latest 5 FPS FFmpeg MJPEG camera frame (image/jpeg)',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['side_passage', 'driveway', 'living_room'] },
          },
        ],
        responses: {
          '200': { description: 'Latest JPEG frame' },
          '401': { description: 'Bearer token required' },
        },
      },
    },
    '/api/webrtc/offer': {
      post: {
        tags: ['WebRTC & Streams'],
        security: [{ BearerAuth: [] }],
        summary: 'Exchange WebRTC SDP offer/answer for 5 FPS FFmpeg camera DataChannel stream',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['peerId', 'sdp', 'type'],
                properties: {
                  peerId: { type: 'string' },
                  sdp: { type: 'string' },
                  type: { type: 'string', enum: ['offer'] },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'WebRTC SDP answer' } },
      },
    },
    '/api/ingest/bootstrap': {
      post: {
        tags: ['External Ingest'],
        security: [{ ApiKeyAuth: [] }],
        summary: 'Upsert property, cameras, residents, and baseline after-dark stats from external system',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['property', 'cameras', 'residents'],
                properties: {
                  property: {
                    type: 'object',
                    properties: {
                      slug: { type: 'string', example: '27-alder-road' },
                      name: { type: 'string', example: '27 Alder Road' },
                      securityMode: { type: 'string', example: 'armed_night' },
                      autoAlertSeconds: { type: 'integer', example: 45 },
                    },
                  },
                  cameras: { type: 'array', items: { type: 'object' } },
                  residents: { type: 'array', items: { type: 'object' } },
                  afterDarkStats: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Property topology synced' },
          '401': { description: 'Missing X-API-Key' },
          '403': { description: 'Invalid X-API-Key' },
        },
      },
    },
    '/api/ingest/events': {
      post: {
        tags: ['External Ingest'],
        security: [{ ApiKeyAuth: [] }],
        summary: 'Ingest a security detection event with optional 3D trajectory points',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IngestEventInput' },
            },
          },
        },
        responses: {
          '201': { description: 'Event persisted and pushed via Socket.IO' },
          '401': { description: 'Missing X-API-Key' },
        },
      },
    },
    '/api/ingest/events/{externalEventId}/trajectory': {
      post: {
        tags: ['External Ingest'],
        security: [{ ApiKeyAuth: [] }],
        summary: 'Append a real-time 3D trajectory coordinate to an existing event',
        parameters: [
          {
            name: 'externalEventId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TrajectoryPointInput' },
            },
          },
        },
        responses: { '201': { description: 'Trajectory point appended and broadcast' } },
      },
    },
    '/api/ingest/cameras/status': {
      post: {
        tags: ['External Ingest'],
        security: [{ ApiKeyAuth: [] }],
        summary: 'Update camera live status and person bounding box',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cameraSlug', 'status'],
                properties: {
                  cameraSlug: { type: 'string', example: 'side_passage' },
                  status: { type: 'string', enum: ['clear', 'person_in_view', 'offline'] },
                  personBox: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      x: { type: 'number', example: 0.52 },
                      y: { type: 'number', example: 0.19 },
                      w: { type: 'number', example: 0.09 },
                      h: { type: 'number', example: 0.62 },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Camera status updated' } },
      },
    },
    '/api/ingest/residents/presence': {
      post: {
        tags: ['External Ingest'],
        security: [{ ApiKeyAuth: [] }],
        summary: 'Update resident home presence and notification status',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['residentSlug', 'isHome'],
                properties: {
                  residentSlug: { type: 'string', example: 'emma-novak' },
                  isHome: { type: 'boolean', example: true },
                  locationLabel: { type: 'string', example: 'Upstairs bedroom' },
                  distanceKm: { type: 'number', nullable: true },
                  alertStatus: { type: 'string', enum: ['sent', 'none', 'acknowledged'] },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Resident presence updated' } },
      },
    },
    '/api/ingest/stats/after-dark': {
      post: {
        tags: ['External Ingest'],
        security: [{ ApiKeyAuth: [] }],
        summary: 'Update 30-night baseline and tonight after-dark visit histogram',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['propertySlug', 'stats'],
                properties: {
                  propertySlug: { type: 'string', example: '27-alder-road' },
                  cameraSlug: { type: 'string', example: 'side_passage' },
                  stats: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        slotIndex: { type: 'integer', example: 11 },
                        hourLabel: { type: 'string', example: '23:38' },
                        baselineValue: { type: 'integer', example: 0 },
                        tonightValue: { type: 'integer', example: 7 },
                        highlightLabel: { type: 'string', nullable: true, example: 'Tonight 23:38' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'After-dark histogram updated' } },
      },
    },
  },
};
