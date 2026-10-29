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
        s += `\nCONDIZIONI ESTRATTE:\n- Franchigia: ${p.scheda.franchigia}\n- Scoperto: ${p.scheda.scoperto}\n- Massimale: ${p.scheda.massimale}\n- Esclusioni: ${p.scheda.esclusioni.join(', ')}\n`;
      }
      return s;
    }).join('\n\n');

  const prompt = `Sei un calcolatore assicurativo. L'utente deve fare: "${visita}".

Polizze:
${polizzeText}

REGOLE TASSATIVE:
1. Stima un costo medio per questa prestazione nella città dell'utente (es. visita cardiologica 100-120€).
2. Calcola quanto paga l'utente e quanto l'assicurazione. Se c'è uno scoperto (es. 20%) o una franchigia (es. 25€), applicali.
3. Se la prestazione è esclusa (es. medicina estetica), scrivi "coperta": false e "a_carico_utente": "Tutto".
4. NON sommare cose diverse. Se l'utente chiede due cose, calcola solo la prima.
5. Sii sintetico. Il campo "dettaglio" deve essere max 2 righe.

Rispondi SOLO con questo JSON:
{
  "nome": "string",
  "coperta": true | false,
  "a_carico_utente": "string (es. '45 €')",
  "a_carico_assicurazione": "string (es. '55 €')",
  "dettaglio": "string (es. 'Costo 100€ - 20€ scoperto - 25€ franchigia = 55€ rimborso')"
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
      return res.status(500).json({ error: 'Errore AI' });
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const risultato = JSON.parse(text);
    res.status(200).json(risultato);
  } catch (e) {
    console.error('Errore:', e);
    res.status(500).json({ error: 'Errore interno' });
  }
}
