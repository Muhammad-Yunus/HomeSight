import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  CameraRecord,
  EventNoteRecord,
  PropertyFullState,
  PropertyRecord,
  ResidentRecord,
  SecurityEventRecord,
  TrajectoryPointRecord,
} from '../types/homesight';

interface UseSocketOptions {
  token: string | null;
  propertyId: number | null;
  onPropertySynced?: (state: PropertyFullState) => void;
  onPropertyMode?: (property: PropertyRecord) => void;
  onEventIngested?: (payload: {
    event: SecurityEventRecord;
    trajectory: TrajectoryPointRecord[];
    cameras: CameraRecord[];
  }) => void;
  onEventUpdated?: (payload: {
    event: SecurityEventRecord;
    cameras?: CameraRecord[];
  }) => void;
  onTrajectoryAppended?: (payload: {
    eventId: number;
    point: TrajectoryPointRecord;
  }) => void;
  onCameraStatus?: (payload: { camera: CameraRecord }) => void;
  onResidentUpdated?: (payload: { resident: ResidentRecord }) => void;
  onNoteCreated?: (payload: { note: EventNoteRecord }) => void;
  onReconnectResync?: () => void;
}

export function useSocket({
  token,
  propertyId,
  onPropertySynced,
  onPropertyMode,
  onEventIngested,
  onEventUpdated,
  onTrajectoryAppended,
  onCameraStatus,
  onResidentUpdated,
  onNoteCreated,
  onReconnectResync,
}: UseSocketOptions) {
  const [connected, setConnected] = useState(false);
  const [socketState, setSocketState] = useState<Socket | null>(null);
  const propertyIdRef = useRef<number | null>(propertyId);
  propertyIdRef.current = propertyId;

  const callbacksRef = useRef({
    onPropertySynced,
    onPropertyMode,
    onEventIngested,
    onEventUpdated,
    onTrajectoryAppended,
    onCameraStatus,
    onResidentUpdated,
    onNoteCreated,
    onReconnectResync,
  });

  callbacksRef.current = {
    onPropertySynced,
    onPropertyMode,
    onEventIngested,
    onEventUpdated,
    onTrajectoryAppended,
    onCameraStatus,
    onResidentUpdated,
    onNoteCreated,
    onReconnectResync,
  };

  useEffect(() => {
    if (!token) {
      setSocketState((prev) => {
        prev?.disconnect();
        return null;
      });
      setConnected(false);
      return;
    }

    const socket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    setSocketState(socket);
    let hasConnectedOnce = false;

    socket.on('connect', () => {
      setConnected(true);
      if (propertyIdRef.current) {
        socket.emit('property:join', propertyIdRef.current);
      }
      socket.emit('stream:subscribe', ['side_passage', 'driveway', 'living_room']);

      if (hasConnectedOnce) {
        callbacksRef.current.onReconnectResync?.();
      }
      hasConnectedOnce = true;
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('property:synced', (data: PropertyFullState) => {
      callbacksRef.current.onPropertySynced?.(data);
    });

    socket.on('property:mode', (data: { property: PropertyRecord }) => {
      callbacksRef.current.onPropertyMode?.(data.property);
    });

    socket.on('event:ingested', (data) => {
      callbacksRef.current.onEventIngested?.(data);
    });

    socket.on('event:updated', (data) => {
      callbacksRef.current.onEventUpdated?.(data);
    });

    socket.on('trajectory:appended', (data) => {
      callbacksRef.current.onTrajectoryAppended?.(data);
    });

    socket.on('camera:status', (data) => {
      callbacksRef.current.onCameraStatus?.(data);
    });

    socket.on('resident:updated', (data) => {
      callbacksRef.current.onResidentUpdated?.(data);
    });

    socket.on('note:created', (data) => {
      callbacksRef.current.onNoteCreated?.(data);
    });

    return () => {
      socket.disconnect();
      setSocketState(null);
      setConnected(false);
    };
  }, [token]);

  useEffect(() => {
    if (socketState && connected && propertyId) {
      socketState.emit('property:join', propertyId);
    }
  }, [socketState, connected, propertyId]);

  return { socket: socketState, connected };
}
