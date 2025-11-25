// api/upload.js
const axios = require('axios');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');

// Matikan body parser bawaan Vercel
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async function handler(req, res) {
  // 1. Cek Method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Ambil Environment Variables
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  // Debugging (Cek di Logs Vercel jika masih error)
  console.log('Environment Check:', { 
    hasToken: !!token, 
    owner, 
    repo 
  });

  if (!token || !owner || !repo) {
    return res.status(500).json({ error: 'Server Config Error: GITHUB Environment Variables belum diisi di Vercel.' });
  }

  try {
    // 3. Setup Formidable
    const form = formidable({
      keepExtensions: true,
      maxFileSize: 5 * 1024 * 1024, // 5MB Limit
    });

    // 4. Parse File dengan Promise Wrapper
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // Ambil file (formidable v3 bisa return array atau single object)
    // Kita cari properti 'file' (sesuai name di input HTML)
    const uploadedFile = files.file?.[0] || files.file;

    if (!uploadedFile) {
      return res.status(400).json({ error: 'Tidak ada file yang diterima server.' });
    }

    // 5. Baca File
    const fileData = fs.readFileSync(uploadedFile.filepath);
    const base64Content = fileData.toString('base64');
    
    // Bersihkan nama file
    const ext = path.extname(uploadedFile.originalFilename || 'file.bin');
    const safeName = (uploadedFile.originalFilename || 'file').replace(/[^a-zA-Z0-9.-]/g, '');
    const uniqueName = `upload-${Date.now()}-${safeName}`;
    const targetPath = `uploads/${uniqueName}`;

    // 6. Upload ke GitHub
    const urlGithub = `https://api.github.com/repos/${owner}/${repo}/contents/${targetPath}`;
    
    await axios.put(urlGithub, {
      message: `Upload via Web: ${safeName}`,
      content: base64Content,
      branch: branch
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Uploader-Bot'
      }
    });

    // 7. Berhasil
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${targetPath}`;
    
    return res.status(200).json({
      success: true,
      url: rawUrl
    });

  } catch (error) {
    console.error('❌ SERVER ERROR:', error.response?.data || error.message);
    
    // Handle error spesifik GitHub
    if (error.response?.status === 401) {
        return res.status(500).json({ error: 'Token GitHub Salah/Expired' });
    }
    if (error.response?.status === 404) {
        return res.status(500).json({ error: 'Repo/Branch tidak ditemukan' });
    }

    return res.status(500).json({ 
      error: error.message || 'Internal Server Error' 
    });
  }
};
