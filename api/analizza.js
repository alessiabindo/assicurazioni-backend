export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' });

  const { profilo, visita } = req.body;
  if (!visita) return res.status(400).json({ error: 'Visita mancante' });

  let polizzeText = "";
  profilo.polizze.filter(p => p.nome).forEach((p, i) => {
    polizzeText += `Polizza ${i + 1}: ${p.nome} — piano ${p.piano}\n`;
    if (p.testoPdf) {
      // Prendiamo i primi 15.000 caratteri del PDF per non sforare i limiti
      polizzeText += `TESTO ESTRATTO DAL PDF:\n${p.testoPdf.substring(0, 15000)}\n`;
    } else {
      polizzeText += `ATTENZIONE: Nessun PDF caricato.\n`;
    }
  });

  const prompt = `Sei un calcolatore assicurativo. L'utente deve fare: "${visita}".

Ecco le condizioni della sua polizza:
${polizzeText}

REGOLE TASSATIVE:
1. Leggi ATTENTAMENTE il testo del PDF. Cerca la sezione "Visite specialistiche".
2. Stima un costo medio per la prestazione a ${profilo.citta} (es. ginecologa 120€).
3. Trova lo scoperto o la franchigia ESATTA scritta nel PDF (es. "Scoperto 30%"). Non inventare numeri che non ci sono.
4. Calcola matematicamente: Costo - Scoperto = Rimborso.
5. Se il PDF dice "rimborso max 55€ per visita", applica quel limite massimo.
6. Sii sintetico nel dettaglio (max 2 righe). Non scrivere "forse" o "dipende".

Rispondi SOLO con questo JSON:
{
  "visita": "string",
  "polizze": [
    {
      "nome": "string",
      "coperta": true,
      "motivazione": "string (cita la clausola del PDF)",
      "calcolo": {
        "a_carico_utente": "string (es. '36 €')",
        "a_carico_assicurazione": "string (es. '84 €')",
        "dettaglio": "string (es. 'Costo 120€. Scoperto 30% = 36€ a tuo carico. Rimborso 84€.')"
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
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 4000 }
        })
      }
    );

    if (!response.ok) return res.status(500).json({ error: 'Errore AI' });

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    res.status(200).json(JSON.parse(text));
  } catch (e) {
    res.status(500).json({ error: 'Errore interno' });
  }
}
