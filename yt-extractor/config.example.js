// Configuration file for YouTube MQTT Extension with Ollama AI Integration
// Copy this to background.js and modify the values as needed

// === MQTT BROKER CONFIGURATION ===
const mqttBrokerHost = '192.168.12.111';  // Your MQTT broker IP address
const mqttBrokerPort = 8083;              // WebSocket port (not standard MQTT port 1883)
const mqttTopic = 'vsong';                // Topic where messages will be published

// === OLLAMA AI CONFIGURATION ===
const ollamaHost = 'http://localhost:11434';  // Ollama API endpoint
const ollamaModel = 'llama3.2';               // Ollama model to use for AI processing

// Alternative model options:
// - 'llama3.1' (larger, more accurate but slower)
// - 'mistral' (good general purpose model)
// - 'codellama' (better for technical content)
// - Any other model you have pulled with 'ollama pull <model-name>'

// === IMPORTANT NOTES ===
// 1. MQTT Broker MUST support WebSocket connections (browser requirement)
// 2. Ollama must be running with CORS enabled: 'OLLAMA_ORIGINS=* ollama serve'
// 3. Model must be available: 'ollama pull <model-name>'
// 4. Port 8083 is common for MQTT WebSocket, adjust if your setup differs
// 5. If Ollama fails, extension will use fallback values

// === OLLAMA CORS FIX ===
// Browser extensions require CORS to be enabled in Ollama
// Start Ollama with: OLLAMA_ORIGINS=* ollama serve
// Or set permanently:
//   Windows: set OLLAMA_ORIGINS=* && ollama serve
//   Linux/Mac: export OLLAMA_ORIGINS=* && ollama serve

// === MQTT JSON OUTPUT FORMAT ===
// Only these 4 keys are sent via MQTT:
// {
//   "LNG": "en",                    // 2-letter language code
//   "ACT": "Tom Hanks",            // Actor name or "Unknown"
//   "MP4URL": "https://youtube.com/watch?v=xyz",  // YouTube URL
//   "RES": 1080                    // Resolution (720, 1080, 1440, 2160)
// }
