/**
 * Instagram Injected Panel
 * Creates a persistent floating UI panel for Instagram pages
 */

(function () {
    'use strict';

    // Only run on Instagram
    if (!window.location.hostname.includes('instagram.com')) {
        return;
    }

    let panel = null;
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    let xOffset = 0;
    let yOffset = 0;

    /**
     * Create and inject the floating panel
     */
    function createPanel() {
        // Check if panel already exists
        if (document.getElementById('img-extractor-panel')) {
            return;
        }

        // Create panel container
        panel = document.createElement('div');
        panel.id = 'img-extractor-panel';
        panel.className = 'img-extractor-panel';

        // Build panel HTML
        panel.innerHTML = `
            <div class="panel-header" id="panel-header">
                <h3 class="panel-title">Img Extractor</h3>
                <div class="panel-controls">
                    <button class="panel-btn" id="panel-minimize" title="Minimize">−</button>
                    <button class="panel-btn" id="panel-close" title="Close">×</button>
                </div>
            </div>
            <div class="panel-content" id="panel-content">
                <div class="panel-form-group">
                    <label for="panel-default-location">Default Location</label>
                    <input type="text" id="panel-default-location" placeholder="e.g., Images/Actress" value="actresses">
                </div>
                
                <div class="panel-form-group">
                    <label for="panel-actress-name">Actress Name</label>
                    <input type="text" id="panel-actress-name" placeholder="Enter actress name">
                </div>

                <div class="panel-folder-path" id="panel-folder-path" style="display: none;">
                    <label>Destination Folder</label>
                    <code id="panel-folder-display"></code>
                </div>

                <div id="panel-monitoring-status" class="panel-monitoring-status" style="display: none;">
                    <div class="panel-monitoring-indicator">
                        <span class="panel-pulse-dot"></span>
                        <span>Monitoring for media...</span>
                    </div>
                    <div class="panel-media-counters">
                        <div class="panel-counter-item">
                            <strong id="panel-image-count">0</strong>
                            <span>images</span>
                        </div>
                        <div class="panel-counter-divider">•</div>
                        <div class="panel-counter-item">
                            <strong id="panel-video-count">0</strong>
                            <span>videos</span>
                        </div>
                    </div>
                </div>

                <div class="panel-button-group">
                    <button class="panel-button secondary" id="panel-start-monitoring">Start Monitoring</button>
                    <button class="panel-button secondary" id="panel-stop-monitoring" style="display: none;">Stop Monitoring</button>
                </div>

                <div class="panel-button-group">
                    <button class="panel-button primary" id="panel-download-images" disabled>Download Images</button>
                    <button class="panel-button primary" id="panel-download-videos" disabled>Download Videos</button>
                </div>

                <div id="panel-status" class="panel-status" style="display: none;"></div>
            </div>
        `;

        // Append to body
        document.body.appendChild(panel);

        // Load saved position and state
        loadPanelState();

        // Setup event listeners
        setupEventListeners();

        // Load saved settings
        loadSettings();

        console.log('Instagram panel injected');
    }

    /**
     * Setup all event listeners
     */
    function setupEventListeners() {
        const header = document.getElementById('panel-header');
        const minimizeBtn = document.getElementById('panel-minimize');
        const closeBtn = document.getElementById('panel-close');

        // Drag functionality
        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        // Minimize/Close
        minimizeBtn.addEventListener('click', toggleMinimize);
        closeBtn.addEventListener('click', closePanel);

        // Instagram-specific buttons
        document.getElementById('panel-start-monitoring').addEventListener('click', startMonitoring);
        document.getElementById('panel-stop-monitoring').addEventListener('click', stopMonitoring);
        document.getElementById('panel-download-images').addEventListener('click', downloadImages);
        document.getElementById('panel-download-videos').addEventListener('click', downloadVideos);

        // Settings inputs
        document.getElementById('panel-default-location').addEventListener('input', saveSettings);
        document.getElementById('panel-actress-name').addEventListener('input', saveSettings);

        // Listen for messages from content script via window messages
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            if (event.data.type && event.data.type.startsWith('IMG_EXTRACTOR_')) {
                handleMessage(event.data);
            }
        });
    }

    /**
     * Drag functionality
     */
    function dragStart(e) {
        if (e.target.closest('.panel-controls')) return;

        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

        if (e.target === document.getElementById('panel-header') ||
            e.target.closest('#panel-header')) {
            isDragging = true;
            panel.classList.add('dragging');
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            setTranslate(currentX, currentY, panel);
        }
    }

    function dragEnd(e) {
        if (isDragging) {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            panel.classList.remove('dragging');
            savePanelState();
        }
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate(${xPos}px, ${yPos}px); `;
    }

    /**
     * Toggle minimize/maximize
     */
    function toggleMinimize() {
        panel.classList.toggle('minimized');
        const btn = document.getElementById('panel-minimize');
        btn.textContent = panel.classList.contains('minimized') ? '+' : '−';
        savePanelState();
    }

    /**
     * Close panel
     */
    function closePanel() {
        panel.style.display = 'none';
        savePanelState();
    }

    /**
     * Save panel state to storage
     */
    function savePanelState() {
        const state = {
            x: xOffset,
            y: yOffset,
            minimized: panel.classList.contains('minimized'),
            visible: panel.style.display !== 'none'
        };
        chrome.storage.local.set({ panelState: state });
    }

    /**
     * Load panel state from storage
     */
    function loadPanelState() {
        chrome.storage.local.get(['panelState'], (result) => {
            if (result.panelState) {
                const state = result.panelState;
                xOffset = state.x || 0;
                yOffset = state.y || 0;
                setTranslate(xOffset, yOffset, panel);

                if (state.minimized) {
                    panel.classList.add('minimized');
                    document.getElementById('panel-minimize').textContent = '+';
                }

                if (!state.visible) {
                    panel.style.display = 'none';
                }
            }
        });
    }

    /**
     * Load settings from storage
     */
    function loadSettings() {
        chrome.storage.local.get(['defaultLocation', 'actressName'], (result) => {
            if (result.defaultLocation) {
                document.getElementById('panel-default-location').value = result.defaultLocation;
            }
            if (result.actressName) {
                document.getElementById('panel-actress-name').value = result.actressName;
            }
        });
    }

    /**
     * Save settings to storage
     */
    function saveSettings() {
        const settings = {
            defaultLocation: document.getElementById('panel-default-location').value,
            actressName: document.getElementById('panel-actress-name').value
        };
        chrome.storage.local.set(settings);
    }

    /**
     * Instagram-specific functions
     */
    function startMonitoring() {
        const options = {
            defaultLocation: document.getElementById('panel-default-location').value,
            actressName: document.getElementById('panel-actress-name').value
        };
        // Send message to the content script in the same page
        window.postMessage({
            type: 'IMG_EXTRACTOR_START_MONITORING',
            options: options
        }, '*');
    }

    function stopMonitoring() {
        // Send message to the content script in the same page
        window.postMessage({
            type: 'IMG_EXTRACTOR_STOP_MONITORING'
        }, '*');
    }

    function downloadImages() {
        const options = {
            defaultLocation: document.getElementById('panel-default-location').value,
            actressName: document.getElementById('panel-actress-name').value
        };
        // Send message to the content script in the same page
        window.postMessage({
            type: 'IMG_EXTRACTOR_DOWNLOAD',
            options: options,
            mediaType: 'images'
        }, '*');
    }

    function downloadVideos() {
        const options = {
            defaultLocation: document.getElementById('panel-default-location').value,
            actressName: document.getElementById('panel-actress-name').value
        };
        // Send message to the content script in the same page
        window.postMessage({
            type: 'IMG_EXTRACTOR_DOWNLOAD',
            options: options,
            mediaType: 'videos'
        }, '*');
    }

    /**
     * Handle messages from content script
     */
    function handleMessage(message) {
        switch (message.type) {
            case 'IMG_EXTRACTOR_MONITORING_STARTED':
                document.getElementById('panel-start-monitoring').style.display = 'none';
                document.getElementById('panel-stop-monitoring').style.display = 'block';
                document.getElementById('panel-monitoring-status').style.display = 'block';
                updateFolderPath(message.folderPath);
                break;

            case 'IMG_EXTRACTOR_MONITORING_STOPPED':
                document.getElementById('panel-start-monitoring').style.display = 'block';
                document.getElementById('panel-stop-monitoring').style.display = 'none';
                document.getElementById('panel-monitoring-status').style.display = 'none';
                break;

            case 'IMG_EXTRACTOR_MEDIA_DISCOVERED':
                document.getElementById('panel-image-count').textContent = message.imageCount || 0;
                document.getElementById('panel-video-count').textContent = message.videoCount || 0;

                // Enable download buttons if media found
                document.getElementById('panel-download-images').disabled = (message.imageCount || 0) === 0;
                document.getElementById('panel-download-videos').disabled = (message.videoCount || 0) === 0;
                break;

            case 'IMG_EXTRACTOR_EXTRACTION_STARTED':
                showStatus(`Downloading ${message.count} ${message.mediaType}...`, 'info');
                break;

            case 'IMG_EXTRACTOR_EXTRACTION_COMPLETE':
                showStatus(`Downloaded ${message.count} ${message.mediaType} successfully!`, 'success');
                // Reset counters after download
                document.getElementById('panel-image-count').textContent = '0';
                document.getElementById('panel-video-count').textContent = '0';
                document.getElementById('panel-download-images').disabled = true;
                document.getElementById('panel-download-videos').disabled = true;
                break;

            case 'IMG_EXTRACTOR_EXTRACTION_FAILED':
                showStatus(`Error: ${message.reason}`, 'error');
                break;
        }
    }

    /**
     * Update folder path display
     */
    function updateFolderPath(folderPath) {
        if (folderPath) {
            const folderDisplay = document.getElementById('panel-folder-display');
            const folderContainer = document.getElementById('panel-folder-path');
            folderDisplay.textContent = folderPath;
            folderContainer.style.display = 'block';
        }
    }

    /**
     * Show status message
     */
    function showStatus(message, type) {
        const statusEl = document.getElementById('panel-status');
        statusEl.textContent = message;
        statusEl.className = `panel-status ${type}`;
        statusEl.style.display = 'block';

        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }

    /**
     * Initialize panel when DOM is ready
     */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createPanel);
    } else {
        createPanel();
    }

})();
