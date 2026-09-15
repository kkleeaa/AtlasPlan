(function bootstrapAtlasReliability(global) {
  const FALLBACK_DATA = global.AtlasFallbackData || { planSummary: { strengths: [], challenges: [], objectives: [] }, modules: {} };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchWithRetry(url, options = {}, config = {}) {
    const maxRetries = config.attempts ?? 3;
    const timeoutMs = config.timeoutMs || 10000;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok) {
          const payload = await response.clone().json().catch(() => ({}));
          const error = new Error(payload.error || `Kërkesa dështoi (${response.status}).`);
          error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
          if (!error.retryable) throw error;
          throw error;
        }
        return response;
      } catch (error) {
        lastError = error;
        const retryable = error.name === "AbortError" || error instanceof TypeError || error.retryable;
        if (!retryable || attempt === maxRetries) break;
        await wait(1000 * (2 ** attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError || new Error("Kërkesa dështoi.");
  }

  function sanitizeTtsText(value) {
    return String(value || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[*_~`#>\[\]{}()"“”'‘’]/g, " ")
      .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, " ")
      .replace(/[^\p{L}\p{N}\s.,!?;:ëËçÇ-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function chunkTtsText(value, maxLength = 249) {
    const clean = sanitizeTtsText(value);
    const chunks = [];
    let remaining = clean;
    while (remaining.length > maxLength) {
      let splitAt = Math.max(remaining.lastIndexOf(". ", maxLength), remaining.lastIndexOf(" ", maxLength));
      if (splitAt < 1) splitAt = maxLength;
      chunks.push(remaining.slice(0, splitAt + 1).trim());
      remaining = remaining.slice(splitAt + 1).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }

  function cloneFallbackModule(moduleName) {
    const data = FALLBACK_DATA.modules[moduleName];
    return data ? JSON.parse(JSON.stringify(data)) : null;
  }

  global.AtlasReliability = Object.freeze({ FALLBACK_DATA, fetchWithRetry, sanitizeTtsText, chunkTtsText, cloneFallbackModule });
})(window);
