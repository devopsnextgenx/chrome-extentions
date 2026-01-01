# 🚫 Fix for 403 Forbidden Error

If you're getting a **403 Forbidden** error when the extension tries to connect to Ollama, this is because Ollama blocks browser extensions by default for security reasons.

## ✅ **Quick Fix**

Stop your current Ollama service and restart it with CORS enabled:

### Windows:
```cmd
# Stop Ollama if running
taskkill /f /im ollama.exe

# Start with CORS enabled
set OLLAMA_ORIGINS=* && ollama serve
```

### Linux/Mac:
```bash
# Stop Ollama if running
pkill ollama

# Start with CORS enabled
OLLAMA_ORIGINS=* ollama serve
```

## 🔧 **Permanent Fix**

Set the environment variable permanently:

### Windows:
1. Open System Properties → Advanced → Environment Variables
2. Add new system variable: `OLLAMA_ORIGINS` = `*`
3. Restart command prompt and run: `ollama serve`

### Linux/Mac:
1. Add to your shell profile (`.bashrc`, `.zshrc`, etc.):
   ```bash
   export OLLAMA_ORIGINS=*
   ```
2. Restart terminal and run: `ollama serve`

## 🧪 **Test the Fix**

1. Start Ollama with CORS: `OLLAMA_ORIGINS=* ollama serve`
2. Open browser developer console
3. Test connection: 
   ```javascript
   fetch('http://localhost:11434/api/version')
     .then(r => r.json())
     .then(console.log)
   ```
4. Should return Ollama version info instead of 403 error

## ⚠️ **Security Note**

Setting `OLLAMA_ORIGINS=*` allows any website to access your local Ollama instance. For production use, consider setting specific origins:

```bash
OLLAMA_ORIGINS="chrome-extension://*,https://trusted-site.com" ollama serve
```

## 🎯 **Verify Extension Works**

After fixing CORS:
1. Reload the extension in Chrome
2. Go to a YouTube video
3. Open extension popup
4. Click "Get & Send"
5. Check browser console for success messages instead of 403 errors
