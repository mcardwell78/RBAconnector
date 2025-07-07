import React, { useState } from 'react';
import { auth, db } from '../services/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { createUserWithRole, updateLastLogin, getUserWithRole } from '../services/userRoles';
import logo from './assets/Logo.png';
import { cardStyle, inputStyle, buttonOutlineStyle } from '../utils/sharedStyles';
import { RBA_GREEN } from '../utils/rbaColors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;
      
      // Check if user document exists in Firestore, create if not
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      let userData = {};
      if (!userDoc.exists()) {
        // Create user document with proper role and permissions
        const newUserData = {
          uid: user.uid,
          email: user.email,
          name: user.displayName || user.email.split('@')[0],
          displayName: user.displayName || user.email.split('@')[0]
        };
        
        userData = await createUserWithRole(newUserData);
        console.log('Created user document with role for:', user.email);
      } else {
        userData = await getUserWithRole(user.uid);
        
        // Update last login
        await updateLastLogin(user.uid);
      }
      
      // Store enhanced user info in localStorage for Firestore queries
      localStorage.setItem('user', JSON.stringify({ 
        uid: user.uid, 
        email: user.email,
        name: userData.name || userData.displayName || user.email.split('@')[0],
        role: userData.role,
        isAdmin: userData.isAdmin,
        zohoEmail: userData.zohoEmail,
        permissions: userData.permissions
      }));
      
      console.log(`User logged in with role: ${userData.role}`, {
        isAdmin: userData.isAdmin,
        zohoEmail: userData.zohoEmail,
        permissions: userData.permissions?.length
      });
      
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ ...cardStyle, marginTop: 32, width: '100%', maxWidth: 400, padding: 32 }}>
        <img src={logo} alt="DC Power Connector" style={{ height: 64, display: 'block', margin: '0 auto 24px' }} />
        <p style={{ textAlign: 'center', color: '#5BA150', fontWeight: 600, marginBottom: 24 }}>Renewal by Andersen Design Consultants</p>
        <p style={{ textAlign: 'center', marginBottom: 24 }}>Log in to manage, follow up, and grow your RBA business.</p>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={{ ...inputStyle, marginBottom: 12 }} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={{ ...inputStyle, marginBottom: 12 }} />
          <button type="submit" style={{ ...buttonOutlineStyle, marginTop: 8, width: '90%' }}>Login</button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a href="/register" style={{ color: '#5BA150', textDecoration: 'underline', fontWeight: 600 }}>Create Account</a>
        </div>
        {error && <div style={{ color: 'red', textAlign: 'center', marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}
