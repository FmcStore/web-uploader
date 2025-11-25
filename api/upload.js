import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';
import formidable from 'formidable';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'tralalawabi-art';
const REPO = process.env.REPO || 'storagefmc';
const BRANCH = process.env.BRANCH || 'storage';

if (!GITHUB_TOKEN) {
  console.warn('⚠️ GITHUB_TOKEN not set. Upload will fail.');
}

const headers = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  'User-Agent': 'Vercel-GitHub-Uploader',
  'Accept': 'application/vnd.github.v3+json'
};

// ✅ FULL auto-create: repo + branch
async function ensureRepoAndBranch() {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN missing');

  // 1. Cek & buat repo jika belum ada
  try {
    await axios.get(`https://api.github.com/repos/${GITHUB_OWNER}/${REPO}`, { headers });
    console.log('✅ Repo already exists');
  } catch (e) {
    if (e.response?.status === 404) {
      console.log('📦 Creating repo...');
      await axios.post(
        'https://api.github.com/user/repos',
        {
          name: REPO,
          private: false,
          auto_init: true,
          description: 'Auto-created by GitHub Uploader'
        },
        { headers }
      );
      // Tunggu sebentar agar GitHub siap
      await new Promise(r => setTimeout(r, 3000));
    } else {
      throw e;
    }
  }

  // 2. Cek & buat branch jika belum ada
  try {
    await axios.get(`https://api.github.com/repos/${GITHUB_OWNER}/${REPO}/branches/${BRANCH}`, { headers });
    console.log('✅ Branch already exists');
  } catch (e) {
    if (e.response?.status === 404) {
      console.log('🌿 Creating branch...');
      // Ambil SHA dari main/master
      let sha;
      try {
        const { data } = await axios.get(
          `https://api.github.com/repos/${GITHUB_OWNER}/${REPO}/git/refs/heads/main`,
          { headers }
        );
        sha = data.object.sha;
      } catch {
        const { data } = await axios.get(
          `https://api.github.com/repos/${GITHUB_OWNER}/${REPO}/git/refs/heads/master`,
          { headers }
        );
        sha = data.object.sha;
      }
      await axios.post(
        `https://api.github.com/repos/${GITHUB_OWNER}/${REPO}/git/refs`,
        { ref: `refs/heads/${BRANCH}`, sha },
        { headers }
      );
    } else {
      throw e;
    }
  }
}

async function uploadToGitHub(buffer) {
  await ensureRepoAndBranch(); // 🔥 auto-create repo & branch

  const detected = await fileTypeFromBuffer(buffer);
  const ext = detected?.ext || 'bin';
  const baseName = Date.now() + '-' + Math.random().toString(36).substring(2, 10);
  const fileName = `${baseName}.${ext}`;
  const filePath = `uploads/${fileName}`;
  const base64 = buffer.toString('base64');

  const response = await axios.put(
    `https://api.github.com/repos/${GITHUB_OWNER}/${REPO}/contents/${filePath}`,
    {
      message: `Upload: ${fileName}`,
      content: base64,
      branch: BRANCH
    },
    { headers }
  );

  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${REPO}/${BRANCH}/${filePath}`;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GITHUB_TOKEN is not configured' });
  }

  const form = formidable({
    maxFileSize: 4.5 * 1024 * 1024,
    keepExtensions: true,
    allowEmptyFiles: false,
    multiples: false,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(400).json({ error: 'Parse error: ' + err.message });
    }

    const fileArray = files.file;
    if (!fileArray || !Array.isArray(fileArray) || fileArray.length === 0) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = fileArray[0];
    if (!file?.filepath) {
      return res.status(400).json({ error: 'Invalid file' });
    }

    try {
      const fs = require('fs').promises;
      const buffer = await fs.readFile(file.filepath);
      if (buffer.length === 0) {
        return res.status(400).json({ error: 'File is empty' });
      }

      const url = await uploadToGitHub(buffer);
      res.status(200).json({ url });
    } catch (uploadErr) {
      console.error('❌ Upload error:', uploadErr.response?.data || uploadErr.message);
      const msg = uploadErr.response?.data?.message || uploadErr.message || 'Upload failed';
      res.status(500).json({ error: `GitHub: ${msg}` });
    } finally {
      if (file.filepath) {
        require('fs').unlinkSync(file.filepath);
      }
    }
  });
}
