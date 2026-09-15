# AtlasPlan reliability layer

AtlasPlan is a browser JavaScript and Express application, so the requested
`fallbackData.ts` is implemented as `js/fallbackData.js` and loaded before the
application scripts. This keeps the current no-build deployment working.

## Browser API calls

Use the shared helper for text, image, and audio requests:

```js
const response = await window.AtlasReliability.fetchWithRetry(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
}, { attempts: 3, timeoutMs: 10000 });
```

It retries network errors, timeouts, HTTP 408, HTTP 429, and HTTP 5xx responses.
There are up to three retries after the initial request, with delays of one, two,
and four seconds. The fourth failed request is thrown immediately.

Ordinary JSON and TTS calls use the default ten-second request timeout. OpenAI
image generation and reference-image editing use a 120-second timeout because a
ten-page illustrated book cannot reliably finish individual image requests in
ten seconds; the UI continues showing page-generation progress throughout.

## Module fallbacks

When generation fails, obtain an isolated copy of the module data and render it
through the normal renderer:

```js
const fallback = window.AtlasReliability.cloneFallbackModule(moduleId);
showModuleWarning("Gjenerimi online nuk u përfundua. Po shfaqet materiali rezervë.");
renderModule(fallback, { useOfflineImages: true });
```

`js/fallbackData.js` contains Albanian fallback content for sequences,
flashcards, the AAC communication board, and the ten-page virtual book.

## Structured OpenAI responses

Every structured `gpt-4o-mini` handler in `backend/server.js` uses JSON mode,
temperature `0.2`, the shared strict Albanian system instruction, and
`parseJsonObject()` before returning data to the browser. Add future structured
handlers in the same form:

```js
const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  temperature: 0.2,
  response_format: { type: "json_object" },
  messages: enforceJsonMessages(messages)
});
const data = parseJsonObject(completion.choices[0]?.message?.content);
```

Validate required arrays and fields after parsing, before sending `data` to the
client.

## Text to speech

Sanitize and split speech before calling the endpoint:

```js
const chunks = window.AtlasReliability.chunkTtsText(sentence, 249);
for (const text of chunks) {
  // POST { text } with fetchWithRetry, then play the returned Blob in order.
}
```

The backend sanitizes and caps the text again, so malformed clients cannot send
oversized or formatting-heavy speech payloads.
