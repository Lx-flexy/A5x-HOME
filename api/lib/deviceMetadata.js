/**
 * Device metadata utilities for Google Home integration
 * 
 * Handles device output configuration and metadata retrieval from RTDB
 */

import { getAdminDatabase } from './firebaseAdmin.js';

/**
 * Get device output metadata from RTDB
 */
export async function getDeviceOutputMetadata(deviceId) {
  try {
    const database = getAdminDatabase();
    const snapshot = await database.ref(`devices/${deviceId}/metadata/outputs`).get();
    
    const metadata = snapshot.exists() ? snapshot.val() : {};
    const merged = { ...getDefaultOutputMetadata(), ...metadata };
    
    return merged;
  } catch (error) {
    console.warn('[getDeviceOutputMetadata] Failed:', error);
    return getDefaultOutputMetadata();
  }
}

/**
 * Default output metadata configuration
 */
function getDefaultOutputMetadata() {
  return {
    light1: { name: 'Light 1', icon: 'lightbulb', color: '#d97706', visible: true },
    light2: { name: 'Light 2', icon: 'lightbulb', color: '#d97706', visible: true },
    light3: { name: 'Light 3', icon: 'lightbulb', color: '#d97706', visible: true },
    fan1: { name: 'Fan 1', icon: 'wind', color: '#2563eb', visible: false },
    fan2: { name: 'Fan 2', icon: 'wind', color: '#2563eb', visible: false },
    custom1: { name: 'Custom Device', icon: 'zap', color: '#7c3aed', visible: false }
  };
}