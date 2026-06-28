const axios = require('axios');

// Hardcoded metadata for the 5 requested models as a fallback or default.
const DEFAULT_MODELS = {
  'openai/gpt-audio-mini': {
    id: 'openai/gpt-audio-mini',
    name: 'OpenAI: GPT Audio Mini',
    description: 'Cost-efficient audio model from OpenAI. Delivers clean, natural-sounding voices and excellent consistency.',
    pricing: {
      prompt: '0.0000006', // $0.60 / M input tokens
      completion: '0.0000024', // $2.40 / M output tokens
      unit: 'token'
    },
    voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
    response_format: 'pcm'
  },
  'openai/gpt-audio': {
    id: 'openai/gpt-audio',
    name: 'OpenAI: GPT Audio',
    description: 'High-performance audio model from OpenAI. Upgraded decoder for superior voice quality and consistency.',
    pricing: {
      prompt: '0.0000025', // $2.50 / M input tokens
      completion: '0.00001', // $10.00 / M output tokens
      unit: 'token'
    },
    voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
    response_format: 'pcm'
  },
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
      { id: 'bm_george', name: 'UK Male: George' }
    ],
    response_format: 'pcm'
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
    voices: ['en_paul_neutral'],
    response_format: 'mp3'
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
    response_format: 'pcm'
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
    const res = await axios.get('https://openrouter.ai/api/v1/models');
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
          }
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
async function generateSpeech(modelId, text, voice) {
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
