import { prisma } from '../prisma';

const SETTING_ID = 'default';
const PROVIDERS = new Set(['google', 'grok']);

export function maskSecret(value) {
  if (!value) return null;
  return `••••${String(value).slice(-4)}`;
}

export function normalizeChatIds(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (!/^-?\d+(\s*,\s*-?\d+)*$/.test(text)) {
    const error = new Error('Chat IDs must be comma-separated numbers.');
    error.status = 400;
    throw error;
  }
  return text.split(',').map((part) => part.trim()).join(',');
}

export async function getAppSetting() {
  return prisma.appSetting.upsert({
    where: { id: SETTING_ID },
    update: {},
    create: { id: SETTING_ID },
  });
}

export function publicAppSetting(row) {
  return {
    telegram_bot_token_set: Boolean(row.telegram_bot_token),
    telegram_bot_token_masked: maskSecret(row.telegram_bot_token),
    telegram_chat_ids: row.telegram_chat_ids || '',
    notify_on_dashboard_runs: Boolean(row.notify_on_dashboard_runs),
    translation_provider: row.translation_provider || 'google',
    grok_api_key_set: Boolean(row.grok_api_key),
    grok_api_key_masked: maskSecret(row.grok_api_key),
    updated_at: row.updated_at,
  };
}

function keepOrReplace(nextValue, currentValue) {
  if (nextValue == null) return currentValue;
  const text = String(nextValue).trim();
  if (!text || text.startsWith('••••')) return currentValue;
  return text;
}

export async function updateAppSetting(input) {
  const current = await getAppSetting();
  const provider = input.translation_provider == null
    ? current.translation_provider
    : String(input.translation_provider);

  if (!PROVIDERS.has(provider)) {
    const error = new Error('Translation provider must be google or grok.');
    error.status = 400;
    throw error;
  }

  const chatIds = input.telegram_chat_ids === undefined
    ? current.telegram_chat_ids
    : normalizeChatIds(input.telegram_chat_ids);

  const data = {
    telegram_bot_token: keepOrReplace(input.telegram_bot_token, current.telegram_bot_token),
    telegram_chat_ids: chatIds,
    notify_on_dashboard_runs: input.notify_on_dashboard_runs == null
      ? current.notify_on_dashboard_runs
      : Boolean(input.notify_on_dashboard_runs),
    translation_provider: provider,
    grok_api_key: keepOrReplace(input.grok_api_key, current.grok_api_key),
  };

  if (provider === 'grok' && !data.grok_api_key) {
    const error = new Error('Add a Grok API key, or choose Google translation.');
    error.status = 400;
    throw error;
  }

  return prisma.appSetting.update({
    where: { id: SETTING_ID },
    data,
  });
}

export async function applyTranslationProvider() {
  const row = await getAppSetting();
  const previous = process.env.GROK_API_KEY;
  if (row.translation_provider === 'grok' && row.grok_api_key) {
    process.env.GROK_API_KEY = row.grok_api_key;
  } else {
    delete process.env.GROK_API_KEY;
  }
  return () => {
    if (previous === undefined) delete process.env.GROK_API_KEY;
    else process.env.GROK_API_KEY = previous;
  };
}
