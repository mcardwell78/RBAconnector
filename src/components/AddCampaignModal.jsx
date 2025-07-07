import React, { useState } from 'react';
import { addCampaign } from '../services/campaigns';
import { getTemplatesSplit } from '../services/email';

const scheduleOptions = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

export default function AddCampaignModal({ isOpen, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplates, setSelectedTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    async function fetchTemplates() {
      const { privateTemplates, publicTemplates } = await getTemplatesSplit();
      // Mark source for UI clarity
      const priv = privateTemplates.map(t => ({ ...t, _source: 'private' }));
      const pub = publicTemplates.map(t => ({ ...t, _source: 'public' }));
      setTemplates([...priv, ...pub]);
    }
    fetchTemplates();
  }, []);

  const handleTemplateSelect = (template) => {
    if (!selectedTemplates.find(t => t.id === template.id)) {
      setSelectedTemplates([...selectedTemplates, { ...template, order: selectedTemplates.length + 1 }]);
    }
  };

  const handleTemplateRemove = (id) => {
    setSelectedTemplates(selectedTemplates.filter(t => t.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await addCampaign({
        name,
        description,
        schedule,
        startDate,
        templates: selectedTemplates.map(t => ({ templateId: t.id, order: t.order })),
      });
      setLoading(false);
      onCreated && onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Add New Campaign</h2>
        <form onSubmit={handleSubmit}>
          <label>Campaign Name
            <input value={name} onChange={e => setName(e.target.value)} required />
          </label>
          <label>Description
            <textarea value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <label>Schedule
            <select value={schedule} onChange={e => setSchedule(e.target.value)}>
              {scheduleOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>
          <label>Start Date
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </label>
          <label>Select Email Templates (in order):
            <div className="template-list">
              {templates.length === 0 && <div>No templates found.</div>}
              {templates.filter(t => t._source === 'private').length > 0 && <div style={{fontWeight:600,marginTop:8}}>Your Templates</div>}
              {templates.filter(t => t._source === 'private').map(t => (
                <div key={t.id}>
                  <button type="button" onClick={() => handleTemplateSelect(t)} disabled={!!selectedTemplates.find(sel => sel.id === t.id)}>
                    {t.name}
                  </button>
                </div>
              ))}
              {templates.filter(t => t._source === 'public').length > 0 && <div style={{fontWeight:600,marginTop:8}}>Public Templates</div>}
              {templates.filter(t => t._source === 'public').map(t => (
                <div key={t.id}>
                  <button type="button" onClick={() => handleTemplateSelect(t)} disabled={!!selectedTemplates.find(sel => sel.id === t.id)}>
                    {t.name}
                  </button>
                </div>
              ))}
            </div>
          </label>
          <div>
            <h4>Selected Templates (drag to reorder):</h4>
            <ul>
              {selectedTemplates.map((t, idx) => (
                <li key={t.id}>
                  {t.name} (Order: {idx + 1})
                  <button type="button" onClick={() => handleTemplateRemove(t.id)}>Remove</button>
                </li>
              ))}
            </ul>
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Campaign'}</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
}
