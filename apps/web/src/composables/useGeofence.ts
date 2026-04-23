import { ref } from "vue";
import type { LocationReminder } from "@tasktick/shared";
import { fetchLocationReminders } from "../api";
import { notify } from "../utils/electron";

interface GeofenceState {
  inside: boolean;
  lastCheck: number;
}

interface GeofenceInstance {
  locationReminders: typeof locationReminders;
  currentPosition: typeof currentPosition;
  isMonitoring: typeof isMonitoring;
  error: typeof error;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  loadReminders: () => Promise<void>;
}

const locationReminders = ref<LocationReminder[]>([]);
const currentPosition = ref<{ latitude: number; longitude: number } | null>(null);
const isMonitoring = ref(false);
const error = ref<string | null>(null);
const geofenceStates = ref<Map<string, GeofenceState>>(new Map());

let watchId: number | null = null;

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isInsideGeofence(
  reminder: LocationReminder,
  lat: number,
  lon: number,
): boolean {
  const dist = haversineDistance(lat, lon, reminder.latitude, reminder.longitude);
  return dist <= reminder.radius;
}

function checkGeofences(lat: number, lon: number) {
  for (const reminder of locationReminders.value) {
    if (!reminder.enabled) continue;

    const inside = isInsideGeofence(reminder, lat, lon);
    const prev = geofenceStates.value.get(reminder.id);

    if (!prev) {
      geofenceStates.value.set(reminder.id, { inside, lastCheck: Date.now() });
      continue;
    }

    if (!prev.inside && inside && reminder.reminderType === "arrival") {
      triggerReminder(reminder, "进入", lat, lon);
    }

    if (prev.inside && !inside && reminder.reminderType === "departure") {
      triggerReminder(reminder, "离开", lat, lon);
    }

    geofenceStates.value.set(reminder.id, { inside, lastCheck: Date.now() });
  }
}

function triggerReminder(
  reminder: LocationReminder,
  _type: "进入" | "离开",
  _lat: number,
  _lon: number,
) {
  notify(
    `位置提醒：${reminder.locationName}`,
    `任务提醒：${_type} ${reminder.locationName} 范围（${reminder.radius}米）`,
  );
}

async function loadReminders() {
  const reminders = await fetchLocationReminders();
  if (reminders) {
    locationReminders.value = reminders;
  }
}

function onPositionUpdate(pos: GeolocationPosition) {
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  currentPosition.value = { latitude: lat, longitude: lon };
  checkGeofences(lat, lon);
}

function onPositionError(err: GeolocationPositionError) {
  error.value = err.message;
}

function startMonitoring() {
  if (isMonitoring.value) return;
  if (!navigator.geolocation) {
    error.value = "浏览器不支持地理位置";
    return;
  }

  isMonitoring.value = true;
  error.value = null;

  void loadReminders();

  watchId = navigator.geolocation.watchPosition(
    onPositionUpdate,
    onPositionError,
    {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 10000,
    },
  );
}

function stopMonitoring() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  isMonitoring.value = false;
}

// Singleton instance
let instance: GeofenceInstance | null = null;

export function useGeofence(): GeofenceInstance {
  if (!instance) {
    instance = {
      locationReminders,
      currentPosition,
      isMonitoring,
      error,
      startMonitoring,
      stopMonitoring,
      loadReminders,
    };
  }
  return instance;
}
