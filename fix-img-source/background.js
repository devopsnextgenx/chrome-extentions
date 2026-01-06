// background.js

chrome.runtime.onInstalled.addListener(() => {
    const defaultRules = [
        {
            id: 'default-ragalahari',
            domainPattern: 'ragalahari.com',
            containerIds: ['galleries_panel', 'galdiv'],
            replacements: [
                { search: 'szcdn.ragalahari.com', replace: 'starzone.ragalahari.com' },
                { search: 'szcdn1.ragalahari.com', replace: 'starzone.ragalahari.com' },
                { search: 'szcdn2.ragalahari.com', replace: 'starzone.ragalahari.com' },
                { search: 'imgcdn.ragalahari.com', replace: 'img.ragalahari.com' },
                { search: 'media1.ragalahari.com', replace: 'img.ragalahari.com' },
                { search: 'timg.ragalahari.com', replace: 'img.ragalahari.com' },
                { search: 'www.ragalahari.com', replace: 'starzone.ragalahari.com' },
                { search: 'www1.ragalahari.com', replace: 'starzone.ragalahari.com' },
                { search: 'starzone.ragalahari.com/june2009/starzone/', replace: 'img.ragalahari.com/june2009/starzone/' }
            ]
        },
        {
            id: 'default-raagalahari',
            domainPattern: 'raagalahari.com',
            containerIds: ['galleries_panel', 'galdiv'],
            replacements: [
                { search: 'szcdn.raagalahari.com', replace: 'starzone.ragalahari.com' },
                { search: 'szcdn1.raagalahari.com', replace: 'starzone.ragalahari.com' },
                { search: 'szcdn2.raagalahari.com', replace: 'starzone.ragalahari.com' },
                { search: 'imgcdn.raagalahari.com', replace: 'img.ragalahari.com' },
                { search: 'media1.raagalahari.com', replace: 'img.ragalahari.com' },
                { search: 'www.raagalahari.com', replace: 'starzone.ragalahari.com' }
            ]
        }
    ];

    // Set initial state
    chrome.storage.local.set({
        enabled: true,
        rules: defaultRules
    });
});

// Listener for changes in storage (e.g., enabled/disabled)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) {
        updateIcon(changes.enabled.newValue);
    }
});

function updateIcon(enabled) {
    const path = enabled ? 'icons/icon16.png' : 'icons/icon16_disabled.png';
    // Note: We need actual icons for this to work perfectly, but for now we set it.
    // In a real scenario, we'd have grayscale/colored versions.
    chrome.action.setIcon({ path: { "16": path } }).catch(err => {
        // Ignore errors if icons don't exist yet
        console.log('Icon update failed (expected if icons missing):', err);
    });
}
