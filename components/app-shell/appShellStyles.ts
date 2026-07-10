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

    .app-shell-inner--wide {
      width: min(100%, 960px);
    }
  }

  .app-shell-inner--with-tab {
    padding-bottom: max(88px, calc(28px + env(safe-area-inset-bottom, 0px)));
  }

  .app-shell-home-layout {
    display: grid;
    gap: 20px;
  }

  @media (min-width: 768px) {
    .app-shell-home-layout {
      grid-template-columns: minmax(280px, 0.95fr) minmax(0, 1.25fr);
      align-items: start;
      gap: 24px;
    }
  }

  .app-shell-settings-grid {
    display: grid;
    gap: 20px;
  }

  @media (min-width: 768px) {
    .app-shell-settings-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 20px;
      align-items: start;
    }

    .app-shell-settings-grid > .app-shell-card--full {
      grid-column: 1 / -1;
    }
  }

  .app-shell-stat-grid {
    display: grid;
    gap: 10px;
  }

  @media (min-width: 480px) {
    .app-shell-stat-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .app-shell-stat {
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 12px 14px;
    background: #f8fafc;
  }

  .app-shell-stat-label {
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .app-shell-stat-value {
    font-size: 15px;
    font-weight: 800;
    line-height: 1.5;
  }

  .app-shell-bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    padding:
      8px max(16px, env(safe-area-inset-right, 0px))
      max(10px, env(safe-area-inset-bottom, 0px))
      max(10px, env(safe-area-inset-left, 0px));
    background: rgba(255, 255, 255, 0.96);
    border-top: 1px solid #e2e8f0;
    backdrop-filter: blur(10px);
  }

  @media (min-width: 768px) {
    .app-shell-bottom-nav {
      width: min(100%, 420px);
      left: 50%;
      transform: translateX(-50%);
      border: 1px solid #e2e8f0;
      border-radius: 18px 18px 0 0;
    }
  }

  .app-shell-bottom-nav-item {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    border-radius: 12px;
    color: #64748b;
    font-size: 15px;
    font-weight: 800;
    text-decoration: none;
  }

  .app-shell-bottom-nav-item--active {
    background: #0f172a;
    color: #fff;
  }

  .app-shell-info-box {
    border-radius: 14px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 14px 16px;
  }

  .app-shell-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    background: #e2e8f0;
    color: #475569;
    font-size: 12px;
    font-weight: 800;
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

/** /room・/call など Capacitor アプリ内の没入 UI */
export const APP_IMMERSIVE_LAYOUT_CSS = `
  body > footer {
    display: none !important;
  }

  .app-immersive {
    min-height: 100dvh;
    background: linear-gradient(180deg, #f8fafc 0%, #ffffff 38%);
    color: #0f172a;
  }

  .app-immersive-inner {
    width: min(100%, 720px);
    margin: 0 auto;
    padding:
      max(10px, env(safe-area-inset-top, 0px))
      max(14px, env(safe-area-inset-right, 0px))
      max(20px, env(safe-area-inset-bottom, 0px))
      max(14px, env(safe-area-inset-left, 0px));
  }

  .app-immersive-inner--wide {
    width: min(100%, 980px);
  }

  .app-immersive-toolbar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .app-immersive-board {
    border-radius: 20px;
    padding: 16px 18px;
    background: #0f2b1d;
    color: #e9fff2;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  .app-immersive-board-title {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: 0.02em;
    line-height: 1.35;
  }

  .app-immersive-call-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .app-immersive-call-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .app-shell-title {
    margin: 0;
    font-size: clamp(24px, 5vw, 30px);
    font-weight: 900;
    letter-spacing: -0.02em;
  }

  .app-shell-subtitle {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 14px;
    line-height: 1.6;
  }

  .app-shell-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
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

  .app-shell-btn--danger {
    border-color: #fecaca;
    background: #fff;
    color: #b91c1c;
  }

  .app-immersive .app-immersive-toolbar .app-shell-btn,
  .app-immersive .app-immersive-call-actions .app-shell-btn {
    min-height: 40px;
    padding: 8px 12px;
    font-size: 14px;
    border-radius: 12px;
  }
`;
