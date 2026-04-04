# Self-hosted Fonts

NUTbits uses these fonts (loaded locally, no CDN):

- **Plus Jakarta Sans** (400, 500, 600, 700) — body text
- **JetBrains Mono** (400, 500) — code, monospace

## Adding the font files

Download the `.woff2` files and place them here:

```
fonts/
  plus-jakarta-sans-400.woff2
  plus-jakarta-sans-500.woff2
  plus-jakarta-sans-600.woff2
  plus-jakarta-sans-700.woff2
  jetbrains-mono-400.woff2
  jetbrains-mono-500.woff2
```

Sources:
- Plus Jakarta Sans: https://fonts.google.com/specimen/Plus+Jakarta+Sans
- JetBrains Mono: https://www.jetbrains.com/lp/mono/

Without these files, the GUI falls back to system fonts (`system-ui` / `ui-monospace`).
