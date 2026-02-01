(function () {
    let hoverElement = null;
    let selectedElement = null;
    let isSelecting = false;
    let panelContainer = null;
    let isPanelVisible = false;
    let currentYaml = '';
    const ENABLED_SITES = ['literotica.com'];
    const isCurrentSiteEnabled = ENABLED_SITES.some(site => window.location.hostname.includes(site));

    // Insert Prism styles and scripts
    function injectPrism() {
        if (window.Prism) return; // Already injected

        // Inject CSS
        const prismCss = document.createElement('link');
        prismCss.rel = 'stylesheet';
        prismCss.href = chrome.runtime.getURL('libs/prism.css');
        document.head.appendChild(prismCss);

        // Inject JS
        const prismJs = document.createElement('script');
        prismJs.src = chrome.runtime.getURL('libs/prism.js');
        prismJs.onload = () => {
            if (window.Prism && window.Prism.highlightAll) {
                window.Prism.highlightAll();
            }
        };
        document.head.appendChild(prismJs);
    }

    function initializePanel(force = false) {
        if (panelContainer) return;
        if (!isCurrentSiteEnabled && !force) return;

        injectPrism();
        createPanel();
    }



    // Keyboard shortcut: Ctrl+Shift+L to toggle panel display
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyL') {
            e.preventDefault();
            togglePanelVisibility();
        }
    });

    function createPanel() {
        if (panelContainer) return;

        panelContainer = document.createElement('div');
        panelContainer.id = 'story-extractor-panel';
        panelContainer.innerHTML = `
            <div class="story-panel-header">
                <div class="story-panel-title">
                    <span>📖</span> Story Extractor
                </div>
                <button class="story-panel-toggle" title="Toggle panel (Ctrl+Shift+L)">▼</button>
            </div>
            <div class="story-panel-content">
                <div class="story-input-group">
                    <div class="story-input-item">
                        <label for="story-thread-number">Thread #</label>
                        <input type="text" id="story-thread-number" placeholder="e.g., 123" class="story-input">
                    </div>
                    <div class="story-input-item">
                        <label for="story-file-name">Page #</label>
                        <input type="text" id="story-file-name" placeholder="e.g., 1" class="story-input">
                    </div>
                </div>
                
                <label class="story-checkbox-label">
                    <input type="checkbox" id="story-direct-save" class="story-checkbox">
                    Auto Download
                </label>

                <div class="story-panel-actions">
                    <button class="story-select-btn" id="story-select-btn">✨ Select</button>
                    <button class="story-extract-btn" id="story-extract-btn" disabled>🔍 Extract</button>
                </div>

                <div class="story-instructions">YAML will appear here</div>
                <div class="story-yaml-container">
                    <pre><code id="story-yaml-display" class="language-yaml"></code></pre>
                </div>
                <div class="story-panel-buttons">
                    <button class="story-copy-btn" id="story-copy-yaml" disabled>📋 Copy & Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(panelContainer);

        // Load saved settings
        chrome.storage.local.get(['threadNumber', 'fileName', 'directSave'], (data) => {
            const threadInput = panelContainer.querySelector('#story-thread-number');
            const fileInput = panelContainer.querySelector('#story-file-name');
            const directCheckbox = panelContainer.querySelector('#story-direct-save');

            if (threadInput && data.threadNumber) threadInput.value = data.threadNumber;
            if (fileInput && data.fileName) fileInput.value = data.fileName;
            if (directCheckbox && data.directSave !== undefined) directCheckbox.checked = data.directSave;
        });

        // Toggle panel visibility
        const toggleBtn = panelContainer.querySelector('.story-panel-toggle');
        toggleBtn.addEventListener('click', togglePanelVisibility);

        // Save settings on input change
        const threadInput = panelContainer.querySelector('#story-thread-number');
        const fileInput = panelContainer.querySelector('#story-file-name');
        const directCheckbox = panelContainer.querySelector('#story-direct-save');
        const extractBtn = panelContainer.querySelector('#story-extract-btn');
        const selectBtn = panelContainer.querySelector('#story-select-btn');

        const updateExtractBtnState = () => {
            if (extractBtn) {
                const hasInputs = threadInput.value.trim() && fileInput.value.trim();
                const hasSelection = selectedElement !== null;
                extractBtn.disabled = !(hasInputs && hasSelection);

                if (!hasInputs) {
                    extractBtn.title = "Please fill Thread # and Page #";
                } else if (!hasSelection) {
                    extractBtn.title = "Please select an element from the page first";
                } else {
                    extractBtn.title = "Click to extract content from selected element";
                }
            }
        };

        // Select button - toggle selection mode
        selectBtn.addEventListener('click', () => {
            isSelecting = !isSelecting;

            if (isSelecting) {
                selectBtn.textContent = '🛑 Cancel Select';
                selectBtn.classList.add('active');
                updatePanelStatus('Hover and click an element');
            } else {
                clearHighlighter();
                selectBtn.textContent = '✨ Select';
                selectBtn.classList.remove('active');
                updatePanelStatus('YAML will appear here');
            }
        });

        [threadInput, fileInput, directCheckbox].forEach(el => {
            if (el) {
                el.addEventListener('change', () => {
                    chrome.storage.local.set({
                        threadNumber: threadInput.value,
                        fileName: fileInput.value,
                        directSave: directCheckbox.checked
                    });
                    updateExtractBtnState();
                });
                el.addEventListener('input', () => {
                    chrome.storage.local.set({
                        threadNumber: threadInput.value,
                        fileName: fileInput.value,
                        directSave: directCheckbox.checked
                    });
                    updateExtractBtnState();
                });
            }
        });

        // Initial state check
        updateExtractBtnState();
        extractBtn.addEventListener('click', async () => {
            const threadNum = threadInput.value.trim();
            const pageNum = fileInput.value.trim();

            if (!threadNum || !pageNum) {
                updatePanelStatus('⚠️ Fill Thread # and Page #');
                setTimeout(() => updatePanelStatus('Element selected! Click Extract.'), 2000);
                return;
            }

            if (!selectedElement) {
                updatePanelStatus('⚠️ Select an element first');
                setTimeout(() => updatePanelStatus('Hover and click an element'), 2000);
                return;
            }

            // Disable selection mode on extract
            isSelecting = false;
            selectBtn.textContent = '✨ Select';
            selectBtn.classList.remove('active');

            try {
                updatePanelStatus("🔍 Extracting...");
                const data = extractData(selectedElement);
                const yamlStr = toYaml(data);

                // Update panel with both stories.yml and page YAML
                updatePanelYaml(yamlStr, data, threadNum);

                // Enable copy button
                const copyBtn = panelContainer.querySelector('#story-copy-yaml');
                if (copyBtn) {
                    copyBtn.disabled = false;
                }

                if (directCheckbox.checked) {
                    updatePanelStatus("💾 Saving and downloading...");
                    chrome.runtime.sendMessage({
                        action: 'downloadAll',
                        data: {
                            threadNumber: threadNum,
                            fileName: pageNum,
                            yamlStr: yamlStr,
                            images: data.images || [],
                            title: data.title,
                            description: data.description
                        }
                    }, (downloadResponse) => {
                        if (downloadResponse && downloadResponse.success) {
                            updatePanelStatus("✓ Success! Saved to downloads.");
                            setTimeout(() => updatePanelStatus("YAML generated"), 2000);
                        } else {
                            updatePanelStatus("✗ Error: " + (downloadResponse?.error || "Download failed."));
                        }
                    });
                } else {
                    updatePanelStatus("✓ Extraction complete!");
                    setTimeout(() => updatePanelStatus("YAML generated"), 2000);
                }

                extractBtn.textContent = '✓ Ready!';
                setTimeout(() => {
                    extractBtn.textContent = '🔍 Extract';
                }, 1500);

                // Clear highlights but KEEP the selected element reference for future extractions if needed?
                // Actually the user wants to DISABLE selection mode, which usually means clearing highlights too.
                clearHighlighter();

            } catch (err) {
                console.error('Extraction failed:', err);
                updatePanelStatus("✗ Error: Extraction failed.");
            }
        });

        // Copy & Save button - downloads page yml AND copies to clipboard
        const copyBtn = panelContainer.querySelector('#story-copy-yaml');
        copyBtn.addEventListener('click', async () => {
            if (!currentYaml) return;

            // const threadNumber = threadInput.value.trim() || 'unknown';
            // const fileName = fileInput.value.trim() || 'page_1';

            try {
                // // Background download message
                // const yamlDataUrl = 'data:text/yaml;base64,' + btoa(unescape(encodeURIComponent(currentYaml)));
                // const pageYamlName = `page_${fileName}.yml`;

                // const downloadPromise = new Promise((resolve, reject) => {
                //     chrome.runtime.sendMessage({
                //         action: 'downloadFile',
                //         data: {
                //             url: yamlDataUrl,
                //             filename: pageYamlName
                //         }
                //     }, (response) => {
                //         if (response && response.success) {
                //             resolve(response);
                //         } else {
                //             reject(new Error(response?.error || 'Download failed'));
                //         }
                //     });
                // });

                // Copy to clipboard
                let clipboardPromise;
                try {
                    clipboardPromise = navigator.clipboard.writeText(currentYaml);
                } catch (err) {
                    // Fallback for non-secure contexts or other failures
                    const textArea = document.createElement("textarea");
                    textArea.value = currentYaml;
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        clipboardPromise = Promise.resolve();
                    } catch (e) {
                        clipboardPromise = Promise.reject(e);
                    }
                    document.body.removeChild(textArea);
                }

                // Wait for both to complete
                // await Promise.all([downloadPromise, clipboardPromise]);
                await Promise.all([clipboardPromise]);

                copyBtn.textContent = '✓ Saved & Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy & Save';
                    copyBtn.classList.remove('copied');
                }, 2000);
            } catch (err) {
                console.error('Error:', err);
                copyBtn.textContent = '✗ Failed';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy & Save';
                }, 2000);
            }
        });
    }

    function togglePanelVisibility() {
        if (!panelContainer) {
            initializePanel(true);
        }
        if (!panelContainer) return; // Should not happen with force=true

        isPanelVisible = !isPanelVisible;
        panelContainer.classList.toggle('closed', !isPanelVisible);
        const toggleBtn = panelContainer.querySelector('.story-panel-toggle');
        toggleBtn.classList.toggle('collapsed', !isPanelVisible);
    }

    function generateStoriesYaml(title, description, threadNumber) {
        const escapedTitle = (title || 'unknown').replace(/"/g, '\\"');
        const escapedDescription = (description || '').replace(/"/g, '\\"');
        return `
  - path: stories/thread-${threadNumber}/ymls
    title: "Original ${escapedTitle}"
    description: "${escapedDescription}"
    searchPrioritize: true
`;
    }

    function updatePanelYaml(yamlStr, data, threadNumber) {
        if (!panelContainer) {
            createPanel();
        }

        // Generate root stories.yml
        const storiesYaml = generateStoriesYaml(data.title, data.description, threadNumber || 'unknown');

        // Combine both YAMLs for display
        // const combinedYaml = `# ROOT stories.yml\n${storiesYaml}\n---\n# PAGE YAML (page_*.yml)\n${yamlStr}`;
        const combinedYaml = `${storiesYaml}\n`;
        currentYaml = combinedYaml;

        // Update the YAML display
        const codeDisplay = panelContainer.querySelector('#story-yaml-display');
        if (codeDisplay) {
            codeDisplay.textContent = combinedYaml;
            // Use Prism to highlight if available
            if (window.Prism && window.Prism.highlightElement) {
                window.Prism.highlightElement(codeDisplay);
            }
        }

        // Show panel
        if (!isPanelVisible) {
            togglePanelVisibility();
        }
    }

    function updatePanelStatus(msg) {
        if (!panelContainer) return;
        const status = panelContainer.querySelector('.story-instructions');
        if (status) status.textContent = msg;
    }

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
                return ' |' + obj.split('\n').map(line => `\n${'  '.repeat(indent + 1)}${line}`).join('');
            }
            if (obj.length === 0) return '""';
            return `"${obj.replace(/"/g, '\\"')}"`;
        }
        return String(obj);
    }



    function onMouseOver(e) {
        if (!isSelecting || selectedElement || (panelContainer && panelContainer.contains(e.target))) return;

        if (hoverElement) {
            hoverElement.classList.remove('story-extractor-highlight');
        }

        hoverElement = e.target;
        hoverElement.classList.add('story-extractor-highlight');
    }

    function onClick(e) {
        if (!isSelecting || (panelContainer && panelContainer.contains(e.target))) return;

        e.preventDefault();
        e.stopPropagation();

        if (selectedElement) {
            selectedElement.classList.remove('story-extractor-selected');
        }

        selectedElement = e.target;
        selectedElement.classList.add('story-extractor-selected');
        selectedElement.classList.remove('story-extractor-highlight');

        updatePanelStatus("Element selected! Click Extract.");

        // Enable/Update extract button in panel
        if (panelContainer) {
            const panelExtractBtn = panelContainer.querySelector('#story-extract-btn');
            if (panelExtractBtn) {
                const threadInput = panelContainer.querySelector('#story-thread-number');
                const fileInput = panelContainer.querySelector('#story-file-name');
                const hasInputs = threadInput?.value.trim() && fileInput?.value.trim();
                panelExtractBtn.disabled = !hasInputs;
                panelExtractBtn.title = hasInputs ? "Click to extract" : "Fill inputs first";
            }
        }
    }

    function clearHighlighter() {
        if (hoverElement) {
            hoverElement.classList.remove('story-extractor-highlight');
            hoverElement = null;
        }
        if (selectedElement) {
            selectedElement.classList.remove('story-extractor-selected');
            selectedElement = null;
        }
        updatePanelStatus("Hover and click an element");
    }

    function extractData(el) {
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            hr: '---',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced'
        });

        turndownService.addRule('removeScriptStyle', {
            filter: ['script', 'style', 'noscript'],
            replacement: () => ''
        });

        const markdown = turndownService.turndown(el.innerHTML);

        const now = new Date();
        const extractedAt = now.toISOString().replace('T', ' ').split('.')[0] + ' UTC';

        const posts = [];
        const imageRegex = /!\[.*?\]\((.*?)\)/g;
        let lastIndex = 0;
        let match;
        let postId = 1;

        let currentContent = '';
        let currentImages = [];

        function flushPost() {
            if (currentContent.trim() || currentImages.length > 0) {
                const wordCount = currentContent.trim() ? currentContent.trim().split(/\s+/).length : 0;
                const charCount = currentContent.length;
                let content = currentContent.replace(/\[\]\(.+\)/g, '').trim();
                content = content.replace(/\]\(.+\)/g, '').trim();
                content = content.replace(/\[\*\*/g, '\*\*').trim();
                content = content.replace(/(\n(\s+))/g, '\n').trim();
                posts.push({
                    post_id: postId++,
                    is_comment: false,
                    statistics: {
                        word_count: wordCount,
                        char_count: charCount
                    },
                    content: content.trim(),
                    images: [...currentImages]
                });
                currentContent = '';
                currentImages = [];
            }
        }

        while ((match = imageRegex.exec(markdown)) !== null) {
            const textBefore = markdown.substring(lastIndex, match.index);
            const imageUrl = match[1];

            if (textBefore.trim()) {
                currentContent += textBefore;
            }

            // If we have text content and encounter an image, this image ends the post
            if (currentContent.trim()) {
                currentImages.push(imageUrl);
                flushPost();
            } else {
                // Leading image(s) or image following an empty segment
                currentImages.push(imageUrl);
            }

            lastIndex = imageRegex.lastIndex;
        }

        const textAfter = markdown.substring(lastIndex);
        if (textAfter.trim()) {
            currentContent += textAfter;
        }

        flushPost();

        // If no posts were created (empty content), create at least one empty post
        if (posts.length === 0) {
            posts.push({
                post_id: 1,
                is_comment: false,
                statistics: { word_count: 0, char_count: 0 },
                content: "",
                images: []
            });
        }

        const pageTitle = document.querySelector('h1')?.textContent?.trim() || document.title;
        const firstPostWithContent = posts.find(p => p.content.trim().length > 0);
        const description = (firstPostWithContent?.content || "")
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .slice(0, 3)
            .join(' ');

        return {
            metadata: {
                title: pageTitle,
                extracted_at: extractedAt,
                page_number: 1,
                source_url: window.location.href,
                total_posts: posts.length
            },
            title: pageTitle,
            description: description,
            posts: posts,
            images: posts.flatMap(p => p.images || [])
        };
    }

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);

    // Listen for toggle message from background
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "togglePanel") {
            togglePanelVisibility();
        }
    });

    // Initialize panel on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePanel);
    } else {
        initializePanel();
    }
})();
