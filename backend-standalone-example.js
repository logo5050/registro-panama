// --- Standalone Express Backend Example (Node.js) ---
// This file serves as a reference for a standalone backend if you choose to 
// separate it from the Next.js frontend.

/* 
// package.json dependencies:
{
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "multer": "^1.4.5-lts.1",
    "@supabase/supabase-js": "^2.39.0",
    "dotenv": "^16.3.1"
  }
}
*/

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET /api/entities
app.get('/api/entities', async (req, res) => {
  const { search, status } = req.query;
  let query = supabase.from('businesses').select('*');
  if (search) query = query.ilike('name', `%${search}%`);
  if (status) query = query.eq('status', status);
  
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/entities/:id
app.get('/api/entities/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('businesses')
    .select('*, events(*)')
    .eq('id', req.params.id)
    .single();
  
  if (error) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// POST /api/reports
app.post('/api/reports', upload.single('evidenceFile'), async (req, res) => {
  const { entityName, reportType, description } = req.body;
  const file = req.file;
  
  let evidenceUrl = null;
  if (file) {
    const { data, error } = await supabase.storage
      .from('complaints-evidence')
      .upload(`standalone/${Date.now()}_${file.originalname}`, file.buffer);
    if (!error) {
      evidenceUrl = supabase.storage.from('complaints-evidence').getPublicUrl(data.path).data.publicUrl;
    }
  }

  const { data, error } = await supabase.from('multimedia_reports').insert({
    entity_name_manual: entityName,
    report_type: reportType,
    complaint_text: description,
    evidence_urls: evidenceUrl ? [evidenceUrl] : [],
    source: 'Web'
  });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

// POST /api/webhooks/messaging
app.post('/api/webhooks/messaging', async (req, res) => {
  const payload = req.body;
  // Logic to parse and save...
  res.json({ received: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
