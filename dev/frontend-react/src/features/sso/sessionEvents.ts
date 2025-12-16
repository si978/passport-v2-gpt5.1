import { appConfig } from '../../config/appConfig';
import { SessionStatus, SsoSessionData } from './ssoStartup';

export interface SessionStatusPayload {
  status: SessionStatus;
  sessionData?: SsoSessionData;
  reason?: string;
}

type Handler = (payload: SessionStatusPayload) => void;

const WEBVIEW_EVENT_TYPE = 'session.status';

export const emitSessionStatus = (payload: SessionStatusPayload) => {
  const eventName = appConfig.sessionEventName;
  window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
};

export const subscribeSessionStatus = (handler: Handler) => {
  const eventName = appConfig.sessionEventName;

  const customHandler = (event: Event) => {
    const detail = (event as CustomEvent<SessionStatusPayload>).detail;
    if (!detail) return;
    handler(detail);
  };

  const messageHandler = (event: MessageEvent) => {
    const data = event.data as SessionStatusPayload & { type?: string };
    if (!data) return;
    if (data.type === WEBVIEW_EVENT_TYPE || data.status) {
      handler({ status: data.status ?? 'none', sessionData: data.sessionData, reason: data.reason });
    }
  };

  window.addEventListener(eventName, customHandler as EventListener);
  window.addEventListener('message', messageHandler as EventListener);

  const chromeWebview = (window as any).chrome?.webview;
  let webviewHandler: ((data: any) => void) | null = null;
  if (chromeWebview?.addEventListener) {
    webviewHandler = (data: any) => {
      if (!data) return;
      const payload: SessionStatusPayload = {
        status: (data.status ?? data.detail?.status ?? 'none') as SessionStatus,
        sessionData: data.sessionData ?? data.detail?.sessionData,
        reason: data.reason ?? data.detail?.reason,
      };
      handler(payload);
    };
    chromeWebview.addEventListener('message', webviewHandler);
  }

  return () => {
    window.removeEventListener(eventName, customHandler as EventListener);
    window.removeEventListener('message', messageHandler as EventListener);
    if (chromeWebview?.removeEventListener && webviewHandler) {
      chromeWebview.removeEventListener('message', webviewHandler);
    }
  };
};
