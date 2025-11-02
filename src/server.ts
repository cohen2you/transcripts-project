import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';
import OpenAI from 'openai';

// Load environment variables from .env.local or .env
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env if .env.local doesn't exist

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

// Serve the main page
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Process transcript endpoint
app.post('/api/process', async (req: Request, res: Response) => {
  try {
    console.log('📝 Processing transcript...');
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    console.log(`   Transcript length: ${transcript.length} characters`);

    const systemPrompt = `You are a transcript editor specialized in cleaning earnings call transcripts. 
Your ONLY job is to:
1. Remove any standalone "0" numbers that appear after speaker labels
2. Format speaker labels with HTML bold tags: <strong>Name</strong>
3. Use COMPANY NAME ONLY for analysts (NO person names)
4. Fix OBVIOUS analyst firm name misspellings (e.g., "Truro Securities" → "Truist Securities")
5. Fix obvious formatting issues in speaker labels

CRITICAL RULES:
- DO NOT change, modify, or correct ANY of the actual spoken content/dialogue
- DO NOT add, remove, or modify any words in the transcript body
- Preserve all line breaks, spacing, and structure exactly as provided
- Only fix OBVIOUS company misspellings (JP Morgon→JP Morgan, Goldman Sacks→Goldman Sachs, Truro→Truist)
- DO NOT change executive/person names
- Use HTML tags <strong></strong> NOT markdown ** for bold

SPEAKER LABEL FORMATS (CRITICAL - FOLLOW EXACTLY):

For ANALYSTS (people from investment firms asking questions):
WRONG: Jake Bartlett (Truro Securities Analyst)
WRONG: Jake Bartlett (Equity Analyst at Truro Securities)  
WRONG: <strong>Jake Bartlett</strong> (Truro Securities)
RIGHT: <strong>Truro Securities Analyst</strong>

Pattern: Remove the person's name completely. Only use: <strong>[Company Name] Analyst</strong>

More examples:
- "Jeffrey Bernstein with Barclays" → <strong>Barclays Analyst</strong>
- "Brian Vaccaro from Goldman Sachs" → <strong>Goldman Sachs Analyst</strong>
- "Jake Bartlett(Equity Analyst at Truro Securities)" → <strong>Truro Securities Analyst</strong>

For EXECUTIVES (company employees like CEO, CFO):
- Keep the person's name + title
- <strong>Rob Lynch</strong> (Chief Executive Officer)
- <strong>Katie Fogarty</strong> (Chief Financial Officer)

For OPERATOR:
- <strong>Operator</strong>

CRITICAL: For analysts, DELETE the person's name entirely. Only keep company + "Analyst"

ANOTHER COMMON ERROR - Question/Answer transitions:
When an analyst asks a question, the company executive's ANSWER often gets incorrectly labeled as the analyst still speaking.

Pattern to detect:
- Analyst asks a question (ends with "Thanks" or a question mark)
- Same speaker label continues BUT the content is clearly an ANSWER not a question
- Look for: addressing the analyst by name ("Brian?", "Great question"), references to internal operations, "we/our/I" from company perspective

Example Error:
<strong>Brian Vaccaro</strong> (Raymond James)

Can you elaborate on guest satisfaction metrics? Thanks.

Brian? I had a call with Stephanie last night... [This is NOT Brian speaking - it's the CEO answering!]

Should be fixed to:
<strong>Brian Vaccaro</strong> (Raymond James)

Can you elaborate on guest satisfaction metrics? Thanks.

<strong>Rob Lynch</strong> (Chief Executive Officer)

Brian? I had a call with Stephanie last night...

IMPORTANT: Insert the appropriate company executive speaker label (CEO, CFO, etc.) when you detect an answer to an analyst's question that's incorrectly under the analyst's name.

ANOTHER COMMON ERROR - Missing analyst labels for follow-up questions:
After an executive answers, the analyst often asks a follow-up question BUT the speaker label is missing.

Pattern to detect:
- Executive finishes answering
- Text continues with "Great. And then..." or "Thanks. My follow-up is..." or "Understood..."
- This is the ANALYST asking another question
- Use the company name that was recently introduced

Example Error:
<strong>Katie Fogarty</strong> (Chief Financial Officer)

...without having to lean on a significant amount of price to offset the beef market.

Great. And then I had another question about the labor savings... [This is the analyst!]

Should be fixed to:
<strong>Katie Fogarty</strong> (Chief Financial Officer)

...without having to lean on a significant amount of price to offset the beef market.

<strong>Truist Securities Analyst</strong>

Great. And then I had another question about the labor savings...

<strong>Rob Lynch</strong> (Chief Executive Officer)

So one of the big opportunity untapped opportunities is on equipment...

IMPORTANT: For analyst follow-ups, insert <strong>Company Name Analyst</strong> label using the company from the operator's introduction.

Return ONLY the corrected transcript with no additional commentary or explanation.`;

    const userPrompt = `Please review this earnings call transcript and correct only the speaker names and titles. Leave all spoken content unchanged.

Transcript:
${transcript}`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    });

    let cleanedTranscript = completion.choices[0].message.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Remove markdown code fences if present (multiple patterns)
    cleanedTranscript = cleanedTranscript
      .replace(/^```html\s*/gi, '')  // ```html at start
      .replace(/^```\s*/g, '')        // ``` at start
      .replace(/\s*```$/g, '')        // ``` at end
      .trim();

    // Convert any markdown bold (**text**) to HTML (<strong>text</strong>)
    cleanedTranscript = cleanedTranscript.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    console.log(`   ✅ Cleaned! Tokens used: ${tokensUsed}`);

    res.json({
      success: true,
      cleaned_transcript: cleanedTranscript,
      tokens_used: tokensUsed,
    });
  } catch (error: any) {
    console.error('Error processing transcript:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to process transcript' 
    });
  }
});

// Segment transcript endpoint
app.post('/api/segment', async (req: Request, res: Response) => {
  try {
    console.log('📋 Segmenting transcript...');
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    console.log(`   Transcript length: ${transcript.length} characters`);

    const systemPrompt = `Add paragraph breaks to improve readability. 

Rules:
- DO NOT change any words
- ONLY add line breaks at logical topic changes
- Break every 3-5 sentences
- Preserve all <strong> tags and formatting

Return the segmented transcript only.`;

    const userPrompt = `Add paragraph breaks to this transcript:

${transcript}`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    });

    let segmentedTranscript = completion.choices[0].message.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Remove markdown code fences if present (multiple patterns)
    segmentedTranscript = segmentedTranscript
      .replace(/^```html\s*/gi, '')
      .replace(/^```\s*/g, '')
      .replace(/\s*```$/g, '')
      .trim();

    res.json({
      success: true,
      segmented_transcript: segmentedTranscript,
      tokens_used: tokensUsed,
    });
  } catch (error: any) {
    console.error('Error segmenting transcript:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to segment transcript' 
    });
  }
});

// Verify speaker attribution endpoint
app.post('/api/verify-speakers', async (req: Request, res: Response) => {
  try {
    console.log('👥 Verifying speaker attributions...');
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    console.log(`   Transcript length: ${transcript.length} characters`);

    const systemPrompt = `You are a transcript editor fixing speaker attribution errors in earnings calls.

CRITICAL ERROR #1 - Wrong speaker after operator introduction:
When operator introduces an analyst, the VERY NEXT speaker MUST be that analyst, NOT a company executive.

Example ERROR to fix:
<strong>Operator</strong>

Our next question is from Jeffrey Bernstein with Barclays. Please proceed.

<strong>Rob Lynch</strong> (Chief Executive Officer)

Great, thank you. Just wanted to build on... [analyst's question continues]

This is WRONG because:
- Operator introduced Jeffrey Bernstein with Barclays
- But Rob Lynch (CEO) is labeled as speaking
- "Great, thank you. Just wanted to build on..." is clearly the ANALYST asking a question, not the CEO

CORRECT to:
<strong>Operator</strong>

Our next question is from Jeffrey Bernstein with Barclays. Please proceed.

<strong>Barclays Analyst</strong>

Great, thank you. Just wanted to build on... [analyst's question]

<strong>Rob Lynch</strong> (Chief Executive Officer)

Yeah, I mean our, you know, our product innovation... [CEO's answer]

RULE: Person introduced by operator = next speaker. If you see an executive name there instead, DELETE it and insert the analyst's company label.

CRITICAL ERROR #2 - Executive's answer under analyst's label:
When analyst asks question, executive's answer often appears under analyst's name.
Look for: executive addressing analyst by name, "we/our" company perspective.

CRITICAL ERROR #3 - Missing analyst label for follow-ups:
When executive finishes answering and text continues with "Understood...", "Thanks...", "Great...", "Right..." → This is analyst asking follow-up.

LABEL FORMAT:
- Analysts: <strong>Company Analyst</strong> (extract company from operator introduction)
- Executives: <strong>Person Name</strong> (Title)

RULES:
- DO NOT change any words
- ONLY add/fix speaker labels
- Preserve all HTML formatting

OUTPUT FORMAT:
Return the corrected transcript text, then add:
---CHANGES---
Then list each fix you made, like:
- Changed "Wrong Name" to "Correct Label" after operator introduced them
- Added "Company Analyst" label for follow-up question
OR write: No errors found`;

    const userPrompt = `Please verify and correct ONLY the speaker attributions in this transcript. Do not change any words or formatting.

Transcript:
${transcript}`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    });

    let fullResponse = completion.choices[0].message.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Remove markdown code fences if present (multiple patterns)
    fullResponse = fullResponse
      .replace(/^```html\s*/gi, '')
      .replace(/^```\s*/g, '')
      .replace(/\s*```$/g, '')
      .trim();

    // Split response into transcript and changes
    let verifiedTranscript = fullResponse;
    let changesSummary = 'Verified speaker attributions and corrected any misplaced labels';
    
    if (fullResponse.includes('---CHANGES---')) {
      const parts = fullResponse.split('---CHANGES---');
      verifiedTranscript = parts[0].trim();
      const changesText = parts[1].trim();
      
      // Remove template placeholder text if AI included it
      verifiedTranscript = verifiedTranscript.replace(/^\[Corrected transcript\]\s*/i, '');
      
      if (changesText && changesText !== 'No speaker attribution errors found.' && changesText !== 'No errors found') {
        changesSummary = changesText;
      } else {
        changesSummary = 'No speaker attribution errors found';
      }
    }

    console.log(`   ✅ Speakers verified! Tokens used: ${tokensUsed}`);
    console.log(`   Changes: ${changesSummary.substring(0, 100)}...`);

    res.json({
      success: true,
      verified_transcript: verifiedTranscript,
      tokens_used: tokensUsed,
      changes_summary: changesSummary,
    });
  } catch (error: any) {
    console.error('Error verifying speakers:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to verify speakers' 
    });
  }
});

// Check company names endpoint (analyst firms only)
app.post('/api/check-company-names', async (req: Request, res: Response) => {
  try {
    console.log('🏢 Checking analyst company names...');
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    console.log(`   Transcript length: ${transcript.length} characters`);

    const systemPrompt = `You are a financial company name checker for earnings call transcripts.

ONLY correct analyst/investment firm names. Be conservative.

Fix these ONLY:
- "Truro Securities" → "Truist Securities"
- "JP Morgon" → "JP Morgan"
- "Goldman Sacks" → "Goldman Sachs"
- "Morgan Stanley" → "Morgan Stanley"
- Clear misspellings of major banks/investment firms

DO NOT change:
- Executive names (Rob Lynch, Katie Fogarty, etc.)
- Company names you're unsure about
- Person names - NEVER touch these
- Any content/dialogue

Look for labels like: <strong>Truro Securities Analyst</strong>
Only fix the company name if it's obviously misspelled.

RESPONSE FORMAT:
[Corrected transcript]
---CHANGES---
[List company corrections, or write "All company names correct"]`;

    const userPrompt = `Only fix OBVIOUS analyst firm name misspellings. Leave all person names and executive names unchanged.

Transcript:
${transcript}`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    });

    let fullResponse = completion.choices[0].message.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Remove markdown code fences if present (multiple patterns)
    fullResponse = fullResponse
      .replace(/^```html\s*/gi, '')
      .replace(/^```\s*/g, '')
      .replace(/\s*```$/g, '')
      .trim();

    // Split response into transcript and changes
    let correctedTranscript = fullResponse;
    let changesSummary = 'Verified analyst firm names';
    
    if (fullResponse.includes('---CHANGES---')) {
      const parts = fullResponse.split('---CHANGES---');
      correctedTranscript = parts[0].trim();
      const changesText = parts[1].trim();
      
      if (changesText && changesText !== 'All company names correct') {
        changesSummary = changesText;
      } else {
        changesSummary = 'All company names correct';
      }
    }

    console.log(`   ✅ Company names checked! Tokens used: ${tokensUsed}`);
    console.log(`   Changes: ${changesSummary.substring(0, 100)}...`);

    res.json({
      success: true,
      corrected_transcript: correctedTranscript,
      tokens_used: tokensUsed,
      changes_summary: changesSummary,
    });
  } catch (error: any) {
    console.error('❌ Error checking company names:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to check company names' 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Open your browser and navigate to http://localhost:${PORT}`);
});

