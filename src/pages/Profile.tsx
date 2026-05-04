import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, User, Trash2 } from 'lucide-react';

const TRADING_STYLES = ['Scalper', 'Day Trader', 'Swing Trader', 'Position Trader', 'Other'];

export default function Profile() {
  const { user } = useAuth();
  const { activeProfile, profiles, refreshProfiles } = useProfile();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [tradingStyle, setTradingStyle] = useState('');

  useEffect(() => {
    if (!activeProfile) return;
    setDisplayName(activeProfile.display_name ?? '');
    setBio(activeProfile.bio ?? '');
    setTradingStyle(activeProfile.trading_style ?? '');
  }, [activeProfile]);

  const handleSave = async () => {
    if (!activeProfile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName, bio, trading_style: tradingStyle || null } as any)
      .eq('id', activeProfile.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Profile updated successfully.' });
      await refreshProfiles();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!activeProfile || !user || profiles.length <= 1) return;
    const confirmed = window.confirm(`ลบโปรไฟล์ "${activeProfile.display_name}" และ trade ทั้งหมดในโปรไฟล์นี้?`);
    if (!confirmed) return;

    // Delete trades belonging to this profile
    await supabase.from('trades').delete().eq('profile_id', activeProfile.id);
    // Delete profile
    await supabase.from('profiles').delete().eq('id', activeProfile.id);
    // Activate another profile
    const remaining = profiles.filter(p => p.id !== activeProfile.id);
    if (remaining.length > 0) {
      await supabase.from('profiles').update({ is_active: true } as any).eq('id', remaining[0].id);
    }
    await refreshProfiles();
    toast({ title: 'ลบโปรไฟล์แล้ว' });
  };

  if (!activeProfile) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tradingStyle">Trading Style</Label>
          <Select value={tradingStyle} onValueChange={setTradingStyle}>
            <SelectTrigger>
              <SelectValue placeholder="Select your style" />
            </SelectTrigger>
            <SelectContent>
              {TRADING_STYLES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about yourself and your trading journey..."
            rows={4}
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Profile
        </Button>

        {profiles.length > 1 && (
          <Button onClick={handleDelete} variant="destructive" className="w-full gap-2">
            <Trash2 className="h-4 w-4" />
            ลบโปรไฟล์นี้
          </Button>
        )}
      </div>
    </div>
  );
}
