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

export interface AuthUser {
  id?: number;
  userId?: number;
  email: string;
  name: string;
  role: string;
}

export interface ApiKeyInfo {
  id: number;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface PropertyRecord {
  id: number;
  slug: string;
  name: string;
  securityMode: 'armed_night' | 'armed_away' | 'disarmed';
  autoAlertSeconds: number;
  createdAt: string;
}

export type CameraSlug = 'side_passage' | 'driveway' | 'living_room';

export interface CameraRecord {
  id: number;
  propertyId: number;
  slug: CameraSlug;
  name: string;
  status: 'clear' | 'person_in_view' | 'offline';
  positionX: number;
  positionY: number;
  positionZ: number;
  staticImagePath: string;
  personBoxJson: BoundingBox | null;
  updatedAt: string;
}

export interface ResidentRecord {
  id: number;
  propertyId: number;
  slug: string;
  name: string;
  locationLabel: string;
  isHome: boolean;
  distanceKm: number | null;
  alertStatus: 'sent' | 'none' | 'acknowledged';
  avatarUrl: string;
  marker3dJson: Point3D | null;
  updatedAt: string;
}

export interface SecurityEventRecord {
  id: number;
  externalEventId: string | null;
  propertyId: number;
  cameraSlug: string | null;
  title: string;
  personLabel: string;
  recognitionStatus: 'not_recognised' | 'recognised' | 'cleared';
  matchConfidence: number;
  enteredAt: string;
  snapshotUrl: string;
  status: 'active' | 'marked_safe' | 'alert_sent';
  autoAlertAt: string | null;
  gateOpenedAt: string | null;
  gateLabel: string | null;
  createdAt: string;
}

export interface TrajectoryPointRecord {
  id: number;
  eventId: number;
  recordedAt: string;
  x: number;
  y: number;
  z: number;
  label: string | null;
  cameraDetected: boolean;
}

export interface EventNoteRecord {
  id: number;
  eventId: number;
  authorUserId: number | null;
  authorName: string;
  note: string;
  createdAt: string;
}

export interface AfterDarkStatRecord {
  id: number;
  propertyId: number;
  cameraSlug: string;
  slotIndex: number;
  hourLabel: string;
  baselineValue: number;
  tonightValue: number;
  highlightLabel: string | null;
}

export interface PropertyFullState {
  property: PropertyRecord;
  cameras: CameraRecord[];
  residents: ResidentRecord[];
  events: SecurityEventRecord[];
  activeEvent: SecurityEventRecord | null;
  trajectory: TrajectoryPointRecord[];
  notes: EventNoteRecord[];
  afterDarkStats: AfterDarkStatRecord[];
}
