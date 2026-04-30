import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface UserRow {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AdminUsersModal: React.FC<Props> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, user_id, username, full_name, avatar_url, is_active')
      .order('full_name', { ascending: true });
    if (error) {
      toast.error('Failed to load users');
    } else {
      setUsers((data as UserRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const toggleActive = async (row: UserRow, next: boolean) => {
    setUpdatingId(row.id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: next } as any)
      .eq('id', row.id);
    setUpdatingId(null);
    if (error) {
      toast.error('Failed to update user');
      return;
    }
    setUsers(prev => prev.map(u => u.id === row.id ? { ...u, is_active: next } : u));
    toast.success(`${row.full_name} ${next ? 'activated' : 'deactivated'}`);
  };

  const initials = (n: string) => n.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Manage Users</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(u => {
              const isSelf = u.user_id === user?.id;
              return (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-md bg-secondary/40 border border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={u.avatar_url || undefined} />
                      <AvatarFallback className="bg-secondary text-xs">{initials(u.full_name || u.username)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {updatingId === u.id && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    <Switch
                      checked={u.is_active}
                      disabled={isSelf || updatingId === u.id}
                      onCheckedChange={(v) => toggleActive(u, v)}
                    />
                  </div>
                </div>
              );
            })}
            {users.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">No users found</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AdminUsersModal;
