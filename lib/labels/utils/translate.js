import translate from 'translate-google';

// Fallback single-item translate (legacy support module)
export async function translateText(text) {
  if (!text || text === 'Unknown Product' || text.match(/^[a-zA-Z0-9\s!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/)) {
    return text;
  }
  
  if (process.env.GROK_API_KEY) {
     try {
         const res = await fetch("https://api.x.ai/v1/chat/completions", {
             method: "POST",
             headers: {
                 "Content-Type": "application/json",
                 "Authorization": `Bearer ${process.env.GROK_API_KEY}`
             },
             body: JSON.stringify({
                 model: "grok-2-latest",
                 messages: [
                     { role: "system", content: "You are a professional translator. Translate the following product title from Russian to English. Return ONLY the English translation without quotes or explanations." },
                     { role: "user", content: text }
                 ],
                 temperature: 0.1
             })
         });
         const data = await res.json();
         if (data.choices && data.choices[0]) {
             return data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
         }
     } catch(e) {
         console.warn(`\n⚠️ Grok translation error for: "${text.slice(0,25)}...". Falling back to Google.`);
     }
  }
  
  try {
    const translated = await translate(text, { to: 'en' });
    if (translated) return translated;
  } catch(e) {
    console.warn(`\n⚠️ Google Translation error for: "${text.slice(0,25)}...". Using original text.`);
  }
  return text;
}

// Ultra-fast bulk translation specifically for Ozon Product Maps
export async function translateBulk(textsArray) {
   if (!textsArray || textsArray.length === 0) return [];
   
   try {
      const needsTranslation = [];
      const translationMap = new Map();
      
      for (const text of textsArray) {
          if (!text || text === 'Unknown Product' || text.match(/^[a-zA-Z0-9\s!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/)) {
              translationMap.set(text, text);
          } else {
              if (!translationMap.has(text)) {
                  needsTranslation.push(text);
                  translationMap.set(text, null);
              }
          }
      }
      
      if (needsTranslation.length > 0) {
          // 🚀 GROK AI BULK TRANSLATION ROUTE
          if (process.env.GROK_API_KEY) {
              try {
                  const res = await fetch("https://api.x.ai/v1/chat/completions", {
                      method: "POST",
                      headers: {
                          "Content-Type": "application/json",
                          "Authorization": `Bearer ${process.env.GROK_API_KEY}`
                      },
                      body: JSON.stringify({
                          model: "grok-2-latest",
                          messages: [
                              { 
                                role: "system", 
                                content: `You are an expert translator. The user will provide a JSON array of Russian product titles. 
Translate them to English. You MUST return a JSON array of strings in the EXACT SAME order, with the exact same length. 
Do NOT return anything else, only the raw JSON array.` 
                              },
                              { role: "user", content: JSON.stringify(needsTranslation) }
                          ],
                          temperature: 0.1
                      })
                  });
                  const data = await res.json();
                  if (data.choices && data.choices[0]) {
                      let textBlock = data.choices[0].message.content.trim();
                      if (textBlock.startsWith('```json')) textBlock = textBlock.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                      const translatedSubset = JSON.parse(textBlock);
                      
                      if (Array.isArray(translatedSubset) && translatedSubset.length === needsTranslation.length) {
                          for (let i = 0; i < needsTranslation.length; i++) {
                              translationMap.set(needsTranslation[i], translatedSubset[i] || needsTranslation[i]);
                          }
                          return textsArray.map(t => translationMap.get(t) || t);
                      }
                  }
              } catch (err) {
                  console.error("Grok bulk parse failed, reverting to Google Fallback.");
              }
          }
          
          // 🌐 GOOGLE TRANSLATE FALLBACK
          const translatedSubset = await translate(needsTranslation, { to: 'en' });
          for (let i = 0; i < needsTranslation.length; i++) {
              translationMap.set(needsTranslation[i], translatedSubset[i] || needsTranslation[i]);
          }
      }
      return textsArray.map(t => translationMap.get(t) || t);

    } catch (e) {
       // Silent fallback to avoid polluting stderr and breaking dashboard wrappers
       return textsArray;
    }
}
