# RM Backend (simple)

Minimal Express + TypeScript backend with an MVC-ish structure:

- `src/routes` → route definitions
- `src/controllers` → request handlers
- `src/services` → business logic
- `src/models` → types / models

## Run

```bash
cd rm_api
npm install
npm run dev
```

## Production

| | |
|---|---|
| Base URL | `https://rmapi.hellochotu.com` |
| API v1 | `https://rmapi.hellochotu.com/api/v1` |
| Health (v1) | [https://rmapi.hellochotu.com/api/v1/health](https://rmapi.hellochotu.com/api/v1/health) |
| Legacy (unversioned) | `/api/*` still works (e.g. `/api/health`) |

Set in `.env` on the server:

```
API_BASE_URL=https://rmapi.hellochotu.com
API_VERSION=v1
```

**Route index:** `GET https://rmapi.hellochotu.com/api/v1` returns every route with full URLs.

## Endpoints

All paths below are relative to `/api/v1` (e.g. `POST /api/v1/auth/login`).

- `GET /api/v1` — route catalog + version info
- `GET /api/v1/health` — includes `version` (package) and `apiVersion` (`v1`)
- `POST /api/auth/login` body: `{ "username": "...", "password": "..." }`
- `POST /api/auth/send-otp` body: `{ "phone": "...", "role": "rm" }`
- `POST /api/auth/verify-otp` body: `{ "phone": "...", "otp": "...", "role": "rm" }`
- `POST /api/auth/request-otp` — alias of send-otp
- `POST /api/auth/login-otp` — alias of verify-otp
- `POST /api/auth/login-password` — alias of login
- `POST /api/onboarding-image-upload` (multipart/form-data) fields: `image` (optional file), `image_type` (required when image provided)
- `POST /api/non_onboarded_store/list` body: `{ "rm_id": "...", "keyword": "...", "page": 1, "limit": 10 }`
- `POST /api/stores/list` body: `{ "rm_id": "...", "keyword": "...", "status": "...", "page": 1, "limit": 10 }`
- `POST /api/stores/onboard` body: (same JSON keys as your PHP onboarding)
- `POST /api/rm_checkout` body: `{ "rm_id": "...", "store_id": "...", "checkin_date_time?": "...", "checkout_type?": "manual" }`
- `POST /api/products/search` body: `{ "store_id": "...", "keyword?": "...", "page?": 1, "limit?": 20 }`
- `POST /api/products/loose/search` body: `{ "keyword?": "...", "page?": 1, "limit?": 20 }`
- `POST /api/products/list-with-attributes` body: `{ "store_id": "...", "page?": 1, "limit?": 20 }`
- `POST /api/products/add-with-attributes` body: (same JSON keys as your PHP add-product API)
- `POST /api/products/soft-delete` body: `{ "rm_id": "...", "store_id": "...", "product_id": "..." }`
- `GET /api/todos`
- `POST /api/todos` body: `{ "title": "..." }`
- `PATCH /api/todos/:id` body: `{ "done": true }`
