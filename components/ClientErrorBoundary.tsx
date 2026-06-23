"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type ClientErrorBoundaryProps = {
  children: ReactNode;
  label?: string;
  fallback?: ReactNode;
};

type ClientErrorBoundaryState = {
  error: Error | null;
};

export class ClientErrorBoundary extends Component<
  ClientErrorBoundaryProps,
  ClientErrorBoundaryState
> {
  state: ClientErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[client-error-boundary] ${this.props.label ?? "page"} crashed`,
      error,
      info.componentStack
    );
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
          }}
        >
          <p style={{ margin: "0 0 8px", fontWeight: 800 }}>
            画面の読み込みに失敗しました
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6 }}>
            時間をおいて再読み込みしてください。問題が続く場合はブラウザのキャッシュを削除してお試しください。
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #fca5a5",
              background: "#fff",
              color: "#991b1b",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            もう一度試す
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
