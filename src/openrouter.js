const axios = require('axios');

// Hardcoded metadata for the requested models as a fallback or default.
const DEFAULT_MODELS = {
  'hexgrad/kokoro-82m': {
    id: 'hexgrad/kokoro-82m',
    name: 'Hexgrad: Kokoro 82M',
    description: 'Ultra-lightweight, lightning-fast open-weight TTS model. Delivers exceptionally natural-sounding speech.',
    pricing: {
      prompt: '0.00000062', // $0.62 / M characters
      completion: '0.00000062',
      unit: 'character'
    },
    voices: [
      { id: 'af_heart', name: 'US Female: Heart' },
      { id: 'af_bella', name: 'US Female: Bella' },
      { id: 'af_nicole', name: 'US Female: Nicole' },
      { id: 'af_sarah', name: 'US Female: Sarah' },
      { id: 'am_adam', name: 'US Male: Adam' },
      { id: 'am_michael', name: 'US Male: Michael' },
      { id: 'bf_emma', name: 'UK Female: Emma' },
      { id: 'bm_george', name: 'UK Male: George' },
      { id: 'ef_dora', name: 'ES Female: Dora' },
      { id: 'em_alex', name: 'ES Male: Alex' },
      { id: 'ff_siwis', name: 'FR Female: Siwis' },
      { id: 'if_sara', name: 'IT Female: Sara' },
      { id: 'im_nicola', name: 'IT Male: Nicola' },
      { id: 'jf_alpha', name: 'JA Female: Alpha' },
      { id: 'pf_dora', name: 'PT Female: Dora' },
      { id: 'zf_xiaobei', name: 'ZH Female: Xiaobei' }
    ],
    response_format: 'pcm',
    supportsLanguage: true,
    supportsInstructions: false,
    languages: [
      { code: 'en-US', name: 'English (United States)' },
      { code: 'en-GB', name: 'English (United Kingdom)' },
      { code: 'es-ES', name: 'Spanish (Spain)' },
      { code: 'fr-FR', name: 'French (France)' },
      { code: 'it-IT', name: 'Italian (Italy)' },
      { code: 'ja-JP', name: 'Japanese (Japan)' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' },
      { code: 'zh-CN', name: 'Chinese (Simplified)' }
    ]
  },
  'mistralai/voxtral-mini-tts-2603': {
    id: 'mistralai/voxtral-mini-tts-2603',
    name: 'Mistral: Voxtral Mini TTS',
    description: 'Mistral\'s specialized text-to-speech model featuring zero-shot voice cloning capabilities.',
    pricing: {
      prompt: '0.000016', // $16.00 / M characters
      completion: '0.000016',
      unit: 'character'
    },
    voices: [
      { id: 'en_paul_neutral', name: 'EN: Paul (Neutral)' },
      { id: 'gb_oliver_neutral', name: 'GB: Oliver (Neutral)' },
      { id: 'gb_jane_neutral', name: 'GB: Jane (Neutral)' },
      { id: 'fr_marie_neutral', name: 'FR: Marie (Neutral)' }
    ],
    response_format: 'mp3',
    supportsLanguage: true,
    supportsInstructions: true,
    defaultInstructions: 'A slow clear voice suitable for ESL students.',
    languages: [
      { code: 'en-US', name: 'English (United States)' },
      { code: 'en-GB', name: 'English (United Kingdom)' },
      { code: 'fr-FR', name: 'French (France)' }
    ]
  },
  'google/gemini-3.1-flash-tts-preview': {
    id: 'google/gemini-3.1-flash-tts-preview',
    name: 'Google: Gemini 3.1 Flash TTS Preview',
    description: 'High-performance TTS model supporting 70+ languages and 200+ inline audio tags (e.g. [whispers], [laughs]).',
    pricing: {
      prompt: '0.000001', // $1.00 / M input tokens
      completion: '0.00002', // $20.00 / M output tokens
      unit: 'token'
    },
    voices: [
      { id: 'Puck', name: 'Upbeat Male: Puck' },
      { id: 'Zephyr', name: 'Bright Female: Zephyr' },
      { id: 'Charon', name: 'Charon' },
      { id: 'Kore', name: 'Kore' },
      { id: 'Fenrir', name: 'Fenrir' },
      { id: 'Aoede', name: 'Aoede' }
    ],
    response_format: 'pcm',
    supportsLanguage: true,
    supportsInstructions: true,
    defaultInstructions: 'A slow clear voice suitable for ESL students.',
    languages: [
      { code: 'en-US', name: 'English (United States)' },
      { code: 'en-GB', name: 'English (United Kingdom)' },
      { code: 'es-ES', name: 'Spanish (Spain)' },
      { code: 'fr-FR', name: 'French (France)' },
      { code: 'de-DE', name: 'German (Germany)' },
      { code: 'it-IT', name: 'Italian (Italy)' },
      { code: 'ja-JP', name: 'Japanese (Japan)' },
      { code: 'ko-KR', name: 'Korean (South Korea)' },
      { code: 'zh-CN', name: 'Chinese (Simplified)' },
      { code: 'hi-IN', name: 'Hindi (India)' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' }
    ]
  }
};

let cachedModels = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Helper to get a model configuration, using cache if available, falling back to default presets.
 */
function getModelFromCache(modelId) {
  if (cachedModels && cachedModels[modelId]) {
    return cachedModels[modelId];
  }
  return DEFAULT_MODELS[modelId];
}

/**
 * Fetches available models from OpenRouter and merges them with the target models list.
 */
async function getModels() {
  const now = Date.now();
  if (cachedModels && (now - lastFetchTime < CACHE_TTL)) {
    return cachedModels;
  }

  try {
    const res = await axios.get('https://openrouter.ai/api/v1/models?output_modalities=speech');
    const apiModels = res.data.data || [];
    
    // Map of target models to return
    const modelsList = {};
    
    for (const [id, defaultMeta] of Object.entries(DEFAULT_MODELS)) {
      const apiModel = apiModels.find(m => m.id === id);
      if (apiModel) {
        // Merge API details (such as current pricing) with our local presets (which contain friendly names and voices lists)
        modelsList[id] = {
          ...defaultMeta,
          name: apiModel.name || defaultMeta.name,
          description: apiModel.description || defaultMeta.description,
          pricing: {
            ...defaultMeta.pricing,
            prompt: apiModel.pricing?.prompt || defaultMeta.pricing.prompt,
            completion: apiModel.pricing?.completion || defaultMeta.pricing.completion
          },
          voices: apiModel.supported_voices && apiModel.supported_voices.length > 0
            ? apiModel.supported_voices
            : defaultMeta.voices
        };
      } else {
        // Fallback to defaults
        modelsList[id] = defaultMeta;
      }
    }
    
    cachedModels = modelsList;
    lastFetchTime = now;
    return modelsList;
  } catch (err) {
    console.warn('Failed to fetch models from OpenRouter API, falling back to defaults:', err.message);
    if (cachedModels) {
      return cachedModels;
    }
    return DEFAULT_MODELS;
  }
}

/**
 * Sends a TTS generation request to OpenRouter and returns the output audio buffer.
 */
async function generateSpeech(modelId, text, voice, language, instructions) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured in the environment variables.');
  }

  const model = getModelFromCache(modelId);
  const responseFormat = (model && model.response_format) || 'pcm';

  // Construct request payload
  const payload = {
    model: modelId,
    input: text,
    response_format: responseFormat
  };

  // Only include voice parameter if one is selected/supported
  if (voice) {
    payload.voice = voice;
  }

  // Include guide prompt instructions if provided
  if (instructions && instructions.trim()) {
    payload.instructions = instructions.trim();
  }

  // Handle language configuration
  if (language) {
    if (modelId === 'google/gemini-3.1-flash-tts-preview') {
      payload.provider = payload.provider || { options: { google: {} } };
      payload.provider.options = payload.provider.options || {};
      payload.provider.options.google = payload.provider.options.google || {};
      payload.provider.options.google.speech_config = {
        language_code: language
      };
    } else {
      payload.language = language;
    }
  }

  if (instructions && instructions.trim() && modelId === 'google/gemini-3.1-flash-tts-preview') {
    payload.provider = payload.provider || { options: { google: {} } };
    payload.provider.options = payload.provider.options || {};
    payload.provider.options.google = payload.provider.options.google || {};
    payload.provider.options.google.instructions = instructions.trim();
  }

  // Standard OpenRouter Audio Speech Endpoint
  const response = await axios.post(
    'https://openrouter.ai/api/v1/audio/speech',
    payload,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Text-to-mp3 TTS Application'
      },
      responseType: 'arraybuffer'
    }
  );

  return Buffer.from(response.data);
}

module.exports = {
  getModels,
  generateSpeech,
  DEFAULT_MODELS,
  getModelFromCache
};
