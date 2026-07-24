import type { ReactNode } from "react";

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

function stripTrailingPunctuation(url: string) {
  return url.replace(/[),.!?;:。、」』）]+$/g, "");
}

export function isSafeHttpUrl(value: string): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!parsed.hostname) return false;
    return true;
  } catch {
    return false;
  }
}

export type MessageTextPart =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

export function splitMessageTextWithLinks(text: string): MessageTextPart[] {
  const input = String(text ?? "");
  if (!input) return [];

  const parts: MessageTextPart[] = [];
  let lastIndex = 0;
  const re = new RegExp(URL_RE.source, URL_RE.flags);

  for (const match of input.matchAll(re)) {
    const raw = String(match[0] ?? "");
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: input.slice(lastIndex, index) });
    }

    const cleaned = stripTrailingPunctuation(raw);
    const trailing = raw.slice(cleaned.length);

    if (isSafeHttpUrl(cleaned)) {
      parts.push({ type: "link", value: cleaned, href: cleaned });
      if (trailing) parts.push({ type: "text", value: trailing });
    } else {
      parts.push({ type: "text", value: raw });
    }

    lastIndex = index + raw.length;
  }

  if (lastIndex < input.length) {
    parts.push({ type: "text", value: input.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value: input }];
}

export function renderMessageTextWithLinks(text: string): ReactNode {
  const parts = splitMessageTextWithLinks(text);
  return parts.map((part, index) => {
    if (part.type === "text") {
      return <span key={`t-${index}`}>{part.value}</span>;
    }

    return (
      <a
        key={`l-${index}`}
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "#1d4ed8",
          textDecoration: "underline",
          wordBreak: "break-all",
        }}
      >
        {part.value}
      </a>
    );
  });
}
