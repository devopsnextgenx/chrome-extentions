// pendingDownloads map and onDeterminingFilename listener removed to avoid conflicts with other extensions.
// Filenames are now passed directly to chrome.downloads.download().

const activeBatches = new Set();
const manualResumes = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'process-downloads') {
        const batchId = Date.now().toString();
        activeBatches.add(batchId);
        startDownloading(message.urls, message.options, message.tabUrl, sender.tab.id, batchId);
    } else if (message.action === 'cancel-download') {
        activeBatches.delete(message.batchId);
        const resume = manualResumes.get(message.batchId);
        if (resume) resume(); // Release pause if waiting
        console.log(`Cancellation requested for batch: ${message.batchId}`);
    } else if (message.action === 'resume-download') {
        const resume = manualResumes.get(message.batchId);
        if (resume) {
            resume();
            manualResumes.delete(message.batchId);
            console.log(`Manual resume for batch: ${message.batchId}`);
        }
    } else if (message.action === 'check-folder-exists') {
        checkFolderExists(message.path).then(result => {
            sendResponse(result);
        });
        return true; // Keep channel open for async response
    } else if (message.action === 'open-folder') {
        openFolder(message.path);
        return false;
    } else if (message.action === 'open-web-folder') {
        chrome.tabs.create({ url: `http://localhost:3001/?tab=indexing&album=true&path=${encodeURIComponent(message.path)}` });
        return false;
    }
});

async function openFolder(folderPath) {
    if (!folderPath) return;

    const segments = folderPath.split('/').map(s => s.trim()).filter(s => s);
    if (segments.length === 0) return;

    const lastSegment = segments[segments.length - 1];
    const normalizedQueryPath = segments.join('/').toLowerCase();

    chrome.downloads.search({ query: [lastSegment] }, (items) => {
        if (chrome.runtime.lastError || !items || items.length === 0) return;

        // Find the most recent item that matches the full path
        const matchingItem = items
            .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
            .find(item => {
                const normalizedFilename = item.filename.replace(/\\/g, '/').toLowerCase();
                return normalizedFilename.includes(normalizedQueryPath);
            });

        if (matchingItem) {
            chrome.downloads.show(matchingItem.id);
        }
    });
}

async function checkFolderExists(folderPath) {
    if (!folderPath) return { exists: false, existingImages: [] };

    const segments = folderPath.split('/').map(s => s.trim()).filter(s => s);
    if (segments.length === 0) return { exists: false, existingImages: [] };

    const lastSegment = segments[segments.length - 1];

    try {
        const findUrl = `http://localhost:3000/api/folders/find?name=${encodeURIComponent(lastSegment)}`;
        const findResponse = await fetch(findUrl);
        const findData = await findResponse.json();

        if (findData.status === 'success' && findData.path) {
            const imagesUrl = `http://localhost:3000/api/browse/images?path=${encodeURIComponent(findData.path)}&recursive=false`;
            const imagesResponse = await fetch(imagesUrl);
            const imagesData = await imagesResponse.json(); // returns array of strings
            // imagesData =[{
            //     "path": "/media/storage/actresses/SurabhiPrabhu/indian-ad-model-surabhi-prabhu/indian-ad-model-surabhi-prabhu8.jpg",
            //     "width": 600,
            //     "height": 871,
            //     "timestamp": 1767018587
            // },
            // {
            //     "path": "/media/storage/actresses/SurabhiPrabhu/indian-ad-model-surabhi-prabhu/indian-ad-model-surabhi-prabhu9.jpg",
            //     "width": 642,
            //     "height": 854,
            //     "timestamp": 1767018588
            // }];
            const existingImages = imagesData.map(image => image.path);
            return {
                exists: true,
                path: findData.path,
                existingImages: existingImages
            };
        }
    } catch (error) {
        console.error('Error checking folder existence via API:', error);
    }

    // Fallback to chrome.downloads.search if API fails or folder not found in API
    const normalizedQueryPath = segments.join('/').toLowerCase();
    return new Promise((resolve) => {
        chrome.downloads.search({ query: [lastSegment] }, (items) => {
            if (chrome.runtime.lastError || !items) {
                resolve({ exists: false, existingImages: [] });
                return;
            }
            const exists = items.some(item => {
                const normalizedFilename = item.filename.replace(/\\/g, '/').toLowerCase();
                return normalizedFilename.includes(normalizedQueryPath);
            });
            resolve({ exists, existingImages: [] });
        });
    });
}

async function startDownloading(urls, options, tabUrl, tabId, batchId) {
    const total = urls.length;
    let downloadedCount = 0;
    let firstFailedUrl = null;

    const updateUI = () => {
        chrome.tabs.sendMessage(tabId, {
            action: 'update-progress',
            batchId: batchId,
            progress: {
                total: total,
                downloaded: downloadedCount,
                pending: total - downloadedCount,
                firstFailedUrl: firstFailedUrl
            }
        });
    };

    updateUI();

    let existingImages = [];
    if (urls.length > 0) {
        const firstUrl = resolveFullSizeUrl(urls[0]);
        const folderPath = generateFolderPath(firstUrl, tabUrl, options);
        const checkResult = await checkFolderExists(folderPath);
        if (checkResult.exists) {
            existingImages = checkResult.existingImages.map(img => img.split('/').pop().toLowerCase());
        }
    }
    let itr = 0;
    for (let url of urls) {
        try {
            if (!activeBatches.has(batchId)) {
                console.log(`Batch ${batchId} was cancelled.`);
                break;
            }
            // https://hotnessrater.com/infinite-scroll/478/gemma-atkinson
            if (url.includes('hotnessrater')) {
                itr++;
                url = url.replace('.jpg', `_${itr}.jpg`);
            }
            const finalUrl = resolveFullSizeUrl(url);
            const folderPath = generateFolderPath(finalUrl, tabUrl, options);
            const fileName = getFileName(finalUrl);

            // Skip if already exists
            if (existingImages.includes(fileName.toLowerCase())) {
                console.log(`Skipping ${fileName} as it already exists in folder.`);
                downloadedCount++;
                updateUI();
                continue;
            }

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
                } else if (finalUrl.includes('media')) {
                    const fallbackUrl = finalUrl.replace('media', 'img');
                    console.log(`Retrying with fallback URL: ${fallbackUrl}`);
                    await downloadFile(fallbackUrl, finalPath);
                } else {
                    if (finalUrl.includes('ragalahari') && finalUrl.includes('img')) {
                        const fallbackUrl = finalUrl.replace('img', 'starzone');
                        console.log(`Retrying with fallback URL: ${fallbackUrl}`);
                        await downloadFile(fallbackUrl, finalPath);
                    } else {
                        console.error(`Download failed for ${finalUrl}`, err);
                        throw err; // Re-throw if no fallback
                    }
                }
            }

            downloadedCount++;
            updateUI();

            // Special logic: Pause for 15 seconds after the VERY FIRST image download
            if (downloadedCount === 1 && total > 1) {
                console.log(`Batch ${batchId}: First image downloaded. Pausing for 15 seconds...`);
                chrome.tabs.sendMessage(tabId, {
                    action: 'waiting-to-resume',
                    batchId: batchId,
                    timeout: 15
                });

                await new Promise(resolve => {
                    const timeoutId = setTimeout(() => {
                        manualResumes.delete(batchId);
                        resolve();
                    }, 15000);
                    manualResumes.set(batchId, () => {
                        clearTimeout(timeoutId);
                        resolve();
                    });
                });

                // Re-check cancellation after pause
                if (!activeBatches.has(batchId)) break;

                console.log(`Batch ${batchId}: Resuming downloads...`);
                chrome.tabs.sendMessage(tabId, {
                    action: 'resumed-download',
                    batchId: batchId
                });
            } else {
                // Regular delay between other images
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (err) {
            console.error('Download failed for', url, err);
            if (!firstFailedUrl) {
                firstFailedUrl = url;
            }
            updateUI();
        }
    }
    activeBatches.delete(batchId);
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
    fileName = fileName.replace(/^th_(?:%20|\s*)/i, '')
    fileName = fileName.replace(/^th_/i, '');
    segments[segments.length - 1] = fileName;
    path = segments.join('/');

    // for https://telugupeople.com/uploads/SpiceGallery/Thumbnails/201501/vithi%20(19).JPG convert to https://telugupeople.com/uploads/SpiceGallery/201501/vithi%20(19).JPG
    if (parsedUrl.hostname.includes('telugupeople.com') && path.includes('Thumbnails')) {
        path = path.replace('Thumbnails', '');
    }
    if (parsedUrl.hostname.includes('behindwoods') && path.includes('thumbnails')) {
        path = path.replace('thumbnails', '');
    }
    if (parsedUrl.hostname.includes('santabanta') && path.includes('_th')) {
        path = path.replace('_th', '');
    }

    // for https://cinejosh.com/.../thumb/... convert to https://cinejosh.com/.../normal/...
    if (parsedUrl.hostname.includes('cinejosh') && path.includes('thumb')) {
        path = path.replace('thumb', 'normal');
    }

    // if domain kollywoodzone.com then convert https://www.kollywoodzone.com/boxoffice/wp-content/uploads/cache/2022/06/Sexy-Vithika-Sheru-Traditional-Photos-32/1154633772.jpg to https://www.kollywoodzone.com/boxoffice/wp-content/uploads/2022/06/Sexy-Vithika-Sheru-Traditional-Photos-32.jpg
    if (
        parsedUrl.hostname.includes('kollywoodzone.com') &&
        path.includes('/cache/')
    ) {
        const parts = path.split('/');

        // Find "cache" index
        const cacheIndex = parts.indexOf('cache');

        if (cacheIndex !== -1 && parts.length > cacheIndex + 3) {
            const year = parts[cacheIndex + 1];
            const month = parts[cacheIndex + 2];
            const imageName = parts[cacheIndex + 3]; // folder name = actual image name

            path = `/boxoffice/wp-content/uploads/${year}/${month}/${imageName}.jpg`;
        }
    }

    let origin = parsedUrl.origin;
    if (parsedUrl.origin.includes('ragalahari')) {
        if (parsedUrl.origin.includes('szcdn1')) {
            // https://szcdn1.ragalahari.com/mar2012/starzone/tamanna_endukante_premanta/tamanna_endukante_premanta1t.jpg
            origin = parsedUrl.origin.replace('szcdn1', 'starzone');
        }
        if (parsedUrl.origin.includes('szcdn')) {
            // https://szcdn1.ragalahari.com/mar2012/starzone/tamanna_endukante_premanta/tamanna_endukante_premanta1t.jpg
            origin = parsedUrl.origin.replace('szcdn', 'starzone');
        }
        if (parsedUrl.origin.includes('media1')) {
            // https://media1.ragalahari.com/june2009/starzone/vimalaraman8/vimalaraman81t.jpg -> https://img.ragalahari.com/june2009/starzone/vimalaraman8/vimalaraman81.jpg
            origin = parsedUrl.origin.replace('media1', 'img');
        }
        if (parsedUrl.origin.includes('timg')) {
            // https://timg.ragalahari.com/april2015/starzone/charmi-mastitickets/charmi-mastitickets13t.jpg -> https://img.ragalahari.com/april2015/starzone/charmi-mastitickets/charmi-mastitickets13t.jpg
            origin = parsedUrl.origin.replace('timg', 'img');
        }
        if (parsedUrl.origin.includes('www1')) {
            // https://www1.ragalahari.com/april2015/starzone/charmi-mastitickets/charmi-mastitickets13t.jpg -> https://img.ragalahari.com/april2015/starzone/charmi-mastitickets/charmi-mastitickets13t.jpg
            origin = parsedUrl.origin.replace('www1', 'starzone');
        }
    }
    if (parsedUrl.origin.includes('idlebrain')) {
        path = path.replace('thumb-', 'newpg-');
    }
    if (parsedUrl.origin.includes('teluguone.com')) {
        path = path.replace('_small', '');
    }
    if (parsedUrl.origin.includes('indiglamour.com')) {
        // https://i.indiglamour.com/photogallery/tamil/actress/2016/Mar16/Shravya/normal/Shravya_10186thmb.jpg
        // https://i.indiglamour.com/photogallery/tamil/actress/2016/Mar16/Shravya/normal/Shravya_10186.jpg
        path = path.replace('thmb', '');
    }
    if (parsedUrl.origin.includes('tamilnow.com')) {
        // https://www.tamilnow.com/movies/actresses/neha-hing/new-galleries-cinema-actress-neha-hing-9608.jpeg
        // https://www.tamilnow.com/movies/actresses/neha-hing/new-galleries-cinema-actress-neha-hing-9608.jpg
        path = path.replace('jpeg', 'jpg');
    }
    // Resolved URL: https://www.idlebrain.com | /images/sample_r18_c08.gif |
    console.log(`Resolved URL: ${parsedUrl.origin} | ${path} |${parsedUrl.search}`);
    return origin + path.replaceAll('//', '/') + parsedUrl.search;
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
        fullPath.push(options.defaultLocation.trim().replace(/^\/+|\/+$/g, ''));
    }
    if (options.actressName) {
        fullPath.push(options.actressName.trim().replace(/^\/+|\/+$/g, ''));
    }
    fullPath.push(dynamicFolder.trim().replace(/^\/+|\/+$/g, ''));

    return fullPath.join('/');
}

function getFileName(url) {
    const parsed = new URL(url);
    return parsed.pathname.split('/').pop();
}
