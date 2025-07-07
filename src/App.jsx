import React, { useEffect, useState, createContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import DashboardScreen from './screens/DashboardScreen';
import ContactsScreen from './screens/ContactsScreen';
import ContactDetailScreen from './screens/ContactDetailScreen';
import UploadScreen from './screens/UploadScreen';
import Navbar from './components/Navbar';
import PrivateRoute from './components/PrivateRoute';
import { auth } from './services/firebase';
import logo from './screens/assets/Logo.png';
import Footer from './components/Footer';
import CampaignsScreen from './screens/CampaignsScreen';
import EmailTemplatesScreen from './screens/EmailTemplatesScreen';
import AddEmailTemplateScreen from './screens/AddEmailTemplateScreen';
import EditEmailTemplateScreen from './screens/EditEmailTemplateScreen';
import ProfileScreen from './screens/ProfileScreen';
import PublicProfileScreen from './screens/PublicProfileScreen';
import EditContactScreen from './screens/EditContactScreen';
import UnsubscribeScreen from './screens/UnsubscribeScreen';
import AddContactScreen from './screens/AddContactScreen';
import TasksScreen from './screens/TasksScreen';
import AddCampaignScreen from './screens/AddCampaignScreen';
import SettingsScreen from './screens/SettingsScreen';
import ZohoAuthCallback from './screens/ZohoAuthCallback';

export const AuthContext = createContext({ user: null, loading: true });

const RBA_GREEN = '#5BA150';
const RBA_DARK = '#222';
const RBA_LIGHT = '#F6F6F6';

function AppLayout() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(u => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);
  // Hide navbar on login/register/auth callbacks and public profiles
  const hideNavbar = ['/login', '/register', '/auth/zoho-callback'].includes(location.pathname) || 
                     location.pathname.startsWith('/profile/');
  return (
    <AuthContext.Provider value={{ user, loading }}>
      {!hideNavbar && user && <Navbar logo={logo} />}
      <div style={{ background: RBA_LIGHT, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/register" element={<RegisterScreen />} />
            <Route path="/auth/zoho-callback" element={<ZohoAuthCallback />} />
            <Route path="/profile/:slug" element={<PublicProfileScreen />} />
            <Route element={<PrivateRoute user={user} loading={loading} />}>
              <Route path="/dashboard" element={<DashboardScreen />} />
              <Route path="/contacts" element={<ContactsScreen />} />
              <Route path="/contacts/new" element={<AddContactScreen />} />
              <Route path="/contacts/:id" element={<ContactDetailScreen />} />
              <Route path="/contacts/:id/edit" element={<EditContactScreen />} />
              <Route path="/upload" element={<UploadScreen />} />
              <Route path="/campaigns" element={<CampaignsScreen />} />
              <Route path="/campaigns/new" element={<AddCampaignScreen />} />
              <Route path="/email-templates" element={<EmailTemplatesScreen />} />              <Route path="/add-email-template" element={<AddEmailTemplateScreen />} />
              <Route path="/edit-email-template/:id" element={<EditEmailTemplateScreen />} />              <Route path="/profile" element={<ProfileScreen />} />
              <Route path="/unsubscribe" element={<UnsubscribeScreen />} />
              <Route path="/tasks" element={<TasksScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Routes>
        </div>        <Footer />
      </div>
    </AuthContext.Provider>
  );
}

export default function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  );
}
