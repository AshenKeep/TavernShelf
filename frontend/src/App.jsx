import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { useApi } from './hooks/useApi.js';
import Layout from './components/Layout.jsx';
import SetupWizard from './components/SetupWizard.jsx';
import FirstRunPage from './pages/FirstRunPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import FileExplorerPage from './pages/FileExplorerPage.jsx';
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

  // First-run: check if admin account needs to be created (no auth needed)
  const [firstRun,        setFirstRun]        = useState(null); // null=unknown, true/false
  const [librarySetup,    setLibrarySetup]    = useState(false);
  const [libraryChecked,  setLibraryChecked]  = useState(false);

  // Check first-run status on mount (public endpoint, no auth)
  useEffect(() => {
    fetch('/api/auth/setup-status')
      .then(r => r.json())
      .then(d => setFirstRun(d.needsSetup))
      .catch(() => setFirstRun(false));
  }, []);

  // Check library setup once logged in as admin
  useEffect(() => {
    if (!user || user.role !== 'admin') { setLibraryChecked(true); return; }
    get('/admin/settings')
      .then(settings => setLibrarySetup(settings['library.setup_complete'] !== 'true'))
      .catch(() => {})
      .finally(() => setLibraryChecked(true));
  }, [user?.id]);

  // Still checking first-run status
  if (firstRun === null) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" />
    </div>
  );

  // First-run: create admin account
  if (firstRun) return <FirstRunPage onComplete={() => setFirstRun(false)} />;

  if (!libraryChecked && user) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" />
    </div>
  );

  return (
    <>
      {librarySetup && user?.role === 'admin' && (
        <SetupWizard onComplete={() => setLibrarySetup(false)} />
      )}
      <Routes>
        <Route path="/login"    element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/read/:id" element={<ProtectedRoute><ReaderPage /></ProtectedRoute>} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<LibraryPage />} />
          <Route path="/search"         element={<SearchPage />} />
          <Route path="/files"          element={<FileExplorerPage />} />
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
