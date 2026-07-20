import { useEffect } from 'react'
import * as api from '../api'

const TICK_MS = 10000
const FLUSH_AFTER_SECONDS = 30
const LEASE_MS = 15000

export default function useAppUsageTracker(userId) {
  useEffect(() => {
    if (!userId) return undefined

    const tabId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
    const leaseKey = `pw-app-usage-leader:${userId}`
    const pending = new Map()
    let lastTick = Date.now()
    let active = document.visibilityState === 'visible' && document.hasFocus()
    let leader = false
    let flushing = false

    const readLease = () => {
      try { return JSON.parse(localStorage.getItem(leaseKey) || 'null') }
      catch (_) { return null }
    }

    const claimLeadership = () => {
      if (!active) return false
      const now = Date.now()
      const lease = readLease()
      if (!lease || lease.owner === tabId || now - Number(lease.at || 0) > LEASE_MS) {
        localStorage.setItem(leaseKey, JSON.stringify({ owner: tabId, at: now }))
      }
      leader = readLease()?.owner === tabId
      return leader
    }

    const releaseLeadership = () => {
      if (readLease()?.owner === tabId) localStorage.removeItem(leaseKey)
      leader = false
    }

    const addPending = (day, seconds) => {
      pending.set(day, (pending.get(day) || 0) + seconds)
    }

    const takeEntries = () => {
      const entries = []
      for (const [day, total] of pending) {
        let remaining = total
        while (remaining > 0) {
          const seconds = Math.min(300, remaining)
          entries.push({ day, seconds })
          remaining -= seconds
        }
      }
      pending.clear()
      return entries
    }

    const flush = async (useBeacon = false) => {
      if (flushing || pending.size === 0) return
      const entries = takeEntries()
      if (useBeacon && navigator.sendBeacon) {
        const body = new Blob([JSON.stringify({ entries })], { type: 'application/json' })
        if (navigator.sendBeacon('/api/timer/app-usage', body)) return
      }

      flushing = true
      try {
        await api.trackAppUsage(entries)
      } catch (_) {
        for (const entry of entries) addPending(entry.day, entry.seconds)
      } finally {
        flushing = false
      }
    }

    const tick = () => {
      const now = Date.now()
      const elapsed = Math.min(15, Math.max(0, Math.round((now - lastTick) / 1000)))
      if (active && leader && elapsed > 0) addPending(getLogicalDay(new Date(now)), elapsed)
      lastTick = now

      if (active) claimLeadership()
      if ([...pending.values()].reduce((sum, value) => sum + value, 0) >= FLUSH_AFTER_SECONDS) flush()
    }

    const syncActivity = () => {
      tick()
      active = document.visibilityState === 'visible' && document.hasFocus()
      if (active) claimLeadership()
      else releaseLeadership()
    }

    const handleStorage = event => {
      if (event.key === leaseKey && readLease()?.owner !== tabId) leader = false
    }
    const handlePageHide = () => {
      tick()
      flush(true)
      releaseLeadership()
    }

    claimLeadership()
    const interval = window.setInterval(tick, TICK_MS)
    window.addEventListener('focus', syncActivity)
    window.addEventListener('blur', syncActivity)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', syncActivity)

    return () => {
      tick()
      flush(true)
      releaseLeadership()
      window.clearInterval(interval)
      window.removeEventListener('focus', syncActivity)
      window.removeEventListener('blur', syncActivity)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('visibilitychange', syncActivity)
    }
  }, [userId])
}

export function getLogicalDay(date = new Date()) {
  const shifted = new Date(date)
  shifted.setHours(shifted.getHours() - 3)
  const year = shifted.getFullYear()
  const month = String(shifted.getMonth() + 1).padStart(2, '0')
  const day = String(shifted.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
