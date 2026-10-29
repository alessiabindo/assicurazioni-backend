export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  const { profilo, visita } = req.body;

  if (!visita) {
    return res.status(400).json({ error: 'Visita mancante' });
  }

  const polizzeText = profilo.polizze
    .filter(p => p.nome)
    .map((p, i) => {
      let s = `Polizza ${i + 1}: ${p.nome}`;
      if (p.piano) s += ` — piano ${p.piano}`;
      if (p.scheda) {
        s += `\nCONDIZIONI ESTRATTE:\n`;
        s += `- Franchigia: ${p.scheda.franchigia}\n`;
        s += `- Scoperto: ${p.scheda.scoperto}\n`;
        s += `- Massimale: ${p.scheda.massimale}\n`;
        s += `- Esclusioni: ${p.scheda.esclusioni.join(', ')}\n`;
      } else {
        s += `\nCondizioni: NON caricate.`;
      }
      return s;
    })
    .join('\n\n');

  const prompt = `Sei un assistente assicurativo. L'utente ti ha chiesto: "${visita}"

Le sue polizze:
${polizzeText}

REGOLE FONDAMENTALI:
1. Se l'utente chiede PIÙ COSE diverse (es. una visita + una medicina estetica), DEVI separarle in due schede distinte dentro l'array "prestazioni".
2. Per ogni prestazione, controlla le esclusioni. Se la prestazione è esclusa (es. medicina estetica), scrivi "coperta": false, "a_carico_utente": "100% del costo", "a_carico_assicurazione": "0 €".
3. Se la prestazione è coperta, calcola: Costo stimato - (Scoperto % o Minimo) - Franchigia.
4. Sii chiaro e sintetico nel "dettaglio" (max 2 righe per prestazione). Non sommare cose diverse.

Rispondi SOLO con questo JSON:
{
  "prestazioni": [
    {
      "nome": "string (es. 'Visita dermatologica' o 'Medicina estetica')",
      "coperta": true | false,
      "a_carico_utente": "string (es. '94 €')",
      "a_carico_assicurazione": "string (es. '56 €')",
      "dettaglio": "string (es. 'Costo 150€. Scoperto 20% (30€) + Franchigia 25€ = 55€. Rimborso 95€.')"
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
      return res.status(500).json({ error: 'Errore nella chiamata AI' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({ error: 'Risposta AI vuota' });
    }

    const risultato = JSON.parse(text);
    res.status(200).json(risultato);
  } catch (e) {
    console.error('Errore:', e);
    res.status(500).json({ error: 'Errore interno' });
  }
}
