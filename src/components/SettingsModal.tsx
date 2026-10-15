import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { useAppSettings } from '@/hooks/useAppSettings';
import PasswordInput from '@/components/PasswordInput';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  asPage?: boolean;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, asPage }) => {
  const { profile, user, isAdmin, updateProfile, refreshProfile } = useAuth();
  const { settings, update: updateSettings } = useAppSettings();
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync fullName with profile when modal opens or profile changes
  React.useEffect(() => {
    if (isOpen && profile?.full_name) {
      setFullName(profile.full_name);
    }
  }, [isOpen, profile?.full_name]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      await updateProfile(fullName, publicUrl);
      toast.success('Profile image updated!');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await updateProfile(fullName);
      if (error) throw error;
      toast.success('Profile updated!');
      if (!asPage) onClose();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      toast.error(error.message || 'Failed to update password');
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    setPasswordOpen(false);
    toast.success('Password updated');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const body = (
    <>
        {!asPage && <DialogHeader><DialogTitle className="text-foreground text-xl">Settings</DialogTitle></DialogHeader>}

        <div className="space-y-6 py-4">
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Avatar className="w-24 h-24 border-2 border-primary">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-secondary text-secondary-foreground text-2xl">
                  {profile?.full_name ? getInitials(profile.full_name) : 'U'}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
            <p className="text-sm text-muted-foreground">@{profile?.username}</p>
          </div>

          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-foreground">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              className="bg-input border-border text-foreground"
            />
          </div>

          <div className="rounded-2xl border border-border bg-secondary/20 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <KeyRound className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">Password</p>
                  <p className="text-xs text-muted-foreground">Keep your account secure</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary"
                onClick={() => setPasswordOpen((open) => !open)}
                aria-expanded={passwordOpen}
              >
                {passwordOpen ? 'Cancel' : 'Change'}
              </Button>
            </div>

            {passwordOpen && (
              <form onSubmit={handlePasswordChange} className="mt-4 space-y-3 border-t border-border pt-4">
                <div className="space-y-2">
                  <Label htmlFor="settings-new-password" className="text-foreground">New Password</Label>
                  <PasswordInput
                    id="settings-new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    className="bg-input border-border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-confirm-password" className="text-foreground">Confirm New Password</Label>
                  <PasswordInput
                    id="settings-confirm-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                    className="bg-input border-border text-foreground"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={changingPassword}>
                  {changingPassword ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : 'Update Password'}
                </Button>
              </form>
            )}
          </div>

          {isAdmin && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <p className="text-sm font-semibold text-foreground">Features (admin)</p>
              {([
                ['attendance_enabled', 'Attendance', 'Check in/out and attendance reminders'],
                ['locations_enabled', 'Locations', 'Live location sharing map'],
              ] as const).map(([key, label, desc]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    checked={settings[key]}
                    onCheckedChange={async (v) => {
                      const { error } = await updateSettings({ [key]: v });
                      if (error) toast.error('Failed to update');
                      else toast.success(`${label} ${v ? 'enabled' : 'disabled'}`);
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Save Button */}
          <Button 
            onClick={handleSave} 
            disabled={loading}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </>
  );
  return asPage ? <div className="glass rounded-[1.75rem] p-6">{body}</div> : (
    <Dialog open={isOpen} onOpenChange={onClose}><DialogContent className="bg-card border-border">{body}</DialogContent></Dialog>
  );
};

export default SettingsModal;
