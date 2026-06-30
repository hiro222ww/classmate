import Link from "next/link";

type Props = {
  href: string;
  label: string;
  detail?: string;
  external?: boolean;
};

export default function AppShellListLink({
  href,
  label,
  detail,
  external,
}: Props) {
  const content = (
    <>
      <span style={{ display: "grid", gap: 2 }}>
        <span>{label}</span>
        {detail ? (
          <span
            className="app-shell-muted"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            {detail}
          </span>
        ) : null}
      </span>
      <span className="app-shell-chevron" aria-hidden>
        ›
      </span>
    </>
  );

  if (external || href.startsWith("mailto:")) {
    return (
      <li>
        <a href={href} className="app-shell-list-item">
          {content}
        </a>
      </li>
    );
  }

  return (
    <li>
      <Link href={href} className="app-shell-list-item">
        {content}
      </Link>
    </li>
  );
}
