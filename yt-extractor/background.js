// Import MQTT library for service worker
let mqttLibraryLoaded = false;
let pahoLoadPromise = null;

// Function to ensure MQTT library is loaded
function ensureMqttLibraryLoaded() {
  if (pahoLoadPromise) {
    return pahoLoadPromise;
  }
  
  pahoLoadPromise = new Promise((resolve, reject) => {
    try {
      console.log("🔄 [DEBUG] Attempting to load MQTT library...");
      console.log("🌍 [DEBUG] Current global context:", typeof self !== 'undefined' ? 'ServiceWorker' : 'Unknown');
      console.log("🔍 [DEBUG] Checking if Paho already exists:", typeof Paho !== 'undefined');
      
      // Check if already loaded
      if (typeof Paho !== 'undefined' && typeof Paho.MQTT !== 'undefined') {
        console.log("✅ [DEBUG] Paho MQTT library already available");
        mqttLibraryLoaded = true;
        resolve(true);
        return;
      }
      
      // Try to import the MQTT library
      console.log("📥 [DEBUG] Importing mqtt.min.js using importScripts...");
      importScripts('mqtt.min.js');
      
      // Small delay to allow for library initialization
      setTimeout(() => {
        // Check if library loaded successfully
        console.log("🔍 [DEBUG] Detailed Paho object inspection:");
        console.log("🔧 [DEBUG] typeof Paho:", typeof Paho);
        
        if (typeof Paho !== 'undefined') {
          console.log("📚 [DEBUG] Available Paho components:", Object.keys(Paho));
          console.log("🔧 [DEBUG] Paho.MQTT available:", typeof Paho.MQTT);
          console.log("� [DEBUG] Paho.Client available:", typeof Paho.Client);
          
          // Check for different possible structures
          if (Paho.MQTT) {
            console.log("🏗️ [DEBUG] Paho.MQTT.Client available:", typeof Paho.MQTT.Client);
            console.log("🏗️ [DEBUG] Paho.MQTT.Message available:", typeof Paho.MQTT.Message);
          }
          
          // Some versions might have Client directly under Paho
          if (Paho.Client) {
            console.log("🏗️ [DEBUG] Paho.Client available:", typeof Paho.Client);
          }
          
          // Log the full structure for debugging
          console.log("🔍 [DEBUG] Full Paho object structure:");
          for (let key in Paho) {
            if (Paho.hasOwnProperty(key)) {
              console.log(`🔹 [DEBUG] Paho.${key}:`, typeof Paho[key]);
              if (typeof Paho[key] === 'object' && Paho[key] !== null) {
                for (let subKey in Paho[key]) {
                  if (Paho[key].hasOwnProperty(subKey)) {
                    console.log(`  🔸 [DEBUG] Paho.${key}.${subKey}:`, typeof Paho[key][subKey]);
                  }
                }
              }
            }
          }
        }
        
        // Check different possible structures for MQTT client
        const hasValidMqttClient = (typeof Paho !== 'undefined') && 
          ((typeof Paho.MQTT !== 'undefined' && typeof Paho.MQTT.Client !== 'undefined') ||
           (typeof Paho.Client !== 'undefined'));
        
        if (hasValidMqttClient) {
          console.log("✅ [DEBUG] Paho MQTT library loaded successfully after import");
          mqttLibraryLoaded = true;
          resolve(true);
        } else {
          console.error("❌ [DEBUG] Paho object after import:", typeof Paho);
          console.error("❌ [DEBUG] No valid MQTT client found in Paho object");
          throw new Error("Paho MQTT library failed to initialize properly after import - no valid Client found");
        }
      }, 100); // Small delay to allow library to initialize
      
    } catch (error) {
      console.error("❌ [CRITICAL] Failed to load Paho MQTT library:", error);
      console.error("🔍 [DEBUG] Import error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      reject(error);
    }
  });
  
  return pahoLoadPromise;
}

// Try to load MQTT library immediately when background script loads
console.log("🚀 [DEBUG] Background script starting, attempting initial MQTT library load...");
ensureMqttLibraryLoaded().then(() => {
  console.log("✅ [DEBUG] Initial MQTT library load successful");
  
  // Test Ollama connection on startup
  console.log("🔍 [STARTUP] Testing Ollama integration...");
  testOllamaConnection().then((connected) => {
    if (connected) {
      return testOllamaModel();
    } else {
      console.warn("⚠️ [STARTUP] Skipping model test due to connection failure");
      return false;
    }
  }).then((modelReady) => {
    if (modelReady) {
      console.log("🎉 [STARTUP] Ollama integration fully ready!");
    } else {
      console.warn("⚠️ [STARTUP] Ollama integration issues detected - will use fallback");
    }
  }).catch((testError) => {
    console.warn("❌ [STARTUP] Ollama startup test failed:", testError.message);
  });
  
}).catch(error => {
  console.error("❌ [CRITICAL] Initial MQTT library load failed:", error);
  console.log("⚠️ [DEBUG] MQTT library will be loaded on-demand when needed");
});

// === OLLAMA INTEGRATION ===
async function testOllamaConnection() {
  console.log("🔍 [TEST] Testing Ollama connection...");
  try {
    const response = await fetch(`http://${ollamaHostPort}/api/version`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const version = await response.json();
      console.log("✅ [TEST] Ollama connection successful!");
      console.log("📋 [TEST] Ollama version:", version);
      return true;
    } else {
      console.warn("⚠️ [TEST] Ollama responded with status:", response.status);
      return false;
    }
  } catch (error) {
    console.warn("❌ [TEST] Ollama connection failed:", error.message);
    console.warn("💡 [TEST] Ensure Ollama is running: 'ollama serve'");
    return false;
  }
}

async function testOllamaModel() {
  console.log("🔍 [TEST] Testing Ollama model availability...");
  try {
    const response = await fetch(`http://${ollamaHostPort}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const models = await response.json();
      console.log("📋 [TEST] Available models:", models.models?.map(m => m.name) || []);
      
      const modelAvailable = models.models?.some(m => m.name === ollamaModelx || m.name.startsWith(ollamaModelx));
      if (modelAvailable) {
        console.log("✅ [TEST] Model '" + ollamaModelx + "' is available!");
        return true;
      } else {
        console.warn("⚠️ [TEST] Model '" + ollamaModelx + "' not found");
        console.warn("💡 [TEST] Try: 'ollama pull " + ollamaModelx + "'");
        return false;
      }
    } else {
      console.warn("⚠️ [TEST] Could not check model availability");
      return false;
    }
  } catch (error) {
    console.warn("❌ [TEST] Model availability check failed:", error.message);
    return false;
  }
}

async function processVideoDataWithOllama(videoData) {
  const {extract, config} = videoData;
  console.log("⚙️ [DEBUG] Using Ollama config:", { ollamaHostPort, ollamaModelx });
  console.log("🤖 [DEBUG] Starting Ollama processing for video data...");
  console.log("📋 [DEBUG] Ollama configuration:", { host: ollamaHostPort, model: ollamaModelx });
  console.log("📊 [DEBUG] Input video data:", JSON.stringify(videoData, null, 2));
  const { ollamaHost, ollamaPort, ollamaModel } = config || {};
  if (ollamaHost) {
    ollamaHostPort = ollamaPort ? `${ollamaHost}:${ollamaPort}` : ollamaHost;
  }
  if (ollamaModel) {
    ollamaModelx = ollamaModel;
  }
  try {
    // Create a prompt for Ollama to extract structured information
    const prompt = `Analyze the following YouTube video data and extract information in JSON format.
    
Video Data:
Title: ${extract.title}
Description: ${extract.description}
Channel: ${extract.channelName}
Resolution: ${![720, 1080, 1440, 2160].includes(extract.resolution) ? extract.resolution : extract.overrideResolution}
Type: ${extract.overrideContentType || 'song'}
Duration: ${extract.duration}
URL: ${extract.url}
Actor Override: ${extract.overrideActor || 'None'}

Please extract the following information and return ONLY a valid JSON object with these exact keys:
- LNG: Primary language of the video/movie/song (like "English", "South", "Hindi", "Marathi", "Bhojpuri", etc.)
- ACT: Use Actor Override if provided, else extract female actor/celebrity name from title/description 
- MP4URL: The YouTube video URL provided
- RES: Use Resolution value
- TYPE: Can be song, movie or science based on duration if Duration < 10min then song else movie
- TITLE: The original video title for reference, if Movie, use Title and Description to extract actual movie name and use "MovieName (Year)"
Important: Return ONLY the JSON object, no additional text or explanation.

Example format:
{"LNG": "English", "ACT": "Tom Hanks", "MP4URL": "https://youtube.com/watch?v=xyz", "RES": 1080, "TYPE": "movie", TITLE: "Forrest Gump (1994)"}`;

    console.log("📝 [DEBUG] Ollama prompt created, length:", prompt.length, "characters");
    console.log("🌐 [DEBUG] Making HTTP request to Ollama API:", `http://${ollamaHostPort}/api/generate`);
    
    const requestBody = {
      model: ollamaModelx,
      prompt: prompt,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.1, // Low temperature for more consistent results
        top_p: 0.9
      }
    };
    
    console.log("📤 [DEBUG] Ollama request body:", JSON.stringify(requestBody, null, 2));
    
    const startTime = Date.now();
    const response = await fetch(`http://${ollamaHostPort}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    const requestDuration = Date.now() - startTime;
    console.log(`⏱️ [DEBUG] Ollama API request completed in ${requestDuration}ms`);
    console.log("📥 [DEBUG] Ollama HTTP response status:", response.status, response.statusText);
    console.log("📋 [DEBUG] Ollama response headers:", Object.fromEntries(response.headers));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ [ERROR] Ollama API HTTP error:");
      console.error("🔍 [ERROR] Status:", response.status, response.statusText);
      console.error("🔍 [ERROR] Response body:", errorText);
      
      // Handle specific error cases
      if (response.status === 403) {
        console.error("🚫 [ERROR] 403 Forbidden - CORS/Permission issue detected!");
        console.error("💡 [SOLUTION] Ollama needs CORS configuration for browser extensions");
        console.error("💡 [SOLUTION] Start Ollama with CORS enabled:");
        console.error("   Windows: set OLLAMA_ORIGINS=* && ollama serve");
        console.error("   Linux/Mac: OLLAMA_ORIGINS=* ollama serve");
        console.error("💡 [SOLUTION] Or add to environment permanently:");
        console.error("   export OLLAMA_ORIGINS=*");
        throw new Error(`Ollama CORS Error (403): Browser extension blocked. Start Ollama with: OLLAMA_ORIGINS=* ollama serve`);
      } else if (response.status === 404) {
        console.error("🔍 [ERROR] 404 Not Found - Check if model exists");
        console.error("💡 [SOLUTION] Try: ollama pull " + ollamaModelx);
        throw new Error(`Ollama Model Not Found (404): Try 'ollama pull ${ollamaModelx}'`);
      } else if (response.status === 500) {
        console.error("⚠️ [ERROR] 500 Server Error - Ollama internal error");
        console.error("💡 [SOLUTION] Check Ollama logs and restart service");
        throw new Error(`Ollama Server Error (500): Check Ollama service status`);
      }
      
      throw new Error(`Ollama API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    console.log("✅ [SUCCESS] Ollama API HTTP request successful");
    const ollamaResult = await response.json();
    console.log("📦 [DEBUG] Ollama raw JSON response:", JSON.stringify(ollamaResult, null, 2));

    if (!ollamaResult.response) {
      console.error("❌ [ERROR] Ollama response missing 'response' field");
      console.error("🔍 [ERROR] Available fields in response:", Object.keys(ollamaResult));
      throw new Error("No response from Ollama model - missing 'response' field");
    }

    console.log("📝 [DEBUG] Ollama response content:", ollamaResult.response);
    console.log("📊 [DEBUG] Response length:", ollamaResult.response.length, "characters");
    
    // Additional Ollama response metadata logging
    if (ollamaResult.model) console.log("🤖 [DEBUG] Model used:", ollamaResult.model);
    if (ollamaResult.created_at) console.log("⏰ [DEBUG] Response created at:", ollamaResult.created_at);
    if (ollamaResult.done) console.log("✅ [DEBUG] Generation completed:", ollamaResult.done);
    if (ollamaResult.total_duration) console.log("⏱️ [DEBUG] Total generation time:", ollamaResult.total_duration, "ns");
    if (ollamaResult.load_duration) console.log("⏱️ [DEBUG] Model load time:", ollamaResult.load_duration, "ns");
    if (ollamaResult.prompt_eval_count) console.log("🔢 [DEBUG] Prompt tokens:", ollamaResult.prompt_eval_count);
    if (ollamaResult.eval_count) console.log("🔢 [DEBUG] Response tokens:", ollamaResult.eval_count);

    // Parse the JSON response from Ollama
    let extractedData;
    try {
      console.log("🔄 [DEBUG] Attempting to parse Ollama JSON response...");
      extractedData = JSON.parse(ollamaResult.response);
      console.log("✅ [SUCCESS] Successfully parsed Ollama JSON response");
      console.log("📊 [DEBUG] Parsed data:", JSON.stringify(extractedData, null, 2));
      console.log("🔍 [DEBUG] Extracted keys:", Object.keys(extractedData));
    } catch (parseError) {
      console.error("❌ [ERROR] Failed to parse Ollama JSON response");
      console.error("🔍 [ERROR] Parse error:", parseError.message);
      console.error("🔍 [ERROR] Raw response that failed to parse:", ollamaResult.response);
      console.error("🔍 [ERROR] Response type:", typeof ollamaResult.response);
      // Fallback to structured data with default values
      extractedData = {
        LNG: "English", // Default to English
        ACT: "Unknown",
        MP4URL: videoData.url,
        RES: 1080, // Default resolution
        TITLE: extract.title
      };
      console.log("🔄 [DEBUG] Using fallback structured JSON due to parse error:", extractedData);
    }

    // Validate required keys exist
    const requiredKeys = ['LNG', 'ACT', 'MP4URL', 'RES'];
    const hasAllKeys = requiredKeys.every(key => extractedData.hasOwnProperty(key));
    
    console.log("🔍 [DEBUG] Validating required keys in extracted data...");
    console.log("📋 [DEBUG] Required keys:", requiredKeys);
    console.log("📋 [DEBUG] Available keys:", Object.keys(extractedData));
    console.log("✅ [DEBUG] All required keys present:", hasAllKeys);
    
    if (!hasAllKeys) {
      const missingKeys = requiredKeys.filter(key => !extractedData.hasOwnProperty(key));
      console.warn("⚠️ [WARN] Missing required keys in Ollama response:", missingKeys);
      console.log("🔄 [DEBUG] Adding default values for missing keys...");
      
      extractedData = {
        ...extractedData,
        LNG: extractedData.LNG || "English", // Default to English
        ACT: extractedData.ACT || "Unknown", 
        MP4URL: extractedData.MP4URL || videoData.url,
        RES: extractedData.RES || 1080,
        TYPE: extractedData.TYPE,
        TITLE: extract.title
      };
      console.log("✅ [DEBUG] Fixed extracted data with defaults:", extractedData);
    }

    // Return ONLY the structured JSON with the required keys for MQTT
    const structuredData = {
      LNG: extractedData.LNG,
      ACT: `${extractedData.ACT}`,
      MP4URL: extractedData.MP4URL,
      RES: extractedData.RES,
      TYPE: extractedData.TYPE,
      TITLE: extractedData.TITLE
    };

    console.log("🎉 [SUCCESS] Ollama processing completed successfully!");
    console.log("📊 [SUCCESS] Final structured JSON for MQTT:", JSON.stringify(structuredData, null, 2));
    console.log("📋 [DEBUG] Data validation:");
    console.log("  🌐 Language (LNG):", structuredData.LNG);
    console.log("  🎭 Actor (ACT):", structuredData.ACT);
    console.log("  🔗 URL (MP4URL):", structuredData.MP4URL);
    console.log("  📺 Resolution (RES):", structuredData.RES);
    console.log("📋 [DEBUG] Original video title for reference:", videoData.title);
    console.log("📋 [DEBUG] Original channel for reference:", videoData.channelName);
    
    return structuredData;

  } catch (error) {
    console.error("❌ [ERROR] Ollama processing failed with exception");
    console.error("🔍 [ERROR] Error type:", error.constructor.name);
    console.error("🔍 [ERROR] Error message:", error.message);
    console.error("🔍 [ERROR] Error stack trace:", error.stack);
    
    // Log network-specific errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error("🌐 [ERROR] Network error - Ollama server may be unreachable");
      console.error("💡 [ERROR] Check if Ollama is running: 'ollama serve'");
      console.error("💡 [ERROR] Verify Ollama host configuration:", ollamaHostPort);
    } else if (error.message.includes('CORS Error') || error.message.includes('403')) {
      console.error("🚫 [ERROR] CORS/Permission error - Browser extension blocked by Ollama");
      console.error("💡 [SOLUTION] Start Ollama with CORS enabled:");
      console.error("   OLLAMA_ORIGINS=* ollama serve");
      console.error("💡 [ALTERNATIVE] Set environment variable permanently:");
      console.error("   export OLLAMA_ORIGINS=* (Linux/Mac)");
      console.error("   set OLLAMA_ORIGINS=* (Windows)");
    } else if (error.message.includes('API request failed')) {
      console.error("📡 [ERROR] Ollama API returned an error response");
      console.error("💡 [ERROR] Check if the model is available: 'ollama list'");
      console.error("💡 [ERROR] Try pulling the model: 'ollama pull " + ollamaModelx + "'");
    } else if (error.message.includes('JSON')) {
      console.error("📄 [ERROR] JSON parsing error - Ollama returned invalid JSON");
      console.error("💡 [ERROR] Model may need fine-tuning or different prompt");
    } else {
      console.error("❓ [ERROR] Unknown error occurred during Ollama processing");
    }
    
    // Return fallback structured data if Ollama fails - ONLY the required keys
    const fallbackData = {
      LNG: "English",
      ACT: "Unknown",
      MP4URL: videoData.url,
      RES: 1080,
      TITLE: extract.title
    };
    
    console.log("🔄 [FALLBACK] Using fallback structured JSON due to Ollama error");
    console.log("📊 [FALLBACK] Fallback data:", JSON.stringify(fallbackData, null, 2));
    console.log("⚠️ [FALLBACK] Ollama error summary:", error.message);
    console.log("📋 [FALLBACK] Original video data for reference:");
    console.log("  📺 Title:", videoData.title);
    console.log("  📺 Channel:", videoData.channelName);
    console.log("  📺 Resolution:", videoData.resolution);
    console.log("  📺 URL:", videoData.url);
    console.log("💡 [TROUBLESHOOT] To fix Ollama issues:");
    console.log("  1. Ensure Ollama is running: 'ollama serve'");
    console.log("  2. Enable CORS for browser extensions: 'OLLAMA_ORIGINS=* ollama serve'");
    console.log("  3. Check model availability: 'ollama list'");
    console.log("  4. Pull model if needed: 'ollama pull " + ollamaModelx + "'");
    console.log("  5. Test connection: 'curl " + ollamaHostPort + "/api/version'");
    console.log("  6. For persistent CORS fix, set environment variable:");
    console.log("     Windows: set OLLAMA_ORIGINS=*");
    console.log("     Linux/Mac: export OLLAMA_ORIGINS=*");
    
    return fallbackData;
  }
}

// === CONFIGURATION ===
// !!! REPLACE THESE WITH YOUR OWN MQTT BROKER DETAILS !!!
let mqttBrokerHost = '192.168.12.111'; // Your MQTT broker IP address
let mqttBrokerPort = 8083; // WebSocket port (browser extensions require WebSocket, not direct MQTT)
let mqttTopic = 'vsong';
let useWebSocket = true; // Force WebSocket connection for browser compatibility
// Note: Browser extensions cannot use mqtt:// protocol directly, only WebSocket

// === OLLAMA CONFIGURATION ===
let ollamaHostPort = 'localhost:11434'; // Ollama API endpoint
let ollamaModelx = 'gemma3:latest'; // Default Ollama model (change as needed)
// =====================

function setConfig({ mTopic, mqttHost, mqttPort, ollamaHost, ollamaPort, ollamaModel }) {
  if (mqttHost) mqttBrokerHost = mqttHost;
  if (mqttPort) mqttBrokerPort = Number(mqttPort);
  if (ollamaHost) ollamaHostPort = ollamaPort ? `${ollamaHost}:${ollamaPort}` : oHost;
  if (mTopic) mqttTopic = mTopic;
  if (ollamaModel) ollamaModelx = ollamaModel;
    // Log the final config after setting
  console.log("⚙️ [DEBUG] Config after setConfig:", {
    mqttBrokerHost,
    mqttBrokerPort,
    mqttTopic,
    ollamaHostPort,
    ollamaModelx
  });
}

// Event listener for messages from other parts of the extension (e.g., popup.js)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    console.log("📞 [DEBUG] Received message from extension:", request);
    
    // Add immediate logging to verify the listener is working
    console.log("🔍 [DEBUG] Background script message listener triggered");
    
    // Accept config overrides if provided
    if (request?.data?.config) {
      setConfig(request.data.config);
      console.log("⚙️ [DEBUG] Updated config from message:", request.data.config);
    }

  if (request.action === "processWithAI") {
    console.log("🎯 [DEBUG] Processing processWithAI action");
    
    // Process the data with Ollama only
    console.log("🚀 [DEBUG] Starting Ollama AI processing...");
    console.log("📊 [DEBUG] Data to process:", JSON.stringify(request.data, null, 2));
    
    // Accept config overrides if provided
    if (request?.data?.config) {
      setConfig(request.data.config);
      console.log("⚙️ [DEBUG] Updated config from AI processing message:", request.data.config);
    }
    
    processVideoDataWithOllama(request.data).then((processedData) => {
      console.log("✅ [SUCCESS] Ollama AI processing completed successfully!");
      console.log("📊 [SUCCESS] Processed data from Ollama:", JSON.stringify(processedData, null, 2));
      sendResponse({ 
        status: "success", 
        message: "AI processing completed successfully",
        processedData: processedData
      });
    }).catch((error) => {
      console.error("❌ [ERROR] AI processing failed:");
      console.error("🔍 [ERROR] Processing error:", error.message);
      sendResponse({ 
        status: "failure", 
        message: error.message,
        errorCode: error.code || 'AI_PROCESSING_ERROR',
        details: error.details || 'AI processing failed'
      });
    });
    
    // Return true to indicate we will send a response asynchronously
    console.log("🔄 [DEBUG] Returning true for asynchronous AI processing response");
    return true;
  } else if (request.action === "sendMqttMessage") {
    console.log("🎯 [DEBUG] Processing sendMqttMessage action (final data only)");
    
    // Check if the configuration is set
    if (mqttBrokerHost === 'YOUR_MQTT_BROKER_HOST') {
      console.warn("⚠️ [DEBUG] MQTT broker host not configured!");
      sendResponse({ status: "failure", message: "Please configure your MQTT broker host in background.js" });
      return false;
    }
    
    // Accept config overrides if provided  
    if (request?.data?.config) {
      setConfig(request.data.config);
      console.log("⚙️ [DEBUG] Updated config from MQTT message:", request.data.config);
    }
    
    // Send the final data directly via MQTT (no Ollama processing)
    console.log("🚀 [DEBUG] Sending final JSON data via MQTT...");
    console.log("📊 [DEBUG] Final data to send:", JSON.stringify(request.data.finalData, null, 2));
    
    ensureMqttLibraryLoaded().then(() => {
      console.log("✅ [DEBUG] MQTT library loaded, sending message...");
      return sendMqttMessage(request.data.finalData);
    }).then((result) => {
      console.log("✅ [SUCCESS] MQTT message sent successfully!");
      sendResponse({ 
        status: "success", 
        message: "MQTT message sent successfully",
        details: result
      });
    }).catch((error) => {
      console.error("❌ [ERROR] MQTT send failed:");
      console.error("🔍 [ERROR] MQTT error:", error.message);
      sendResponse({ 
        status: "failure", 
        message: error.message,
        errorCode: error.code || 'MQTT_SEND_ERROR',
        details: error.details || 'MQTT send failed'
      });
    });
    
    // Return true to indicate we will send a response asynchronously
    console.log("🔄 [DEBUG] Returning true for asynchronous MQTT response");
    return true;
  } else if (request.action === "legacySendMqttMessage") {
    console.log("🎯 [DEBUG] Processing legacy sendMqttMessage action (full pipeline)");
    
    // Check if the configuration is set
    if (mqttBrokerHost === 'YOUR_MQTT_BROKER_HOST') {
      console.warn("⚠️ [DEBUG] MQTT broker host not configured!");
      sendResponse({ status: "failure", message: "Please configure your MQTT broker host in background.js" });
      return false; // Indicates we will not send a response asynchronously
    }
    
    // Process the data with Ollama first, then send the MQTT message
    console.log("🚀 [DEBUG] Starting enhanced data processing with Ollama...");
    console.log("📊 [DEBUG] Original data to process:", JSON.stringify(request.data, null, 2));
    
    // Ensure MQTT library is loaded and process with Ollama
    ensureMqttLibraryLoaded().then(() => {
      console.log("✅ [DEBUG] MQTT library loaded, starting Ollama AI processing...");
      // Process the video data with Ollama first
      return processVideoDataWithOllama(request.data);
    }).then((enhancedData) => {
      console.log("✅ [SUCCESS] Ollama AI processing completed successfully!");
      console.log("📊 [SUCCESS] Enhanced data received from Ollama:", JSON.stringify(enhancedData, null, 2));
      console.log("🚀 [DEBUG] Now sending structured JSON to MQTT broker...");
      return sendMqttMessage(enhancedData);
    }).then((result) => {
      console.log("✅ [SUCCESS] Complete pipeline successful: YouTube → Ollama → MQTT");
      console.log("📡 [SUCCESS] MQTT message sent successfully!");
      sendResponse({ 
        status: "success", 
        message: "MQTT message sent successfully with Ollama enhancement",
        details: result,
        finalJsonPayload: result.finalJsonPayload // Include the final JSON that was sent
      });
    }).catch((error) => {
      console.error("❌ [ERROR] Enhanced MQTT pipeline failed:");
      console.error("🔍 [ERROR] Pipeline error:", error.message);
      console.error("🔍 [ERROR] Error occurred in:", error.stack ? "JavaScript execution" : "Network/API call");
      console.error("🔍 [DEBUG] Error stack trace:", error.stack);
      sendResponse({ 
        status: "failure", 
        message: error.message,
        errorCode: error.code || 'UNKNOWN',
        details: error.details || 'No additional details available'
      });
    });
  } else if (request.action === "getBrokerInfo") {
    // Action to get broker and Ollama configuration info
    console.log("📋 [DEBUG] Providing broker and Ollama configuration info");
    sendResponse({
      status: "success",
      brokerInfo: {
        host: mqttBrokerHost,
        port: mqttBrokerPort,
        topic: mqttTopic,
        note: "Browser extensions require WebSocket support on MQTT broker"
      },
      ollamaInfo: {
        host: ollamaHostPort,
        model: ollamaModelx,
        note: "Ollama will enhance data extraction with AI analysis"
      }
    });
    return false;
  } else {
    console.log("❓ [DEBUG] Unknown action received:", request.action);
    sendResponse({ status: "failure", message: "Unknown action" });
    return false;
  }
  } catch (error) {
    console.error("💥 [DEBUG] Uncaught error in message listener:", error);
    console.error("🔍 [DEBUG] Error details:", error.stack);
    sendResponse({ 
      status: "failure", 
      message: `Background script error: ${error.message}`,
      errorCode: 'BACKGROUND_SCRIPT_ERROR',
      details: error.stack
    });
    return false;
  }
});

function sendMqttMessage(data) {
  return ensureMqttLibraryLoaded().then(() => {
    console.log("⚙️ [DEBUG] Using config in sendMqttMessage:", {
      mqttBrokerHost,
      mqttBrokerPort,
      mqttTopic
    });
    return new Promise((resolve, reject) => {
      console.log("🔧 [DEBUG] Initializing MQTT client...");
      console.log("🌐 [DEBUG] Broker details:", { host: mqttBrokerHost, port: mqttBrokerPort, topic: mqttTopic });
      console.log("⚠️ [DEBUG] IMPORTANT: Browser extensions require WebSocket support on MQTT broker");
      
      // Double-check if Paho MQTT library is available and find the correct structure
      if (typeof Paho === 'undefined') {
        const error = new Error("Paho MQTT library is not loaded or not available. Check if mqtt.min.js is properly imported.");
        error.code = 'MQTT_LIBRARY_NOT_LOADED';
        error.details = 'The MQTT library (Paho) is required but not found in the global scope.';
        console.error("❌ [CRITICAL] Paho MQTT library check failed:", error.message);
        reject(error);
        return;
      }
      
      // Determine the correct MQTT client structure
      let clientConstructor, messageConstructor;
      if (typeof Paho.MQTT !== 'undefined' && typeof Paho.MQTT.Client !== 'undefined') {
        console.log("✅ [DEBUG] Using Paho.MQTT.Client structure");
        clientConstructor = Paho.MQTT.Client;
        messageConstructor = Paho.MQTT.Message;
      } else if (typeof Paho.Client !== 'undefined') {
        console.log("✅ [DEBUG] Using Paho.Client structure");
        clientConstructor = Paho.Client;
        messageConstructor = Paho.Message;
      } else {
        console.error("❌ [DEBUG] Available Paho properties:", Object.keys(Paho));
        const error = new Error("Paho MQTT Client not found in expected locations. Check MQTT library version.");
        error.code = 'MQTT_CLIENT_NOT_FOUND';
        error.details = 'Checked Paho.MQTT.Client and Paho.Client but neither were found.';
        console.error("❌ [CRITICAL] MQTT Client structure check failed:", error.message);
        reject(error);
        return;
      }
      
      console.log("✅ [DEBUG] Paho MQTT library verified and available");
    
    try {
      const clientId = `chrome_extension_${Math.random().toString(16).substring(2, 10)}`;
      console.log("🆔 [DEBUG] Generated client ID:", clientId);
      
      // Create MQTT client for WebSocket connection
      // Browser extensions must use WebSocket transport - this is enforced automatically
      const client = new clientConstructor(mqttBrokerHost, Number(mqttBrokerPort), "/mqtt", clientId);
      console.log("📡 [DEBUG] MQTT client created successfully for WebSocket transport");
      console.log("🌐 [DEBUG] WebSocket URL: ws://" + mqttBrokerHost + ":" + mqttBrokerPort + "/mqtt");
      console.log("💡 [DEBUG] Ensure your MQTT broker has WebSocket listener enabled on port", mqttBrokerPort, "with path '/mqtt'");

      client.onConnectionLost = (responseObject) => {
        if (responseObject.errorCode !== 0) {
          console.error("🔌 [DEBUG] MQTT Connection lost:", responseObject.errorMessage);
          console.error("📋 [DEBUG] Connection lost details:", responseObject);
        } else {
          console.log("🔌 [DEBUG] MQTT connection closed normally");
        }
      };

      client.onMessageArrived = (message) => {
        console.log("📨 [DEBUG] MQTT Message arrived:", message.payloadString);
        console.log("📍 [DEBUG] Message topic:", message.destinationName);
      };

      client.onMessageDelivered = (message) => {
        console.log("✅ [DEBUG] MQTT Message delivered successfully to topic:", message.destinationName);
      };

      // Connection options for WebSocket MQTT connection
      const connectOptions = {
        timeout: 10, // Connection timeout in seconds
        keepAliveInterval: 60,
        cleanSession: true,
        useSSL: false, // Set to true if using wss:// (WebSocket Secure)
        mqttVersion: 4, // MQTT version 3.1.1
        reconnect: false, // Don't auto-reconnect for this simple use case
        onSuccess: () => {
          console.log("🎉 [DEBUG] Successfully connected to MQTT broker via WebSocket!");
          console.log(`🏠 [DEBUG] WebSocket connected to: ws://${mqttBrokerHost}:${mqttBrokerPort}/mqtt`);
          
          // Create and send the message
          const messagePayload = JSON.stringify(data);
          console.log("📝 [DEBUG] Creating MQTT message with payload:", messagePayload);
          
          const mqttMessage = new messageConstructor(messagePayload);
          mqttMessage.destinationName = mqttTopic;
          mqttMessage.qos = 1; // Quality of Service level 1 (at least once) - try this instead of 2
          mqttMessage.retained = false;
          
          console.log("📤 [DEBUG] Message details:", {
            topic: mqttMessage.destinationName,
            qos: mqttMessage.qos,
            retained: mqttMessage.retained,
            payloadLength: messagePayload.length
          });
          
          try {
            console.log("⏳ [DEBUG] Sending MQTT message...");
            console.log("📋 [DEBUG] Client connection state:", client.isConnected() ? "Connected" : "Not Connected");
            
            client.send(mqttMessage);
            console.log("✅ [DEBUG] MQTT message sent successfully!");
            console.log(`📍 [DEBUG] Message sent to topic: ${mqttTopic}`);
            
            // Set up a callback to confirm message delivery (if supported)
            setTimeout(() => {
              console.log("⏰ [DEBUG] Waiting for message delivery confirmation...");
            }, 100);
            
            // Disconnect after sending
            setTimeout(() => {
              console.log("🔚 [DEBUG] Disconnecting from MQTT broker...");
              if (client.isConnected()) {
                client.disconnect();
                console.log("✅ [DEBUG] Successfully disconnected from MQTT broker");
              } else {
                console.log("⚠️ [DEBUG] Client was already disconnected");
              }
              resolve({
                broker: `${mqttBrokerHost}:${mqttBrokerPort}`,
                topic: mqttTopic,
                payloadSize: messagePayload.length,
                qos: mqttMessage.qos,
                timestamp: new Date().toISOString(),
                finalJsonPayload: data // Include the actual JSON data that was sent
              });
            }, 1500);
            
          } catch (sendError) {
            console.error("❌ [DEBUG] Error sending MQTT message:", sendError);
            console.error("🔍 [DEBUG] Send error details:", {
              name: sendError.name,
              message: sendError.message,
              stack: sendError.stack
            });
            client.disconnect();
            const enhancedError = new Error(`Failed to send message: ${sendError.message}`);
            enhancedError.code = 'SEND_ERROR';
            enhancedError.details = `Topic: ${mqttTopic}, Payload Size: ${messagePayload.length} bytes`;
            reject(enhancedError);
          }
        },
        onFailure: (error) => {
          const errorMsg = error.errorMessage || `Connection failed to ${mqttBrokerHost}:${mqttBrokerPort}`;
          console.error("❌ [DEBUG] MQTT Connection failed:", errorMsg);
          console.error("🔍 [DEBUG] Connection failure details:", {
            errorCode: error.errorCode,
            errorMessage: error.errorMessage,
            invocationContext: error.invocationContext,
            fullError: error
          });
          
          // Provide helpful error message
          let helpfulMessage = errorMsg;
          let errorDetails = `Error Code: ${error.errorCode}, Broker: ${mqttBrokerHost}:${mqttBrokerPort}`;
          
          if (error.errorCode === 7) {
            helpfulMessage += " - Check if MQTT broker is running and accessible";
            errorDetails += ", Issue: Network/connectivity problem";
            console.error("💡 [DEBUG] Error Code 7: Network/connectivity issue");
          } else if (error.errorCode === 4) {
            helpfulMessage += " - WebSocket connection failed. Ensure your MQTT broker supports WebSocket on port 8083 with path '/mqtt'";
            errorDetails += ", Issue: WebSocket connection failed - check broker WebSocket configuration";
            console.error("💡 [DEBUG] Error Code 4: WebSocket connection issue - verify broker supports ws:// on port 8083");
          } else if (error.errorCode === 8) {
            helpfulMessage += " - Connection timeout. Broker may be unreachable";
            errorDetails += ", Issue: Connection timeout";
            console.error("💡 [DEBUG] Error Code 8: Connection timeout");
          } else {
            errorDetails += `, Issue: Unknown error code ${error.errorCode}`;
            console.error("💡 [DEBUG] Unknown error code:", error.errorCode);
          }
          
          const enhancedError = new Error(helpfulMessage);
          enhancedError.code = error.errorCode;
          enhancedError.details = errorDetails;
          reject(enhancedError);
        }
      };
      
      // Attempt to connect to the MQTT broker
      console.log("🔗 [DEBUG] Attempting to connect to MQTT broker...");
      console.log("⚙️ [DEBUG] Connection options:", {
        timeout: connectOptions.timeout,
        keepAliveInterval: connectOptions.keepAliveInterval,
        cleanSession: connectOptions.cleanSession,
        useSSL: connectOptions.useSSL
      });
      
      console.log("🌐 [DEBUG] Full WebSocket URL will be: ws://" + mqttBrokerHost + ":" + mqttBrokerPort + "/mqtt");
      console.log("🔌 [DEBUG] Starting connection attempt...");
      
      client.connect(connectOptions);
      
    } catch (error) {
      console.error("❌ [DEBUG] Error initializing MQTT client:", error);
      console.error("🔍 [DEBUG] Initialization error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      reject(new Error(`MQTT initialization failed: ${error.message}`));
    }
    });
  }).catch((libraryError) => {
    // Handle MQTT library loading failures
    const error = new Error("Paho MQTT library is not loaded or not available. Check if mqtt.min.js is properly imported.");
    error.code = 'MQTT_LIBRARY_NOT_LOADED';
    error.details = 'The MQTT library (Paho) is required but not found in the global scope.';
    console.error("❌ [CRITICAL] MQTT library loading failed:", libraryError);
    return Promise.reject(error);
  });
}