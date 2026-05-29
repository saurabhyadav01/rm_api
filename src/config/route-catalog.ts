import { getApiPrefix } from "./public-url";

export type RouteEntry = {
  method: string;
  path: string;
  description?: string;
};

/** Canonical RM API routes (path relative to `/api/v1`). Aliases still work but are not listed here. */
export const ROUTE_CATALOG: RouteEntry[] = [
  { method: "GET", path: "/health", description: "Service health check" },

  { method: "POST", path: "/auth/login", description: "Login with username + password" },
  { method: "POST", path: "/auth/send-otp", description: "Send OTP to RM phone" },
  { method: "POST", path: "/auth/verify-otp", description: "Verify OTP and issue token" },

  { method: "GET", path: "/stores/list", description: "List onboarded stores for RM (GET query or POST body)" },
  { method: "POST", path: "/stores/list", description: "List onboarded stores for RM" },
  { method: "POST", path: "/stores/onboard", description: "Onboard a new store" },
  { method: "POST", path: "/stores/update", description: "Update store by mobile" },

  { method: "POST", path: "/products/search", description: "Search products in a store" },
  { method: "POST", path: "/products/loose/search", description: "Search loose products" },
  { method: "POST", path: "/products/list-with-attributes", description: "List store products with attributes" },
  { method: "POST", path: "/products/add-with-attributes", description: "Add product with variants" },
  { method: "POST", path: "/products/update-with-attributes", description: "Update product with variants" },
  { method: "POST", path: "/products/soft-delete", description: "Soft-delete a product" },

  { method: "POST", path: "/non_onboarded_store", description: "Create/update non-onboarded store" },
  { method: "POST", path: "/non_onboarded_store/list", description: "List non-onboarded stores" },

  { method: "POST", path: "/rm_checkout", description: "RM store check-in / check-out" },
  { method: "POST", path: "/onboarding-image-upload", description: "Upload KYC / store images (multipart)" },

  { method: "GET", path: "/todos", description: "Dev scaffold — list todos" },
  { method: "POST", path: "/todos", description: "Dev scaffold — create todo" },
  { method: "PATCH", path: "/todos/:id", description: "Dev scaffold — update todo" },
];

export function getRoutesWithUrls() {
  const prefix = getApiPrefix();
  return ROUTE_CATALOG.map((route) => ({
    ...route,
    url: `${prefix}${route.path}`,
  }));
}
