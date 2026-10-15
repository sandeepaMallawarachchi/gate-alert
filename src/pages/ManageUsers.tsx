import React from 'react';
import { Navigate } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import AdminUsersModal from '@/components/AdminUsersModal';
import { useAuth } from '@/contexts/AuthContext';

const ManageUsers: React.FC = () => {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return (
    <PageShell title="Manage Users">
      <AdminUsersModal asPage open onOpenChange={() => {}} />
    </PageShell>
  );
};
export default ManageUsers;
