(function () {
  let hoverElement = null;
  let selectedElement = null;
  let currentFolderPath = '';
  let currentFullFolderPath = '';
  let currentFolderExists = false;
  let isSelecting = false;
  let uiContainer = null;
  let progressContainer = null;
  let batchCards = new Map();

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleSelection' || request.action === 'start-selection') {
      isSelecting = !isSelecting;
      if (isSelecting) {
        createUI();
      } else {
        removeUI();
        clearHighlighter();
      }
      if (sendResponse) sendResponse({ isSelecting });
    } else if (request.action === 'start-download') {
      initiateDownload(request.options);
    } else if (request.action === 'getStatus') {
      if (sendResponse) sendResponse({
        isSelecting,
        hasSelection: !!selectedElement,
        folderName: currentFolderPath,
        fullFolderPath: currentFullFolderPath,
        exists: currentFolderExists
      });
    } else if (request.action === 'update-progress') {
      updateProgress(request);
    } else if (request.action === 'waiting-to-resume') {
      handleWaitingToResume(request);
    }
  });

  function createUI() {
    if (uiContainer) return;

    uiContainer = document.createElement('div');
    uiContainer.id = 'img-extractor-ui';
    uiContainer.innerHTML = `
            <div class="img-ui-header"><span>🖼️</span> Img Extractor</div>
            <div class="img-ui-status" id="img-ui-status">Hover and click an element</div>
            <div id="img-ui-folder-container" class="img-ui-folder-container" style="display: none;">
                <span id="img-ui-indicator" class="indicator-dot"></span>
                <code id="img-ui-folder-path"></code>
                <button id="img-ui-copy-path" class="img-ui-copy-btn" title="Copy Folder Name">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
            </div>
            <div class="img-ui-controls">
                <button class="img-ui-btn img-ui-btn-secondary" id="img-ui-cancel">Cancel</button>
                <button class="img-ui-btn img-ui-btn-primary" id="img-ui-download" disabled>Download</button>
            </div>
        `;

    document.body.appendChild(uiContainer);

    uiContainer.querySelector('#img-ui-copy-path').addEventListener('click', () => {
      if (currentFolderPath) {
        navigator.clipboard.writeText(currentFolderPath).then(() => {
          const btn = uiContainer.querySelector('#img-ui-copy-path');
          btn.classList.add('copied');
          setTimeout(() => btn.classList.remove('copied'), 2000);
        });
      }
    });

    uiContainer.querySelector('#img-ui-indicator').addEventListener('click', () => {
      if (currentFolderExists && currentFullFolderPath) {
        chrome.runtime.sendMessage({ action: 'open-folder', path: currentFullFolderPath });
      }
    });

    uiContainer.querySelector('#img-ui-cancel').addEventListener('click', () => {
      isSelecting = false;
      removeUI();
      clearHighlighter();
      chrome.runtime.sendMessage({ action: 'selectionCanceled' });
    });

    uiContainer.querySelector('#img-ui-download').addEventListener('click', () => {
      if (selectedElement) {
        chrome.storage.local.get(['defaultLocation', 'actressName'], (data) => {
          initiateDownload({
            defaultLocation: data.defaultLocation || 'actresses',
            actressName: data.actressName || ''
          });
          isSelecting = false;
          removeUI();
          clearHighlighter();
          chrome.runtime.sendMessage({ action: 'selectionCanceled' });
        });
      }
    });
  }

  function removeUI() {
    if (uiContainer) {
      uiContainer.remove();
      uiContainer = null;
    }
  }

  function updateUIStatus(msg, canDownload = false) {
    if (!uiContainer) return;
    const status = uiContainer.querySelector('#img-ui-status');
    const downloadBtn = uiContainer.querySelector('#img-ui-download');
    if (status) status.textContent = msg;
    if (downloadBtn) downloadBtn.disabled = !canDownload;
  }

  function onMouseOver(e) {
    if (!isSelecting || selectedElement || (uiContainer && uiContainer.contains(e.target))) return;

    if (hoverElement) {
      hoverElement.classList.remove('img-extractor-highlight');
    }

    hoverElement = e.target;
    hoverElement.classList.add('img-extractor-highlight');
  }

  function handleMouseOut(e) {
    if (!isSelecting) return;
    if (hoverElement) {
      hoverElement.classList.remove('img-extractor-highlight');
      hoverElement = null;
    }
  }

  function onClick(e) {
    if (!isSelecting || (uiContainer && uiContainer.contains(e.target))) return;

    e.preventDefault();
    e.stopPropagation();

    if (selectedElement) {
      selectedElement.classList.remove('img-extractor-selected');
    }

    selectedElement = e.target;
    selectedElement.classList.add('img-extractor-selected');
    selectedElement.classList.remove('img-extractor-highlight');

    const images = selectedElement.querySelectorAll('img');
    const imageUrls = Array.from(images).map(img => img.src || img.dataset.src).filter(src => src && src.startsWith('http'));

    if (imageUrls.length > 0) {
      chrome.storage.local.get(['defaultLocation', 'actressName'], (data) => {
        const options = {
          defaultLocation: data.defaultLocation || 'actresses',
          actressName: data.actressName || ''
        };
        const firstUrl = imageUrls[0];
        // Replicate basic logic for preview
        const folderPath = generatePreviewPath(firstUrl, window.location.href, options);
        const folderName = (folderPath.split('/').pop() || folderPath).trim();
        currentFolderPath = folderName; // Now storing only the last segment as requested

        // Check existence via background
        chrome.runtime.sendMessage({ action: 'check-folder-exists', path: folderPath }, (response) => {
          const exists = !!(response && response.exists);
          currentFolderExists = exists;
          currentFullFolderPath = folderPath;

          const folderContainer = uiContainer.querySelector('#img-ui-folder-container');
          const folderPathElem = uiContainer.querySelector('#img-ui-folder-path');
          const indicator = uiContainer.querySelector('#img-ui-indicator');

          if (folderContainer && folderPathElem) {
            folderPathElem.textContent = folderName;
            folderContainer.style.display = 'flex';
            if (indicator) {
              indicator.className = 'indicator-dot ' + (exists ? 'exists' : 'new');
              indicator.title = exists ? 'Click to open folder' : 'Folder does not exist';
            }
          }

          updateUIStatus(`${imageUrls.length} images found. Click Download.`, true);
          // Notify popup if it's open
          chrome.runtime.sendMessage({
            action: 'element-selected',
            hasImages: true,
            count: imageUrls.length,
            folderName: folderName,
            fullFolderPath: folderPath,
            exists: exists
          });
        });
      });
    } else {
      currentFolderPath = '';
      currentFullFolderPath = '';
      currentFolderExists = false;
      const folderContainer = uiContainer.querySelector('#img-ui-folder-container');
      if (folderContainer) folderContainer.style.display = 'none';
      updateUIStatus('No images found in selected element.', false);
      chrome.runtime.sendMessage({
        action: 'element-selected',
        hasImages: false,
        count: 0
      });
    }
  }

  function generatePreviewPath(imgUrl, tabUrl, options) {
    try {
      const imgParsed = new URL(imgUrl);
      const segments = imgParsed.pathname.split('/').filter(s => s);
      let dynamicFolder = 'images';

      if (imgParsed.hostname.includes('ragalahari.com')) {
        if (segments.length >= 2) dynamicFolder = segments[segments.length - 2];
      } else if (imgParsed.hostname.includes('idlebrain.com')) {
        const imagesIndex = segments.indexOf('images');
        if (imagesIndex > 0) dynamicFolder = segments[imagesIndex - 1];
        else if (segments.length >= 2) dynamicFolder = segments[segments.length - 2];
      } else {
        if (segments.length >= 2) dynamicFolder = segments[segments.length - 2];
      }

      let fullPath = [];
      if (options.defaultLocation) fullPath.push(options.defaultLocation.trim().replace(/^\/+|\/+$/g, ''));
      if (options.actressName) fullPath.push(options.actressName.trim().replace(/^\/+|\/+$/g, ''));
      fullPath.push(dynamicFolder.trim().replace(/^\/+|\/+$/g, ''));

      return fullPath.join('/');
    } catch (e) {
      return 'images';
    }
  }

  function clearHighlighter() {
    if (hoverElement) {
      hoverElement.classList.remove('img-extractor-highlight');
      hoverElement = null;
    }
    if (selectedElement) {
      selectedElement.classList.remove('img-extractor-selected');
      selectedElement = null;
    }
    currentFolderPath = '';
    currentFullFolderPath = '';
    currentFolderExists = false;
    if (uiContainer) {
      const folderContainer = uiContainer.querySelector('#img-ui-folder-container');
      if (folderContainer) folderContainer.style.display = 'none';
    }
    updateUIStatus("Hover and click an element", false);
  }

  function initiateDownload(options) {
    if (!selectedElement) return;

    const images = selectedElement.querySelectorAll('img');
    const imageUrls = Array.from(images).map(img => img.src || img.dataset.src).filter(src => src && src.startsWith('http'));

    if (imageUrls.length === 0) return;

    chrome.runtime.sendMessage({
      action: 'process-downloads',
      urls: imageUrls,
      options: options,
      tabUrl: window.location.href
    });
  }

  function ensureProgressContainer() {
    if (!progressContainer) {
      progressContainer = document.createElement('div');
      progressContainer.id = 'img-extractor-progress-container';
      document.body.appendChild(progressContainer);
    }
  }

  function createBatchCard(batchId) {
    ensureProgressContainer();
    const card = document.createElement('div');
    card.className = 'img-batch-card';
    card.id = `batch-${batchId}`;
    card.innerHTML = `
        <div class="img-batch-header">
            <span>Downloading Images</span>
            <div class="img-batch-actions">
                <button class="img-batch-continue" id="continue-${batchId}" style="display: none;" title="Continue Now">Continue</button>
                <button class="img-batch-cancel" title="Cancel this batch">&times;</button>
            </div>
        </div>
        <div class="img-progress-container">
            <div class="img-progress-bar-bg">
                <div class="img-progress-bar-fill" id="fill-${batchId}"></div>
            </div>
        </div>
        <div class="img-stats">
            <span>Progress: <b id="text-${batchId}">0/0</b></span>
            <span id="status-${batchId}">Downloading...</span>
        </div>
        <div id="countdown-container-${batchId}" class="img-countdown" style="display: none;">
            Resuming in <b id="countdown-${batchId}">15</b>s...
        </div>
        <div id="failed-container-${batchId}" class="img-failed-url-container" style="display: none;">
            <div class="img-failed-url-label">First Failed URL:</div>
            <div class="img-failed-url-row">
                <span id="failed-url-${batchId}" class="img-failed-url-text"></span>
                <button id="copy-${batchId}" class="img-copy-btn" title="Copy URL">Copy</button>
            </div>
        </div>
    `;
    progressContainer.appendChild(card);

    card.querySelector('.img-batch-cancel').onclick = () => {
      chrome.runtime.sendMessage({ action: 'cancel-download', batchId: batchId });
      card.querySelector('#status-' + batchId).textContent = 'Cancelling...';
      card.classList.add('cancelling');
      card.querySelector(`#continue-${batchId}`).style.display = 'none';
      card.querySelector(`#countdown-container-${batchId}`).style.display = 'none';
    };

    card.querySelector('.img-batch-continue').onclick = () => {
      chrome.runtime.sendMessage({ action: 'resume-download', batchId: batchId });
      card.querySelector(`#continue-${batchId}`).style.display = 'none';
      card.querySelector(`#countdown-container-${batchId}`).style.display = 'none';
      card.querySelector('#status-' + batchId).textContent = 'Resuming...';
    };

    card.querySelector(`#copy-${batchId}`).onclick = () => {
      const urlText = card.querySelector(`#failed-url-${batchId}`).textContent;
      navigator.clipboard.writeText(urlText).then(() => {
        const copyBtn = card.querySelector(`#copy-${batchId}`);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.classList.remove('copied');
        }, 2000);
      });
    };

    return card;
  }

  function updateProgress(message) {
    const { batchId, progress } = message;
    let card = batchCards.get(batchId);

    if (!card) {
      card = createBatchCard(batchId);
      batchCards.set(batchId, card);
    }

    const fill = card.querySelector(`#fill-${batchId}`);
    const text = card.querySelector(`#text-${batchId}`);
    const status = card.querySelector(`#status-${batchId}`);

    if (fill && text) {
      const percent = (progress.downloaded / progress.total) * 100;
      fill.style.width = `${percent}%`;
      text.textContent = `${progress.downloaded}/${progress.total}`;

      // Hide pause UI if we moved past the first image
      if (progress.downloaded > 1) {
        const continueBtn = card.querySelector(`#continue-${batchId}`);
        const countdownContainer = card.querySelector(`#countdown-container-${batchId}`);
        if (continueBtn) continueBtn.style.display = 'none';
        if (countdownContainer) countdownContainer.style.display = 'none';
        if (status.textContent === 'Paused') status.textContent = 'Downloading...';
      }

      if (progress.firstFailedUrl) {
        const failedContainer = card.querySelector(`#failed-container-${batchId}`);
        const failedUrlText = card.querySelector(`#failed-url-${batchId}`);
        if (failedContainer && failedUrlText) {
          failedUrlText.textContent = progress.firstFailedUrl;
          failedContainer.style.display = 'block';
        }
      }

      if (progress.downloaded === progress.total) {
        status.textContent = 'Completed';
        card.classList.add('completed');
        // Remove card after some time
        setTimeout(() => {
          card.classList.add('fade-out');
          setTimeout(() => {
            card.remove();
            batchCards.delete(batchId);
            if (batchCards.size === 0 && progressContainer) {
              progressContainer.remove();
              progressContainer = null;
            }
          }, 500);
        }, 3000);
      }
    }
  }

  function handleWaitingToResume(message) {
    const { batchId, timeout } = message;
    const card = batchCards.get(batchId);
    if (!card) return;

    const continueBtn = card.querySelector(`#continue-${batchId}`);
    const countdownContainer = card.querySelector(`#countdown-container-${batchId}`);
    const countdownText = card.querySelector(`#countdown-${batchId}`);
    const status = card.querySelector(`#status-${batchId}`);

    status.textContent = 'Paused';
    if (continueBtn) continueBtn.style.display = 'block';
    if (countdownContainer) countdownContainer.style.display = 'block';

    let timeLeft = timeout;
    if (countdownText) countdownText.textContent = timeLeft;

    const intervalId = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0 || !batchCards.has(batchId) || card.classList.contains('cancelling') || (continueBtn && continueBtn.style.display === 'none')) {
        clearInterval(intervalId);
        if (timeLeft <= 0) {
          if (continueBtn) continueBtn.style.display = 'none';
          if (countdownContainer) countdownContainer.style.display = 'none';
        }
        return;
      }
      if (countdownText) countdownText.textContent = timeLeft;
    }, 1000);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && isSelecting) {
      isSelecting = false;
      removeUI();
      clearHighlighter();
      chrome.runtime.sendMessage({ action: 'selectionCanceled' });
    }
  }

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
})();
