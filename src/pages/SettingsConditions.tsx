import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';

export default function SettingsConditions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');

  const { data: conditions = [] } = useQuery({
    queryKey: ['conditions', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('conditions').select('*').order('name');
      return data ?? [];
    },
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('conditions').insert({ name, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conditions'] }); setNewName(''); toast.success('Added'); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('conditions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conditions'] }); toast.success('Deleted'); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Manage checklist items that appear when logging trades.</p>
      <form
        onSubmit={e => { e.preventDefault(); if (newName.trim()) addMutation.mutate(newName.trim()); }}
        className="flex gap-2"
      >
        <Input placeholder="e.g. IDM, QM, BOS" value={newName} onChange={e => setNewName(e.target.value)} />
        <Button type="submit" size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add</Button>
      </form>
      <div className="space-y-1">
        {conditions.map(c => (
          <div key={c.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent/50">
            <span className="text-sm">{c.name}</span>
            <button onClick={() => deleteMutation.mutate(c.id)} className="text-muted-foreground hover:text-loss transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {conditions.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No conditions yet</p>}
      </div>
    </div>
  );
}
