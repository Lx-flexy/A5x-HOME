import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Send notifications to all members when device output changes
export const onOutputChange = functions.database
  .ref('/devices/{deviceId}/outputs/{outputId}')
  .onUpdate(async (change, context) => {
    const { deviceId, outputId } = context.params;
    
    try {
      const beforeState = change.before.val();
      const afterState = change.after.val();
      
      // Skip if state hasn't actually changed
      if (beforeState === afterState) return null;
      
      // Get device info from Firestore
      const deviceDoc = await admin.firestore()
        .doc(`devices/${deviceId}`)
        .get();
      
      if (!deviceDoc.exists) return null;
      
      const deviceData = deviceDoc.data();
      const deviceName = deviceData?.name || 'Unknown Device';
      const outputs = deviceData?.outputs || [];
      const outputInfo = outputs.find((o: any) => o.id === outputId);
      const outputName = outputInfo?.name || `Output ${outputId}`;
      
      // Get all members (owner + shared members)
      const members: string[] = [deviceData.ownerId];
      if (deviceData.sharedWith && Array.isArray(deviceData.sharedWith)) {
        members.push(...deviceData.sharedWith);
      }
      
      // Get who performed the action (from metadata if available)
      const metadata = await admin.database()
        .ref(`/devices/${deviceId}/metadata`)
        .once('value');
      
      const performedBy = metadata.val()?.lastActionBy || 'Someone';
      
      // Get FCM tokens for all members
      const tokens: string[] = [];
      
      for (const memberId of members) {
        const tokensSnapshot = await admin.firestore()
          .collection(`users/${memberId}/fcmTokens`)
          .get();
        
        tokensSnapshot.docs.forEach(doc => {
          const tokenData = doc.data();
          if (tokenData.token && !tokenData.deletedAt) {
            tokens.push(tokenData.token);
          }
        });
      }
      
      if (tokens.length === 0) {
        console.log('No FCM tokens found for device members');
        return null;
      }
      
      // Determine notification message
      const stateText = afterState ? 'ON' : 'OFF';
      const emoji = afterState ? '🟢' : '🔴';
      
      // Send notification to all members
      const message = {
        notification: {
          title: `${emoji} ${deviceName}`,
          body: `${outputName} turned ${stateText} by ${performedBy}`,
        },
        data: {
          deviceId,
          outputId,
          action: 'output_changed',
          state: String(afterState),
          performedBy,
          click_action: `/devices/${deviceId}`,
        },
      };
      
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        ...message,
      });
      
      console.log(
        `Sent ${response.successCount} notifications, ` +
        `${response.failureCount} failed`
      );
      
      return null;
    } catch (error) {
      console.error('Error sending device notifications:', error);
      return null;
    }
  });

// Send notifications when device goes online/offline
export const onDeviceStatusChange = functions.database
  .ref('/devices/{deviceId}/online')
  .onUpdate(async (change, context) => {
    const { deviceId } = context.params;
    
    try {
      const online = change.after.val();
      
      // Get device info
      const deviceDoc = await admin.firestore()
        .doc(`devices/${deviceId}`)
        .get();
      
      if (!deviceDoc.exists) return null;
      
      const deviceData = deviceDoc.data();
      const deviceName = deviceData?.name || 'Unknown Device';
      
      // Get all members
      const members: string[] = [deviceData.ownerId];
      if (deviceData.sharedWith && Array.isArray(deviceData.sharedWith)) {
        members.push(...deviceData.sharedWith);
      }
      
      // Get FCM tokens
      const tokens: string[] = [];
      
      for (const memberId of members) {
        // Check user's notification preferences
        const userDoc = await admin.firestore()
          .doc(`users/${memberId}`)
          .get();
        
        const userData = userDoc.data();
        const notifyOnline = userData?.notifications?.deviceOnline ?? true;
        const notifyOffline = userData?.notifications?.deviceOffline ?? true;
        
        // Skip if user disabled this notification type
        if ((online && !notifyOnline) || (!online && !notifyOffline)) {
          continue;
        }
        
        const tokensSnapshot = await admin.firestore()
          .collection(`users/${memberId}/fcmTokens`)
          .get();
        
        tokensSnapshot.docs.forEach(doc => {
          const tokenData = doc.data();
          if (tokenData.token && !tokenData.deletedAt) {
            tokens.push(tokenData.token);
          }
        });
      }
      
      if (tokens.length === 0) return null;
      
      // Send notification
      const emoji = online ? '🟢' : '🔴';
      const status = online ? 'Online' : 'Offline';
      
      const message = {
        notification: {
          title: `${emoji} Device ${status}`,
          body: `${deviceName} is now ${status.toLowerCase()}`,
        },
        data: {
          deviceId,
          action: 'status_change',
          status: String(online),
          click_action: `/devices/${deviceId}`,
        },
      };
      
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        ...message,
      });
      
      console.log(
        `Sent ${response.successCount} status notifications, ` +
        `${response.failureCount} failed`
      );
      
      return null;
    } catch (error) {
      console.error('Error sending status notifications:', error);
      return null;
    }
  });

// Send notifications when OLED text changes
export const onOledChange = functions.database
  .ref('/devices/{deviceId}/oled')
  .onUpdate(async (change, context) => {
    const { deviceId } = context.params;
    
    try {
      const afterOled = change.after.val();
      
      // Get device info
      const deviceDoc = await admin.firestore()
        .doc(`devices/${deviceId}`)
        .get();
      
      if (!deviceDoc.exists) return null;
      
      const deviceData = deviceDoc.data();
      const deviceName = deviceData?.name || 'Unknown Device';
      
      // Get all members
      const members: string[] = [deviceData.ownerId];
      if (deviceData.sharedWith && Array.isArray(deviceData.sharedWith)) {
        members.push(...deviceData.sharedWith);
      }
      
      // Get FCM tokens
      const tokens: string[] = [];
      
      for (const memberId of members) {
        const tokensSnapshot = await admin.firestore()
          .collection(`users/${memberId}/fcmTokens`)
          .get();
        
        tokensSnapshot.docs.forEach(doc => {
          const tokenData = doc.data();
          if (tokenData.token && !tokenData.deletedAt) {
            tokens.push(tokenData.token);
          }
        });
      }
      
      if (tokens.length === 0) return null;
      
      // Get who performed the action
      const metadata = await admin.database()
        .ref(`/devices/${deviceId}/metadata`)
        .once('value');
      
      const performedBy = metadata.val()?.lastActionBy || 'Someone';
      
      // Send notification
      const message = {
        notification: {
          title: `📺 ${deviceName}`,
          body: `OLED updated by ${performedBy}`,
        },
        data: {
          deviceId,
          action: 'oled_changed',
          text: afterOled?.text || '',
          performedBy,
          click_action: `/devices/${deviceId}`,
        },
      };
      
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        ...message,
      });
      
      console.log(
        `Sent ${response.successCount} OLED notifications, ` +
        `${response.failureCount} failed`
      );
      
      return null;
    } catch (error) {
      console.error('Error sending OLED notifications:', error);
      return null;
    }
  });

// Send notifications when buzzer is triggered
export const onBuzzerChange = functions.database
  .ref('/devices/{deviceId}/buzzer')
  .onUpdate(async (change, context) => {
    const { deviceId } = context.params;
    
    try {
      const afterBuzzer = change.after.val();
      
      // Only notify on buzzer activation (not deactivation)
      if (!afterBuzzer || afterBuzzer === 'off') return null;
      
      // Get device info
      const deviceDoc = await admin.firestore()
        .doc(`devices/${deviceId}`)
        .get();
      
      if (!deviceDoc.exists) return null;
      
      const deviceData = deviceDoc.data();
      const deviceName = deviceData?.name || 'Unknown Device';
      
      // Get all members
      const members: string[] = [deviceData.ownerId];
      if (deviceData.sharedWith && Array.isArray(deviceData.sharedWith)) {
        members.push(...deviceData.sharedWith);
      }
      
      // Get FCM tokens
      const tokens: string[] = [];
      
      for (const memberId of members) {
        const tokensSnapshot = await admin.firestore()
          .collection(`users/${memberId}/fcmTokens`)
          .get();
        
        tokensSnapshot.docs.forEach(doc => {
          const tokenData = doc.data();
          if (tokenData.token && !tokenData.deletedAt) {
            tokens.push(tokenData.token);
          }
        });
      }
      
      if (tokens.length === 0) return null;
      
      // Get who performed the action
      const metadata = await admin.database()
        .ref(`/devices/${deviceId}/metadata`)
        .once('value');
      
      const performedBy = metadata.val()?.lastActionBy || 'Someone';
      
      // Determine buzzer type
      let buzzerText = 'Buzzer activated';
      if (afterBuzzer === 'single') buzzerText = 'Single beep';
      if (afterBuzzer === 'double') buzzerText = 'Double beep';
      if (afterBuzzer === 'continuous') buzzerText = 'Continuous beep';
      
      // Send notification
      const message = {
        notification: {
          title: `🔔 ${deviceName}`,
          body: `${buzzerText} by ${performedBy}`,
        },
        data: {
          deviceId,
          action: 'buzzer_changed',
          type: afterBuzzer,
          performedBy,
          click_action: `/devices/${deviceId}`,
        },
      };
      
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        ...message,
      });
      
      console.log(
        `Sent ${response.successCount} buzzer notifications, ` +
        `${response.failureCount} failed`
      );
      
      return null;
    } catch (error) {
      console.error('Error sending buzzer notifications:', error);
      return null;
    }
  });
