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
  let instagramVideoCache = new Set();
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
      extractInstagramImages(request.options, request.mediaType);
    } else if (request.action === 'start_instagram_monitoring') {
      startInstagramMonitoring(request.options);
    } else if (request.action === 'stop_instagram_monitoring') {
      stopInstagramMonitoring();
    }
  });

  // Listen for messages from Instagram panel (window messages)
  window.addEventListener('message', (event) => {
    // Only accept messages from the same window
    if (event.source !== window) return;
    
    if (event.data.type === 'IMG_EXTRACTOR_START_MONITORING') {
      startInstagramMonitoring(event.data.options);
    } else if (event.data.type === 'IMG_EXTRACTOR_STOP_MONITORING') {
      stopInstagramMonitoring();
    } else if (event.data.type === 'IMG_EXTRACTOR_DOWNLOAD') {
      extractInstagramImages(event.data.options, event.data.mediaType);
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

  function generateFolderPathFromOptions(options) {
    let fullPath = [];
    if (options.defaultLocation) fullPath.push(options.defaultLocation.trim().replace(/^\/+|\/+$/g, ''));
    if (options.actressName) fullPath.push(options.actressName.trim().replace(/^\/+|\/+$/g, ''));
    return fullPath.length > 0 ? fullPath.join('/') : 'actresses';
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

  async function extractInstagramImages(options, mediaType = 'all') {
    console.log(`Starting Instagram extraction for: ${mediaType}...`);

    let imageUrls = [];
    let videoUrls = [];

    // If monitoring is active, use cached media
    if (instagramMonitoring && (instagramImageCache.size > 0 || instagramVideoCache.size > 0)) {
      imageUrls = Array.from(instagramImageCache);
      videoUrls = Array.from(instagramVideoCache);
      console.log(`Using ${imageUrls.length} cached images and ${videoUrls.length} cached videos from monitoring.`);

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

      // Extract images
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
      const validImages = imageCandidates.filter(item => {
        if (maxArea < 10000) return item.area > 100;
        return item.area >= (maxArea * 0.4);
      });

      const uniqueImageUrls = new Set();

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
          uniqueImageUrls.add(bestUrl);
        }
      });

      imageUrls = Array.from(uniqueImageUrls);

      // Extract videos - capture blob data immediately before URLs are revoked
      const allVideos = Array.from(targetArticle.querySelectorAll('video'));
      const videoDataPromises = [];
      const uniqueVideoUrls = new Set();

      allVideos.forEach(video => {
        const videoUrl = getVideoUrl(video);
        if (videoUrl && isValidVideoUrl(videoUrl)) {
          if (videoUrl.startsWith('blob:')) {
            // For blob URLs, fetch immediately before they're revoked
            videoDataPromises.push(
              fetch(videoUrl)
                .then(response => response.blob())
                .then(blob => {
                  return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                  });
                })
                .catch(error => {
                  console.error('Failed to capture blob video:', videoUrl, error);
                  return null;
                })
            );
          } else {
            // Regular URLs can be added directly
            uniqueVideoUrls.add(videoUrl);
          }
        }
      });

      // Wait for all blob conversions to complete
      if (videoDataPromises.length > 0) {
        const convertedVideos = await Promise.all(videoDataPromises);
        convertedVideos.forEach(dataUrl => {
          if (dataUrl) {
            uniqueVideoUrls.add(dataUrl);
          }
        });
      }

      videoUrls = Array.from(uniqueVideoUrls);
    }

    // Filter based on mediaType
    let urlsToDownload = [];
    let mediaTypeLabel = '';

    if (mediaType === 'images') {
      urlsToDownload = imageUrls;
      mediaTypeLabel = 'images';
    } else if (mediaType === 'videos') {
      urlsToDownload = videoUrls;
      mediaTypeLabel = 'videos';
    } else {
      urlsToDownload = [...imageUrls, ...videoUrls];
      mediaTypeLabel = 'items';
    }

    // Final deduplication to prevent duplicates from dynamic detection
    const uniqueUrlsToDownload = [...new Set(urlsToDownload)];
    const duplicatesRemoved = urlsToDownload.length - uniqueUrlsToDownload.length;

    if (duplicatesRemoved > 0) {
      console.log(`Removed ${duplicatesRemoved} duplicate(s) before download.`);
    }

    urlsToDownload = uniqueUrlsToDownload;

    // Determine Preview Path for UI
    const dummyUrl = urlsToDownload.length > 0 ? urlsToDownload[0] : 'https://instagram.com/unknown.jpg';
    const folderPath = generatePreviewPath(dummyUrl, window.location.href, options);
    const folderName = folderPath.split('/').pop();

    if (urlsToDownload.length > 0) {
      console.log(`Found ${urlsToDownload.length} ${mediaTypeLabel}.`);

      // Send message to Instagram panel
      window.postMessage({
        type: 'IMG_EXTRACTOR_EXTRACTION_STARTED',
        count: urlsToDownload.length,
        mediaType: mediaTypeLabel
      }, '*');

      chrome.runtime.sendMessage({
        action: 'instagram-extraction-started',
        count: urlsToDownload.length,
        folderName: folderName,
        fullPath: folderPath,
        mediaType: mediaType
      });

      // Convert blob URLs to data URLs before sending to background
      convertBlobUrlsToDataUrls(urlsToDownload).then(convertedUrls => {
        chrome.runtime.sendMessage({
          action: 'process-downloads',
          urls: convertedUrls,
          options: options,
          tabUrl: window.location.href
        });
        
        // Send completion message to Instagram panel
        window.postMessage({
          type: 'IMG_EXTRACTOR_EXTRACTION_COMPLETE',
          count: convertedUrls.length,
          mediaType: mediaTypeLabel
        }, '*');
      }).catch(error => {
        console.error('Error converting blob URLs:', error);
        
        // Send error message to Instagram panel
        window.postMessage({
          type: 'IMG_EXTRACTOR_EXTRACTION_FAILED',
          reason: `Failed to process ${mediaTypeLabel}: ${error.message}`
        }, '*');
        
        chrome.runtime.sendMessage({
          action: 'instagram-extraction-failed',
          reason: `Failed to process ${mediaTypeLabel}: ${error.message}`
        });
      });
    } else {
      // Send error message to Instagram panel
      window.postMessage({
        type: 'IMG_EXTRACTOR_EXTRACTION_FAILED',
        reason: `No ${mediaTypeLabel} found.`
      }, '*');
      
      chrome.runtime.sendMessage({ action: 'instagram-extraction-failed', reason: `No ${mediaTypeLabel} found.` });
    }
  }

  /**
   * Convert blob URLs to data URLs so they can be accessed from background script
   * For videos, we need to track the video element to access the blob properly
   */
  async function convertBlobUrlsToDataUrls(urls) {
    const convertedUrls = [];

    for (const url of urls) {
      if (url.startsWith('blob:')) {
        try {
          console.log('Converting blob URL to data URL:', url.substring(0, 80) + '...');

          // Try to find the video element with this blob URL
          const videoElement = document.querySelector(`video[src="${url}"], video[currentSrc="${url}"]`);

          if (videoElement) {
            // If we have the video element, try to get blob from it
            try {
              const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                mode: 'cors'
              });

              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }

              const blob = await response.blob();

              // Convert blob to data URL
              const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });

              console.log('Successfully converted blob to data URL via fetch');
              convertedUrls.push(dataUrl);
              continue;
            } catch (fetchError) {
              console.warn('Fetch failed, trying XMLHttpRequest:', fetchError);

              // Fallback to XMLHttpRequest
              try {
                const blob = await new Promise((resolve, reject) => {
                  const xhr = new XMLHttpRequest();
                  xhr.open('GET', url, true);
                  xhr.responseType = 'blob';
                  xhr.withCredentials = true;

                  xhr.onload = function () {
                    if (this.status === 200) {
                      resolve(this.response);
                    } else {
                      reject(new Error(`XHR failed with status ${this.status}`));
                    }
                  };

                  xhr.onerror = function () {
                    reject(new Error('XHR network error'));
                  };

                  xhr.send();
                });

                const dataUrl = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });

                console.log('Successfully converted blob to data URL via XHR');
                convertedUrls.push(dataUrl);
                continue;
              } catch (xhrError) {
                console.error('XHR also failed:', xhrError);
              }
            }
          }

          // If all else fails, skip this video
          console.error('Could not convert blob URL, skipping:', url);
          chrome.runtime.sendMessage({
            action: 'instagram-extraction-failed',
            reason: 'Failed to access video data. The video may be protected or already closed.'
          });
        } catch (error) {
          console.error('Failed to convert blob URL:', url, error);
        }
      } else {
        // Not a blob URL, keep as-is
        convertedUrls.push(url);
      }
    }

    return convertedUrls;
  }

  function getVideoUrl(videoElement) {
    // Try currentSrc first (what's actually playing)
    if (videoElement.currentSrc && videoElement.currentSrc !== '') {
      console.log('Video currentSrc:', videoElement.currentSrc);
      return videoElement.currentSrc;
    }

    // Try direct src
    if (videoElement.src && videoElement.src !== '') {
      console.log('Video src:', videoElement.src);
      return videoElement.src;
    }

    // Try source elements
    const sources = videoElement.querySelectorAll('source');
    for (const source of sources) {
      if (source.src && source.src !== '') {
        console.log('Video source src:', source.src);
        return source.src;
      }
    }

    console.log('No video URL found for video element:', videoElement);
    return null;
  }

  function isValidVideoUrl(url) {
    if (!url) {
      console.log('Video URL is null or empty');
      return false;
    }

    // Accept any http/https URL or blob URL
    const isValid = url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('blob:');

    console.log(`Video URL validation: ${url.substring(0, 80)}... -> ${isValid}`);
    return isValid;
  }

  // --- Instagram Monitoring Functions ---

  function startInstagramMonitoring(options) {
    console.log("Starting Instagram monitoring...", options);

    // Reset cache and state
    instagramImageCache.clear();
    instagramVideoCache.clear();
    instagramMaxArea = 0;
    instagramMonitoring = true;

    // Generate folder path
    const folderPath = generateFolderPathFromOptions(options);

    // Initial scan of existing media
    scanForInstagramMedia();

    // Set up MutationObserver to watch for new images and videos
    instagramObserver = new MutationObserver((mutations) => {
      let shouldScan = false;

      for (const mutation of mutations) {
        // Check if new nodes were added
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'IMG' || node.tagName === 'VIDEO' ||
                node.querySelector('img') || node.querySelector('video')) {
                shouldScan = true;
                break;
              }
            }
          }
        }

        // Check if src/srcset attributes changed
        if (mutation.type === 'attributes' &&
          (mutation.target.tagName === 'IMG' || mutation.target.tagName === 'VIDEO')) {
          shouldScan = true;
        }

        if (shouldScan) break;
      }

      if (shouldScan) {
        // Debounce scanning to avoid excessive processing
        setTimeout(() => scanForInstagramMedia(), 300);
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

    // Send message to Instagram panel
    window.postMessage({
      type: 'IMG_EXTRACTOR_MONITORING_STARTED',
      imageCount: instagramImageCache.size,
      videoCount: instagramVideoCache.size,
      folderPath: folderPath
    }, '*');

    // Also send to popup/background
    chrome.runtime.sendMessage({
      action: 'instagram-monitoring-started',
      imageCount: instagramImageCache.size,
      videoCount: instagramVideoCache.size
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

    // Send message to Instagram panel
    window.postMessage({
      type: 'IMG_EXTRACTOR_MONITORING_STOPPED',
      imageCount: instagramImageCache.size,
      videoCount: instagramVideoCache.size
    }, '*');

    // Also send to popup/background
    chrome.runtime.sendMessage({
      action: 'instagram-monitoring-stopped',
      imageCount: instagramImageCache.size,
      videoCount: instagramVideoCache.size
    });

    console.log(`Monitoring stopped. Images: ${instagramImageCache.size}, Videos: ${instagramVideoCache.size}`);
  }

  function scanForInstagramMedia() {
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
    const allVideos = Array.from(targetArticle.querySelectorAll('video'));
    let newMediaFound = false;

    console.log(`Scanning: ${allImages.length} images, ${allVideos.length} videos`);

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
      if (discovered) newMediaFound = true;
    });

    // Process each video
    allVideos.forEach(video => {
      console.log('Processing video element:', video);
      const discovered = processDiscoveredVideo(video);
      if (discovered) newMediaFound = true;
    });

    // Notify popup if new media was found
    if (newMediaFound) {
      notifyPopupOfDiscovery();
    }

    console.log(`Cache status - Images: ${instagramImageCache.size}, Videos: ${instagramVideoCache.size}`);
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

  function processDiscoveredVideo(video) {
    let videoUrl = getVideoUrl(video);

    // If no URL found, wait a bit and try again (videos might load async)
    if (!videoUrl) {
      console.log('Video URL not immediately available, will retry...');
      setTimeout(() => {
        videoUrl = getVideoUrl(video);
        if (videoUrl && isValidVideoUrl(videoUrl)) {
          handleVideoUrl(videoUrl);
        }
      }, 500);
      return false;
    }

    if (!isValidVideoUrl(videoUrl)) {
      return false;
    }

    return handleVideoUrl(videoUrl);
  }

  function handleVideoUrl(videoUrl) {
    if (videoUrl.startsWith('blob:')) {
      // Find the video element to capture its stream
      const videoElement = document.querySelector(`video[src="${videoUrl}"], video[currentSrc="${videoUrl}"]`);

      if (!videoElement) {
        console.error('Could not find video element for blob URL');
        return false;
      }

      // Try to capture the video using MediaRecorder
      try {
        // Check if video is playing or can be played
        if (videoElement.paused) {
          videoElement.play().catch(e => console.warn('Could not play video:', e));
        }

        // Wait a bit for video to start playing
        setTimeout(() => {
          try {
            // Capture the stream from the video element
            const stream = videoElement.captureStream ? videoElement.captureStream() : videoElement.mozCaptureStream();

            if (!stream) {
              console.error('captureStream not supported or failed');
              return;
            }

            const chunks = [];
            const mediaRecorder = new MediaRecorder(stream, {
              mimeType: 'video/webm;codecs=vp8'
            });

            mediaRecorder.ondataavailable = (event) => {
              if (event.data && event.data.size > 0) {
                chunks.push(event.data);
              }
            };

            mediaRecorder.onstop = () => {
              const blob = new Blob(chunks, { type: 'video/webm' });
              const reader = new FileReader();

              reader.onloadend = () => {
                const dataUrl = reader.result;
                if (!instagramVideoCache.has(dataUrl)) {
                  instagramVideoCache.add(dataUrl);
                  console.log(`Discovered new video (captured via MediaRecorder): ${dataUrl.substring(0, 80)}...`);
                  notifyPopupOfDiscovery();
                }
              };

              reader.readAsDataURL(blob);
            };

            // Record for the duration of the video (or max 30 seconds)
            mediaRecorder.start();

            const duration = Math.min(videoElement.duration || 30, 30) * 1000;
            setTimeout(() => {
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
              }
            }, duration);

          } catch (error) {
            console.error('Failed to capture video stream:', error);
          }
        }, 500);

      } catch (error) {
        console.error('Failed to setup video capture:', error);
      }

      return true; // Indicate we're processing it
    } else {
      // Regular URL
      if (!instagramVideoCache.has(videoUrl)) {
        instagramVideoCache.add(videoUrl);
        console.log(`Discovered new video: ${videoUrl.substring(0, 80)}...`);
        notifyPopupOfDiscovery();
        return true;
      }
    }

    return false;
  }

  function notifyPopupOfDiscovery() {
    // Send message to Instagram panel
    window.postMessage({
      type: 'IMG_EXTRACTOR_MEDIA_DISCOVERED',
      imageCount: instagramImageCache.size,
      videoCount: instagramVideoCache.size
    }, '*');

    // Also send to popup/background
    chrome.runtime.sendMessage({
      action: 'instagram-media-discovered',
      imageCount: instagramImageCache.size,
      videoCount: instagramVideoCache.size
    });
  }

})();
