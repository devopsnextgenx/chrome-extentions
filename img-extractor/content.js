(function () {
  let hoverElement = null;
  let selectedElement = null;
  let currentFolderPath = '';
  let currentFullFolderPath = '';
  let currentFolderExists = false;
  let currentApiPath = '';
  let isSelecting = false;
  let uiContainer = null;
  let progressContainer = null;
  let batchCards = new Map();

  // Instagram monitoring state
  let instagramMonitoring = false;
  let instagramObserver = null;
  let instagramImageCache = new Set();
  let instagramMaxArea = 0;

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
    } else if (request.action === 'resumed-download') {
      handleResumedDownload(request);
    } else if (request.action === 'extract_instagram_images') {
      extractInstagramImages(request.options);
    } else if (request.action === 'start_instagram_monitoring') {
      startInstagramMonitoring(request.options);
    } else if (request.action === 'stop_instagram_monitoring') {
      stopInstagramMonitoring();
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
      if (currentFolderExists && currentApiPath) {
        chrome.runtime.sendMessage({ action: 'open-web-folder', path: currentApiPath });
      } else if (currentFolderExists && currentFullFolderPath) {
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
          const existingImages = response && response.existingImages ? response.existingImages : [];
          currentFolderExists = exists;
          currentApiPath = response && response.path ? response.path : '';
          currentFullFolderPath = folderPath;

          // Filter imageUrls to find new ones
          const existingFilenames = new Set(existingImages.map(img => img.split('/').pop().toLowerCase()));
          const newImages = imageUrls.filter(url => {
            const fileName = url.split('/').pop().split('?')[0].toLowerCase();
            return !existingFilenames.has(fileName);
          });

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

          const statusMsg = newImages.length === 0
            ? `All ${imageUrls.length} images already exist.`
            : `${newImages.length} new images found (of ${imageUrls.length}). Click Download.`;

          updateUIStatus(statusMsg, newImages.length > 0);

          // Notify popup if it's open
          chrome.runtime.sendMessage({
            action: 'element-selected',
            hasImages: imageUrls.length > 0,
            count: imageUrls.length,
            newCount: newImages.length,
            folderName: folderName,
            fullFolderPath: folderPath,
            apiPath: currentApiPath,
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

  function handleResumedDownload(message) {
    const { batchId } = message;
    const card = batchCards.get(batchId);
    if (!card) return;

    const continueBtn = card.querySelector(`#continue-${batchId}`);
    const countdownContainer = card.querySelector(`#countdown-container-${batchId}`);
    const status = card.querySelector(`#status-${batchId}`);

    if (continueBtn) continueBtn.style.display = 'none';
    if (countdownContainer) countdownContainer.style.display = 'none';
    if (status) status.textContent = 'Downloading...';
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

  // --- Instagram Extraction Logic ---

  function getLargestImageFromSrcset(srcset) {
    if (!srcset) return null;
    const sources = srcset.split(',').map(s => {
      const [url, size] = s.trim().split(' ');
      return { url, width: parseInt(size, 10) };
    });

    // Sort by width descending
    sources.sort((a, b) => b.width - a.width);
    return sources.length > 0 ? sources[0].url : null;
  }

  function extractInstagramImages(options) {
    console.log("Starting Instagram extraction...");

    let imageUrls = [];

    // If monitoring is active, use cached images
    if (instagramMonitoring && instagramImageCache.size > 0) {
      imageUrls = Array.from(instagramImageCache);
      console.log(`Using ${imageUrls.length} cached images from monitoring.`);

      // Stop monitoring after extraction
      stopInstagramMonitoring();
    } else {
      // Fallback to immediate extraction
      const articles = Array.from(document.querySelectorAll('article'));
      if (articles.length === 0) {
        chrome.runtime.sendMessage({ action: 'instagram-extraction-failed', reason: "No post found!" });
        return;
      }

      let targetArticle = null;
      const dialog = document.querySelector('div[role="dialog"]');
      if (dialog) {
        targetArticle = dialog.querySelector('article') || dialog;
      } else {
        targetArticle = articles[0];
      }

      if (!targetArticle) targetArticle = document;

      const allImages = Array.from(targetArticle.querySelectorAll('img'));

      // Calculate max area to identify main content images
      let maxArea = 0;
      const imageCandidates = [];

      allImages.forEach(img => {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        const area = width * height;

        if (area > maxArea) {
          maxArea = area;
        }

        imageCandidates.push({ img, area, width, height });
      });

      // Filter images that are > 40% of the largest image area
      // This removes profile pics and icons while keeping portrait/landscape variations of main content
      const validImages = imageCandidates.filter(item => {
        if (maxArea < 10000) return item.area > 100; // Fallback for very small images
        return item.area >= (maxArea * 0.4);
      });

      const uniqueUrls = new Set();

      validImages.forEach(item => {
        const img = item.img;
        if (img.alt && img.alt.includes("profile picture")) return;

        let bestUrl = null;
        if (img.srcset) {
          bestUrl = getLargestImageFromSrcset(img.srcset);
        } else {
          bestUrl = img.src;
        }

        if (bestUrl) {
          uniqueUrls.add(bestUrl);
        }
      });

      imageUrls = Array.from(uniqueUrls);
    }

    // Determine Preview Path for UI
    const dummyUrl = imageUrls.length > 0 ? imageUrls[0] : 'https://instagram.com/unknown.jpg';
    const folderPath = generatePreviewPath(dummyUrl, window.location.href, options);
    const folderName = folderPath.split('/').pop();

    if (imageUrls.length > 0) {
      console.log(`Found ${imageUrls.length} high-quality images.`);

      chrome.runtime.sendMessage({
        action: 'instagram-extraction-started',
        count: imageUrls.length,
        folderName: folderName,
        fullPath: folderPath
      });

      chrome.runtime.sendMessage({
        action: 'process-downloads',
        urls: imageUrls,
        options: options,
        tabUrl: window.location.href
      });
    } else {
      chrome.runtime.sendMessage({ action: 'instagram-extraction-failed', reason: "No large images found." });
    }
  }

  // --- Instagram Monitoring Functions ---

  function startInstagramMonitoring(options) {
    console.log("Starting Instagram monitoring...");

    // Reset cache and state
    instagramImageCache.clear();
    instagramMaxArea = 0;
    instagramMonitoring = true;

    // Initial scan of existing images
    scanForInstagramImages();

    // Set up MutationObserver to watch for new images
    instagramObserver = new MutationObserver((mutations) => {
      let shouldScan = false;

      for (const mutation of mutations) {
        // Check if new nodes were added
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'IMG' || node.querySelector('img')) {
                shouldScan = true;
                break;
              }
            }
          }
        }

        // Check if src/srcset attributes changed
        if (mutation.type === 'attributes' && mutation.target.tagName === 'IMG') {
          shouldScan = true;
        }

        if (shouldScan) break;
      }

      if (shouldScan) {
        // Debounce scanning to avoid excessive processing
        setTimeout(() => scanForInstagramImages(), 300);
      }
    });

    // Find the target container (dialog or main article)
    let targetContainer = document.querySelector('div[role="dialog"]');
    if (!targetContainer) {
      targetContainer = document.querySelector('article') || document.body;
    }

    // Start observing
    instagramObserver.observe(targetContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset']
    });

    chrome.runtime.sendMessage({
      action: 'instagram-monitoring-started',
      count: instagramImageCache.size
    });

    console.log("Instagram monitoring active.");
  }

  function stopInstagramMonitoring() {
    console.log("Stopping Instagram monitoring...");

    if (instagramObserver) {
      instagramObserver.disconnect();
      instagramObserver = null;
    }

    instagramMonitoring = false;

    chrome.runtime.sendMessage({
      action: 'instagram-monitoring-stopped',
      finalCount: instagramImageCache.size
    });

    console.log(`Monitoring stopped. Total images cached: ${instagramImageCache.size}`);
  }

  function scanForInstagramImages() {
    if (!instagramMonitoring) return;

    const articles = Array.from(document.querySelectorAll('article'));
    let targetArticle = null;

    const dialog = document.querySelector('div[role="dialog"]');
    if (dialog) {
      targetArticle = dialog.querySelector('article') || dialog;
    } else if (articles.length > 0) {
      targetArticle = articles[0];
    }

    if (!targetArticle) targetArticle = document;

    const allImages = Array.from(targetArticle.querySelectorAll('img'));
    let newImagesFound = false;

    // Calculate max area across all images
    allImages.forEach(img => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      const area = width * height;

      if (area > instagramMaxArea) {
        instagramMaxArea = area;
      }
    });

    // Process each image
    allImages.forEach(img => {
      const discovered = processDiscoveredImage(img);
      if (discovered) newImagesFound = true;
    });

    // Notify popup if new images were found
    if (newImagesFound) {
      notifyPopupOfDiscovery();
    }
  }

  function processDiscoveredImage(img) {
    // Skip profile pictures
    if (img.alt && img.alt.includes("profile picture")) return false;

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const area = width * height;

    // Filter by area (same logic as extraction)
    if (instagramMaxArea >= 10000 && area < (instagramMaxArea * 0.4)) {
      return false;
    }

    if (instagramMaxArea < 10000 && area <= 100) {
      return false;
    }

    // Get best quality URL
    let bestUrl = null;
    if (img.srcset) {
      bestUrl = getLargestImageFromSrcset(img.srcset);
    } else {
      bestUrl = img.src;
    }

    if (bestUrl && !instagramImageCache.has(bestUrl)) {
      instagramImageCache.add(bestUrl);
      console.log(`Discovered new image: ${bestUrl.substring(0, 80)}...`);
      return true;
    }

    return false;
  }

  function notifyPopupOfDiscovery() {
    chrome.runtime.sendMessage({
      action: 'instagram-images-discovered',
      count: instagramImageCache.size
    });
  }

})();
