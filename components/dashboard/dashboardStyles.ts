import type { CSSProperties } from "react";

export const DASH_CARD: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  padding: "20px 18px",
  background: "#fff",
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
};

export const PRIMARY_BTN: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 14,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  fontSize: 15,
  cursor: "pointer",
  width: "100%",
};

export const SECONDARY_BTN: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  fontSize: 14,
  cursor: "pointer",
  width: "100%",
};

export const HOME_DASHBOARD_LAYOUT_CSS = `
.home-dash-return {
  grid-column: 1 / -1;
}
.home-dash-bottom {
  display: grid;
  gap: 16px;
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
