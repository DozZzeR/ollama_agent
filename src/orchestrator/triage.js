'use strict';

const { logger } = require('../utils/logger');

// Heuristic keyword markers — used as optimization to skip tools for trivial messages.
// NOT a gate: even if no markers match, borderline cases go to TOOL_LOOP.
const MARKERS = {
  multiIntent: [
    'сначала', 'потом', 'затем', 'после этого', 'и еще', 'также',
    'сравни', 'проанализируй', 'проверь', 'собери', 'составь', 'разбей',
    'по шагам', 'найди и', 'прочитай и',
    'first', 'then', 'after that', 'also', 'compare', 'analyze', 'review',
    'collect', 'prepare', 'break down', 'step by step', 'find and', 'read and'
  ],
  needsTools: [
    // File/document access
    'файл', 'документ', 'pdf', 'таблица', 'ссылка', 'url', 'репозиторий',
    'прочитай файл', 'посмотри сайт',
    'file', 'document', 'pdf', 'sheet', 'url', 'link', 'repo',
    'browse', 'search', 'open file',
    // Internet/search/realtime data
    'новост', 'погод', 'курс', 'цен', 'котировк',
    'найди', 'узнай', 'посмотри', 'загугли', 'поищи',
    'свежи', 'актуальн', 'последни',
    'что происходит', 'что нового',
    'интернет', 'онлайн', 'сайт', 'веб',
    'news', 'weather', 'price', 'stock', 'rate',
    'look up', 'google', 'fetch', 'latest', 'current',
    'what is happening', 'what\'s new',
    // Memory/preferences/tool awareness
    'запомни', 'сохрани', 'запиши', 'не забуд',
    'тулз', 'инструмент', 'функци', 'возможност',
    'предпочтени', 'настрой', 'стиль ответ',
    'remember', 'save', 'prefer', 'tool', 'capabilit',
    'не спрашивай', 'не задавай', 'формат ответ',
    'сколько время', 'который час', 'what time', 'current time'
  ],
  artifact: [
    'отчет', 'саммари', 'план', 'письмо',
    'report', 'summary', 'plan', 'draft'
  ],
  highRisk: [
    'деньги', 'договор', 'медицина', 'сервер', 'прод', 'доступ', 'удалить',
    'payment', 'legal', 'medical', 'server', 'production', 'access', 'delete'
  ]
};

class Triage {
  /**
   * @param {import('../llm/ollamaProvider').OllamaProvider} llm
   */
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Evaluate user message. Returns { decision, score }.
   * score ≤ 1 → DIRECT (no tools, simple chat)
   * score ≥ 2 → TOOL_LOOP (tools available, model decides)
   *
   * @param {string} text
   * @returns {Promise<{ decision: 'DIRECT'|'TOOL_LOOP', score: number }>}
   */
  async evaluate(text) {
    if (!text) return { decision: 'DIRECT', score: 0 };

    const lower = text.toLowerCase();
    let score = 0;

    if (text.length > 200) score += 1;
    if (this._hasMatch(lower, MARKERS.multiIntent)) score += 2;
    if (this._hasMatch(lower, MARKERS.needsTools)) score += 2;
    if (this._hasMatch(lower, MARKERS.artifact)) score += 1;
    if (this._hasMatch(lower, ['зависи', 'depends'])) score += 2;
    if (this._hasMatch(lower, MARKERS.highRisk)) score += 1;

    const decision = score >= 2 ? 'TOOL_LOOP' : 'DIRECT';

    logger.info(`[Triage] score=${score} decision=${decision} ("${text.substring(0, 40)}...")`);

    return { decision, score };
  }

  _hasMatch(text, markers) {
    return markers.some(m => text.includes(m.toLowerCase()));
  }
}

module.exports = { Triage };
