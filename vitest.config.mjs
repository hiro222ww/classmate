import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default {
  test: {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    },
  },
  resolve: {
    alias: {
      "@": root,
    },
  },
};
