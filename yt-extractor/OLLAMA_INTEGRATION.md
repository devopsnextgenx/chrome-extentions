# YouTube MQTT Extension with Ollama AI Integration

This extension has been enhanced to work with Ollama AI models to extract structured data from YouTube videos.

## New Features

The extension now extracts and sends data in the following JSON format:
```json
{
  "LNG": "en",           // Language code (2-letter ISO)
  "ACT": "Tom Hanks",    // Actor/celebrity name or "Unknown"
  "MP4URL": "https://youtube.com/watch?v=xyz",  // YouTube video URL
  "RES": 1080            // Estimated resolution (720, 1080, 1440, 2160)
}
```

Note: Only these 4 keys are sent via MQTT for clean, structured data consumption.
```

## Configuration

### Ollama Setup
1. Install Ollama from https://ollama.ai/
2. Pull a model (e.g., `ollama pull llama3.2`)
3. **Enable CORS for browser extensions:**
   ```bash
   # Start Ollama with CORS enabled (required for browser extensions)
   OLLAMA_ORIGINS=* ollama serve
   
   # Or set environment variable permanently:
   # Windows:
   set OLLAMA_ORIGINS=*
   ollama serve
   
   # Linux/Mac:
   export OLLAMA_ORIGINS=*
   ollama serve
   ```

### Extension Configuration
In `background.js`, update the Ollama configuration:
```javascript
const ollamaHost = 'http://localhost:11434'; // Ollama API endpoint
const ollamaModel = 'llama3.2'; // Your preferred model
```

### MQTT Configuration
Update the MQTT broker settings in `background.js`:
```javascript
const mqttBrokerHost = '192.168.12.111'; // Your MQTT broker IP
const mqttBrokerPort = 8083; // WebSocket port
const mqttTopic = 'vsong'; // MQTT topic
```

## How It Works

1. User clicks "Get & Send" on a YouTube video page
2. Extension extracts basic video data (title, description, channel, etc.)
3. Data is sent to Ollama AI model for enhancement:
   - **Language Detection**: Analyzes content to determine primary language
   - **Actor/Celebrity Recognition**: Identifies main actors or celebrities mentioned
   - **Resolution Estimation**: Estimates video quality based on available indicators
4. Enhanced data is formatted according to the specified JSON structure
5. Final JSON is sent via MQTT to the configured broker

## Fallback Behavior

If Ollama is unavailable or fails:
- Extension provides default values:
  - `LNG`: "en" (English)
  - `ACT`: "Unknown"
  - `MP4URL`: Original YouTube URL
  - `RES`: 1080 (default resolution)
- `processedWithOllama` is set to `false`
- Original functionality is preserved

## Supported Resolutions

The AI model estimates one of these resolution values:
- **720**: HD (720p)
- **1080**: Full HD (1080p)
- **1440**: 2K (1440p)
- **2160**: 4K (2160p)

## Troubleshooting

### Ollama Connection Issues
- **403 Forbidden Error**: Ollama blocks browser extensions by default
  ```bash
  # Fix: Start Ollama with CORS enabled
  OLLAMA_ORIGINS=* ollama serve
  ```
- Ensure Ollama is running: `ollama serve`
- Check if the model is available: `ollama list`
- Verify the endpoint is accessible: `curl http://localhost:11434/api/version`

### MQTT Issues
- Ensure your MQTT broker supports WebSocket connections
- Check firewall settings for the MQTT broker
- Verify the broker is running and accessible

### Browser Console Debugging
Open browser developer tools to see detailed logs:
- 🤖 Ollama processing logs
- 📡 MQTT connection logs  
- ⚠️ Error messages and fallback behavior

## Model Customization

You can use different Ollama models by updating the `ollamaModel` variable:
- `llama3.2` (recommended)
- `llama3.1`
- `mistral`
- `codellama`
- Any other Ollama-compatible model

Larger models may provide better accuracy but will be slower.
