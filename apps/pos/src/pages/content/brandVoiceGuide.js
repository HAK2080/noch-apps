export const FINGERPRINT_DIMENSIONS = [
  'formality', 'humor', 'sarcasm', 'warmth', 'aggression',
  'code_switching', 'dialect_density', 'meme_native', 'cta_directness', 'religious_refs',
]

export const DIMENSION_LABELS = {
  formality: 'Formality',
  humor: 'Humor',
  sarcasm: 'Sarcasm',
  warmth: 'Warmth',
  aggression: 'Aggression',
  code_switching: 'Code Switching',
  dialect_density: 'Dialect Density',
  meme_native: 'Meme Native',
  cta_directness: 'CTA Directness',
  religious_refs: 'Religious Refs',
}

export function buildBrandGuideHtml(brand, { fingerprint, dialectExtractions, materials, negativeExamples }) {
  const accentColor = brand.primary_color || '#22c55e'
  const goldenPosts = materials.filter(m => m.type === 'caption_example' || m.type === 'post_example').slice(0, 6)

  // Build fingerprint bars HTML
  const fingerprintRows = FINGERPRINT_DIMENSIONS.map(dim => {
    const d = fingerprint[dim]
    if (!d) return ''
    const score = d.score || 5
    const pct = (score / 10) * 100
    const barColor = score >= 7 ? '#22c55e' : score >= 4 ? '#f59e0b' : '#ef4444'
    return `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:12px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.05em">${DIMENSION_LABELS[dim]}</span>
          <span style="font-size:13px;font-weight:700;color:${barColor}">${score}/10</span>
        </div>
        <div style="background:#e5e7eb;border-radius:4px;height:8px">
          <div style="width:${pct}%;background:${barColor};border-radius:4px;height:8px"></div>
        </div>
        ${d.evidence ? `<p style="font-size:11px;color:#6b7280;margin-top:3px;line-height:1.4">${d.evidence}</p>` : ''}
      </div>`
  }).join('')

  // Dialect table rows
  const dialectRows = dialectExtractions.slice(0, 30).map(d => `
    <tr>
      <td style="padding:8px 12px;font-size:14px;font-family:sans-serif;direction:rtl;text-align:right">${d.phrase_ar}</td>
      <td style="padding:8px 12px;font-size:13px;color:#374151">${d.phrase_en || '—'}</td>
      <td style="padding:8px 12px;font-size:12px;color:#6b7280">${d.context || '—'}</td>
      <td style="padding:8px 12px"><span style="font-size:11px;padding:2px 8px;border-radius:12px;background:#f3f4f6;color:#374151">${d.category || ''}</span></td>
    </tr>`).join('')

  // Example posts
  const postsHtml = goldenPosts.map((p, i) => `
    <div style="background:#f9fafb;border-left:3px solid ${accentColor};border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:12px">
      <p style="font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.05em;margin:0 0 6px">Example ${i + 1}${p.title ? ' — ' + p.title : ''}</p>
      <p style="font-size:13px;color:#1f2937;line-height:1.6;margin:0;white-space:pre-wrap">${p.content || ''}</p>
    </div>`).join('')

  // Negative examples
  const negativesHtml = negativeExamples.slice(0, 6).map((n, i) => `
    <div style="background:#fef2f2;border-left:3px solid #ef4444;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:10px">
      <p style="font-size:11px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px">❌ Avoid — ${(n.tags || []).join(', ')}</p>
      <p style="font-size:13px;color:#374151;line-height:1.5;margin:0 0 6px">${n.content?.slice(0, 300) || ''}</p>
      ${n.why_bad ? `<p style="font-size:12px;color:#991b1b;margin:0"><strong>Why:</strong> ${n.why_bad}</p>` : ''}
    </div>`).join('')

  // Brand program — extract key sections
  const programText = (brand.brand_program || '').slice(0, 4000)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${brand.name} — Brand Voice Guide</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-before: always; }
    }
    .cover {
      background: linear-gradient(135deg, #111827 0%, #1f2937 60%, ${accentColor}22 100%);
      min-height: 100vh; display: flex; flex-direction: column;
      justify-content: center; align-items: flex-start; padding: 80px;
    }
    .cover-badge {
      font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase;
      color: ${accentColor}; background: ${accentColor}22; border: 1px solid ${accentColor}44;
      padding: 6px 14px; border-radius: 20px; margin-bottom: 32px;
    }
    .cover-name { font-size: 72px; font-weight: 900; color: #fff; line-height: 1; margin-bottom: 8px; }
    .cover-name-ar { font-size: 40px; font-weight: 700; color: ${accentColor}; margin-bottom: 24px; font-family: sans-serif; }
    .cover-tagline { font-size: 22px; color: #9ca3af; margin-bottom: 48px; font-style: italic; }
    .cover-meta { display: flex; gap: 32px; }
    .cover-meta-item { }
    .cover-meta-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; }
    .cover-meta-value { font-size: 16px; font-weight: 700; color: #e5e7eb; margin-top: 2px; }
    .cover-footer { position: absolute; bottom: 40px; left: 80px; right: 80px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #374151; padding-top: 20px; }
    .cover-footer-text { font-size: 12px; color: #4b5563; }
    section { padding: 48px 64px; }
    section + section { border-top: 1px solid #e5e7eb; }
    .section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${accentColor}; margin-bottom: 8px; }
    h2 { font-size: 28px; font-weight: 800; color: #111827; margin-bottom: 24px; }
    h3 { font-size: 16px; font-weight: 700; color: #374151; margin-bottom: 12px; }
    p { line-height: 1.7; color: #374151; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
    tr:nth-child(even) { background: #f9fafb; }
    .tag { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; background: ${accentColor}22; color: ${accentColor}; margin: 2px; }
    .print-btn { position: fixed; bottom: 24px; right: 24px; background: ${accentColor}; color: #000; border: none; padding: 14px 28px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 20px ${accentColor}66; z-index: 999; }
    .print-btn:hover { opacity: 0.9; }
    .program-text { white-space: pre-wrap; font-size: 13px; line-height: 1.75; color: #374151; background: #f9fafb; border-radius: 8px; padding: 20px; font-family: inherit; }
  </style>
</head>
<body>

  <!-- Print Button -->
  <button class="print-btn no-print" onclick="window.print()">⬇ Save as PDF</button>

  <!-- COVER PAGE -->
  <div class="cover" style="position:relative">
    <div class="cover-badge">Brand Voice Guide</div>
    <div class="cover-name">${brand.name}</div>
    ${brand.name_ar ? `<div class="cover-name-ar">${brand.name_ar}</div>` : ''}
    ${brand.tagline ? `<div class="cover-tagline">"${brand.tagline}"</div>` : ''}
    <div class="cover-meta">
      ${brand.voice_archetype ? `<div class="cover-meta-item"><div class="cover-meta-label">Voice Archetype</div><div class="cover-meta-value">${brand.voice_archetype}</div></div>` : ''}
      ${brand.dialect ? `<div class="cover-meta-item"><div class="cover-meta-label">Dialect</div><div class="cover-meta-value">${brand.dialect}</div></div>` : ''}
      ${(brand.platforms || []).length ? `<div class="cover-meta-item"><div class="cover-meta-label">Platforms</div><div class="cover-meta-value">${brand.platforms.join(', ')}</div></div>` : ''}
    </div>
    <div class="cover-footer">
      <span class="cover-footer-text">Confidential — Internal Use Only</span>
      <span class="cover-footer-text">Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
    </div>
  </div>

  <!-- SECTION 1: Voice Fingerprint -->
  ${Object.keys(fingerprint).length > 0 ? `
  <section class="page-break">
    <div class="section-label">Section 01</div>
    <h2>Voice Fingerprint</h2>
    <p style="margin-bottom:28px;color:#6b7280">10 scored dimensions define the brand's communication DNA. Each scored 1–10 with evidence from real content.</p>
    <div style="columns:2;column-gap:40px">
      ${fingerprintRows}
    </div>
    ${brand.voice_fingerprint_json?.self_assessment ? `
    <div style="margin-top:32px;background:#fefce8;border:1px solid #fef08a;border-radius:8px;padding:20px">
      <h3 style="color:#854d0e;margin-bottom:12px">AI Confidence Assessment</h3>
      <p style="font-size:13px;color:#713f12">Overall confidence: <strong>${brand.voice_fingerprint_json.self_assessment.overall_confidence}/10</strong></p>
      ${(brand.voice_fingerprint_json.self_assessment.gaps || []).length ? `
      <p style="font-size:12px;color:#854d0e;margin-top:8px;font-weight:600">Data gaps identified:</p>
      <ul style="margin-top:4px;padding-left:16px">${(brand.voice_fingerprint_json.self_assessment.gaps || []).map(g => `<li style="font-size:12px;color:#713f12;line-height:1.6">${g}</li>`).join('')}</ul>` : ''}
    </div>` : ''}
  </section>` : ''}

  <!-- SECTION 2: Voice Rules -->
  ${programText ? `
  <section class="page-break">
    <div class="section-label">Section 02</div>
    <h2>Voice Rules & Brand Program</h2>
    <div class="program-text">${programText}</div>
  </section>` : ''}

  <!-- SECTION 3: Dialect Guide -->
  ${dialectExtractions.length > 0 ? `
  <section class="page-break">
    <div class="section-label">Section 03</div>
    <h2>Dialect Guide</h2>
    <p style="margin-bottom:20px;color:#6b7280">Key Tripoli Arabic expressions extracted from real brand content. Use these naturally — never forced.</p>
    <table>
      <thead>
        <tr>
          <th style="text-align:right">Arabic</th>
          <th>Translation</th>
          <th>Context / Usage</th>
          <th>Category</th>
        </tr>
      </thead>
      <tbody>${dialectRows}</tbody>
    </table>
  </section>` : ''}

  <!-- SECTION 4: Example Posts -->
  ${goldenPosts.length > 0 ? `
  <section class="page-break">
    <div class="section-label">Section 04</div>
    <h2>Golden Examples</h2>
    <p style="margin-bottom:20px;color:#6b7280">Approved posts that best represent the brand voice. Use as reference when writing new content.</p>
    ${postsHtml}
  </section>` : ''}

  <!-- SECTION 5: What NOT to Do -->
  ${negativeExamples.length > 0 ? `
  <section class="page-break">
    <div class="section-label">Section 05</div>
    <h2>What NOT to Sound Like</h2>
    <p style="margin-bottom:20px;color:#6b7280">Content that was explicitly rejected. Understanding what fails is as important as knowing what works.</p>
    ${negativesHtml}
  </section>` : ''}

  <!-- SECTION 6: Quick Reference -->
  <section class="page-break">
    <div class="section-label">Section 06</div>
    <h2>Quick Reference Card</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:8px">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px">
        <h3 style="color:#166534;margin-bottom:12px">✅ Always</h3>
        <ul style="padding-left:16px;space-y:4px">
          <li style="font-size:13px;line-height:1.8;color:#15803d">Write like a person, not a brand</li>
          <li style="font-size:13px;line-height:1.8;color:#15803d">Use Tripoli dialect naturally</li>
          <li style="font-size:13px;line-height:1.8;color:#15803d">Lead with a strong hook</li>
          <li style="font-size:13px;line-height:1.8;color:#15803d">Make CTAs feel like punchlines</li>
          <li style="font-size:13px;line-height:1.8;color:#15803d">Own the chaos — that's the brand</li>
        </ul>
      </div>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px">
        <h3 style="color:#991b1b;margin-bottom:12px">❌ Never</h3>
        <ul style="padding-left:16px">
          <li style="font-size:13px;line-height:1.8;color:#b91c1c">Use wellness/lifestyle speak</li>
          <li style="font-size:13px;line-height:1.8;color:#b91c1c">Sound formal or corporate</li>
          <li style="font-size:13px;line-height:1.8;color:#b91c1c">Force Arabic where EN flows better</li>
          <li style="font-size:13px;line-height:1.8;color:#b91c1c">Explain the joke</li>
          <li style="font-size:13px;line-height:1.8;color:#b91c1c">Post without a hook</li>
        </ul>
      </div>
    </div>
    ${(brand.voice_inspirations || []).length ? `
    <div style="margin-top:24px">
      <h3>Voice Inspirations</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${(brand.voice_inspirations || []).map(v => `<span class="tag">${v}</span>`).join('')}</div>
    </div>` : ''}
    <div style="margin-top:48px;padding-top:24px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;color:#9ca3af">© ${new Date().getFullYear()} ${brand.name} — Confidential</span>
      <span style="font-size:12px;color:#9ca3af">Generated by Noch Brand Engine</span>
    </div>
  </section>

  <script>
    // Auto-open print dialog after a short delay
    setTimeout(() => window.print(), 800)
  </script>
</body>
</html>`
}
