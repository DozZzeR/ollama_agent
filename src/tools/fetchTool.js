'use strict';

const axios = require('axios');
const { logger } = require('../utils/logger');
const { config } = require('../config');

// Private IP ranges & localhost — blocked by default
const BLOCKED_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/0\.0\.0\.0/,
  /^https?:\/\/10\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/169\.254\./,
  /^https?:\/\/::1/,
];

/**
 * Validate URL against security rules.
 * @param {string} url
 * @throws {Error} if URL is blocked
 */
function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: "${url}"`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported protocol: "${parsed.protocol}". Only http/https allowed.`);
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(url)) {
      throw new Error(`URL is blocked (private/local network): "${url}"`);
    }
  }
}

// ── Tool schema (Ollama / OpenAI compatible) ──────────────────────────────────

const schema = {
  type: 'function',
  function: {
    name: 'http_fetch',
    description:
      'Fetch content from a public URL via HTTP GET or POST. ' +
      'Use for reading web pages, calling public APIs, or retrieving JSON data. ' +
      'Private/local URLs are not allowed.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The full URL to fetch (must be http or https)',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST'],
          description: 'HTTP method. Defaults to GET.',
        },
        headers: {
          type: 'object',
          description: 'Optional HTTP headers as key-value pairs',
        },
        body: {
          type: 'object',
          description: 'Optional JSON body for POST requests',
        },
      },
      required: ['url'],
    },
  },
};

// ── Tool handler ──────────────────────────────────────────────────────────────

/**
 * @param {object} args
 * @param {string} args.url
 * @param {string} [args.method='GET']
 * @param {object} [args.headers]
 * @param {object} [args.body]
 * @returns {Promise<string>}
 */
async function handler({ url, method = 'GET', headers = {}, body = null }) {
  validateUrl(url);

  const upperMethod = method.toUpperCase();

  logger.info(`[fetchTool] ${upperMethod} ${url}`);

  const response = await axios({
    method: upperMethod,
    url,
    headers: {
      'User-Agent': 'ollama-agent/1.0',
      Accept: 'application/json, text/plain, */*',
      ...headers,
    },
    data: upperMethod === 'POST' ? body : undefined,
    timeout: config.tool.timeoutMs,
    responseType: 'text',
    maxRedirects: 3,
  });

  const contentType = response.headers['content-type'] || '';
  let result = response.data;

  // Try to parse JSON for cleaner output
  if (contentType.includes('application/json')) {
    try {
      result = JSON.stringify(JSON.parse(result), null, 2);
    } catch {
      // keep raw
    }
  }

  // Strip excessive whitespace from HTML
  if (contentType.includes('text/html')) {
    result = result
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return `HTTP ${response.status} ${upperMethod} ${url}\n\n${result}`;
}

module.exports = { schema, handler };
