// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const globalToggle = document.getElementById('globalToggle');
    const toggleStatus = document.getElementById('toggleStatus');
    const domainDisplay = document.getElementById('domainDisplay');
    const domainPatternInput = document.getElementById('domainPattern');
    const addRuleBtn = document.getElementById('addRuleBtn');
    const rulesList = document.getElementById('rulesList');
    const fixImagesBtn = document.getElementById('fixImagesBtn');
    const revertImagesBtn = document.getElementById('revertImagesBtn');
    const statusMessage = document.getElementById('statusMessage');
    const replacementsContainer = document.getElementById('replacementsContainer');

    let currentTab = null;
    let savedRules = [];

    // 1. Load initial state
    chrome.storage.local.get(['enabled', 'rules'], (data) => {
        const isEnabled = data.enabled !== false;
        globalToggle.checked = isEnabled;
        toggleStatus.textContent = isEnabled ? 'Enabled' : 'Disabled';
        savedRules = data.rules || [];
        renderRules();
    });

    // 2. Detect current domain
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        currentTab = tabs[0];
        if (currentTab && currentTab.url) {
            try {
                const url = new URL(currentTab.url);
                domainDisplay.textContent = url.hostname;
                // Pre-fill pattern if empty
                if (!domainPatternInput.value) {
                    domainPatternInput.value = url.hostname;

                    // Special case: pre-fill ragalahari/raagalahari defaults if on that site
                    const isRagalahari = url.hostname.includes('ragalahari.com');
                    const isRaagalahari = url.hostname.includes('raagalahari.com');

                    if (isRagalahari || isRaagalahari) {
                        const domainSuffix = isRaagalahari ? 'raagalahari.com' : 'ragalahari.com';
                        const rows = replacementsContainer.querySelectorAll('.replacement-row');
                        if (rows.length >= 3) {
                            rows[0].querySelector('.search-pattern').value = `szcdn.${domainSuffix}`;
                            rows[0].querySelector('.replace-pattern').value = isRaagalahari ? `starzone.${domainSuffix}` : `starzone.${domainSuffix}`;
                            rows[1].querySelector('.search-pattern').value = `imgcdn.${domainSuffix}`;
                            rows[1].querySelector('.replace-pattern').value = `img.${domainSuffix}`;
                            rows[2].querySelector('.search-pattern').value = `media1.${domainSuffix}`;
                            rows[2].querySelector('.replace-pattern').value = `img.${domainSuffix}`;
                        }
                    }
                }
            } catch (e) {
                domainDisplay.textContent = 'Unknown';
            }
        }
    });

    // 3. Handle Toggle
    globalToggle.addEventListener('change', () => {
        const isEnabled = globalToggle.checked;
        toggleStatus.textContent = isEnabled ? 'Enabled' : 'Disabled';
        chrome.storage.local.set({ enabled: isEnabled });

        // Notify content script
        sendMessageToContentScript({ action: 'updateState', enabled: isEnabled });
    });

    // 4. Add Rule
    addRuleBtn.addEventListener('click', () => {
        const domainPattern = domainPatternInput.value.trim();
        if (!domainPattern) {
            showStatus('Please enter a domain pattern', 'error');
            return;
        }

        const replacements = [];
        const rows = replacementsContainer.querySelectorAll('.replacement-row');
        rows.forEach(row => {
            const search = row.querySelector('.search-pattern').value.trim();
            const replace = row.querySelector('.replace-pattern').value.trim();
            if (search) {
                replacements.push({ search, replace });
            }
        });

        if (replacements.length === 0) {
            showStatus('Please enter at least one replacement rule', 'error');
            return;
        }

        const newRule = {
            id: Date.now().toString(),
            domainPattern,
            replacements
        };

        savedRules.push(newRule);
        chrome.storage.local.set({ rules: savedRules }, () => {
            renderRules();
            clearInputs();
            showStatus('Rule added successfully!', 'success');
        });
    });

    // 5. Render Rules
    function renderRules() {
        rulesList.innerHTML = '';
        savedRules.forEach(rule => {
            const li = document.createElement('li');
            li.className = 'rule-item';
            li.innerHTML = `
        <span>${rule.domainPattern} (${rule.replacements.length} rules)</span>
        <button class="danger-btn" data-id="${rule.id}">Delete</button>
      `;
            li.querySelector('.danger-btn').addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                savedRules = savedRules.filter(r => r.id !== id);
                chrome.storage.local.set({ rules: savedRules }, renderRules);
            });
            rulesList.appendChild(li);
        });
    }

    // 6. Action Buttons
    fixImagesBtn.addEventListener('click', () => {
        sendMessageToContentScript({ action: 'fixImages', rules: savedRules }, (response) => {
            if (response && response.status === 'done') {
                showStatus(`Fixed ${response.count} images!`, 'success');
            } else {
                showStatus('Error: Make sure page is loaded.', 'error');
            }
        });
    });

    revertImagesBtn.addEventListener('click', () => {
        sendMessageToContentScript({ action: 'revertImages' }, (response) => {
            if (response && response.status === 'done') {
                showStatus(`Reverted ${response.count} images!`, 'success');
            }
        });
    });

    // Utilities
    function sendMessageToContentScript(message, callback) {
        if (!currentTab) return;
        chrome.tabs.sendMessage(currentTab.id, message, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('Error sending message:', chrome.runtime.lastError);
                if (callback) callback(null);
            } else if (callback) {
                callback(response);
            }
        });
    }

    function showStatus(msg, type) {
        statusMessage.textContent = msg;
        statusMessage.style.color = type === 'error' ? '#dc3545' : '#28a745';
        setTimeout(() => {
            statusMessage.textContent = '';
        }, 3000);
    }

    function clearInputs() {
        domainPatternInput.value = '';
        const rows = replacementsContainer.querySelectorAll('.replacement-row');
        rows.forEach(row => {
            row.querySelector('.search-pattern').value = '';
            row.querySelector('.replace-pattern').value = '';
        });
        // Reset domain to current if available
        if (currentTab && currentTab.url) {
            const url = new URL(currentTab.url);
            domainPatternInput.value = url.hostname;
        }
    }
});
