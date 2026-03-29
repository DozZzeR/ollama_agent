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

  // Auto-prefix http protocol if missing (models often forget it)
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
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
      'Use for reading web pages, news, weather, or any publicly available data. ' +
      'IMPORTANT: Only use publicly accessible URLs that do NOT require API keys or authentication. ' +
      'Good examples: Google News RSS (news.google.com/rss), Wikipedia, public websites. ' +
      'Bad examples: newsapi.org (needs API key), openweathermap.org (needs API key). ' +
      'If a fetch fails, try a different URL or tell the user the data is unavailable.',
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
  if (url && typeof url === 'string' && !/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

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

  // Parse RSS/Atom XML into readable text
  if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')
      || result.trimStart().startsWith('<?xml')) {
    result = parseRssToText(result);
  }

  // Strip tags from HTML
  else if (contentType.includes('text/html')) {
    result = result
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Truncate very long responses to avoid overwhelming the model
  const MAX_CHARS = 8000;
  if (result.length > MAX_CHARS) {
    result = result.substring(0, MAX_CHARS) + '\n\n[... truncated, total ' + response.data.length + ' chars]';
  }

  return `HTTP ${response.status} ${upperMethod} ${url}\n\n${result}`;
}

/**
 * Parse RSS/Atom XML into a clean readable text list.
 * Uses regex — no external XML parser needed.
 */
function parseRssToText(xml) {
  const items = [];

  // Extract channel/feed title
  const feedTitleMatch = xml.match(/<channel>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i);
  const feedTitle = feedTitleMatch ? feedTitleMatch[1].trim() : 'RSS Feed';

  // Extract <item> or <entry> elements
  const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
    const block = match[1];

    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link') || extractAttr(block, 'link', 'href');
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated');
    const desc = extractTag(block, 'description') || extractTag(block, 'summary') || '';

    // Clean HTML from description
    const cleanDesc = desc
      .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s{2,}/g, ' ')
      .trim();

    items.push({
      title: title || '(no title)',
      link: link || '',
      date: pubDate || '',
      desc: cleanDesc.length > 200 ? cleanDesc.substring(0, 200) + '...' : cleanDesc,
    });
  }

  if (items.length === 0) {
    // Fallback: strip all XML tags
    return xml.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  let text = `📰 ${feedTitle} (${items.length} items)\n\n`;
  items.forEach((item, i) => {
    text += `${i + 1}. ${item.title}\n`;
    if (item.date) text += `   Date: ${item.date}\n`;
    if (item.link) text += `   Link: ${item.link}\n`;
    if (item.desc) text += `   ${item.desc}\n`;
    text += '\n';
  });

  return text;
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 'is');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function extractAttr(block, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

module.exports = { schema, handler };
