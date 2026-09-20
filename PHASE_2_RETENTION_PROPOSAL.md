# Phase 2: Retention Policy Proposal

## Requirement
Auto-expire `runtimeEvents` entries older than 7 days to prevent unbounded storage growth and cost.

---

## Proposed Solution: Firestore TTL Policy ✅

### Implementation
Use Firebase's native **Time-To-Live (TTL)** field-based expiration:

1. Add a `ttlExpireAt` field to each `runtimeEvent` document:
   ```typescript
   {
     channel: "light2",
     event: "ON",
     timestamp: serverTimestamp(),
     accumulatorValueAfter: 12.5,
     energyValueAfter: 0.5,
     ttlExpireAt: <timestamp 7 days from now>  // ← TTL field
   }
   ```

2. Configure Firestore TTL policy in Firebase Console:
   - Navigate to: **Firestore → Settings → Time-to-live policies**
   - Collection: `devices/{deviceId}/runtimeEvents`
   - TTL field: `ttlExpireAt`
   - Action: Auto-delete documents when `ttlExpireAt` < current time

### How It Works
- Firebase runs a background process every 24 hours
- Scans for documents where `ttlExpireAt` has passed
- Automatically deletes expired documents (no Cloud Function needed)
- Deletion happens gradually over ~72 hours (not instant, but guaranteed)

### Code Change Required
Update `logRuntimeEvent()` function:

```typescript
async function logRuntimeEvent(
  deviceId: string,
  channel: string,
  event: 'ON' | 'OFF',
  accumulatorValue: number,
  energyValue: number
): Promise<void> {
  try {
    const now = new Date();
    const ttlExpireAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days
    
    const eventData: Omit<RuntimeEvent, 'id'> = {
      channel,
      event,
      timestamp: serverTimestamp(),
      accumulatorValueAfter: accumulatorValue,
      energyValueAfter: energyValue,
      ttlExpireAt: Timestamp.fromDate(ttlExpireAt),  // ← NEW FIELD
    };
    
    await addDoc(collection(db, `devices/${deviceId}/runtimeEvents`), eventData);
  } catch (err) {
    console.warn(`[logRuntimeEvent] Failed for ${deviceId}/${channel}:`, err);
  }
}
```

---

## Alternative: Scheduled Cloud Function (REJECTED)

### Why NOT Cloud Function Cleanup?

#### Approach
Deploy a scheduled Cloud Function that runs daily:
```typescript
export const cleanupOldRuntimeEvents = onSchedule('every 24 hours', async () => {
  const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const devicesSnap = await admin.firestore().collection('devices').get();
  
  for (const deviceDoc of devicesSnap.docs) {
    const eventsQuery = deviceDoc.ref.collection('runtimeEvents')
      .where('timestamp', '<', cutoff);
    const oldEvents = await eventsQuery.get();
    
    const batch = admin.firestore().batch();
    oldEvents.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
});
```

#### Problems
1. **Cost:** Cloud Function invocation every 24 hours (minimum ~$0.40/month for Blaze plan)
2. **Query cost:** Scanning ALL devices and ALL old events daily = unbounded Firestore read cost
3. **Complexity:** Requires:
   - Deploying new Cloud Function
   - Managing batch delete limits (500 docs per batch)
   - Error handling for partial failures
   - Monitoring function execution
4. **Maintenance:** Code to maintain vs. zero-maintenance TTL policy
5. **Latency:** Batch deletes can timeout for large datasets, need pagination

---

## Comparison Table

| Feature | TTL Policy | Scheduled Function |
|---------|-----------|-------------------|
| **Setup** | One-time console config + 1 field | Deploy function + manage code |
| **Cost** | $0 (included in Firestore) | Function invocation + read costs |
| **Reliability** | Native Firebase guarantee | Custom code, can fail |
| **Maintenance** | Zero | Ongoing (updates, monitoring) |
| **Deletion speed** | ~72h gradual | Instant (but costs more) |
| **Code complexity** | +1 field in write | +50 lines function code |

---

## Justification for TTL Policy

### Cost
- **TTL:** Free, no additional charges
- **Function:** Minimum $0.40/month + unbounded read costs as device count scales

### Reliability
- **TTL:** Backed by Firebase SLA, cannot fail
- **Function:** Can timeout, crash, or silently fail if not monitored

### Simplicity
- **TTL:** Add 1 field to write, configure once in console
- **Function:** Deploy, test, monitor, handle edge cases

### Scalability
- **TTL:** Scales automatically with Firebase infrastructure
- **Function:** Must handle pagination, batch limits, timeout management as data grows

### Maintenance Burden
- **TTL:** Zero maintenance after initial setup
- **Function:** Requires ongoing monitoring, updates for API changes, debugging if failures occur

---

## Recommended Implementation Steps

1. **Update `RuntimeEvent` interface:**
   ```typescript
   export interface RuntimeEvent {
     id?: string;
     channel: string;
     event: 'ON' | 'OFF';
     timestamp: unknown;
     accumulatorValueAfter: number;
     energyValueAfter: number;
     ttlExpireAt: unknown;  // ← Add TTL field
   }
   ```

2. **Update `logRuntimeEvent()` function** (add TTL field calculation)

3. **Configure TTL policy in Firebase Console** (one-time setup)

4. **Test:** Create test event, verify TTL field set correctly

5. **Monitor:** Check Firebase Console → Firestore → Storage size after 7-10 days to confirm deletion working

---

## Decision: USE TTL POLICY ✅

**Reason:** Zero cost, zero maintenance, native Firebase feature, perfectly fits the use case.

**Only use Scheduled Function if:** Immediate deletion required (within minutes) vs. gradual 72h cleanup. For debugging/audit trail use case, 72h delay is acceptable.
