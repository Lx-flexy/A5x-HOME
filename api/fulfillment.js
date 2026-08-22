/**
 * Google Home Smart Home Fulfillment Endpoint
 * 
 * Implements Google Assistant Smart Home intents:
 * - SYNC: Discover user's A5X devices
 * - QUERY: Get current device states  
 * - EXECUTE: Control devices (ON/OFF commands)
 * - DISCONNECT: Handle account unlinking
 */

import { validateAccessToken } from './lib/oauth.js';
import { 
  getUserDevices, 
  getDeviceState, 
  updateDeviceState, 
  verifyDeviceAccess 
} from './lib/firebaseAdmin.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract and validate authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        errorCode: 'authFailure',
        debugString: 'Missing or invalid authorization header'
      });
    }

    const accessToken = authHeader.slice(7);
    let uid;  // Firebase UID, not A5X userId
    
    try {
      const tokenData = validateAccessToken(accessToken);
      uid = tokenData.uid;
    } catch (error) {
      console.error('[Fulfillment] Token validation failed:', error);
      return res.status(401).json({
        errorCode: 'authFailure', 
        debugString: 'Invalid or expired access token'
      });
    }

    // Parse request body
    const { requestId, inputs } = req.body;
    
    if (!requestId || !inputs || !Array.isArray(inputs)) {
      return res.status(400).json({
        errorCode: 'protocolError',
        debugString: 'Invalid request format'
      });
    }

    // Process each input intent
    const responsePayload = {
      requestId,
      payload: {}
    };

    for (const input of inputs) {
      const { intent, payload } = input;
      
      switch (intent) {
        case 'action.devices.SYNC':
          responsePayload.payload = await handleSync(uid);
          break;
          
        case 'action.devices.QUERY':
          responsePayload.payload = await handleQuery(uid, payload);
          break;
          
        case 'action.devices.EXECUTE':
          responsePayload.payload = await handleExecute(uid, payload);
          break;
          
        case 'action.devices.DISCONNECT':
          responsePayload.payload = await handleDisconnect(uid);
          break;
          
        default:
          console.warn('[Fulfillment] Unknown intent:', intent);
          return res.status(400).json({
            errorCode: 'protocolError',
            debugString: `Unknown intent: ${intent}`
          });
      }
    }

    res.status(200).json(responsePayload);

  } catch (error) {
    console.error('[Fulfillment] Error:', error);
    res.status(500).json({
      errorCode: 'hardError',
      debugString: error.message
    });
  }
}

/**
 * SYNC Intent - Discover and return user's devices
 * @param {string} uid - Firebase Auth UID
 */
async function handleSync(uid) {
  try {
    const devices = await getUserDevices(uid);
    const googleDevices = [];

    for (const device of devices) {
      // Get device metadata for output configuration
      const { getDeviceOutputMetadata } = await import('./lib/deviceMetadata.js');
      const metadata = await getDeviceOutputMetadata(device.deviceId);
      
      // Create Google Home device entries for visible outputs (max 6 per A5X device)
      const outputs = ['light1', 'light2', 'light3', 'fan1', 'fan2', 'custom1'];
      let outputCount = 0;
      
      for (const outputId of outputs) {
        if (outputCount >= 6) break; // Google Home limit
        
        const outputMeta = metadata[outputId];
        if (!outputMeta || !outputMeta.visible) continue;
        
        const deviceType = getGoogleDeviceType(outputId);
        const googleDevice = {
          id: `${device.deviceId}_${outputId}`, // Unique ID combining A5X device + output
          type: deviceType,
          traits: ['action.devices.traits.OnOff'],
          name: {
            name: outputMeta.name || `${device.name} ${outputId}`,
            nicknames: [outputMeta.name || `${device.name} ${outputId}`]
          },
          willReportState: true,
          roomHint: device.room,
          deviceInfo: {
            manufacturer: 'A5X Electronics',
            model: 'A5X-HA',
            hwVersion: device.firmware || 'v1.2.4',
            swVersion: device.firmware || 'v1.2.4'
          },
          customData: {
            deviceId: device.deviceId,
            outputId: outputId,
            ownerId: device.ownerId
          }
        };
        
        googleDevices.push(googleDevice);
        outputCount++;
      }
    }

    console.log(`[Sync] Returning ${googleDevices.length} devices for user UID: ${uid}`);
    
    return {
      agentUserId: uid,  // Use Firebase UID as agentUserId
      devices: googleDevices
    };

  } catch (error) {
    console.error('[Sync] Error:', error);
    throw new Error('Failed to sync devices');
  }
}

/**
 * QUERY Intent - Get current state of devices
 * @param {string} uid - Firebase Auth UID
 */
async function handleQuery(uid, payload) {
  try {
    const { devices } = payload;
    const deviceStates = {};

    for (const device of devices) {
      const { id, customData } = device;
      
      if (!customData || !customData.deviceId || !customData.outputId) {
        deviceStates[id] = { 
          errorCode: 'deviceNotFound',
          debugString: 'Invalid device configuration'
        };
        continue;
      }

      // Verify user has access to this device
      const hasAccess = await verifyDeviceAccess(uid, customData.deviceId);
      if (!hasAccess) {
        deviceStates[id] = {
          errorCode: 'authFailure',
          debugString: 'User does not have access to this device'
        };
        continue;
      }

      try {
        // Get current device state from RTDB
        const state = await getDeviceState(customData.deviceId);
        const isOn = Boolean(state[customData.outputId]);
        
        deviceStates[id] = {
          on: isOn,
          online: true
        };
        
      } catch (error) {
        console.error(`[Query] Failed to get state for device ${id}:`, error);
        deviceStates[id] = {
          errorCode: 'deviceOffline',
          debugString: 'Failed to get device state'
        };
      }
    }

    return { devices: deviceStates };

  } catch (error) {
    console.error('[Query] Error:', error);
    throw new Error('Failed to query devices');
  }
}

/**
 * EXECUTE Intent - Control devices
 * @param {string} uid - Firebase Auth UID
 */
async function handleExecute(uid, payload) {
  try {
    const { commands } = payload;
    const commandResults = [];

    for (const command of commands) {
      const { devices, execution } = command;
      
      for (const device of devices) {
        const { id, customData } = device;
        
        if (!customData || !customData.deviceId || !customData.outputId) {
          commandResults.push({
            ids: [id],
            status: 'ERROR',
            errorCode: 'deviceNotFound',
            debugString: 'Invalid device configuration'
          });
          continue;
        }

        // Verify user has access to this device
        const hasAccess = await verifyDeviceAccess(uid, customData.deviceId);
        if (!hasAccess) {
          commandResults.push({
            ids: [id],
            status: 'ERROR',
            errorCode: 'authFailure',
            debugString: 'User does not have access to this device'
          });
          continue;
        }

        // Process each execution command
        for (const exec of execution) {
          const { command: execCommand, params } = exec;
          
          if (execCommand === 'action.devices.commands.OnOff') {
            try {
              const { on } = params;
              
              // Update device state in RTDB
              await updateDeviceState(customData.deviceId, {
                [customData.outputId]: Boolean(on)
              });
              
              commandResults.push({
                ids: [id],
                status: 'SUCCESS',
                states: {
                  on: Boolean(on),
                  online: true
                }
              });
              
              console.log(`[Execute] ${customData.deviceId}/${customData.outputId} set to ${on}`);
              
            } catch (error) {
              console.error(`[Execute] Failed to control device ${id}:`, error);
              commandResults.push({
                ids: [id],
                status: 'ERROR',
                errorCode: 'deviceOffline',
                debugString: 'Failed to control device'
              });
            }
          } else {
            commandResults.push({
              ids: [id],
              status: 'ERROR', 
              errorCode: 'functionNotSupported',
              debugString: `Command ${execCommand} not supported`
            });
          }
        }
      }
    }

    return { commands: commandResults };

  } catch (error) {
    console.error('[Execute] Error:', error);
    throw new Error('Failed to execute commands');
  }
}

/**
 * DISCONNECT Intent - Handle account unlinking
 * @param {string} uid - Firebase Auth UID
 */
async function handleDisconnect(uid) {
  try {
    // In production, you might want to:
    // 1. Revoke all tokens for this user
    // 2. Log the disconnection event
    // 3. Clean up any user-specific data
    
    console.log(`[Disconnect] User UID ${uid} disconnected Google Home`);
    
    return {}; // Empty response for successful disconnection
    
  } catch (error) {
    console.error('[Disconnect] Error:', error);
    throw new Error('Failed to disconnect');
  }
}

/**
 * Map A5X output types to Google device types
 */
function getGoogleDeviceType(outputId) {
  const typeMap = {
    light1: 'action.devices.types.LIGHT',
    light2: 'action.devices.types.LIGHT', 
    light3: 'action.devices.types.LIGHT',
    fan1: 'action.devices.types.FAN',
    fan2: 'action.devices.types.FAN',
    custom1: 'action.devices.types.SWITCH'
  };
  
  return typeMap[outputId] || 'action.devices.types.SWITCH';
}