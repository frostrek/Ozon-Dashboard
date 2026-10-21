import { execFile } from 'child_process';

export function killProcessTree(pid) {
  if (!pid) return Promise.resolve();

  if (process.platform === 'win32') {
    return new Promise((resolve, reject) => {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], (err, _stdout, stderr) => {
        if (!err) return resolve();
        const text = `${err.message || ''} ${stderr || ''}`;
        if (err.code === 128 || /not found/i.test(text)) return resolve();
        reject(err);
      });
    });
  }

  const id = Number(pid);
  try {
    process.kill(-id, 'SIGKILL');
  } catch (err) {
    if (err.code === 'ESRCH') return Promise.resolve();
    try {
      process.kill(id, 'SIGKILL');
    } catch (inner) {
      if (inner.code !== 'ESRCH') return Promise.reject(inner);
    }
  }
  return Promise.resolve();
}
