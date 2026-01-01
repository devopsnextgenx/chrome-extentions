# YouTube MQTT Extension - MQTT Client Configuration with AI Enhancement

## 🚀 NEW: Ollama AI Integration
This extension now includes **Ollama AI integration** for enhanced data extraction! See `OLLAMA_INTEGRATION.md` for details.

### Enhanced Data Format
The extension now sends structured JSON data with AI-extracted information:
- **LNG**: Language code (e.g., "en", "es")
- **ACT**: Actor/celebrity name or "Unknown" 
- **MP4URL**: YouTube video URL
- **RES**: Estimated resolution (720, 1080, 1440, 2160)

## Important Notes About MQTT Connections in Browser Extensions

### Browser Security Limitations
Browser extensions are restricted by security policies and **cannot make direct TCP connections** to MQTT brokers. This means:

1. **WebSocket Required**: Even though we removed the `/ws` path from the client creation, the Paho MQTT JavaScript client still uses WebSocket transport under the hood when running in a browser environment.

2. **MQTT Broker Requirements**: Your MQTT broker at `192.168.12.111:1883` needs to support WebSocket connections for this to work. Most modern MQTT brokers support this.

### Current Configuration
- **Host**: `192.168.12.111` (your MQTT broker IP)
- **Port**: `1883` (standard MQTT port)
- **Topic**: `vsong`
- **Connection**: Direct connection using host IP and port (no WebSocket path specified)

### To Make This Work

#### Option 1: Enable WebSocket Support on Your MQTT Broker
If using Mosquitto, add this to your configuration:
```
# Enable WebSocket listener
listener 9001
protocol websockets
```
Then update `mqttBrokerPort` in `background.js` to `9001`.

#### Option 2: Use MQTT over WebSocket Bridge
Some MQTT brokers automatically handle WebSocket connections on the same port as TCP MQTT.

#### Option 3: Use a Different MQTT Broker
Consider using a cloud MQTT broker that supports WebSocket connections:
- HiveMQ Public Broker: `broker.hivemq.com:8000`
- Eclipse IoT: `mqtt.eclipseprojects.io:443` (WSS)

### Testing
1. Load the extension in Chrome
2. Go to a YouTube video
3. Open the extension popup and try sending a message
4. Check the browser console for connection logs and error messages

### Troubleshooting
- If you see "WebSocket connection failed" errors, your MQTT broker needs WebSocket support
- If you see "Connection failed" errors, check if the broker is running and accessible
- Use browser DevTools → Console to see detailed error messages
