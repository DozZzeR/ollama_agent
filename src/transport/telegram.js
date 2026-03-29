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
        '👋 Привет! Я AI-агент на Ollama.\n' +
        'Отправьте мне сообщение — я постараюсь помочь.\n\n' +
        'Команды:\n' +
        '  /reset — очистить историю диалога\n' +
        '  /tools — принудительно использовать инструменты для следующего сообщения\n' +
        '  /start — показать это сообщение'
      );
    });

    // /tools command — force TOOL_LOOP for next message
    this.bot.command('tools', (ctx) => {
      const sessionId = ctx.chat.id;
      const reply = this.controller.handleTogglePlan(sessionId);
      ctx.reply(reply);
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

      let streamMessageId = null;
      let streamText = '';

      const onEvent = async (event) => {
        try {
          if (event.type === 'plan_generated') {
            streamText = `📝 **Execution Plan:**\n${event.data}\n\n`;
            const sentMsg = await ctx.reply(streamText);
            streamMessageId = sentMsg.message_id;
          } else if (event.type === 'tool_start') {
            streamText += `⏳ Calling: \`${event.data}\`...\n`;
            if (streamMessageId) {
              await ctx.telegram.editMessageText(ctx.chat.id, streamMessageId, null, streamText);
            } else {
              const sentMsg = await ctx.reply(streamText);
              streamMessageId = sentMsg.message_id;
            }
          } else if (event.type === 'tool_end') {
            streamText = streamText.replace(`⏳ Calling: \`${event.data}\`...`, `✅ Completed: \`${event.data}\``);
            if (streamMessageId) {
              await ctx.telegram.editMessageText(ctx.chat.id, streamMessageId, null, streamText);
            }
          }
        } catch (e) {
          logger.warn(`[Telegram] Error updating live message: ${e.message}`);
        }
      };

      try {
        let reply = await this.controller.handle({ sessionId, text, onEvent });
        
        // Strip out any zero-width characters and spaces to verify it's not effectively empty
        const cleaned = (reply || '').toString().replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        if (cleaned.length === 0) {
          reply = '⚠️ (Response generated, check action logs / model returned invisible characters)';
        }
        
        await ctx.reply(reply);
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
