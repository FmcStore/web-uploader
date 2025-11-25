// api/upload.js
const axios = require('axios');
const formidable = require('formidable');
const fs = require('fs');
const FileType = require('file-type');

// KONFIGURASI DIAMBIL DARI ENVIRONMENT VARIABLES VERCEL
const githubToken = process.env.GITHUB_TOKEN || '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';
const githubOwner = process.env.GITHUB_OWNER || 'tralalawabi-art';
const repo = process.env.GITHUB_REPO || 'storagefmc';
const branch = process.env.GITHUB_BRANCH || 'storage';

export const config = {
  api: {
    bodyParser: false, // Penting: Matikan body parser bawaan agar formidable bekerja
  },
};

// --- LOGIKA GITHUB DARI KODE KAMU (Diadaptasi) ---
async function ensureRepoAndBranch() {
  const headers = { 
    Authorization: `Bearer ${githubToken}`,
    'User-Agent': 'Web-Uploader'
  };

  // Cek Repo
  try {
    await axios.get(`https://api.github.com/repos/${githubOwner}/${repo}`, { headers });
  } catch (e) {
    if (e.response?.status === 404) {
      // Buat Repo jika tidak ada
      await axios.post(`https://api.github.com/user/repos`, {
        name: repo, private: false, auto_init: true, description: 'Storage for Web Uploads'
      }, { headers });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Tunggu sebentar
    } else throw e;
  }

  // Cek Branch
  try {
    await axios.get(`https://api.github.com/repos/${githubOwner}/${repo}/branches/${branch}`, { headers });
  } catch (e) {
    if (e.response?.status === 404) {
      // Buat branch dari main/master
      try {
        const baseBranch = await axios.get(`https://api.github.com/repos/${githubOwner}/${repo}/git/refs/heads/main`, { headers })
          .catch(() => axios.get(`https://api.github.com/repos/${githubOwner}/${repo}/git/refs/heads/master`, { headers }));
        
        await axios.post(`https://api.github.com/repos/${githubOwner}/${repo}/git/refs`, {
          ref: `refs/heads/${branch}`, sha: baseBranch.data.object.sha
        }, { headers });
      } catch (err) {
        console.error('Gagal buat branch', err);
      }
    }
  }
}

async function uploadToGithub(buffer, originalFilename) {
  await ensureRepoAndBranch();

  const detected = await FileType.fromBuffer(buffer);
  const ext = detected?.ext || 'bin';
  // Nama file unik: timestamp-random.ext
  const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const filePath = `uploads/${uniqueName}`;
  const base64 = buffer.toString('base64');

  const headers = { 
    Authorization: `Bearer ${githubToken}`,
    'User-Agent': 'Web-Uploader',
    'Content-Type': 'application/json'
  };

  await axios.put(
    `https://api.github.com/repos/${githubOwner}/${repo}/contents/${filePath}`,
    {
      message: `Upload ${originalFilename}`,
      content: base64,
      branch: branch
    },
    { headers }
  );

  // Return direct raw link
  return `https://raw.githubusercontent.com/${githubOwner}/${repo}/${branch}/${filePath}`;
}

// --- HANDLER VERCEL ---
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({});
    
    const [fields, files] = await form.parse(req);
    const uploadedFile = files.file?.[0];

    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Baca file dari temp storage formidable ke buffer
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);

    // Jalankan logika upload
    const url = await uploadToGithub(fileBuffer, uploadedFile.originalFilename);

    return res.status(200).json({ 
      success: true, 
      url: url,
      filename: uploadedFile.originalFilename
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal Server Error' 
    });
  }
}
