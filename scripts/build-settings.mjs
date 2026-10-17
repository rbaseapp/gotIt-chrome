const targets = {
  production: {
    coreApiBase: 'https://rbase-core-api.onrender.com/api/v1',
    gotitApiBase: 'https://gotit-backend.onrender.com/api/v1',
    webAppBase: 'https://gotit.rbaseapp.com'
  },
  dev: {
    coreApiBase: 'https://rbase-dev-core-platforms.onrender.com/api/v1',
    gotitApiBase: 'https://gotit-dev-backend.onrender.com/api/v1',
    webAppBase: 'https://gotit-dev.rbaseapp.com'
  },
  local: {
    coreApiBase: 'http://localhost:8080/api/v1',
    gotitApiBase: 'http://localhost:3001/api/v1',
    webAppBase: 'http://localhost:5173'
  }
};

export function buildSettings(env) {
  const target = env.BUILD_TARGET || (env.BUILD_MODE === 'development' ? 'local' : 'production');
  if (!Object.hasOwn(targets, target)) throw new Error('Unknown BUILD_TARGET');
  if (env.WEBSTORE_PACKAGE === '1' && target !== 'production') {
    throw new Error('Web Store packages require the production target');
  }
  const defaults = targets[target];
  const settings = {
    target,
    mode: target === 'production' ? 'production' : 'development',
    coreApiBase: env.CORE_API_BASE || defaults.coreApiBase,
    gotitApiBase: env.GOTIT_API_BASE || defaults.gotitApiBase,
    webAppBase: env.WEB_APP_BASE || defaults.webAppBase
  };
  for (const key of ['coreApiBase', 'gotitApiBase', 'webAppBase']) {
    const url = new URL(settings[key]);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error(`Invalid public URL: ${key}`);
    }
    settings[key] = url.href.replace(/\/$/u, '');
    // A stale production override must never silently contaminate a DEV package.
    if (target === 'dev' && settings[key] !== defaults[key]) {
      throw new Error(`DEV target requires the DEV ${key}`);
    }
  }
  return settings;
}
