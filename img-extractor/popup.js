document.addEventListener('DOMContentLoaded', async () => {
    const defaultLocationInput = document.getElementById('defaultLocation');
    const actressNameInput = document.getElementById('actressName');
    const selectElementBtn = document.getElementById('selectElementBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const downloadInstaBtn = document.getElementById('downloadInstaBtn');
    const statusMsg = document.getElementById('status');
    const folderPathContainer = document.getElementById('folderPathContainer');
    const folderPathDisplay = document.getElementById('folderPathDisplay');
    const folderIndicator = document.getElementById('folderIndicator');
    const copyFolderBtn = document.getElementById('copyFolderBtn');

    // Instagram monitoring elements
    const instagramControls = document.getElementById('instagramControls');
    const startMonitoringBtn = document.getElementById('startMonitoringBtn');
    const stopMonitoringBtn = document.getElementById('stopMonitoringBtn');
    const monitoringStatus = document.getElementById('monitoringStatus');
    const imageCount = document.getElementById('imageCount');

    let isSelecting = false;
    let currentFolderPath = '';
    let currentFullFolderPath = '';
    let currentFolderExists = false;
    let currentApiPath = '';
    let isMonitoring = false;

    // Load persisted settings
    const data = await chrome.storage.local.get(['defaultLocation', 'actressName']);
    if (data.defaultLocation) defaultLocationInput.value = data.defaultLocation;
    if (data.actressName) actressNameInput.value = data.actressName;

    // Check current status when popup opens
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        // Check if we are on Instagram
        if (tab.url && tab.url.includes("instagram.com")) {
            // Show Instagram controls, hide regular controls
            if (selectElementBtn) selectElementBtn.style.display = 'none';
            if (downloadBtn) downloadBtn.style.display = 'none';
            if (instagramControls) instagramControls.style.display = 'block';
        } else {
            // Show regular controls, hide Instagram controls
            if (selectElementBtn) selectElementBtn.style.display = 'block';
            if (downloadBtn) downloadBtn.style.display = 'block';
            if (instagramControls) instagramControls.style.display = 'none';
        }

        chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }, (response) => {
            if (chrome.runtime.lastError) return;
            if (response) {
                isSelecting = response.isSelecting;
                if (response.hasSelection) {
                    downloadBtn.disabled = false;
                    statusMsg.textContent = "Element selected! Click Download.";

                    if (response.folderName) {
                        currentFolderPath = response.folderName;
                        folderPathDisplay.textContent = response.folderName;
                        folderPathContainer.style.display = 'block';
                        if (folderIndicator) {
                            folderIndicator.className = 'indicator-dot ' + (response.exists ? 'exists' : 'new');
                            folderIndicator.title = response.exists ? 'Click to open folder' : 'Folder does not exist';
                        }
                        currentFullFolderPath = response.fullFolderPath || '';
                        currentApiPath = response.apiPath || '';
                        currentFolderExists = !!response.exists;
                    }
                }
                updateUI();
            }
        });
    }

    // Persist settings on change
    defaultLocationInput.addEventListener('input', () => {
        chrome.storage.local.set({ defaultLocation: defaultLocationInput.value });
    });

    actressNameInput.addEventListener('input', () => {
        chrome.storage.local.set({ actressName: actressNameInput.value });
    });

    // Select Element button handler
    selectElementBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        chrome.tabs.sendMessage(tab.id, { action: 'toggleSelection' }, (response) => {
            if (chrome.runtime.lastError) {
                statusMsg.textContent = "Error: Please refresh the page.";
                return;
            }

            isSelecting = response.isSelecting;
            updateUI();
        });
    });

    // Start Monitoring button handler
    if (startMonitoringBtn) {
        startMonitoringBtn.addEventListener('click', async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            const options = {
                defaultLocation: defaultLocationInput.value,
                actressName: actressNameInput.value
            };

            chrome.tabs.sendMessage(tab.id, { action: 'start_instagram_monitoring', options });
        });
    }

    // Stop Monitoring button handler
    if (stopMonitoringBtn) {
        stopMonitoringBtn.addEventListener('click', async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            chrome.tabs.sendMessage(tab.id, { action: 'stop_instagram_monitoring' });
        });
    }

    // Download Instagram button handler
    if (downloadInstaBtn) {
        downloadInstaBtn.addEventListener('click', async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            const options = {
                defaultLocation: defaultLocationInput.value,
                actressName: actressNameInput.value
            };

            statusMsg.textContent = 'Extracting Instagram images...';

            chrome.tabs.sendMessage(tab.id, { action: 'extract_instagram_images', options });
        });
    }

    // Download button handler
    downloadBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        const options = {
            defaultLocation: defaultLocationInput.value,
            actressName: actressNameInput.value
        };

        chrome.tabs.sendMessage(tab.id, { action: 'start-download', options });
        statusMsg.textContent = 'Initiating download...';
    });

    // Copy folder name button handler
    copyFolderBtn.addEventListener('click', () => {
        if (currentFolderPath) {
            navigator.clipboard.writeText(currentFolderPath).then(() => {
                copyFolderBtn.classList.add('copied');
                setTimeout(() => copyFolderBtn.classList.remove('copied'), 2000);
            });
        }
    });

    // Indicator dot click handler
    folderIndicator.addEventListener('click', () => {
        if (currentFolderExists && currentApiPath) {
            chrome.runtime.sendMessage({ action: 'open-web-folder', path: currentApiPath });
        } else if (currentFolderExists && currentFullFolderPath) {
            chrome.runtime.sendMessage({ action: 'open-folder', path: currentFullFolderPath });
        }
    });

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'element-selected') {
            const hasNew = message.hasImages && (message.newCount === undefined || message.newCount > 0);
            downloadBtn.disabled = !hasNew;

            if (message.hasImages) {
                if (message.newCount === 0) {
                    statusMsg.textContent = `All ${message.count} images already exist.`;
                } else if (message.newCount !== undefined) {
                    statusMsg.textContent = `${message.newCount} new images found (of ${message.count}).`;
                } else {
                    statusMsg.textContent = `${message.count} images found.`;
                }
            } else {
                statusMsg.textContent = 'No images found in selected element.';
            }

            if (message.hasImages && message.folderName) {
                currentFolderPath = message.folderName;
                folderPathDisplay.textContent = message.folderName;
                currentFullFolderPath = message.fullFolderPath;
                currentApiPath = message.apiPath;
                currentFolderExists = !!message.exists;

                folderPathContainer.style.display = 'block';
                if (folderIndicator) {
                    folderIndicator.className = 'indicator-dot ' + (message.exists ? 'exists' : 'new');
                    folderIndicator.title = message.exists ? 'Click to open folder' : 'Folder does not exist';
                }
            } else {
                currentFolderPath = '';
                currentFullFolderPath = '';
                currentFolderExists = false;
                folderPathContainer.style.display = 'none';
            }
        } else if (message.action === 'selectionCanceled') {
            isSelecting = false;
            updateUI();
        } else if (message.action === 'instagram-extraction-started') {
            const folderText = message.folderName ? ` to '${message.folderName}'` : '';
            statusMsg.innerHTML = `Found ${message.count} images.<br>Downloading${folderText}...`;
            statusMsg.style.color = 'lightgreen';
        } else if (message.action === 'instagram-extraction-failed') {
            statusMsg.textContent = message.reason || 'Extraction failed.';
            statusMsg.style.color = '#ff6b6b';
        } else if (message.action === 'instagram-monitoring-started') {
            isMonitoring = true;
            updateInstagramMonitoringUI(message.count);
            statusMsg.textContent = 'Monitoring started. Scroll through the carousel.';
            statusMsg.style.color = '#4CAF50';
        } else if (message.action === 'instagram-monitoring-stopped') {
            isMonitoring = false;
            updateInstagramMonitoringUI(message.finalCount || 0);
            statusMsg.textContent = `Monitoring stopped. ${message.finalCount || 0} images cached.`;
            statusMsg.style.color = '#888';
        } else if (message.action === 'instagram-images-discovered') {
            updateInstagramMonitoringUI(message.count);
        }
    });

    function updateUI() {
        if (isSelecting) {
            selectElementBtn.textContent = "Cancel Selection";
            selectElementBtn.classList.add('active');
            statusMsg.textContent = "Hover and click an element on the page.";
        } else {
            selectElementBtn.textContent = "Select Element";
            selectElementBtn.classList.remove('active');
            statusMsg.textContent = "Click Select Element to begin.";
            downloadBtn.disabled = true;
            folderPathContainer.style.display = 'none';
            currentFolderPath = '';
            currentFullFolderPath = '';
            currentFolderExists = false;
        }
    }

    function updateInstagramMonitoringUI(count) {
        if (imageCount) {
            imageCount.textContent = count;
        }

        if (isMonitoring) {
            // Show monitoring status
            if (monitoringStatus) monitoringStatus.style.display = 'block';
            if (startMonitoringBtn) startMonitoringBtn.style.display = 'none';
            if (stopMonitoringBtn) stopMonitoringBtn.style.display = 'inline-block';

            // Show download button if images found
            if (downloadInstaBtn) {
                if (count > 0) {
                    downloadInstaBtn.style.display = 'inline-block';
                    downloadInstaBtn.textContent = `Download ${count} Image${count !== 1 ? 's' : ''}`;
                } else {
                    downloadInstaBtn.style.display = 'none';
                }
            }
        } else {
            // Hide monitoring status
            if (monitoringStatus) monitoringStatus.style.display = 'none';
            if (startMonitoringBtn) startMonitoringBtn.style.display = 'inline-block';
            if (stopMonitoringBtn) stopMonitoringBtn.style.display = 'none';
            if (downloadInstaBtn) downloadInstaBtn.style.display = 'none';
        }
    }
});
