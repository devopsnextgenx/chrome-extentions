(function () {
    let hoverElement = null;
    let selectedElement = null;
    let isSelecting = false;
    let uiContainer = null;

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggleSelection') {
            isSelecting = !isSelecting;
            if (isSelecting) {
                createUI();
            } else {
                removeUI();
                clearHighlighter();
            }
            sendResponse({ isSelecting });
        } else if (request.action === 'extract') {
            if (!selectedElement) {
                sendResponse({ error: 'No element selected' });
                return;
            }
            const data = extractData(selectedElement);
            sendResponse({ data });
        } else if (request.action === 'getStatus') {
            sendResponse({ isSelecting, hasSelection: !!selectedElement });
        }
    });

    function createUI() {
        if (uiContainer) return;

        uiContainer = document.createElement('div');
        uiContainer.id = 'story-extractor-ui';
        uiContainer.innerHTML = `
            <div class="story-ui-header"><span>📖</span> Story Extractor</div>
            <div class="story-ui-status" id="story-ui-status">Hover and click an element</div>
            <div class="story-ui-controls">
                <button class="story-ui-btn story-ui-btn-secondary" id="story-ui-cancel">Cancel</button>
                <button class="story-ui-btn story-ui-btn-primary" id="story-ui-extract" disabled>Extract</button>
            </div>
        `;

        document.body.appendChild(uiContainer);

        uiContainer.querySelector('#story-ui-cancel').addEventListener('click', () => {
            isSelecting = false;
            removeUI();
            clearHighlighter();
            chrome.runtime.sendMessage({ action: 'selectionCanceled' });
        });

        uiContainer.querySelector('#story-ui-extract').addEventListener('click', () => {
            if (selectedElement) {
                const data = extractData(selectedElement);
                showResult(data);
                isSelecting = false;
                removeUI();
                clearHighlighter();
                chrome.runtime.sendMessage({ action: 'selectionCanceled' });
            }
        });
    }

    function removeUI() {
        if (uiContainer) {
            uiContainer.remove();
            uiContainer = null;
        }
    }

    function updateUIStatus(msg, canExtract = false) {
        if (!uiContainer) return;
        const status = uiContainer.querySelector('#story-ui-status');
        const extractBtn = uiContainer.querySelector('#story-ui-extract');
        if (status) status.textContent = msg;
        if (extractBtn) extractBtn.disabled = !canExtract;
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

    function showResult(data) {
        const yamlStr = toYaml(data);
        const modal = document.createElement('div');
        modal.id = 'story-extractor-result';
        modal.innerHTML = `
            <div class="story-result-header">
                <div class="story-ui-header"><span>✅</span> Extracted Content (YAML)</div>
                <button class="story-close-result">×</button>
            </div>
            <div class="story-result-content">${yamlStr}</div>
            <div class="story-ui-controls">
                <button class="story-ui-btn story-ui-btn-primary" id="story-copy-res">Copy YAML</button>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.story-close-result').addEventListener('click', () => modal.remove());
        modal.querySelector('#story-copy-res').addEventListener('click', () => {
            navigator.clipboard.writeText(yamlStr);
            modal.querySelector('#story-copy-res').textContent = 'Copied!';
            setTimeout(() => modal.querySelector('#story-copy-res').textContent = 'Copy YAML', 2000);
        });
    }

    function onMouseOver(e) {
        if (!isSelecting || selectedElement || (uiContainer && uiContainer.contains(e.target))) return;

        if (hoverElement) {
            hoverElement.classList.remove('story-extractor-highlight');
        }

        hoverElement = e.target;
        hoverElement.classList.add('story-extractor-highlight');
    }

    function onClick(e) {
        if (!isSelecting || (uiContainer && uiContainer.contains(e.target))) return;

        e.preventDefault();
        e.stopPropagation();

        if (selectedElement) {
            selectedElement.classList.remove('story-extractor-selected');
        }

        selectedElement = e.target;
        selectedElement.classList.add('story-extractor-selected');
        selectedElement.classList.remove('story-extractor-highlight');

        updateUIStatus("Element selected! Click Extract.", true);

        // Notify popup if it's open
        chrome.runtime.sendMessage({ action: 'elementSelected' });
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
        updateUIStatus("Hover and click an element", false);
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
                posts.push({
                    post_id: postId++,
                    is_comment: false,
                    statistics: {
                        word_count: wordCount,
                        char_count: charCount
                    },
                    content: currentContent.trim(),
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

        return {
            metadata: {
                extracted_at: extractedAt,
                page_number: 1,
                source_url: window.location.href,
                total_posts: posts.length
            },
            posts: posts,
            images: posts.flatMap(p => p.images || [])
        };
    }

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);
})();
