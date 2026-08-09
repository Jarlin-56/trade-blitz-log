import { useEffect, useState } from 'react';
import { Download, RefreshCw, X, CheckCircle2 } from 'lucide-react';

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'ready';

interface UpdateInfo {
  version: string;
  percent: number;
}

export default function UpdateNotification() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [info, setInfo] = useState<UpdateInfo>({ version: '', percent: 0 });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onUpdateAvailable((data) => {
      setStatus('available');
      setInfo((prev) => ({ ...prev, version: data.version }));
      setDismissed(false);
    });

    window.electronAPI.onDownloadProgress((progress) => {
      setStatus('downloading');
      setInfo((prev) => ({ ...prev, percent: Math.round(progress.percent) }));
    });

    window.electronAPI.onUpdateDownloaded((data) => {
      setStatus('ready');
      setInfo((prev) => ({ ...prev, version: data.version }));
      setDismissed(false);
    });
  }, []);

  if (status === 'idle' || dismissed) return null;

  const handleDownload = () => {
    window.electronAPI?.downloadUpdate();
    setStatus('downloading');
  };

  const handleInstall = () => {
    window.electronAPI?.installUpdate();
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 9999,
        minWidth: '320px',
        maxWidth: '400px',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
        backdropFilter: 'blur(16px)',
        background: 'linear-gradient(135deg, hsl(228 18% 13% / 0.95), hsl(228 18% 10% / 0.98))',
        animation: 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes progressPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>

      {/* Top accent line */}
      <div
        style={{
          height: '3px',
          background: status === 'ready'
            ? 'linear-gradient(90deg, hsl(142 70% 45%), hsl(160 70% 45%))'
            : 'linear-gradient(90deg, hsl(217 91% 60%), hsl(262 83% 58%))',
          width: status === 'downloading' ? `${info.percent}%` : '100%',
          transition: 'width 0.3s ease',
        }}
      />

      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {/* Icon */}
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            background: status === 'ready'
              ? 'hsl(142 70% 45% / 0.12)'
              : 'hsl(217 91% 60% / 0.12)',
          }}
        >
          {status === 'available' && (
            <Download size={18} style={{ color: 'hsl(217 91% 60%)' }} />
          )}
          {status === 'downloading' && (
            <RefreshCw
              size={18}
              style={{
                color: 'hsl(217 91% 60%)',
                animation: 'spin 1.5s linear infinite',
              }}
            />
          )}
          {status === 'ready' && (
            <CheckCircle2 size={18} style={{ color: 'hsl(142 70% 45%)' }} />
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'hsl(210 20% 92%)',
              marginBottom: '2px',
            }}
          >
            {status === 'available' && `อัพเดท v${info.version} พร้อมแล้ว`}
            {status === 'downloading' && `กำลังดาวน์โหลด... ${info.percent}%`}
            {status === 'ready' && `v${info.version} พร้อมติดตั้ง`}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'hsl(215 15% 55%)',
              lineHeight: 1.4,
            }}
          >
            {status === 'available' && 'มีเวอร์ชันใหม่ให้ดาวน์โหลด'}
            {status === 'downloading' && 'กรุณารอสักครู่...'}
            {status === 'ready' && 'รีสตาร์ทเพื่อเริ่มใช้เวอร์ชันใหม่'}
          </div>

          {/* Progress bar for downloading */}
          {status === 'downloading' && (
            <div
              style={{
                marginTop: '8px',
                height: '4px',
                borderRadius: '2px',
                background: 'hsl(228 13% 18%)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: '2px',
                  width: `${info.percent}%`,
                  background: 'linear-gradient(90deg, hsl(217 91% 60%), hsl(262 83% 58%))',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          )}

          {/* Action buttons */}
          {(status === 'available' || status === 'ready') && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
              <button
                onClick={status === 'available' ? handleDownload : handleInstall}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: status === 'ready' ? 'hsl(220 20% 7%)' : '#fff',
                  background: status === 'ready'
                    ? 'hsl(142 70% 45%)'
                    : 'hsl(217 91% 60%)',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {status === 'available' ? 'ดาวน์โหลด' : 'รีสตาร์ทเลย'}
              </button>
              <button
                onClick={() => setDismissed(true)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: '1px solid hsl(228 13% 22%)',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  color: 'hsl(215 15% 55%)',
                  background: 'transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'hsl(228 13% 30%)';
                  e.currentTarget.style.color = 'hsl(210 20% 75%)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'hsl(228 13% 22%)';
                  e.currentTarget.style.color = 'hsl(215 15% 55%)';
                }}
              >
                ไว้ทีหลัง
              </button>
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            color: 'hsl(215 15% 45%)',
            flexShrink: 0,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'hsl(210 20% 75%)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'hsl(215 15% 45%)')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
