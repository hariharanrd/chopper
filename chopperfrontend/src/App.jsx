import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  fetchDashboardData,
  fetchHeatmapData,
  fetchDayDetails,
  addLogEntry,
  deleteLogEntry,
  addReaction,
  deleteReaction,
  addConfirmedTrigger,
  deleteConfirmedTrigger,
  addSuspectedTrigger,
  deleteSuspectedTrigger,
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

// Helper to get YYYY-MM-DD in local time
const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Generates YYYY-MM-DDTHH:mm for targetDateStr (or current time if today)
const getInitialFormDateTime = (targetDateStr) => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const currentHHmm = `${hours}:${mins}`;
  if (targetDateStr) {
    return `${targetDateStr}T${currentHHmm}`;
  }
  return `${getLocalDateStr(now)}T${currentHHmm}`;
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
  const todayStr = getLocalDateStr();
  const currentMonthStr = todayStr.slice(0, 7); // "YYYY-MM"

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' | 'day_detail'

  // Heatmap aggregate data: { days: { "YYYY-MM-DD": { entriesCount, reactionsCount, maxSeverity, status } }, suspectedTriggers: [], confirmedTriggers: [] }
  const [heatmapData, setHeatmapData] = useState({ days: {}, suspectedTriggers: [], confirmedTriggers: [] });
  const [heatmapLoading, setHeatmapLoading] = useState(true);

  // Day detail state (for selectedDate detail view & today's timeline)
  const [dayDetails, setDayDetails] = useState({ entries: [], reactions: [] });
  const [todayDetails, setTodayDetails] = useState({ entries: [], reactions: [] });
  const [dayLoading, setDayLoading] = useState(false);

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

  // Load heatmap aggregate query data for selectedMonth
  const loadHeatmap = async (monthStr) => {
    setHeatmapLoading(true);
    const res = await fetchHeatmapData(monthStr);
    if (res && res.unauthenticated) {
      clearToken();
      setAuthUser(null);
    } else if (res && !res.error) {
      setHeatmapData({
        days: res.days || {},
        suspectedTriggers: res.suspectedTriggers || [],
        confirmedTriggers: res.confirmedTriggers || []
      });
    }
    setHeatmapLoading(false);
  };

  // Load day details on-demand for a single date
  const loadDayDetails = async (dateStr, target = 'selected') => {
    if (target === 'selected') setDayLoading(true);
    const res = await fetchDayDetails(dateStr);
    if (res && !res.unauthenticated && !res.error) {
      if (target === 'selected') {
        setDayDetails({ entries: res.entries || [], reactions: res.reactions || [] });
      }
      if (target === 'today' || dateStr === todayStr) {
        setTodayDetails({ entries: res.entries || [], reactions: res.reactions || [] });
      }
    }
    if (target === 'selected') setDayLoading(false);
  };

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      if (!isTokenValid()) {
        clearToken();
        if (active) { setAuthChecked(true); setHeatmapLoading(false); }
        return;
      }

      if (active) {
        setAuthUser({ first_name: 'Admin', email_id: '' });
        setAuthChecked(true);
      }

      try {
        await loadHeatmap(selectedMonth);
        await loadDayDetails(todayStr, 'today');
      } catch (e) {
        console.warn('Failed to load initial heatmap data:', e);
      }
    }

    checkAuth();

    return () => { active = false; };
  }, []);

  // Reload heatmap whenever selectedMonth changes
  useEffect(() => {
    if (authUser) {
      loadHeatmap(selectedMonth);
    }
  }, [selectedMonth, authUser]);

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
    setAuthUser({ first_name: 'Admin', email_id: '' });
    loadHeatmap(selectedMonth);
    loadDayDetails(todayStr, 'today');
    setPassphraseInput('');
  };

  const handleLogout = () => {
    logout();
    setAuthUser(null);
    setHeatmapData({ days: {}, suspectedTriggers: [], confirmedTriggers: [] });
    setDayDetails({ entries: [], reactions: [] });
    setTodayDetails({ entries: [], reactions: [] });
  };

  // Month navigation handlers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevY = prevDate.getFullYear();
    const prevM = String(prevDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${prevY}-${prevM}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const nextY = nextDate.getFullYear();
    const nextM = String(nextDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${nextY}-${nextM}`);
  };

  // Calendar grid construction for selectedMonth
  const monthGrid = useMemo(() => {
    if (!selectedMonth) return { daysList: [], monthTitle: '', yearVal: 2026 };
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;

    const firstDay = new Date(year, monthIndex, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 = Sun
    const totalDaysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const monthTitle = firstDay.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const paddingCells = Array.from({ length: startDayOfWeek }, (_, i) => ({
      isEmpty: true,
      key: `pad-${i}`
    }));

    const dayCells = Array.from({ length: totalDaysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const dayStr = String(dayNum).padStart(2, '0');
      const dateKey = `${yearStr}-${monthStr}-${dayStr}`;
      return {
        isEmpty: false,
        dayNum,
        dateKey,
        isFuture: dateKey > todayStr
      };
    });

    return {
      daysList: [...paddingCells, ...dayCells],
      monthTitle,
      yearVal: year,
      totalDays: totalDaysInMonth
    };
  }, [selectedMonth, todayStr]);

  // Click handler for day cell -> fetches day details on-demand
  const handleSelectDayCell = async (dateKey) => {
    if (dateKey > todayStr) return;
    setSelectedDate(dateKey);
    setViewMode('day_detail');
    await loadDayDetails(dateKey, 'selected');
  };

  // Trigger handlers (Suspected & Confirmed)
  const handleMarkSuspected = async (itemName) => {
    if (!itemName || !itemName.trim()) return;
    const res = await addSuspectedTrigger(itemName.trim());
    if (res && res.error === 'unauthenticated') { handleLogout(); return; }
    loadHeatmap(selectedMonth);
  };

  const handleMarkConfirmed = async (itemName) => {
    if (!itemName || !itemName.trim()) return;
    const res = await addConfirmedTrigger(itemName.trim());
    if (res && res.error === 'unauthenticated') { handleLogout(); return; }
    loadHeatmap(selectedMonth);
  };

  const handleRemoveSuspected = async (id) => {
    const res = await deleteSuspectedTrigger(id);
    if (res && res.error === 'unauthenticated') { handleLogout(); return; }
    loadHeatmap(selectedMonth);
  };

  const handleRemoveConfirmed = async (id) => {
    const res = await deleteConfirmedTrigger(id);
    if (res && res.error === 'unauthenticated') { handleLogout(); return; }
    loadHeatmap(selectedMonth);
  };

  const handlePromoteSuspectedToConfirmed = async (item) => {
    await addConfirmedTrigger(item.itemName);
    if (item.id) {
      await deleteSuspectedTrigger(item.id);
    }
    loadHeatmap(selectedMonth);
  };

  const isSuspected = (itemName) => {
    const clean = String(itemName || '').toLowerCase().trim();
    return (heatmapData.suspectedTriggers || []).some(t => String(t.itemName).toLowerCase().trim() === clean);
  };

  const isConfirmed = (itemName) => {
    const clean = String(itemName || '').toLowerCase().trim();
    return (heatmapData.confirmedTriggers || []).some(t => String(t.itemName).toLowerCase().trim() === clean);
  };

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

  // Save Handlers
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
    loadHeatmap(selectedMonth);
    if (selectedDate) loadDayDetails(selectedDate, 'selected');
    if (selectedDate === todayStr || entryForm.loggedAt.startsWith(todayStr)) loadDayDetails(todayStr, 'today');
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
    loadHeatmap(selectedMonth);
    if (selectedDate) loadDayDetails(selectedDate, 'selected');
    if (selectedDate === todayStr || reactionForm.symptomStartTime.startsWith(todayStr)) loadDayDetails(todayStr, 'today');
  };

  const handleDeleteItem = async (id, type) => {
    if (!window.confirm('Delete this item?')) return;
    if (type === 'entry') await deleteLogEntry(id);
    if (type === 'reaction') await deleteReaction(id);
    loadHeatmap(selectedMonth);
    if (selectedDate) loadDayDetails(selectedDate, 'selected');
    if (selectedDate === todayStr) loadDayDetails(todayStr, 'today');
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

  // Helper for timeline rendering
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

  const selectedDayInfo = dayDetails || { entries: [], reactions: [] };

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
          {/* Month-Wise Activity Heatmap Card */}
          <div className="card month-heatmap-card">
            <div className="month-heatmap-header">
              <div className="month-heatmap-title">
                <span className="count-badge">🗓️</span>
                <span>{monthGrid.monthTitle} Heatmap</span>
              </div>
              <div className="month-nav-controls">
                <button className="month-nav-btn" onClick={handlePrevMonth} title="Previous Month">
                  ◀ Prev
                </button>
                <input
                  type="month"
                  className="month-picker-input"
                  value={selectedMonth}
                  onChange={e => e.target.value && setSelectedMonth(e.target.value)}
                />
                <button className="month-nav-btn" onClick={handleNextMonth} title="Next Month">
                  Next ▶
                </button>
              </div>
            </div>

            <div className="month-calendar-wrapper">
              <div className="calendar-weekdays-header">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>
              <div className="calendar-days-grid">
                {monthGrid.daysList.map((cell, idx) => {
                  if (cell.isEmpty) {
                    return <div key={cell.key} className="calendar-day-cell empty" />;
                  }
                  const info = heatmapData.days[cell.dateKey];
                  const statusClass = info ? info.status : '';
                  const countEntries = info ? info.entriesCount : 0;
                  const countReactions = info ? info.reactionsCount : 0;
                  const tookAntihistamine = Boolean(info && (info.tookAntihistamine || info.antihistamineCount > 0));

                  return (
                    <div
                      key={cell.dateKey}
                      className={`calendar-day-cell ${cell.isFuture ? 'future' : statusClass} ${selectedDate === cell.dateKey ? 'selected' : ''} ${tookAntihistamine ? 'has-antihistamine' : ''}`}
                      onClick={() => handleSelectDayCell(cell.dateKey)}
                      title={cell.isFuture ? `${cell.dateKey}: Future date` : `${cell.dateKey}: ${countEntries} logged items, ${countReactions} reactions${tookAntihistamine ? ' (💊 Antihistamine taken)' : ''}`}
                    >
                      <div className="day-cell-header">
                        <span className="day-number">{cell.dayNum}</span>
                        {tookAntihistamine && (
                          <span className="pill-badge" title="Antihistamine Taken">💊</span>
                        )}
                      </div>
                      {(countEntries > 0 || countReactions > 0) && (
                        <div className="day-cell-indicators">
                          {countReactions > 0 && <span className="indicator reaction">🚨 {countReactions}</span>}
                          {countEntries > 0 && countReactions === 0 && <span className="indicator safe">🍽️ {countEntries}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="month-heatmap-footer">
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Click any day cell to fetch date data
              </span>
              <div className="heatmap-legend">
                <div className="legend-item"><div className="color-box empty" /><span>No Data</span></div>
                <div className="legend-item"><div className="color-box safe" /><span>Safe</span></div>
                <div className="legend-item"><div className="color-box mild" /><span>Mild</span></div>
                <div className="legend-item"><div className="color-box severe" /><span>Severe</span></div>
                <div className="legend-item"><span className="legend-pill-icon">💊</span><span>Antihistamine</span></div>
              </div>
            </div>
          </div>

          {/* Today's Log Timeline Sidebar */}
          <div className="card">
            <div className="card-title">
              <span>Today's Timeline ({todayStr})</span>
            </div>

            <div className="timeline-list">
              {(todayDetails.entries.length === 0 && todayDetails.reactions.length === 0) ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
                  No food or reactions logged today.
                </div>
              ) : (
                getUnifiedTimeline(todayDetails).map(item => (
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
                        
                        {/* Trigger Badges & User Mark Actions */}
                        {item.entryType === 'food' && (
                          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '6px', flexWrap: 'wrap' }}>
                            {isConfirmed(item.itemName) ? (
                              <span className="tag-pill high-risk" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                                🔥 Confirmed Trigger
                              </span>
                            ) : isSuspected(item.itemName) ? (
                              <span className="tag-pill med-risk" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                                ⚠️ Suspected Trigger
                              </span>
                            ) : (
                              <>
                                <button
                                  className="action-link-btn"
                                  style={{ color: '#fde047', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 6px', borderRadius: '4px' }}
                                  onClick={() => handleMarkSuspected(item.itemName)}
                                >
                                  ⚠️ Mark Suspected
                                </button>
                                <button
                                  className="action-link-btn"
                                  style={{ color: '#fca5a5', background: 'rgba(239, 68, 68, 0.15)', padding: '2px 6px', borderRadius: '4px' }}
                                  onClick={() => handleMarkConfirmed(item.itemName)}
                                >
                                  🔥 Mark Confirmed
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        <div className="action-links" style={{ marginTop: '8px' }}>
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

          {/* User-Determined Suspected & Confirmed Triggers Section */}
          <div className="card triggers-card">
            <div className="card-title">
              <span>⚠️ Allergy Triggers & Suspected Items</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>User-selected trigger list</span>
            </div>

            {/* Suspected Triggers List */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-amber)', marginBottom: '0.6rem' }}>
                ⚠️ Suspected Triggers ({heatmapData.suspectedTriggers.length})
              </div>
              <div className="tags-wrapper">
                {heatmapData.suspectedTriggers.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No suspected triggers marked yet. Mark any logged food item as suspected to keep track.
                  </div>
                ) : (
                  heatmapData.suspectedTriggers.map(item => (
                    <div key={`suspected-${item.id}`} className="tag-pill med-risk" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>⚠️ {item.itemName}</span>
                      <button
                        className="tag-action-btn promote"
                        onClick={() => handlePromoteSuspectedToConfirmed(item)}
                        title="Confirm trigger"
                      >
                        ✓ Confirm
                      </button>
                      <button
                        className="tag-action-btn remove"
                        onClick={() => handleRemoveSuspected(item.id)}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Confirmed Triggers List */}
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-red)', marginBottom: '0.6rem' }}>
                🔥 Confirmed Allergy Triggers ({heatmapData.confirmedTriggers.length})
              </div>
              <div className="tags-wrapper">
                {heatmapData.confirmedTriggers.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No confirmed triggers saved yet.
                  </div>
                ) : (
                  heatmapData.confirmedTriggers.map(item => (
                    <div key={`confirmed-${item.id}`} className="tag-pill high-risk" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>🔥 {item.itemName}</span>
                      <button
                        className="tag-action-btn remove"
                        onClick={() => handleRemoveConfirmed(item.id)}
                        title="Remove trigger"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* Day Detail View (Fetched on Demand) */
        <main className="dashboard-grid">
          <div className="card">
            <div className="day-detail-header">
              <button className="back-btn" onClick={() => setViewMode('dashboard')}>
                ← Back to Dashboard
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{selectedDate}</span>
                {selectedDayInfo.reactions.length > 0 ? (
                  <span className="tag-pill high-risk">
                    🚨 Reaction Day ({selectedDayInfo.reactions.length} events)
                  </span>
                ) : (
                  <span className="tag-pill" style={{ background: 'var(--accent-green-bg)', color: '#86efac' }}>
                    🟩 Safe Day
                  </span>
                )}
                {(selectedDayInfo.reactions.some(r => r.resolution === 'antihistamine') ||
                  selectedDayInfo.entries.some(e => e.itemName && e.itemName.toLowerCase().includes('antihistamine')) ||
                  (heatmapData.days[selectedDate] && heatmapData.days[selectedDate].tookAntihistamine)) && (
                  <span className="tag-pill" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.4)' }}>
                    💊 Antihistamine Taken
                  </span>
                )}
              </div>
            </div>

            <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span>Timeline for {selectedDate}</span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => openNewLogModal(selectedDate)}>
                  + Log for {selectedDate}
                </button>
                <button className="btn btn-danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => openNewReactionModal(selectedDate)}>
                  🚨 Log Reaction
                </button>
              </div>
            </div>

            {dayLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 0', gap: '1rem' }}>
                <div className="spinner"></div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Fetching date data for {selectedDate}...</span>
              </div>
            ) : (
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
                          
                          {/* User Mark Trigger Actions */}
                          {item.entryType === 'food' && (
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '8px', flexWrap: 'wrap' }}>
                              {isConfirmed(item.itemName) ? (
                                <span className="tag-pill high-risk" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                                  🔥 Confirmed Trigger
                                </span>
                              ) : isSuspected(item.itemName) ? (
                                <span className="tag-pill med-risk" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                                  ⚠️ Suspected Trigger
                                </span>
                              ) : (
                                <>
                                  <button
                                    className="action-link-btn"
                                    style={{ color: '#fde047', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 8px', borderRadius: '4px' }}
                                    onClick={() => handleMarkSuspected(item.itemName)}
                                  >
                                    ⚠️ Mark Suspected
                                  </button>
                                  <button
                                    className="action-link-btn"
                                    style={{ color: '#fca5a5', background: 'rgba(239, 68, 68, 0.15)', padding: '2px 8px', borderRadius: '4px' }}
                                    onClick={() => handleMarkConfirmed(item.itemName)}
                                  >
                                    🔥 Mark Confirmed
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          <div className="action-links" style={{ marginTop: '8px' }}>
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
            )}
          </div>

          {/* User Trigger Management Panel */}
          <div className="insight-card">
            <div className="card-title" style={{ color: '#fde047' }}>
              <span>🧠 Day Trigger Analysis</span>
            </div>

            {selectedDayInfo.entries.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Items consumed on {selectedDate}:
                </p>

                {selectedDayInfo.entries.map(e => (
                  <div key={e.id} style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '0.75rem', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{e.itemName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Logged at {parseTimeStr(e.loggedAt)}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '8px' }}>
                      {isConfirmed(e.itemName) ? (
                        <span className="tag-pill high-risk" style={{ fontSize: '0.75rem' }}>🔥 Confirmed Trigger</span>
                      ) : isSuspected(e.itemName) ? (
                        <span className="tag-pill med-risk" style={{ fontSize: '0.75rem' }}>⚠️ Suspected Trigger</span>
                      ) : (
                        <>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                            onClick={() => handleMarkSuspected(e.itemName)}
                          >
                            Mark Suspected
                          </button>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                            onClick={() => handleMarkConfirmed(e.itemName)}
                          >
                            Mark Confirmed
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                No items logged on {selectedDate}.
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
