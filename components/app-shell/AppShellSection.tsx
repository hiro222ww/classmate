type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
};

export default function AppShellSection({
  title,
  subtitle,
  children,
  className,
}: Props) {
  return (
    <section className={["app-shell-card", className].filter(Boolean).join(" ")}>
      <div style={{ marginBottom: subtitle ? 6 : 12 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
        {subtitle ? (
          <p className="app-shell-muted" style={{ margin: "6px 0 0" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
