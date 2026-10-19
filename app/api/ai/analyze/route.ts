import { GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { action, projectData, sceneText } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    if (action === 'analyze_project') {
      const title = projectData?.project?.title || 'Unknown Title';
      const scenes = projectData?.chapters?.[0]?.scenes || [];
      const totalScenes = scenes.length;
      const allText = scenes.map((s: any, i: number) => `Scene ${i + 1} (${s.scene_id}): ${s.narration_text}`).join('\n');

      const prompt = `
Analyze the following script for an educational dark psychology / self-defense video titled "${title}".
Total Scenes: ${totalScenes}.

Script:
${allText}

Provide a deep analytical breakdown in JSON:
1. "psychological_arc": Summary of the psychological narrative arc and tone (in Arabic).
2. "pacing_score": Numeric score from 1 to 10 for pacing and audience retention.
3. "pacing_critique": Constructive critique on sentence lengths and spoken flow (in Arabic).
4. "flagged_scenes": Array of objects for any scenes that might feel too long (>32 words) or repetitive, with suggested polish (scene_id, original, suggestion, reason).
5. "key_themes": Array of 3-5 key psychological concepts discussed.
6. "estimated_listening_minutes": Calculated estimated spoken duration in minutes.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              psychological_arc: { type: Type.STRING },
              pacing_score: { type: Type.NUMBER },
              pacing_critique: { type: Type.STRING },
              flagged_scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    scene_id: { type: Type.STRING },
                    original: { type: Type.STRING },
                    suggestion: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ['scene_id', 'original', 'suggestion', 'reason'],
                },
              },
              key_themes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              estimated_listening_minutes: { type: Type.NUMBER },
            },
            required: ['psychological_arc', 'pacing_score', 'pacing_critique', 'flagged_scenes', 'key_themes', 'estimated_listening_minutes'],
          },
        },
      });

      const analysis = JSON.parse(response.text || '{}');
      return NextResponse.json({ success: true, analysis });
    }

    if (action === 'generate_publish_pack') {
      const title = projectData?.project?.title || 'How Manipulators Plant Doubt in Your Memory to Destroy Your Self-Trust';
      const scenes = projectData?.chapters?.[0]?.scenes || [];
      const scriptExcerpt = scenes.slice(0, 10).map((s: any) => s.narration_text).join(' ');

      const prompt = `
Create an optimized YouTube publishing package for a 25-30 minute dark psychology educational video:
Main Subject: ${title}
Script Excerpt: ${scriptExcerpt}

Provide output in JSON:
1. "title_options": Array of 4 high-CTR, curiosity-driven YouTube titles (English).
2. "description": Engaging SEO-rich YouTube description in English with realistic chapter timestamps, overview, and call-to-action.
3. "tags": 12-16 high-volume YouTube SEO tags.
4. "thumbnail_prompt_en": Prompt for ImageFX/Midjourney in dark baroque chiaroscuro oil painting style, 16:9.
5. "pinned_comment": Engaging community question for the pinned comment (in Arabic or English, inviting discussion).
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title_options: { type: Type.ARRAY, items: { type: Type.STRING } },
              description: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              thumbnail_prompt_en: { type: Type.STRING },
              pinned_comment: { type: Type.STRING },
            },
            required: ['title_options', 'description', 'tags', 'thumbnail_prompt_en', 'pinned_comment'],
          },
        },
      });

      const publishPack = JSON.parse(response.text || '{}');
      return NextResponse.json({ success: true, publishPack });
    }

    if (action === 'polish_scene_prompt') {
      const prompt = `
Rewrite and enrich this image prompt for a dark baroque oil painting scene in 16:9.
Scene Narration: "${sceneText}"
Ensure chiaroscuro lighting, deep crimson/charcoal palette, muted gold highlights, renaissance texture, no modern elements, no text.
Return JSON with "polished_prompt" string.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              polished_prompt: { type: Type.STRING },
            },
            required: ['polished_prompt'],
          },
        },
      });

      const res = JSON.parse(response.text || '{}');
      return NextResponse.json({ success: true, polished_prompt: res.polished_prompt });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('AI analyze error:', err);
    return NextResponse.json({ error: err?.message || 'AI analysis failed' }, { status: 500 });
  }
}
