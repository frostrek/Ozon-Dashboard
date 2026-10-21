'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SyncStatusTracker() {
    const [status, setStatus] = useState('checking'); // checking, live, syncing, outdated
    const [lastSync, setLastSync] = useState(null);
    const [age, setAge] = useState(null);
    const statusRef = useRef('checking');
    const router = useRouter();

    const checkStatus = async () => {
        try {
            const res = await fetch('/api/sync/status', { cache: 'no-store' });
            const data = await res.json();

            setLastSync(data.lastSync);
            setAge(data.ageMinutes);

            if (data.isSyncing) {
                statusRef.current = 'syncing';
                setStatus('syncing');
            } else if (data.ageMinutes === null || data.ageMinutes > 5) {
                statusRef.current = 'outdated';
                setStatus('outdated');
            } else {
                if (statusRef.current === 'syncing') router.refresh();
                statusRef.current = 'live';
                setStatus('live');
            }
        } catch (e) {
            console.error(e);
            setStatus('outdated');
        }
    };

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 60000);
        return () => clearInterval(interval);
    }, []);

    let indicatorColor = '#F59E0B';
    let statusText = 'Syncing...';

    if (status === 'live') { indicatorColor = '#10B981'; statusText = 'Live'; }
    if (status === 'outdated') { indicatorColor = '#D97706'; statusText = 'Needs a run'; }
    if (status === 'checking') { indicatorColor = '#94A3B8'; statusText = 'Checking...'; }

    const stale = status === 'outdated';
    let detail = 'Checking the last successful run';
    if (status === 'syncing') detail = 'A pipeline is running';
    if (status === 'live' && lastSync) {
        detail = `Last success ${new Date(lastSync).toLocaleString('en-IN')}${age !== null ? ` · ${age} min` : ''}`;
    }
    if (status === 'outdated') {
        detail = lastSync
            ? `Last success ${age} min ago`
            : 'No successful sync yet';
    }

    return (
        <div className="sync-bar" aria-live="polite">
            <div className={`sync-pill sync-pill-${status}`}>
                <span className="sync-dot" style={{ background: indicatorColor }} />
                <span>{statusText}</span>
                <span className="sync-sep" aria-hidden="true" />
                <span className="sync-meta">{detail}</span>
                {stale && (
                    <Link className="sync-action" href="/pipeline">Run pipeline</Link>
                )}
            </div>
        </div>
    );
}
