document.addEventListener('DOMContentLoaded', async () => {
    const startBtn = document.getElementById('startBtn');
    const extractBtn = document.getElementById('extractBtn');
    const statusMsg = document.getElementById('statusMsg');
    const output = document.getElementById('output');
    const threadNumberInput = document.getElementById('threadNumber');
    const fileNameInput = document.getElementById('fileName');

    const directSaveCheckbox = document.getElementById('directSave');

    let isSelecting = false;

    // Load saved settings
    chrome.storage.local.get(['threadNumber', 'fileName', 'directSave'], (data) => {
        if (data.threadNumber) threadNumberInput.value = data.threadNumber;
        if (data.fileName) fileNameInput.value = data.fileName;
        if (data.directSave !== undefined) directSaveCheckbox.checked = data.directSave;
    });

    // Save settings on change
    [threadNumberInput, fileNameInput, directSaveCheckbox].forEach(el => {
        el.addEventListener('input', () => {
            chrome.storage.local.set({
                threadNumber: threadNumberInput.value,
                fileName: fileNameInput.value,
                directSave: directSaveCheckbox.checked
            });
        });
    });

    // Check current status when popup opens
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }, (response) => {
            if (chrome.runtime.lastError) return;
            if (response) {
                isSelecting = response.isSelecting;
                if (response.hasSelection) {
                    extractBtn.disabled = false;
                    statusMsg.textContent = "Element selected! Click Extract.";
                }
                updateUI();
            }
        });
    }

    startBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        chrome.tabs.sendMessage(tab.id, { action: 'toggleSelection' }, (response) => {
            if (chrome.runtime.lastError) {
                statusMsg.textContent = "Error: Please refresh the page.";
                return;
            }

            isSelecting = response.isSelecting;
            updateUI();
        });
    });

    extractBtn.addEventListener('click', async () => {
        const threadNumber = threadNumberInput.value.trim();
        const fileName = fileNameInput.value.trim();
        const directSave = directSaveCheckbox.checked;

        if (!threadNumber || !fileName) {
            statusMsg.textContent = "Please enter Thread Number and File Name.";
            statusMsg.style.color = "#ef4444";
            return;
        }

        statusMsg.style.color = "var(--text-dim)";
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        chrome.tabs.sendMessage(tab.id, { action: 'extract' }, async (response) => {
            if (response && response.data) {
                const yamlStr = toYaml(response.data);

                if (!directSave) {
                    output.textContent = yamlStr;
                    Prism.highlightElement(output);
                } else {
                    output.textContent = "Direct save enabled. Downloading...";
                }

                statusMsg.textContent = "Extracted! Starting downloads...";

                try {
                    chrome.runtime.sendMessage({
                        action: 'downloadAll',
                        data: {
                            threadNumber,
                            fileName,
                            yamlStr,
                            images: response.data.images || [],
                            title: response.data.title,
                            description: response.data.description
                        }
                    }, (downloadResponse) => {
                        if (downloadResponse && downloadResponse.success) {
                            statusMsg.textContent = `Success! Saved to folder: ${threadNumber}`;
                            statusMsg.style.color = "#4ade80";
                        } else {
                            statusMsg.textContent = "Download failed: " + (downloadResponse?.error || "Unknown error");
                            statusMsg.style.color = "#ef4444";
                        }
                    });
                } catch (err) {
                    console.error('Message failed:', err);
                    statusMsg.textContent = "Request failed. Check console.";
                    statusMsg.style.color = "#ef4444";
                }
            } else if (response && response.error) {
                statusMsg.textContent = response.error;
                statusMsg.style.color = "#ef4444";
            }
        });
    });

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'elementSelected') {
            extractBtn.disabled = false;
            statusMsg.textContent = "Element selected! Click Extract.";
        } else if (message.action === 'selectionCanceled') {
            isSelecting = false;
            updateUI();
        }
    });

    function toYaml(obj, indent = 0, isArrayItem = false) {
        const spaces = '  '.repeat(indent);
        if (Array.isArray(obj)) {
            if (obj.length === 0) return '[]';
            const arraySpaces = '  '.repeat(Math.max(0, indent - 1));
            return obj.map(item => {
                const itemYaml = toYaml(item, indent, true);
                return `\n${arraySpaces}- ${itemYaml}`;
            }).join('');
        } else if (typeof obj === 'object' && obj !== null) {
            const entries = Object.entries(obj);
            if (entries.length === 0) return '{}';
            return entries.map(([key, value], index) => {
                const isComplexValue = (typeof value === 'object' && value !== null && Object.keys(value).length > 0) ||
                    (Array.isArray(value) && value.length > 0) ||
                    (typeof value === 'string' && value.includes('\n'));
                const formattedValue = toYaml(value, indent + 1);
                const line = `${key}:${isComplexValue ? '' : ' '}${formattedValue}`;
                if (index === 0 && isArrayItem) {
                    return line;
                }
                return `\n${spaces}${line}`;
            }).join('');
        } else if (typeof obj === 'string') {
            if (obj.includes('\n')) {
                return '|' + obj.split('\n').map(line => `\n${'  '.repeat(indent + 1)}${line}`).join('');
            }
            if (obj.length === 0) return '""';
            return `"${obj.replace(/"/g, '\\"')}"`;
        }
        return String(obj);
    }

    function updateUI() {
        if (isSelecting) {
            startBtn.textContent = "Cancel Selection";
            startBtn.classList.add('active');
            statusMsg.textContent = "Hover and click an element on the page.";
        } else {
            startBtn.textContent = "Start Selection";
            startBtn.classList.remove('active');
            statusMsg.textContent = "Click Start to begin selection.";
            extractBtn.disabled = true;
        }
    }
});
