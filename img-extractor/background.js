// pendingDownloads map and onDeterminingFilename listener removed to avoid conflicts with other extensions.
// Filenames are now passed directly to chrome.downloads.download().

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'process-downloads') {
        startDownloading(message.urls, message.options, message.tabUrl, sender.tab.id);
    }
});

async function startDownloading(urls, options, tabUrl, tabId) {
    const total = urls.length;
    let downloadedCount = 0;

    const updateUI = () => {
        chrome.tabs.sendMessage(tabId, {
            action: 'update-progress',
            progress: {
                total: total,
                downloaded: downloadedCount,
                pending: total - downloadedCount
            }
        });
    };

    updateUI();

    for (const url of urls) {
        try {
            const finalUrl = resolveFullSizeUrl(url);
            const folderPath = generateFolderPath(finalUrl, tabUrl, options);
            const fileName = getFileName(finalUrl);

            // Aggressively sanitize folder path and filename
            const sanitize = (s) => s.replace(/[<>:"|?*]/g, '_').trim();
            const sanitizedFileName = sanitize(fileName);

            // Reconstruct path segment by segment to ensure safety
            const pathSegments = folderPath.split('/')
                .map(s => sanitize(s))
                .filter(s => s && s !== '..' && s !== '.');

            pathSegments.push(sanitizedFileName);
            const finalPath = pathSegments.join('/');

            console.log('Downloading to path:', finalPath);

            try {
                await downloadFile(finalUrl, finalPath);
            } catch (err) {
                // console.warn(`Initial download failed for ${finalUrl}, trying fallback if applicable.`, err);
                if (finalUrl.includes('imgcdn')) {
                    const fallbackUrl = finalUrl.replace('imgcdn', 'img');
                    console.log(`Retrying with fallback URL: ${fallbackUrl}`);
                    await downloadFile(fallbackUrl, finalPath);
                } else {
                    console.error(`Download failed for ${finalUrl}`, err);
                    throw err; // Re-throw if no fallback
                }
            }

            downloadedCount++;
            updateUI();

            // Longer delay to avoid anti-spam and security prompts
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
            console.error('Download failed for', url, err);
        }
    }
}

/**
 * Robust download wrapper that waits for completion or failure.
 */
function downloadFile(url, filename) {
    return new Promise((resolve, reject) => {
        chrome.downloads.download({
            url: url,
            filename: filename,
            conflictAction: 'uniquify',
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
            }

            const checkStatus = (delta) => {
                if (delta.id !== downloadId) return;

                if (delta.state) {
                    if (delta.state.current === 'complete') {
                        chrome.downloads.onChanged.removeListener(checkStatus);
                        resolve(downloadId);
                    } else if (delta.state.current === 'interrupted') {
                        chrome.downloads.onChanged.removeListener(checkStatus);
                        // Get the error message for better logging
                        chrome.downloads.search({ id: downloadId }, (items) => {
                            const error = items && items[0] && items[0].error ? items[0].error : 'Unknown error';
                            reject(new Error(`Download interrupted: ${error}`));
                        });
                    }
                }
            };

            chrome.downloads.onChanged.addListener(checkStatus);
        });
    });
}

function resolveFullSizeUrl(url) {
    // - https://starzone.ragalahari.com/.../sada1152t.jpg -> remove t before jpg
    // - https://www.idlebrain.com/.../th_sada90.jpg -> remove th_

    const parsedUrl = new URL(url);
    let path = parsedUrl.pathname;

    // Regex for <filename with number><t>.ext
    // Regex for <th_>filename with number.ext

    // 1. Remove "t" suffix if it follows a number before the extension
    // Example: sada1152t.jpg -> sada1152.jpg
    path = path.replace(/(\d+)t(\.[a-z]+)$/i, '$1$2');

    // 2. Remove "th_" prefix from filename
    // Example: th_sada90.jpg -> sada90.jpg
    const segments = path.split('/');
    let fileName = segments[segments.length - 1];
    fileName = fileName.replace(/^th_/i, '');
    segments[segments.length - 1] = fileName;
    path = segments.join('/');

    // for https://telugupeople.com/uploads/SpiceGallery/Thumbnails/201501/vithi%20(19).JPG convert to https://telugupeople.com/uploads/SpiceGallery/201501/vithi%20(19).JPG
    if (parsedUrl.hostname.includes('telugupeople.com') && path.includes('Thumbnails')) {
        path = path.replace('Thumbnails', '');
    }
    if (parsedUrl.hostname.includes('cinejosh.com') && path.includes('thumb')) {
        path = path.replace('thumb', 'normal');
    }
    console.log('Resolved URL:', parsedUrl.origin + path + parsedUrl.search);

    return parsedUrl.origin + path + parsedUrl.search;
}

function generateFolderPath(imgUrl, tabUrl, options) {
    const imgParsed = new URL(imgUrl);
    const segments = imgParsed.pathname.split('/').filter(s => s);

    let dynamicFolder = 'images';

    // Specific domain logic
    if (imgParsed.hostname.includes('ragalahari.com')) {
        // https://starzone.ragalahari.com/april2009/starzone/sada11/sada1152t.jpg should use sada11 as folder name
        // It's the segment before the filename.
        if (segments.length >= 2) {
            dynamicFolder = segments[segments.length - 2];
        }
    } else if (imgParsed.hostname.includes('idlebrain.com')) {
        // https://www.idlebrain.com/movie/photogallery/sada19/images/th_sada90.jpg should use sada19
        // It is previous segment path before images
        const imagesIndex = segments.indexOf('images');
        if (imagesIndex > 0) {
            dynamicFolder = segments[imagesIndex - 1];
        } else if (segments.length >= 2) {
            dynamicFolder = segments[segments.length - 2];
        }
    } else {
        // Generic logic: segment before filename
        if (segments.length >= 2) {
            dynamicFolder = segments[segments.length - 2];
        }
    }

    let fullPath = [];
    if (options.defaultLocation) {
        fullPath.push(options.defaultLocation.replace(/^\/+|\/+$/g, ''));
    }
    if (options.actressName) {
        fullPath.push(options.actressName.replace(/^\/+|\/+$/g, ''));
    }
    fullPath.push(dynamicFolder.replace(/^\/+|\/+$/g, ''));

    return fullPath.join('/');
}

function getFileName(url) {
    const parsed = new URL(url);
    return parsed.pathname.split('/').pop();
}
