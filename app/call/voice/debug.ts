export const DEBUG_CALL = false;

export function callLog(...args: any[]) {
  if (DEBUG_CALL) console.log(...args);
}

export function callWarn(...args: any[]) {
  if (DEBUG_CALL) console.warn(...args);
}

export function callError(...args: any[]) {
  if (DEBUG_CALL) console.error(...args);
}