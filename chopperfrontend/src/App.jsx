import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  fetchDashboardData,
  addLogEntry,
  deleteLogEntry,
  addReaction,
  deleteReaction,
  addConfirmedTrigger,
  login,
  logout,
  getToken,
  clearToken,
  isTokenValid
} from './api';

// Date/Time Parsing Helpers supporting both ISO ("YYYY-MM-DDTHH:mm:ss") and Space ("YYYY-MM-DD HH:mm:ss")
const parseDateKey = (dtStr) => {
  if (!dtStr) return '';
  return String(dtStr).trim().split(/[T ]/)[0];
};

const parseTimeStr = (dtStr) => {
  if (!dtStr) return '';
  const parts = String(dtStr).trim().split(/[T ]/);
  return parts[1] ? parts[1].slice(0, 5) : '';
};

// Generates YYYY-MM-DDTHH:mm for targetDateStr (or current time if today)
const getInitialFormDateTime = (targetDateStr) => {
  const now = new Date();
  const currentHHmm = now.toTimeString().slice(0, 5);
  if (targetDateStr) {
    return `${targetDateStr}T${currentHHmm}`;
  }
  return now.toISOString().slice(0, 16);
};

const calculateResolvedAt = (symptomStartStr, minutes) => {
  if (!symptomStartStr) return getInitialFormDateTime();
  const start = new Date(String(symptomStartStr).replace(' ', 'T'));
  if (isNaN(start.getTime())) return getInitialFormDateTime();
  const end = new Date(start.getTime() + (parseInt(minutes || 0, 10)) * 60000);
  const year = end.getFullYear();
  const month = String(end.getMonth() + 1).padStart(2, '0');
  const day = String(end.getDate()).padStart(2, '0');
  const hours = String(end.getHours()).padStart(2, '0');
  const mins = String(end.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}`;
};

const calculateResolvedInMinutes = (symptomStartStr, resolvedAtStr) => {
  if (!symptomStartStr || !resolvedAtStr) return 60;
  const start = new Date(String(symptomStartStr).replace(' ', 'T'));
  const end = new Date(String(resolvedAtStr).replace(' ', 'T'));
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 60;
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diffMs / 60000));
};

export default function App() {
  const [data, setData] = useState({ entries: [], reactions: [], confirmedTriggers: [] });
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' | 'day_detail'

  // Passphrase Auth
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Modals & Edit Tracking
  const [showLogModal, setShowLogModal] = useState(false);
  const [showReactionModal, setShowReactionModal] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editingReactionId, setEditingReactionId] = useState(null);

  // Form states
  const [entryForm, setEntryForm] = useState({
    entryType: 'food',
    itemName: '',
    loggedAt: getInitialFormDateTime(selectedDate),
    notes: ''
  });

  const [reactionForm, setReactionForm] = useState({
    symptomStartTime: getInitialFormDateTime(selectedDate),
    severityLevel: 3,
    symptoms: ['Skin rash', 'Itching'],
    isResolved: false,
    resolution: 'auto',
    resolvedInMinutes: 60,
    resolvedAt: calculateResolvedAt(getInitialFormDateTime(selectedDate), 60),
    notes: ''
  });

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      // ── Step 1: client-side token check (no network) ─────────────────────
      if (!isTokenValid()) {
        // Token is missing or expired locally — clear stale data & show login
        clearToken();
        if (active) { setAuthChecked(true); setLoading(false); }
        return;
      }

      // ── Step 2: token is locally valid — unlock the UI immediately ────────
      if (active) {
        setAuthUser({ first_name: 'Admin', email_id: '' });
        setAuthChecked(true);
      }

      // ── Step 3: fetch dashboard data in the background ────────────────
      try {
        const dashRes = await fetchDashboardData();
        if (!active) return;

        if (dashRes && dashRes.unauthenticated) {
          // Server rejected the token (e.g. secret was rotated) — force re-login
          clearToken();
          setAuthUser(null);
        } else if (dashRes && !dashRes.error) {
          setData(dashRes);
        }
        // On network error we stay authenticated with whatever data we have
      } catch (e) {
        console.warn('Failed to load dashboard data:', e);
      } finally {
        if (active) setLoading(false);
      }
    }

    checkAuth();

    return () => { active = false; };
  }, []);




  const loadData = async () => {
    setLoading(true);
    const res = await fetchDashboardData();
    if (res && !res.unauthenticated && !res.error) {
      setData(res);
    }
    // Note: never override authUser here — auth state is managed solely by checkAuth()
    setLoading(false);
  };

  const handlePassphraseLogin = async (e) => {
    e.preventDefault();
    if (!passphraseInput.trim()) return;
    setLoginLoading(true);
    setLoginError('');
    const result = await login(passphraseInput.trim());
    setLoginLoading(false);
    if (result.error) {
      setLoginError(result.error === 'Invalid passphrase' ? 'Incorrect passphrase. Please try again.' : `Error: ${result.error}`);
      return;
    }
    // Login succeeded — fetch data and mark authenticated
    const dashRes = await fetchDashboardData();
    if (dashRes && !dashRes.unauthenticated && !dashRes.error) {
      setData(dashRes);
      setAuthUser(dashRes.user || { first_name: 'Admin', email_id: '' });
    } else {
      setAuthUser({ first_name: 'Admin', email_id: '' });
    }
    setPassphraseInput('');
  };

  const handleLogout = () => {
    logout();
    setAuthUser(null);
    setData({ entries: [], reactions: [], confirmedTriggers: [] });
  };

  const wrapperRef = useRef(null);
  const todayStr = new Date().toISOString().split('T')[0];

  // Open Log Entry Modal (Create or Pre-fill)
  const openNewLogModal = (overrideDate) => {
    const targetDate = overrideDate || selectedDate;
    if (targetDate > todayStr) {
      alert('Cannot log items for future dates.');
      return;
    }
    setEditingEntryId(null);
    setEntryForm({
      entryType: 'food',
      itemName: '',
      loggedAt: getInitialFormDateTime(targetDate),
      notes: ''
    });
    setShowLogModal(true);
  };

  const openEditLogModal = (entry) => {
    setEditingEntryId(entry.id);
    setEntryForm({
      id: entry.id,
      entryType: entry.entryType || 'food',
      itemName: entry.itemName || '',
      loggedAt: entry.loggedAt ? String(entry.loggedAt).replace(' ', 'T').slice(0, 16) : getInitialFormDateTime(selectedDate),
      notes: entry.notes || ''
    });
    setShowLogModal(true);
  };

  // Open Reaction Modal (Create or Pre-fill)
  const openNewReactionModal = (overrideDate) => {
    const targetDate = overrideDate || selectedDate;
    if (targetDate > todayStr) {
      alert('Cannot log reactions for future dates.');
      return;
    }
    const startTime = getInitialFormDateTime(targetDate);
    setEditingReactionId(null);
    setReactionForm({
      symptomStartTime: startTime,
      severityLevel: 3,
      symptoms: ['Skin rash', 'Itching'],
      isResolved: false,
      resolution: 'auto',
      resolvedInMinutes: 60,
      resolvedAt: calculateResolvedAt(startTime, 60),
      notes: ''
    });
    setShowReactionModal(true);
  };

  const openEditReactionModal = (reaction) => {
    setEditingReactionId(reaction.id);
    const startTime = reaction.symptomStartTime ? String(reaction.symptomStartTime).replace(' ', 'T').slice(0, 16) : getInitialFormDateTime(selectedDate);
    const isRes = reaction.resolution && reaction.resolution !== 'unresolved' && (parseInt(reaction.resolvedInMinutes || 0, 10) > 0 || reaction.resolution === 'antihistamine' || reaction.resolution === 'auto');
    const mins = parseInt(reaction.resolvedInMinutes || 60, 10);
    setReactionForm({
      id: reaction.id,
      symptomStartTime: startTime,
      severityLevel: reaction.severityLevel || 3,
      symptoms: Array.isArray(reaction.symptoms) ? reaction.symptoms : [],
      isResolved: !!isRes,
      resolution: (isRes && reaction.resolution) ? reaction.resolution : 'auto',
      resolvedInMinutes: mins,
      resolvedAt: calculateResolvedAt(startTime, mins),
      notes: reaction.notes || ''
    });
    setShowReactionModal(true);
  };

  const openMarkResolvedModal = (reaction) => {
    setEditingReactionId(reaction.id);
    const startTime = reaction.symptomStartTime ? String(reaction.symptomStartTime).replace(' ', 'T').slice(0, 16) : getInitialFormDateTime(selectedDate);
    const nowTime = getInitialFormDateTime();
    const mins = calculateResolvedInMinutes(startTime, nowTime);
    setReactionForm({
      id: reaction.id,
      symptomStartTime: startTime,
      severityLevel: reaction.severityLevel || 3,
      symptoms: Array.isArray(reaction.symptoms) ? reaction.symptoms : [],
      isResolved: true,
      resolution: reaction.resolution && reaction.resolution !== 'unresolved' ? reaction.resolution : 'auto',
      resolvedInMinutes: mins,
      resolvedAt: nowTime,
      notes: reaction.notes || ''
    });
    setShowReactionModal(true);
  };

  // Helper map: date -> day summary
  const daySummaryMap = useMemo(() => {
    const map = {};

    (data.entries || []).forEach(e => {
      const dateKey = parseDateKey(e.loggedAt);
      if (!dateKey) return;
      if (!map[dateKey]) map[dateKey] = { entries: [], reactions: [], maxSeverity: 0 };
      map[dateKey].entries.push(e);
    });

    (data.reactions || []).forEach(r => {
      const dateKey = parseDateKey(r.symptomStartTime);
      if (!dateKey) return;
      if (!map[dateKey]) map[dateKey] = { entries: [], reactions: [], maxSeverity: 0 };
      map[dateKey].reactions.push(r);
      const sev = parseInt(r.severityLevel || 1, 10);
      if (sev > map[dateKey].maxSeverity) map[dateKey].maxSeverity = sev;
    });

    return map;
  }, [data]);

  // Available years for heatmap selector
  const availableYears = useMemo(() => {
    const currentY = new Date().getFullYear();
    return [currentY, currentY - 1, currentY - 2];
  }, []);

  // Total activity count for selected year
  const yearActivityCount = useMemo(() => {
    let count = 0;
    const yearStr = String(selectedYear);
    (data.entries || []).forEach(e => {
      if (parseDateKey(e.loggedAt).startsWith(yearStr)) count++;
    });
    (data.reactions || []).forEach(r => {
      if (parseDateKey(r.symptomStartTime).startsWith(yearStr)) count++;
    });
    return count;
  }, [data, selectedYear]);

  // GitHub-style 53-week x 7-row matrix for selected year with Month Labels
  const { weeks, monthLabels } = useMemo(() => {
    const year = selectedYear;
    const startDate = new Date(year, 0, 1); // Jan 1
    const endDate = new Date(year, 11, 31); // Dec 31

    // Align to preceding Sunday
    const current = new Date(startDate);
    const startDay = current.getDay(); // 0 (Sun) - 6 (Sat)
    current.setDate(current.getDate() - startDay);

    const weeksList = [];
    let currentWeek = [];
    const labels = [];
    let lastMonth = -1;

    while (current <= endDate || (currentWeek.length > 0 && currentWeek.length < 7)) {
      const dateStr = current.toISOString().split('T')[0];
      const isTargetYear = current.getFullYear() === year;
      const month = current.getMonth();

      if (isTargetYear && month !== lastMonth && current.getDate() <= 7) {
        labels.push({
          colIndex: weeksList.length,
          label: current.toLocaleString('en-US', { month: 'short' })
        });
        lastMonth = month;
      }

      currentWeek.push({
        dateKey: dateStr,
        isTargetYear
      });

      if (currentWeek.length === 7) {
        weeksList.push(currentWeek);
        currentWeek = [];
        if (current > endDate) break;
      }

      current.setDate(current.getDate() + 1);
    }

    return { weeks: weeksList, monthLabels: labels };
  }, [selectedYear]);

  // Auto-scroll heatmap wrapper to today's date / current month on load / year change
  useEffect(() => {
    if (wrapperRef.current) {
      if (selectedYear === new Date().getFullYear()) {
        const targetWeekIdx = weeks.findIndex(w => w.some(d => d.dateKey === todayStr));
        if (targetWeekIdx !== -1) {
          // Each week column is 13px + 3px gap = 16px. Day labels spacer is 28px.
          const colOffset = 28 + (targetWeekIdx * 16);
          const scrollPos = colOffset - (wrapperRef.current.clientWidth / 2) + 16;
          wrapperRef.current.scrollLeft = Math.max(0, scrollPos);
        } else {
          wrapperRef.current.scrollLeft = wrapperRef.current.scrollWidth;
        }
      } else {
        wrapperRef.current.scrollLeft = 0;
      }
    }
  }, [selectedYear, viewMode, authUser, weeks, todayStr]);

  // Co-occurrence Analysis (Flagged Foods)
  const flaggedItems = useMemo(() => {
    const counts = {};

    (data.entries || []).forEach(e => {
      const dateKey = parseDateKey(e.loggedAt);
      if (!dateKey || !e.itemName) return;
      const name = e.itemName.trim();

      if (!counts[name]) counts[name] = { reactionDays: new Set(), totalDays: new Set() };
      counts[name].totalDays.add(dateKey);

      const dayInfo = daySummaryMap[dateKey];
      if (dayInfo && dayInfo.reactions.length > 0) {
        counts[name].reactionDays.add(dateKey);
      }
    });

    const list = Object.keys(counts).map(itemName => ({
      itemName,
      reactionDaysCount: counts[itemName].reactionDays.size,
      totalDaysCount: counts[itemName].totalDays.size,
      ratio: counts[itemName].reactionDays.size / Math.max(1, counts[itemName].totalDays.size)
    }));

    return list
      .filter(item => item.reactionDaysCount > 0)
      .sort((a, b) => b.reactionDaysCount - a.reactionDaysCount || b.ratio - a.ratio);
  }, [data, daySummaryMap]);

  // Unified timeline sorter (combines food entries and reactions by timestamp)
  const getUnifiedTimeline = (dayInfo) => {
    if (!dayInfo) return [];
    const entries = (dayInfo.entries || []).map(e => ({
      ...e,
      timelineType: 'entry',
      timeStr: parseTimeStr(e.loggedAt),
      rawTime: e.loggedAt ? String(e.loggedAt).replace('T', ' ') : ''
    }));
    const reactions = (dayInfo.reactions || []).map(r => ({
      ...r,
      timelineType: 'reaction',
      timeStr: parseTimeStr(r.symptomStartTime),
      rawTime: r.symptomStartTime ? String(r.symptomStartTime).replace('T', ' ') : ''
    }));

    const combined = [...entries, ...reactions];
    combined.sort((a, b) => a.rawTime.localeCompare(b.rawTime));
    return combined;
  };

  // Save Handlers (Create or Update)
  const handleSaveEntry = async (e) => {
    e.preventDefault();
    if (!entryForm.itemName.trim()) return;
    const payload = editingEntryId ? { ...entryForm, id: editingEntryId } : entryForm;
    const res = await addLogEntry(payload);
    if (res && res.error === 'unauthenticated') {
      handleLogout();
      return;
    }
    setShowLogModal(false);
    setEditingEntryId(null);
    loadData();
  };

  const handleSaveReaction = async (e) => {
    e.preventDefault();
    const payload = {
      ...(editingReactionId ? { id: editingReactionId } : {}),
      symptomStartTime: reactionForm.symptomStartTime,
      severityLevel: reactionForm.severityLevel,
      symptoms: reactionForm.symptoms,
      resolution: reactionForm.isResolved ? (reactionForm.resolution || 'auto') : 'unresolved',
      resolvedInMinutes: reactionForm.isResolved ? (parseInt(reactionForm.resolvedInMinutes || 0, 10)) : 0,
      notes: reactionForm.notes || ''
    };
    const res = await addReaction(payload);
    if (res && res.error === 'unauthenticated') {
      handleLogout();
      return;
    }
    setShowReactionModal(false);
    setEditingReactionId(null);
    loadData();
  };

  const handleDeleteItem = async (id, type) => {
    if (!window.confirm('Delete this item?')) return;
    if (type === 'entry') await deleteLogEntry(id);
    if (type === 'reaction') await deleteReaction(id);
    loadData();
  };

  const handleConfirmTrigger = async (itemName) => {
    await addConfirmedTrigger(itemName);
    alert(`Confirmed "${itemName}" as an allergy trigger!`);
    loadData();
  };

  const availableSymptoms = [
    'Skin rash', 'Hives', 'Itching', 'Swelling', 'Redness',
    'Runny nose', 'Watery eyes', 'Shortness of breath', 'Nausea'
  ];

  const toggleSymptom = (sym) => {
    setReactionForm(prev => {
      const exists = prev.symptoms.includes(sym);
      const updated = exists ? prev.symptoms.filter(s => s !== sym) : [...prev.symptoms, sym];
      return { ...prev, symptoms: updated };
    });
  };

  const getDayStatusClass = (dateKey) => {
    const summary = daySummaryMap[dateKey];
    if (!summary) return '';
    if (summary.reactions.length > 0) {
      return summary.maxSeverity >= 3 ? 'status-severe' : 'status-mild';
    }
    if (summary.entries.length > 0) return 'status-safe';
    return '';
  };

  const selectedDayInfo = daySummaryMap[selectedDate] || { entries: [], reactions: [], maxSeverity: 0 };

  return (
    <div className="app-container">
      {/* Navbar */}
      <nav className="navbar">
        <div className="brand">
          <img src="/logo-icon.png" alt="Chopper Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          <span>Chopper</span>
        </div>
        <div className="nav-actions">
          {authUser && (
            <>
              <button className="btn btn-primary" onClick={() => openNewLogModal()}>
                <span>+ Log Item</span>
              </button>
              <button className="btn btn-danger" onClick={() => openNewReactionModal()}>
                <span>🚨 Log Reaction</span>
              </button>
            </>
          )}

          {authChecked && (
            authUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.85rem', color: '#86efac' }}>🔐 {authUser.first_name || 'Admin'}</span>
                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={handleLogout}>
                  Sign Out
                </button>
              </div>
            ) : null
          )}
        </div>
      </nav>

      {/* Main Body */}
      {!authChecked ? (
        /* Loading Spinner Screen while verifying authentication */
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem' }}>
          <div className="spinner"></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 500 }}>Loading Chopper...</p>
        </div>
      ) : !authUser ? (
        /* Passphrase Login Screen */
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div className="card" style={{ maxWidth: '420px', width: '100%', textAlign: 'center', padding: '2.5rem' }}>
            <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'center' }}>
              <img src="/logo-icon.png" alt="Chopper Logo" style={{ width: '84px', height: '84px', objectFit: 'contain' }} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.35rem' }}>Welcome to Chopper</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: '1.6', marginBottom: '1.75rem' }}>
              Track Your Food, Debug Your Allergies
            </p>
            <form onSubmit={handlePassphraseLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type={showPassphrase ? 'text' : 'password'}
                  className="form-control"
                  placeholder="Enter passphrase…"
                  value={passphraseInput}
                  onChange={e => setPassphraseInput(e.target.value)}
                  autoFocus
                  required
                  style={{ textAlign: 'center', letterSpacing: '0.15em', fontSize: '1rem', paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px'
                  }}
                  title={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                >
                  {showPassphrase ? '👁️' : '🙈'}
                </button>
              </div>
              {loginError && (
                <div style={{ color: '#fca5a5', fontSize: '0.875rem', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                  {loginError}
                </div>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '0.85rem' }}
                disabled={loginLoading}
              >
                {loginLoading ? 'Verifying…' : '🔑 Unlock'}
              </button>
            </form>
          </div>
        </div>
      ) : viewMode === 'dashboard' ? (
        <main className="dashboard-grid">
          {/* GitHub-style Year Activity Heatmap Card */}
          <div className="card github-heatmap-card">
            <div className="github-heatmap-header">
              <div className="github-heatmap-title">
                <span className="count-badge">{yearActivityCount}</span> activities logged in {selectedYear}
              </div>
              <div className="year-selector-pills">
                {availableYears.map(y => (
                  <button
                    key={y}
                    className={`year-pill ${selectedYear === y ? 'active' : ''}`}
                    onClick={() => setSelectedYear(y)}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            <div className="github-heatmap-wrapper" ref={wrapperRef}>
              <div className="github-heatmap-inner">
                {/* Month Labels Row */}
                <div className="month-labels-row">
                  <div className="day-label-spacer" />
                  <div className="month-labels-grid">
                    {monthLabels.map((m, idx) => (
                      <span
                        key={idx}
                        className="month-label"
                        style={{ gridColumnStart: m.colIndex + 1 }}
                      >
                        {m.label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Grid Body: Day labels + 53 week columns */}
                <div className="github-heatmap-body">
                  <div className="day-labels-column">
                    <span></span>
                    <span>Mon</span>
                    <span></span>
                    <span>Wed</span>
                    <span></span>
                    <span>Fri</span>
                    <span></span>
                  </div>

                  <div className="weeks-flex">
                    {weeks.map((week, weekIdx) => (
                      <div key={weekIdx} className="week-column">
                        {week.map((day) => {
                          if (!day.isTargetYear) {
                            return <div key={day.dateKey} className="heatmap-cell empty-day" />;
                          }
                          const isFuture = day.dateKey > todayStr;
                          if (isFuture) {
                            return (
                              <div
                                key={day.dateKey}
                                className="heatmap-cell future-day"
                                title={`${day.dateKey}: Future date (cannot log)`}
                              />
                            );
                          }
                          const statusClass = getDayStatusClass(day.dateKey);
                          const info = daySummaryMap[day.dateKey];
                          const countEntries = info ? info.entries.length : 0;
                          const countReactions = info ? info.reactions.length : 0;

                          return (
                            <div
                              key={day.dateKey}
                              className={`heatmap-cell ${statusClass} ${selectedDate === day.dateKey ? 'selected' : ''}`}
                              title={`${day.dateKey}: ${countEntries} items, ${countReactions} reactions`}
                              onClick={() => {
                                setSelectedDate(day.dateKey);
                                setViewMode('day_detail');
                              }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="github-heatmap-footer">
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Click any cell to inspect or add logs for that date
              </span>
              <div className="heatmap-legend">
                <span>Less</span>
                <div className="legend-item"><div className="color-box empty" /></div>
                <div className="legend-item"><div className="color-box safe" /></div>
                <div className="legend-item"><div className="color-box mild" /></div>
                <div className="legend-item"><div className="color-box severe" /></div>
                <span>More</span>
              </div>
            </div>
          </div>

          {/* Today's Log Timeline Sidebar */}
          <div className="card">
            <div className="card-title">
              <span>Today's Timeline ({todayStr})</span>
            </div>

            <div className="timeline-list">
              {(!daySummaryMap[todayStr] || (daySummaryMap[todayStr].entries.length === 0 && daySummaryMap[todayStr].reactions.length === 0)) ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
                  No food or reactions logged today.
                </div>
              ) : (
                getUnifiedTimeline(daySummaryMap[todayStr]).map(item => (
                  item.timelineType === 'entry' ? (
                    <div key={`entry-${item.id}`} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span>{item.entryType === 'food' ? '🍽️ Food/Drink' : '⚠️ Other'}</span>
                          <span>{item.timeStr}</span>
                        </div>
                        <div className="timeline-body">{item.itemName}</div>
                        {item.notes && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{item.notes}</div>}
                        <div className="action-links">
                          <button className="action-link-btn edit" onClick={() => openEditLogModal(item)}>
                            ✏️ Edit
                          </button>
                          <button className="action-link-btn delete" onClick={() => handleDeleteItem(item.id, 'entry')}>
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={`reaction-${item.id}`} className="timeline-item reaction">
                      <div className="timeline-dot" />
                      <div className="timeline-content" style={{ background: 'var(--accent-red-bg)', borderColor: 'var(--accent-red)' }}>
                        <div className="timeline-header" style={{ color: '#fca5a5' }}>
                          <span>🚨 Reaction Event (Severity {item.severityLevel}/5)</span>
                          <span>{item.timeStr}</span>
                        </div>
                        <div className="timeline-body" style={{ color: '#fff' }}>
                          {(item.symptoms || []).join(', ')}
                        </div>
                        {(!item.resolution || item.resolution === 'unresolved' || !item.resolvedInMinutes) ? (
                          <div style={{ fontSize: '0.8rem', color: '#fca5a5', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: 'rgba(239, 68, 68, 0.3)', border: '1px solid #f87171', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, color: '#fecaca' }}>
                              ⏳ Ongoing / Unresolved
                            </span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: '#fca5a5', marginTop: '4px' }}>
                            Resolution: {item.resolution === 'antihistamine' ? '💊 Took Antihistamine' : '⏱️ Auto-resolved'} ({item.resolvedInMinutes} mins)
                          </div>
                        )}
                        {item.notes && <div style={{ fontSize: '0.8rem', color: '#f8fafc', marginTop: '4px' }}>Note: {item.notes}</div>}
                        <div className="action-links">
                          {(!item.resolution || item.resolution === 'unresolved' || !item.resolvedInMinutes) && (
                            <button className="action-link-btn resolve-btn" onClick={() => openMarkResolvedModal(item)}>
                              ✅ Mark as Resolved
                            </button>
                          )}
                          <button className="action-link-btn edit" style={{ color: '#93c5fd' }} onClick={() => openEditReactionModal(item)}>
                            ✏️ Edit
                          </button>
                          <button className="action-link-btn delete" onClick={() => handleDeleteItem(item.id, 'reaction')}>
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                ))
              )}
            </div>
          </div>

          {/* Flagged Foods Strip */}
          <div className="card flagged-strip">
            <div className="card-title">
              <span>🔥 Suspected Allergy Triggers (Co-occurrence Analysis)</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Items eaten on days you had allergy reactions</span>
            </div>

            <div className="tags-wrapper">
              {flaggedItems.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No clear food/item triggers identified yet. Keep logging daily!
                </div>
              ) : (
                flaggedItems.map(item => {
                  const isHigh = item.reactionDaysCount >= 2;
                  return (
                    <div
                      key={item.itemName}
                      className={`tag-pill ${isHigh ? 'high-risk' : 'med-risk'}`}
                      onClick={() => handleConfirmTrigger(item.itemName)}
                      title="Click to mark as confirmed trigger"
                    >
                      <span>{isHigh ? '🔥' : '⚠️'}</span>
                      <span>{item.itemName}</span>
                      <span style={{ opacity: 0.8 }}>({item.reactionDaysCount} allergy days)</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>
      ) : (
        /* Day Drill-Down View */
        <main className="dashboard-grid">
          <div className="card">
            <div className="day-detail-header">
              <button className="back-btn" onClick={() => setViewMode('dashboard')}>
                ← Back to Dashboard
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{selectedDate}</span>
                {selectedDayInfo.reactions.length > 0 ? (
                  <span className={`tag-pill ${selectedDayInfo.maxSeverity >= 3 ? 'high-risk' : 'med-risk'}`}>
                    🚨 Reaction Day ({selectedDayInfo.maxSeverity}/5)
                  </span>
                ) : (
                  <span className="tag-pill" style={{ background: 'var(--accent-green-bg)', color: '#86efac' }}>
                    🟩 Safe Day
                  </span>
                )}
              </div>
            </div>

            <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Timeline for {selectedDate}</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => openNewLogModal(selectedDate)}>
                  + Log for {selectedDate}
                </button>
                <button className="btn btn-danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => openNewReactionModal(selectedDate)}>
                  🚨 Log Reaction
                </button>
              </div>
            </div>

            <div className="timeline-list">
              {selectedDayInfo.entries.length === 0 && selectedDayInfo.reactions.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', padding: '2rem 0', textAlign: 'center' }}>
                  No items or reactions logged on this date.
                </div>
              ) : (
                getUnifiedTimeline(selectedDayInfo).map(item => (
                  item.timelineType === 'entry' ? (
                    <div key={`entry-${item.id}`} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span>{item.entryType === 'food' ? '🍽️ Food/Drink' : '⚠️ Environment/Other'}</span>
                          <span>{item.timeStr}</span>
                        </div>
                        <div className="timeline-body">{item.itemName}</div>
                        {item.notes && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{item.notes}</div>}
                        <div className="action-links">
                          <button className="action-link-btn edit" onClick={() => openEditLogModal(item)}>
                            ✏️ Edit
                          </button>
                          <button className="action-link-btn delete" onClick={() => handleDeleteItem(item.id, 'entry')}>
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={`reaction-${item.id}`} className="timeline-item reaction">
                      <div className="timeline-dot" />
                      <div className="timeline-content" style={{ background: 'var(--accent-red-bg)', borderColor: 'var(--accent-red)' }}>
                        <div className="timeline-header" style={{ color: '#fca5a5' }}>
                          <span>🚨 Reaction Event (Severity {item.severityLevel}/5)</span>
                          <span>{item.timeStr}</span>
                        </div>
                        <div className="timeline-body" style={{ color: '#fff' }}>
                          {(item.symptoms || []).join(', ')}
                        </div>
                        {(!item.resolution || item.resolution === 'unresolved' || !item.resolvedInMinutes) ? (
                          <div style={{ fontSize: '0.8rem', color: '#fca5a5', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: 'rgba(239, 68, 68, 0.3)', border: '1px solid #f87171', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, color: '#fecaca' }}>
                              ⏳ Ongoing / Unresolved
                            </span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: '#fca5a5', marginTop: '4px' }}>
                            Resolution: {item.resolution === 'antihistamine' ? '💊 Took Antihistamine' : '⏱️ Auto-resolved'} ({item.resolvedInMinutes} mins)
                          </div>
                        )}
                        {item.notes && <div style={{ fontSize: '0.8rem', color: '#f8fafc', marginTop: '4px' }}>Note: {item.notes}</div>}
                        <div className="action-links">
                          {(!item.resolution || item.resolution === 'unresolved' || !item.resolvedInMinutes) && (
                            <button className="action-link-btn resolve-btn" onClick={() => openMarkResolvedModal(item)}>
                              ✅ Mark as Resolved
                            </button>
                          )}
                          <button className="action-link-btn edit" style={{ color: '#93c5fd' }} onClick={() => openEditReactionModal(item)}>
                            ✏️ Edit
                          </button>
                          <button className="action-link-btn delete" onClick={() => handleDeleteItem(item.id, 'reaction')}>
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                ))
              )}
            </div>
          </div>

          {/* AI / Pattern Insights Panel */}
          <div className="insight-card">
            <div className="card-title" style={{ color: '#fde047' }}>
              <span>🧠 Pattern Analysis</span>
            </div>

            {selectedDayInfo.reactions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Items consumed on {selectedDate} prior to allergy onset:
                </p>

                {selectedDayInfo.entries.map(e => (
                  <div key={e.id} style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '0.75rem', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{e.itemName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Logged at {parseTimeStr(e.loggedAt)}
                    </div>
                    <button
                      className="btn btn-secondary"
                      style={{ marginTop: '8px', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      onClick={() => handleConfirmTrigger(e.itemName)}
                    >
                      Mark as Confirmed Trigger
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                No allergic reactions logged on {selectedDate}. All items consumed on this date appear safe!
              </div>
            )}
          </div>
        </main>
      )}

      {/* Log Item Modal (Create or Edit) */}
      {showLogModal && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>{editingEntryId ? '✏️ Edit Log Entry' : 'Log Entry'}</span>
              <button className="modal-close" onClick={() => setShowLogModal(false)}>×</button>
            </div>

            <div className="type-toggle">
              <div
                className={`toggle-option ${entryForm.entryType === 'food' ? 'active' : ''}`}
                onClick={() => setEntryForm(prev => ({ ...prev, entryType: 'food' }))}
              >
                🍽️ Food/Drink
              </div>
              <div
                className={`toggle-option ${entryForm.entryType === 'other' ? 'active' : ''}`}
                onClick={() => setEntryForm(prev => ({ ...prev, entryType: 'other' }))}
              >
                ⚠️ Environment / Other
              </div>
            </div>

            <form onSubmit={handleSaveEntry} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">What did you consume / encounter?</label>
                <input
                  className="form-control"
                  placeholder="e.g. Peanut butter toast, Oat milk..."
                  value={entryForm.itemName}
                  onChange={e => setEntryForm({ ...entryForm, itemName: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Date & Time</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  max={getInitialFormDateTime(todayStr)}
                  value={entryForm.loggedAt}
                  onChange={e => setEntryForm({ ...entryForm, loggedAt: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes (Optional)</label>
                <textarea
                  className="form-control"
                  rows="2"
                  placeholder="e.g. Brand, prep method, location"
                  value={entryForm.notes}
                  onChange={e => setEntryForm({ ...entryForm, notes: e.target.value })}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem', justifyContent: 'center' }}>
                {editingEntryId ? 'Update Entry' : 'Log Item'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Log Reaction Modal (Create or Edit) */}
      {showReactionModal && (
        <div className="modal-overlay" onClick={() => setShowReactionModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>{editingReactionId ? '✏️ Edit Allergy Reaction' : 'Log Allergy Reaction 🚨'}</span>
              <button className="modal-close" onClick={() => setShowReactionModal(false)}>×</button>
            </div>

            <form onSubmit={handleSaveReaction} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Symptom Start Time</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  max={getInitialFormDateTime(todayStr)}
                  value={reactionForm.symptomStartTime}
                  onChange={e => {
                    const newStart = e.target.value;
                    setReactionForm(prev => ({
                      ...prev,
                      symptomStartTime: newStart,
                      resolvedAt: calculateResolvedAt(newStart, prev.resolvedInMinutes || 60)
                    }));
                  }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Severity Level (1-Mild to 5-Severe)</label>
                <div className="severity-picker">
                  {[1, 2, 3, 4, 5].map(lvl => (
                    <div
                      key={lvl}
                      className={`sev-btn ${reactionForm.severityLevel === lvl ? `active-${lvl}` : ''}`}
                      onClick={() => setReactionForm({ ...reactionForm, severityLevel: lvl })}
                    >
                      {lvl}
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Symptoms Experienced</label>
                <div className="symptoms-grid">
                  {availableSymptoms.map(sym => (
                    <div
                      key={sym}
                      className={`symptom-chip ${reactionForm.symptoms.includes(sym) ? 'selected' : ''}`}
                      onClick={() => toggleSymptom(sym)}
                    >
                      {sym}
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Reaction Resolution Status</label>
                <div className="type-toggle">
                  <div
                    className={`toggle-option ${!reactionForm.isResolved ? 'active' : ''}`}
                    onClick={() => setReactionForm(prev => ({ ...prev, isResolved: false }))}
                  >
                    ⏳ Ongoing / Unresolved
                  </div>
                  <div
                    className={`toggle-option ${reactionForm.isResolved ? 'active' : ''}`}
                    onClick={() => setReactionForm(prev => ({ ...prev, isResolved: true }))}
                  >
                    ✅ Resolved
                  </div>
                </div>
              </div>

              {reactionForm.isResolved && (
                <>
                  <div className="form-group">
                    <label className="form-label">Resolution Method</label>
                    <div className="type-toggle">
                      <div
                        className={`toggle-option ${reactionForm.resolution === 'auto' ? 'active' : ''}`}
                        onClick={() => setReactionForm(prev => ({ ...prev, resolution: 'auto' }))}
                      >
                        ⏱️ Auto-resolved
                      </div>
                      <div
                        className={`toggle-option ${reactionForm.resolution === 'antihistamine' ? 'active' : ''}`}
                        onClick={() => setReactionForm(prev => ({ ...prev, resolution: 'antihistamine' }))}
                      >
                        💊 Took Antihistamine
                      </div>
                    </div>
                  </div>

                  <div className="form-group" style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <label className="form-label" style={{ marginBottom: '0.6rem' }}>Editable Resolved Time</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Resolved Date & Time</label>
                        <input
                          type="datetime-local"
                          className="form-control"
                          value={reactionForm.resolvedAt || ''}
                          min={reactionForm.symptomStartTime}
                          onChange={e => {
                            const newResolvedAt = e.target.value;
                            const mins = calculateResolvedInMinutes(reactionForm.symptomStartTime, newResolvedAt);
                            setReactionForm(prev => ({
                              ...prev,
                              resolvedAt: newResolvedAt,
                              resolvedInMinutes: mins
                            }));
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Duration (minutes)</label>
                        <input
                          type="number"
                          min="1"
                          className="form-control"
                          placeholder="e.g. 60, 120"
                          value={reactionForm.resolvedInMinutes || ''}
                          onChange={e => {
                            const mins = parseInt(e.target.value || 0, 10);
                            const newResolvedAt = calculateResolvedAt(reactionForm.symptomStartTime, mins);
                            setReactionForm(prev => ({
                              ...prev,
                              resolvedInMinutes: mins,
                              resolvedAt: newResolvedAt
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="form-label">Additional Notes</label>
                <textarea
                  className="form-control"
                  rows="2"
                  placeholder="Details about symptoms, medication name, etc."
                  value={reactionForm.notes}
                  onChange={e => setReactionForm({ ...reactionForm, notes: e.target.value })}
                />
              </div>

              <button type="submit" className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }}>
                {editingReactionId ? 'Update Reaction' : 'Log Allergy Reaction'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
