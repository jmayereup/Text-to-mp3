// State
let selectedModelId = '';

// PocketBase Authentication Client
let pb = null;
try {
  const pbEndpoint = window.POCKETBASE_URL || 'https://pb.teacherjake.com';
  pb = new PocketBase(pbEndpoint);
  pb.autoCancellation(false);
} catch (err) {
  console.warn('[TJ-TTS] PocketBase SDK failed to initialize:', err);
}

function isCurrentUserAdmin() {
  if (!pb || !pb.authStore.isValid) return false;
  const rec = pb.authStore.record;
  if (!rec) return pb.authStore.isSuperuser || false;
  return rec.isAdmin === true || rec.role === 'admin' || pb.authStore.isSuperuser || false;
}

// On page load
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  initAuth();
  
  // Handle custom language input show/hide
  const langSelect = document.getElementById('language-select');
  const langCustomInput = document.getElementById('language-custom-input');
  if (langSelect && langCustomInput) {
    langSelect.addEventListener('change', () => {
      if (langSelect.value === 'custom') {
        langCustomInput.classList.remove('hidden');
        langCustomInput.focus();
      } else {
        langCustomInput.classList.add('hidden');
        langCustomInput.value = ''; // clear input
      }
      // Re-populate and filter the voice dropdown based on the new language selection
      populateVoices(selectedModelId);
    });
  }

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
  debouncedUpdateCostEstimate();
}

function checkSubmitButtonState() {
  const text = document.getElementById('text-input').value.trim();
  const submitBtn = document.getElementById('submit-button');
  if (!submitBtn) return;
  
  const isLoggedIn = pb && pb.authStore.isValid;
  const isAdmin = isCurrentUserAdmin();

  if (!isLoggedIn) {
    submitBtn.setAttribute('disabled', 'true');
    submitBtn.innerHTML = '<span class="material-icons-round">lock</span><span>Sign In to Generate</span>';
    return;
  }

  if (!isAdmin) {
    submitBtn.setAttribute('disabled', 'true');
    submitBtn.innerHTML = '<span class="material-icons-round">block</span><span>Admin Access Required</span>';
    return;
  }

  if (text.length > 0 && selectedModelId) {
    submitBtn.removeAttribute('disabled');
    submitBtn.innerHTML = '<span class="material-icons-round">play_arrow</span><span>Generate Speech</span>';
  } else {
    submitBtn.setAttribute('disabled', 'true');
    submitBtn.innerHTML = '<span class="material-icons-round">play_arrow</span><span>Generate Speech</span>';
  }
}


// Debounce helper to delay execution for typing
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Calculate and display dynamic cost estimate on the client
function updateCostEstimate() {
  const text = document.getElementById('text-input').value.trim();
  const costCounter = document.getElementById('cost-counter');
  
  if (!text || !selectedModelId) {
    if (costCounter) costCounter.classList.add('hidden');
    return;
  }

  const model = OPENROUTER_MODELS[selectedModelId];
  if (!model) {
    if (costCounter) costCounter.classList.add('hidden');
    return;
  }

  const textLength = text.length;
  const promptPrice = parseFloat(model.pricing.prompt);
  const completionPrice = parseFloat(model.pricing.completion);

  let cost = 0;
  if (model.pricing.unit === 'character') {
    cost = textLength * promptPrice;
  } else {
    // 1 token ≈ 4 characters
    const inputTokens = Math.ceil(textLength / 4);
    const outputTokens = Math.ceil(textLength / 3);
    cost = (inputTokens * promptPrice) + (outputTokens * completionPrice);
  }

  if (costCounter) {
    costCounter.textContent = `Est: $${cost.toFixed(6)}`;
    costCounter.classList.remove('hidden');
  }
}

// Debounced version of cost estimator for input field updates
const debouncedUpdateCostEstimate = debounce(updateCostEstimate, 300);

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

  // Toggle Language Parameter UI Controls
  const modelData = OPENROUTER_MODELS[modelId];
  const langGroup = document.getElementById('language-group');
  const controlsRow = document.getElementById('controls-row');
  const customLangInput = document.getElementById('language-custom-input');
  
  if (modelData && modelData.supportsLanguage) {
    langGroup.classList.remove('hidden');
    if (controlsRow) controlsRow.classList.add('has-language');
    populateLanguages(modelId);
  } else {
    langGroup.classList.add('hidden');
    if (controlsRow) controlsRow.classList.remove('has-language');
    if (customLangInput) {
      customLangInput.classList.add('hidden');
      customLangInput.value = '';
    }
  }

  // Toggle Voice Guide Prompt UI Controls
  const instructionsGroup = document.getElementById('instructions-group');
  const instructionsInput = document.getElementById('instructions-input');
  if (modelData && modelData.supportsInstructions) {
    if (instructionsGroup) instructionsGroup.classList.remove('hidden');
    if (instructionsInput && !instructionsInput.value.trim()) {
      instructionsInput.value = modelData.defaultInstructions || 'A slow clear voice suitable for ESL students.';
    }
  } else {
    if (instructionsGroup) instructionsGroup.classList.add('hidden');
  }

  // Populate Voice Dropdown Options
  populateVoices(modelId);
  
  // Validate overall form state
  checkSubmitButtonState();

  // Recalculate cost estimate immediately when model changes
  updateCostEstimate();
}

// Dynamically populate languages list based on selected model
function populateLanguages(modelId) {
  const select = document.getElementById('language-select');
  if (!select) return;
  select.innerHTML = ''; // Reset list
  
  const modelData = OPENROUTER_MODELS[modelId];
  if (!modelData || !modelData.languages || modelData.languages.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Auto-detect / Default';
    select.appendChild(opt);
    return;
  }

  // First default option
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Auto-detect / Default';
  select.appendChild(defaultOpt);

  modelData.languages.forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.name;
    select.appendChild(opt);
  });

  // Custom code option
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = 'Custom Code...';
  select.appendChild(customOpt);
}

// Helper to determine if a voice belongs to the selected language prefix
function shouldIncludeVoice(modelId, voiceId, selectedLang) {
  if (!selectedLang || selectedLang === 'custom') return true;
  
  if (modelId === 'hexgrad/kokoro-82m') {
    const prefix = voiceId.split('_')[0];
    const mapping = {
      'en-US': ['af', 'am'],
      'en-GB': ['bf', 'bm'],
      'es-ES': ['ef', 'em'],
      'fr-FR': ['ff'],
      'hi-IN': ['hf', 'hm'],
      'it-IT': ['if', 'im'],
      'ja-JP': ['jf', 'jm'],
      'pt-BR': ['pf', 'pm'],
      'zh-CN': ['zf', 'zm']
    };
    const allowedPrefixes = mapping[selectedLang];
    return allowedPrefixes ? allowedPrefixes.includes(prefix) : true;
  }
  
  if (modelId === 'mistralai/voxtral-mini-tts-2603') {
    const prefix = voiceId.split('_')[0];
    const mapping = {
      'en-US': ['en'],
      'en-GB': ['gb'],
      'fr-FR': ['fr']
    };
    const allowedPrefixes = mapping[selectedLang];
    return allowedPrefixes ? allowedPrefixes.includes(prefix) : true;
  }
  
  return true;
}

// Dynamically populate voices list based on selected model
function populateVoices(modelId) {
  const select = document.getElementById('voice-select');
  const oldVal = select.value;
  select.innerHTML = ''; // Reset list
  
  const modelData = OPENROUTER_MODELS[modelId];
  if (!modelData || !modelData.voices || modelData.voices.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Default voice';
    select.appendChild(opt);
    return;
  }

  const langGroup = document.getElementById('language-group');
  const langSelect = document.getElementById('language-select');
  const selectedLang = (langGroup && !langGroup.classList.contains('hidden') && langSelect) ? langSelect.value : '';

  let addedCount = 0;
  modelData.voices.forEach(voice => {
    const voiceId = typeof voice === 'string' ? voice : voice.id;
    if (!shouldIncludeVoice(modelId, voiceId, selectedLang)) {
      return;
    }

    addedCount++;
    const opt = document.createElement('option');
    if (typeof voice === 'string') {
      opt.value = voice;
      
      // Try to format Kokoro/Voxtral voice names nicely
      let displayName = voice;
      if (modelId === 'hexgrad/kokoro-82m') {
        const parts = voice.split('_');
        if (parts.length >= 2) {
          const prefix = parts[0];
          const rawName = parts[1];
          const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
          const langMap = {
            'af': 'US Female',
            'am': 'US Male',
            'bf': 'UK Female',
            'bm': 'UK Male',
            'ef': 'ES Female',
            'em': 'ES Male',
            'ff': 'FR Female',
            'hf': 'HI Female',
            'hm': 'HI Male',
            'if': 'IT Female',
            'im': 'IT Male',
            'jf': 'JA Female',
            'jm': 'JA Male',
            'pf': 'PT Female',
            'pm': 'PT Male',
            'zf': 'ZH Female',
            'zm': 'ZH Male'
          };
          const langLabel = langMap[prefix] || prefix.toUpperCase();
          displayName = `${langLabel}: ${name}`;
        }
      } else if (modelId === 'mistralai/voxtral-mini-tts-2603') {
        const parts = voice.split('_');
        if (parts.length >= 3) {
          const lang = parts[0].toUpperCase();
          const name = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
          const tone = parts[2].charAt(0).toUpperCase() + parts[2].slice(1);
          displayName = `${lang}: ${name} (${tone})`;
        }
      }
      opt.textContent = displayName;
    } else {
      opt.value = voice.id;
      opt.textContent = voice.name;
    }
    select.appendChild(opt);
  });

  if (addedCount === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No voices available for selected language';
    select.appendChild(opt);
  } else {
    // Restore old selection if still valid, otherwise select the first option
    const options = Array.from(select.options);
    const hasOldVal = options.some(opt => opt.value === oldVal);
    if (hasOldVal) {
      select.value = oldVal;
    } else {
      select.selectedIndex = 0;
    }
  }
}

// Handle Form Submission via AJAX (fetch)
async function handleFormSubmit(event) {
  if (event) event.preventDefault();
  
  const text = document.getElementById('text-input').value.trim();
  const voice = document.getElementById('voice-select').value;
  const pushToR2 = document.getElementById('r2-toggle').checked;
  const submitBtn = document.getElementById('submit-button');

  // Extract language if visible
  let language = '';
  const langGroup = document.getElementById('language-group');
  if (langGroup && !langGroup.classList.contains('hidden')) {
    const langSelect = document.getElementById('language-select');
    if (langSelect.value === 'custom') {
      language = document.getElementById('language-custom-input').value.trim();
    } else {
      language = langSelect.value;
    }
  }

  // Extract instructions if visible
  let instructions = '';
  const instructionsGroup = document.getElementById('instructions-group');
  if (instructionsGroup && !instructionsGroup.classList.contains('hidden')) {
    const instructionsInput = document.getElementById('instructions-input');
    if (instructionsInput) {
      instructions = instructionsInput.value.trim();
    }
  }

  if (!pb || !pb.authStore.isValid) {
    openAuthModal();
    return;
  }

  if (!isCurrentUserAdmin()) {
    alert('Access Denied: Voice generation is restricted to Administrator accounts.');
    return;
  }

  if (!text || !selectedModelId) return;

  // Toggle UI States to Loading
  submitBtn.setAttribute('disabled', 'true');
  showState('loading');

  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (pb && pb.authStore.isValid && pb.authStore.token) {
      headers['Authorization'] = `Bearer ${pb.authStore.token}`;
    }

    const response = await fetch('/api/convert', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        modelId: selectedModelId,
        voice,
        language,
        instructions,
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
      languageName: language || 'default',
      instructionsPrompt: instructions || '',
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
    const playUrl = item.localUrl || item.r2Url || '';
    const downloadUrl = item.r2Url || item.localUrl || '#';
    const modelDisplay = item.modelName || 'TTS';
    const voiceDisplay = item.voiceName ? `Voice: ${item.voiceName}` : 'Voice: default';
    const hasLang = item.languageName && item.languageName !== 'default';
    const hasPrompt = !!item.instructionsPrompt;
    const hasSavings = item.compressionRatio && parseFloat(item.compressionRatio) > 0;
    
    div.innerHTML = `
      <button type="button" class="play-history-btn" onclick="playHistoryAudio('${encodeURI(playUrl)}')" title="Play Audio">
        <span class="material-icons-round">play_arrow</span>
      </button>
      
      <div class="history-item-body">
        <div class="history-item-header">
          <span class="history-text-preview" title="${escapeHtml(item.textPreview)}">${escapeHtml(item.textPreview)}</span>
          <div class="history-item-stats">
            <span class="history-size-badge">${escapeHtml(String(item.compressedSizeKb))} KB</span>
            ${hasSavings ? `<span class="history-saved-badge">Saved ${escapeHtml(String(item.compressionRatio))}%</span>` : ''}
          </div>
        </div>
        
        <div class="history-meta">
          <span class="history-badge history-badge-model" title="${escapeHtml(modelDisplay)}">${escapeHtml(modelDisplay)}</span>
          <span class="history-badge" title="${escapeHtml(voiceDisplay)}">${escapeHtml(voiceDisplay)}</span>
          ${hasLang ? `<span class="history-badge" title="Language: ${escapeHtml(item.languageName)}">Lang: ${escapeHtml(item.languageName)}</span>` : ''}
          ${hasPrompt ? `<span class="history-badge history-badge-prompt" title="Guide: ${escapeHtml(item.instructionsPrompt)}">Prompt</span>` : ''}
          <span class="history-timestamp">${escapeHtml(item.timestamp || '')}</span>
        </div>
      </div>

      <div class="history-item-actions">
        <a href="${escapeHtml(downloadUrl)}" class="history-action-btn" download title="${item.r2Url ? 'Get R2 Link' : 'Download Local File'}">
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

// ---------------------------------------------------------------------------
// PocketBase Authentication Helpers
// ---------------------------------------------------------------------------

function initAuth() {
  if (!pb) return;

  // Listen to auth changes (login, logout, refresh)
  pb.authStore.onChange((token, model) => {
    updateAuthUI();
    checkSubmitButtonState();
  });

  // Attempt auto-refresh on mount if token is stored
  if (pb.authStore.isValid) {
    pb.collection('users')
      .authRefresh()
      .catch(() => {
        // Try superusers refresh if regular user failed
        if (pb.collection('_superusers')) {
          pb.collection('_superusers').authRefresh().catch(() => {});
        }
      })
      .finally(() => {
        updateAuthUI();
        checkSubmitButtonState();
      });
  }

  updateAuthUI();
  checkSubmitButtonState();
}

function updateAuthUI() {
  const loggedOutBox = document.getElementById('auth-logged-out');
  const loggedInBox = document.getElementById('auth-logged-in');
  const userEmailDisplay = document.getElementById('user-email-display');
  const roleBadge = document.getElementById('user-role-badge');
  const accessBanner = document.getElementById('access-banner');
  const accessBannerText = document.getElementById('access-banner-text');
  const bannerLoginBtn = document.getElementById('banner-login-btn');
  const accessBannerIcon = document.getElementById('access-banner-icon');

  if (!pb || !pb.authStore.isValid) {
    // Logged Out
    if (loggedOutBox) loggedOutBox.classList.remove('hidden');
    if (loggedInBox) loggedInBox.classList.add('hidden');

    if (accessBanner) {
      accessBanner.classList.remove('hidden', 'banner-warning', 'banner-admin');
      accessBanner.classList.add('banner-logged-out');
    }
    if (accessBannerIcon) accessBannerIcon.textContent = 'lock';
    if (accessBannerText) {
      accessBannerText.innerHTML = 'Sign in with an <strong>Administrator</strong> account to generate audio.';
    }
    if (bannerLoginBtn) bannerLoginBtn.classList.remove('hidden');
  } else {
    // Logged In
    const record = pb.authStore.record;
    const email = record?.email || record?.username || 'Authenticated User';
    const isAdmin = isCurrentUserAdmin();

    if (loggedOutBox) loggedOutBox.classList.add('hidden');
    if (loggedInBox) loggedInBox.classList.remove('hidden');
    if (userEmailDisplay) userEmailDisplay.textContent = email;

    if (roleBadge) {
      if (isAdmin) {
        roleBadge.textContent = 'Admin';
        roleBadge.className = 'user-role-badge badge-admin';
      } else {
        roleBadge.textContent = 'User (Non-Admin)';
        roleBadge.className = 'user-role-badge badge-user';
      }
    }

    if (accessBanner) {
      if (isAdmin) {
        // Admin: hide barrier banner completely
        accessBanner.classList.add('hidden');
      } else {
        // Non-admin: show restricted warning
        accessBanner.classList.remove('hidden', 'banner-logged-out', 'banner-admin');
        accessBanner.classList.add('banner-warning');
        if (accessBannerIcon) accessBannerIcon.textContent = 'block';
        if (accessBannerText) {
          accessBannerText.innerHTML = '<strong>Access Restricted:</strong> Text-to-Speech generation is enabled for administrator accounts only.';
        }
        if (bannerLoginBtn) bannerLoginBtn.classList.add('hidden');
      }
    }
  }
}

function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  const errorBox = document.getElementById('auth-error-msg');
  if (errorBox) errorBox.classList.add('hidden');
  if (modal) {
    modal.classList.remove('hidden');
    const emailInput = document.getElementById('auth-email');
    if (emailInput) {
      setTimeout(() => emailInput.focus(), 50);
    }
  }
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
}

function handleModalOverlayClick(event) {
  if (event.target && event.target.id === 'auth-modal') {
    closeAuthModal();
  }
}

async function handleLoginFormSubmit(event) {
  event.preventDefault();
  if (!pb) return;

  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const submitBtn = document.getElementById('auth-submit-btn');
  const errorBox = document.getElementById('auth-error-msg');
  const errorText = document.getElementById('auth-error-text');

  const email = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!email || !password) return;

  if (submitBtn) {
    submitBtn.setAttribute('disabled', 'true');
    submitBtn.innerHTML = '<span class="material-icons-round spinner">autorenew</span><span>Signing in...</span>';
  }
  if (errorBox) errorBox.classList.add('hidden');

  try {
    let authSuccess = false;
    let authError = null;

    // 1. Try standard 'users' collection
    try {
      await pb.collection('users').authWithPassword(email, password);
      authSuccess = true;
    } catch (userErr) {
      authError = userErr;
    }

    // 2. If standard user failed, try _superusers / admins
    if (!authSuccess) {
      try {
        if (pb.collection('_superusers')) {
          await pb.collection('_superusers').authWithPassword(email, password);
          authSuccess = true;
        } else if (pb.admins) {
          await pb.admins.authWithPassword(email, password);
          authSuccess = true;
        }
      } catch (adminErr) {
        // Fallback error
      }
    }

    if (!authSuccess) {
      throw authError || new Error('Invalid email or password.');
    }

    // Login successful
    closeAuthModal();
    if (passwordInput) passwordInput.value = '';
    updateAuthUI();
    checkSubmitButtonState();
  } catch (err) {
    console.error('[TJ-TTS Auth] Login error:', err);
    if (errorBox && errorText) {
      errorText.textContent = err.message || 'Failed to authenticate with PocketBase.';
      errorBox.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.removeAttribute('disabled');
      submitBtn.innerHTML = '<span class="material-icons-round">login</span><span>Sign In</span>';
    }
  }
}

function handleLogout() {
  if (!pb) return;
  pb.authStore.clear();
  updateAuthUI();
  checkSubmitButtonState();
}

