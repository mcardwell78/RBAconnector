import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { UserProfileService } from '../services/userProfileService';
import { RBA_GREEN, RBA_DARK, RBA_LIGHT } from '../utils/rbaColors';

export default function PublicProfileScreen() {
  const { slug } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sharedContent, setSharedContent] = useState(null);

  useEffect(() => {
    loadProfile();
  }, [slug]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      
      // Load user profile by slug
      const profileData = await UserProfileService.getProfileBySlug(slug);
      
      if (!profileData) {
        setError('Profile not found');
        return;
      }

      // Check if profile is public
      if (!profileData.isProfilePublic) {
        setError('This profile is private');
        return;
      }

      setProfile(profileData);

      // Load shared promotional content
      const contentData = await UserProfileService.getSharedContent();
      setSharedContent(contentData);

      // Track profile view
      await UserProfileService.trackProfileView(profileData.uid, {
        timestamp: new Date(),
        userAgent: navigator.userAgent,
        referrer: document.referrer
      });

    } catch (err) {
      console.error('Error loading profile:', err);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleCalendlyClick = () => {
    if (profile?.calendlyUrl) {
      window.open(profile.calendlyUrl, '_blank');
      
      // Track calendly click
      UserProfileService.trackProfileAction(profile.uid, {
        action: 'calendly_click',
        timestamp: new Date()
      });
    }
  };

  const handleContactClick = (method) => {
    // Track contact method click
    UserProfileService.trackProfileAction(profile.uid, {
      action: `contact_${method}`,
      timestamp: new Date()
    });
  };

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: RBA_LIGHT
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: RBA_DARK, marginBottom: 8 }}>Loading profile...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: RBA_LIGHT
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, color: RBA_DARK, marginBottom: 16 }}>😕</div>
          <div style={{ fontSize: 18, color: RBA_DARK, marginBottom: 8 }}>{error}</div>
          <div style={{ fontSize: 14, color: '#666' }}>The profile you're looking for might have been moved or made private.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: RBA_LIGHT }}>
      {/* Header Section */}
      <div style={{ 
        background: `linear-gradient(135deg, ${RBA_GREEN} 0%, #4a8b3a 100%)`,
        padding: '60px 20px',
        textAlign: 'center',
        color: 'white'
      }}>
        {profile.profilePhoto && (
          <img 
            src={profile.profilePhoto} 
            alt={profile.fullName}
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              border: '4px solid white',
              marginBottom: 20,
              objectFit: 'cover',
              boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
            }}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        )}
        {!profile.profilePhoto && (
          <div style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            border: '4px solid white',
            marginBottom: 20,
            backgroundColor: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 48,
            color: 'white'
          }}>
            {profile.firstName?.[0]}{profile.lastName?.[0]}
          </div>
        )}
        <h1 style={{ fontSize: 36, fontWeight: 'bold', margin: '0 0 8px 0' }}>
          {profile.fullName}
        </h1>
        <div style={{ fontSize: 18, opacity: 0.9, marginBottom: 4 }}>
          {profile.title}
        </div>
        <div style={{ fontSize: 16, opacity: 0.8 }}>
          {profile.company}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
        
        {/* Bio Section */}
        {profile.bio && (
          <div style={{ 
            backgroundColor: 'white',
            padding: 30,
            borderRadius: 8,
            marginBottom: 30,
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ color: RBA_DARK, marginBottom: 16, fontSize: 24 }}>About Me</h2>
            <p style={{ 
              color: '#555', 
              lineHeight: 1.6, 
              fontSize: 16,
              margin: 0
            }}>
              {profile.bio}
            </p>
          </div>
        )}

        {/* Contact & Scheduling Section */}
        <div style={{ 
          backgroundColor: 'white',
          padding: 30,
          borderRadius: 8,
          marginBottom: 30,
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ color: RBA_DARK, marginBottom: 20, fontSize: 24 }}>Get In Touch</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            
            {/* Email Contact */}
            {profile.andersenEmail && (
              <a 
                href={`mailto:${profile.andersenEmail}`}
                onClick={() => handleContactClick('email')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 16,
                  backgroundColor: RBA_LIGHT,
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: RBA_DARK,
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#e8e8e8'}
                onMouseLeave={(e) => e.target.style.backgroundColor = RBA_LIGHT}
              >
                <span style={{ fontSize: 20, marginRight: 10 }}>📧</span>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 14 }}>Email Me</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{profile.andersenEmail}</div>
                </div>
              </a>
            )}

            {/* Phone Contact */}
            {profile.phone && (
              <a 
                href={`tel:${profile.phone}`}
                onClick={() => handleContactClick('phone')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 16,
                  backgroundColor: RBA_LIGHT,
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: RBA_DARK,
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#e8e8e8'}
                onMouseLeave={(e) => e.target.style.backgroundColor = RBA_LIGHT}
              >
                <span style={{ fontSize: 20, marginRight: 10 }}>📞</span>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 14 }}>Call Me</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{profile.phone}</div>
                </div>
              </a>
            )}

            {/* Calendly Scheduling */}
            {profile.calendlyUrl && profile.showCalendlyOnProfile && (
              <button 
                onClick={handleCalendlyClick}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 16,
                  backgroundColor: RBA_GREEN,
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  textDecoration: 'none',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#4a8b3a'}
                onMouseLeave={(e) => e.target.style.backgroundColor = RBA_GREEN}
              >
                <span style={{ fontSize: 20, marginRight: 10 }}>📅</span>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 14 }}>Schedule a Meeting</div>
                  <div style={{ fontSize: 12, opacity: 0.9 }}>Book time with me</div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Shared Promotional Content */}
        {sharedContent && sharedContent.blocks && sharedContent.blocks.length > 0 && (
          <div>
            {sharedContent.blocks.map((block, index) => (
              <div key={index} style={{ 
                backgroundColor: 'white',
                padding: 30,
                borderRadius: 8,
                marginBottom: 30,
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
              }}>
                {block.title && (
                  <h2 style={{ color: RBA_DARK, marginBottom: 16, fontSize: 24 }}>
                    {block.title}
                  </h2>
                )}
                {block.content && (
                  <div style={{ 
                    color: '#555', 
                    lineHeight: 1.6, 
                    fontSize: 16
                  }}>
                    {block.content.split('\n').map((paragraph, pIndex) => (
                      <p key={pIndex} style={{ marginBottom: 12 }}>
                        {paragraph}
                      </p>
                    ))}
                  </div>
                )}
                {block.imageUrl && (
                  <img 
                    src={block.imageUrl} 
                    alt={block.title}
                    style={{
                      width: '100%',
                      maxHeight: 300,
                      objectFit: 'cover',
                      borderRadius: 6,
                      marginTop: 16
                    }}
                  />
                )}
                {block.buttonText && block.buttonUrl && (
                  <a 
                    href={block.buttonUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      marginTop: 16,
                      padding: '12px 24px',
                      backgroundColor: RBA_GREEN,
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: 6,
                      fontWeight: 'bold',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#4a8b3a'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = RBA_GREEN}
                  >
                    {block.buttonText}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ 
        backgroundColor: RBA_DARK,
        color: 'white',
        padding: '40px 20px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          Powered by Renewal by Andersen
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Quality windows and doors since 1903
        </div>
      </div>
    </div>
  );
}
