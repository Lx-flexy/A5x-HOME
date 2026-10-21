import {onValueUpdated} from 'firebase-functions/v2/database';
import * as admin from 'firebase-admin';

// Send notifications when output changes
export const onOutputChange = onValueUpdated(
  '/devices/{deviceId}/outputs/{outputId}',
  async (event) => {
    const deviceId = event.params.deviceId;
    const outputId = event.params.outputId;
    
    try {
      const beforeState = event.data.before.val();
      const afterState = event.data.after.val();
      
      if (beforeState === afterState) return;
      
      const deviceDoc = await admin.firestore().doc(`devices/${deviceId}`).get();
      if (!deviceDoc.exists) return;
      
      const deviceData = deviceDoc.data();
      if (!deviceData) return;
      
      const deviceName = deviceData.name || 'Unknown Device';
      const outputs = deviceData.outputs || [];
      const outputInfo = outputs.find((o: {id: string; name?: string}) => o.id === outputId);
      const outputName = outputInfo?.name || `Output ${outputId}`;
      
      const members: string[] = [deviceData.ownerId];
      if (deviceData.sharedWith && Array.isArray(deviceData.sharedWith)) {
        members.push(...deviceData.sharedWith);
      }
      
      const metadata = await admin.database().ref(`/devices/${deviceId}/metadata`).once('value');
      const performedBy = metadata.val()?.lastActionBy || 'Someone';
      
      const tokens: string[] = [];
      for (const memberId of members) {
        const tokensSnapshot = await admin.firestore().collection(`users/${memberId}/fcmTokens`).get();
        tokensSnapshot.docs.forEach(doc => {
          const tokenData = doc.data();
          if (tokenData.token && !tokenData.deletedAt) {
            tokens.push(tokenData.token);
          }
        });
      }
      
      if (tokens.length === 0) return;
      
      const stateText = afterState ? 'ON' : 'OFF';
      const emoji = afterState ? '🟢' : '🔴';
      
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `${emoji} ${deviceName}`,
          body: `${outputName} turned ${stateText} by ${performedBy}`,
        },
        data: {
          deviceId,
          outputId,
          action: 'output_changed',
        },
      });
    } catch (error) {
      console.error('Error sending output notification:', error);
    }
  }
);

// Send notifications when device status changes
export const onDeviceStatusChange = onValueUpdated(
  '/devices/{deviceId}/online',
  async (event) => {
    const deviceId = event.params.deviceId;
    
    try {
      const online = event.data.after.val();
      
      const deviceDoc = await admin.firestore().doc(`devices/${deviceId}`).get();
      if (!deviceDoc.exists) return;
      
      const deviceData = deviceDoc.data();
      if (!deviceData) return;
      
      const deviceName = deviceData.name || 'Unknown Device';
      
      const members: string[] = [deviceData.ownerId];
      if (deviceData.sharedWith && Array.isArray(deviceData.sharedWith)) {
        members.push(...deviceData.sharedWith);
      }
      
      const tokens: string[] = [];
      for (const memberId of members) {
        const tokensSnapshot = await admin.firestore().collection(`users/${memberId}/fcmTokens`).get();
        tokensSnapshot.docs.forEach(doc => {
          const tokenData = doc.data();
          if (tokenData.token && !tokenData.deletedAt) {
            tokens.push(tokenData.token);
          }
        });
      }
      
      if (tokens.length === 0) return;
      
      const emoji = online ? '🟢' : '🔴';
      const status = online ? 'Online' : 'Offline';
      
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `${emoji} Device ${status}`,
          body: `${deviceName} is now ${status.toLowerCase()}`,
        },
        data: {
          deviceId,
          action: 'status_change',
        },
      });
    } catch (error) {
      console.error('Error sending status notification:', error);
    }
  }
);
