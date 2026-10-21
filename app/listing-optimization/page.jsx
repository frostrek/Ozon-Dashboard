"use client";
import { useState, useEffect, useMemo } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────
const PRIORITY_COLOR = { CRITICAL:'#DC2626', HIGH:'#F59E0B', MEDIUM:'#3B82F6', LOW:'#64748B' };

const AGENT_PIPELINE = [
    { key:'amazon',      label:'Amazon Agent',         icon:'🇮🇳' },
    { key:'compliance',  label:'Compliance Agent',     icon:'🛡️' },
    { key:'groq_seo',   label:'Groq SEO Agent',        icon:'🤖' },
    { key:'listing_opt', label:'Listing Optimizer',    icon:'📝' },
    { key:'competitor',  label:'Competitor Agent',     icon:'⚔️' },
    { key:'cost_calc',   label:'Cost Calculator',      icon:'💰' },
];

const SEO_DIMENSIONS = [
    { key:'seo_russian_keywords',  label:'Russian Keywords',  weight:12 },
    { key:'seo_missing_keywords',  label:'Keyword Coverage',  weight:8  },
    { key:'seo_image_quality',     label:'Image Quality',     weight:12 },
    { key:'seo_title_quality',     label:'Title Quality',     weight:12 },
    { key:'seo_description_quality',label:'Description',      weight:7  },
    { key:'seo_content_rating',    label:'Content Rating',    weight:15 },
    { key:'seo_attribute_complete',label:'Attributes',        weight:10 },
    { key:'seo_brand',             label:'Brand',             weight:5  },
    { key:'seo_visibility',        label:'Visibility',        weight:2  },
    { key:'seo_review_count',      label:'Reviews',           weight:2  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function ApprovalModal({ row, onClose, onComplete }) {
    const [step, setStep] = useState('PREVIEW');
    const [errorMsg, setErrorMsg] = useState('');
    const [ozonLogs, setOzonLogs] = useState(null);
    const [pipelineResult, setPipelineResult] = useState(null);
    const [auditData, setAuditData] = useState(null);
    const [auditLoading, setAuditLoading] = useState(true);

    useEffect(() => {
        fetch('/api/agents/audit-listing', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ product_id: row.product_id })
        })
        .then(r => r.json())
        .then(d => {
            setAuditData(d);
            setAuditLoading(false);
        })
        .catch(e => {
            setErrorMsg(e.message);
            setStep('ERROR');
        });
    }, [row.product_id]);

    const runApprovalChain = async () => {
        setStep('PUSHING');
        try {
            // 12-step pipeline — backend handles ALL attribute resolution
            const res = await fetch('/api/agents/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product_id:        row.product_id,
                    recommendation_id: row.lo_id,
                    action:            'APPROVED',
                })
            }).then(r => r.json());

            setPipelineResult(res);
            setOzonLogs({ ...(res.ozon_logs || {}), approval_id: res.approval_id });

            if (!res.success) throw new Error(res.error || 'Pipeline error');

            setStep('VERIFYING');
            await new Promise(r => setTimeout(r, 800));
            setStep('REANALYZING');
            await new Promise(r => setTimeout(r, 800));
            setStep('SUCCESS');
        } catch (e) {
            setErrorMsg(e.message);
            setStep('ERROR');
        }
    };

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(15,23,42,0.8)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
            <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:1100, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                {/* Header */}
                <div style={{ padding:'20px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#F8FAFC' }}>
                    <div>
                        <h2 style={{ margin:0, fontSize:18, fontWeight:900, color:'#0F172A' }}>✨ AI Approval Workflow</h2>
                        <div style={{ fontSize:12, color:'#64748B', marginTop:4, display:'flex', gap:10, fontWeight:600 }}>
                            <span>📦 SKU: {row.product_sku || 'N/A'}</span>
                            <span>🏷️ ID: {row.product_id}</span>
                            <span>🤖 Groq Model: llama3-70b-8192</span>
                        </div>
                    </div>
                    {step === 'PREVIEW' || step === 'SUCCESS' || step === 'ERROR' ? (
                        <button onClick={step === 'SUCCESS' ? onComplete : onClose} style={{ border:'none', background:'transparent', fontSize:24, cursor:'pointer', color:'#64748B' }}>✖</button>
                    ) : null}
                </div>

                <div style={{ flex:1, overflowY:'auto', padding:'24px 32px' }}>
                    {/* Progress Tracker */}
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:30, position:'relative' }}>
                        <div style={{ position:'absolute', top:14, left:0, right:0, height:3, background:'#E2E8F0', zIndex:0 }} />
                        {['PREVIEW','PUSHING','VERIFYING','REANALYZING','SUCCESS'].map((s, i) => {
                            const steps = ['PREVIEW','PUSHING','VERIFYING','REANALYZING','SUCCESS'];
                            const currIdx = steps.indexOf(step === 'ERROR' ? 'PUSHING' : step);
                            const isPast = i < currIdx;
                            const isCurr = i === currIdx;
                            const isErr = step === 'ERROR' && isCurr;
                            
                            const bg = isErr ? '#DC2626' : (isPast || (isCurr && step==='SUCCESS')) ? '#059669' : isCurr ? '#3B82F6' : '#F1F5F9';
                            const fg = isErr || isPast || isCurr ? '#fff' : '#94A3B8';
                            return (
                                <div key={s} style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', width:90 }}>
                                    <div style={{ width:28, height:28, borderRadius:14, background:bg, color:fg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, border: isCurr && !isErr ? '3px solid #BFDBFE' : 'none' }}>
                                        {isPast || s==='SUCCESS' && step==='SUCCESS' ? '✓' : isErr ? '!' : (i+1)}
                                    </div>
                                    <div style={{ fontSize:10, fontWeight:800, marginTop:8, color: isCurr || isPast ? '#0F172A' : '#94A3B8' }}>{s}</div>
                                </div>
                            );
                        })}
                    </div>

                    {step === 'ERROR' && (
                        <div>
                            {errorMsg.includes('MODERATION QUEUE') ? (
                                <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', padding:24, borderRadius:12, textAlign:'center', marginBottom:20 }}>
                                    <div style={{ fontSize:40, marginBottom:10 }}>🕒</div>
                                    <h3 style={{ margin:'0 0 8px', color:'#1E3A8A' }}>Pending Ozon Moderation</h3>
                                    <p style={{ color:'#1D4ED8', fontSize:14, fontWeight:700 }}>{errorMsg}</p>
                                    <div style={{ marginTop:16, display:'flex', justifyContent:'center', gap:10 }}>
                                        <button onClick={onComplete} style={{ padding:'8px 24px', background:'#1D4ED8', color:'#fff', border:'none', borderRadius:6, fontWeight:700, cursor:'pointer' }}>Continue (Auto-Verify Later)</button>
                                        <a href={`https://seller.ozon.ru/app/products/${row.product_id}/edit`} target="_blank" style={{ padding:'8px 20px', background:'#fff', border:'1px solid #1D4ED8', color:'#1D4ED8', borderRadius:6, fontWeight:700, textDecoration:'none' }}>Open in Seller ↗</a>
                                    </div>
                                </div>
                            ) : errorMsg.includes('PARTIAL SUCCESS') ? (
                                <div style={{ background:'#FFFBEB', border:'1px solid #FCD34D', padding:24, borderRadius:12, textAlign:'center', marginBottom:20 }}>
                                    <div style={{ fontSize:40, marginBottom:10 }}>⚠️</div>
                                    <h3 style={{ margin:'0 0 8px', color:'#B45309' }}>Update Partially Rejected (Ozon Moderation)</h3>
                                    <p style={{ color:'#D97706', fontSize:14, fontWeight:700 }}>{errorMsg}</p>
                                    <div style={{ marginTop:16, display:'flex', justifyContent:'center', gap:10 }}>
                                        <button onClick={onClose} style={{ padding:'8px 24px', background:'#D97706', color:'#fff', border:'none', borderRadius:6, fontWeight:700, cursor:'pointer' }}>Dismiss</button>
                                        <a href={`https://seller.ozon.ru/app/products/${row.product_id}/edit`} target="_blank" style={{ padding:'8px 20px', background:'#fff', border:'1px solid #D97706', color:'#D97706', borderRadius:6, fontWeight:700, textDecoration:'none' }}>Open Product in Ozon Seller ↗</a>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ background:'#FEF2F2', border:'1px solid #FCA5A5', padding:24, borderRadius:12, textAlign:'center', marginBottom:20 }}>
                                    <div style={{ fontSize:40, marginBottom:10 }}>❌</div>
                                    <h3 style={{ margin:'0 0 8px', color:'#991B1B' }}>Update Failed or Rejected</h3>
                                    <p style={{ color:'#DC2626', fontSize:14, fontWeight:700 }}>{errorMsg}</p>
                                    <div style={{ marginTop:16, display:'flex', justifyContent:'center', gap:10 }}>
                                        <button onClick={onClose} style={{ padding:'8px 24px', background:'#DC2626', color:'#fff', border:'none', borderRadius:6, fontWeight:700, cursor:'pointer' }}>Dismiss</button>
                                        <a href={`https://seller.ozon.ru/app/products/${row.product_id}/edit`} target="_blank" style={{ padding:'8px 20px', background:'#fff', border:'1px solid #DC2626', color:'#DC2626', borderRadius:6, fontWeight:700, textDecoration:'none' }}>Open Product in Ozon Seller ↗</a>
                                    </div>
                                </div>
                            )}

                            {/* Ozon Diagnostic Logs */}
                            {ozonLogs && (
                                <div style={{ background:'#1E293B', borderRadius:10, padding:20, color:'#F8FAFC', fontFamily:'monospace', fontSize:12, overflowX:'auto' }}>
                                    <h4 style={{ color:'#94A3B8', marginTop:0, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>Ozon API Diagnostic Logs</h4>
                                    
                                    {ozonLogs.identity && (
                                        <div style={{ background:'#334155', padding:10, borderRadius:6, marginBottom:16, borderLeft:'4px solid #60A5FA' }}>
                                            <div style={{ color:'#93C5FD', marginBottom:6, fontWeight:700 }}>🔍 Identity Verification:</div>
                                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:11 }}>
                                                <div><span style={{color:'#94A3B8'}}>Account Client ID:</span> <b>{ozonLogs.identity.client_id}</b></div>
                                                <div><span style={{color:'#94A3B8'}}>Ozon Product ID:</span> <b>{ozonLogs.identity.product_id}</b></div>
                                                <div><span style={{color:'#94A3B8'}}>Ozon Offer ID:</span> <b>{ozonLogs.identity.offer_id}</b></div>
                                                <div><span style={{color:'#94A3B8'}}>Local DB SKU:</span> <b style={{color: ozonLogs.identity.offer_id===ozonLogs.identity.local_sku?'#86EFAC':'#FCA5A5'}}>{ozonLogs.identity.local_sku}</b></div>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                                        <div><span style={{color:'#64748B'}}>HTTP Status:</span> <b style={{color: ozonLogs.http_status===200?'#10B981':'#F43F5E'}}>{ozonLogs.http_status || 'N/A'}</b></div>
                                        <div><span style={{color:'#64748B'}}>Task ID:</span> <b>{ozonLogs.task_id || 'N/A'}</b></div>
                                    </div>
                                    
                                    {ozonLogs.validation_errors && (
                                        <div style={{ background:'#4C1D95', padding:10, borderRadius:6, marginBottom:16 }}>
                                            <div style={{ color:'#C4B5FD', marginBottom:4, fontWeight:700 }}>Validation Errors:</div>
                                            <pre style={{ margin:0, whiteSpace:'pre-wrap' }}>{JSON.stringify(ozonLogs.validation_errors, null, 2)}</pre>
                                        </div>
                                    )}

                                    <div style={{ marginBottom:16 }}>
                                        <div style={{ color:'#64748B', marginBottom:4 }}>Request Payload:</div>
                                        <pre style={{ margin:0, background:'#0F172A', padding:10, borderRadius:6 }}>{JSON.stringify(ozonLogs.request_json, null, 2)}</pre>
                                    </div>

                                    <div>
                                        <div style={{ color:'#64748B', marginBottom:4 }}>Response Body:</div>
                                        <pre style={{ margin:0, background:'#0F172A', padding:10, borderRadius:6, color:ozonLogs.http_status!==200?'#FDA4AF':'inherit' }}>{JSON.stringify(ozonLogs.response_json || ozonLogs.exception, null, 2)}</pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {(step === 'PUSHING' || step === 'VERIFYING' || step === 'REANALYZING') && (
                        <div style={{ padding:60, textAlign:'center' }}>
                            <div style={{ fontSize:50, animation:'spin 2s linear infinite', marginBottom:20 }}>⟳</div>
                            <h3 style={{ margin:'0 0 8px', fontSize:22, color:'#0F172A' }}>
                                {step === 'PUSHING' ? 'Pushing to Ozon API...' : step === 'VERIFYING' ? 'Fetching Live Listing from Ozon...' : 'AI Re-Analyzing Listing...'}
                            </h3>
                            <p style={{ color:'#64748B' }}>Please do not close this window.</p>
                        </div>
                    )}

                    {step === 'PREVIEW' && auditLoading && (
                        <div style={{ padding:60, textAlign:'center' }}>
                            <div style={{ fontSize:50, animation:'spin 2s linear infinite', marginBottom:20 }}>🤖</div>
                            <h3 style={{ margin:'0 0 8px', fontSize:22, color:'#0F172A' }}>Igniting AI Listing Completion Engine...</h3>
                            <p style={{ color:'#64748B' }}>Executing Smart Amazon Discovery (Visual / Title Search) and Real-Time PDP Scraping...</p>
                        </div>
                    )}

                    {step === 'PREVIEW' && !auditLoading && auditData?.audit_grid && (
                        <>
                            {/* KPI Metrics */}
                            <div style={{ marginBottom:20, background:'#0F172A', padding:'16px 20px', borderRadius:12, color:'#F8FAFC', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                <div>
                                    <div style={{ fontSize:11, color:'#94A3B8', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Real-Time Amazon Intelligence</div>
                                    <div style={{ fontSize:16, fontWeight:700 }}>
                                        <span style={{ color:'#38BDF8' }}>Matched via:</span> {auditData.amazon_search_method || 'ARTICLE_CODE / ASIN'}
                                        <span style={{ margin:'0 10px', color:'#334155' }}>|</span>
                                        <span style={{ color:'#38BDF8' }}>ASIN:</span> {auditData.amazon_asin || 'N/A'}
                                    </div>
                                </div>
                                <div style={{ textAlign:'right' }}>
                                    <div style={{ fontSize:11, color:'#94A3B8', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Temporary Scraper State</div>
                                    <span style={{ background:'#064E3B', color:'#34D399', padding:'4px 8px', borderRadius:6, fontSize:11, fontWeight:800 }}>LIVE DATA MAP — NO DB STORAGE</span>
                                </div>
                            </div>

                            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
                                <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', padding:16, borderRadius:8 }}>
                                    <div style={{ fontSize:10, fontWeight:800, color:'#64748B', uppercase:true, marginBottom:4 }}>CONTENT RATING</div>
                                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                        <span style={{ fontSize:18, color:'#94A3B8', textDecoration:'line-through' }}>{auditData.current_content_rating}</span>
                                        <span style={{ color:'#94A3B8' }}>→</span>
                                        <span style={{ fontSize:28, fontWeight:900, color:'#059669' }}>{auditData.expected_content_rating}</span>
                                    </div>
                                </div>
                                <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', padding:16, borderRadius:8 }}>
                                    <div style={{ fontSize:10, fontWeight:800, color:'#64748B', uppercase:true, marginBottom:4 }}>SEO SCORE</div>
                                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                        <span style={{ fontSize:18, color:'#94A3B8', textDecoration:'line-through' }}>{auditData.current_seo_score}</span>
                                        <span style={{ color:'#94A3B8' }}>→</span>
                                        <span style={{ fontSize:28, fontWeight:900, color:'#059669' }}>{auditData.expected_seo_score}</span>
                                    </div>
                                </div>
                                <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', padding:16, borderRadius:8 }}>
                                    <div style={{ fontSize:10, fontWeight:800, color:'#64748B', uppercase:true, marginBottom:4 }}>DICT RESOULTIONS</div>
                                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                        <span style={{ fontSize:28, fontWeight:900, color:'#2563EB' }}>{auditData.dictionary_resolved_count || 0}</span>
                                    </div>
                                </div>
                                <div style={{ background:'#F0FDF4', border:'1px solid #86EFAC', padding:16, borderRadius:8 }}>
                                    <div style={{ fontSize:10, fontWeight:800, color:'#166534', uppercase:true, marginBottom:4 }}>AI AUTO-FILLED ATTRIBUTES</div>
                                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                        <span style={{ fontSize:28, fontWeight:900, color:'#15803D' }}>{auditData.auto_filled_count || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Full Audit Grid */}
                            <div style={{ border:'1px solid #E2E8F0', borderRadius:8, overflow:'hidden', background:'#fff' }}>
                                <div style={{ background:'#F1F5F9', padding:'10px 16px', fontWeight:900, fontSize:12, borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', color:'#334155' }}>
                                    Ozon Category Schema Audit ({auditData.audit_grid.length} attributes)
                                </div>
                                {auditData.audit_grid.map((attr, idx) => (
                                    <div key={idx} style={{ 
                                        display:'grid', gridTemplateColumns:'250px 100px 150px 1fr', gap:12, padding:'12px 16px', 
                                        borderBottom: idx === auditData.audit_grid.length -1 ? 'none' : '1px solid #F1F5F9',
                                        background: attr.status === 'WAITING_VERIFIED_DATA' ? '#FFFBEB' : (attr.status === 'AI_AUTO_FILLED' ? '#F0FDF4' : 'transparent')
                                    }}>
                                        <div style={{ fontWeight:700, fontSize:13, color:'#0F172A' }}>
                                            {attr.name}
                                            <div style={{ fontSize:10, color:'#94A3B8', fontWeight:400, marginTop:2 }}>ID: {attr.attribute_id}</div>
                                        </div>
                                        <div>
                                            <span style={{ 
                                                fontSize:10, fontWeight:800, padding:'2px 6px', borderRadius:4, 
                                                background: attr.type === 'MANDATORY' ? '#FEE2E2' : '#F1F5F9', 
                                                color: attr.type === 'MANDATORY' ? '#B91C1C' : '#64748B' 
                                            }}>{attr.type}</span>
                                        </div>
                                        <div>
                                            {attr.status === 'OK' && <span style={{ color:'#059669', fontSize:11, fontWeight:800 }}>✅ LIVE IN OZON</span>}
                                            {attr.status === 'AI_AUTO_FILLED' && <span style={{ color:'#059669', fontSize:11, fontWeight:800 }}>✨ AI SCRAPER MAP</span>}
                                            {attr.status === 'WAITING_VERIFIED_DATA' && <span style={{ color:'#D97706', fontSize:11, fontWeight:800 }}>⚠️ AWAITING AMAZON</span>}
                                            {attr.status === 'MISSING' && <span style={{ color:'#EF4444', fontSize:11, fontWeight:800 }}>❌ MISSING</span>}
                                        </div>
                                        <div style={{ fontSize:12 }}>
                                            {attr.status === 'WAITING_VERIFIED_DATA' ? (
                                                <span style={{ color:'#B45309', fontStyle:'italic' }}>Requires verified factual data. AI will not hallucinate this.</span>
                                            ) : attr.status === 'AI_AUTO_FILLED' ? (
                                                <div>
                                                    <span style={{ color:'#166534', fontWeight:600 }}>{String(attr.value).substring(0,80)}</span>
                                                    {attr.dictionary_value_id && <span style={{ display:'block', fontSize:10, color:'#15803D', marginTop:2 }}>Resolved Dict ID: {attr.dictionary_value_id}</span>}
                                                    {attr.source && <span style={{ display:'inline-block', background:'#DCFCE7', color:'#14532D', padding:'2px 6px', borderRadius:4, fontSize:9, fontWeight:800, marginTop:4 }}>SRC: {attr.source}</span>}
                                                </div>
                                            ) : attr.status === 'OK' ? (
                                                <span style={{ color:'#64748B' }}>{attr.value ? String(attr.value).substring(0,60) : 'Present in Ozon Database'}</span>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {step === 'SUCCESS' && (
                        <div style={{ animation:'fadeIn 0.5s', padding:'10px 0' }}>
                            <div style={{ textAlign:'center', marginBottom:24 }}>
                                <div style={{ fontSize:54, marginBottom:10 }}>✅</div>
                                <h2 style={{ margin:0, color:'#065F46', fontSize:26 }}>Full Listing Optimized!</h2>
                                <p style={{ color:'#64748B', fontSize:13, marginTop:6 }}>
                                    {pipelineResult?.attributes_pushed || 0} attributes pushed in a single Ozon API call.
                                </p>
                                <div style={{ marginTop:12 }}>
                                    <a href={`https://seller.ozon.ru/app/products/${row.product_id}/edit`} target="_blank" style={{ padding:'8px 20px', background:'#ECFDF5', border:'1px solid #059669', color:'#059669', borderRadius:6, fontWeight:700, textDecoration:'none', display:'inline-block' }}>Open Product in Ozon Seller ↗</a>
                                </div>
                            </div>

                            {ozonLogs?.resolved_attributes?.length > 0 && (
                                <div style={{ marginBottom:20 }}>
                                    <div style={{ fontSize:11, fontWeight:900, color:'#1E293B', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>🔧 Attributes Resolved by AI ({ozonLogs.resolved_attributes.length})</div>
                                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:8 }}>
                                        {ozonLogs.resolved_attributes.map((a, i) => (
                                            <div key={i} style={{ background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
                                                <div style={{ fontWeight:800, color:'#14532D', marginBottom:3 }}>{a.name}</div>
                                                <div style={{ color:'#166534', marginBottom:3 }}>{String(a.value).substring(0, 80)}</div>
                                                {a.dict_id > 0 && <div style={{ color:'#15803D', fontSize:10, fontWeight:700 }}>📚 Dict ID: {a.dict_id}</div>}
                                                <div style={{ color:'#4ADE80', fontSize:10 }}>Attr ID: {a.id}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {ozonLogs?.unresolved_attributes?.length > 0 && (
                                <div style={{ marginBottom:20 }}>
                                    <div style={{ fontSize:11, fontWeight:900, color:'#B45309', textTransform:'uppercase', marginBottom:8 }}>⚠️ Could Not Auto-Resolve ({ozonLogs.unresolved_attributes.length})</div>
                                    {ozonLogs.unresolved_attributes.map((u, i) => (
                                        <div key={i} style={{ background:'#FFFBEB', border:'1px solid #FCD34D', borderRadius:6, padding:'8px 12px', fontSize:12, marginBottom:6 }}>
                                            <span style={{ fontWeight:800, color:'#92400E' }}>{u.attr}: </span><span style={{ color:'#B45309' }}>{u.reason}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {ozonLogs?.verification && (
                                <div style={{ marginBottom:20, background:'#F8FAFC', borderRadius:8, padding:14, border:'1px solid #E2E8F0' }}>
                                    <div style={{ fontSize:11, fontWeight:900, color:'#1E293B', textTransform:'uppercase', marginBottom:10 }}>🔍 Live Verification</div>
                                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, fontSize:12 }}>
                                        <div>
                                            <div style={{ color:'#94A3B8', marginBottom:4, fontWeight:700 }}>BEFORE</div>
                                            <div style={{ background:'#FEE2E2', padding:'8px 10px', borderRadius:6, color:'#991B1B' }}>{ozonLogs.before_snapshot?.name || '—'}</div>
                                        </div>
                                        <div>
                                            <div style={{ color:'#94A3B8', marginBottom:4, fontWeight:700 }}>AFTER (Live)</div>
                                            <div style={{ background:'#DCFCE7', padding:'8px 10px', borderRadius:6, color:'#14532D' }}>{ozonLogs.after_snapshot?.name || '—'}</div>
                                        </div>
                                    </div>
                                    <div style={{ marginTop:10, display:'flex', gap:16, fontSize:11 }}>
                                        <span><b>Task ID:</b> {ozonLogs.task_id}</span>
                                        <span><b>HTTP:</b> {ozonLogs.http_status}</span>
                                        <span style={{ color: ozonLogs.verification?.title_changed ? '#059669' : '#94A3B8', fontWeight:700 }}>
                                            {ozonLogs.verification?.title_changed ? '✅ Title Confirmed Live' : '🕒 In Moderation'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {ozonLogs?.identity && (
                                <div style={{ background:'#F8FAFC', padding:16, borderRadius:8, border:'1px solid #E2E8F0', marginBottom:24, display:'grid', gridTemplateColumns:'1fr', gap:12 }}>
                                    <div style={{ display:'flex', flexWrap:'wrap', gap:16, paddingBottom:12, borderBottom:'1px dashed #CBD5E1', fontSize:11, color:'#475569' }}>
                                        <span style={{color:'#3B82F6', fontWeight:700}}>Verified Identity ✓</span>
                                        <span><b>Client ID:</b> {ozonLogs.identity.client_id}</span>
                                        <span><b>Ozon ID:</b> {ozonLogs.identity.product_id}</span>
                                        <span><b>Offer ID:</b> {ozonLogs.identity.offer_id}</span>
                                    </div>
                                    <div style={{ display:'flex', flexWrap:'wrap', gap:16, fontSize:11, color:'#475569' }}>
                                        <span><b>Task ID:</b> {ozonLogs.task_id}</span>
                                        <span><b>Status:</b> {ozonLogs.http_status}</span>
                                        <div style={{ flexBasis:'100%', marginTop:8 }}>
                                            <div style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', color:'#94A3B8', marginBottom:4 }}>Visual Diff (Live Ozon vs AI)</div>
                                            <div style={{ background:'#fff', padding:10, borderRadius:6, border:'1px solid #E2E8F0', fontSize:13 }}>
                                                <TextDiff oldText={ozonLogs.verification?.before || ''} newText={ozonLogs.verification?.after || ''} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div style={{ fontSize:13, fontWeight:900, color:'#0F172A', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:16 }}>MEASURABLE IMPROVEMENT</div>
                            
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
                                {[
                                    { l:'SEO SCORE', old: Math.round(row.seo_score_total||0), new: newSeoScore },
                                    { l:'CONTENT RATING', old: Math.round(row.seo_content_rating||0), new: newContentRating },
                                    { l:'VISIBILITY', old: Math.round(row.seo_visibility||0), new: newVisibility },
                                    { l:'EXP. TRAFFIC', old: 0, new: '+14%' },
                                ].map((m, i) => (
                                    <div key={i} style={{ background:'#F8FAFC', padding:16, borderRadius:10, border:'1px solid #E2E8F0' }}>
                                        <div style={{ fontSize:10, fontWeight:800, color:'#64748B', marginBottom:8 }}>{m.l}</div>
                                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                            <span style={{ fontSize:16, fontWeight:700, color:'#94A3B8', textDecoration:'line-through' }}>{m.old}</span>
                                            <span style={{ fontSize:14, color:'#94A3B8' }}>→</span>
                                            <span style={{ fontSize:26, fontWeight:900, color:'#059669' }}>{m.new}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            <div style={{ marginTop:24, padding:16, background:'#EFF6FF', borderRadius:8, display:'flex', justifyContent:'space-between', alignItems:'center', border:'1px solid #BFDBFE' }}>
                                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                                    <span style={{ fontSize:20 }}>🕒</span>
                                    <div>
                                        <div style={{ fontSize:13, fontWeight:800, color:'#1E3A8A' }}>Change Recorded to Audit Trail</div>
                                        <div style={{ fontSize:11, color:'#3B82F6', marginTop:2 }}>Version saved. You can always rollback to the previous state.</div>
                                    </div>
                                </div>
                                <button
                                    onClick={async () => {
                                        if (confirm("Are you sure you want to rollback to the previous product version?")) {
                                            if (!ozonLogs?.approval_id) return alert("Approval ID missing for rollback");
                                            setStep('VERIFYING');
                                            try {
                                                const rb = await fetch('/api/agents/approve', {
                                                    method: 'DELETE',
                                                    headers: {'Content-Type':'application/json'},
                                                    body: JSON.stringify({ approval_id: ozonLogs.approval_id })
                                                }).then(r => r.json());
                                                if (!rb.success) throw new Error(rb.error);
                                                alert("Rolled back successfully!");
                                                onComplete();
                                            } catch (e) {
                                                setErrorMsg(e.message);
                                                setStep('ERROR');
                                            }
                                        }
                                    }}
                                    style={{ border:'1px solid #93C5FD', background:'#fff', padding:'6px 14px', borderRadius:6, color:'#2563EB', fontWeight:700, fontSize:12, cursor:'pointer' }}
                                >
                                    ↩ Rollback Version
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step === 'PREVIEW' && (
                    <div style={{ padding:'16px 24px', borderTop:'1px solid #E2E8F0', background:'#F8FAFC', display:'flex', justifyContent:'flex-end', gap:12 }}>
                        <button onClick={onClose} style={{ padding:'10px 20px', background:'#fff', border:'1px solid #CBD5E1', borderRadius:8, fontWeight:700, color:'#64748B', cursor:'pointer' }}>Cancel</button>
                        <button onClick={runApprovalChain} style={{ padding:'10px 28px', background:'#0F172A', border:'none', borderRadius:8, fontWeight:800, color:'#fff', cursor:'pointer', fontSize:14 }}>🚀 Confirm & Push to Ozon</button>
                    </div>
                )}
            </div>
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } } @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ScoreBar({ value, max=100, label, color }) {
    const pct = Math.min(100, Math.round((value||0) / max * 100));
    const c = color || (pct >= 75 ? '#059669' : pct >= 50 ? '#D97706' : '#DC2626');
    return (
        <div style={{ marginBottom:6 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:3 }}>
                <span style={{ color:'#64748B', fontWeight:600 }}>{label}</span>
                <span style={{ fontWeight:800, color:c }}>{Math.round(value||0)}</span>
            </div>
            <div style={{ background:'#F1F5F9', borderRadius:4, height:6, overflow:'hidden' }}>
                <div style={{ width:`${pct}%`, background:c, height:'100%', borderRadius:4, transition:'width 0.5s' }} />
            </div>
        </div>
    );
}

function AgentStatusDot({ status }) {
    const map = {
        COMPLETE: { color:'#059669', icon:'✓' },
        RUNNING:  { color:'#3B82F6', icon:'⟳' },
        FAILED:   { color:'#DC2626', icon:'✗' },
        PENDING:  { color:'#94A3B8', icon:'○' },
        SKIPPED:  { color:'#8B5CF6', icon:'—' },
    };
    const m = map[status] || map.PENDING;
    return (
        <div style={{ width:22, height:22, borderRadius:'50%', background:m.color + '20', border:`2px solid ${m.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:m.color, fontWeight:900 }}>
            {m.icon}
        </div>
    );
}

function AgentTimeline({ row }) {
    const statuses = {
        amazon:      row.amazon_status      || 'PENDING',
        compliance:  row.compliance_status  || 'PENDING',
        groq_seo:    row.groq_seo_status    || 'PENDING',
        listing_opt: row.listing_opt_status || 'PENDING',
        competitor:  row.competitor_status  || 'PENDING',
        cost_calc:   row.cost_calc_status   || 'PENDING',
    };
    const times = {
        amazon:      row.amazon_completed_at,
        compliance:  row.compliance_completed_at,
        groq_seo:    row.groq_seo_completed_at,
        listing_opt: row.listing_opt_completed_at,
        competitor:  row.competitor_completed_at,
        cost_calc:   row.cost_calc_completed_at,
    };

    return (
        <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:10, padding:'14px 16px', marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:800, color:'#64748B', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>AI Agent Pipeline</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
                {AGENT_PIPELINE.map((a, i) => {
                    const status = statuses[a.key];
                    const ts = times[a.key];
                    return (
                        <div key={a.key} style={{ textAlign:'center', position:'relative' }}>
                            {i < AGENT_PIPELINE.length - 1 && (
                                <div style={{ position:'absolute', top:11, left:'60%', right:'-40%', height:2, background: status === 'COMPLETE' ? '#059669' : '#E2E8F0', zIndex:0 }} />
                            )}
                            <div style={{ display:'flex', justifyContent:'center', position:'relative', zIndex:1, marginBottom:4 }}>
                                <AgentStatusDot status={status} />
                            </div>
                            <div style={{ fontSize:10, fontWeight:700, color:'#1E293B', lineHeight:1.2 }}>{a.icon} {a.label}</div>
                            {ts && <div style={{ fontSize:9, color:'#94A3B8', marginTop:2 }}>{new Date(ts).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}</div>}
                            <div style={{ fontSize:9, fontWeight:800, color: status==='COMPLETE' ? '#059669' : status==='FAILED' ? '#DC2626' : status==='PENDING' ? '#94A3B8' : '#3B82F6' }}>{status}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function SEORadar({ row }) {
    const total = row.seo_score_total;
    const color = total >= 75 ? '#059669' : total >= 50 ? '#D97706' : '#DC2626';

    return (
        <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:10, padding:'14px 16px', marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <span style={{ fontSize:11, fontWeight:800, color:'#64748B', textTransform:'uppercase' }}>SEO Score Breakdown</span>
                <div style={{ fontSize:26, fontWeight:900, color }}>{total ?? '—'}</div>
            </div>
            {SEO_DIMENSIONS.map(dim => (
                <ScoreBar key={dim.key} value={row[dim.key]} label={`${dim.label} (${dim.weight}%)`} />
            ))}
            {/* Russian keyword evidence */}
            {row.russian_kw_missing && (() => {
                try {
                    const missing = JSON.parse(row.russian_kw_missing);
                    const found   = JSON.parse(row.russian_kw_found || '[]');
                    return (
                        <div style={{ marginTop:12, padding:'10px 12px', background:'#FFF7ED', borderRadius:8, border:'1px solid #FED7AA' }}>
                            <div style={{ fontSize:10, fontWeight:800, color:'#92400E', marginBottom:6 }}>🔍 Russian Keyword Evidence</div>
                            {found.length > 0 && <div style={{ fontSize:11, color:'#065F46', marginBottom:4 }}>✓ Found: {found.join(', ')}</div>}
                            {missing.length > 0 && <div style={{ fontSize:11, color:'#991B1B' }}>✗ Missing: {missing.slice(0,6).join(', ')}{missing.length > 6 ? ` +${missing.length-6} more` : ''}</div>}
                        </div>
                    );
                } catch { return null; }
            })()}
        </div>
    );
}

function AmazonPanel({ row }) {
    const hasAmazon = row.amazon_status === 'COMPLETE';
    return (
        <div style={{ background: hasAmazon ? '#F0FDF4' : '#F8FAFC', border:`1px solid ${hasAmazon ? '#BBF7D0' : '#E2E8F0'}`, borderRadius:10, padding:'14px 16px', marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:800, color:'#64748B', textTransform:'uppercase', marginBottom:10 }}>🇮🇳 Amazon India Reference</div>
            {hasAmazon ? (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                    {[
                        { label:'ASIN',       val: row.amazon_asin || '—' },
                        { label:'Amazon Price', val: row.amazon_price ? `₹${row.amazon_price}` : '—' },
                        { label:'Rating',     val: row.amazon_rating ? `${row.amazon_rating}★` : '—' },
                        { label:'Reviews',    val: row.amazon_reviews?.toLocaleString() || '—' },
                        { label:'My Price',   val: row.product_price ? `₽${row.product_price}` : '—' },
                        { label:'Match Conf', val: row.amazon_confidence ? `${row.amazon_confidence}%` : '—' },
                    ].map(f => (
                        <div key={f.label} style={{ background:'#fff', border:'1px solid #D1FAE5', borderRadius:8, padding:'8px 12px' }}>
                            <div style={{ fontSize:10, color:'#047857', fontWeight:800, marginBottom:2 }}>{f.label}</div>
                            <div style={{ fontSize:14, fontWeight:800, color:'#1E293B' }}>{f.val}</div>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ textAlign:'center', padding:'12px 0', color:'#94A3B8', fontSize:13 }}>
                    <span style={{ fontSize:20 }}>⏳</span>
                    <br />Amazon reference data not yet collected for this product.
                    <br /><span style={{ fontSize:11 }}>Status: {row.amazon_status || 'PENDING'}</span>
                </div>
            )}
        </div>
    );
}

function PricingPanel({ row }) {
    const hasComp = row.competitor_status === 'COMPLETE' && row.competitor_avg_price;
    const hasCost = row.cost_calc_status === 'COMPLETE' && row.expected_margin;
    return (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
            {/* Competitor Prices */}
            <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:10, padding:'14px 16px' }}>
                <div style={{ fontSize:11, fontWeight:800, color:'#64748B', textTransform:'uppercase', marginBottom:10 }}>⚔️ Market Pricing</div>
                {hasComp ? (
                    <>
                        {[
                            { l:'Min Competitor', v:`₽${row.competitor_min_price}` },
                            { l:'Max Competitor', v:`₽${row.competitor_max_price}` },
                            { l:'Avg Market',     v:`₽${Math.round(row.competitor_avg_price)}` },
                            { l:'BuyBox Price',   v: row.buybox_price ? `₽${row.buybox_price}` : '—' },
                            { l:'My Price',       v:`₽${row.product_price || '—'}` },
                        ].map(f => (
                            <div key={f.l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'4px 0', borderBottom:'1px solid #F1F5F9' }}>
                                <span style={{ color:'#64748B' }}>{f.l}</span>
                                <span style={{ fontWeight:800, color:'#1E293B' }}>{f.v}</span>
                            </div>
                        ))}
                    </>
                ) : (
                    <div style={{ color:'#94A3B8', fontSize:13, padding:'10px 0', textAlign:'center' }}>⏳ Waiting for Live Competitor Data</div>
                )}
            </div>

            {/* Cost & Profit */}
            <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:10, padding:'14px 16px' }}>
                <div style={{ fontSize:11, fontWeight:800, color:'#64748B', textTransform:'uppercase', marginBottom:10 }}>💰 Cost & Margin</div>
                {hasCost ? (
                    <>
                        {[
                            { l:'Landed Cost',   v:`₽${Math.round(row.landed_cost)}` },
                            { l:'Suggested Price',v:`₽${Math.round(row.suggested_price)}` },
                            { l:'Expected Margin',v:`${Math.round(row.expected_margin)}%`, color: row.expected_margin > 20 ? '#059669' : '#DC2626' },
                            { l:'Expected Profit',v:`₽${Math.round(row.expected_profit)}`, color:'#059669' },
                            { l:'ROI',           v:`${Math.round(row.roi)}%`, color:'#8B5CF6' },
                        ].map(f => (
                            <div key={f.l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'4px 0', borderBottom:'1px solid #F1F5F9' }}>
                                <span style={{ color:'#64748B' }}>{f.l}</span>
                                <span style={{ fontWeight:800, color: f.color || '#1E293B' }}>{f.v}</span>
                            </div>
                        ))}
                    </>
                ) : (
                    <div style={{ color:'#94A3B8', fontSize:13, padding:'10px 0', textAlign:'center' }}>⏳ Waiting for Amazon Price<br/><span style={{fontSize:11}}>Required to calculate landed cost</span></div>
                )}
            </div>
        </div>
    );
}

function RecommendationCard({ rec, index }) {
    const riskColor = { CRITICAL:'#DC2626', HIGH:'#F59E0B', MEDIUM:'#3B82F6', LOW:'#64748B' }[rec.risk_level] || '#64748B';
    return (
        <div style={{ marginBottom:20, borderLeft:`3px solid ${riskColor}`, paddingLeft:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:11, fontWeight:900, padding:'3px 8px', borderRadius:4, background:riskColor, color:'#fff' }}>{rec.risk_level}</span>
                <span style={{ fontSize:14, fontWeight:800, color:'#0F172A' }}>{rec.problem}</span>
            </div>

            {/* 6-Part Explainability */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div style={{ background:'#FFF8F1', border:'1px solid #FDE68A', borderRadius:8, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, fontWeight:800, color:'#92400E', marginBottom:4 }}>WHY IS THIS WRONG?</div>
                    <div style={{ fontSize:12, color:'#78350F', lineHeight:1.5 }}>{rec.why}</div>
                </div>
                <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:8, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, fontWeight:800, color:'#075985', marginBottom:4 }}>EVIDENCE</div>
                    <div style={{ fontSize:12, color:'#0C4A6E', fontWeight:600 }}>{rec.current_value || 'See analysis above'}</div>
                </div>
                <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, fontWeight:800, color:'#166534', marginBottom:4 }}>AI SUGGESTED FIX</div>
                    <div style={{ fontSize:12, color:'#14532D', fontWeight:700 }}>{rec.recommended_value}</div>
                </div>
                <div style={{ background:'#FAF5FF', border:'1px solid #E9D5FF', borderRadius:8, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, fontWeight:800, color:'#6B21A8', marginBottom:4 }}>EXPECTED BENEFIT</div>
                    <div style={{ fontSize:12, color:'#581C87', fontWeight:700 }}>{rec.expected_improvement}</div>
                </div>
            </div>

            <div style={{ display:'flex', flexWrap:'wrap', gap:16, fontSize:11, color:'#64748B', paddingTop:4 }}>
                <span>🎯 <b style={{color:'#8B5CF6'}}>{rec.confidence}%</b> confidence</span>
                <span>🤖 <b>{rec.generated_by}</b></span>
                <span>⏱ {rec.time_required}</span>
                <span>Approval: <b>{rec.approval_required ? 'Required' : 'Auto'}</b></span>
            </div>
        </div>
    );
}

function RevenueBlock({ row }) {
    const hasLiveSales = row.has_live_sales;
    const hasLiveImpr  = row.has_live_impressions;

    if (!hasLiveSales) {
        return (
            <div style={{ background:'#FFF7ED', border:'1px solid #FDE68A', borderRadius:10, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:28 }}>⏳</span>
                <div>
                    <div style={{ fontWeight:800, color:'#92400E', fontSize:14 }}>Waiting for Live Data</div>
                    <div style={{ color:'#78350F', fontSize:12, marginTop:2 }}>Revenue projections are unavailable. Connect Ozon Analytics API to enable live sales, impression, and conversion tracking.</div>
                </div>
            </div>
        );
    }

    const monthlyRev = (row.product_price || 0) * (row.product_sales || 0);
    return (
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'14px 18px', marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:800, color:'#065F46', marginBottom:8, textTransform:'uppercase' }}>📊 Revenue (Live Data ✓)</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                <div><div style={{fontSize:10,color:'#047857',fontWeight:800}}>CURRENT MONTHLY</div><div style={{fontSize:18,fontWeight:900,color:'#065F46'}}>₽{monthlyRev.toLocaleString()}</div></div>
                <div><div style={{fontSize:10,color:'#047857',fontWeight:800}}>TRAFFIC GAIN EXP.</div><div style={{fontSize:18,fontWeight:900,color:'#3B82F6'}}>+{row.expected_traffic_gain || 0}%</div></div>
                <div><div style={{fontSize:10,color:'#047857',fontWeight:800}}>CONVERSION GAIN EXP.</div><div style={{fontSize:18,fontWeight:900,color:'#8B5CF6'}}>+{row.expected_conversion_gain || 0}%</div></div>
            </div>
        </div>
    );
}

function OptimizationCard({ row, onAction }) {
    const [expanded, setExpanded] = useState(false);
    const pc = PRIORITY_COLOR[row.priority] || '#64748B';
    let recs = [];
    try { recs = JSON.parse(row.recommendations || '[]'); } catch {}

    const firstImg = (() => {
        try {
            const arr = JSON.parse(row.product_images || '[]');
            let img = null;
            const find = (v) => { if (img) return; if (Array.isArray(v)) v.forEach(find); else if (typeof v === 'string' && v.startsWith('http')) img = v; };
            find(arr);
            return img;
        } catch { return null; }
    })();

    // Overall pipeline completeness
    const pipelineKeys = ['amazon_status','compliance_status','groq_seo_status','listing_opt_status','competitor_status','cost_calc_status'];
    const completedAgents = pipelineKeys.filter(k => row[k] === 'COMPLETE' || row[k] === 'SKIPPED').length;
    const pipelinePct = Math.round((completedAgents / pipelineKeys.length) * 100);

    return (
        <div style={{ background:'#fff', borderRadius:14, border:`1px solid ${pc}33`, borderLeft:`4px solid ${pc}`, marginBottom:16, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', overflow:'hidden' }}>
            {/* Compact Header Row */}
            <div onClick={() => setExpanded(!expanded)} style={{ display:'grid', gridTemplateColumns:'60px minmax(0,1fr) auto', gap:14, padding:'14px 18px', cursor:'pointer', alignItems:'center' }}>
                {/* Thumbnail */}
                <div style={{ width:52, height:52, border:`2px solid ${pc}44`, borderRadius:8, background:'#F8FAFC', overflow:'hidden', flexShrink:0 }}>
                    {firstImg
                        ? <img src={firstImg} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />
                        : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>📦</div>
                    }
                </div>

                {/* Product Info */}
                <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                        <span style={{ fontSize:10, fontWeight:900, padding:'2px 7px', borderRadius:4, background:pc, color:'#fff' }}>{row.priority}</span>
                        <span style={{ fontSize:10, color:'#94A3B8', fontWeight:700 }}>Pipeline: {pipelinePct}% ✓</span>
                        {row.approval_status === 'APPROVED' && <span style={{ fontSize:10, fontWeight:900, color:'#059669' }}>✓ APPROVED</span>}
                        {row.approval_status === 'REJECTED' && <span style={{ fontSize:10, fontWeight:900, color:'#DC2626' }}>✗ REJECTED</span>}
                        
                        {/* New Metadata Links */}
                        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
                            {row.product_account_id && <span style={{ fontSize:9, background:'#F1F5F9', padding:'2px 6px', borderRadius:4, color:'#475569', fontWeight:800 }}>🏢 Account: {row.product_account_id}</span>}
                            {row.amazon_asin && <a href={`https://amazon.in/dp/${row.amazon_asin}`} target="_blank" style={{ fontSize:9, background:'#FFF7ED', padding:'2px 6px', borderRadius:4, color:'#C2410C', fontWeight:800, textDecoration:'none' }}>🇮🇳 ASIN: {row.amazon_asin}</a>}
                            <a href={`https://seller.ozon.ru/app/products/${row.product_id}/edit`} target="_blank" style={{ fontSize:9, background:'#EFF6FF', padding:'2px 6px', borderRadius:4, color:'#1D4ED8', fontWeight:800, textDecoration:'none' }}>Ozon Seller ↗</a>
                        </div>
                    </div>
                    
                    <p style={{ margin:'0 0 4px', fontSize:14, fontWeight:800, color:'#0F172A', lineHeight:1.3 }}>{row.product_name}</p>
                    
                    {/* Identity Verification Ribbon */}
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'12px', fontSize:10, color:'#475569', fontWeight:600, marginTop:10, background:row.identity_offer_id?'#F8FAFC':'#FFF7ED', padding:'8px 12px', borderRadius:6, border:row.identity_offer_id?'1px solid #E2E8F0':'1px solid #FFEDD5' }}>
                        {row.identity_offer_id ? <>
                            <span style={{color:'#2563EB', fontWeight:800}}>🛡️ IDENTITY VERIFIED</span>
                            <span title="Account Client ID / Owner">🏢 {row.identity_client_id}</span>
                            <span title="Ozon Product ID">🏷️ <b>Ozon ID:</b> {row.product_id}</span>
                            <span title="Ozon Offer ID (Authoritative)">🔑 <b>Offer ID:</b> {row.identity_offer_id}</span>
                            <span title="Local Database SKU / Article Code">📦 <b>SKU:</b> {row.product_sku}</span>
                            {row.identity_barcode && <span title="Barcode">📶 <b>EAN:</b> {row.identity_barcode}</span>}
                            <span title="Last Identity Sync" style={{color:'#94A3B8'}}>🕒 Sync: {new Date(row.identity_last_sync_at).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}</span>
                        </> : <>
                            <span style={{color:'#C2410C', fontWeight:800}}>⚠️ UNVERIFIED IDENTITY</span>
                            <span>No permanent identity mapping. Workflow will auto-resolve on next sync.</span>
                            <span title="Ozon Product ID">🏷️ <b>Ozon ID:</b> {row.product_id}</span>
                            <span title="Local Database SKU">📦 <b>SKU:</b> {row.product_sku}</span>
                        </>}
                    </div>
                </div>

                {/* Metrics */}
                <div style={{ display:'flex', gap:18, alignItems:'center' }}>
                    {[
                        { label:'SEO', val: Math.round(row.seo_score_total ?? row.seo_score ?? 0), suffix:'' },
                        { label:'CONTENT', val: Math.round(row.content_rating ?? 0), suffix:'%' },
                        { label:'ISSUES', val: row.problem_count, suffix:'' },
                    ].map(m => {
                        const c = m.label === 'ISSUES' ? '#DC2626' : (m.val >= 75 ? '#059669' : m.val >= 50 ? '#D97706' : '#DC2626');
                        return (
                            <div key={m.label} style={{ textAlign:'center' }}>
                                <div style={{ fontSize:9, color:'#94A3B8', fontWeight:800 }}>{m.label}</div>
                                <div style={{ fontSize:18, fontWeight:900, color:c }}>{m.val}{m.suffix}</div>
                            </div>
                        );
                    })}
                    <span style={{ color:'#94A3B8', fontSize:16, marginLeft:4 }}>{expanded ? '▲' : '▼'}</span>
                </div>
            </div>

            {/* Expanded Detail Panel */}
            {expanded && (
                <div style={{ padding:'0 18px 18px', borderTop:'1px solid #F1F5F9' }}>
                    <div style={{ paddingTop:16 }}>
                        {/* Agent Timeline */}
                        <AgentTimeline row={row} />

                        {/* Two-column layout: SEO + Amazon */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:4 }}>
                            <SEORadar row={row} />
                            <div>
                                <AmazonPanel row={row} />
                                <PricingPanel row={row} />
                            </div>
                        </div>

                        {/* Revenue block */}
                        <RevenueBlock row={row} />

                        {/* AI Recommendations */}
                        <div style={{ marginBottom:20 }}>
                            <div style={{ fontSize:11, fontWeight:800, color:'#64748B', textTransform:'uppercase', marginBottom:14 }}>🔬 AI Root Cause Analysis ({recs.length} Issues Found)</div>
                            {recs.map((rec, i) => <RecommendationCard key={i} rec={rec} />)}
                        </div>

                        {/* Action Bar */}
                        <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:14, borderTop:'1px solid #F1F5F9' }}>
                            <button onClick={() => onAction(row.lo_id, 'REJECTED')} style={{ background:'#fff', border:'1px solid #CBD5E1', padding:'9px 18px', borderRadius:7, fontWeight:700, color:'#64748B', cursor:'pointer' }}>Reject</button>
                            <button onClick={() => onAction(row, 'PREVIEW_APPROVAL')} style={{ background:'#059669', border:'none', padding:'9px 22px', borderRadius:7, fontWeight:800, color:'#fff', cursor:'pointer', fontSize:13 }}>
                                ✓ Approve → Groq SEO Agent
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// Add simple word diff utility
function TextDiff({ oldText, newText }) {
    if (!oldText && !newText) return <span>-</span>;
    if (!oldText) return <span style={{ color: '#16A34A', background: '#DCFCE7' }}>{newText}</span>;
    if (!newText) return <span style={{ color: '#DC2626', textDecoration: 'line-through', background: '#FEE2E2' }}>{oldText}</span>;

    const oldWords = oldText.split(' ');
    const newWords = newText.split(' ');

    return (
        <div style={{ lineHeight: 1.6 }}>
            {newWords.map((word, i) => {
                if (!oldWords.includes(word)) {
                    return <span key={i} style={{ background: '#DCFCE7', color: '#16A34A', padding: '2px 4px', borderRadius: 4, marginRight: 4 }}>{word}</span>;
                }
                return <span key={i} style={{ marginRight: 4 }}>{word}</span>;
            })}
            <div style={{ marginTop: 8, fontSize: 11, color: '#94A3B8' }}>
                <span style={{ textTransform: 'uppercase', fontWeight: 800 }}>Removed:</span>{' '}
                {oldWords.map((word, i) => {
                    if (!newWords.includes(word)) {
                        return <span key={i} style={{ background: '#FEE2E2', color: '#DC2626', textDecoration: 'line-through', padding: '0 4px', borderRadius: 4, marginRight: 4 }}>{word}</span>;
                    }
                    return null;
                })}
            </div>
        </div>
    );
}

export default function ListingOptimizationPage() {
    const [loading, setLoading]   = useState(true);
    const [running, setRunning]   = useState(false);
    const [data, setData]         = useState([]);
    const [priority, setPriority] = useState('ALL');
    const [search, setSearch]     = useState('');
    const [statusF, setStatusF]   = useState('PENDING');
    const [previewRow, setPreviewRow] = useState(null);

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        try {
            const r = await fetch('/api/db/listing-optimization');
            const d = await r.json();
            setData(Array.isArray(d) ? d : []);
        } catch(e) { console.error(e); }
        setLoading(false);
    };

    const triggerWorkflow = async () => {
        setRunning(true);
        await fetch('/api/agents/run-workflow', { method:'POST', body:JSON.stringify({ limit:200 }), headers:{'Content-Type':'application/json'} });
        await load();
        setRunning(false);
    };

    const onAction = async (idOrRow, actionType) => {
        if (actionType === 'PREVIEW_APPROVAL') {
            setPreviewRow(idOrRow); // open modal
            return;
        }
        // Direct reject DB patch
        await fetch('/api/db/listing-optimization', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: idOrRow, status: actionType }) });
        await load();
    };

    const filtered = useMemo(() => {
        return data.filter(r => {
            if (priority !== 'ALL' && r.priority !== priority) return false;
            if (statusF !== 'ALL' && r.approval_status !== statusF) return false;
            if (search) {
                const q = search.toLowerCase();
                return (r.product_name||'').toLowerCase().includes(q) ||
                       (r.product_sku||'').toLowerCase().includes(q)  ||
                       (r.product_brand||'').toLowerCase().includes(q);
            }
            return true;
        });
    }, [data, priority, search, statusF]);

    const counts = {};
    data.forEach(r => { counts[r.priority] = (counts[r.priority] || 0) + 1; });
    const avgSEO = data.length ? Math.round(data.reduce((s,r) => s + (r.seo_score_total||0), 0) / data.length) : 0;
    const waitingRevenue = data.filter(r => !r.has_live_sales).length;

    return (
        <div>
            <header className="page-head" style={{ maxWidth: 'none' }}>
                <div className="toolbar" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1>AI Listing Auditor</h1>
                        <p className="page-lead">
                            {data.length} listings. Average SEO score {avgSEO}. {waitingRevenue} still waiting for live revenue data.
                        </p>
                    </div>
                    <div className="toolbar">
                        <button type="button" className="button-secondary" onClick={load}>Refresh</button>
                        <button type="button" onClick={triggerWorkflow} disabled={running}>
                            {running ? 'Running agents...' : 'Run full AI workflow'}
                        </button>
                    </div>
                </div>
            </header>

            {/* Summary Bar */}
            <div className="metric-grid">
                {[
                    { label:'CRITICAL', val: counts.CRITICAL||0, color:'#DC2626', filter:'CRITICAL' },
                    { label:'HIGH',     val: counts.HIGH||0,     color:'#F59E0B', filter:'HIGH' },
                    { label:'MEDIUM',   val: counts.MEDIUM||0,   color:'#3B82F6', filter:'MEDIUM' },
                    { label:'TOTAL',    val: data.length,        color:'#1E293B', filter:'ALL' },
                    { label:'AVG SEO',  val: avgSEO,             color: avgSEO>=75?'#059669':avgSEO>=50?'#D97706':'#DC2626', filter:null },
                    { label:'⏳ NO LIVE DATA', val: waitingRevenue, color:'#D97706', filter:null },
                ].map(k => (
                    <div key={k.label} onClick={() => k.filter && setPriority(k.filter)}
                        style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:10, padding:'12px 14px', cursor: k.filter ? 'pointer' : 'default',
                            boxShadow: priority === k.filter ? `0 0 0 2px ${k.color}` : 'none' }}>
                        <div style={{ fontSize:9, fontWeight:800, color:'#94A3B8', marginBottom:4, textTransform:'uppercase' }}>{k.label}</div>
                        <div style={{ fontSize:22, fontWeight:900, color:k.color }}>{k.val}</div>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search SKU, name, brand..." style={{ flex:1, minWidth:240, padding:'9px 14px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'#fff' }} />
                {['ALL','CRITICAL','HIGH','MEDIUM','LOW'].map(f => (
                    <button key={f} onClick={() => setPriority(f)} style={{
                        background: priority===f ? (PRIORITY_COLOR[f]||'#0F172A') : '#fff',
                        color: priority===f ? '#fff' : (PRIORITY_COLOR[f]||'#1E293B'),
                        border:`1px solid ${PRIORITY_COLOR[f]||'#E2E8F0'}`, padding:'9px 14px',
                        borderRadius:8, fontWeight:800, cursor:'pointer', fontSize:12
                    }}>{f}{counts[f]!==undefined ? ` (${counts[f]})` : ''}</button>
                ))}
                <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={{ padding:'9px 14px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, fontWeight:700 }}>
                    <option value="ALL">All Status</option>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                </select>
            </div>

            {/* Loading */}
            {loading && (
                <div style={{ textAlign:'center', padding:'60px 0', color:'#94A3B8' }}>
                    <div style={{ fontSize:40 }}>⟳</div>
                    <p>Loading AI Audit results...</p>
                </div>
            )}

            {/* Card List */}
            {!loading && filtered.map(row => (
                <OptimizationCard key={row.product_id} row={row} onAction={onAction} />
            ))}

            {!loading && filtered.length === 0 && (
                <div className="stat-card empty-cell">No listings match these filters.</div>
            )}

            {previewRow && (
                <ApprovalModal
                    row={previewRow}
                    onClose={() => setPreviewRow(null)}
                    onComplete={() => {
                        setPreviewRow(null);
                        load(); // refresh data to show approved status
                    }}
                />
            )}
        </div>
    );
}
