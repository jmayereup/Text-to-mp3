require('dotenv').config();
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const fs = require('fs');

const openrouter = require('./src/openrouter');
const ffmpeg = require('./src/ffmpeg');
const r2 = require('./src/r2');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories setup
const PUBLIC_DIR = path.join(__dirname, 'public');
const OUTPUT_DIR = path.join(PUBLIC_DIR, 'output');

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Setup Handlebars
app.engine('handlebars', engine({
  defaultLayout: 'main',
  helpers: {
    json: function (context) {
      return JSON.stringify(context);
    },
    eq: function (a, b) {
      return a === b;
    },
    perMillion: function (price) {
      if (price === undefined || price === null) return '0.00';
      const num = parseFloat(price);
      if (isNaN(num)) return price;
      const val = num * 1000000;
      return val.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
      });
    }
  }
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

// Helper: Estimate TTS Cost in USD
function estimateCost(modelId, textLength) {
  const model = openrouter.getModelFromCache(modelId);
  if (!model) return 0;

  const promptPrice = parseFloat(model.pricing.prompt);
  const completionPrice = parseFloat(model.pricing.completion);

  if (model.pricing.unit === 'character') {
    // Kokoro and Voxtral are priced per character
    return textLength * promptPrice;
  } else {
    // Token-based models (GPT, Gemini)
    // Rule of thumb: 1 token ≈ 4 characters
    const inputTokens = Math.ceil(textLength / 4);
    // TTS outputs audio tokens, which we approximate roughly based on length
    const outputTokens = Math.ceil(textLength / 3);
    
    return (inputTokens * promptPrice) + (outputTokens * completionPrice);
  }
}

// Routes
app.get('/', async (req, res) => {
  try {
    const models = await openrouter.getModels();
    const r2Configured = r2.isR2Configured();
    res.render('home', {
      title: 'Text to Speech Converter',
      models,
      r2Configured
    });
  } catch (err) {
    console.error('Error rendering home:', err.message);
    res.status(500).send('Internal Server Error');
  }
});

// TTS Conversion and compression API
app.post('/api/convert', async (req, res) => {
  const { text, modelId, voice, language, pushToR2 } = req.body;

  if (!text || !modelId) {
    return res.status(400).json({ success: false, error: 'Text and Model ID are required.' });
  }

  try {
    // 1. Call OpenRouter to generate raw audio stream
    console.log(`Generating speech via OpenRouter using model: ${modelId}, voice: ${voice}, language: ${language || 'default'}...`);
    const rawAudioBuffer = await openrouter.generateSpeech(modelId, text, voice, language);

    // 2. Compress audio using ffmpeg-static to ~50kbps VBR MP3
    console.log('Compressing audio to low-bitrate MP3 VBR...');
    const compressionResult = await ffmpeg.compressToMp3(rawAudioBuffer);

    // 3. Save compressed file locally
    const filename = `speech_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp3`;
    const localFilePath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(localFilePath, compressionResult.buffer);
    const localUrl = `/output/${filename}`;

    // 4. Calculate stats
    const originalSizeKb = (compressionResult.originalSize / 1024).toFixed(1);
    const compressedSizeKb = (compressionResult.compressedSize / 1024).toFixed(1);
    const compressionRatio = ((1 - (compressionResult.compressedSize / compressionResult.originalSize)) * 100).toFixed(1);
    const cost = estimateCost(modelId, text.length);

    let r2Url = null;
    let r2Error = null;

    // 5. Upload to Cloudflare R2 if requested and configured
    if (pushToR2 === true || pushToR2 === 'true') {
      if (r2.isR2Configured()) {
        try {
          console.log(`Uploading file ${filename} to Cloudflare R2...`);
          r2Url = await r2.uploadToR2(compressionResult.buffer, filename);
        } catch (uploadErr) {
          console.error('R2 Upload failed:', uploadErr.message);
          r2Error = `R2 upload failed: ${uploadErr.message}`;
        }
      } else {
        r2Error = 'R2 bucket upload was selected, but R2 is not configured in .env';
      }
    }

    res.json({
      success: true,
      localUrl,
      r2Url,
      r2Error,
      filename,
      stats: {
        originalSizeKb,
        compressedSizeKb,
        compressionRatio,
        cost: cost.toFixed(6)
      }
    });

  } catch (err) {
    console.error('Conversion process failed:', err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data ? Buffer.from(err.response.data).toString() : err.message
    });
  }
});

// Start Server
app.listen(PORT, async () => {
  console.log(`TTS Server is running on http://localhost:${PORT}`);
  try {
    await openrouter.getModels();
    console.log('Pre-fetched models list from OpenRouter API and populated cache.');
  } catch (err) {
    console.error('Failed to pre-fetch OpenRouter models on startup:', err.message);
  }
});
