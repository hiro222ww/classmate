/** Client-only speaker (remote output) preference for the call room dock. */

let speakerOn = true;
const listeners = new Set<() => void>();

export function getCallSpeakerOn(): boolean {
  return speakerOn;
}

export function setCallSpeakerOn(next: boolean): void {
  if (speakerOn === next) return;
  speakerOn = next;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
}

export function subscribeCallSpeaker(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
