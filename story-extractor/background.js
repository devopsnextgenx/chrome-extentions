// Map to track download IDs and their desired destination paths is no longer needed since we pass filename to download()

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadAll') {
        handleDownloadAll(request.data)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

async function handleDownloadAll({ threadNumber, fileName, yamlStr, images }) {
    const sanitize = (s) => String(s).trim().replace(/[<>:"|?*]/g, '_');

    const safeThread = sanitize(threadNumber) || 'unknown';
    const safeFile = sanitize(fileName) || '1';

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
