import React from 'react';

export type SessionBannerState =
  | { type: 'idle' }
  | { type: 'info'; message: string; actionLabel?: string; onAction?: () => void }
  | { type: 'warning'; message: string; actionLabel?: string; onAction?: () => void };

export const SessionBanner: React.FC<SessionBannerState> = (state) => {
  if (state.type === 'idle') {
    return null;
  }

  const className = state.type === 'warning' ? 'session-banner warning' : 'session-banner info';
  return (
    <div className={className} role="status">
      <span>{state.message}</span>
      {state.actionLabel && state.onAction && (
        <button type="button" onClick={state.onAction} className="session-banner-action">
          {state.actionLabel}
        </button>
      )}
      <style>{`
        .session-banner {
          padding: 8px 16px;
          margin-bottom: 16px;
          border-radius: 4px;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .session-banner button.session-banner-action {
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          cursor: pointer;
        }
        .session-banner.info {
          background: #e6f4ff;
          color: #1f4b99;
        }
        .session-banner.info .session-banner-action {
          background: #1f4b99;
          color: #fff;
        }
        .session-banner.warning {
          background: #fff4e5;
          color: #8a2a0a;
        }
        .session-banner.warning .session-banner-action {
          background: #8a2a0a;
          color: #fff;
        }
      `}
      </style>
    </div>
  );
};
