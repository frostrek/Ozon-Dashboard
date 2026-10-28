#!/usr/bin/env bun

/**
 * Ollama Client for local AI processing (Chat API Version).
 * Connects to http://localhost:11434/api/chat
 */

export async function callOllama(systemPrompt, userPrompt, model = "llama3:8b", jsonMode = false) {
  const endpoint = "http://localhost:11434/api/chat";

  try {
    const payload = {
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: 1500, // Slightly higher for complex attributes
        num_ctx: 4096 // Standard context window to prevent memory crashes
      }
    };

    if (jsonMode) {
      payload.format = "json";
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(300_000) // 5 minute timeout for local AI
    });

    if (!response.ok) {
       const errorBody = await response.text().catch(() => "No error body");
       console.error(`  [Ollama] HTTP Error: ${response.status} - ${errorBody}`);
       return null;
    }

    const data = await response.json();
    let content = data.message?.content?.trim() || "";

    // Basic cleaning (remove potential AI introductory text if it slips past prompt)
    content = content.replace(/^(Sure|Here|Result|Below|I've|As requested).*?:\s*/i, '');
    
    return content;
  } catch (err) {
    if (err.name === 'TimeoutError') {
      console.warn("  [Ollama] Local AI timeout after 300s.");
    } else {
      console.warn(`  [Ollama] Local AI connection failed: ${err.message}. Ensure Ollama is running on port 11434.`);
    }
    return null;
  }
}

/**
 * Version for JSON output (useful for attribute mapping)
 */
export async function callOllamaJson(systemPrompt, userPrompt, model = "llama3:8b") {
  const result = await callOllama(systemPrompt, userPrompt + "\n\nCRITICAL: Output ONLY valid JSON.", model, true);
  if (!result) return null;
  
  try {
    // With format: "json", Ollama should return a clean JSON string
    return JSON.parse(result);
  } catch (e) {
    console.warn("  [Ollama] Failed to parse JSON from response. Attempting manual extraction...");
    try {
      const start = result.indexOf('{');
      const end = result.lastIndexOf('}');
      if (start === -1 || end === -1) return null;
      return JSON.parse(result.substring(start, end + 1));
    } catch {
      return null;
    }
  }
}
