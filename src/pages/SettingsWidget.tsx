import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function SettingsWidget() {
  const [config, setConfig] = useState({
    shortcutToggle: 'CommandOrControl+Shift+Space',
    shortcutCapture: 'CommandOrControl+Shift+X',
    autoHide: true,
    prefillAsset: '',
    prefillRisk: '',
  });

  const isElectron = !!window.electronAPI;

  useEffect(() => {
    if (isElectron) {
      window.electronAPI.getConfig().then((cfg) => {
        if (cfg) setConfig(cfg);
      });
    }
  }, [isElectron]);

  const handleSave = async () => {
    if (isElectron) {
      try {
        setConfig(await window.electronAPI.saveConfig(config));
        toast.success('Widget settings saved successfully!');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save widget settings');
      }
    } else {
      toast.error('Widget settings are only available in the desktop app.');
    }
  };

  const handleShortcutRecording = (e: React.KeyboardEvent<HTMLInputElement>, field: 'shortcutToggle' | 'shortcutCapture') => {
    e.preventDefault();
    
    // Ignore standalone modifier keys
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return;
    }

    const keys = [];
    if (e.ctrlKey || e.metaKey) keys.push('CommandOrControl');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');
    
    let key = e.key;
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    
    if (key) {
      keys.push(key);
      setConfig({ ...config, [field]: keys.join('+') });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Widget Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure the quick note widget behavior and defaults.
        </p>
      </div>

      <div className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label>Toggle Widget Shortcut</Label>
          <Input 
            value={config.shortcutToggle}
            onKeyDown={(e) => handleShortcutRecording(e, 'shortcutToggle')}
            onChange={() => {}} // Prevent normal typing
            placeholder="Click here and press keys..."
            className="cursor-pointer focus-visible:ring-primary"
          />
          <p className="text-xs text-muted-foreground">Click the field and press your desired shortcut keys.</p>
        </div>

        <div className="space-y-2">
          <Label>Capture Screen Shortcut</Label>
          <Input 
            value={config.shortcutCapture}
            onKeyDown={(e) => handleShortcutRecording(e, 'shortcutCapture')}
            onChange={() => {}} // Prevent normal typing
            placeholder="Click here and press keys..."
            className="cursor-pointer focus-visible:ring-primary"
          />
        </div>

        <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
          <div className="space-y-0.5">
            <Label>Auto-Hide Widget</Label>
            <p className="text-sm text-muted-foreground">Hide the widget automatically when clicking outside.</p>
          </div>
          <Switch 
            checked={config.autoHide} 
            onCheckedChange={(c) => setConfig({ ...config, autoHide: c })}
          />
        </div>

        <div className="pt-4 border-t border-border">
          <h3 className="text-md font-medium mb-4">Default Prefills</h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Default Asset</Label>
              <Input 
                value={config.prefillAsset}
                onChange={(e) => setConfig({ ...config, prefillAsset: e.target.value })}
                placeholder="e.g. XAUUSD"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Default Risk (R)</Label>
              <NumberInput 
                step="0.1"
                value={config.prefillRisk}
                onChange={(e) => setConfig({ ...config, prefillRisk: e.target.value })}
                placeholder="e.g. 1"
              />
            </div>
          </div>
        </div>

        <div className="pt-4">
          <Button onClick={handleSave} disabled={!isElectron}>Save Settings</Button>
          {!isElectron && <p className="text-sm text-destructive mt-2">These settings only work in the Desktop App.</p>}
        </div>
      </div>
    </div>
  );
}
