document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  if (!file) return;

  const errorDiv = document.getElementById('error');
  const resultDiv = document.getElementById('result');
  const progressDiv = document.getElementById('progress');
  const uploadBtn = document.getElementById('uploadBtn');
  const progressEl = document.querySelector('progress');
  const progressText = document.getElementById('progressText');

  // Reset UI
  errorDiv.style.display = 'none';
  resultDiv.style.display = 'none';
  progressDiv.style.display = 'block';
  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressEl.value = percent;
        progressText.textContent = `${percent}%`;
      }
    };

    xhr.onload = () => {
      progressDiv.style.display = 'none';
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload';

      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        document.getElementById('linkOutput').value = data.url;
        document.getElementById('directLink').href = data.url;
        document.getElementById('directLink').textContent = 'Lihat file di browser';
        resultDiv.style.display = 'block';
      } else {
        const err = JSON.parse(xhr.responseText);
        errorDiv.textContent = err.error || 'Upload gagal';
        errorDiv.style.display = 'block';
      }
    };

    xhr.onerror = () => {
      progressDiv.style.display = 'none';
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload';
      errorDiv.textContent = 'Gagal menghubungi server';
      errorDiv.style.display = 'block';
    };

    xhr.send(formData);
  } catch (err) {
    progressDiv.style.display = 'none';
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload';
    errorDiv.textContent = err.message;
    errorDiv.style.display = 'block';
  }
});

document.getElementById('copyBtn').addEventListener('click', () => {
  const input = document.getElementById('linkOutput');
  input.select();
  document.execCommand('copy');
  alert('✅ Link disalin!');
});
