function switchTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  document.getElementById(`${tabId}Tab`).classList.add('active');
}

let overrideActor = '';
let overrideResolution = ''; // Default resolution
let overrideContentType = 'song'; // Default content type
let extractedVideoData = null; // Store extracted data
let processedAIData = null; // Store AI processed data

// Button references
const extractButton = document.getElementById('extractButton');
const processButton = document.getElementById('processButton');
const sendButton = document.getElementById('sendButton');

// Extract button functionality
document.getElementById('extractButton').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  const extractedDataDiv = document.getElementById('extractedData');

  // Clear previous status
  statusDiv.textContent = 'Extracting video data...';
  extractedDataDiv.value = '';
  
  // Switch to extracted data tab
  switchTab('extracted');

  
  addMqttStatus('Starting video data extraction...');  // Get the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Check if the current tab is a YouTube video page
  if (!tab?.url?.includes("youtube.com/watch")) {
    statusDiv.textContent = 'Please navigate to a YouTube video page.';
    addMqttStatus('Failed: Not on a YouTube video page', 'error');
    return;
  }

  addMqttStatus('Executing content script on YouTube page...');

  // Execute content script to get data from the page
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  }, () => {
    // Send a message to the content script to trigger data extraction
    chrome.tabs.sendMessage(tab.id, { action: "getData" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        const errorMsg = 'Content script error: ' + chrome.runtime.lastError.message;
        statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
        addMqttStatus(errorMsg, 'error');
        return;
      }
      if (response && response.status === "success") {
        // Store extracted data
        extractedVideoData = response.data;
        
        // Display the extracted data
        const formattedData = JSON.stringify(response.data, null, 2);
        extractedDataDiv.value = formattedData;
        
        // Ensure we're on the extracted data tab to show results
        switchTab('extracted');
        
        statusDiv.textContent = 'Data extracted successfully. Ready for AI processing.';
        addMqttStatus('Video data extracted successfully');
        addMqttStatus(`Content Type: ${response.data.contentType}, Title: "${response.data.title}"`);
        
        // Enable process button
        processButton.disabled = false;
        processButton.style.backgroundColor = '#3b82f6';
        processButton.style.opacity = '1';
        
        // Stay on extracted tab to show the results
        addMqttStatus('📊 Extracted data displayed in "Extracted Data" tab', 'success');
      } else {
        const errorMsg = response ? response.message : 'Unknown error occurred';
        statusDiv.textContent = `Error: ${errorMsg}`;
        addMqttStatus(`Data extraction failed: ${errorMsg}`, 'error');
        extractedDataDiv.value = '';
      }
    });
  });
});

// Process AI button functionality
document.getElementById('processButton').addEventListener('click', async () => {
  if (!extractedVideoData) {
    document.getElementById('status').textContent = 'No extracted data available. Please extract data first.';
    return;
  }

  const statusDiv = document.getElementById('status');
  const finalJsonBox = document.getElementById('finalJsonBox');

  // Get override values
  overrideActor = document.getElementById('actorInput').value;
  overrideResolution = document.getElementById('resolutionSelect').value;
  
  // Get selected content type
  const selectedContentType = document.querySelector('input[name="contentType"]:checked')?.value || 'song';
  overrideContentType = selectedContentType;

  console.log("🎭 [POPUP] Using override actor:", overrideActor);
  console.log("🎬 [POPUP] Using content type:", overrideContentType);
  
  // Switch to final JSON tab
  switchTab('final');

  
  statusDiv.textContent = 'Processing with Ollama AI to create structured JSON...';
  addMqttStatus('🤖 Processing with Ollama AI to extract structured JSON (LNG, ACT, MP4URL, RES)...');

  // Get user config from input boxes
  const ollamaHostPort = document.getElementById('ollamaHostPort').value.trim();
  const ollamaModel = document.getElementById('ollamaModel').value.trim();

  // Helper to split host:port
  function splitHostPort(str, defaultPort) {
    const [host, port] = str.split(':');
    return { host, port: port ? parseInt(port, 10) : defaultPort };
  }
  const ollamaConfig = splitHostPort(ollamaHostPort, 11434);

  // Send data for AI processing
  chrome.runtime.sendMessage({
    action: "processWithAI",
    data: {
      extract: {...extractedVideoData, overrideActor, overrideResolution, overrideContentType},
      config: {
        ollamaHost: ollamaConfig.host,
        ollamaPort: ollamaConfig.port,
        ollamaModel: ollamaModel
      }
    }
  }, (res) => {
    console.log("🤖 [POPUP] AI processing response:", res);
    if (res && res.status === "success") {
      // Store processed data
      processedAIData = res.processedData;
      
      statusDiv.textContent = 'AI processing completed. Ready to send MQTT.';
      addMqttStatus('✅ Structured JSON (LNG, ACT, MP4URL, RES) created successfully', 'success');
      
      // Display the processed JSON
      const finalJson = JSON.stringify(processedAIData, null, 2);
      finalJsonBox.value = finalJson;
      addMqttStatus('📊 AI processed JSON displayed in textbox - you can edit before sending', 'success');
      
      // Enable send button
      sendButton.disabled = false;
      sendButton.style.backgroundColor = '#059669';
      sendButton.style.opacity = '1';
      
    } else {
      console.error("❌ [POPUP] AI processing error:", res);
      const errorMsg = res ? res.message : 'AI processing failed';
      statusDiv.textContent = `Error: ${errorMsg}`;
      addMqttStatus(`🤖 AI processing failed: ${errorMsg}`, 'error');
    }
  });
});

// Send MQTT button functionality  
document.getElementById('sendButton').addEventListener('click', async () => {
  if (!processedAIData) {
    document.getElementById('status').textContent = 'No processed data available. Please process with AI first.';
    return;
  }

  const statusDiv = document.getElementById('status');
  const finalJsonBox = document.getElementById('finalJsonBox');

  // Get the current JSON from the text box (in case user edited it)
  let finalData;
  try {
    const jsonText = finalJsonBox.value.trim();
    finalData = JSON.parse(jsonText);
  } catch (error) {
    statusDiv.textContent = 'Error: Invalid JSON in final text box. Please fix the JSON format.';
    addMqttStatus('Invalid JSON format in text box', 'error');
    console.error('JSON parse error:', error);
    return;
  }

  
  statusDiv.textContent = 'Sending message via MQTT...';
  addMqttStatus('📡 Sending structured JSON via MQTT...');

  // Get MQTT config
  const mqttHostPort = document.getElementById('mqttHostPort').value.trim();
  const mTopic = document.getElementById('mTopic').value.trim();

  function splitHostPort(str, defaultPort) {
    const [host, port] = str.split(':');
    return { host, port: port ? parseInt(port, 10) : defaultPort };
  }
  const mqttConfig = splitHostPort(mqttHostPort, 8083);

  // Send via MQTT
  chrome.runtime.sendMessage({
    action: "sendMqttMessage",
    data: {
      finalData: finalData,
      config: {
        mTopic: mTopic,
        mqttHost: mqttConfig.host,
        mqttPort: mqttConfig.port
      }
    }
  }, (res) => {
    console.log("📡 [POPUP] MQTT send response:", res);
    if (res && res.status === "success") {
      statusDiv.textContent = 'Structured JSON sent via MQTT!';
      addMqttStatus('✅ Structured JSON sent successfully via MQTT', 'success');
      
      // Display detailed success information
      if (res?.details) {
        addMqttStatus(`Broker: ${res.details.broker}`);
        addMqttStatus(`Topic: ${res.details.topic}`);
        addMqttStatus(`Payload size: ${res.details.payloadSize} bytes`);
        addMqttStatus(`QoS: ${res.details.qos}`);
        addMqttStatus(`Sent at: ${new Date(res.details.timestamp).toLocaleString()}`);
      }
      
      // Reset buttons for next operation
      setTimeout(() => {
        extractButton.disabled = false;
        processButton.disabled = true;
        sendButton.disabled = true;
        processButton.style.backgroundColor = '#4b5563';
        sendButton.style.backgroundColor = '#4b5563';
        processButton.style.opacity = '0.6';
        sendButton.style.opacity = '0.6';
        switchTab('status');
      }, 3000);
      
    } else {
      console.error("❌ [POPUP] MQTT send error:", res);
      const errorMsg = res ? res.message : 'MQTT send failed';
      statusDiv.textContent = `Error: ${errorMsg}`;
      addMqttStatus(`📡 MQTT send failed: ${errorMsg}`, 'error');
      
      // Add troubleshooting hints
      if (errorMsg.includes('WebSocket') || res?.errorCode === 4) {
        addMqttStatus('💡 TIP: Ensure your MQTT broker supports WebSocket connections', 'error');
      } else if (errorMsg.includes('timeout') || res?.errorCode === 8) {
        addMqttStatus('💡 TIP: Check if the broker IP address and port are correct', 'error');
      }
    }
  });
});

// Add event listener for clear status button
document.getElementById('clearStatusButton').addEventListener('click', () => {
  const mqttStatusBox = document.getElementById('mqttStatus');
  mqttStatusBox.value = '';
  switchTab('status');
  // Add a cleared message with timestamp
  const timestamp = new Date().toLocaleTimeString();
  mqttStatusBox.value = `[${timestamp}] 🗑️ CLEARED: Status log cleared by user\n`;
});

// Helper function to add timestamped messages to MQTT status box
function addMqttStatus(message, type = 'info') {
  const mqttStatusBox = document.getElementById('mqttStatus');
  const timestamp = new Date().toLocaleTimeString();
  let prefix;
  if (type === 'error') {
    prefix = '❌ ERROR:';
  } else if (type === 'success') {
    prefix = '✅ SUCCESS:';
  } else {
    prefix = 'ℹ️ INFO:';
  }
  const statusMessage = `[${timestamp}] ${prefix} ${message}\n`;
  mqttStatusBox.value += statusMessage;
  mqttStatusBox.scrollTop = mqttStatusBox.scrollHeight;
}

// Initialize status box with configuration info
document.addEventListener('DOMContentLoaded', () => {
  const mqttStatusBox = document.getElementById('mqttStatus');
  const finalJsonBox = document.getElementById('finalJsonBox');
  const timestamp = new Date().toLocaleTimeString();
  
  // Initialize tabs
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      switchTab(button.dataset.tab);
    });
  });

  // Focus status tab by default
  switchTab('status');
  // Initialize status box
  mqttStatusBox.value = `[${timestamp}] ℹ️ INFO: Extension loaded - Ready to extract structured JSON {LNG, ACT, MP4URL, RES}\n`;
  
  // Initialize final JSON box with placeholder text
  finalJsonBox.placeholder = "{\n  \"LNG\": \"English\",\n  \"ACT\": \"Actor Name\",\n  \"MP4URL\": \"video_url\",\n  \"RES\": 1080\n}";
  
  // Fetch broker and Ollama configuration from background script
  chrome.runtime.sendMessage({ action: "getBrokerInfo" }, (response) => {
    if (response?.status === "success") {
      const brokerInfo = response.brokerInfo;
      const ollamaInfo = response.ollamaInfo;
      
      // Update model input with current value if it exists
      if (ollamaInfo?.model) {
        document.getElementById('ollamaModel').value = ollamaInfo.model;
      }

      mqttStatusBox.value += `[${timestamp}] ℹ️ INFO: MQTT Broker: ${brokerInfo.host}:${brokerInfo.port}\n`;
      mqttStatusBox.value += `[${timestamp}] ℹ️ INFO: MQTT Topic: "${brokerInfo.topic}"\n`;
      mqttStatusBox.value += `[${timestamp}] 🤖 INFO: AI Model: ${ollamaInfo.model} at ${ollamaInfo.host}\n`;
      mqttStatusBox.value += `[${timestamp}] ⚠️  NOTE: ${brokerInfo.note}\n`;
      mqttStatusBox.value += `[${timestamp}] ✨ NOTE: ${ollamaInfo.note}\n`;
      mqttStatusBox.value += `[${timestamp}] 📊 OUTPUT: Structured JSON format {LNG, ACT, MP4URL, RES}\n`;
      mqttStatusBox.value += `[${timestamp}] ℹ️ INFO: Click "Get & Send" on a YouTube video page to start\n`;
    } else {
      mqttStatusBox.value += `[${timestamp}] 📊 OUTPUT: Structured JSON format {LNG, ACT, MP4URL, RES}\n`;
      mqttStatusBox.value += `[${timestamp}] ℹ️ INFO: Click "Get & Send" on a YouTube video page to start\n`;
    }
  });
});