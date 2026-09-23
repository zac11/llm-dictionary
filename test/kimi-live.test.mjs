import test from 'node:test';
import assert from 'node:assert/strict';
import { completionOptions, getLlmConfig } from '../netlify/functions/ask.mjs';

const enabled = process.env.RUN_KIMI_LIVE === '1';

test('live Kimi chat completion returns usable content within the function budget', { skip: !enabled }, async () => {
  const config = getLlmConfig();
  assert.ok(config, 'Set LLM_API_KEY, LLM_BASE_URL, and LLM_MODEL before running the live Kimi test.');
  assert.match(config.model, /kimi/i, `LLM_MODEL must be a Kimi model, received “${config.model}”.`);

  const controller = new AbortController();
  const timeoutMs = 18000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  let response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: 'Reply briefly and without markdown.' },
          { role: 'user', content: 'Reply with exactly: KIMI_API_OK' },
        ],
        ...completionOptions(config.model),
        max_tokens: 80,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      assert.fail(`Kimi did not return within ${timeoutMs / 1000} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const elapsedMs = performance.now() - started;
  const raw = await response.text();
  assert.equal(response.ok, true, `Kimi returned HTTP ${response.status}: ${raw.slice(0, 500)}`);

  let data;
  assert.doesNotThrow(() => {
    data = JSON.parse(raw);
  }, `Kimi returned non-JSON content: ${raw.slice(0, 500)}`);
  const content = String(data?.choices?.[0]?.message?.content || '').trim();
  assert.ok(content, `Kimi response did not contain choices[0].message.content: ${raw.slice(0, 500)}`);
  assert.match(content, /KIMI_API_OK/i);
  assert.ok(elapsedMs < timeoutMs, `Kimi took ${(elapsedMs / 1000).toFixed(2)} seconds.`);

  console.log(`Kimi live response: model=${config.model} latency=${(elapsedMs / 1000).toFixed(2)}s`);
});
