import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';

export default function SettingsTags() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');

  const { data: tags = [] } = useQuery({
    queryKey: ['tags', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').eq('user_id', user?.id ?? '').order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('tags').insert({ name, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); setNewName(''); toast.success('Added'); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); toast.success('Deleted'); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Manage custom tags for emotional or contextual labeling.</p>
      <form
        onSubmit={e => { e.preventDefault(); if (newName.trim()) addMutation.mutate(newName.trim()); }}
        className="flex gap-2"
      >
        <Input placeholder="e.g. FOMO, FollowedPlan" value={newName} onChange={e => setNewName(e.target.value)} />
        <Button type="submit" size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add</Button>
      </form>
      <div className="space-y-1">
        {tags.map(t => (
          <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent/50">
            <span className="text-sm">#{t.name}</span>
            <button onClick={() => deleteMutation.mutate(t.id)} className="text-muted-foreground hover:text-loss transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {tags.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No tags yet</p>}
      </div>
    </div>
  );
}
