function textOf(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error.error || '');
}

export function explainError(error, kind = 'page') {
  const raw = textOf(error);
  const digest = error?.digest ? String(error.digest) : '';
  const hidden = /Server Components render|omitted in production|digest property/i.test(raw);

  if (kind === 'no-account') {
    return {
      title: 'No seller account yet',
      what: 'This screen needs an Ozon seller account. None has been added on this dashboard.',
      cause: 'Products, orders, and catalog runs are loaded from a connected Ozon shop. Until an account is added, there is nothing to show.',
      steps: [
        'Open Accounts in the left menu.',
        'Click Add account and paste the shop name, Client ID, and API key from Ozon Seller.',
        'Come back to this page. Then use Sync from Ozon if you want the product list.',
      ],
      code: '',
      actionHref: '/accounts',
      actionLabel: 'Go to Accounts',
    };
  }

  if (kind === 'not-found') {
    return {
      title: 'This page is not here',
      what: 'The link you opened does not match a screen in the Ozon dashboard.',
      cause: 'The address may be typed wrong, or the item was removed.',
      steps: [
        'Go back to Dashboard and open the screen from the left menu.',
        'If you were opening a product or catalog run, return to the list and click it again.',
        'If the link came from an old email or chat, ask the team for a new one.',
      ],
      code: '',
    };
  }

  if (/P1001|Can't reach|ECONNREFUSED|mongodb|DATABASE_URL|timed out|timeout/i.test(raw)) {
    return {
      title: 'The database did not answer',
      what: 'This screen needs the product and order database. That connection did not complete.',
      cause: 'MongoDB is slow, restarting, or the dashboard is not pointed at the right database.',
      steps: [
        'Click Try again after about 30 seconds.',
        'If every screen fails, tell the team the database connection is down.',
        'Do not keep clicking over and over — wait, then try once more.',
      ],
      code: digest,
    };
  }

  if (/429|too many requests|rate limit|too frequently/i.test(raw)) {
    return {
      title: 'Ozon asked us to slow down',
      what: 'Ozon only accepts a limited number of requests in a short time.',
      cause: 'This account sent updates too close together, or several people used the same seller account at once.',
      steps: [
        'Wait one minute.',
        'Click Try again, or save your change once more.',
        'Avoid pressing Save and push repeatedly on the same product.',
      ],
      code: digest,
    };
  }

  if (/unauthorized|401|403|api-key|api key|expired/i.test(raw)) {
    return {
      title: 'Ozon did not accept the seller login',
      what: 'The dashboard reached Ozon, but this account’s key was refused.',
      cause: 'The Client ID or API key on Accounts is wrong, expired, or belongs to another shop.',
      steps: [
        'Open Accounts in the left menu.',
        'Paste a fresh API key from Ozon Seller and save.',
        'Open this page again.',
      ],
      code: digest,
    };
  }

  if (/plain objects|null prototypes|Client Components from Server/i.test(raw)) {
    return {
      title: 'This screen could not open',
      what: 'The dashboard tried to show this list, but the data was not in a form the page can display.',
      cause: 'This usually happens when no Ozon seller account is connected, or the product list could not be prepared after a deploy.',
      steps: [
        'Open Accounts and add a seller account if the list is empty.',
        'Click Try again.',
        'If an account is already there, wait a minute and open Products again.',
      ],
      code: digest,
      actionHref: '/accounts',
      actionLabel: 'Go to Accounts',
    };
  }

  if (hidden || !raw.trim()) {
    return {
      title: 'This page could not be shown',
      what: 'The menu loaded, but this screen stopped before it could draw the list or form.',
      cause: 'Most often the database is busy, or this screen hit a problem after a new deploy.',
      steps: [
        'Click Try again.',
        'Wait about 30 seconds and open the same menu item once more.',
        'If it still fails, go to Dashboard and try a different screen.',
        'Send the support code below to the team. They can match it to the server log.',
      ],
      code: digest,
    };
  }

  return {
    title: 'This page could not finish',
    what: 'Something on this screen failed while loading or saving.',
    cause: raw.slice(0, 280),
    steps: [
      'Click Try again.',
      'If you were saving, check the form and try once more.',
      'If it keeps happening, send the support code (or this message) to the team.',
    ],
    code: digest,
  };
}
