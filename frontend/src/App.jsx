import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { useApi } from './hooks/useApi.js';
import Layout from './components/Layout.jsx';
import SetupWizard from './components/SetupWizard.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import ItemPage from './pages/ItemPage.jsx';
import ReaderPage from './pages/ReaderPage.jsx';
import UploadsPage from './pages/UploadsPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import CampaignListPage from './pages/CampaignListPage.jsx';
import CampaignPage from './pages/CampaignPage.jsx';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  const { get }  = useApi();
  const [setupNeeded,  setSetupNeeded]  = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);

  // Check on login whether setup wizard needs to show
  useEffect(() => {
    if (!user || user.role !== 'admin') { setSetupChecked(true); return; }
    get('/admin/settings')
      .then(settings => {
        setSetupNeeded(settings['library.setup_complete'] !== 'true');
      })
      .catch(() => {})
      .finally(() => setSetupChecked(true));
  }, [user?.id]);

  if (!setupChecked && user) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" />
    </div>
  );

  return (
    <>
      {setupNeeded && user?.role === 'admin' && (
        <SetupWizard onComplete={() => setSetupNeeded(false)} />
      )}
      <Routes>
        <Route path="/login"    element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/read/:id" element={<ProtectedRoute><ReaderPage /></ProtectedRoute>} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<LibraryPage />} />
          <Route path="/item/:id"       element={<ItemPage />} />
          <Route path="/uploads"        element={<UploadsPage />} />
          <Route path="/admin"          element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
          <Route path="/campaigns"      element={<CampaignListPage />} />
          <Route path="/campaigns/:id"  element={<CampaignPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
