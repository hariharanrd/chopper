import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchDashboardData,
  addLogEntry,
  deleteLogEntry,
  addReaction,
  deleteReaction,
  addConfirmedTrigger
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

export default function App() {
  const [data, setData] = useState({ entries: [], reactions: [], confirmedTriggers: [] });
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' | 'day_detail'

  // Catalyst Auth User
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

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
    resolution: 'auto',
    resolvedInMinutes: 120,
    notes: ''
  });

  useEffect(() => {
    let checked = false;

    const performAuthCheck = () => {
      if (checked) return;

      if (window.catalyst && window.catalyst.auth) {
        checked = true;
        window.catalyst.auth.isUserAuthenticated()
          .then(res => {
            const userObj = (res && typeof res === 'object')
              ? (res.content || res.data || res.user_details || res)
              : null;

            setAuthUser(userObj || { email_id: 'hariharan.dr@zoho.in', first_name: 'Hariharan' });
            loadData();
            setAuthChecked(true);
          })
          .catch(() => {
            fetchDashboardData().then(dashRes => {
              if (dashRes && !dashRes.unauthenticated && !dashRes.error) {
                setAuthUser({ email_id: 'hariharan.dr@zoho.in', first_name: 'Hariharan' });
                setData(dashRes);
              } else {
                setAuthUser(null);
              }
              setLoading(false);
              setAuthChecked(true);
            });
          });
      }
    };

    const interval = setInterval(performAuthCheck, 100);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!checked) {
        checked = true;
        fetchDashboardData().then(dashRes => {
          if (dashRes && !dashRes.unauthenticated && !dashRes.error) {
            setAuthUser({ email_id: 'hariharan.dr@zoho.in', first_name: 'Hariharan' });
            setData(dashRes);
          } else {
            setAuthUser(null);
          }
          setLoading(false);
          setAuthChecked(true);
        });
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    const res = await fetchDashboardData();
    if (res && !res.unauthenticated && !res.error) {
      setData(res);
    } else if (res && res.unauthenticated) {
      setAuthUser(null);
      setData({ entries: [], reactions: [], confirmedTriggers: [] });
    }
    setLoading(false);
  };

  const handleLogin = () => {
    if (window.catalyst && window.catalyst.auth && typeof window.catalyst.auth.login === 'function') {
      try {
        window.catalyst.auth.login();
        return;
      } catch (e) {
        console.warn('catalyst.auth.login fallback:', e);
      }
    }
    window.location.href = '/__catalyst/auth/login';
  };

  const handleLogout = () => {
    if (window.catalyst && window.catalyst.auth) {
      window.catalyst.auth.signOut(window.location.origin);
    } else {
      window.location.reload();
    }
  };

  // Open Log Entry Modal (Create or Pre-fill)
  const openNewLogModal = (overrideDate) => {
    const targetDate = overrideDate || selectedDate;
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
    setEditingReactionId(null);
    setReactionForm({
      symptomStartTime: getInitialFormDateTime(targetDate),
      severityLevel: 3,
      symptoms: ['Skin rash', 'Itching'],
      resolution: 'auto',
      resolvedInMinutes: 120,
      notes: ''
    });
    setShowReactionModal(true);
  };

  const openEditReactionModal = (reaction) => {
    setEditingReactionId(reaction.id);
    setReactionForm({
      id: reaction.id,
      symptomStartTime: reaction.symptomStartTime ? String(reaction.symptomStartTime).replace(' ', 'T').slice(0, 16) : getInitialFormDateTime(selectedDate),
      severityLevel: reaction.severityLevel || 3,
      symptoms: Array.isArray(reaction.symptoms) ? reaction.symptoms : [],
      resolution: reaction.resolution || 'auto',
      resolvedInMinutes: reaction.resolvedInMinutes || 120,
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

  // Calendar dates (past 180 days / ~26 weeks)
  const calendarDates = useMemo(() => {
    const dates = [];
    const today = new Date();
    for (let i = 181; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }, []);

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

  // Save Handlers (Create or Update)
  const handleSaveEntry = async (e) => {
    e.preventDefault();
    if (!entryForm.itemName.trim()) return;
    const payload = editingEntryId ? { ...entryForm, id: editingEntryId } : entryForm;
    const res = await addLogEntry(payload);
    if (res && res.error === 'unauthenticated') {
      handleLogin();
      return;
    }
    setShowLogModal(false);
    setEditingEntryId(null);
    loadData();
  };

  const handleSaveReaction = async (e) => {
    e.preventDefault();
    const payload = editingReactionId ? { ...reactionForm, id: editingReactionId } : reactionForm;
    const res = await addReaction(payload);
    if (res && res.error === 'unauthenticated') {
      handleLogin();
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

  const todayStr = new Date().toISOString().split('T')[0];
  const selectedDayInfo = daySummaryMap[selectedDate] || { entries: [], reactions: [], maxSeverity: 0 };

  return (
    <div className="app-container">
      {/* Navbar */}
      <nav className="navbar">
        <div className="brand">
          <div className="brand-icon">🌿</div>
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

          {authUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.85rem', color: '#86efac' }}>👤 {authUser.first_name || authUser.email_id || 'Zoho User'}</span>
              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={handleLogin}>
              🔑 Sign In with Zoho
            </button>
          )}
        </div>
      </nav>

      {/* Main Body */}
      {!authUser ? (
        /* Unauthenticated Auth Guard Landing Screen */
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div className="card" style={{ maxWidth: '460px', width: '100%', textAlign: 'center', padding: '2.5rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>Authentication Required</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
              Chopper is protected by Catalyst Native Authentication. Please sign in with your Zoho account to view and manage your personal food & skin allergy logs.
            </p>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.85rem' }} onClick={handleLogin}>
              🔑 Sign In with Zoho Account
            </button>
          </div>
        </div>
      ) : viewMode === 'dashboard' ? (
        <main className="dashboard-grid">
          {/* Calendar Heatmap Card */}
          <div className="card heatmap-container">
            <div className="card-title">
              <span>6-Month Activity & Allergy Frequency</span>
              <div className="heatmap-legend">
                <div className="legend-item"><div className="color-box empty"></div> No data</div>
                <div className="legend-item"><div className="color-box safe"></div> No allergy</div>
                <div className="legend-item"><div className="color-box mild"></div> Mild (1-2)</div>
                <div className="legend-item"><div className="color-box severe"></div> Severe (3-5)</div>
              </div>
            </div>

            <div className="heatmap-grid">
              {calendarDates.map(dateKey => {
                const statusClass = getDayStatusClass(dateKey);
                const info = daySummaryMap[dateKey];
                const countEntries = info ? info.entries.length : 0;
                const countReactions = info ? info.reactions.length : 0;

                return (
                  <div
                    key={dateKey}
                    className={`heatmap-cell ${statusClass} ${selectedDate === dateKey ? 'selected' : ''}`}
                    title={`${dateKey}: ${countEntries} items logged, ${countReactions} reactions`}
                    onClick={() => {
                      setSelectedDate(dateKey);
                      setViewMode('day_detail');
                    }}
                  />
                );
              })}
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
                <>
                  {(daySummaryMap[todayStr]?.entries || []).map(entry => (
                    <div key={entry.id} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span>{entry.entryType === 'food' ? '🍽️ Food' : '⚠️ Other'}</span>
                          <span>{parseTimeStr(entry.loggedAt)}</span>
                        </div>
                        <div className="timeline-body">{entry.itemName}</div>
                        {entry.notes && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{entry.notes}</div>}
                        <div className="action-links">
                          <button className="action-link-btn edit" onClick={() => openEditLogModal(entry)}>
                            ✏️ Edit
                          </button>
                          <button className="action-link-btn delete" onClick={() => handleDeleteItem(entry.id, 'entry')}>
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {(daySummaryMap[todayStr]?.reactions || []).map(r => (
                    <div key={r.id} className="timeline-item reaction">
                      <div className="timeline-dot" />
                      <div className="timeline-content" style={{ background: 'var(--accent-red-bg)', borderColor: 'var(--accent-red)' }}>
                        <div className="timeline-header" style={{ color: '#fca5a5' }}>
                          <span>🚨 Allergy Reaction (Level {r.severityLevel}/5)</span>
                          <span>{parseTimeStr(r.symptomStartTime)}</span>
                        </div>
                        <div className="timeline-body" style={{ color: '#fff' }}>
                          {(r.symptoms || []).join(', ')}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#fca5a5', marginTop: '4px' }}>
                          Resolution: {r.resolution === 'antihistamine' ? '💊 Took Antihistamine' : `⏱️ Auto-resolved (${r.resolvedInMinutes || 'some'} mins)`}
                        </div>
                        <div className="action-links">
                          <button className="action-link-btn edit" style={{ color: '#93c5fd' }} onClick={() => openEditReactionModal(r)}>
                            ✏️ Edit
                          </button>
                          <button className="action-link-btn delete" onClick={() => handleDeleteItem(r.id, 'reaction')}>
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
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
                <>
                  {selectedDayInfo.entries.map(e => (
                    <div key={e.id} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span>{e.entryType === 'food' ? '🍽️ Food/Drink' : '⚠️ Environment/Other'}</span>
                          <span>{parseTimeStr(e.loggedAt)}</span>
                        </div>
                        <div className="timeline-body">{e.itemName}</div>
                        {e.notes && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{e.notes}</div>}
                        <div className="action-links">
                          <button className="action-link-btn edit" onClick={() => openEditLogModal(e)}>
                            ✏️ Edit
                          </button>
                          <button className="action-link-btn delete" onClick={() => handleDeleteItem(e.id, 'entry')}>
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {selectedDayInfo.reactions.map(r => (
                    <div key={r.id} className="timeline-item reaction">
                      <div className="timeline-dot" />
                      <div className="timeline-content" style={{ background: 'var(--accent-red-bg)', borderColor: 'var(--accent-red)' }}>
                        <div className="timeline-header" style={{ color: '#fca5a5' }}>
                          <span>🚨 Reaction Event (Severity {r.severityLevel}/5)</span>
                          <span>{parseTimeStr(r.symptomStartTime)}</span>
                        </div>
                        <div className="timeline-body" style={{ color: '#fff' }}>
                          {(r.symptoms || []).join(', ')}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#fca5a5', marginTop: '4px' }}>
                          {r.resolution === 'antihistamine' ? '💊 Took Antihistamine' : `⏱️ Auto-resolved (${r.resolvedInMinutes || 'some'} min)`}
                        </div>
                        {r.notes && <div style={{ fontSize: '0.8rem', color: '#f8fafc', marginTop: '4px' }}>Note: {r.notes}</div>}
                        <div className="action-links">
                          <button className="action-link-btn edit" style={{ color: '#93c5fd' }} onClick={() => openEditReactionModal(r)}>
                            ✏️ Edit
                          </button>
                          <button className="action-link-btn delete" onClick={() => handleDeleteItem(r.id, 'reaction')}>
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
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
                  value={reactionForm.symptomStartTime}
                  onChange={e => setReactionForm({ ...reactionForm, symptomStartTime: e.target.value })}
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
                <label className="form-label">Resolution Method</label>
                <div className="type-toggle">
                  <div
                    className={`toggle-option ${reactionForm.resolution === 'auto' ? 'active' : ''}`}
                    onClick={() => setReactionForm({ ...reactionForm, resolution: 'auto' })}
                  >
                    ⏱️ Auto-resolved
                  </div>
                  <div
                    className={`toggle-option ${reactionForm.resolution === 'antihistamine' ? 'active' : ''}`}
                    onClick={() => setReactionForm({ ...reactionForm, resolution: 'antihistamine' })}
                  >
                    💊 Took Antihistamine
                  </div>
                </div>
              </div>

              {reactionForm.resolution === 'auto' && (
                <div className="form-group">
                  <label className="form-label">Resolved in how long? (minutes)</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="e.g. 60, 120"
                    value={reactionForm.resolvedInMinutes}
                    onChange={e => setReactionForm({ ...reactionForm, resolvedInMinutes: parseInt(e.target.value || 0, 10) })}
                  />
                </div>
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
