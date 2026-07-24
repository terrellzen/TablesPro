const auditChangedEvent = "tablespro:audit-changed";

export function notifyAuditChanged(): void {
  window.dispatchEvent(new Event(auditChangedEvent));
}

export function onAuditChanged(listener: () => void): () => void {
  window.addEventListener(auditChangedEvent, listener);
  return () => window.removeEventListener(auditChangedEvent, listener);
}
