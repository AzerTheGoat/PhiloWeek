const test = require('node:test')
const assert = require('node:assert/strict')

const { summarizeAppUsage } = require('../appUsage')

test('le tableau de bord agrege les temps par jour, semaine et mois', () => {
  const summary = summarizeAppUsage([
    { entry_date: '2026-07-22', duration_seconds: 1800 },
    { entry_date: '2026-07-21', duration_seconds: 3600 },
    { entry_date: '2026-07-14', duration_seconds: 900 },
    { entry_date: '2026-06-30', duration_seconds: 7200 },
  ], '2026-07-22')

  assert.equal(summary.today_seconds, 1800)
  assert.equal(summary.week_seconds, 5400)
  assert.equal(summary.month_seconds, 6300)
  assert.equal(summary.average_daily_month_seconds, 286)
  assert.equal(summary.active_days_month, 3)
  assert.equal(summary.total_seconds, 13500)
  assert.deepEqual(summary.monthly_history, [
    { entry_month: '2026-07', duration_seconds: 6300, active_days: 3 },
    { entry_month: '2026-06', duration_seconds: 7200, active_days: 1 },
  ])
})
