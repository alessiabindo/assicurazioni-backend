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
        s += `\nCondizioni estratte:\n`;
        s += `- Franchigia: ${p.scheda.franchigia}\n`;
        s += `- Scoperto: ${p.scheda.scoperto}\n`;
        s += `- Massimale: ${p.scheda.massimale}\n`;
        s += `- Carenza: ${p.scheda.carenza}\n`;
        s += `- Esclusioni: ${p.scheda.esclusioni.join(', ')}\n`;
        s += `- Documenti: ${p.scheda.documenti.join(', ')}\n`;
        s += `- Scadenza invio: ${p.scheda.scadenza_invio}\n`;
        s += `- Rete: ${p.scheda.rete}\n`;
      } else {
        s += `\nCondizioni: NON caricate. L'utente non ha caricato il PDF.`;
      }
      return s;
    })
    .join('\n\n');

  const prompt = `Sei un calcolatore automatico. Devi calcolare quanto paga l'utente e quanto l'assicurazione.

DATI:
- Città: ${profilo.citta}
- Polizze: ${polizzeText}
- Visita: ${visita}

REGOLE TASSATIVE:
1. Stima il costo medio della visita per la città. Scrivilo solo nel dettaglio.
2. Fai UN SOLO calcolo matematico lineare. Se c'è una franchigia e uno scoperto, applica prima lo scoperto e poi sottrai la franchigia.
3. NON scrivere ragionamenti, dubbi o frasi come "no aspetta", "forse", "dipende". Sii sintetico e assertivo.
4. Se non ci sono le condizioni (PDF non caricato), simula: 0€ a carico utente in regime diretto, 50€ in regime rimborsale.
5. Il campo "dettaglio" deve essere lungo MASSIMO 2 righe. Esempio: "Costo stimato 140€. Scoperto 20% (28€) + Franchigia 25€ = 53€ a tuo carico. Rimborso: 87€."

Rispondi SOLO con questo JSON:
{
  "visita": "string",
  "polizze": [
    {
      "nome": "string",
      "coperta": true,
      "motivazione": "string (max 10 parole)",
      "calcolo": {
        "a_carico_utente": "string (es. '53 €')",
        "a_carico_assicurazione": "string (es. '87 €')",
        "dettaglio": "string (max 2 righe, solo matematica)"
      },
      "centri": [{ "nome": "string", "indirizzo": "string", "telefono": "string|null" }],
      "come_prenotare": ["string"],
      "da_verificare": ["string"]
    }
  ],
  "confronto": null,
  "da_verificare_globali": ["string"]
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
            temperature: 0.1, // Temperatura bassissima = niente creatività, solo matematica
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
