chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getData") {
    try {
      // Extract comprehensive YouTube video information
      const title = document.title.replace(' - YouTube', '');
      // Add resolution extraction code
      const description = document.querySelector('meta[name="description"]')?.content || '';
      const keywordsMeta = document.querySelector('meta[name="keywords"]')?.content || '';
      
      // Try to get channel name
      const channelName = document.querySelector('#channel-name .ytd-channel-name a, #owner-name a, .ytd-video-owner-renderer a')?.textContent?.trim() || '';
      
      // Try to get video duration (if available in page)
      const durationElement = document.querySelector('.ytp-time-duration, .ytd-thumbnail-overlay-time-status-renderer');
      const duration = durationElement?.textContent?.trim() || '';
      
      // Try to get view count
      const viewCountElement = document.querySelector('#info .view-count, .ytd-video-view-count-renderer');
      const viewCount = viewCountElement?.textContent?.trim() || '';
      
      // Try to get upload date
      const uploadDateElement = document.querySelector('#info-strings yt-formatted-string, .ytd-video-secondary-info-renderer #info-strings yt-formatted-string');
      const uploadDate = uploadDateElement?.textContent?.trim() || '';

      // Try to extract video quality indicators for better resolution detection
      const videoElement = document.querySelector('video');
      let videoQualityInfo = '';
      
      // Get video element dimensions if available
      let resolution = '';
      if (videoElement) {
        videoQualityInfo = `Video dimensions: ${videoElement.videoWidth}x${videoElement.videoHeight}`;
        resolution = `${videoElement.videoHeight}`;
      }
      
      // Try to get quality settings from YouTube player
      const qualitySettings = document.querySelector('.ytp-quality-menu .ytp-menuitem-label');
      if (qualitySettings) {
        videoQualityInfo += ` | Quality setting: ${qualitySettings.textContent}`;
      }

      // Create a function to check for keywords in the title, description, and keywords meta tag
      const checkKeywords = (text, keywords) => {
        const lowerText = text.toLowerCase();
        return keywords.some(keyword => lowerText.includes(keyword));
      };

      const movieKeywords = ['movie', 'film', 'trailer', 'full movie', 'cinema', 'blockbuster'];
      const actorKeywords = ['actor', 'actress', 'interview', 'talk show', 'celebrity', 'star'];

      const isMovie = checkKeywords(title, movieKeywords) || checkKeywords(description, movieKeywords) || checkKeywords(keywordsMeta, movieKeywords);
      const isActor = checkKeywords(title, actorKeywords) || checkKeywords(description, actorKeywords) || checkKeywords(keywordsMeta, actorKeywords);

      // Determine content type
      let contentType = 'Other';
      if (isMovie) {
        contentType = 'movie';
      } else if (isActor) {
        contentType = 'song';
      }

      const videoData = {
        title: title,
        description: description.substring(0, 500) + (description.length > 500 ? '...' : ''), // Increased description length for better AI analysis
        url: window.location.href.split('&')[0],
        channelName: channelName,
        duration: duration,
        viewCount: viewCount,
        uploadDate: uploadDate,
        contentType: contentType,
        resolution: resolution, // Add the max resolution to the response
        videoQualityInfo: videoQualityInfo,
        extractedAt: new Date().toISOString(),
      };

      if (videoData.contentType === "Other") {
        // sendResponse({
        //   status: "failure",
        //   message: "Could not identify as a movie or actor page."
        // });
        sendResponse({
          status: "success",
          data: videoData
        });
      } else {
        sendResponse({
          status: "success",
          data: videoData
        });
      }
    } catch (error) {
      sendResponse({
        status: "failure",
        message: "Failed to extract data: " + error.message
      });
    }
  }
});