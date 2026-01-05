function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retryWithBackoff(fn, attempts = 3, baseDelayMs = 500, maxDelayMs = 5000) {
  let attempt = 0;
  let lastErr;
  while (attempt < attempts) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      attempt++;
      if (attempt >= attempts) break;
      // Exponential backoff with jitter
      const expo = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = Math.floor(Math.random() * (expo / 2));
      const delay = expo + jitter;
      await sleep(delay);
    }
  }
  throw lastErr;
}
