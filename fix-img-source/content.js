// content.js

const originalSources = new Map();
let currentRules = [];
let isEnabled = false;

// Initialize state from storage
chrome.storage.local.get(['enabled', 'rules'], (data) => {
    isEnabled = data.enabled !== false;
    currentRules = data.rules || [];
    if (isEnabled) {
        fixAllImages();
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'fixImages') {
        currentRules = message.rules || [];
        isEnabled = true;
        const count = fixAllImages();
        sendResponse({ status: 'done', count: count });
    } else if (message.action === 'revertImages') {
        isEnabled = false;
        const count = revertAllImages();
        sendResponse({ status: 'done', count: count });
    } else if (message.action === 'updateState') {
        isEnabled = message.enabled;
        let count = 0;
        if (isEnabled) {
            count = fixAllImages();
        } else {
            count = revertAllImages();
        }
        sendResponse({ status: 'done', count: count });
    }
});

function fixAllImages() {
    const images = document.querySelectorAll('img, source');
    let fixedCount = 0;
    images.forEach(el => {
        if (fixSingleElement(el)) {
            fixedCount++;
        }
    });
    console.log(`[FixImgSource] Total elements fixed: ${fixedCount}`);
    return fixedCount;
}

function fixSingleElement(el) {
    if (!isEnabled) return false;

    const currentDomain = window.location.hostname;

    // Store original if not already stored
    // We also check if the existing data-original contains the domain we are looking for.
    // In some cases, data-original-srcset might be a small placeholder like "/img/galthumb.jpg"
    // while the current srcset has the actual broken URL we want to fix.
    if (!el.hasAttribute('data-original-src')) {
        if (el.src) el.setAttribute('data-original-src', el.src);
    }
    if (!el.hasAttribute('data-original-srcset')) {
        if (el.hasAttribute('srcset')) {
            el.setAttribute('data-original-srcset', el.getAttribute('srcset'));
        }
    }

    let originalSrc = el.getAttribute('data-original-src');
    let originalSrcset = el.getAttribute('data-original-srcset');
    let originalDataSrcset = el.getAttribute('data-srcset');

    // Robustness check: if data-original-* looks like a placeholder (relative path or missing CDN domain) 
    // but the current attribute has a subdomain/domain, prefer the current attribute for fixing.
    const isPlaceholder = (val) => val && !val.includes('//') && !val.includes('http');

    if (isPlaceholder(originalSrc) && el.src && (el.src.includes('//') || el.src.includes('http'))) {
        originalSrc = el.src;
    }
    if (isPlaceholder(originalSrcset) && el.hasAttribute('srcset')) {
        originalSrcset = el.getAttribute('srcset');
    }

    let newSrc = originalSrc;
    let newSrcset = originalSrcset;
    let newDataSrcset = originalDataSrcset;
    let newDataSrc = el.getAttribute('data-src');
    let appliedChanges = false;

    currentRules.forEach(rule => {
        try {
            const regex = new RegExp(rule.domainPattern, 'i');
            if (regex.test(currentDomain)) {
                // Check container IDs if specified
                if (rule.containerIds && rule.containerIds.length > 0) {
                    let isWithinContainer = false;
                    for (const id of rule.containerIds) {
                        if (el.closest(`#${id}`)) {
                            isWithinContainer = true;
                            break;
                        }
                    }
                    if (!isWithinContainer) return; // Skip this rule if not in container
                }

                rule.replacements.forEach(rep => {
                    if (rep.search && rep.replace) {
                        const doReplace = (val) => val && val.includes(rep.search) ? val.split(rep.search).join(rep.replace) : val;

                        const updatedSrc = doReplace(newSrc);
                        if (updatedSrc !== newSrc) { newSrc = updatedSrc; appliedChanges = true; }

                        const updatedSrcset = doReplace(newSrcset);
                        if (updatedSrcset !== newSrcset) { newSrcset = updatedSrcset; appliedChanges = true; }

                        const updatedDataSrcset = doReplace(newDataSrcset);
                        if (updatedDataSrcset !== newDataSrcset) { newDataSrcset = updatedDataSrcset; appliedChanges = true; }

                        const updatedDataSrc = doReplace(newDataSrc);
                        if (updatedDataSrc !== newDataSrc) { newDataSrc = updatedDataSrc; appliedChanges = true; }
                    }
                });
            }
        } catch (e) {
            console.error('[FixImgSource] Invalid rule pattern:', rule.domainPattern, e);
        }
    });

    let modified = false;
    if (appliedChanges) {
        const normalize = (u) => u ? u.replace(/^https?:/, '') : u;

        if (newSrc && normalize(el.src) !== normalize(newSrc)) {
            console.log(`[FixImgSource] Fixing ${el.tagName} src: ${el.src} -> ${newSrc}`);
            el.src = newSrc;
            modified = true;
        }
        if (newSrcset && normalize(el.getAttribute('srcset')) !== normalize(newSrcset)) {
            console.log(`[FixImgSource] Fixing ${el.tagName} srcset: ${el.getAttribute('srcset')} -> ${newSrcset}`);
            el.setAttribute('srcset', newSrcset);
            modified = true;
        }
        if (newDataSrcset && normalize(el.getAttribute('data-srcset')) !== normalize(newDataSrcset)) {
            console.log(`[FixImgSource] Fixing ${el.tagName} data-srcset: ${el.getAttribute('data-srcset')} -> ${newDataSrcset}`);
            el.setAttribute('data-srcset', newDataSrcset);
            modified = true;
        }
        if (newDataSrc && normalize(el.getAttribute('data-src')) !== normalize(newDataSrc)) {
            console.log(`[FixImgSource] Fixing ${el.tagName} data-src: ${el.getAttribute('data-src')} -> ${newDataSrc}`);
            el.setAttribute('data-src', newDataSrc);
            modified = true;
        }

        // Remove these attributes as requested by the user after fixing
        const attributesToRemove = [
            'data-original-src',
            'data-original-srcset',
            'data-srcset',
            'data-src',
            'srcset'
        ];

        attributesToRemove.forEach(attr => {
            if (el.hasAttribute(attr)) {
                // If we just fixed it, don't remove it yet if we want it to stick?
                // Actually the user asked to remove them.
                console.log(`[FixImgSource] Removing attribute ${attr} from ${el.tagName}`);
                el.removeAttribute(attr);
            }
        });
    }
    return modified;
}

function revertAllImages() {
    const elements = document.querySelectorAll('img, source');
    let revertedCount = 0;
    elements.forEach(el => {
        const originalSrc = el.getAttribute('data-original-src');
        const originalSrcset = el.getAttribute('data-original-srcset');
        let modified = false;

        if (originalSrc && el.src !== originalSrc) {
            el.src = originalSrc;
            modified = true;
        }
        if (originalSrcset && el.getAttribute('srcset') !== originalSrcset) {
            el.setAttribute('srcset', originalSrcset);
            modified = true;
        }
        if (modified) revertedCount++;
    });
    console.log(`[FixImgSource] Total elements reverted: ${revertedCount}`);
    return revertedCount;
}

// MutationObserver to handle dynamically loaded elements and attribute changes
const observer = new MutationObserver((mutations) => {
    if (!isEnabled) return;

    mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) { // Element
                    const tag = node.tagName;
                    if (tag === 'IMG' || tag === 'SOURCE') {
                        fixSingleElement(node);
                    } else {
                        const children = node.querySelectorAll('img, source');
                        children.forEach(child => fixSingleElement(child));
                    }
                }
            });
        } else if (mutation.type === 'attributes') {
            const node = mutation.target;
            const tag = node.tagName;
            if (tag === 'IMG' || tag === 'SOURCE') {
                // To avoid infinite loops, we check if we were the ones who modified it
                // We'll use a temporary flag or just rely on the fact that fixSingleElement 
                // checks for existing 'data-original-src' and current src.
                // However, fixSingleElement now removes data-original-src after fixing.
                // So we need to be careful.

                // If the attribute changed is src or srcset and it's NOT our data-original-*
                if (mutation.attributeName === 'src' || mutation.attributeName === 'srcset') {
                    // Only fix if it's not already fixed (heuristic: doesn't contain the replacement string)
                    // Actually, fixSingleElement is smart enough.
                    fixSingleElement(node);
                }
            }
        }
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'data-srcset']
});
