import React, { useState } from 'react';
import { getTemplatesSplit } from '../services/email';
import logo from '../screens/assets/Logo.png';

const delayUnits = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'quarters', label: 'Quarters' },
  { value: 'custom', label: 'Custom Date/Time' },
];

// UI for building a campaign sequence with drag-and-drop steps
export default function CampaignBuilder({ campaign, onSave, onCancel, onDelete }) {  const [name, setName] = useState(campaign?.name || '');
  const [description, setDescription] = useState(campaign?.description || '');
  const [purpose, setPurpose] = useState(campaign?.purpose || '');
  const [customPurpose, setCustomPurpose] = useState(campaign?.customPurpose || '');
  const [steps, setSteps] = useState(campaign?.steps || []);
  const [templates, setTemplates] = useState([]);
  const [showStepForm, setShowStepForm] = useState(false);
  const [stepType, setStepType] = useState('email');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delayValue, setDelayValue] = useState(1);
  const [delayUnit, setDelayUnit] = useState('days');
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('09:00');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [isPublic, setIsPublic] = useState(campaign?.public || false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editStepIdx, setEditStepIdx] = useState(null);
  // Add a state for default delivery time
  const [defaultDeliveryTime, setDefaultDeliveryTime] = useState(campaign?.defaultDeliveryTime || '09:00');
  const [dropdownFocused, setDropdownFocused] = useState(false);

  // Add a helper to refresh templates
  const refreshTemplates = async () => {
    const { privateTemplates, publicTemplates } = await getTemplatesSplit();
    // Mark source for UI clarity
    const priv = privateTemplates.map(t => ({ ...t, _source: 'private' }));
    const pub = publicTemplates.map(t => ({ ...t, _source: 'public' }));
    setTemplates([...priv, ...pub]);
  };

  React.useEffect(() => {
    refreshTemplates();
    // Check admin status from localStorage (or your auth logic)
    const user = JSON.parse(localStorage.getItem('user'));
    setIsAdmin(user?.isAdmin || false);
  }, []);

  const handleEditStep = (idx) => {
    const step = steps[idx];
    setEditStepIdx(idx);
    setShowStepForm(true);
    setStepType(step.stepType);
    setSelectedTemplate(step.templateId || (step.subject && step.body ? 'custom' : 'select'));
    setSubject(step.subject || '');
    setBody(step.body || '');
    if (step.delay.unit === 'custom') {
      setDelayUnit('custom');
      setCustomDate(step.delay.value || '');
      setCustomTime(step.delay.time || '09:00');
    } else {
      setDelayUnit(step.delay.unit);
      setDelayValue(step.delay.value);
      setCustomDate('');
      setCustomTime('09:00');
    }
    setSaveAsTemplate(false);
  };

  const resetStepForm = () => {
    setStepType('email');
    setSelectedTemplate('');
    setSubject('');
    setBody('');
    setDelayValue(1);
    setDelayUnit('days');
    setCustomDate('');
    setCustomTime('09:00');
    setSaveAsTemplate(false);
  };

  const handleAddStep = () => {
    setShowStepForm(true);
    resetStepForm();
  };

  const handleSaveStep = () => {
    if (stepType === 'email' && !selectedTemplate && (!subject || !body)) return;
    let delay = { value: delayValue, unit: delayUnit };
    if (delayUnit === 'custom') {
      delay = { value: customDate, unit: 'custom', time: customTime };
    }
    // Always ensure subject is set for every step
    let stepSubject = subject;
    if (!stepSubject && selectedTemplate && selectedTemplate !== 'custom') {
      // Try to get subject from template
      const template = templates.find(t => t.id === selectedTemplate);
      stepSubject = template?.subject || template?.name || '(no subject)';
    }
    const newStep = {
      stepType,
      templateId: selectedTemplate || undefined,
      subject: stepSubject || '',
      body: body || undefined,
      delay,
    };
    let newSteps;
    if (editStepIdx !== null) {
      newSteps = steps.map((s, i) => (i === editStepIdx ? newStep : s));
    } else {
      newSteps = [...steps, newStep];
    }
    setSteps(newSteps);
    setShowStepForm(false);
    setEditStepIdx(null);
    resetStepForm();
  };

  // Drag and drop reorder with insert indicator
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const handleDragStart = (idx) => (e) => {
    e.dataTransfer.setData('stepIdx', idx);
  };
  const handleDragOver = (idx) => (e) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop = (idx) => (e) => {
    const fromIdx = parseInt(e.dataTransfer.getData('stepIdx'), 10);
    if (fromIdx === idx || fromIdx === idx - 1) return;
    const newSteps = [...steps];
    const [moved] = newSteps.splice(fromIdx, 1);
    newSteps.splice(idx, 0, moved);
    setSteps(newSteps);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => setDragOverIdx(null);

  const removeStep = (idx) => {
    setSteps(steps.filter((_, i) => i !== idx));
  };

  // Template filter state
  const [templateFilter, setTemplateFilter] = useState('all'); // 'all', 'private', 'public'

  // Sort templates by name within each group
  const getSortedTemplates = (source) => {
    return templates
      .filter(t => t._source === source)
      .sort((a, b) => (a.name || a.subject || '').localeCompare(b.name || b.subject || ''));
  };

  // Move step up/down
  const moveStep = (idx, dir) => {
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === steps.length - 1)) return;
    const newSteps = [...steps];
    const [moved] = newSteps.splice(idx, 1);
    newSteps.splice(idx + dir, 0, moved);
    setSteps(newSteps);
    setEditStepIdx(idx + dir);
  };

  // UI
  return (
    <div className="campaign-builder" style={{ maxWidth: 600, margin: '40px auto', background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px #0001', padding: 32, maxHeight: '80vh', overflowY: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        <img src={logo} alt="DC Power Connector" style={{ height: 96, marginRight: 24 }} />
        <h2 style={{ margin: 0, textAlign: 'left', fontWeight: 700, fontSize: 32 }}> {campaign ? 'Edit' : 'New'} Campaign Sequence</h2>
      </div>      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ fontWeight: 600 }}>Name
          <input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', marginTop: 4, fontFamily: 'Arial, sans-serif', fontSize: 16 }} />
        </label>
        <label style={{ fontWeight: 600 }}>Description
          <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', marginTop: 4, fontFamily: 'Arial, sans-serif', fontSize: 16 }} />
        </label>
        <label style={{ fontWeight: 600 }}>Purpose
          <select value={purpose} onChange={e => setPurpose(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', marginTop: 4, fontFamily: 'Arial, sans-serif', fontSize: 16 }}>
            <option value="">Select Purpose...</option>
            <option value="Keep in Touch - General">Keep in Touch - General</option>
            <option value="Cold Lead - Spark Interest">Cold Lead - Spark Interest</option>
            <option value="Promotion/Special Offer">Promotion/Special Offer</option>
            <option value="New Product/Technology">New Product/Technology</option>
            <option value="Initial Follow-up After Appointment">Initial Follow-up After Appointment</option>
            <option value="First 6 Months Follow-up">First 6 Months Follow-up</option>
            <option value="Win-Back Campaign">Win-Back Campaign</option>
            <option value="Referral Request">Referral Request</option>
            <option value="Seasonal Outreach">Seasonal Outreach</option>
            <option value="Educational Content">Educational Content</option>
            <option value="Custom">Custom</option>
          </select>
        </label>        {purpose === 'Custom' && (
          <label style={{ fontWeight: 600 }}>Custom Purpose (50 chars max)
            <input 
              value={customPurpose} 
              onChange={e => {
                if (e.target.value.length <= 50) {
                  setCustomPurpose(e.target.value);
                }
              }} 
              maxLength={50}
              placeholder="Enter custom purpose..." 
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', marginTop: 4, fontFamily: 'Arial, sans-serif', fontSize: 16 }} 
            />
          </label>
        )}
      </div>
      <div style={{ margin: '24px 0 16px 0' }}>
        {/* Always show public checkbox, allow toggling, and show warning only if public and not admin */}
        <label style={{ fontFamily: 'Arial, sans-serif', fontSize: 16 }}>
          <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} style={{ marginRight: 8 }} />
          Make this campaign public (shared with all users)
        </label>
        {isPublic && !isAdmin && (
          <span style={{ color: '#888', fontSize: 14, fontFamily: 'Arial, sans-serif' }}>This is a public campaign and cannot be edited or deleted after saving.</span>
        )}
        {/* Default delivery time input */}
        <div style={{ marginTop: 16 }}>
          <label style={{ fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16 }}>
            Default Delivery Time (when each step is sent):
            <input
              type="time"
              value={defaultDeliveryTime}
              min="06:00"
              max="20:00"
              step="300"
              onChange={e => setDefaultDeliveryTime(e.target.value)}
              style={{ marginLeft: 8, padding: 6, borderRadius: 4, border: '1px solid #ccc', fontFamily: 'Arial, sans-serif', fontSize: 16 }}
            />
            <span style={{ color: '#888', fontSize: 13, marginLeft: 8 }}>(6am–8pm allowed)</span>
          </label>
        </div>
      </div>
      <div style={{ margin: '32px 0 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontFamily: 'Arial, sans-serif', fontSize: 20 }}>Steps</h3>
        <button onClick={handleAddStep} style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16 }}>Add Step</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, marginBottom: 24 }}>
        {steps.map((step, idx) => (
          <React.Fragment key={idx}>
            {/* Drop zone above */}
            <li
              onDragOver={handleDragOver(idx)}
              onDrop={handleDrop(idx)}
              style={{ height: 8, background: dragOverIdx === idx ? '#b3e5fc' : 'transparent', margin: 0, padding: 0 }}
            />
            <li draggable onDragStart={handleDragStart(idx)} onDragEnd={handleDragEnd}
              style={{ border: '1px solid #ccc', margin: '8px 0', padding: 12, borderRadius: 8, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <b style={{ textTransform: 'capitalize' }}>{step.stepType}</b> - {step.templateId ? `Template: ${templates.find(t => t.id === step.templateId)?.name}` : `${step.subject || ''}`}
                <div style={{ fontSize: 13, color: '#888' }}>
                  Delay: {step.delay.unit === 'custom' ? `${step.delay.value} at ${step.delay.time}` : `${step.delay.value} ${step.delay.unit}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => handleEditStep(idx)} style={{ background: '#2980b9', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px' }}>Edit</button>
                <button type="button" onClick={() => removeStep(idx)} style={{ background: '#c0392b', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px' }}>Remove</button>
              </div>
            </li>
            {/* Render the edit form directly under the step being edited */}
            {showStepForm && editStepIdx === idx && (
              <li style={{ margin: 0, padding: 0 }}>
                {/* Edit Step Form (accordian) */}
                <div style={{ background: '#f6f6f6', borderRadius: 12, padding: 32, marginBottom: 32, boxShadow: '0 1px 6px #0001', fontFamily: 'Arial, sans-serif', marginTop: 24 }}>
                  <h4 style={{ marginTop: 0, fontFamily: 'Arial, sans-serif', fontSize: 18, marginBottom: 24 }}>{editStepIdx !== null ? 'Edit Step' : 'Add Step'}</h4>
                  {editStepIdx !== null && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <button onClick={() => moveStep(editStepIdx, -1)} disabled={editStepIdx === 0} style={{ fontWeight: 600, padding: '4px 12px', borderRadius: 4, border: '1px solid #ccc', background: editStepIdx === 0 ? '#eee' : '#2980b9', color: editStepIdx === 0 ? '#888' : '#fff' }}>Move Up</button>
                      <button onClick={() => moveStep(editStepIdx, 1)} disabled={editStepIdx === steps.length - 1} style={{ fontWeight: 600, padding: '4px 12px', borderRadius: 4, border: '1px solid #ccc', background: editStepIdx === steps.length - 1 ? '#eee' : '#2980b9', color: editStepIdx === steps.length - 1 ? '#888' : '#fff' }}>Move Down</button>
                    </div>
                  )}
                  {/* Template filter buttons */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                    <button onClick={() => setTemplateFilter('all')} style={{ fontWeight: 600, background: templateFilter === 'all' ? '#5BA150' : '#eee', color: templateFilter === 'all' ? '#fff' : '#222', border: 'none', borderRadius: 4, padding: '4px 12px', fontFamily: 'Arial, sans-serif', fontSize: 16 }}>All</button>
                    <button onClick={() => setTemplateFilter('private')} style={{ fontWeight: 600, background: templateFilter === 'private' ? '#5BA150' : '#eee', color: templateFilter === 'private' ? '#fff' : '#222', border: 'none', borderRadius: 4, padding: '4px 12px', fontFamily: 'Arial, sans-serif', fontSize: 16 }}>Your Templates</button>
                    <button onClick={() => setTemplateFilter('public')} style={{ fontWeight: 600, background: templateFilter === 'public' ? '#5BA150' : '#eee', color: templateFilter === 'public' ? '#fff' : '#222', border: 'none', borderRadius: 4, padding: '4px 12px', fontFamily: 'Arial, sans-serif', fontSize: 16 }}>Public</button>
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ fontWeight: 600, marginTop: 12, fontFamily: 'Arial, sans-serif', fontSize: 16, display: 'block', marginBottom: 8 }}>Email Template</label>
                    <select
                      value={selectedTemplate}
                      onChange={e => setSelectedTemplate(e.target.value)}
                      style={{
                        marginLeft: 0,
                        padding: 6,
                        borderRadius: 4,
                        border: '1px solid #ccc',
                        fontWeight: 600,
                        fontSize: 16,
                        width: dropdownFocused ? 350 : 220,
                        transition: 'width 0.2s',
                        boxShadow: dropdownFocused ? '0 0 0 2px #5BA15044' : undefined,
                        fontFamily: 'Arial, sans-serif',
                        display: 'block',
                        marginBottom: 0
                      }}
                      onFocus={() => setDropdownFocused(true)}
                      onBlur={() => setDropdownFocused(false)}
                    >
                      <option value="select">Select One</option>
                      <option value="custom" style={{ fontWeight: 700, fontSize: 16 }}>Custom Email</option>
                      {(templateFilter === 'all' || templateFilter === 'private') && getSortedTemplates('private').length > 0 && (
                        <optgroup label="Your Templates" style={{ fontSize: 16, fontWeight: 700 }}>
                          {getSortedTemplates('private').map(t => <option key={t.id} value={t.id}>{t.name || t.subject || '(No Name)'}</option>)}
                        </optgroup>
                      )}
                      {(templateFilter === 'all' || templateFilter === 'public') && getSortedTemplates('public').length > 0 && (
                        <optgroup label="Public Templates" style={{ fontSize: 16, fontWeight: 700 }}>
                          {getSortedTemplates('public').map(t => <option key={t.id} value={t.id}>{t.name || t.subject || '(No Name)'}</option>)}
                        </optgroup>
                      )}
                    </select>
                    {templates.length === 0 && (
                      <div style={{ color: '#BBA100', fontSize: 13, marginTop: 6, fontFamily: 'Arial, sans-serif' }}>
                        You have no saved templates yet. Create a custom email to add one.
                      </div>
                    )}
                  </div>
                  {/* Move Subject label/input to a new row below Email Template selection, with extra spacing */}
                  {selectedTemplate === 'custom' && (
                    <>
                      <div style={{ marginBottom: 20 }}>
                        <label style={{ fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16, display: 'block', marginBottom: 8 }}>Subject</label>
                        <input value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', fontFamily: 'Arial, sans-serif', fontSize: 16, marginBottom: 0 }} />
                      </div>
                      <div style={{ marginBottom: 20 }}>
                        <label style={{ fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16, display: 'block', marginBottom: 8 }}>Body</label>
                        <textarea value={body} onChange={e => setBody(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', fontFamily: 'Arial, sans-serif', fontSize: 16, minHeight: 80 }} />
                      </div>
                      {/* Mail merge fields */}
                      <div style={{ marginTop: 8, marginBottom: 24, fontFamily: 'Arial, sans-serif' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>Mail Merge Fields: </span>
                        {[{label:'First Name',value:'{{firstName}}'},{label:'Last Name',value:'{{lastName}}'},{label:'Quote Amount',value:'{{quoteAmount}}'},{label:'Rep Name',value:'{{repName}}'},{label:'Appointment Date',value:'{{appointmentDate}}'},{label:'Last Contact Date',value:'{{lastContacted}}'},{label:'Signature',value:'{{signature}}'},{label:'Unsubscribe',value:'{{unsubscribeLink}}'},{label:'Current Promotion',value:'{{currentPromotion}}'}].map(f => (
                          <button
                            key={f.value}
                            type="button"
                            onClick={() => {
                              const textarea = document.querySelector('textarea');
                              if (textarea) {
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const newBody = body.slice(0, start) + f.value + body.slice(end);
                                setBody(newBody);
                                setTimeout(() => {
                                  textarea.focus();
                                  textarea.selectionStart = textarea.selectionEnd = start + f.value.length;
                                }, 0);
                              }
                            }}
                            style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', marginRight: 6, marginTop: 4, fontSize: 13, fontFamily: 'Arial, sans-serif' }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 16 }}>
                    <label style={{ fontWeight: 600 }}>Delay until next step
                      <input type="number" min="1" value={delayValue} onChange={e => setDelayValue(Number(e.target.value))} style={{ width: 60, marginLeft: 8, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                    </label>
                    <select value={delayUnit} onChange={e => setDelayUnit(e.target.value)} style={{ padding: 6, borderRadius: 4, border: '1px solid #ccc' }}>
                      {delayUnits.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                    {delayUnit === 'custom' && (
                      <>
                        <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} style={{ marginLeft: 8, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                        <input type="time" value={customTime} min="09:00" max="20:00" onChange={e => setCustomTime(e.target.value)} style={{ marginLeft: 8, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                        <span style={{ color: '#888', fontSize: 13, marginLeft: 8 }}>(9am–8pm allowed)</span>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <button
                      onClick={async () => {
                        // Always save as template if custom email
                        if (selectedTemplate === 'custom' && subject && body) {
                          const user = JSON.parse(localStorage.getItem('user'));
                          await import('../services/email').then(mod => mod.addEmailTemplate({ name: subject, subject, body, userId: user?.uid || null, createdAt: new Date() }));
                          await refreshTemplates(); // Refresh templates after saving
                        }
                        handleSaveStep();
                      }}
                      style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16 }}
                      disabled={selectedTemplate === 'select' || (selectedTemplate === 'custom' && (!subject || !body))}
                    >{editStepIdx !== null ? 'Save Changes' : 'Save Step'}</button>
                    <button onClick={() => { setShowStepForm(false); setEditStepIdx(null); }} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16 }}>Cancel</button>
                  </div>
                </div>
              </li>
            )}
          </React.Fragment>
        ))}
        {/* Drop zone at end */}
        <li
          onDragOver={handleDragOver(steps.length)}
          onDrop={handleDrop(steps.length)}
          style={{ height: 8, background: dragOverIdx === steps.length ? '#b3e5fc' : 'transparent', margin: 0, padding: 0 }}
        />        {/* If adding a new step, show the add form at the bottom */}
        {showStepForm && editStepIdx === null && (
          <li style={{ margin: 0, padding: 0 }}>
            <div style={{ background: '#f6f6f6', borderRadius: 12, padding: 32, marginBottom: 32, boxShadow: '0 1px 6px #0001', fontFamily: 'Arial, sans-serif', marginTop: 24 }}>
              <h4 style={{ marginTop: 0, fontFamily: 'Arial, sans-serif', fontSize: 18, marginBottom: 24 }}>Add Step</h4>
              {/* Template filter buttons */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <button onClick={() => setTemplateFilter('all')} style={{ fontWeight: 600, background: templateFilter === 'all' ? '#5BA150' : '#eee', color: templateFilter === 'all' ? '#fff' : '#222', border: 'none', borderRadius: 4, padding: '4px 12px', fontFamily: 'Arial, sans-serif', fontSize: 16 }}>All</button>
                <button onClick={() => setTemplateFilter('private')} style={{ fontWeight: 600, background: templateFilter === 'private' ? '#5BA150' : '#eee', color: templateFilter === 'private' ? '#fff' : '#222', border: 'none', borderRadius: 4, padding: '4px 12px', fontFamily: 'Arial, sans-serif', fontSize: 16 }}>Your Templates</button>
                <button onClick={() => setTemplateFilter('public')} style={{ fontWeight: 600, background: templateFilter === 'public' ? '#5BA150' : '#eee', color: templateFilter === 'public' ? '#fff' : '#222', border: 'none', borderRadius: 4, padding: '4px 12px', fontFamily: 'Arial, sans-serif', fontSize: 16 }}>Public</button>
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontWeight: 600, marginTop: 12, fontFamily: 'Arial, sans-serif', fontSize: 16, display: 'block', marginBottom: 8 }}>Email Template</label>
                <select
                  value={selectedTemplate}
                  onChange={e => setSelectedTemplate(e.target.value)}
                  style={{
                    marginLeft: 0,
                    padding: 6,
                    borderRadius: 4,
                    border: '1px solid #ccc',
                    fontWeight: 600,
                    fontSize: 16,
                    width: dropdownFocused ? 350 : 220,
                    transition: 'width 0.2s',
                    boxShadow: dropdownFocused ? '0 0 0 2px #5BA15044' : undefined,
                    fontFamily: 'Arial, sans-serif',
                    display: 'block',
                    marginBottom: 0
                  }}
                  onFocus={() => setDropdownFocused(true)}
                  onBlur={() => setDropdownFocused(false)}
                >
                  <option value="select">Select One</option>
                  <option value="custom" style={{ fontWeight: 700, fontSize: 16 }}>Custom Email</option>
                  {(templateFilter === 'all' || templateFilter === 'private') && getSortedTemplates('private').length > 0 && (
                    <optgroup label="Your Templates" style={{ fontSize: 16, fontWeight: 700 }}>
                      {getSortedTemplates('private').map(t => <option key={t.id} value={t.id}>{t.name || t.subject || '(No Name)'}</option>)}
                    </optgroup>
                  )}
                  {(templateFilter === 'all' || templateFilter === 'public') && getSortedTemplates('public').length > 0 && (
                    <optgroup label="Public Templates" style={{ fontSize: 16, fontWeight: 700 }}>
                      {getSortedTemplates('public').map(t => <option key={t.id} value={t.id}>{t.name || t.subject || '(No Name)'}</option>)}
                    </optgroup>
                  )}
                </select>
                {templates.length === 0 && (
                  <div style={{ color: '#BBA100', fontSize: 13, marginTop: 6, fontFamily: 'Arial, sans-serif' }}>
                    You have no saved templates yet. Create a custom email to add one.
                  </div>
                )}
              </div>
              {/* Move Subject label/input to a new row below Email Template selection, with extra spacing */}
              {selectedTemplate === 'custom' && (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16, display: 'block', marginBottom: 8 }}>Subject</label>
                    <input value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', fontFamily: 'Arial, sans-serif', fontSize: 16, marginBottom: 0 }} />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16, display: 'block', marginBottom: 8 }}>Body</label>
                    <textarea value={body} onChange={e => setBody(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', fontFamily: 'Arial, sans-serif', fontSize: 16, minHeight: 80 }} />
                  </div>
                  {/* Mail merge fields */}
                  <div style={{ marginTop: 8, marginBottom: 24, fontFamily: 'Arial, sans-serif' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Mail Merge Fields: </span>
                    {[{label:'First Name',value:'{{firstName}}'},{label:'Last Name',value:'{{lastName}}'},{label:'Quote Amount',value:'{{quoteAmount}}'},{label:'Rep Name',value:'{{repName}}'},{label:'Appointment Date',value:'{{appointmentDate}}'},{label:'Last Contact Date',value:'{{lastContacted}}'},{label:'Signature',value:'{{signature}}'},{label:'Unsubscribe',value:'{{unsubscribeLink}}'},{label:'Current Promotion',value:'{{currentPromotion}}'}].map(f => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => {
                          const textarea = document.querySelector('textarea');
                          if (textarea) {
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;
                            const newBody = body.slice(0, start) + f.value + body.slice(end);
                            setBody(newBody);
                            setTimeout(() => {
                              textarea.focus();
                              textarea.selectionStart = textarea.selectionEnd = start + f.value.length;
                            }, 0);
                          }
                        }}
                        style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', marginRight: 6, marginTop: 4, fontSize: 13, fontFamily: 'Arial, sans-serif' }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 16 }}>
                <label style={{ fontWeight: 600 }}>Delay until next step
                  <input type="number" min="1" value={delayValue} onChange={e => setDelayValue(Number(e.target.value))} style={{ width: 60, marginLeft: 8, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                </label>
                <select value={delayUnit} onChange={e => setDelayUnit(e.target.value)} style={{ padding: 6, borderRadius: 4, border: '1px solid #ccc' }}>
                  {delayUnits.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
                {delayUnit === 'custom' && (
                  <>
                    <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} style={{ marginLeft: 8, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                    <input type="time" value={customTime} min="09:00" max="20:00" onChange={e => setCustomTime(e.target.value)} style={{ marginLeft: 8, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                    <span style={{ color: '#888', fontSize: 13, marginLeft: 8 }}>(9am–8pm allowed)</span>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button
                  onClick={async () => {
                    // Always save as template if custom email
                    if (selectedTemplate === 'custom' && subject && body) {
                      const user = JSON.parse(localStorage.getItem('user'));
                      await import('../services/email').then(mod => mod.addEmailTemplate({ name: subject, subject, body, userId: user?.uid || null, createdAt: new Date() }));
                      await refreshTemplates(); // Refresh templates after saving
                    }
                    handleSaveStep();
                  }}
                  style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16 }}
                  disabled={selectedTemplate === 'select' || (selectedTemplate === 'custom' && (!subject || !body))}
                >Save Step</button>
                <button onClick={() => { setShowStepForm(false); setEditStepIdx(null); }} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16 }}>Cancel</button>
              </div>
            </div>
          </li>
        )}
      </ul>
      <div style={{ display: 'flex', gap: 16, marginTop: 32, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16 }}>Cancel</button>
        {/* Always show Save button, even if public is checked, so user can save/toggle */}
        <button
          onClick={() => onSave({ 
            name, 
            description, 
            purpose: purpose === 'Custom' ? customPurpose : purpose,
            steps, 
            public: isPublic, 
            defaultDeliveryTime 
          })}
          style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16 }}
          disabled={!name || steps.length === 0}
        >Save Campaign</button>
        {campaign && campaign.id && (!isPublic || isAdmin) && (
          <button
            onClick={async () => {
              if (window.confirm('Are you sure you want to delete this campaign? This cannot be undone.')) {
                await onDelete(campaign.id);
              }
            }}
            style={{ background: '#d9534f', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600, fontFamily: 'Arial, sans-serif', fontSize: 16 }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
