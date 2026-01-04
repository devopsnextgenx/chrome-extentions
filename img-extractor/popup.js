document.addEventListener('DOMContentLoaded', async () => {
    const defaultLocationInput = document.getElementById('defaultLocation');
    const actressNameInput = document.getElementById('actressName');
    const selectElementBtn = document.getElementById('selectElementBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const statusMsg = document.getElementById('status');
    const folderPathContainer = document.getElementById('folderPathContainer');
    const folderPathDisplay = document.getElementById('folderPathDisplay');
    const folderIndicator = document.getElementById('folderIndicator');
    const copyFolderBtn = document.getElementById('copyFolderBtn');

    let isSelecting = false;
    let currentFolderPath = '';

    // Load persisted settings
    const data = await chrome.storage.local.get(['defaultLocation', 'actressName']);
    if (data.defaultLocation) defaultLocationInput.value = data.defaultLocation;
    if (data.actressName) actressNameInput.value = data.actressName;

    // Check current status when popup opens
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
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
                        }
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

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'element-selected') {
            downloadBtn.disabled = !message.hasImages;
            statusMsg.textContent = message.hasImages
                ? `${message.count} images found.`
                : 'No images found in selected element.';

            if (message.hasImages && message.folderName) {
                currentFolderPath = message.folderName;
                folderPathDisplay.textContent = message.folderName;
                folderPathContainer.style.display = 'block';
                if (folderIndicator) {
                    folderIndicator.className = 'indicator-dot ' + (message.exists ? 'exists' : 'new');
                }
            } else {
                currentFolderPath = '';
                folderPathContainer.style.display = 'none';
            }
        } else if (message.action === 'selectionCanceled') {
            isSelecting = false;
            updateUI();
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
        }
    }
});
