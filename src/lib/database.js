import { openDB } from 'idb'

const DB_NAME = 'guadalupe-sentinel'
const DB_VERSION = 1

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('readings', { keyPath: ['gaugeId', 'time'] })
        store.createIndex('gaugeId', 'gaugeId')
      }
    })
  }
  return dbPromise
}

// Upsert a single reading. Idempotent — same (gaugeId, time) overwrites itself.
export async function saveReading(gaugeId, { height, flow, time }) {
  try {
    const db = await getDB()
    await db.put('readings', {
      gaugeId,
      time,
      height: height ?? null,
      flow: flow ?? null
    })
  } catch (e) {
    // DB is non-critical; swallow errors so the app keeps working
    console.warn('DB save failed:', e)
  }
}

// Return all stored readings for a gauge within the last `days` days.
export async function getReadings(gaugeId, days = 7) {
  try {
    const db = await getDB()
    const all = await db.getAllFromIndex('readings', 'gaugeId', gaugeId)
    const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString()
    return all
      .filter(r => r.time >= cutoff)
      .sort((a, b) => (a.time < b.time ? -1 : 1))
  } catch (e) {
    console.warn('DB read failed:', e)
    return []
  }
}

// Delete readings older than maxDays. Call once on app start.
export async function pruneReadings(maxDays = 30) {
  try {
    const db = await getDB()
    const cutoff = new Date(Date.now() - maxDays * 86400 * 1000).toISOString()
    const tx = db.transaction('readings', 'readwrite')
    let cursor = await tx.store.openCursor()
    while (cursor) {
      if (cursor.value.time < cutoff) await cursor.delete()
      cursor = await cursor.continue()
    }
    await tx.done
  } catch (e) {
    console.warn('DB prune failed:', e)
  }
}
