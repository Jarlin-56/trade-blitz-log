import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle2, Download, ArrowUpCircle, Monitor, ExternalLink, Sparkles } from 'lucide-react';
import packageJson from '../../package.json';

type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error';

interface UpdateState {
  status: UpdateStatus;
  newVersion: string;
  percent: number;
}

export default function SettingsAbout() {
  const currentVersion = packageJson.version;
  const isElectron = !!window.electronAPI;

  const [update, setUpdate] = useState<UpdateState>({
    status: 'idle',
    newVersion: '',
    percent: 0,
  });

  useEffect(() => {
    if (!isElectron) return;

    window.electronAPI.onUpdateAvailable((info) => {
      setUpdate((prev) => ({ ...prev, status: 'available', newVersion: info.version }));
    });

    window.electronAPI.onDownloadProgress((progress) => {
      setUpdate((prev) => ({ ...prev, status: 'downloading', percent: Math.round(progress.percent) }));
    });

    window.electronAPI.onUpdateDownloaded((info) => {
      setUpdate((prev) => ({ ...prev, status: 'ready', newVersion: info.version }));
    });

    window.electronAPI.onUpdateNotAvailable(() => {
      setUpdate((prev) => ({ ...prev, status: 'up-to-date' }));
    });

    window.electronAPI.onUpdateError(() => {
      setUpdate((prev) => ({ ...prev, status: 'error' }));
    });
  }, [isElectron]);

  const handleCheckUpdate = () => {
    if (!isElectron) return;
    setUpdate((prev) => ({ ...prev, status: 'checking' }));
    window.electronAPI.checkForUpdate();

    // Fallback: if no response in 15 seconds (e.g. network issue), show error
    setTimeout(() => {
      setUpdate((prev) => {
        if (prev.status === 'checking') return { ...prev, status: 'error' };
        return prev;
      });
    }, 15000);
  };

  const handleDownload = () => {
    if (!isElectron) return;
    window.electronAPI.downloadUpdate();
    setUpdate((prev) => ({ ...prev, status: 'downloading', percent: 0 }));
  };

  const handleInstall = () => {
    if (!isElectron) return;
    window.electronAPI.installUpdate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">About</h2>
        <p className="text-sm text-muted-foreground">
          App version and update information.
        </p>
      </div>

      {/* App Info Card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Monitor className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Trade Log</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Trading journal & performance tracker
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-secondary px-2.5 py-1 text-xs font-mono font-medium text-secondary-foreground">
                v{currentVersion}
              </span>
              {isElectron && (
                <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  Desktop App
                </span>
              )}
              {!isElectron && (
                <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400">
                  Web Version
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Update Section */}
      {isElectron && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Software Update</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Check for the latest version of Trade Log.
              </p>
            </div>
          </div>

          {/* Status Messages */}
          <div className="rounded-md bg-secondary/50 p-4">
            {update.status === 'idle' && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <ArrowUpCircle className="h-5 w-5 flex-shrink-0" />
                <span>Click the button below to check for updates.</span>
              </div>
            )}

            {update.status === 'checking' && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin flex-shrink-0" />
                <span>Checking for updates...</span>
              </div>
            )}

            {update.status === 'up-to-date' && (
              <div className="flex items-center gap-3 text-sm text-green-400">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                <span>You're on the latest version! (v{currentVersion})</span>
              </div>
            )}

            {update.status === 'available' && (
              <div className="flex items-center gap-3 text-sm">
                <Download className="h-5 w-5 text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-blue-400 font-medium">Update v{update.newVersion} is available!</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Current: v{currentVersion} → New: v{update.newVersion}
                  </p>
                </div>
              </div>
            )}

            {update.status === 'downloading' && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin text-blue-400 flex-shrink-0" />
                  <span>Downloading update... {update.percent}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${update.percent}%` }}
                  />
                </div>
              </div>
            )}

            {update.status === 'ready' && (
              <div className="flex items-center gap-3 text-sm text-green-400">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                <div>
                  <p className="font-medium">v{update.newVersion} is ready to install!</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Restart the app to complete the update.
                  </p>
                </div>
              </div>
            )}

            {update.status === 'error' && (
              <div className="flex items-center gap-3 text-sm text-destructive">
                <ArrowUpCircle className="h-5 w-5 flex-shrink-0" />
                <span>Failed to check for updates. Please try again later.</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {(update.status === 'idle' || update.status === 'up-to-date' || update.status === 'error') && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckUpdate}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Check for Updates
              </Button>
            )}

            {update.status === 'available' && (
              <Button size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download Update
              </Button>
            )}

            {update.status === 'ready' && (
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleInstall}>
                <ArrowUpCircle className="h-4 w-4 mr-2" />
                Restart & Update
              </Button>
            )}
          </div>
        </div>
      )}

      {/* What's New */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">What's New in v{currentVersion}</h3>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
            <span>Added automatic software update feature</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
            <span>UI improvements for Settings panel</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
            <span>Added True Love 67</span>
          </li>
        </ul>
      </div>

      {/* Links & Support */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-sm font-medium mb-3">Links & Support</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <a
            href="https://www.mql5.com/en/users/jarlaogao2310"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md p-3 text-sm text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4 flex-shrink-0" />
            <span>Developer Profile</span>
          </a>
          <a
            href="https://www.mql5.com/en/users/jarlaogao2310"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md p-3 text-sm text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4 flex-shrink-0" />
            <span>Report Issues / Feedback</span>
          </a>
        </div>
      </div>

      {/* Information */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-sm font-medium mb-3">Information</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span className="font-mono">{currentVersion}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform</span>
            <span>{isElectron ? 'Desktop (Electron)' : 'Web Browser'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Developer</span>
            <span>Jarlin</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">License</span>
            <span>Proprietary</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        © {new Date().getFullYear()} Jarlin. All rights reserved.
      </p>
    </div>
  );
}
