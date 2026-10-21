'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function EditClient({ product, account }) {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    
    // Parse JSON data
    let images = [], attrs = {};
    try { images = JSON.parse(product.images_json || '[]'); } catch(e) {}
    try { attrs = JSON.parse(product.attributes_json || '{}'); } catch(e) {}

    const [form, setForm] = useState({
        name: product.name,
        brand: product.brand,
        price: product.price,
        old_price: product.old_price || 0,
        stock: product.stock,
        description: attrs.description || '',
        color: attrs.color || '',
        size: attrs.size || '',
        weight: product.volume_weight || 0,
        hashtags: attrs.hashtags || '',
        keywords: attrs.keywords || ''
    });

    const handleSave = async (pushToOzon = false) => {
        setSaving(true);
        try {
            // Local DB Update
            const res = await fetch(`/api/products/${product.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, pushToOzon })
            });

            if (res.ok) {
                alert(pushToOzon ? 'Listing updated and pushed to Ozon successfully!' : 'Local changes saved.');
                router.push('/products');
                router.refresh();
            } else {
                const err = await res.json();
                alert(`Error: ${err.error || 'Failed to save'}`);
            }
        } catch (e) {
            alert('An unexpected error occurred.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <div>
                <div className="toolbar" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <button type="button" className="button-secondary" onClick={() => router.back()}>Back</button>
                        <header className="page-head" style={{ marginTop: '12px', marginBottom: 0 }}>
                            <h1>Edit listing</h1>
                            <p className="page-lead">{account.name} · SKU {product.sku}</p>
                        </header>
                    </div>
                    <div className="toolbar">
                        <button type="button" className="button-secondary" onClick={() => handleSave(false)} disabled={saving}>
                            {saving ? 'Saving...' : 'Save draft'}
                        </button>
                        <button type="button" onClick={() => handleSave(true)} disabled={saving}>
                            {saving ? 'Syncing...' : 'Save and push to Ozon'}
                        </button>
                    </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'32px' }}>
                    
                    {/* Left Column: Form */}
                    <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>
                        
                        {/* Section 1: Basic Info */}
                        <div style={{ background:'#fff', borderRadius:'16px', padding:'32px', boxShadow:'0 1px 3px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ fontSize:'16px', fontWeight:700, marginBottom:'24px', color:'#1E293B' }}>Basic Information</h3>
                            <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>
                                <div>
                                    <label style={{ display:'block', fontSize:'12px', fontWeight:700, color:'#64748B', marginBottom:'8px' }}>PRODUCT TITLE</label>
                                    <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                                           style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #E2E8F0', fontSize:'14px', outline:'none' }} />
                                </div>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px' }}>
                                    <div>
                                        <label style={{ display:'block', fontSize:'12px', fontWeight:700, color:'#64748B', marginBottom:'8px' }}>BRAND</label>
                                        <input type="text" value={form.brand} onChange={e => setForm({...form, brand: e.target.value})}
                                               style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #E2E8F0', fontSize:'14px', outline:'none' }} />
                                    </div>
                                    <div>
                                        <label style={{ display:'block', fontSize:'12px', fontWeight:700, color:'#64748B', marginBottom:'8px' }}>COLOR / VARIANT</label>
                                        <input type="text" value={form.color} onChange={e => setForm({...form, color: e.target.value})}
                                               style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #E2E8F0', fontSize:'14px', outline:'none' }} />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display:'block', fontSize:'12px', fontWeight:700, color:'#64748B', marginBottom:'8px' }}>DESCRIPTION</label>
                                    <textarea rows={6} value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                                              style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #E2E8F0', fontSize:'14px', outline:'none', resize:'vertical' }} />
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Pricing & Stock */}
                        <div style={{ background:'#fff', borderRadius:'16px', padding:'32px', boxShadow:'0 1px 3px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ fontSize:'16px', fontWeight:700, marginBottom:'24px', color:'#1E293B' }}>Pricing & Inventory</h3>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'20px' }}>
                                <div>
                                    <label style={{ display:'block', fontSize:'12px', fontWeight:700, color:'#64748B', marginBottom:'8px' }}>MAIN PRICE</label>
                                    <input type="number" value={form.price} onChange={e => setForm({...form, price: e.target.value})}
                                           style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #E2E8F0', fontSize:'14px', outline:'none' }} />
                                </div>
                                <div>
                                    <label style={{ display:'block', fontSize:'12px', fontWeight:700, color:'#64748B', marginBottom:'8px' }}>OLD PRICE (STRIKE)</label>
                                    <input type="number" value={form.old_price} onChange={e => setForm({...form, old_price: e.target.value})}
                                           style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #E2E8F0', fontSize:'14px', outline:'none' }} />
                                </div>
                                <div>
                                    <label style={{ display:'block', fontSize:'12px', fontWeight:700, color:'#64748B', marginBottom:'8px' }}>FBS STOCK</label>
                                    <input type="number" value={form.stock} onChange={e => setForm({...form, stock: e.target.value})}
                                           style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #E2E8F0', fontSize:'14px', outline:'none' }} />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Search Optimization */}
                        <div style={{ background:'#fff', borderRadius:'16px', padding:'32px', boxShadow:'0 1px 3px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ fontSize:'16px', fontWeight:700, marginBottom:'24px', color:'#1E293B' }}>Search & Discoverability</h3>
                            <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>
                                <div>
                                    <label style={{ display:'block', fontSize:'12px', fontWeight:700, color:'#64748B', marginBottom:'8px' }}>KEYWORDS (COMMA SEPARATED)</label>
                                    <textarea value={form.keywords} onChange={e => setForm({...form, keywords: e.target.value})}
                                              style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #E2E8F0', fontSize:'14px', outline:'none' }} />
                                </div>
                                <div>
                                    <label style={{ display:'block', fontSize:'12px', fontWeight:700, color:'#64748B', marginBottom:'8px' }}>HASHTAGS</label>
                                    <input type="text" value={form.hashtags} onChange={e => setForm({...form, hashtags: e.target.value})}
                                           style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'1px solid #E2E8F0', fontSize:'14px', outline:'none' }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Media & Specs */}
                    <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>
                        
                        {/* Images */}
                        <div style={{ background:'#fff', borderRadius:'16px', padding:'24px', boxShadow:'0 1px 3px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ fontSize:'14px', fontWeight:700, marginBottom:'16px', color:'#1E293B' }}>Media Gallery</h3>
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'12px' }}>
                                {images.map((img, i) => (
                                    <div key={i} style={{ position:'relative', paddingTop:'100%', borderRadius:'8px', overflow:'hidden', border:'1px solid #F1F5F9' }}>
                                        <img src={img} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
                                        {i === 0 && <div style={{ position:'absolute', bottom:0, width:'100%', background:'#2563EB', color:'#fff', textAlign:'center', fontSize:'10px', padding:'4px', fontWeight:700 }}>PRIMARY</div>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Additional Attributes */}
                        <div style={{ background:'#fff', borderRadius:'16px', padding:'24px', boxShadow:'0 1px 3px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ fontSize:'14px', fontWeight:700, marginBottom:'16px', color:'#1E293B' }}>Specifications</h3>
                            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                                <div style={{ display:'flex', justifyContent:'space-between', paddingBottom:'8px', borderBottom:'1px solid #F8FAFC' }}>
                                    <span style={{ fontSize:'12px', color:'#64748B' }}>Category ID</span>
                                    <span style={{ fontSize:'12px', fontWeight:600 }}>{attrs.description_category_id}</span>
                                </div>
                                <div style={{ display:'flex', justifyContent:'space-between', paddingBottom:'8px', borderBottom:'1px solid #F8FAFC' }}>
                                    <span style={{ fontSize:'12px', color:'#64748B' }}>Model ID</span>
                                    <span style={{ fontSize:'12px', fontWeight:600 }}>{product.variant_group_id || 'Standalone'}</span>
                                </div>
                                <div style={{ display:'flex', justifyContent:'space-between' }}>
                                    <span style={{ fontSize:'12px', color:'#64748B' }}>Listing Health</span>
                                    <span style={{ fontSize:'12px', fontWeight:700, color:'#10B981' }}>{product.health}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
