# HelloChotu RM App — Postman

## URL pattern

```
{{base_url}}/api/{{api_version}}/...
```

| Variable | Production | Local |
|----------|------------|-------|
| `base_url` | `https://rmapi.hellochotu.com` | `http://localhost:4001` |
| `api_version` | `v1` (default) | `v1` (default) |

**Examples:**
- Health: `GET {{base_url}}/api/{{api_version}}/health`
- Store onboard: `POST {{base_url}}/api/{{api_version}}/stores/onboard`

## Import

1. Import collection + environments
2. Select **Production** or **Local**

## Quick test

1. `GET {{base_url}}/api/{{api_version}}/health`
2. `GET {{base_url}}/api/{{api_version}}` (route index)
3. Auth → Stores → Products
