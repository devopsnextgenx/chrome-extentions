(function () {
  let hoverElement = null;
  let selectedElement = null;
  let isSelecting = false;
  let uiContainer = null;
  let progressOverlay = null;

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
      if (sendResponse) sendResponse({ isSelecting, hasSelection: !!selectedElement });
    } else if (request.action === 'update-progress') {
      updateProgress(request.progress);
    }
  });

  function createUI() {
    if (uiContainer) return;

    uiContainer = document.createElement('div');
    uiContainer.id = 'img-extractor-ui';
    uiContainer.innerHTML = `
            <div class="img-ui-header"><span>🖼️</span> Img Extractor</div>
            <div class="img-ui-status" id="img-ui-status">Hover and click an element</div>
            <div class="img-ui-controls">
                <button class="img-ui-btn img-ui-btn-secondary" id="img-ui-cancel">Cancel</button>
                <button class="img-ui-btn img-ui-btn-primary" id="img-ui-download" disabled>Download</button>
            </div>
        `;

    document.body.appendChild(uiContainer);

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
      updateUIStatus(`${imageUrls.length} images found. Click Download.`, true);
      // Notify popup if it's open
      chrome.runtime.sendMessage({
        action: 'element-selected',
        hasImages: true,
        count: imageUrls.length
      });
    } else {
      updateUIStatus('No images found in selected element.', false);
      chrome.runtime.sendMessage({
        action: 'element-selected',
        hasImages: false,
        count: 0
      });
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
    updateUIStatus("Hover and click an element", false);
  }

  function initiateDownload(options) {
    if (!selectedElement) return;

    const images = selectedElement.querySelectorAll('img');
    const imageUrls = Array.from(images).map(img => img.src || img.dataset.src).filter(src => src && src.startsWith('http'));

    if (imageUrls.length === 0) return;

    showOverlay();

    chrome.runtime.sendMessage({
      action: 'process-downloads',
      urls: imageUrls,
      options: options,
      tabUrl: window.location.href
    });
  }

  function showOverlay() {
    if (!progressOverlay) {
      progressOverlay = document.createElement('div');
      progressOverlay.id = 'img-extractor-progress-overlay';
      progressOverlay.innerHTML = `
                <button class="img-btn-close">&times;</button>
                <h2>Downloading Images</h2>
                <div class="img-progress-container">
                    <div class="img-progress-bar-bg">
                        <div class="img-progress-bar-fill" id="img-progress-fill"></div>
                    </div>
                </div>
                <div class="img-stats">
                    <span>Downloaded: <b id="img-count-downloaded">0</b></span>
                    <span>Pending: <b id="img-count-pending">0</b></span>
                </div>
                <div class="img-stats" style="margin-top: 4px;">
                    <span>Total: <b id="img-count-total">0</b></span>
                </div>
            `;
      document.body.appendChild(progressOverlay);
      progressOverlay.querySelector('.img-btn-close').onclick = () => {
        progressOverlay.style.display = 'none';
      };
    }
    progressOverlay.style.display = 'block';
  }

  function updateProgress(progress) {
    if (!progressOverlay) return;

    const fill = document.getElementById('img-progress-fill');
    const downloaded = document.getElementById('img-count-downloaded');
    const pending = document.getElementById('img-count-pending');
    const total = document.getElementById('img-count-total');

    if (!fill || !downloaded || !pending || !total) return;

    const percent = (progress.downloaded / progress.total) * 100;
    fill.style.width = `${percent}%`;
    downloaded.textContent = progress.downloaded;
    pending.textContent = progress.pending;
    total.textContent = progress.total;
  }

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  document.addEventListener('click', onClick, true);
})();
