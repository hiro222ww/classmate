import type { CSSProperties } from "react";

export const DASH_CARD: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: "14px 16px",
  background: "#fff",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

export const PRIMARY_BTN: CSSProperties = {
  padding: "13px 16px",
  borderRadius: 12,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  fontSize: 15,
  cursor: "pointer",
  width: "100%",
};

export const SECONDARY_BTN: CSSProperties = {
  padding: "11px 16px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#374151",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
  width: "100%",
};

export const CHIP: CSSProperties = {
  fontSize: 11,
  padding: "5px 10px",
  borderRadius: 999,
  background: "#f3f4f6",
  color: "#4b5563",
  fontWeight: 800,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

export const HOME_DASHBOARD_LAYOUT_CSS = `
.home-dash-return {
  grid-column: 1 / -1;
}
.home-dash-bottom {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr;
}
.home-dash-join {
  order: 2;
}
.home-dash-age {
  order: 3;
}
@media (min-width: 720px) {
  .home-dash-bottom {
    grid-template-columns: 1fr 1fr;
  }
  .home-dash-age {
    order: 1;
  }
  .home-dash-join {
    order: 2;
  }
}
`;
