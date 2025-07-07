import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, deleteDoc } from 'firebase/firestore';
import { RBA_GREEN } from '../utils/rbaColors';
import logo from './assets/Logo.png';
import { cardStyle, inputStyle, buttonOutlineStyle, tableHeaderStyle, tableCellStyle } from '../utils/sharedStyles';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { parse, startOfWeek, getDay, format } from 'date-fns';

const locales = { 'en-US': require('date-fns/locale/en-US') };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales,
});

export default function TasksScreen() {
  console.log('[TasksScreen] Component mounted');
  console.log('[TasksScreen] Firestore db object:', db);

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState({ type: 'Phone Call', dueDate: '', notes: '' });
  const [status, setStatus] = useState('');
  const [contacts, setContacts] = useState([]);
  const [showCalendar, setShowCalendar] = useState(true);
  const [calendarView, setCalendarView] = useState('month');
  const [allDay, setAllDay] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  // Add state for Add Task form visibility
  const [showAddTask, setShowAddTask] = useState(false);
  // Pagination state for each list
  const [activePage, setActivePage] = useState(1);
  const [activePageSize, setActivePageSize] = useState(10);
  const [completedPage, setCompletedPage] = useState(1);
  const [completedPageSize, setCompletedPageSize] = useState(10);
  // Add editing state
  const [editingTaskId, setEditingTaskId] = useState(null);  const [editTaskFields, setEditTaskFields] = useState({ type: '', dueDate: '', notes: '' });

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    console.log('[TasksScreen] useEffect running');
    async function fetchTasks() {
      const user = JSON.parse(localStorage.getItem('user'));
      console.log('[fetchTasks] Current user:', user);
      if (!user?.uid) {
        console.log('[fetchTasks] No user UID, returning empty task list');
        setTasks([]);
        return;
      }
      const q = query(collection(db, 'tasks'), where('userId', '==', user.uid));
      console.log('[fetchTasks] Firestore query:', q);
      try {
        const snapshot = await getDocs(q);
        console.log('[fetchTasks] Query snapshot size:', snapshot.size);
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('[fetchTasks] Tasks fetched:', docs);
        setTasks(docs);
      } catch (err) {
        console.error('[fetchTasks] Error fetching tasks:', err);
        setTasks([]);
      }
      setLoading(false);
    }
    async function fetchContacts() {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return setContacts([]);
      const q = query(collection(db, 'contacts'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }
    fetchTasks();
    fetchContacts();
  }, []);

  const handleAdd = async e => {
    e.preventDefault();
    if (!newTask.dueDate || (!allDay && !newTask.time)) return;
    const user = JSON.parse(localStorage.getItem('user'));
    try {
      await addDoc(collection(db, 'tasks'), {
        ...newTask,
        userId: user?.uid || null,
        createdAt: new Date(),
        allDay,
        time: allDay ? null : newTask.time,
      });
      setStatus('Task added!');
      setNewTask({ type: 'Phone Call', dueDate: '', notes: '' });
      setAllDay(true);
      // Refresh
      const q = query(collection(db, 'tasks'), where('userId', '==', user?.uid));
      const snapshot = await getDocs(q);
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      setStatus('Error adding task: ' + (err.message || err.code || err));
    }
  };

  const handleComplete = async (id, completed) => {
    const user = JSON.parse(localStorage.getItem('user'));
    await updateDoc(doc(db, 'tasks', id), { completed, userId: user?.uid });
    setTasks(tasks => tasks.map(t => t.id === id ? { ...t, completed } : t));
  };

  // Only show tasks that are not completed (status !== 'completed' or missing, and !completed)
  const visibleTasks = tasks.filter(t => (typeof t.status === 'undefined' || t.status !== 'completed') && !t.completed);
  const completedTasks = tasks.filter(t => t.completed || t.status === 'completed');

  // Prepare events for calendar
  const allCalendarTasks = [...visibleTasks, ...completedTasks];
  const events = allCalendarTasks.map(task => {
    let start, end;
    if (task.dueDate) {
      if (typeof task.dueDate === 'string' && !isNaN(Date.parse(task.dueDate))) {
        start = new Date(task.dueDate + (task.allDay ? '' : 'T' + (task.time || '00:00')));
      } else if (task.dueDate && task.dueDate.seconds) {
        start = new Date(task.dueDate.seconds * 1000);
        if (!task.allDay && task.time) {
          const [h, m] = task.time.split(':');
          start.setHours(Number(h), Number(m));
        }
      } else {
        start = new Date(task.dueDate);
      }
    } else {
      start = new Date();
    }
    end = new Date(start);
    if (!task.allDay && task.time) {
      end.setMinutes(end.getMinutes() + 30);
    }
    return {
      title: task.type + (task.notes ? ': ' + task.notes : ''),
      start,
      end,
      allDay: !!task.allDay,
      resource: task,
      completed: !!task.completed,
    };
  });

  // Handler to start editing a task
  function handleEditTaskStart(task) {
    setEditingTaskId(task.id);
    setEditTaskFields({
      type: task.type || '',
      dueDate: (task.dueDate && typeof task.dueDate === 'string') ? task.dueDate : (task.dueDate && task.dueDate.seconds ? new Date(task.dueDate.seconds * 1000).toISOString().slice(0, 10) : ''),
      notes: task.notes || '',
    });
  }

  // Handler to cancel editing
  function handleEditTaskCancel() {
    setEditingTaskId(null);
    setEditTaskFields({ type: '', dueDate: '', notes: '' });
  }

  // Handler to save edited task
  async function handleEditTaskSave(taskId) {
    const user = JSON.parse(localStorage.getItem('user'));
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        type: editTaskFields.type,
        dueDate: editTaskFields.dueDate,
        notes: editTaskFields.notes,
        userId: user?.uid,
      });
      setTasks(tasks => tasks.map(t => t.id === taskId ? { ...t, ...editTaskFields } : t));
      setEditingTaskId(null);
    } catch (err) {
      alert('Error updating task: ' + (err.message || err.code || err));
    }
  }

  // Add to the top of the component, after other handlers
  async function handleDeleteTask(taskId) {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    try {
      // Firestore client-side deletes cannot include userId in the request.
      // If your security rules require request.resource.data.userId, you must use a Cloud Function for deletes.
      await deleteDoc(doc(db, 'tasks', taskId));
      setTasks(tasks => tasks.filter(t => t.id !== taskId));
      setEditingTaskId(null);
    } catch (err) {
      alert('Error deleting task: ' + (err.message || err.code || err));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: RBA_GREEN, width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ flex: '0 0 auto' }}>
        {/* Main card/content area */}
        <div style={{ ...cardStyle, marginTop: 32, width: '98vw', maxWidth: 800, minWidth: 320, marginLeft: 'auto', marginRight: 'auto', padding: '24px 2vw 48px 2vw', boxSizing: 'border-box', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 12 }}>
            <img src={logo} alt="DC Power Connector" style={{ width: 80, height: 80, objectFit: 'contain', display: 'block' }} />
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              <button
                style={{ ...buttonOutlineStyle, background: showCalendar ? RBA_GREEN : '#fff', color: showCalendar ? '#fff' : RBA_GREEN, height: 44, display: 'flex', alignItems: 'center' }}
                onClick={() => setShowCalendar(true)}
              >
                Calendar View
              </button>
              <button
                style={{ ...buttonOutlineStyle, background: !showCalendar ? RBA_GREEN : '#fff', color: !showCalendar ? '#fff' : RBA_GREEN, height: 44, display: 'flex', alignItems: 'center' }}
                onClick={() => setShowCalendar(false)}
              >
                List View
              </button>
              {!showAddTask && (
                <button style={{ ...buttonOutlineStyle, padding: '10px 28px', fontWeight: 700, fontSize: 17, height: 44, display: 'flex', alignItems: 'center' }} onClick={() => setShowAddTask(true)}>
                  + Add Task
                </button>
              )}
            </div>
          </div>
          {showAddTask && (
            <div style={{ ...cardStyle, width: '90%', maxWidth: 900, margin: '18px auto 28px auto', padding: 24 }}>
              <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start', width: '100%' }}>
                {/* First row: Type, Contact, Date, Buttons */}
                <div style={{ display: 'flex', gap: 18, width: '100%', alignItems: 'flex-end' }}>
                  <select value={newTask.type} onChange={e => setNewTask(t => ({ ...t, type: e.target.value }))} style={{ ...inputStyle, width: 130, marginBottom: 0 }}>
                    <option value="Phone Call">Phone Call</option>
                    <option value="Email">Email</option>
                    <option value="In Person Visit">In Person Visit</option>
                    <option value="Other">Other</option>
                  </select>
                  <select
                    value={newTask.contactId || ''}
                    onChange={e => setNewTask(t => ({ ...t, contactId: e.target.value }))}
                    style={{ minWidth: 120, maxWidth: 220, width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc', fontSize: 15, marginRight: 12 }}
                    required
                  >
                    <option value="">Assign Contact</option>
                    {contacts
                      .slice()
                      .sort((a, b) => {
                        const nameA = (a.firstName + ' ' + a.lastName).toLowerCase();
                        const nameB = (b.firstName + ' ' + b.lastName).toLowerCase();
                        return nameA.localeCompare(nameB);
                      })
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.firstName} {c.lastName} {c.email ? `(${c.email})` : ''}
                        </option>
                      ))}
                  </select>
                  <input type="date" value={newTask.dueDate} onChange={e => setNewTask(t => ({ ...t, dueDate: e.target.value }))} style={{ ...inputStyle, width: 120, marginBottom: 0 }} required />
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    <button type="submit" style={{ ...buttonOutlineStyle, padding: '4px 12px', fontWeight: 600, minWidth: 60, fontSize: 14, height: 32 }}>Save</button>
                    <button type="button" style={{ ...buttonOutlineStyle, padding: '4px 12px', fontSize: 14, height: 32 }} onClick={() => setShowAddTask(false)}>Cancel</button>
                  </div>
                </div>
                {/* Second row: Time, All Day, Notes */}
                <div style={{ display: 'flex', gap: 12, width: '100%', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="time" value={newTask.time || ''} onChange={e => setNewTask(t => ({ ...t, time: e.target.value }))} style={{ ...inputStyle, width: 90, marginBottom: 0 }} disabled={!!newTask.allDay} />
                    <label style={{ fontSize: 14, margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={!!newTask.allDay} onChange={e => setNewTask(t => ({ ...t, allDay: e.target.checked }))} /> All Day
                    </label>
                  </div>
                  <input value={newTask.notes} onChange={e => setNewTask(t => ({ ...t, notes: e.target.value }))} placeholder="Notes" style={{ ...inputStyle, flex: 1, marginBottom: 0, marginRight: 0 }} />
                </div>
              </form>
            </div>
          )}
          {status && <div style={{ color: RBA_GREEN, marginBottom: 12, textAlign: 'center' }}>{status}</div>}
          <div style={{ marginTop: 0 }}>
            {showCalendar ? (
              <div style={{ background: '#f6f6f6', borderRadius: 8, padding: 16, marginBottom: 24, marginRight: 24 }}>
                <Calendar
                  localizer={localizer}
                  events={events}
                  startAccessor="start"
                  endAccessor="end"
                  style={{ height: 500, background: '#fff', borderRadius: 8, marginRight: 24 }}
                  views={['month', 'week', 'day']}
                  view={calendarView}
                  onView={setCalendarView}
                  onSelectEvent={event => {
                    handleEditTaskStart(event.resource);
                    setShowCalendar(false); // Optionally switch to list view for editing
                  }}
                  eventPropGetter={event => {
                    if (event.completed) {
                      return { style: { background: '#e0e0e0', color: '#888', border: '1px solid #bbb' } };
                    }
                    return { style: { background: RBA_GREEN, color: '#fff', border: '1px solid #5BA150' } };
                  }}
                />
              </div>
            ) : (
              <div style={{ background: '#f6f6f6', borderRadius: 8, padding: 16, marginBottom: 24, marginRight: 24 }}>
                {/* Active Tasks List with Pagination */}
                {!showCalendar && (
                  <div style={{ background: '#f6f6f6', borderRadius: 8, padding: 16, marginBottom: 24, marginRight: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <span>Show</span>
                      <select value={activePageSize} onChange={e => { setActivePageSize(Number(e.target.value)); setActivePage(1); }}>
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                      <span>per page</span>
                      {Math.ceil(visibleTasks.length / activePageSize) > 1 && (
                        <>
                          <button onClick={() => setActivePage(p => Math.max(1, p-1))} disabled={activePage === 1}>Prev</button>
                          <span>Page {activePage} of {Math.ceil(visibleTasks.length / activePageSize)}</span>
                          <button onClick={() => setActivePage(p => Math.min(Math.ceil(visibleTasks.length / activePageSize), p+1))} disabled={activePage === Math.ceil(visibleTasks.length / activePageSize)}>Next</button>
                        </>
                      )}
                    </div>
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#f6f6f6', borderRadius: 8 }}>
                        <thead>
                          <tr style={tableHeaderStyle}>
                            <th style={{ ...tableCellStyle, textAlign: 'center' }}>Type</th>
                            <th style={{ ...tableCellStyle, textAlign: 'center' }}>Due Date</th>
                            <th style={{ ...tableCellStyle, textAlign: 'center' }}>Contact</th>
                            <th style={{ ...tableCellStyle, textAlign: 'center', maxWidth: 220 }}>Notes</th>
                            <th style={{ ...tableCellStyle, textAlign: 'center' }}>Completed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleTasks.slice((activePage-1)*activePageSize, activePage*activePageSize).map(task => {
                            const contact = contacts.find(c => c.id === task.contactId);
                            let dueDateStr = '';
                            if (task.dueDate instanceof Date) {
                              dueDateStr = task.dueDate.toLocaleDateString('en-US');
                            } else if (typeof task.dueDate === 'string' && !isNaN(Date.parse(task.dueDate))) {
                              dueDateStr = new Date(task.dueDate).toLocaleDateString('en-US');
                            } else if (task.dueDate && task.dueDate.seconds) {
                              dueDateStr = new Date(task.dueDate.seconds * 1000).toLocaleDateString('en-US');
                            }
                            const isEditing = editingTaskId === task.id;
                            if (isEditing) {
                              return (
                                <React.Fragment key={task.id}>
                                  <tr style={{ borderBottom: '1px solid #e0e0e0', background: '#e6f7ff' }}>
                                    <td colSpan={5} style={{ ...tableCellStyle, padding: 0, background: '#fafdff' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', padding: 20, alignItems: 'center', overflowX: 'hidden' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, width: '100%', justifyContent: 'center' }}>
                                          <div style={{ minWidth: 160 }}>
                                            <label style={{ fontWeight: 600, fontSize: 15 }}>Type</label><br />
                                            <select value={editTaskFields.type} onChange={e => setEditTaskFields(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', padding: 7, borderRadius: 4, border: '1px solid #ccc', fontSize: 15 }}>
                                              <option value="Phone Call">Phone Call</option>
                                              <option value="Email">Email</option>
                                              <option value="In Person Visit">In Person Visit</option>
                                              <option value="Other">Other</option>
                                            </select>
                                          </div>
                                          <div style={{ minWidth: 160 }}>
                                            <label style={{ fontWeight: 600, fontSize: 15 }}>Due Date</label><br />
                                            <input type="date" value={editTaskFields.dueDate} onChange={e => setEditTaskFields(f => ({ ...f, dueDate: e.target.value }))} style={{ width: '100%', padding: 7, borderRadius: 4, border: '1px solid #ccc', fontSize: 15 }} />
                                          </div>
                                          <div style={{ minWidth: 180 }}>
                                            <label style={{ fontWeight: 600, fontSize: 15 }}>Contact</label><br />
                                            <div style={{ padding: '7px 0', fontSize: 15 }}>{contact ? `${contact.firstName} ${contact.lastName}` : ''}</div>
                                          </div>
                                        </div>
                                        <div style={{ width: '100%' }}>
                                          <label style={{ fontWeight: 600, fontSize: 15 }}>Notes</label><br />
                                          <textarea value={editTaskFields.notes} onChange={e => setEditTaskFields(f => ({ ...f, notes: e.target.value }))} style={{ width: '100%', maxWidth: 700, minHeight: 56, padding: 8, borderRadius: 4, border: '1px solid #ccc', resize: 'vertical', fontSize: 15, boxSizing: 'border-box', overflowX: 'hidden' }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 8, flexWrap: 'wrap' }}>
                                          <button style={{ ...buttonOutlineStyle, padding: '7px 24px', fontSize: 15 }} onClick={() => handleEditTaskSave(task.id)}>Save</button>
                                          <button style={{ ...buttonOutlineStyle, padding: '7px 24px', fontSize: 15 }} onClick={handleEditTaskCancel}>Cancel</button>
                                          <button style={{ ...buttonOutlineStyle, padding: '7px 24px', fontSize: 15, color: '#d32f2f', borderColor: '#d32f2f' }} onClick={() => handleDeleteTask(task.id)}>Delete</button>
                                          <button style={{ ...buttonOutlineStyle, padding: '7px 24px', fontSize: 15, color: '#fff', background: RBA_GREEN, borderColor: RBA_GREEN }} onClick={async () => {
                                            await handleComplete(task.id, true);
                                            setEditingTaskId(null);
                                          }}>Complete</button>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                </React.Fragment>
                              );
                            }
                            return (
                              <React.Fragment key={task.id}>
                                <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                                  <td style={{ ...tableCellStyle, textAlign: 'center', verticalAlign: 'middle' }}>{task.type}</td>
                                  <td style={{ ...tableCellStyle, textAlign: 'center', verticalAlign: 'middle' }}>{dueDateStr}</td>
                                  <td style={{ ...tableCellStyle, textAlign: 'center', verticalAlign: 'middle' }}>{contact ? `${contact.firstName} ${contact.lastName}` : ''}</td>
                                  <td style={{ ...tableCellStyle, textAlign: 'center', verticalAlign: 'middle', maxWidth: 220, wordBreak: 'break-word', whiteSpace: 'pre-line' }}>{task.notes}</td>
                                  <td style={{ ...tableCellStyle, textAlign: 'center', verticalAlign: 'middle', minWidth: 120 }}>
                                    <input type="checkbox" checked={!!task.completed} onChange={e => handleComplete(task.id, e.target.checked)} />
                                    {task.completed && <span style={{ color: RBA_GREEN, fontWeight: 600, marginLeft: 6 }}>Completed</span>}
                                    {!task.completed && <button style={{ ...buttonOutlineStyle, marginLeft: 18, padding: '2px 10px', fontSize: 14 }} onClick={() => handleEditTaskStart(task)}>Edit</button>}
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {showTaskModal && selectedTask && editingTaskId == null && (
            <div style={{ ...modalStyle, minWidth: 320 }}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Task Details</h3>
              <div><b>Type:</b> {selectedTask.type}</div>
              <div><b>Due:</b> {selectedTask.dueDate ? (typeof selectedTask.dueDate === 'string' ? selectedTask.dueDate : new Date(selectedTask.dueDate.seconds ? selectedTask.dueDate.seconds * 1000 : selectedTask.dueDate).toLocaleDateString('en-US')) : ''} {selectedTask.allDay ? '(All Day)' : selectedTask.time ? selectedTask.time : ''}</div>
              <div><b>Notes:</b> {selectedTask.notes}</div>
              <div><b>Completed:</b> {selectedTask.completed ? 'Yes' : 'No'}</div>
              <button style={{ ...buttonOutlineStyle, marginTop: 16 }} onClick={() => setShowTaskModal(false)}>Close</button>
            </div>
          )}
          {/* Historical Completed Tasks List with Pagination */}
          {completedTasks.length > 0 && (
            <div style={{ background: '#f6f6f6', borderRadius: 8, padding: 16, marginBottom: 24, marginRight: 24 }}>
              <h3 style={{ margin: '12px 0 16px 0', color: '#888', fontWeight: 600 }}>Historical Completed Tasks</h3>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <span>Show</span>
                <select value={completedPageSize} onChange={e => { setCompletedPageSize(Number(e.target.value)); setCompletedPage(1); }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span>per page</span>
                {Math.ceil(completedTasks.length / completedPageSize) > 1 && (
                  <>
                    <button onClick={() => setCompletedPage(p => Math.max(1, p-1))} disabled={completedPage === 1}>Prev</button>
                    <span>Page {completedPage} of {Math.ceil(completedTasks.length / completedPageSize)}</span>
                    <button onClick={() => setCompletedPage(p => Math.min(Math.ceil(completedTasks.length / completedPageSize), p+1))} disabled={completedPage === Math.ceil(completedTasks.length / completedPageSize)}>Next</button>
                  </>
                )}
              </div>
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#f6f6f6', borderRadius: 8 }}>
                  <thead>
                    <tr style={tableHeaderStyle}>
                      <th style={{ ...tableCellStyle, textAlign: 'center' }}>Type</th>
                      <th style={{ ...tableCellStyle, textAlign: 'center' }}>Due Date</th>
                      <th style={{ ...tableCellStyle, textAlign: 'center' }}>Contact</th>
                      <th style={{ ...tableCellStyle, textAlign: 'center', maxWidth: 220 }}>Notes</th>
                      <th style={{ ...tableCellStyle, textAlign: 'center' }}>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedTasks.slice((completedPage-1)*completedPageSize, completedPage*completedPageSize).map(task => {
                      const contact = contacts.find(c => c.id === task.contactId);
                      let dueDateStr = '';
                      if (task.dueDate instanceof Date) {
                        dueDateStr = task.dueDate.toLocaleDateString('en-US');
                      } else if (typeof task.dueDate === 'string' && !isNaN(Date.parse(task.dueDate))) {
                        dueDateStr = new Date(task.dueDate).toLocaleDateString('en-US');
                      } else if (task.dueDate && task.dueDate.seconds) {
                        dueDateStr = new Date(task.dueDate.seconds * 1000).toLocaleDateString('en-US');
                      }
                      return (
                        <tr key={task.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                          <td style={{ ...tableCellStyle, textAlign: 'center', verticalAlign: 'middle' }}>{task.type}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'center', verticalAlign: 'middle' }}>{dueDateStr}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'center', verticalAlign: 'middle' }}>{contact ? `${contact.firstName} ${contact.lastName}` : ''}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'center', verticalAlign: 'middle', maxWidth: 220, wordBreak: 'break-word', whiteSpace: 'pre-line' }}>{task.notes}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'center', verticalAlign: 'middle' }}>
                            <input type="checkbox" checked={!!task.completed} onChange={e => handleComplete(task.id, e.target.checked)} />
                            {task.completed && <span style={{ color: RBA_GREEN, fontWeight: 600, marginLeft: 6 }}>Completed</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ flex: 1 }} />
    </div>
  );
}
