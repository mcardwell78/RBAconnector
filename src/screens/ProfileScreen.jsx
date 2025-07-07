import React, { useEffect, useState } from 'react';
import { auth } from '../services/firebase';
import { UserProfileService } from '../services/userProfileService';
import { RBA_GREEN, RBA_DARK, RBA_LIGHT } from '../utils/rbaColors';
import { cardStyle, inputStyle, buttonOutlineStyle } from '../utils/sharedStyles';
import logo from './assets/Logo.png';

export default function ProfileScreen() {
  const [profile, setProfile] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [activeTab, setActiveTab] = useState('basic');
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      if (!user) return;
      
      const profileData = await UserProfileService.getUserProfile(user.uid);
      if (profileData) {
        setProfile(profileData);
      } else {
        // Create initial profile if it doesn't exist
        const initialProfile = {
          uid: user.uid,
          email: user.email,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          andersenEmail: user.email,
          title: 'Design Consultant',
          company: 'Renewal by Andersen',
          phone: '',
          bio: `Hello! I'm ${user.firstName || 'your'} ${user.lastName || 'local'} Renewal by Andersen Design Consultant.`,
          calendlyUrl: '',
          showCalendlyOnProfile: true,
          isProfilePublic: true
        };
        setProfile(initialProfile);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      setStatus('Error loading profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }));
    setStatus(''); // Clear status when user makes changes
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus('');

    try {
      await UserProfileService.updateUserProfile(user.uid, profile);
      setStatus('Profile updated successfully! 🎉');
      
      // Update localStorage user data
      const updatedUser = {
        ...user,
        firstName: profile.firstName,
        lastName: profile.lastName,
        name: profile.fullName
      };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
    } catch (error) {
      console.error('Error updating profile:', error);
      setStatus('Error updating profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const copyProfileUrl = () => {
    if (profile.profileUrl) {
      navigator.clipboard.writeText(profile.profileUrl);
      setStatus('Profile URL copied to clipboard! 📋');
    }
  };

  if (loading) {
    return (
      <div style={{ 
        background: RBA_GREEN, 
        minHeight: '100vh', 
        width: '100vw', 
        fontFamily: 'Arial, sans-serif', 
        paddingTop: 112,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: 'white', fontSize: 18 }}>Loading your profile...</div>
      </div>
    );
  }

  const tabStyle = (isActive) => ({
    padding: '12px 24px',
    backgroundColor: isActive ? 'white' : 'transparent',
    color: isActive ? RBA_DARK : '#666',
    border: 'none',
    borderRadius: '8px 8px 0 0',
    cursor: 'pointer',
    fontWeight: isActive ? 'bold' : 'normal',
    marginRight: 4
  });

  return (
    <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ ...cardStyle, marginTop: 32, width: '100%', maxWidth: 800, padding: 0 }}>
        
        {/* Header */}
        <div style={{ padding: 32, borderBottom: '1px solid #eee' }}>
          <img src={logo} alt="DC Power Connector" style={{ display: 'block', margin: '0 auto 16px', height: 60 }} />
          <h1 style={{ textAlign: 'center', color: RBA_DARK, marginBottom: 8 }}>My Profile</h1>
          <p style={{ textAlign: 'center', color: '#666', margin: 0 }}>
            Manage your public profile and contact information
          </p>
        </div>

        {/* Tabs */}
        <div style={{ padding: '0 32px', backgroundColor: RBA_LIGHT }}>
          <button 
            style={tabStyle(activeTab === 'basic')}
            onClick={() => setActiveTab('basic')}
          >
            Basic Info
          </button>
          <button 
            style={tabStyle(activeTab === 'public')}
            onClick={() => setActiveTab('public')}
          >
            Public Profile
          </button>
          <button 
            style={tabStyle(activeTab === 'scheduling')}
            onClick={() => setActiveTab('scheduling')}
          >
            Scheduling
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} style={{ padding: 32 }}>
          
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div>
              <h3 style={{ color: RBA_DARK, marginBottom: 20 }}>Basic Information</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ fontWeight: 'bold', marginBottom: 4, display: 'block' }}>First Name *</label>
                  <input 
                    value={profile.firstName || ''} 
                    onChange={(e) => handleChange('firstName', e.target.value)}
                    style={inputStyle} 
                    required
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 'bold', marginBottom: 4, display: 'block' }}>Last Name *</label>
                  <input 
                    value={profile.lastName || ''} 
                    onChange={(e) => handleChange('lastName', e.target.value)}
                    style={inputStyle} 
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 'bold', marginBottom: 4, display: 'block' }}>Andersen Email</label>
                <input 
                  value={profile.andersenEmail || ''} 
                  style={{ ...inputStyle, backgroundColor: '#f5f5f5' }}
                  disabled 
                />
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  This is your official Andersen Corp email address
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 'bold', marginBottom: 4, display: 'block' }}>Job Title</label>
                <input 
                  value={profile.title || ''} 
                  onChange={(e) => handleChange('title', e.target.value)}
                  style={inputStyle} 
                  placeholder="Design Consultant"
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 'bold', marginBottom: 4, display: 'block' }}>Phone Number</label>
                <input 
                  value={profile.phone || ''} 
                  onChange={(e) => handleChange('phone', e.target.value)}
                  style={inputStyle} 
                  type="tel"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 'bold', marginBottom: 4, display: 'block' }}>Profile Photo URL</label>
                <input 
                  value={profile.profilePhoto || ''} 
                  onChange={(e) => handleChange('profilePhoto', e.target.value)}
                  style={inputStyle} 
                  type="url"
                  placeholder="https://example.com/your-photo.jpg"
                />
                {profile.profilePhoto && (
                  <div style={{ marginTop: 8 }}>
                    <img 
                      src={profile.profilePhoto} 
                      alt="Profile preview"
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid #ddd'
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  Paste a URL to your profile photo (will be displayed as a circle)
                </div>
              </div>
            </div>
          )}

          {/* Public Profile Tab */}
          {activeTab === 'public' && (
            <div>
              <h3 style={{ color: RBA_DARK, marginBottom: 20 }}>Public Profile Settings</h3>
              
              <div style={{ 
                backgroundColor: RBA_LIGHT, 
                padding: 16, 
                borderRadius: 8, 
                marginBottom: 20,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Your Profile URL</div>
                  <div style={{ color: '#666', fontSize: 14 }}>
                    {profile.profileUrl || 'Profile URL will be generated after saving'}
                  </div>
                </div>
                {profile.profileUrl && (
                  <button 
                    type="button"
                    onClick={copyProfileUrl}
                    style={{ 
                      ...buttonOutlineStyle, 
                      padding: '8px 16px', 
                      fontSize: 12 
                    }}
                  >
                    Copy URL
                  </button>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input 
                    type="checkbox"
                    checked={profile.isProfilePublic !== false}
                    onChange={(e) => handleChange('isProfilePublic', e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  <span style={{ fontWeight: 'bold' }}>Make my profile public</span>
                </label>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4, marginLeft: 24 }}>
                  When enabled, anyone with your profile URL can view your contact information
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 'bold', marginBottom: 4, display: 'block' }}>Professional Bio</label>
                <textarea 
                  value={profile.bio || ''} 
                  onChange={(e) => handleChange('bio', e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'inherit', minHeight: 100 }}
                  placeholder="Tell visitors about yourself and your expertise..."
                  rows={4}
                />
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  This will appear on your public profile page
                </div>
              </div>
            </div>
          )}

          {/* Scheduling Tab */}
          {activeTab === 'scheduling' && (
            <div>
              <h3 style={{ color: RBA_DARK, marginBottom: 20 }}>Meeting & Scheduling</h3>
              
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 'bold', marginBottom: 4, display: 'block' }}>Calendly URL</label>
                <input 
                  value={profile.calendlyUrl || ''} 
                  onChange={(e) => handleChange('calendlyUrl', e.target.value)}
                  style={inputStyle} 
                  type="url"
                  placeholder="https://calendly.com/your-username"
                />
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  Visitors can use this to schedule meetings with you directly
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input 
                    type="checkbox"
                    checked={profile.showCalendlyOnProfile !== false}
                    onChange={(e) => handleChange('showCalendlyOnProfile', e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  <span style={{ fontWeight: 'bold' }}>Show scheduling button on profile</span>
                </label>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4, marginLeft: 24 }}>
                  Display a "Schedule a Meeting" button on your public profile
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 'bold', marginBottom: 4, display: 'block' }}>Preferred Contact Method</label>
                <select 
                  value={profile.preferredContactMethod || 'email'} 
                  onChange={(e) => handleChange('preferredContactMethod', e.target.value)}
                  style={inputStyle}
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="calendly">Schedule Meeting</option>
                </select>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ 
            borderTop: '1px solid #eee', 
            paddingTop: 20, 
            marginTop: 32,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              {profile.profileUrl && (
                <a 
                  href={profile.profileUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    color: RBA_GREEN, 
                    textDecoration: 'underline',
                    fontSize: 14
                  }}
                >
                  View Public Profile →
                </a>
              )}
            </div>
            
            <button 
              type="submit" 
              style={{
                ...buttonOutlineStyle,
                backgroundColor: saving ? '#ccc' : buttonOutlineStyle.backgroundColor,
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

          {status && (
            <div style={{ 
              color: status.includes('Error') ? '#ff4444' : RBA_GREEN, 
              marginTop: 16, 
              textAlign: 'center',
              fontWeight: 'bold'
            }}>
              {status}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
