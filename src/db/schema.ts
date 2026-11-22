import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  real,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdByUserId: integer('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const properties = pgTable('properties', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  securityMode: text('security_mode').notNull().default('armed_night'),
  autoAlertSeconds: integer('auto_alert_seconds').notNull().default(45),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const cameras = pgTable('cameras', {
  id: serial('id').primaryKey(),
  propertyId: integer('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  status: text('status').notNull().default('clear'),
  positionX: real('position_x').notNull().default(0),
  positionY: real('position_y').notNull().default(2.4),
  positionZ: real('position_z').notNull().default(0),
  staticImagePath: text('static_image_path').notNull(),
  personBoxJson: jsonb('person_box_json').$type<BoundingBox | null>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const residents = pgTable('residents', {
  id: serial('id').primaryKey(),
  propertyId: integer('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  locationLabel: text('location_label').notNull(),
  isHome: boolean('is_home').notNull().default(true),
  distanceKm: real('distance_km'),
  alertStatus: text('alert_status').notNull().default('sent'),
  avatarUrl: text('avatar_url').notNull(),
  marker3dJson: jsonb('marker_3d_json').$type<Point3D | null>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const securityEvents = pgTable('security_events', {
  id: serial('id').primaryKey(),
  externalEventId: text('external_event_id').unique(),
  propertyId: integer('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  cameraSlug: text('camera_slug'),
  title: text('title').notNull(),
  personLabel: text('person_label').notNull(),
  recognitionStatus: text('recognition_status').notNull().default('not_recognised'),
  matchConfidence: integer('match_confidence').notNull().default(94),
  enteredAt: timestamp('entered_at', { withTimezone: true }).notNull(),
  snapshotUrl: text('snapshot_url').notNull(),
  status: text('status').notNull().default('active'),
  autoAlertAt: timestamp('auto_alert_at', { withTimezone: true }),
  gateOpenedAt: timestamp('gate_opened_at', { withTimezone: true }),
  gateLabel: text('gate_label'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const trajectoryPoints = pgTable('trajectory_points', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id')
    .notNull()
    .references(() => securityEvents.id, { onDelete: 'cascade' }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  x: real('x').notNull(),
  y: real('y').notNull().default(0.12),
  z: real('z').notNull(),
  label: text('label'),
  cameraDetected: boolean('camera_detected').notNull().default(true),
});

export const eventNotes = pgTable('event_notes', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id')
    .notNull()
    .references(() => securityEvents.id, { onDelete: 'cascade' }),
  authorUserId: integer('author_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  authorName: text('author_name').notNull(),
  note: text('note').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const afterDarkStats = pgTable('after_dark_stats', {
  id: serial('id').primaryKey(),
  propertyId: integer('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  cameraSlug: text('camera_slug').notNull(),
  slotIndex: integer('slot_index').notNull(),
  hourLabel: text('hour_label').notNull(),
  baselineValue: integer('baseline_value').notNull().default(0),
  tonightValue: integer('tonight_value').notNull().default(0),
  highlightLabel: text('highlight_label'),
});
