import { Router, Request, Response } from 'express';
import { urlService, FRONTEND_ROUTES } from '../services/url.service';
import logger from '../utils/logger';

const router = Router();

// Pass frontend routes through to SPA fallback
router.use('/:shortCode', (req, res, next) => {
  const { shortCode } = req.params;
  if (FRONTEND_ROUTES.has(shortCode.toLowerCase())) {
    next('router');
    return;
  }
  next();
});

// Password verification endpoint — POST /:shortCode/verify
router.post('/:shortCode/verify', async (req: Request, res: Response) => {
  try {
    const { shortCode } = req.params;
    if (!shortCode || shortCode.length > 50) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const { password } = req.body || {};
    if (!password) {
      res.status(400).json({ error: 'Password required' });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const referer = ((req.headers['referer'] || req.headers['referrer'] || '') as string);

    const result = await urlService.getLongUrl(shortCode, ipAddress, userAgent, referer, password);

    if (!result) {
      res.status(404).json({ error: 'Link not found or expired' });
      return;
    }
    if ('wrongPassword' in result && result.wrongPassword) {
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }
    if ('requiresPassword' in result && result.requiresPassword) {
      res.status(401).json({ error: 'Password required' });
      return;
    }
    if ('longUrl' in result) {
      res.json({ longUrl: result.longUrl });
      return;
    }
    res.status(404).json({ error: 'Link not found' });
  } catch (err) {
    logger.error({ err, shortCode: req.params.shortCode }, 'Password verify failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:shortCode', async (req: Request, res: Response) => {
  try {
    const { shortCode } = req.params;
    if (!shortCode || shortCode.length > 50) {
      res.status(404).send(notFoundHtml('Link Not Found', 'This shortened URL does not exist.'));
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const referer = ((req.headers['referer'] || req.headers['referrer'] || '') as string);

    const result = await urlService.getLongUrl(shortCode, ipAddress, userAgent, referer);

    if (!result) {
      res.status(404).send(notFoundHtml('Link Not Found', 'This shortened URL doesn\'t exist or has expired.'));
      return;
    }

    if ('requiresPassword' in result && result.requiresPassword) {
      res.status(200).send(passwordFormHtml(shortCode));
      return;
    }

    if ('longUrl' in result) {
      res.redirect(302, result.longUrl);
      return;
    }

    res.status(404).send(notFoundHtml('Link Not Found', 'This shortened URL doesn\'t exist or has expired.'));
  } catch (err) {
    logger.error({ err, shortCode: req.params.shortCode }, 'Redirect failed');
    res.status(500).send(notFoundHtml('Server Error', 'Something went wrong. Please try again later.'));
  }
});

function notFoundHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 48px; text-align: center;
            box-shadow: 0 4px 24px rgba(0,0,0,0.1); max-width: 420px; width: 90%; }
    h1 { color: #1a1a2e; font-size: 1.8rem; margin-bottom: 12px; }
    p { color: #666; margin-bottom: 24px; line-height: 1.6; }
    a { display: inline-block; padding: 12px 28px; background: #e94560; color: #fff;
        border-radius: 8px; text-decoration: none; font-weight: 600; }
    a:hover { background: #c73651; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔗 ${title}</h1>
    <p>${message}</p>
    <a href="/">Go to Homepage</a>
  </div>
</body>
</html>`;
}

function passwordFormHtml(shortCode: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Protected Link</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 48px; text-align: center;
            box-shadow: 0 4px 24px rgba(0,0,0,0.1); max-width: 420px; width: 90%; }
    h1 { color: #1a1a2e; font-size: 1.5rem; margin-bottom: 8px; }
    p { color: #666; margin-bottom: 24px; }
    input { width: 100%; padding: 12px 16px; font-size: 1rem; border: 1px solid #ddd;
            border-radius: 8px; margin-bottom: 16px; outline: none; }
    input:focus { border-color: #e94560; }
    button { width: 100%; padding: 12px; background: #e94560; color: #fff; border: none;
             border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #c73651; }
    .error { color: #e94560; margin-bottom: 12px; font-size: 0.9rem; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔒 Password Protected</h1>
    <p>This link is password protected. Enter the password to continue.</p>
    <div class="error" id="err"></div>
    <input type="password" id="pw" placeholder="Enter password" autofocus />
    <button onclick="submit()">Continue</button>
  </div>
  <script>
    document.getElementById('pw').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') submit();
    });
    async function submit() {
      const pw = document.getElementById('pw').value;
      const err = document.getElementById('err');
      if (!pw) { err.textContent = 'Please enter the password'; err.style.display = 'block'; return; }
      try {
        const res = await fetch('/${shortCode}/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw }),
          credentials: 'include'
        });
        const data = await res.json();
        if (res.ok && data.longUrl) {
          window.location.href = data.longUrl;
        } else {
          err.textContent = data.error || 'Incorrect password';
          err.style.display = 'block';
          document.getElementById('pw').value = '';
          document.getElementById('pw').focus();
        }
      } catch {
        err.textContent = 'Something went wrong. Please try again.';
        err.style.display = 'block';
      }
    }
  </script>
</body>
</html>`;
}

export default router;
