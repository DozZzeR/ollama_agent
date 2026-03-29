'use strict';

const { Telegraf } = require('telegraf');
const { config } = require('../config');
const { logger } = require('../utils/logger');

/**
 * Telegram Transport Layer.
 *
 * Responsibilities:
 *   - Initialize and start the Telegraf bot
 *   - Subscribe to messages and commands
 *   - Normalize Telegram context to { sessionId, text } and pass to controller
 *   - Send replies back to the user
 *   - Enforce chat ID allowlist (if configured)
 *
 * This layer does NOT contain any business logic or LLM interaction.
 */
class TelegramTransport {
  /**
   * @param {object} deps
   * @param {import('../controller/messageController').MessageController} deps.controller
   */
  constructor({ controller }) {
    this.controller = controller;
    this.bot = new Telegraf(config.telegram.botToken);
    this._setupHandlers();
  }

  /**
   * Register all bot event handlers.
   */
  _setupHandlers() {
    // Middleware: allowlist check
    this.bot.use((ctx, next) => {
      const chatId = ctx.chat?.id;
      const allowed = config.telegram.allowedChatIds;

      if (allowed.length > 0 && !allowed.includes(chatId)) {
        logger.warn(`[Telegram] Blocked message from chatId=${chatId}`);
        return; // silently ignore
      }

      return next();
    });

    // /start command
    this.bot.command('start', (ctx) => {
      ctx.reply(
        '👋 Hello! I am an AI agent powered by Ollama.\n' +
        'Send me a message and I will do my best to help.\n\n' +
        'Commands:\n' +
        '  /reset — clear conversation history\n' +
        '  /start — show this message'
      );
    });

    // /reset command
    this.bot.command('reset', (ctx) => {
      const sessionId = ctx.chat.id;
      const reply = this.controller.handleReset(sessionId);
      ctx.reply(reply);
    });

    // Regular text messages
    this.bot.on('text', async (ctx) => {
      const sessionId = ctx.chat.id;
      const text = ctx.message.text;

      // Show typing indicator
      ctx.sendChatAction('typing').catch(() => {});

      try {
        const reply = await this.controller.handle({ sessionId, text });
        await ctx.reply(reply, { parse_mode: 'Markdown' });
      } catch (err) {
        logger.error('[Telegram] Error handling message:', err.message);
        await ctx.reply('⚠️ An error occurred while processing your message. Please try again.');
      }
    });

    // Handle errors
    this.bot.catch((err, ctx) => {
      logger.error('[Telegram] Bot error:', err.message, 'Update:', ctx?.update);
    });
  }

  /**
   * Start the bot (long polling).
   * @returns {Promise<void>}
   */
  async start() {
    const botInfo = await this.bot.telegram.getMe();
    logger.info(`[Telegram] Bot started: @${botInfo.username}`);
    await this.bot.launch();
  }

  /**
   * Gracefully stop the bot.
   */
  stop() {
    this.bot.stop();
    logger.info('[Telegram] Bot stopped');
  }
}

module.exports = { TelegramTransport };
