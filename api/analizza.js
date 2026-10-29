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

  const prompt = `Sei un calcolatore automatico di rimborsi assicurativi. Il tuo compito è calcolare in modo MATEMATICO quanto paga l'utente e quanto paga l'assicurazione.

DATI:
- Città dell'utente: ${profilo.citta}
- Polizze: ${polizzeText}
- Visita richiesta: ${visita}

REGOLE FONDAMENTALI:
1. Se nelle condizioni della polizza ci sono franchigie o percentuali, DEVI calcolarle.
2. Se NON ci sono le condizioni (perché l'utente non ha caricato il PDF), NON fare risposte generiche. Devi invece SIMULARE un calcolo standard: assumi che in regime diretto l'utente paghi 0€ e l'assicurazione il costo stimato, e in regime rimborsale l'utente paghi il 50% del costo stimato e l'assicurazione l'altro 50%.
3. **COSTO MEDIO DELLA PRESTAZIONE**: invece di usare un costo fisso di 100€, DEVI cercare il costo medio reale della visita richiesta nella città dell'utente. Se non riesci a trovare un dato preciso, usa una stima plausibile basata sui prezzi tipici italiani (es. visita cardiologica 80-120€, dermatologica 100-150€, oculistica 80-120€). Nel dettaglio, scrivi: "Costo medio stimato per [visita] a [città]: [importo]€".
4. Il campo "a_carico_utente" deve contenere SOLO un numero e il simbolo dell'euro (es. "0 €" o "60 €").
5. Il campo "a_carico_assicurazione" deve contenere SOLO un numero e il simbolo dell'euro (es. "100 €" o "40 €").
6. Nel campo "dettaglio", scrivi la matematica passo-passo (es. "Costo stimato 90€ - 20€ di scoperto = 70€ rimborsati").

Rispondi SOLO con questo JSON, senza testo attorno:
{
  "visita": "string",
  "polizze": [
    {
      "nome": "string",
      "coperta": true,
      "motivazione": "string",
      "calcolo": {
        "a_carico_utente": "string (solo numero, es. '60 €')",
        "a_carico_assicurazione": "string (solo numero, es. '40 €')",
        "dettaglio": "string (spiegazione matematica con costo stimato)"
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
