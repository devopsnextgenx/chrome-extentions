// Map to track download IDs and their desired destination paths is no longer needed since we pass filename to download()

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadAll') {
        handleDownloadAll(request.data)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (request.action === 'downloadFile') {
        const { url, filename } = request.data;
        chrome.downloads.download({
            url: url,
            filename: filename,
            conflictAction: 'overwrite',
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId });
            }
        });
        return true;
    }
});

// Toggle side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
});

async function handleDownloadAll({ threadNumber, fileName, yamlStr, images, title, description }) {
    const sanitize = (s) => String(s).trim().replace(/[<>:"|?*]/g, '_');

    const safeThread = sanitize(threadNumber) || 'unknown';
    const safeFile = sanitize(fileName) || '1';

    // 0. Download root stories.yml if it's the first page
    const isFirstPage = safeFile === '1' || safeFile === 'page_1';
    if (isFirstPage) {
        const escapedTitle = (title || 'unknown').replace(/"/g, '\\"');
        const escapedDescription = (description || '').replace(/"/g, '\\"');
        const storiesYaml = `content:
  stories:
    - path: stories/thread-${safeThread}/ymls
      title: "Original ${escapedTitle}"
      description: "${escapedDescription}"
      searchPrioritize: true
`;
        const storiesDataUrl = 'data:text/yaml;base64,' + btoa(unescape(encodeURIComponent(storiesYaml)));
        await chrome.downloads.download({
            url: storiesDataUrl,
            filename: 'stories.yml',
            conflictAction: 'overwrite',
            saveAs: false
        });
    }

    const rootFolder = `stories/thread-${safeThread}`;
    const yamlDir = `${rootFolder}/ymls`;
    const imgDir = `${rootFolder}/imgs`;
    const yamlName = `page_${safeFile}.yml`;

    // 1. Download YAML
    const yamlDataUrl = 'data:text/yaml;base64,' + btoa(unescape(encodeURIComponent(yamlStr)));
    const yamlPath = `${yamlDir}/${yamlName}`;

    const yamlId = await chrome.downloads.download({
        url: yamlDataUrl,
        filename: yamlPath,
        conflictAction: 'overwrite',
        saveAs: false
    });

    // 2. Download Images
    for (let i = 0; i < images.length; i++) {
        const imgUrl = images[i];
        let ext = 'jpg';
        try {
            const urlParts = imgUrl.split(/[?#]/)[0].split('.');
            if (urlParts.length > 1) {
                const detected = urlParts.pop().toLowerCase();
                if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(detected)) {
                    ext = detected === 'jpeg' ? 'jpg' : detected;
                }
            }
        } catch (e) { }

        const imgPath = `${imgDir}/${i + 1}.${ext}`;

        const imgId = await chrome.downloads.download({
            url: imgUrl,
            filename: imgPath,
            conflictAction: 'overwrite',
            saveAs: false
        });

        // First image as thumbnail.jpg
        if (i === 0) {
            const thumbId = await chrome.downloads.download({
                url: imgUrl,
                filename: `${imgDir}/thumbnail.jpg`,
                conflictAction: 'overwrite',
                saveAs: false
            });
        }

        // Small delay
        await new Promise(r => setTimeout(r, 200));
    }
}
