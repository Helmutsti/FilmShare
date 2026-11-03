import { api } from './api';

const DISMISS_KEY = 'fs:notifiche-non-ora';

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Mostrare l'avviso "Attiva notifiche"? Solo se il browser le supporta, non sono già decise e non si è detto "Non ora". */
export function shouldAskPush() {
  if (!pushSupported() || Notification.permission !== 'default') return false;
  try { return localStorage.getItem(DISMISS_KEY) !== '1'; } catch { return true; }
}

export function dismissPush() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* niente */ }
}

function keyToBytes(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Chiede il permesso e iscrive questo browser. Va chiamata da un clic (i browser lo richiedono). */
export async function enablePush(publicKey: string): Promise<boolean> {
  if (!pushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
  await api.iscriviNotifiche(sub.toJSON());
  return true;
}

/** Se il permesso c'è già, rinnova l'iscrizione all'avvio (es. dopo un nuovo accesso). */
export async function refreshPush(publicKey: string) {
  if (pushSupported() && Notification.permission === 'granted') await enablePush(publicKey).catch(() => {});
}
