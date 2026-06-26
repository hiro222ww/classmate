"use client";

import type { ReactNode } from "react";
import { HelpTip } from "@/components/HelpTip";

type FormFieldLabelProps = {
  children: ReactNode;
  helpLabel?: string;
  helpContent?: ReactNode;
};

export function FormFieldLabel({
  children,
  helpLabel,
  helpContent,
}: FormFieldLabelProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontWeight: 700 }}>{children}</span>
      {helpContent ? (
        <HelpTip label={helpLabel ?? String(children)} content={helpContent} />
      ) : null}
    </div>
  );
}

export function SectionTitle({
  title,
  helpLabel,
  helpContent,
}: {
  title: string;
  helpLabel: string;
  helpContent: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>{title}</h2>
      <HelpTip label={helpLabel} content={helpContent} />
    </div>
  );
}

const sectionStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  display: "grid",
  gap: 14,
} as const;

export function FormSection({
  title,
  helpLabel,
  helpContent,
  children,
}: {
  title: string;
  helpLabel: string;
  helpContent: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={sectionStyle}>
      <SectionTitle title={title} helpLabel={helpLabel} helpContent={helpContent} />
      {children}
    </section>
  );
}
