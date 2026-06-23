# Security Notes

## API key storage

The Gemini API key is stored **only** in the `.env` file as the `GEMINI_API_KEY`
environment variable. `.env` is listed in `.gitignore` and is never committed to the
repository. Use `.env.example` as a template.

## Why the frontend has no direct access to the API key

Embedding an API key in browser-side JavaScript would expose it to anyone who opens
DevTools or inspects the page source. A compromised key can be used to make requests
on your behalf until it is revoked.

## How prescription scanning works

All requests to the Gemini API are made by the Node.js server, never by the browser:

```
Browser  →  POST /api/scan-prescription  →  server.js  →  Gemini API
                 { base64Data, mediaType }     (attaches GEMINI_API_KEY as x-goog-api-key header)
```

1. The user selects a file; the browser reads it as a base64 string with `FileReader`.
2. The browser POSTs `{ base64Data, mediaType }` to `/api/scan-prescription`.
3. `server.js` reads `GEMINI_API_KEY` from `process.env`, constructs the Gemini
   `generativelanguage.googleapis.com` request, and forwards the result back to the
   browser as JSON.
4. The API key never leaves the server process.
