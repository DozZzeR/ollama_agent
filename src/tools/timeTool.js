'use strict';

// ── Tool schema ───────────────────────────────────────────────────────────────

const schema = {
  type: 'function',
  function: {
    name: 'get_current_time',
    description:
      'Returns the current date and time in UTC and local server time. ' +
      'Use when the user asks about current time, date, day of the week, etc.',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description:
            'Optional IANA timezone string (e.g. "Europe/Kyiv", "America/New_York"). ' +
            'If not provided, returns UTC.',
        },
      },
      required: [],
    },
  },
};

// ── Tool handler ──────────────────────────────────────────────────────────────

/**
 * @param {object} args
 * @param {string} [args.timezone]
 * @returns {Promise<string>}
 */
async function handler({ timezone } = {}) {
  const now = new Date();

  const utcStr = now.toISOString();

  let localStr = null;
  if (timezone) {
    try {
      localStr = now.toLocaleString('en-US', {
        timeZone: timezone,
        dateStyle: 'full',
        timeStyle: 'long',
      });
    } catch {
      localStr = `Invalid timezone: "${timezone}"`;
    }
  }

  const result = {
    utc: utcStr,
    unix_timestamp: Math.floor(now.getTime() / 1000),
    ...(localStr ? { local: localStr, timezone } : {}),
  };

  return JSON.stringify(result, null, 2);
}

module.exports = { schema, handler };
