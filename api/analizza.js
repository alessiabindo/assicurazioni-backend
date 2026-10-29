export default async function handler(req, res) {
  // Permessi CORS
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
        s += `\nCondizioni estratte (dall'utente):\n`;
        s += `- Franchigia: ${p.scheda.franchigia}\n`;
        s += `- Scoperto: ${p.scheda.scoperto}\n`;
        s += `- Massimale: ${p.scheda.massimale}\n`;
        s += `- Carenza: ${p.scheda.carenza}\n`;
        s += `- Esclusioni: ${p.scheda.esclusioni.join(', ')}\n`;
        s += `- Documenti: ${p.scheda.documenti.join(', ')}\n`;
        s += `- Scadenza invio: ${p.scheda.scadenza_invio}\n`;
        s += `- Rete: ${p.scheda.rete}\n`;
      } else {
        s += `\nCondizioni: NON caricate. Devi cercarle tu online.`;
      }
      return s;
    })
    .join('\n\n');

  const prompt = `Sei un calcolatore automatico di rimborsi assicurativi. Il tuo compito è capire quanto paga l'utente e quanto paga l'assicurazione.

DATI UTENTE:
- Città: ${profilo.citta}
- Polizze: ${polizzeText}
- Visita richiesta: ${visita}

REGOLE TASSATIVE:
1. Se l'utente NON ha caricato le condizioni (scheda vuota), DEVI usare il tool di ricerca (Google Search) per trovare il sito ufficiale della compagnia (es. metasalute.it).
2. Cerca la pagina "Piani Sanitari" o "Condizioni di Assicurazione" e trova il link al PDF del piano specifico indicato dall'utente (es. "Piano Base").
3. Usa il tool url_context per leggere quel PDF direttamente dal sito. Estrai franchigie, scoperti e massimali per la visita richiesta.
4. Se non trovi il PDF o la lettura fallisce, allora (e solo allora) simula un calcolo standard: assumi che in regime diretto l'utente paghi 0€ e in regime rimborsale il 50%.
5. Fai UN SOLO calcolo matematico lineare. Non scrivere ragionamenti dubbi ("forse", "dipende"). 
6. Stima il costo medio della visita per la città dell'utente e usalo come base per il calcolo.
7. Il campo "dettaglio" deve essere lungo MASSIMO 2 righe. Esempio: "Costo stimato 140€. Scoperto 20% (28€) + Franchigia 25€ = 53€ a tuo carico. Rimborso: 87€."
8. Il campo "a_carico_utente" e "a_carico_assicurazione" devono contenere SOLO numeri e il simbolo €.

Rispondi SOLO con questo JSON:
{
  "visita": "string",
  "polizze": [
    {
      "nome": "string",
      "coperta": true,
      "motivazione": "string (max 15 parole)",
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          // QUESTI SONO I DUE TOOL PER LA RICERCA E LA LETTURA DEI PDF
          tools: [
            { google_search: {} },
            { url_context: {} }
          ],
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
