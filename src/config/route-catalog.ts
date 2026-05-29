import { getApiPrefix } from "./public-url";

export type RouteEntry = {
  method: string;
  path: string;
  description?: string;
  alias?: boolean;
};

/** All RM API routes (path relative to `/api`). */
export const ROUTE_CATALOG: RouteEntry[] = [
  { method: "GET", path: "/health", description: "Service health check" },

  { method: "POST", path: "/auth/login", description: "Login with username + password" },
  { method: "POST", path: "/auth/send-otp", description: "Send OTP to RM phone" },
  { method: "POST", path: "/auth/verify-otp", description: "Verify OTP and issue token" },
  { method: "POST", path: "/auth/request-otp", description: "Alias of send-otp", alias: true },
  { method: "POST", path: "/auth/login-otp", description: "Alias of verify-otp", alias: true },
  { method: "POST", path: "/auth/login-password", description: "Alias of login", alias: true },

  { method: "POST", path: "/stores/list", description: "List onboarded stores for RM" },
  { method: "POST", path: "/stores/search", description: "Alias of stores/list", alias: true },
  { method: "POST", path: "/stores/onboard", description: "Onboard a new store" },

  { method: "POST", path: "/products/search", description: "Search products in a store" },
  { method: "POST", path: "/products/search_v1", description: "Alias of products/search", alias: true },
  { method: "POST", path: "/products/loose/search", description: "Search loose products" },
  { method: "POST", path: "/products/list-with-attributes", description: "List store products with attributes" },
  { method: "POST", path: "/products/list_with_attributes", description: "Alias (underscore)", alias: true },
  { method: "POST", path: "/products/add-with-attributes", description: "Add product with variants" },
  { method: "POST", path: "/products/add_with_attributes", description: "Alias (underscore)", alias: true },
  { method: "POST", path: "/products/soft-delete", description: "Soft-delete a product" },
  { method: "POST", path: "/products/soft_delete", description: "Alias (underscore)", alias: true },

  { method: "POST", path: "/non_onboarded_store", description: "Create/update non-onboarded store" },
  { method: "POST", path: "/non_onboarded_store/list", description: "List non-onboarded stores" },
  { method: "POST", path: "/non_onboarded_store/search", description: "Alias of list", alias: true },

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
