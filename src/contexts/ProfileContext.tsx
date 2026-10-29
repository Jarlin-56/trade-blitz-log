import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  bio: string | null;
  trading_style: string | null;
  is_active: boolean;
}

interface ProfileContextType {
  profiles: Profile[];
  activeProfile: Profile | null;
  switchProfile: (profileId: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;
  loading: boolean;
}

const ProfileContext = createContext<ProfileContextType>({
  profiles: [],
  activeProfile: null,
  switchProfile: async () => {},
  refreshProfiles: async () => {},
  loading: true,
});

export const useProfile = () => useContext(ProfileContext);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    if (!user) { setProfiles([]); setActiveProfile(null); setLoading(false); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, user_id, display_name, bio, trading_style, is_active')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    const list = (data ?? []) as Profile[];
    setProfiles(list);
    setActiveProfile(list.find(p => p.is_active) ?? list[0] ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const switchProfile = async (profileId: string) => {
    if (!user) return;
    const { data: target, error: targetError } = await supabase
      .from('profiles').select('id').eq('id', profileId).eq('user_id', user.id).maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new Error('ไม่พบโปรไฟล์นี้');

    const { error: deactivateError } = await supabase
      .from('profiles').update({ is_active: false }).eq('user_id', user.id);
    if (deactivateError) throw deactivateError;
    const { error: activateError } = await supabase
      .from('profiles').update({ is_active: true }).eq('id', profileId).eq('user_id', user.id);
    if (activateError) throw activateError;
    await fetchProfiles();
  };

  return (
    <ProfileContext.Provider value={{ profiles, activeProfile, switchProfile, refreshProfiles: fetchProfiles, loading }}>
      {children}
    </ProfileContext.Provider>
  );
}
