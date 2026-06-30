export const APP_SHELL_LAYOUT_CSS = `
  .app-shell {
    min-height: 100vh;
    background: linear-gradient(180deg, #f8fafc 0%, #ffffff 42%);
    color: #0f172a;
  }

  .app-shell-inner {
    width: min(100%, 560px);
    margin: 0 auto;
    padding:
      max(20px, env(safe-area-inset-top, 0px))
      max(20px, env(safe-area-inset-right, 0px))
      max(28px, env(safe-area-inset-bottom, 0px))
      max(20px, env(safe-area-inset-left, 0px));
    display: grid;
    gap: 20px;
  }

  @media (min-width: 768px) {
    .app-shell-inner {
      width: min(100%, 720px);
      padding-top: max(32px, env(safe-area-inset-top, 0px));
      gap: 24px;
    }
  }

  .app-shell-title {
    margin: 0;
    font-size: clamp(28px, 5vw, 34px);
    font-weight: 900;
    letter-spacing: -0.02em;
  }

  .app-shell-subtitle {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 15px;
    line-height: 1.6;
  }

  .app-shell-card {
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    background: #fff;
    padding: 18px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
  }

  .app-shell-actions {
    display: grid;
    gap: 12px;
    grid-template-columns: 1fr;
  }

  @media (min-width: 480px) {
    .app-shell-actions--grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 768px) {
    .app-shell-actions--grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .app-shell-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 52px;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid #cbd5e1;
    background: #fff;
    color: #0f172a;
    font-size: 16px;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .app-shell-btn:active:not(:disabled) {
    background: #f1f5f9;
  }

  .app-shell-btn:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .app-shell-btn--primary {
    background: #0f172a;
    border-color: #0f172a;
    color: #fff;
  }

  .app-shell-btn--primary:active:not(:disabled) {
    background: #1e293b;
  }

  .app-shell-btn--ghost {
    background: #f8fafc;
  }

  .app-shell-list {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .app-shell-list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 52px;
    padding: 12px 0;
    border-bottom: 1px solid #f1f5f9;
    color: inherit;
    text-decoration: none;
    font-size: 16px;
    font-weight: 700;
  }

  .app-shell-list-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .app-shell-list-item:first-child {
    padding-top: 0;
  }

  .app-shell-chevron {
    color: #94a3b8;
    font-size: 18px;
    line-height: 1;
  }

  .app-shell-muted {
    color: #64748b;
    font-size: 14px;
    line-height: 1.6;
  }

  .app-shell-error {
    margin: 0;
    color: #b91c1c;
    font-weight: 700;
    line-height: 1.6;
  }
`;
