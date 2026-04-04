# App Icons

This directory contains icons for apps in the NUTbits app catalog.

Icons are used in the **connection wizard** (manual NWC flow) and the **deeplink approval screen** (automatic flow).

## Naming Convention

```
{app-id}.png
```

The filename **must match** the `id` field in the app registry (`api/deeplink-apps.js` for deeplink apps, `gui/src/data/appCatalog.js` for wizard apps).

Examples:
- `buho-jump.png` matches `id: 'buho-jump'`
- `damus.png` matches `id: 'damus'`
- `alby-go.png` matches `id: 'alby-go'`

## Image Spec

| Property | Requirement |
|----------|-------------|
| Format | PNG (transparent background preferred) |
| Size | 256x256 px (minimum 128x128) |
| Shape | Square. The UI renders it in a circle — keep content centered with some padding. |
| File size | Under 50 KB |

## Adding Your Icon

1. Export your app icon as a square PNG
2. Name it `{your-app-id}.png`
3. Drop it in this directory
4. Include it in your PR alongside your catalog entry

If no icon is provided, the UI shows the first letter of your app name as a fallback.
