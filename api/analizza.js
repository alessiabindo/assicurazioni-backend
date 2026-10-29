export default async function handler(req, res) {
    // Permessi CORS per far comunicare l'HTML con Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
// Rispondi subito alle richieste di "preflight" del browser
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
        s += `\nCondizioni: NON caricate. Cerca online sul sito ufficiale di ${p.nome}. Se non trovi, metti in "Da verificare".`;
      }
      return s;
    })
    .join('\n\n');

  const prompt = `Sei un assistente esperto in polizze sanitarie integrative italiane. Aiuta l'utente a capire, PRIMA di prenotare, quanto paga lui e quanto paga l'assicurazione per una visita, e quali centri convenzionati può contattare.

PROFILO:
- Città: ${profilo.citta}

POLIZZE:
${polizzeText}

VISITA RICHIESTA: ${visita}

REGOLE:
1. Calcola separatamente regime diretto (struttura convenzionata) e regime rimborsale (fuori rete).
2. Fai un esempio numerico su un costo ipotetico di 100 €.
3. Cerca i centri convenzionati di ogni polizza nella città indicata. Proponi 3-5 centri con nome, indirizzo e telefono.
4. Se un dato non è nelle condizioni, NON inventarlo: mettilo in "Da verificare".
5. Se ci sono due polizze, produci un blocco per ciascuna e un blocco "Confronto" che dica quale conviene e se si combinano.

Rispondi SOLO con questo JSON, senza testo attorno:
{
  "visita": "string",
  "polizze": [
    {
      "nome": "string",
      "coperta": true | false | "parziale" | null,
      "motivazione": "string",
      "calcolo": {
        "a_carico_utente": "string",
        "a_carico_assicurazione": "string",
        "dettaglio": "string"
      },
      "centri": [{ "nome": "string", "indirizzo": "string", "telefono": "string|null" }],
      "come_prenotare": ["string"],
      "da_verificare": ["string"]
    }
  ],
  "confronto": { "conviene": "string", "combinabili": true|false|null, "note": "string|null" } | null,
  "da_verificare_globali": ["string"]
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
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
