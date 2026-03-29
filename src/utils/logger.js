'use strict';

const { config } = require('../config');

/**
 * Simple logger.
 * Levels: error > warn > info > debug
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[config.log.level] ?? LEVELS.info;

function log(level, ...args) {
  if (LEVELS[level] <= currentLevel) {
    const ts = new Date().toISOString();
    console[level === 'debug' ? 'log' : level](`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}

const logger = {
  error: (...args) => log('error', ...args),
  warn:  (...args) => log('warn',  ...args),
  info:  (...args) => log('info',  ...args),
  debug: (...args) => log('debug', ...args),
};

module.exports = { logger };
