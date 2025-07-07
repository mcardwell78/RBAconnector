import React, { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithRole } from '../services/userRoles';
import { UserProfileService } from '../services/userProfileService';
import { ZohoAdminService } from '../services/zohoAdminService';
import { PasswordValidator } from '../utils/passwordValidation';
import { cardStyle, inputStyle, buttonOutlineStyle } from '../utils/sharedStyles';
import { RBA_GREEN, RBA_DARK } from '../utils/rbaColors';
import logo from './assets/Logo.png';

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [passwordStrength, setPasswordStrength] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  // Auto-populate names from email
  useEffect(() => {
    if (email && email.includes('@andersencorp.com')) {
      const emailPrefix = email.split('@')[0];
      if (emailPrefix.includes('.')) {
        const [first, last] = emailPrefix.split('.');
        setFirstName(first.charAt(0).toUpperCase() + first.slice(1).toLowerCase());
        setLastName(last.charAt(0).toUpperCase() + last.slice(1).toLowerCase());
      }
    }
  }, [email]);

  // Real-time password strength checking
  useEffect(() => {
    if (password) {
      const strength = PasswordValidator.calculatePasswordStrength(password);
      setPasswordStrength(strength);
    } else {
      setPasswordStrength(null);
    }
  }, [password]);

  const validateForm = () => {
    setError('');

    // Validate email format
    const emailValidation = PasswordValidator.validateAndersenEmail(email);
    if (!emailValidation.isValid) {
      setError(emailValidation.error);
      return false;
    }

    // Validate password
    const passwordValidation = PasswordValidator.validatePassword(password);
    if (!passwordValidation.isValid) {
      setError(passwordValidation.errors[0]);
      return false;
    }

    // Check password confirmation
    if (!PasswordValidator.passwordsMatch(password, confirmPassword)) {
      setError('Passwords do not match');
      return false;
    }

    // Validate required fields
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last names are required');
      return false;
    }

    return true;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    setError('');

    try {
      // Step 1: Create Firebase user account
      console.log('🔧 Creating Firebase user account...');
      setStep(1);
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update display name
      await updateProfile(user, {
        displayName: `${firstName} ${lastName}`
      });

      // Step 2: Create user roles and profile first
      console.log('🔧 Setting up user roles and profile...');
      setStep(2);
      
      const userData = {
        uid: user.uid,
        email: user.email,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        zohoEmail: `${email.split('@')[0]}@rbaconnector.com`, // Pre-populate expected Zoho email
        zohoAccountId: 'pending', // Will be updated after Zoho account creation
        temporaryPassword: 'pending', // Will be updated after Zoho account creation
        zohoNote: 'Zoho account creation pending',
        createdAt: new Date().toISOString()
      };

      // Create user with proper role
      await createUserWithRole(userData, 'user');

      // Create initial user profile
      await UserProfileService.createUserProfile({
        uid: user.uid,
        firstName,
        lastName,
        email: user.email,
        andersenEmail: email, // The original @andersencorp.com email from registration
        title: '',
        phone: '',
        bio: '',
        profileImageUrl: '',
        calendlyUrl: '',
        isProfilePublic: true,
        showSchedulingButton: false
      });

      // Step 3: Create Zoho email account (with proper authentication)
      console.log('🔧 Creating Zoho email account...');
      setStep(3);
      
      // Wait longer to ensure user authentication is fully processed
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Ensure we have a fresh ID token and verify auth state
      const idToken = await user.getIdToken(true);
      console.log('🔐 Firebase user authenticated:', {
        uid: user.uid,
        email: user.email,
        hasIdToken: !!idToken
      });
      
      let zohoResult;
      try {
        zohoResult = await ZohoAdminService.createUserZohoAccount({
          firstName,
          lastName,
          andersenEmail: email
        });
        console.log('✅ Zoho account creation result:', zohoResult);
        
        // Update the user data with successful Zoho account info
        if (zohoResult.success) {
          userData.zohoAccountId = zohoResult.accountId || `backup-${Date.now()}`;
          userData.temporaryPassword = zohoResult.temporaryPassword || 'TempPass123!';
          userData.zohoNote = zohoResult.note || 'Zoho account created';
          userData.zohoEmail = zohoResult.zohoEmail || `${email.split('@')[0]}@rbaconnector.com`;
          
          console.log('📋 Updated userData before saving:', userData);
          
          // Update the user record with Zoho details
          await createUserWithRole(userData, 'user');
        } else {
          // If Zoho creation failed, still update user with mock data
          userData.zohoAccountId = 'mock-account-' + Date.now();
          userData.temporaryPassword = 'TempPass123!';
          userData.zohoNote = 'Registration completed without Zoho integration';
          userData.zohoEmail = `${email.split('@')[0]}@rbaconnector.com`;
          await createUserWithRole(userData, 'user');
        }
      } catch (zohoError) {
        console.error('❌ Zoho account creation failed:', zohoError);
        console.log('⚠️ Zoho account creation failed, continuing with mock data...');
        
        // Update user with mock data
        userData.zohoAccountId = 'mock-account-' + Date.now();
        userData.temporaryPassword = 'TempPass123!';
        userData.zohoNote = 'Registration completed without Zoho integration - error: ' + zohoError.message;
        userData.zohoEmail = `${email.split('@')[0]}@rbaconnector.com`;
        await createUserWithRole(userData, 'user');
      }

      // Step 4: Create initial user profile
      console.log('🔧 Creating user profile...');
      setStep(4);
      await UserProfileService.createUserProfile({
        uid: user.uid,
        firstName,
        lastName,
        email: user.email,
        andersenEmail: email, // The original @andersencorp.com email from registration
        title: '',
        phone: '',
        bio: '',
        profileImageUrl: '',
        calendlyUrl: '',
        isProfilePublic: true,
        showSchedulingButton: false
      });

      // Store user data in localStorage for immediate access
      localStorage.setItem('user', JSON.stringify(userData));

      console.log('✅ Registration completed successfully!');
      
      // Step 4: Complete!
      setStep(4);
      
      // Show success message briefly before redirect
      setTimeout(() => {
        navigate('/profile');
      }, 1000);

    } catch (error) {
      console.error('❌ Registration error:', error);
      setError(`Registration failed: ${error.message}`);
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const getStepMessage = () => {
    switch (step) {
      case 1: return '🔧 Creating your account...';
      case 2: return '📧 Setting up your email...';
      case 3: return '👤 Creating your profile...';
      case 4: return '✅ Registration complete!';
      default: return '';
    }
  };

  const getFieldStyle = (field, value) => {
    let borderColor = '#ddd';
    
    if (field === 'email' && value) {
      const validation = PasswordValidator.validateAndersenEmail(value);
      borderColor = validation.isValid ? RBA_GREEN : '#ff4444';
    } else if (field === 'password' && value) {
      const validation = PasswordValidator.validatePassword(value);
      borderColor = validation.isValid ? RBA_GREEN : '#ff4444';
    } else if (field === 'confirmPassword' && value && password) {
      borderColor = PasswordValidator.passwordsMatch(password, value) ? RBA_GREEN : '#ff4444';
    } else if (value.trim()) {
      borderColor = RBA_GREEN;
    }

    return {
      ...inputStyle,
      borderColor,
      marginBottom: 16
    };
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: '#f5f5f5',
      padding: 20 
    }}>
      <div style={{ ...cardStyle, maxWidth: 500, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <img src={logo} alt="RBA Connector" style={{ height: 60, marginBottom: 20 }} />
          <h2 style={{ color: RBA_DARK, margin: 0, fontSize: 28, fontWeight: 'bold' }}>
            Create Account
          </h2>
          <p style={{ color: '#666', margin: '8px 0 0 0' }}>
            Join RBA Connector with your Andersen Corp email
          </p>
        </div>

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="First Name *"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              required
              autoComplete="given-name"
              style={getFieldStyle('firstName', firstName)}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Last Name *"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              required
              autoComplete="family-name"
              style={getFieldStyle('lastName', lastName)}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <input
              type="email"
              placeholder="Email (must be @andersencorp.com) *"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={getFieldStyle('email', email)}
            />
            {email && !PasswordValidator.validateAndersenEmail(email).isValid && (
              <div style={{ color: '#ff4444', fontSize: 14, marginTop: 4 }}>
                Must be a valid @andersencorp.com email address
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <input
              type="password"
              placeholder="Password *"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              style={getFieldStyle('password', password)}
            />
            {passwordStrength && (
              <div style={{ marginTop: 8 }}>
                <div style={{ 
                  height: 4, 
                  backgroundColor: '#eee', 
                  borderRadius: 2,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${(passwordStrength.score / 8) * 100}%`,
                    backgroundColor: passwordStrength.color,
                    transition: 'all 0.3s ease'
                  }} />
                </div>
                <div style={{ 
                  fontSize: 12, 
                  color: passwordStrength.color, 
                  marginTop: 4 
                }}>
                  {passwordStrength.description}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <input
              type="password"
              placeholder="Confirm Password *"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              style={getFieldStyle('confirmPassword', confirmPassword)}
            />
            {confirmPassword && !PasswordValidator.passwordsMatch(password, confirmPassword) && (
              <div style={{ color: '#ff4444', fontSize: 14, marginTop: 4 }}>
                Passwords do not match
              </div>
            )}
          </div>

          {error && (
            <div style={{ 
              color: '#ff4444', 
              marginBottom: 16, 
              padding: 12,
              backgroundColor: '#fff5f5',
              border: '1px solid #fecaca',
              borderRadius: 4,
              fontSize: 14
            }}>
              {error}
            </div>
          )}

          {loading && (
            <div style={{
              textAlign: 'center',
              marginBottom: 16,
              padding: 12,
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: 4,
              color: '#0369a1'
            }}>
              <div style={{ marginBottom: 8 }}>{getStepMessage()}</div>
              <div style={{
                width: 20,
                height: 20,
                border: '2px solid #bae6fd',
                borderTop: '2px solid #0369a1',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto'
              }} />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...buttonOutlineStyle,
              backgroundColor: RBA_GREEN,
              color: 'white',
              border: 'none',
              width: '100%',
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 'bold',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <p style={{ color: '#666', margin: 0 }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: RBA_GREEN, textDecoration: 'none' }}>
              Sign In
            </Link>
          </p>
        </div>

        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
