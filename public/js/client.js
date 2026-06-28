// State
let selectedModelId = '';

// On page load
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  
  // Select first model card by default if cards exist
  const firstCard = document.querySelector('.model-card');
  if (firstCard) {
    const id = firstCard.getAttribute('data-model-id');
    selectModel(id);
  }
});

// Character counter and submit button state
function updateCharCounter(textarea) {
  const length = textarea.value.trim().length;
  document.getElementById('char-counter').textContent = `${length} characters`;
  
  checkSubmitButtonState();
}

function checkSubmitButtonState() {
  const text = document.getElementById('text-input').value.trim();
  const submitBtn = document.getElementById('submit-button');
  
  if (text.length > 0 && selectedModelId) {
    submitBtn.removeAttribute('disabled');
  } else {
    submitBtn.setAttribute('disabled', 'true');
  }
}

// Select TTS Model Card
function selectModel(modelId) {
  selectedModelId = modelId;
  document.getElementById('selected-model-id').value = modelId;
  
  // Update card selected UI classes
  const cards = document.querySelectorAll('.model-card');
  cards.forEach(card => {
    if (card.getAttribute('data-model-id') === modelId) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  // Toggle Gemini Tag Instruction Tip
  const geminiTip = document.getElementById('gemini-tip');
  if (modelId === 'google/gemini-3.1-flash-tts-preview') {
    geminiTip.classList.remove('hidden');
  } else {
    geminiTip.classList.add('hidden');
  }

  // Populate Voice Dropdown Options
  populateVoices(modelId);
  
  // Validate overall form state
  checkSubmitButtonState();
}

// Dynamically populate voices list based on selected model
function populateVoices(modelId) {
  const select = document.getElementById('voice-select');
  select.innerHTML = ''; // Reset list
  
  const modelData = OPENROUTER_MODELS[modelId];
  if (!modelData || !modelData.voices || modelData.voices.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Default voice';
    select.appendChild(opt);
    return;
  }

  modelData.voices.forEach(voice => {
    const opt = document.createElement('option');
    if (typeof voice === 'string') {
      opt.value = voice;
      opt.textContent = voice;
    } else {
      opt.value = voice.id;
      opt.textContent = voice.name;
    }
    select.appendChild(opt);
  });
}

// Handle Form Submission via AJAX (fetch)
async function handleFormSubmit(event) {
  if (event) event.preventDefault();
  
  const text = document.getElementById('text-input').value.trim();
  const voice = document.getElementById('voice-select').value;
  const pushToR2 = document.getElementById('r2-toggle').checked;
  const submitBtn = document.getElementById('submit-button');

  if (!text || !selectedModelId) return;

  // Toggle UI States to Loading
  submitBtn.setAttribute('disabled', 'true');
  showState('loading');

  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        modelId: selectedModelId,
        voice,
        pushToR2
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Server error occurred during conversion.');
    }

    // Success State rendering
    showState('success');
    
    // Play sound in player
    const audio = document.getElementById('audio-element');
    audio.src = data.localUrl;
    audio.play().catch(e => console.warn('Autoplay blocked by browser:', e.message));

    // Stats
    document.getElementById('stat-original').textContent = `${data.stats.originalSizeKb} KB`;
    document.getElementById('stat-compressed').textContent = `${data.stats.compressedSizeKb} KB`;
    document.getElementById('stat-ratio').textContent = `${data.stats.compressionRatio}%`;
    document.getElementById('stat-cost').textContent = `$${data.stats.cost}`;

    // Download action link
    const downloadLink = document.getElementById('download-link');
    downloadLink.href = data.localUrl;

    // R2 Upload link and errors
    const r2LinkBox = document.getElementById('r2-link-box');
    const r2ErrorBox = document.getElementById('r2-error-box');
    
    if (data.r2Url) {
      r2LinkBox.classList.remove('hidden');
      document.getElementById('r2-url-display').value = data.r2Url;
    } else {
      r2LinkBox.classList.add('hidden');
    }

    if (data.r2Error) {
      r2ErrorBox.classList.remove('hidden');
      document.getElementById('r2-error-text').textContent = data.r2Error;
    } else {
      r2ErrorBox.classList.add('hidden');
    }

    // Save to Local History
    const friendlyModelName = OPENROUTER_MODELS[selectedModelId]?.name || selectedModelId;
    saveToHistory({
      textPreview: text.substring(0, 60) + (text.length > 60 ? '...' : ''),
      modelName: friendlyModelName,
      voiceName: voice,
      compressedSizeKb: data.stats.compressedSizeKb,
      compressionRatio: data.stats.compressionRatio,
      localUrl: data.localUrl,
      r2Url: data.r2Url,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

  } catch (err) {
    console.error(err);
    showState('error');
    document.getElementById('error-message').textContent = err.message;
  } finally {
    submitBtn.removeAttribute('disabled');
  }
}

// Helper: Show/Hide result panel blocks
function showState(state) {
  const placeholder = document.getElementById('result-placeholder');
  const loading = document.getElementById('result-loading');
  const success = document.getElementById('result-success');
  const error = document.getElementById('result-error');

  placeholder.classList.add('hidden');
  loading.classList.add('hidden');
  success.classList.add('hidden');
  error.classList.add('hidden');

  if (state === 'placeholder') placeholder.classList.remove('hidden');
  else if (state === 'loading') loading.classList.remove('hidden');
  else if (state === 'success') success.classList.remove('hidden');
  else if (state === 'error') error.classList.remove('hidden');
}

// Retry handler
function retryFormSubmit() {
  handleFormSubmit();
}

// Copy link to clipboard
function copyR2Url() {
  const urlInput = document.getElementById('r2-url-display');
  urlInput.select();
  urlInput.setSelectionRange(0, 99999); // For mobile devices
  
  navigator.clipboard.writeText(urlInput.value)
    .then(() => {
      const copyIcon = document.getElementById('copy-icon');
      copyIcon.textContent = 'done';
      setTimeout(() => {
        copyIcon.textContent = 'content_copy';
      }, 2000);
    })
    .catch(err => {
      console.error('Failed to copy text:', err);
    });
}

// Local Storage History Management
function saveToHistory(item) {
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem('tts_history')) || [];
  } catch (e) {
    history = [];
  }

  // Prepend to list (latest first) and keep max 10
  history.unshift(item);
  if (history.length > 10) {
    history.pop();
  }

  localStorage.setItem('tts_history', JSON.stringify(history));
  loadHistory();
}

function loadHistory() {
  const container = document.getElementById('history-items-list');
  let history = [];
  
  try {
    history = JSON.parse(localStorage.getItem('tts_history')) || [];
  } catch (e) {
    history = [];
  }

  if (history.length === 0) {
    container.innerHTML = '<p class="history-placeholder">No recent generations. Converted files will appear here.</p>';
    return;
  }

  container.innerHTML = '';
  history.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    
    // Play button triggers playing either local url or r2 url
    const playUrl = item.localUrl;
    const downloadUrl = item.r2Url || item.localUrl;
    
    div.innerHTML = `
      <div class="history-item-left">
        <button type="button" class="play-history-btn" onclick="playHistoryAudio('${playUrl}')" title="Play Audio">
          <span class="material-icons-round">play_arrow</span>
        </button>
        <div class="history-text-details">
          <span class="history-text-preview" title="${item.textPreview}">${item.textPreview}</span>
          <div class="history-meta">
            <span>${item.modelName}</span>
            <span class="history-meta-divider">•</span>
            <span>Voice: ${item.voiceName || 'default'}</span>
            <span class="history-meta-divider">•</span>
            <span>${item.timestamp}</span>
          </div>
        </div>
      </div>
      <div class="history-item-right">
        <div class="history-text-details" style="text-align: right; margin-right: 0.5rem; font-size: 0.75rem;">
          <span style="color: #fff; font-weight: 600;">${item.compressedSizeKb} KB</span>
          <span style="color: var(--color-success); font-size: 0.7rem;">Saved ${item.compressionRatio}%</span>
        </div>
        <a href="${downloadUrl}" class="history-action-btn" download title="${item.r2Url ? 'Get R2 Link' : 'Download Local File'}">
          <span class="material-icons-round">${item.r2Url ? 'cloud' : 'download'}</span>
        </a>
      </div>
    `;
    
    container.appendChild(div);
  });
}

function clearHistory() {
  localStorage.removeItem('tts_history');
  loadHistory();
}

// Play history audio item inline
function playHistoryAudio(url) {
  // Update main player and show success box if it isn't shown
  showState('success');
  
  const audio = document.getElementById('audio-element');
  audio.src = url;
  audio.play();

  // If playing from history, we set stats to empty/default or we search index
  document.getElementById('stat-original').textContent = '-';
  document.getElementById('stat-compressed').textContent = '-';
  document.getElementById('stat-ratio').textContent = '-';
  document.getElementById('stat-cost').textContent = '-';
  document.getElementById('download-link').href = url;
  document.getElementById('r2-link-box').classList.add('hidden');
  document.getElementById('r2-error-box').classList.add('hidden');
}
