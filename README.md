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

All paths below are relative to `/api/v1`. Import Postman collection: `postman/HelloChotu_RM_App.postman_collection.json`.

**Auth:** `POST /auth/login`, `POST /auth/send-otp`, `POST /auth/verify-otp`

**Master & categories:** `GET|POST /master-data`, `GET|POST /categories`, `POST /categories/by-type`, `POST /pincode`

**Stores:** `GET|POST /stores/list`, `POST /stores/search`, `POST /stores/send-otp`, `POST /stores/verify-otp`, `POST /stores/onboard`, `POST /stores/update`

**Products:** `POST /products/search`, `POST /products/loose/search`, `POST /products/list-with-attributes`, `POST /products/add-with-attributes`, `POST /products/update-with-attributes`, `POST /products/soft-delete`

**Non-onboarded:** `POST /non_onboarded_store`, `POST /non_onboarded_store/list`, `POST /non_onboarded_store/search`

**Other:** `POST /rm_checkout`, `POST /onboarding-image-upload` (multipart), `GET /health`, `GET /` (route index)
