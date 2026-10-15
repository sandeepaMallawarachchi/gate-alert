import React from 'react';
import { Navigate } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import SettingsModal from '@/components/SettingsModal';
import { useAuth } from '@/contexts/AuthContext';

const Settings: React.FC = () => {
  const { user, loading } = useAuth();
  if (!loading && !user) return <Navigate to="/auth" replace />;
  return (
    <PageShell title="Settings">
      <SettingsModal asPage isOpen onClose={() => {}} />
    </PageShell>
  );
};
export default Settings;
