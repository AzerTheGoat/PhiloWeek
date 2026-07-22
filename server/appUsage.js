function summarizeAppUsage(history, today) {
  const rows = Array.isArray(history) ? history : []
  const totalSeconds = rows.reduce((sum, row) => sum + secondsOf(row), 0)
  const todaySeconds = rows.find(row => row.entry_date === today)?.duration_seconds || 0
  const weekStart = startOfIsoWeek(today)
  const weekSeconds = rows
    .filter(row => row.entry_date >= weekStart && row.entry_date <= today)
    .reduce((sum, row) => sum + secondsOf(row), 0)
  const monthKey = today.slice(0, 7)
  const monthRows = rows.filter(row => String(row.entry_date || '').slice(0, 7) === monthKey)
  const monthSeconds = monthRows.reduce((sum, row) => sum + secondsOf(row), 0)
  const elapsedMonthDays = Math.max(1, Number(today.slice(8, 10)) || 1)
  const firstDay = rows.length > 0 ? rows[rows.length - 1].entry_date : today
  const elapsedWeeks = Math.max(1, Math.ceil((daysBetween(firstDay, today) + 1) / 7))

  const monthly = new Map()
  for (const row of rows) {
    const entryMonth = String(row.entry_date || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(entryMonth)) continue
    const current = monthly.get(entryMonth) || { entry_month: entryMonth, duration_seconds: 0, active_days: 0 }
    current.duration_seconds += secondsOf(row)
    current.active_days += 1
    monthly.set(entryMonth, current)
  }

  return {
    today_seconds: Number(todaySeconds),
    week_seconds: weekSeconds,
    month_seconds: monthSeconds,
    average_daily_month_seconds: Math.round(monthSeconds / elapsedMonthDays),
    active_days_month: monthRows.length,
    average_weekly_seconds: Math.round(totalSeconds / elapsedWeeks),
    total_seconds: totalSeconds,
    monthly_history: [...monthly.values()].sort((a, b) => b.entry_month.localeCompare(a.entry_month)),
  }
}

function secondsOf(row) {
  const seconds = Number(row?.duration_seconds || 0)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0
}

function parseDay(day) {
  return new Date(`${day}T00:00:00.000Z`)
}

function startOfIsoWeek(day) {
  const date = parseDay(day)
  const offset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}

function daysBetween(from, to) {
  return Math.max(0, Math.floor((parseDay(to) - parseDay(from)) / 86400000))
}

module.exports = { summarizeAppUsage, startOfIsoWeek, daysBetween }
