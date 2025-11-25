// api/upload.js
const axios = require('axios');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');

// Konfigurasi Vercel agar tidak memparsing body secara otomatis (biar formidable yang kerja)
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // 1. Cek Method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Cek Environment Variables (PENTING)
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token || !owner || !repo) {
    console.error('❌ Environment Variables Missing');
    return res.status(500).json({ error: 'Server config error: Missing GitHub Env Vars' });
  }

  try {
    // 3. Parse Form Data
    const form = formidable({});
    let fields;
    let files;
    
    try {
        [fields, files] = await form.parse(req);
    } catch (err) {
        console.error('❌ Formidable Error:', err);
        return res.status(500).json({ error: 'Gagal memproses file upload' });
    }

    const uploadedFile = files.file?.[0];
    if (!uploadedFile) {
      return res.status(400).json({ error: 'Tidak ada file yang dikirim' });
    }

    console.log(`📂 Menerima file: ${uploadedFile.originalFilename}`);

    // 4. Baca File ke Buffer
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    
    // Encode ke Base64
    const base64Content = fileBuffer.toString('base64');

    // Buat nama file unik
    const ext = path.extname(uploadedFile.originalFilename) || '.bin';
    const cleanName = path.basename(uploadedFile.originalFilename, ext).replace(/[^a-zA-Z0-9]/g, '');
    const filename = `${cleanName}-${Date.now()}${ext}`;
    const filePath = `uploads/${filename}`;

    // 5. Upload ke GitHub (Menggunakan PUT request)
    // Kita skip cek repo/branch manual biar lebih cepat & hemat API hit.
    // GitHub API otomatis handle pembuatan file.
    const githubUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    
    console.log(`🚀 Uploading to: ${githubUrl}`);

    try {
        await axios.put(
            githubUrl,
            {
                message: `Upload ${filename}`,
                content: base64Content,
                branch: branch
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'User-Agent': 'Vercel-Uploader',
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (ghError) {
        console.error('❌ GitHub Error:', ghError.response?.data || ghError.message);
        
        // Handle error spesifik
        if (ghError.response?.status === 401) {
            return res.status(500).json({ error: 'Token GitHub Invalid/Expired' });
        }
        if (ghError.response?.status === 404) {
            return res.status(500).json({ error: 'Repo/Branch tidak ditemukan. Cek Env Vars.' });
        }
        throw ghError; // Lempar ke catch block utama
    }

    // 6. Sukses
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    console.log('✅ Upload Sukses:', rawUrl);

    return res.status(200).json({
      success: true,
      url: rawUrl
    });

  } catch (error) {
    console.error('❌ Critical Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal Server Error' 
    });
  }
}
