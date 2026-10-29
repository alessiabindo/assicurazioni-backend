export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' });

  const { profilo, visita } = req.body;
  if (!visita) return res.status(400).json({ error: 'Visita mancante' });

  const polizzeText = profilo.polizze
    .filter(p => p.nome)
    .map((p, i) => {
      let s = `Polizza ${i + 1}: ${p.nome}`;
      if (p.piano) s += ` — piano ${p.piano}`;
      if (p.scheda) {
        s += `\nCONDIZIONI:\n- Franchigia: ${p.scheda.franchigia}\n- Scoperto: ${p.scheda.scoperto}\n- Esclusioni: ${p.scheda.esclusioni.join(', ')}\n`;
      }
      return s;
    }).join('\n\n');

  const prompt = `Sei un assistente assicurativo. L'utente chiede: "${visita}".

Polizze:
${polizzeText}

REGOLE:
1. Se l'utente chiede PIÙ COSE, separale in schede distinte.
2. Se è esclusa (es. medicina estetica), scrivi "coperta": false e "a_carico_utente": "Tutto".
3. Se è coperta, stima un costo medio per la città e calcola: Costo - (Scoperto o Minimo) - Franchigia.
4. NON sommare cose diverse. Sii sintetico.

Rispondi SOLO con questo JSON (senza markdown, senza ```):
{
  "prestazioni": [
    {
      "nome": "string",
      "coperta": true | false,
      "a_carico_utente": "string",
      "a_carico_assicurazione": "string",
      "dettaglio": "string"
    }
  ]
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            maxOutputTokens: 4000
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini error:', err);
      return res.status(500).json({ error: 'Errore AI' });
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // Pulizia di sicurezza: rimuove eventuali ```json all'inizio o alla fine
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    if (!text) return res.status(500).json({ error: 'Risposta vuota' });

    const risultato = JSON.parse(text);
    res.status(200).json(risultato);
  } catch (e) {
    console.error('Errore:', e);
    res.status(500).json({ error: 'Errore interno' });
  }
}
